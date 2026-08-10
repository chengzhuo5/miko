import type { MigrationConfig, MigrationValue } from './types';

const MIKO_KEY_ORDER = [
  'rendering',
  'template',
  'entry',
  'pagesDir',
  'uiLibrary',
  'layout',
  'lib',
  'vuePluginOptions',
  'vueJsxPluginOptions',
  'routerPluginOptions',
  'layoutsPluginOptions',
  'componentsPluginOptions',
  'unoCSSPluginOptions',
  'legacyPluginOptions',
  'ssgOptions',
  'linterOptions',
  'devToolsPluginOptions',
  'bootstrapOptions',
  'externalOptions',
  'devOptions',
  'pinia',
  'unhead',
  'janusOptions',
  'whiteScreen',
] as const;

const VITE_KEY_ORDER = [
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
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedKeys(value: Record<string, MigrationValue>, order: readonly string[]): string[] {
  const indexes = new Map(order.map((key, index) => [key, index]));
  return Object.keys(value).sort((left, right) => {
    const leftIndex = indexes.get(left);
    const rightIndex = indexes.get(right);
    if (leftIndex !== undefined || rightIndex !== undefined) {
      return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
    }
    return compareText(left, right);
  });
}

function quote(value: string): string {
  return `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\t', '\\t')}'`;
}

function propertyName(value: string): string {
  return /^[$A-Z_a-z][$\w]*$/u.test(value) ? value : quote(value);
}

function indent(level: number): string {
  return '  '.repeat(level);
}

function renderValue(value: MigrationValue, level: number): string {
  if (typeof value === 'string') return quote(value);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value
      .map((entry) => `${indent(level + 1)}${renderValue(entry, level + 1)},`)
      .join('\n')}\n${indent(level)}]`;
  }

  const keys = Object.keys(value).sort(compareText);
  if (keys.length === 0) return '{}';
  return `{\n${keys
    .map(
      (key) => `${indent(level + 1)}${propertyName(key)}: ${renderValue(value[key]!, level + 1)},`,
    )
    .join('\n')}\n${indent(level)}}`;
}

function renderNamespace(
  name: 'miko' | 'vite',
  value: Record<string, MigrationValue>,
  order: readonly string[],
): string[] {
  const keys = orderedKeys(value, order);
  if (keys.length === 0) return [];
  return [
    `  ${name}: {`,
    ...keys.map((key) => `    ${propertyName(key)}: ${renderValue(value[key]!, 2)},`),
    '  },',
  ];
}

export function renderMigrationSource(config: MigrationConfig): string | null {
  const namespaces = [
    ...renderNamespace('miko', config.miko, MIKO_KEY_ORDER),
    ...renderNamespace('vite', config.vite, VITE_KEY_ORDER),
  ];
  if (namespaces.length === 0) return null;

  return [
    "import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'",
    '',
    'export default {',
    ...namespaces,
    '} satisfies MikoUserConfig',
    '',
  ].join('\n');
}
