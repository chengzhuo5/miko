import type { PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import VueRouter from 'vue-router/vite';
import VueMacros from 'vue-macros/vite';
import { bootstrapPlugin } from '@minar-kotonoha/vite-plugin-bootstrap';
import { indexHTMLPlugin } from '@minar-kotonoha/vite-plugin-index-html';
import type { ResolvedMikoConfig } from '../config/types';

export function ssrCssPlugin(): PluginOption {
  return {
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
  };
}

export function vueCorePlugins(project: ResolvedMikoConfig): PluginOption {
  const { miko } = project;
  return VueMacros({
    plugins: {
      vue: vue(miko.vuePluginOptions),
      vueJsx: vueJsx(miko.vueJsxPluginOptions),
      vueRouter: VueRouter({
        extensions: miko.routerPluginOptions.extensions,
        routesFolder: miko.routerPluginOptions.routesFolder,
        dts: miko.routerPluginOptions.dts,
        extendRoute(route: { path?: string; addAlias: (aliases: string[]) => void }) {
          if (route.path) {
            route.addAlias([route.path === '/' ? '/index.html' : `${route.path}.html`]);
          }
        },
      }),
    },
  });
}

export function bootstrapPlugins(project: ResolvedMikoConfig): PluginOption {
  return bootstrapPlugin(project.miko.bootstrapOptions.entryFile);
}

export async function htmlEntryPlugins(project: ResolvedMikoConfig): Promise<PluginOption> {
  return indexHTMLPlugin({
    entry: project.miko.entry,
    root: project.viteRoot,
    template: project.miko.template,
    whiteScreen: {
      development: project.env.command === 'dev',
      showFailure: project.env.mode === 'test',
      enabled: project.capabilities.whiteScreen.enabled,
      timeout: project.capabilities.whiteScreen.value.timeout ?? 8000,
    },
  });
}
