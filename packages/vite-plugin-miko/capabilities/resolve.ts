import { MikoConfigError } from '../config/errors';
import type { MikoConfigEnv, MikoOptions, ResolvedCapabilities } from '../config/types';
import type { CapabilitySource, ProjectSignals, ResolvedCapability } from './types';

const UI_LIBRARIES = ['vant', 'element-plus'] as const;

function capability<T>(
  enabled: boolean,
  value: T,
  source: CapabilitySource,
  reason: string,
): ResolvedCapability<T> {
  return { enabled, value, source, reason };
}

function hasDependency(signals: ProjectSignals, dependency: string): boolean {
  return signals.dependencies.includes(dependency);
}

function missingDependency(dependency: string): never {
  throw new MikoConfigError({
    code: 'MIKO_CAPABILITY_MISSING_DEPENDENCY',
    message: `显式启用的能力缺少直接依赖 ${dependency}，请先使用 Bun 安装该依赖`,
  });
}

function explicitOptions<T extends object>(value: true | T): T {
  return value === true ? ({} as T) : value;
}

function targetVersion(target: string): number | null {
  const version = target.split(/\s+/, 2)[1]?.match(/\d+(?:\.\d+)?/)?.[0];
  return version ? Number.parseFloat(version) : null;
}

function isLegacyTarget(target: string): boolean {
  const normalized = target.trim().toLowerCase();
  const browser = normalized.split(/\s+/, 1)[0];
  if (browser === 'ie' || browser === 'ie_mob' || browser === 'op_mini') return true;

  const version = targetVersion(normalized);
  if (version === null) return false;

  switch (browser) {
    case 'android':
    case 'and_chr':
    case 'chrome':
    case 'edge':
      return version < 80;
    case 'and_ff':
    case 'firefox':
      return version < 78;
    case 'ios_saf':
    case 'safari':
      return version < 13;
    default:
      return false;
  }
}

function resolveUiLibrary(
  raw: MikoOptions,
  signals: ProjectSignals,
): ResolvedCapabilities['uiLibrary'] {
  if (raw.uiLibrary === false) {
    return capability(false, false, 'explicit', 'miko.uiLibrary 显式关闭');
  }
  if (raw.uiLibrary) {
    if (!hasDependency(signals, raw.uiLibrary)) missingDependency(raw.uiLibrary);
    return capability(true, raw.uiLibrary, 'explicit', `miko.uiLibrary 显式选择 ${raw.uiLibrary}`);
  }

  const detected = UI_LIBRARIES.filter((library) => hasDependency(signals, library));
  if (detected.length > 1) {
    throw new MikoConfigError({
      code: 'MIKO_CAPABILITY_CONFLICT',
      field: 'miko.uiLibrary',
      message: `检测到多个 UI 库：${detected.join('、')}，请显式选择 miko.uiLibrary`,
    });
  }
  if (detected[0]) {
    return capability(true, detected[0], 'dependency', `检测到直接依赖 ${detected[0]}`);
  }
  return capability(false, false, 'default', '未检测到受支持的 UI 库');
}

function resolveLegacy(raw: MikoOptions, signals: ProjectSignals): ResolvedCapabilities['legacy'] {
  if (raw.legacyPluginOptions === false) {
    return capability(false, {}, 'explicit', 'miko.legacyPluginOptions 显式关闭');
  }
  if (raw.legacyPluginOptions !== undefined) {
    return capability(
      true,
      explicitOptions(raw.legacyPluginOptions),
      'explicit',
      'miko.legacyPluginOptions 显式启用',
    );
  }
  if (signals.browserslist.some(isLegacyTarget)) {
    return capability(
      true,
      { targets: signals.browserslist },
      'convention',
      `Browserslist 包含旧浏览器目标：${signals.browserslist.join(', ')}`,
    );
  }
  return capability(false, {}, 'default', '未检测到旧浏览器目标，保持现代构建');
}

function resolveDevtools(raw: MikoOptions, env: MikoConfigEnv): ResolvedCapabilities['devtools'] {
  if (raw.devToolsPluginOptions === false) {
    return capability(false, {}, 'explicit', 'miko.devToolsPluginOptions 显式关闭');
  }
  if (raw.devToolsPluginOptions !== undefined) {
    return capability(
      true,
      explicitOptions(raw.devToolsPluginOptions),
      'explicit',
      'miko.devToolsPluginOptions 显式启用',
    );
  }
  const enabled = env.command === 'dev';
  return capability(
    enabled,
    {},
    'command',
    enabled ? '开发命令自动启用 Vue DevTools' : '非开发命令不加载 Vue DevTools',
  );
}

function resolvePinia(raw: MikoOptions, signals: ProjectSignals): ResolvedCapabilities['pinia'] {
  if (raw.pinia === false) return capability(false, false, 'explicit', 'miko.pinia 显式关闭');
  if (raw.pinia === true) {
    if (!hasDependency(signals, 'pinia')) missingDependency('pinia');
    return capability(true, true, 'explicit', 'miko.pinia 显式启用');
  }
  if (hasDependency(signals, 'pinia')) {
    return capability(true, true, 'dependency', '检测到直接依赖 pinia');
  }
  return capability(false, false, 'default', '未检测到直接依赖 pinia');
}

