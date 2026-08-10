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
import { capabilityRestartPlugin } from './restart';

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
  const [components, unoCSS, devtools, legacy, external, htmlEntry, janus] = await Promise.all([
    componentPlugins(project),
    unoCssPlugins(project),
    devtoolsPlugins(project),
    legacyPlugins(project),
    externalPlugins(project),
    htmlEntryPlugins(project),
    janusPlugins(project),
  ]);

  add('miko:ssr-css', ssrCssPlugin());
  add('miko:vue', vueCorePlugins(project));
  add('miko:runtime', runtimePlugin(project));
  add('miko:layouts', layoutPlugins(project));
  add('miko:components', components);
  add('miko:unocss', unoCSS);
  add('miko:linter', linterPlugins(project));
  add('miko:devtools', devtools);
  add('miko:legacy', legacy);
  add('miko:bootstrap', bootstrapPlugins(project));
  add('miko:external-resolve', external.resolver);
  add('miko:external-cdn', external.cdn);
  add('miko:html-entry', htmlEntry);
  add('miko:janus', janus);
  if (project.env.command === 'dev') {
    add(
      'miko:restart-on-capability-change',
      capabilityRestartPlugin(project.signals.watchedFiles, project.signals.watchedDirectories),
    );
  }

  const protectedPluginNames = plugins.flatMap((plugin) => {
    if (!plugin || Array.isArray(plugin) || !('name' in plugin)) return [];
    return MIKO_PROTECTED_PLUGIN_NAMES.has(plugin.name) ? [plugin.name] : [];
  });

  return { plugins, order, protectedPluginNames };
}
