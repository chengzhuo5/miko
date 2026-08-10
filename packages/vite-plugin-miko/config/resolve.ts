import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { remove } from 'fs-extra';
import { mergeConfig } from 'vite';
import type { UserConfig } from 'vite';
import type { ProjectSignals } from '../capabilities/types';
import { MikoConfigError } from './errors';
import { mergeViteConfig } from './merge';
import type {
  LoadedMikoConfig,
  MikoConfigEnv,
  ResolvedCapabilities,
  ResolvedMikoConfig,
} from './types';

function mergeOptions<T extends object>(defaults: T, user: object | undefined): T {
  return mergeConfig(defaults as UserConfig, (user ?? {}) as UserConfig) as T;
}

export function resolveMikoConfig(
  loaded: LoadedMikoConfig,
  env: MikoConfigEnv,
  bundledTemplate: string,
  capabilities: ResolvedCapabilities,
  signals: ProjectSignals,
): ResolvedMikoConfig {
  const raw = loaded.config.miko ?? {};
  const vite = loaded.config.vite ?? {};
  const applicationInput = (vite as UserConfig & { input?: unknown }).input;

  if (applicationInput !== undefined) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.input',
      message: 'vite.input 由 Miko 管理，请通过根目录 index.html 自定义 SPA/SSG 页面外壳',
    });
  }

  if (vite.build?.rollupOptions?.input !== undefined) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.build.rollupOptions.input',
      message:
        'vite.build.rollupOptions.input 由 Miko 管理，请通过根目录 index.html 自定义 SPA/SSG 页面外壳',
    });
  }

  if (vite.build?.rolldownOptions?.input !== undefined) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.build.rolldownOptions.input',
      message:
        'vite.build.rolldownOptions.input 由 Miko 管理，请通过根目录 index.html 自定义 SPA/SSG 页面外壳',
    });
  }

  const viteRoot = resolve(env.root, vite.root ?? '.');
  const localTemplate = resolve(viteRoot, 'template');
  const template = resolve(
    viteRoot,
    raw.template ?? (existsSync(localTemplate) ? localTemplate : bundledTemplate),
  );
  const pagesDir = resolve(viteRoot, raw.pagesDir ?? 'pages');
  const outDir = resolve(viteRoot, vite.build?.outDir ?? 'dist');
  const rendering = raw.rendering ?? 'ssg';
  const whiteScreenTimeout = capabilities.whiteScreen.value.timeout ?? 8000;
  if (!Number.isFinite(whiteScreenTimeout) || whiteScreenTimeout < 1000) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      field: 'miko.whiteScreen.timeout',
      message: 'miko.whiteScreen.timeout 必须是大于等于 1000 的有限毫秒数',
    });
  }
  const defaultSsgOptions = {
    beastiesOptions: { external: false },
    dirStyle: 'flat' as const,
    formatting: 'none' as const,
    includedRoutes(paths: string[]) {
      return paths.filter((path) => !path.includes('node_modules'));
    },
    onPageRendered(_route: string, renderedHTML: string) {
      return renderedHTML;
    },
    async onFinished() {
      await remove(resolve(outDir, '.vite'));
    },
  };
  const defaultComponents = {
    dirs: [resolve(viteRoot, 'components')],
    extensions: ['vue', 'tsx', 'ts'],
    dts: resolve(viteRoot, 'types/components.d.ts'),
  };

  return {
    env,
    configFile: loaded.configFile,
    viteRoot,
    outDir,
    signals,
    capabilities,
    vite: mergeViteConfig(vite, {
      root: viteRoot,
      build: { outDir },
    }),
    miko: {
      rendering,
      template,
      entry: resolve(viteRoot, raw.entry ?? resolve(template, 'main.ts')),
      pagesDir,
      uiLibrary: capabilities.uiLibrary.value,
      layout: raw.layout ?? 'flexible',
      lib: raw.lib,
      vuePluginOptions: mergeOptions({}, raw.vuePluginOptions),
      vueJsxPluginOptions: mergeOptions({}, raw.vueJsxPluginOptions),
      routerPluginOptions: mergeOptions(
        {
          extensions: ['.vue', '.setup.tsx'],
          routesFolder: pagesDir,
          dts: resolve(viteRoot, 'types/routes.d.ts'),
        },
        raw.routerPluginOptions,
      ),
      layoutsPluginOptions: capabilities.layouts.enabled
        ? mergeOptions({}, capabilities.layouts.value)
        : false,
      componentsPluginOptions: capabilities.components.enabled
        ? mergeOptions(defaultComponents, capabilities.components.value)
        : false,
      unoCSSPluginOptions: capabilities.unoCSS.enabled
        ? mergeOptions({ configFile: false as const }, capabilities.unoCSS.value)
        : false,
      legacyPluginOptions: capabilities.legacy.enabled
        ? mergeOptions({}, capabilities.legacy.value)
        : false,
      ssgOptions: mergeOptions(defaultSsgOptions, raw.ssgOptions),
      linterOptions: capabilities.linter.enabled
        ? mergeOptions({ oxlint: true, eslint: true }, capabilities.linter.value)
        : false,
      devToolsPluginOptions: capabilities.devtools.enabled
        ? mergeOptions({}, capabilities.devtools.value)
        : false,
      bootstrapOptions: mergeOptions({ entryFile: 'index.ts' }, raw.bootstrapOptions),
      externalOptions:
        capabilities.cdn.source === 'explicit' ? mergeOptions({}, capabilities.cdn.value) : false,
      devOptions: mergeOptions({ bundledDev: false }, raw.devOptions),
      pinia: capabilities.pinia.enabled,
      unhead: capabilities.unhead.enabled,
      janusOptions: capabilities.janus.enabled ? mergeOptions({}, capabilities.janus.value) : false,
      whiteScreenOptions: capabilities.whiteScreen.enabled
        ? { timeout: whiteScreenTimeout }
        : false,
    },
  };
}
