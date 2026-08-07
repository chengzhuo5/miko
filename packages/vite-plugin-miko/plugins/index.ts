import type { PluginOption } from 'vite';
import { MIKO_PROTECTED_PLUGIN_NAMES } from '../config/validate';
import type { ResolvedMikoConfig } from '../config/types';
import { bootstrapPlugins, htmlEntryPlugins, ssrCssPlugin, vueCorePlugins } from './core';
import { componentPlugins, layoutPlugins, unoCssPlugins } from './conventions';
import {
  devtoolsPlugins,
  externalPlugins,
  janusPlugins,
  legacyPlugins,
  linterPlugins,
} from './integrations';
import { runtimePlugin } from './runtime';

export interface PluginAssembly {
  plugins: PluginOption[];
  order: string[];
  protectedPluginNames: string[];
}

function flattenPluginOptions(option: PluginOption): PluginOption[] {
  if (!option) return [];
  if (Array.isArray(option)) return option.flatMap(flattenPluginOptions);
  return [option];
}

export async function assembleMikoPlugins(project: ResolvedMikoConfig): Promise<PluginAssembly> {
  const plugins: PluginOption[] = [];
  const order: string[] = [];
  const add = (name: string, option: PluginOption) => {
    const flattened = flattenPluginOptions(option);
    if (flattened.length === 0) return;
    order.push(name);
    plugins.push(...flattened);
  };

  add('miko:ssr-css', ssrCssPlugin());
  add('miko:vue', vueCorePlugins(project));
  add('miko:runtime', runtimePlugin());
  add('miko:layouts', layoutPlugins(project));
  add('miko:components', componentPlugins(project));
  add('miko:unocss', unoCssPlugins(project));
  add('miko:linter', linterPlugins(project));
  add('miko:devtools', devtoolsPlugins(project));
  add('miko:legacy', legacyPlugins(project));
  add('miko:bootstrap', bootstrapPlugins(project));

  const external = externalPlugins(project);
  add('miko:external-resolve', external.resolver);
  add('miko:external-cdn', external.cdn);
  add('miko:html-entry', await htmlEntryPlugins(project));
  add('miko:janus', janusPlugins(project));

  const protectedPluginNames = plugins.flatMap((plugin) => {
    if (!plugin || Array.isArray(plugin) || !('name' in plugin)) return [];
    return MIKO_PROTECTED_PLUGIN_NAMES.has(plugin.name) ? [plugin.name] : [];
  });

  return { plugins, order, protectedPluginNames };
}
