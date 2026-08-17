import type { PluginOption, UserConfig } from 'vite';
import { MikoConfigError } from './errors';
import type { ResolvedMikoConfig } from './types';

export const MIKO_PROTECTED_PLUGIN_NAMES = new Set([
  'miko:ssr-css',
  'miko:runtime',
  'miko:layouts-disabled',
  'miko:unocss-disabled',
  'miko:restart-on-capability-change',
  '@minar-kotonoha/vite-plugin-bootstrap',
  '@minar-kotonoha/vite-plugin-external',
  '@minar-kotonoha/vite-plugin-index-html',
  '@minar-kotonoha/vite-plugin-index-html:entry',
]);

async function collectPluginNames(option: PluginOption, names: string[]): Promise<void> {
  const resolved = await option;
  if (!resolved) return;
  if (Array.isArray(resolved)) {
    for (const nested of resolved) await collectPluginNames(nested, names);
    return;
  }
  if (typeof resolved.name === 'string') names.push(resolved.name);
}

function exactStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function validateLibCssScope(project: ResolvedMikoConfig): string | undefined {
  const cssScope = project.miko.lib?.cssScope;
  if (cssScope === undefined) return undefined;

  if (typeof cssScope !== 'string' || cssScope.trim().length === 0) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      field: 'miko.lib.cssScope',
      message: 'miko.lib.cssScope 必须是非空 CSS 选择器字符串',
    });
  }

  if (typeof project.vite.css?.postcss === 'string') {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.css.postcss',
      message:
        'miko.lib.cssScope 不能与字符串形式的 vite.css.postcss 同时使用；请改为 vite.css.postcss.plugins',
    });
  }

  return cssScope.trim();
}

export function validateResolvedProject(project: ResolvedMikoConfig): void {
  if (
    project.capabilities.cdn.enabled &&
    !project.signals.dependencies.includes('@minar-kotonoha/framework')
  ) {
    throw new MikoConfigError({
      code: 'MIKO_CAPABILITY_MISSING_DEPENDENCY',
      field: 'miko.externalOptions.frameworkCDN',
      message: 'CDN 外部化需要项目直接依赖 @minar-kotonoha/framework，请先使用 Bun 安装该依赖',
    });
  }

  validateLibCssScope(project);
}

export async function validateFinalConfig(
  project: ResolvedMikoConfig,
  config: UserConfig,
): Promise<void> {
  const pluginNames: string[] = [];
  for (const plugin of config.plugins ?? []) await collectPluginNames(plugin, pluginNames);
  const duplicateCore = [...MIKO_PROTECTED_PLUGIN_NAMES].find(
    (name) => pluginNames.filter((pluginName) => pluginName === name).length > 1,
  );
  if (duplicateCore) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.plugins',
      message: `用户插件重复注册了 Miko 核心插件 ${duplicateCore}`,
    });
  }

  const include = new Set(config.optimizeDeps?.include ?? []);
  const optimizeConflict = (config.optimizeDeps?.exclude ?? []).find((dependency) =>
    include.has(dependency),
  );
  if (optimizeConflict) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.optimizeDeps',
      message: `依赖 ${optimizeConflict} 不能同时出现在 optimizeDeps.include 和 exclude`,
    });
  }

  if (config.build?.lib !== undefined) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.build.lib',
      message: '普通 SPA/SSG 构建不能设置 vite.build.lib，请使用 miko build --lib',
    });
  }

  const external = new Set(exactStrings(config.ssr?.external));
  const ssrConflict = exactStrings(config.ssr?.noExternal).find((dependency) =>
    external.has(dependency),
  );
  if (ssrConflict) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.ssr',
      message: `依赖 ${ssrConflict} 不能同时出现在 ssr.external 和 ssr.noExternal`,
    });
  }

  if (project.miko.rendering !== 'spa' && project.miko.rendering !== 'ssg') {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      field: 'miko.rendering',
      message: `未知渲染模式 ${String(project.miko.rendering)}`,
    });
  }
}
