import { access, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  parseSync,
  type CallExpression,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  type Program,
} from 'oxc-parser';
import { renderMigrationSource } from './render';
import type { MigrationConfig, MigrationFinding, MigrationPlan, MigrationValue } from './types';

const VITE_KEYS = new Set([
  'base',
  'resolve',
  'server',
  'preview',
  'build',
  'css',
  'define',
  'optimizeDeps',
  'ssr',
  'plugins',
]);

const MIKO_KEYS = new Map<string, string>([
  ['rendering', 'rendering'],
  ['template', 'template'],
  ['entry', 'entry'],
  ['pagesDir', 'pagesDir'],
  ['uiLibrary', 'uiLibrary'],
  ['layout', 'layout'],
  ['lib', 'lib'],
  ['vue', 'vuePluginOptions'],
  ['vuePluginOptions', 'vuePluginOptions'],
  ['vueJsx', 'vueJsxPluginOptions'],
  ['vueJsxPluginOptions', 'vueJsxPluginOptions'],
  ['vueRouter', 'routerPluginOptions'],
  ['routerPluginOptions', 'routerPluginOptions'],
  ['layouts', 'layoutsPluginOptions'],
  ['layoutsPluginOptions', 'layoutsPluginOptions'],
  ['components', 'componentsPluginOptions'],
  ['componentsPluginOptions', 'componentsPluginOptions'],
  ['unoCSS', 'unoCSSPluginOptions'],
  ['unoCSSPluginOptions', 'unoCSSPluginOptions'],
  ['legacy', 'legacyPluginOptions'],
  ['legacyPluginOptions', 'legacyPluginOptions'],
  ['ssgOptions', 'ssgOptions'],
  ['linter', 'linterOptions'],
  ['linterOptions', 'linterOptions'],
  ['devToolsPluginOptions', 'devToolsPluginOptions'],
  ['bootstrap', 'bootstrapOptions'],
  ['bootstrapOptions', 'bootstrapOptions'],
  ['external', 'externalOptions'],
  ['externalOptions', 'externalOptions'],
  ['devOptions', 'devOptions'],
  ['janus', 'janusOptions'],
  ['janusOptions', 'janusOptions'],
  ['pinia', 'pinia'],
  ['unhead', 'unhead'],
  ['whiteScreen', 'whiteScreen'],
]);

interface StaticValueResult {
  supported: boolean;
  value?: MigrationValue;
}

interface SourceAnalysis {
  current: boolean;
  manual: boolean;
}

