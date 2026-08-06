/**
 * # @minar-kotonoha/vite-plugin-miko
 *
 * 将已解析的 Miko 项目配置转换为完整 Vite 配置。
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import type { PluginOption, UserConfig } from 'vite';

import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import VueRouter from 'vue-router/vite';
import VueMacros from 'vue-macros/vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import Layouts from 'vite-plugin-vue-layouts-next';
import linterPlugin from '@minar-kotonoha/linter/vite';
import legacy from '@vitejs/plugin-legacy';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { VantResolver } from '@vant/auto-import-resolver';
import UnoCSS from 'unocss/vite';

import { bootstrapPlugin } from '@minar-kotonoha/vite-plugin-bootstrap';
import { externalPlugin } from '@minar-kotonoha/vite-plugin-external';
import { indexHTMLPlugin } from '@minar-kotonoha/vite-plugin-index-html';

import { loadMikoConfig, resolveMikoConfig } from './config';
import { mergeViteConfig } from './config/merge';
import type { MikoConfigEnv, ResolvedMikoConfig } from './config/types';
import type { JanusOptions } from './types';

export { defineMikoConfig } from './config/define';
export { MikoConfigError } from './config/errors';
export type * from './config/types';
export type * from './types';

export function getBundledTemplate(): string {
  return fileURLToPath(new URL('./template', import.meta.url));
}

export async function resolveMikoProject(env: MikoConfigEnv): Promise<ResolvedMikoConfig> {
  const loaded = await loadMikoConfig(env);
  return resolveMikoConfig(loaded, env, getBundledTemplate());
}

function loadJanus(opts: JanusOptions | false, root: string): PluginOption | null {
  if (opts === false) return null;
  try {
    const janusEntry = resolve(root, 'node_modules/@janus/unplugin/dist/unplugin.cjs');
    if (!existsSync(janusEntry)) return null;
    const require = createRequire(import.meta.url);
    const mod = require(janusEntry);
    return mod?.vite?.(opts) || mod?.default?.vite?.(opts) || null;
  } catch (error) {
    console.warn('[miko] Janus 加载失败:', (error as Error)?.message);
    return null;
  }
}

async function createMikoPlugins(project: ResolvedMikoConfig): Promise<PluginOption[]> {
  const { miko } = project;
  const plugins: PluginOption[] = [
    {
      name: 'miko:ssr-css',
      applyToEnvironment({ name }) {
        return name === 'ssr';
      },
      transform(code, id) {
        if (/\.(css|less|scss|sass)$/.test(id)) return '';
        if (/\.(ts|js|tsx|jsx|vue|mjs|cjs)$/.test(id)) {
          return code.replace(/import\s+['"][^'"]+\.(css|less|scss|sass)['"]\s*;?/g, '');
        }
      },
    } satisfies PluginOption,
    VueMacros({
      plugins: {
        vue: vue(miko.vuePluginOptions),
        vueJsx: vueJsx(miko.vueJsxPluginOptions),
        vueRouter: VueRouter({
          extensions: miko.routerPluginOptions.extensions,
          routesFolder: miko.routerPluginOptions.routesFolder,
          dts: miko.routerPluginOptions.dts,
          extendRoute(route: { path?: string; addAlias: (aliases: string[]) => void }) {
            if (route.path) {
              route.addAlias([route.path === '/' ? 'index.html' : `${route.path}.html`]);
            }
          },
        }),
      },
    }),
    vueDevTools(),
  ];

  if (miko.layoutsPluginOptions !== false) {
    const layoutsDirs = miko.layoutsPluginOptions.layoutsDirs
      ? Array.isArray(miko.layoutsPluginOptions.layoutsDirs)
        ? miko.layoutsPluginOptions.layoutsDirs
        : [miko.layoutsPluginOptions.layoutsDirs]
      : [resolve(miko.template, 'layouts'), resolve(project.viteRoot, 'layouts')];

    plugins.push(
      Layouts({
        ...miko.layoutsPluginOptions,
        defaultLayout: miko.layoutsPluginOptions.defaultLayout ?? miko.layout,
        layoutsDirs,
        pagesDirs: miko.layoutsPluginOptions.pagesDirs ?? miko.pagesDir,
      }),
    );
  } else {
    const virtualLayoutsId = 'virtual:generated-layouts';
    const resolvedVirtualLayoutsId = `\0${virtualLayoutsId}`;
    plugins.push({
      name: 'miko:layouts-disabled',
      resolveId(id) {
        if (id === virtualLayoutsId) return resolvedVirtualLayoutsId;
      },
      load(id) {
        if (id === resolvedVirtualLayoutsId) {
          return 'export function setupLayouts(routes) { return routes }';
        }
      },
    });
  }

  if (miko.linterOptions !== false) plugins.push(linterPlugin);
  if (miko.legacyPluginOptions !== false) {
    plugins.push(legacy(miko.legacyPluginOptions));
  }

  if (miko.componentsPluginOptions !== false) {
    const componentResolvers =
      miko.componentsPluginOptions.resolvers ??
      (miko.uiLibrary === 'vant' ? [VantResolver()] : [ElementPlusResolver()]);
    const componentDirs = miko.componentsPluginOptions.dirs;

    plugins.push(
      Components({
        ...miko.componentsPluginOptions,
        dirs:
          componentDirs === undefined
            ? undefined
            : Array.isArray(componentDirs)
              ? componentDirs
              : [componentDirs],
        resolvers: componentResolvers as NonNullable<Parameters<typeof Components>[0]>['resolvers'],
      }),
    );
  }

  if (miko.unoCSSPluginOptions !== false) {
    plugins.push(
      UnoCSS({
        configFile: false,
        ...miko.unoCSSPluginOptions,
      } as Parameters<typeof UnoCSS>[0]),
    );
  } else {
    const virtualUnoCssId = 'virtual:uno.css';
    const resolvedVirtualUnoCssId = `\0${virtualUnoCssId}`;
    plugins.push({
      name: 'miko:unocss-disabled',
      resolveId(id) {
        if (id === virtualUnoCssId) return resolvedVirtualUnoCssId;
      },
      load(id) {
        if (id === resolvedVirtualUnoCssId) return '';
      },
    });
  }

  plugins.push(bootstrapPlugin(miko.bootstrapOptions.entryFile));

  const externalEnabled =
    miko.externalOptions !== false && Boolean(miko.externalOptions.frameworkCDN);
  plugins.push(...externalPlugin(externalEnabled));
  plugins.push(
    await indexHTMLPlugin({
      entry: miko.entry,
      root: project.viteRoot,
      template: miko.template,
    }),
  );

  const janusPlugin = loadJanus(miko.janusOptions, project.viteRoot);
  if (janusPlugin) plugins.push(janusPlugin);

  return plugins;
}

export async function createMikoViteConfig(project: ResolvedMikoConfig) {
  const { miko, outDir } = project;
  const ssgEnabled = miko.rendering === 'ssg';
  const plugins = await createMikoPlugins(project);

  const generated = {
    root: project.viteRoot,
    input: normalizePath(resolve(project.viteRoot, 'index.html')),
    base: '/',
    build: {
      outDir,
      emptyOutDir: true,
    },
    cacheDir: normalizePath(resolve(project.viteRoot, 'node_modules/.vite')),
    resolve: {
      alias: [{ find: '@', replacement: project.viteRoot }],
      tsconfigPaths: true,
    },
    experimental: {
      bundledDev: miko.devOptions.bundledDev ?? false,
    },
    ssgOptions: ssgEnabled
      ? {
          ...miko.ssgOptions,
          entry: miko.entry,
        }
      : undefined,
    define: {
      'import.meta.env.VITE_MIKO_SPA': JSON.stringify(ssgEnabled ? 'false' : 'true'),
    },
    plugins,
  };

  return mergeViteConfig(generated as UserConfig, project.vite) as UserConfig & {
    input: string;
  };
}

export function createLibConfig(options: { config: ResolvedMikoConfig }): UserConfig {
  const { config } = options;
  const root = config.viteRoot;
  const lib = {
    entry: 'src/index.ts',
    formats: ['es', 'cjs'] as ('es' | 'cjs' | 'umd')[],
    ...config.miko.lib,
  };

  const generated: UserConfig = {
    root,
    build: {
      outDir: config.outDir,
      emptyOutDir: true,
      lib: {
        entry: resolve(root, lib.entry),
        formats: lib.formats,
        name: lib.name,
        fileName: lib.fileName,
      },
      rollupOptions: {
        external: ['vue', 'vue-router', 'pinia', 'axios', '@unhead/vue'],
      },
    },
    resolve: {
      alias: [{ find: '@', replacement: root }],
      tsconfigPaths: true,
    },
    plugins: [
      VueMacros({
        plugins: {
          vue: vue(config.miko.vuePluginOptions),
          vueJsx: vueJsx(config.miko.vueJsxPluginOptions),
        },
      }),
      config.miko.unoCSSPluginOptions === false ? null : UnoCSS(config.miko.unoCSSPluginOptions),
    ],
  };

  return mergeViteConfig(generated, config.vite);
}
