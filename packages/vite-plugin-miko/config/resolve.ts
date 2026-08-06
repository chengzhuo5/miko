import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { remove } from 'fs-extra';
import { mergeConfig } from 'vite';
import type { UserConfig } from 'vite';
import { MikoConfigError } from './errors';
import { mergeViteConfig } from './merge';
import type { LoadedMikoConfig, MikoConfigEnv, ResolvedMikoConfig } from './types';

function mergeOptions<T extends object>(defaults: T, user: object | undefined): T {
  return mergeConfig(defaults as UserConfig, (user ?? {}) as UserConfig) as T;
}

export function resolveMikoConfig(
  loaded: LoadedMikoConfig,
  env: MikoConfigEnv,
  bundledTemplate: string,
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
    vite: mergeViteConfig(vite, {
      root: viteRoot,
      build: { outDir },
    }),
    miko: {
      rendering,
      template,
      entry: resolve(viteRoot, raw.entry ?? resolve(template, 'main.ts')),
      pagesDir,
      uiLibrary: raw.uiLibrary ?? 'vant',
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
      layoutsPluginOptions:
        raw.layoutsPluginOptions === false ? false : mergeOptions({}, raw.layoutsPluginOptions),
      componentsPluginOptions:
        raw.componentsPluginOptions === false
          ? false
          : mergeOptions(defaultComponents, raw.componentsPluginOptions),
      unoCSSPluginOptions:
        raw.unoCSSPluginOptions === false
          ? false
          : mergeOptions({ configFile: false as const }, raw.unoCSSPluginOptions),
      legacyPluginOptions: raw.legacyPluginOptions ?? false,
      ssgOptions: mergeOptions(defaultSsgOptions, raw.ssgOptions),
      linterOptions:
        raw.linterOptions === false
          ? false
          : mergeOptions({ oxlint: true, eslint: true }, raw.linterOptions),
      bootstrapOptions: mergeOptions({ entryFile: 'index.ts' }, raw.bootstrapOptions),
      externalOptions: raw.externalOptions ?? false,
      devOptions: mergeOptions({ bundledDev: false }, raw.devOptions),
      janusOptions: raw.janusOptions === false ? false : mergeOptions({}, raw.janusOptions),
    },
  };
}