function finding(
  level: MigrationFinding['level'],
  code: string,
  file: string,
  message: string,
): MigrationFinding {
  return { level, code, file, message };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function unwrapExpression(expression: Expression): Expression {
  if (expression.type === 'AwaitExpression') {
    return unwrapExpression(expression.argument);
  }
  if (
    expression.type === 'ParenthesizedExpression' ||
    expression.type === 'TSAsExpression' ||
    expression.type === 'TSSatisfiesExpression' ||
    expression.type === 'TSTypeAssertion' ||
    expression.type === 'TSNonNullExpression'
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function propertyKey(property: ObjectProperty): string | undefined {
  if (property.computed || property.kind !== 'init' || property.method) return;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
}

function staticValue(
  expression: Expression,
  file: string,
  path: string,
  findings: MigrationFinding[],
): StaticValueResult {
  const value = unwrapExpression(expression);
  if (value.type === 'Literal') {
    if (
      value.value === null ||
      typeof value.value === 'boolean' ||
      typeof value.value === 'string' ||
      (typeof value.value === 'number' && Number.isFinite(value.value))
    ) {
      return { supported: true, value: value.value };
    }
  }
  if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return { supported: true, value: value.quasis[0]?.value.cooked ?? '' };
  }
  if (
    value.type === 'UnaryExpression' &&
    (value.operator === '-' || value.operator === '+') &&
    unwrapExpression(value.argument).type === 'Literal'
  ) {
    const argument = unwrapExpression(value.argument);
    if (argument.type === 'Literal' && typeof argument.value === 'number') {
      const number = value.operator === '-' ? -argument.value : argument.value;
      if (Number.isFinite(number)) return { supported: true, value: number };
    }
  }
  if (value.type === 'ArrayExpression') {
    const result: MigrationValue[] = [];
    for (const [index, entry] of value.elements.entries()) {
      if (!entry || entry.type === 'SpreadElement') {
        findings.push(
          finding(
            'warning',
            'MIKO_MIGRATE_MANUAL',
            file,
            `${path}[${index}] 使用了空位或展开语法，需要人工迁移`,
          ),
        );
        return { supported: false };
      }
      const parsed = staticValue(entry, file, `${path}[${index}]`, findings);
      if (!parsed.supported) return parsed;
      result.push(parsed.value!);
    }
    return { supported: true, value: result };
  }
  if (value.type === 'ObjectExpression') {
    const result: Record<string, MigrationValue> = {};
    let supported = true;
    for (const property of value.properties) {
      if (property.type === 'SpreadElement') {
        findings.push(
          finding('warning', 'MIKO_MIGRATE_MANUAL', file, `${path} 使用了对象展开，需要人工迁移`),
        );
        supported = false;
        continue;
      }
      const key = propertyKey(property);
      if (!key) {
        findings.push(
          finding(
            'warning',
            'MIKO_MIGRATE_MANUAL',
            file,
            `${path} 包含计算属性、方法或访问器，需要人工迁移`,
          ),
        );
        supported = false;
        continue;
      }
      const parsed = staticValue(property.value, file, `${path}.${key}`, findings);
      if (!parsed.supported) {
        supported = false;
        continue;
      }
      result[key] = parsed.value!;
    }
    return supported ? { supported: true, value: result } : { supported: false, value: result };
  }

  findings.push(
    finding('warning', 'MIKO_MIGRATE_MANUAL', file, `${path} 不是静态字面量，需要人工迁移`),
  );
  return { supported: false };
}

function findDefaultExpression(program: Program): Expression | undefined {
  const statement = program.body.find((entry) => entry.type === 'ExportDefaultDeclaration');
  if (statement?.type !== 'ExportDefaultDeclaration') return;
  if (
    statement.declaration.type === 'FunctionDeclaration' ||
    statement.declaration.type === 'ClassDeclaration' ||
    statement.declaration.type === 'TSInterfaceDeclaration'
  ) {
    return;
  }
  return statement.declaration as Expression;
}

function importedDefineNames(program: Program): Set<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.source.value !== '@minar-kotonoha/vite-plugin-miko'
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported.type === 'Identifier' &&
        specifier.imported.name === 'defineMikoConfig'
      ) {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

function hasExecutableTopLevel(program: Program): boolean {
  return program.body.some(
    (statement) =>
      statement.type !== 'ImportDeclaration' &&
      statement.type !== 'ExportDefaultDeclaration' &&
      statement.type !== 'EmptyStatement' &&
      statement.type !== 'TSInterfaceDeclaration' &&
      statement.type !== 'TSTypeAliasDeclaration',
  );
}

function callArguments(
  expression: Expression,
  defineNames: Set<string>,
): CallExpression['arguments'] | undefined {
  const value = unwrapExpression(expression);
  if (
    value.type !== 'CallExpression' ||
    value.callee.type !== 'Identifier' ||
    !defineNames.has(value.callee.name)
  ) {
    return;
  }
  return value.arguments;
}

function setValue(
  target: Record<string, MigrationValue>,
  key: string,
  value: MigrationValue,
  file: string,
  findings: MigrationFinding[],
): boolean {
  const existing = target[key];
  if (existing === undefined || JSON.stringify(existing) === JSON.stringify(value)) {
    target[key] = value;
    return true;
  }
  findings.push(
    finding(
      'error',
      'MIKO_MIGRATE_CONFLICT',
      file,
      `字段 ${key} 在多个旧配置中存在冲突，需要人工合并`,
    ),
  );
  return false;
}

function mergeObjectValue(
  target: Record<string, MigrationValue>,
  key: string,
  value: MigrationValue,
  file: string,
  findings: MigrationFinding[],
): boolean {
  const existing = target[key];
  if (
    existing &&
    !Array.isArray(existing) &&
    typeof existing === 'object' &&
    value &&
    !Array.isArray(value) &&
    typeof value === 'object'
  ) {
    return mergeRecord(existing, value, key, file, findings);
  }
  return setValue(target, key, value, file, findings);
}

function mergeRecord(
  target: Record<string, MigrationValue>,
  source: Record<string, MigrationValue>,
  path: string,
  file: string,
  findings: MigrationFinding[],
): boolean {
  let safe = true;
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (existing === undefined) {
      target[key] = value;
      continue;
    }
    if (JSON.stringify(existing) === JSON.stringify(value)) continue;
    if (
      !Array.isArray(existing) &&
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(value) &&
      typeof value === 'object' &&
      value !== null
    ) {
      if (!mergeRecord(existing, value, `${path}.${key}`, file, findings)) safe = false;
      continue;
    }
    findings.push(
      finding(
        'error',
        'MIKO_MIGRATE_CONFLICT',
        file,
        `字段 ${path}.${key} 在多个旧配置中存在冲突，需要人工合并`,
      ),
    );
    safe = false;
  }
  return safe;
}

function migrateLegacyProxy(
  value: MigrationValue,
  file: string,
  findings: MigrationFinding[],
): MigrationValue | undefined {
  if (!Array.isArray(value)) return value;
  const proxy: Record<string, MigrationValue> = {};
  for (const rule of value) {
    if (!rule || Array.isArray(rule) || typeof rule !== 'object' || !Array.isArray(rule.context)) {
      findings.push(
        finding(
          'warning',
          'MIKO_MIGRATE_MANUAL',
          file,
          'proxy 数组不是可识别的旧 ProxyConfig，需要人工迁移',
        ),
      );
      return;
    }
    const { context, ...options } = rule;
    for (const path of context) {
      if (typeof path !== 'string') {
        findings.push(
          finding('warning', 'MIKO_MIGRATE_MANUAL', file, 'proxy context 需要人工迁移'),
        );
        return;
      }
      proxy[path.replace(/\/\*+$/u, '')] = options;
    }
  }
  return proxy;
}

function migrateDev(
  value: MigrationValue,
  config: MigrationConfig,
  file: string,
  findings: MigrationFinding[],
): boolean {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, 'dev 必须人工迁移'));
    return false;
  }
  const devOptions: Record<string, MigrationValue> = {};
  const server: Record<string, MigrationValue> = {};
  let safe = true;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'bundledDev') devOptions[key] = entry;
    else if (key === 'host' || key === 'port' || key === 'open') server[key] = entry;
    else {
      safe = false;
      findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, `dev.${key} 需要人工迁移`));
    }
  }
  if (Object.keys(devOptions).length > 0) {
    mergeObjectValue(config.miko, 'devOptions', devOptions, file, findings);
  }
  if (Object.keys(server).length > 0) {
    mergeObjectValue(config.vite, 'server', server, file, findings);
  }
  return safe;
}

