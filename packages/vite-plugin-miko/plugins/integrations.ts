import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { PluginOption } from 'vite';
import linterPlugin from '@minar-kotonoha/linter/vite';
import { externalPlugin } from '@minar-kotonoha/vite-plugin-external';
import type { ResolvedMikoConfig } from '../config/types';
import type { JanusOptions } from '../types';

export function linterPlugins(project: ResolvedMikoConfig): PluginOption {
  return project.miko.linterOptions === false ? [] : linterPlugin;
}

export async function devtoolsPlugins(project: ResolvedMikoConfig): Promise<PluginOption> {
  const options = project.miko.devToolsPluginOptions;
  if (options === false) return [];
  const { default: vueDevTools } = await import('vite-plugin-vue-devtools');
  return vueDevTools(options);
}

export async function legacyPlugins(project: ResolvedMikoConfig): Promise<PluginOption> {
  const options = project.miko.legacyPluginOptions;
  if (options === false) return [];
  const { default: legacy } = await import('@vitejs/plugin-legacy');
  return legacy(options);
}

export async function externalPlugins(project: ResolvedMikoConfig): Promise<{
  resolver: PluginOption;
  cdn: PluginOption;
}> {
  const options = project.miko.externalOptions;
  const cdnEnabled = options !== false && Boolean(options.frameworkCDN);
  const additionalExternals = options === false ? [] : (options.additionalExternals ?? []);
  const [resolverPlugin = [], ...cdnPlugins] = await externalPlugin(
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

export async function janusPlugins(project: ResolvedMikoConfig): Promise<PluginOption> {
  const options = project.miko.janusOptions;
  return options === false ? [] : loadJanus(options, project.viteRoot);
}
