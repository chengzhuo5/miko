import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { PluginOption } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import linterPlugin from '@minar-kotonoha/linter/vite';
import { externalPlugin } from '@minar-kotonoha/vite-plugin-external';
import vueDevTools from 'vite-plugin-vue-devtools';
import type { ResolvedMikoConfig } from '../config/types';
import type { JanusOptions } from '../types';

export function linterPlugins(project: ResolvedMikoConfig): PluginOption {
  return project.miko.linterOptions === false ? [] : linterPlugin;
}

export function devtoolsPlugins(project: ResolvedMikoConfig): PluginOption {
  const options = project.miko.devToolsPluginOptions;
  return options === false ? [] : vueDevTools(options);
}

export function legacyPlugins(project: ResolvedMikoConfig): PluginOption {
  const options = project.miko.legacyPluginOptions;
  return options === false ? [] : legacy(options);
}

export function externalPlugins(project: ResolvedMikoConfig): {
  resolver: PluginOption;
  cdn: PluginOption;
} {
  const options = project.miko.externalOptions;
  const cdnEnabled = options !== false && Boolean(options.frameworkCDN);
  const additionalExternals = options === false ? [] : (options.additionalExternals ?? []);
  const [resolverPlugin = [], ...cdnPlugins] = externalPlugin(
    project.viteRoot,
    cdnEnabled,
    additionalExternals,
  );
  return { resolver: resolverPlugin, cdn: cdnPlugins };
}

function loadJanus(options: JanusOptions, root: string): PluginOption {
  try {
    const entry = resolve(root, 'node_modules/@janus/unplugin/dist/unplugin.cjs');
    if (!existsSync(entry)) return [];
    const require = createRequire(import.meta.url);
    const module = require(entry);
    return module?.vite?.(options) || module?.default?.vite?.(options) || [];
  } catch (error) {
    console.warn('[miko] Janus 加载失败:', (error as Error)?.message);
    return [];
  }
}

export function janusPlugins(project: ResolvedMikoConfig): PluginOption {
  const options = project.miko.janusOptions;
  return options === false ? [] : loadJanus(options, project.viteRoot);
}