function migrateSsg(
  value: MigrationValue,
  config: MigrationConfig,
  file: string,
  findings: MigrationFinding[],
): boolean {
  if (value === false || value === true) {
    return setValue(config.miko, 'rendering', value ? 'ssg' : 'spa', file, findings);
  }
  return setValue(config.miko, 'ssgOptions', value, file, findings);
}

function containsOwnedInput(value: MigrationValue): boolean {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false;
  for (const key of ['rolldownOptions', 'rollupOptions']) {
    const options = value[key];
    if (
      options &&
      !Array.isArray(options) &&
      typeof options === 'object' &&
      Object.hasOwn(options, 'input')
    ) {
      return true;
    }
  }
  return false;
}

function migrateEntry(
  key: string,
  value: MigrationValue,
  config: MigrationConfig,
  file: string,
  findings: MigrationFinding[],
  viteOnly: boolean,
): boolean {
  if (VITE_KEYS.has(key)) {
    if (key === 'plugins' && (!Array.isArray(value) || value.length > 0)) {
      findings.push(
        finding('warning', 'MIKO_MIGRATE_MANUAL', file, '自定义 Vite 插件及其顺序需要人工迁移'),
      );
      return false;
    }
    if (key === 'build' && containsOwnedInput(value)) {
      findings.push(
        finding(
          'warning',
          'MIKO_MIGRATE_MANUAL',
          file,
          'Vite build input 由 Miko 管理，旧 input 需要人工迁移',
        ),
      );
      return false;
    }
    return mergeObjectValue(config.vite, key, value, file, findings);
  }
  if (viteOnly) {
    findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, `未知 Vite 字段 ${key}`));
    return false;
  }
  if (key === 'ssg') return migrateSsg(value, config, file, findings);
  if (key === 'outDir') {
    return mergeObjectValue(config.vite, 'build', { outDir: value }, file, findings);
  }
  if (key === 'proxy') {
    const proxy = migrateLegacyProxy(value, file, findings);
    return proxy === undefined
      ? false
      : mergeObjectValue(config.vite, 'server', { proxy }, file, findings);
  }
  if (key === 'dev') return migrateDev(value, config, file, findings);
  const mapped = MIKO_KEYS.get(key);
  if (mapped) return setValue(config.miko, mapped, value, file, findings);

  findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, `未知旧 Miko 字段 ${key}`));
  return false;
}