function resolveJanus(raw: MikoOptions, signals: ProjectSignals): ResolvedCapabilities['janus'] {
  if (raw.janusOptions === false) {
    return capability(false, {}, 'explicit', 'miko.janusOptions 显式关闭');
  }
  if (raw.janusOptions !== undefined) {
    if (!hasDependency(signals, '@janus/unplugin')) missingDependency('@janus/unplugin');
    const options = explicitOptions(raw.janusOptions);
    return capability(
      true,
      {
        ...(signals.conventions.janusSchemas
          ? { schemasDir: signals.conventions.janusSchemas }
          : {}),
        ...options,
      },
      'explicit',
      'miko.janusOptions 显式启用',
    );
  }
  if (hasDependency(signals, '@janus/unplugin') && signals.conventions.janusSchemas) {
    return capability(
      true,
      { schemasDir: signals.conventions.janusSchemas },
      'convention',
      '检测到 @janus/unplugin 和 schemas 目录',
    );
  }
  return capability(false, {}, 'default', '未同时检测到 Janus 依赖和 schemas 目录');
}

function resolveCdn(raw: MikoOptions): ResolvedCapabilities['cdn'] {
  if (raw.externalOptions === false || raw.externalOptions === undefined) {
    return capability(
      false,
      {},
      raw.externalOptions === false ? 'explicit' : 'default',
      raw.externalOptions === false ? 'miko.externalOptions 显式关闭' : 'CDN 只允许显式启用',
    );
  }
  return raw.externalOptions.frameworkCDN
    ? capability(true, raw.externalOptions, 'explicit', '已提供 Framework CDN 地址')
    : capability(
        false,
        raw.externalOptions,
        'explicit',
        '保留非 CDN External 配置，但未启用 CDN 外部化',
      );
}

export function resolveCapabilities(
  raw: MikoOptions,
  signals: ProjectSignals,
  env: MikoConfigEnv,
): ResolvedCapabilities {
  const uiLibrary = resolveUiLibrary(raw, signals);
  const componentsExplicit = raw.componentsPluginOptions;
  const components =
    componentsExplicit === false
      ? capability(false, {}, 'explicit', 'miko.componentsPluginOptions 显式关闭')
      : componentsExplicit !== undefined
        ? capability(
            true,
            explicitOptions(componentsExplicit),
            'explicit',
            'miko.componentsPluginOptions 显式启用',
          )
        : signals.conventions.components
          ? capability(true, {}, 'convention', '检测到 components 目录')
          : uiLibrary.enabled
            ? capability(true, {}, 'dependency', 'UI 库需要组件自动导入')
            : capability(false, {}, 'default', '未检测到组件自动导入信号');

  const unoExplicit = raw.unoCSSPluginOptions;
  const unoCSS =
    unoExplicit === false
      ? capability(false, {}, 'explicit', 'miko.unoCSSPluginOptions 显式关闭')
      : unoExplicit !== undefined
        ? capability(
            true,
            explicitOptions(unoExplicit),
            'explicit',
            'miko.unoCSSPluginOptions 显式启用',
          )
        : signals.conventions.unoConfig
          ? capability(
              true,
              { configFile: signals.conventions.unoConfig },
              'convention',
              `检测到 ${signals.conventions.unoConfig}`,
            )
          : hasDependency(signals, 'unocss') || hasDependency(signals, '@unocss/vite')
            ? capability(true, {}, 'dependency', '检测到 UnoCSS 直接依赖')
            : capability(false, {}, 'default', '未检测到 UnoCSS 配置或直接依赖');

  const layoutsExplicit = raw.layoutsPluginOptions;
  const layouts =
    layoutsExplicit === false
      ? capability(false, {}, 'explicit', 'miko.layoutsPluginOptions 显式关闭')
      : layoutsExplicit !== undefined
        ? capability(
            true,
            explicitOptions(layoutsExplicit),
            'explicit',
            'miko.layoutsPluginOptions 显式启用',
          )
        : signals.conventions.layouts
          ? capability(true, {}, 'convention', '检测到项目 layouts 目录')
          : capability(true, {}, 'builtin', '使用 Miko 内置布局约定');

  const linterExplicit = raw.linterOptions;
  const linterDefaults = { eslint: true, oxlint: true };
  const linter =
    linterExplicit === false
      ? capability(false, {}, 'explicit', 'miko.linterOptions 显式关闭')
      : linterExplicit !== undefined
        ? capability(
            true,
            { ...linterDefaults, ...explicitOptions(linterExplicit) },
            'explicit',
            'miko.linterOptions 显式启用',
          )
        : signals.conventions.lintConfig
          ? capability(
              true,
              linterDefaults,
              'convention',
              `检测到 ${signals.conventions.lintConfig}`,
            )
          : capability(true, linterDefaults, 'builtin', '使用 Miko 内置 Lint 配置');

  if (raw.unhead === false) {
    throw new MikoConfigError({
      code: 'MIKO_CAPABILITY_CONFLICT',
      field: 'miko.unhead',
      message: 'Unhead 由 Miko 的 ViteSSG 运行时统一管理，不能单独关闭',
    });
  }

  return {
    uiLibrary,
    legacy: resolveLegacy(raw, signals),
    cdn: resolveCdn(raw),
    devtools: resolveDevtools(raw, env),
    layouts,
    components,
    unoCSS,
    linter,
    pinia: resolvePinia(raw, signals),
    unhead: capability(
      true,
      true,
      raw.unhead === true ? 'explicit' : 'builtin',
      '由 Miko 的 ViteSSG 运行时安装唯一 Head 实例',
    ),
    janus: resolveJanus(raw, signals),
  };
}
