import { resolve } from 'node:path';
import type { PluginOption } from 'vite';
import { VantResolver } from '@vant/auto-import-resolver';
import UnoCSS from 'unocss/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import Layouts from 'vite-plugin-vue-layouts-next';
import type { ResolvedMikoConfig } from '../config/types';

export function layoutPlugins(project: ResolvedMikoConfig): PluginOption {
  const { miko } = project;
  if (miko.layoutsPluginOptions !== false) {
    const layoutsDirs = miko.layoutsPluginOptions.layoutsDirs
      ? Array.isArray(miko.layoutsPluginOptions.layoutsDirs)
        ? miko.layoutsPluginOptions.layoutsDirs
        : [miko.layoutsPluginOptions.layoutsDirs]
      : [resolve(miko.template, 'layouts'), resolve(project.viteRoot, 'layouts')];

    return Layouts({
      ...miko.layoutsPluginOptions,
      defaultLayout: miko.layoutsPluginOptions.defaultLayout ?? miko.layout,
      layoutsDirs,
      pagesDirs: miko.layoutsPluginOptions.pagesDirs ?? miko.pagesDir,
    });
  }

  const virtualId = 'virtual:generated-layouts';
  const resolvedId = `\0${virtualId}`;
  return {
    name: 'miko:layouts-disabled',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) return 'export function setupLayouts(routes) { return routes }';
    },
  };
}

export function componentPlugins(project: ResolvedMikoConfig): PluginOption {
  const { miko } = project;
  if (miko.componentsPluginOptions === false) return [];

  const defaultResolvers =
    miko.uiLibrary === 'vant'
      ? [VantResolver()]
      : miko.uiLibrary === 'element-plus'
        ? [ElementPlusResolver()]
        : [];
  const componentDirs = miko.componentsPluginOptions.dirs;

  return Components({
    ...miko.componentsPluginOptions,
    dirs:
      componentDirs === undefined
        ? undefined
        : Array.isArray(componentDirs)
          ? componentDirs
          : [componentDirs],
    resolvers: (miko.componentsPluginOptions.resolvers ?? defaultResolvers) as NonNullable<
      Parameters<typeof Components>[0]
    >['resolvers'],
  });
}

export function unoCssPlugins(project: ResolvedMikoConfig): PluginOption {
  const options = project.miko.unoCSSPluginOptions;
  if (options !== false) {
    return UnoCSS({
      configFile: false,
      ...options,
    } as Parameters<typeof UnoCSS>[0]);
  }

  const virtualId = 'virtual:uno.css';
  const resolvedId = `\0${virtualId}`;
  return {
    name: 'miko:unocss-disabled',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) return '';
    },
  };
}