function migrateObject(
  object: ObjectExpression,
  config: MigrationConfig,
  file: string,
  findings: MigrationFinding[],
  viteOnly = false,
): boolean {
  let safe = true;
  for (const property of object.properties) {
    if (property.type === 'SpreadElement') {
      findings.push(
        finding('warning', 'MIKO_MIGRATE_MANUAL', file, '配置包含对象展开，需要人工迁移'),
      );
      safe = false;
      continue;
    }
    const key = propertyKey(property);
    if (!key) {
      findings.push(
        finding(
          'warning',
          'MIKO_MIGRATE_MANUAL',
          file,
          '配置包含计算属性、方法或访问器，需要人工迁移',
        ),
      );
      safe = false;
      continue;
    }
    const parsed = staticValue(property.value, file, key, findings);
    if (!parsed.supported) {
      safe = false;
      continue;
    }
    if (!migrateEntry(key, parsed.value!, config, file, findings, viteOnly)) safe = false;
  }
  return safe;
}

function parseProgram(
  file: string,
  source: string,
  findings: MigrationFinding[],
): Program | undefined {
  const result = parseSync(file, source, { lang: 'ts', sourceType: 'module' });
  const errors = result.errors.filter((error) => error.severity === 'Error');
  if (errors.length === 0) return result.program;
  findings.push(finding('error', 'MIKO_MIGRATE_PARSE', basename(file), errors[0]!.message));
}

