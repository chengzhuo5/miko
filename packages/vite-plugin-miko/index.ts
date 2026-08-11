/**
 * # @minar-kotonoha/vite-plugin-miko
 *
 * 将已解析的 Miko 项目配置转换为完整 Vite 配置。
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import type { UserConfig } from 'vite';

import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import VueMacros from 'vue-macros/vite';
import UnoCSS from 'unocss/vite';

import { inspectProject, resolveCapabilities } from './capabilities';
import { loadMikoConfig, resolveMikoConfig } from './config';
import { mergeViteConfig } from './config/merge';
import type { MikoConfigEnv, ResolvedMikoConfig } from './config/types';
import { validateFinalConfig, validateResolvedProject } from './config/validate';
import { assembleMikoPlugins } from './plugins';
import { composeSsgPageRendered } from './ssg/state';

export { defineMikoConfig } from './config/define';
export { MikoConfigError } from './config/errors';
export * from './capabilities';
export { assembleMikoPlugins } from './plugins';
export type { PluginAssembly } from './plugins';
export type * from './config/types';
export type * from './types';

export function getBundledTemplate(): string {
  return fileURLToPath(new URL('./template', import.meta.url));
}

export async function resolveMikoProject(env: MikoConfigEnv): Promise<ResolvedMikoConfig> {
  const [loaded, signals] = await Promise.all([
    loadMikoConfig(env),
    inspectProject(env.root, env.mode),
  ]);
  const capabilities = resolveCapabilities(loaded.config.miko ?? {}, signals, env);
  const project = resolveMikoConfig(loaded, env, getBundledTemplate(), capabilities, signals);
  validateResolvedProject(project);
  return project;
}

export async function createMikoViteConfig(project: ResolvedMikoConfig) {
  const { miko, outDir } = project;
  const ssgEnabled = miko.rendering === 'ssg';
  const externalOptions = miko.externalOptions === false ? undefined : miko.externalOptions;
  const { plugins } = await assembleMikoPlugins(project);

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
      dedupe: ['vue', 'vue-router', 'pinia'],
    },
    experimental: {
      bundledDev: miko.devOptions.bundledDev ?? false,
    },
    server: project.env.command === 'dev' ? { host: '127.0.0.1' } : undefined,
    optimizeDeps: externalOptions?.optimizeDepsExclude?.length
      ? { exclude: externalOptions.optimizeDepsExclude }
      : undefined,
    ssr: externalOptions?.ssrNoExternal?.length
      ? { noExternal: externalOptions.ssrNoExternal }
      : undefined,
    ssgOptions: ssgEnabled
      ? {
          ...miko.ssgOptions,
          entry: miko.entry,
          onPageRendered: composeSsgPageRendered(miko.ssgOptions.onPageRendered),
        }
      : undefined,
    define: {
      'import.meta.env.VITE_MIKO_SPA': JSON.stringify(ssgEnabled ? 'false' : 'true'),
      ...(externalOptions?.frameworkCDN
        ? {
            'import.meta.env.VITE_FRAMEWORK_CDN': JSON.stringify(externalOptions.frameworkCDN),
          }
        : {}),
    },
    plugins,
  };

  const config = mergeViteConfig(generated as UserConfig, project.vite) as UserConfig & {
    input: string;
  };
  await validateFinalConfig(project, config);
  return config;
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