async function analyzeSource(
  path: string,
  kind: 'miko' | 'vite',
  config: MigrationConfig,
  findings: MigrationFinding[],
): Promise<SourceAnalysis> {
  const file = basename(path);
  const program = parseProgram(path, await readFile(path, 'utf8'), findings);
  if (!program) return { current: false, manual: true };
  let manual = false;
  if (hasExecutableTopLevel(program)) {
    findings.push(
      finding(
        'warning',
        'MIKO_MIGRATE_MANUAL',
        file,
        '配置包含顶层可执行语句；分析器不会执行它，需要人工确认',
      ),
    );
    manual = true;
  }

  const exported = findDefaultExpression(program);
  if (!exported) {
    findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, '找不到静态 default export'));
    return { current: false, manual: true };
  }
  const expression = unwrapExpression(exported);
  const defineNames = importedDefineNames(program);
  const arguments_ = callArguments(expression, defineNames);

  if (kind === 'vite') {
    if (!arguments_) {
      findings.push(
        finding(
          'warning',
          'MIKO_MIGRATE_MANUAL',
          file,
          'vite.config.ts 不是可识别的 defineMikoConfig 调用',
        ),
      );
      return { current: false, manual: true };
    }
    if (arguments_.length > 2) {
      findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, 'defineMikoConfig 参数过多'));
      manual = true;
    }
    for (const [index, argument] of arguments_.slice(0, 2).entries()) {
      if (
        argument.type === 'SpreadElement' ||
        unwrapExpression(argument).type !== 'ObjectExpression'
      ) {
        findings.push(
          finding(
            'warning',
            'MIKO_MIGRATE_MANUAL',
            file,
            `defineMikoConfig 第 ${index + 1} 个参数不是静态对象`,
          ),
        );
        manual = true;
        continue;
      }
      const object = unwrapExpression(argument);
      if (object.type === 'ObjectExpression') {
        if (!migrateObject(object, config, file, findings, index === 1)) manual = true;
      }
    }
    return { current: false, manual };
  }

  if (arguments_) {
    if (arguments_.length !== 1 || arguments_[0]?.type === 'SpreadElement') {
      findings.push(
        finding('warning', 'MIKO_MIGRATE_MANUAL', file, 'miko.config.ts 包装参数需要人工迁移'),
      );
      return { current: false, manual: true };
    }
    const argument = unwrapExpression(arguments_[0]);
    if (argument.type !== 'ObjectExpression') {
      findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, 'miko.config.ts 不是静态对象'));
      return { current: false, manual: true };
    }
    if (!migrateObject(argument, config, file, findings)) manual = true;
    return { current: false, manual };
  }

  if (expression.type !== 'ObjectExpression') {
    findings.push(finding('warning', 'MIKO_MIGRATE_MANUAL', file, 'miko.config.ts 不是静态对象'));
    return { current: false, manual: true };
  }
  const keys = expression.properties
    .filter((property): property is ObjectProperty => property.type === 'Property')
    .map(propertyKey)
    .filter((key): key is string => Boolean(key));
  const current = keys.length > 0 && keys.every((key) => key === 'miko' || key === 'vite');
  if (current) return { current: true, manual };
  if (!migrateObject(expression, config, file, findings)) manual = true;
  return { current: false, manual };
}

export async function analyzeMigration(root: string): Promise<MigrationPlan> {
  const resolvedRoot = resolve(root);
  const targetFile = join(resolvedRoot, 'miko.config.ts');
  const candidates = [targetFile, join(resolvedRoot, 'vite.config.ts')];
  const sourceFiles: string[] = [];
  for (const path of candidates) {
    if (await exists(path)) sourceFiles.push(path);
  }

  const findings: MigrationFinding[] = [];
  const config: MigrationConfig = { miko: {}, vite: {} };
  if (sourceFiles.length === 0) {
    findings.push(finding('info', 'MIKO_MIGRATE_NOTHING', '.', '没有找到旧 Miko/Vite 配置'));
    return {
      root: resolvedRoot,
      sourceFiles,
      targetFile,
      generatedSource: null,
      findings,
      safeToWrite: false,
    };
  }

  let current = false;
  let manual = false;
  for (const path of sourceFiles) {
    const result = await analyzeSource(
      path,
      basename(path) === 'vite.config.ts' ? 'vite' : 'miko',
      config,
      findings,
    );
    current ||= result.current;
    manual ||= result.manual;
  }
  if (current) {
    findings.push(
      finding(
        'info',
        'MIKO_MIGRATE_CURRENT',
        'miko.config.ts',
        'miko.config.ts 已使用 v1 的 miko/vite 命名空间',
      ),
    );
  }

  const generatedSource = current ? null : renderMigrationSource(config);
  const unsafeFinding = findings.some(
    (entry) => entry.level === 'warning' || entry.level === 'error',
  );
  return {
    root: resolvedRoot,
    sourceFiles,
    targetFile,
    generatedSource,
    findings,
    safeToWrite: !current && !manual && !unsafeFinding,
  };
}
