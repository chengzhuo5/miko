import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PluginOption } from 'vite';
import type { ResolvedMikoConfig } from '../config/types';
import { assembleMikoPlugins } from './index';

function project(): ResolvedMikoConfig {
  const template = fileURLToPath(new URL('../template', import.meta.url));
  return {
    env: { command: 'build', mode: 'production', root: 'D:/project' },
    configFile: null,
    viteRoot: 'D:/project',
    outDir: 'D:/project/dist',
    vite: {},
    miko: {
      rendering: 'spa',
      template,
      entry: `${template}/main.ts`,
      pagesDir: 'D:/project/pages',
      uiLibrary: false,
      layout: 'flexible',
      vuePluginOptions: {},
      vueJsxPluginOptions: {},
      routerPluginOptions: {},
      layoutsPluginOptions: {},
      componentsPluginOptions: {},
      unoCSSPluginOptions: {},
      legacyPluginOptions: {},
      ssgOptions: {},
      linterOptions: {},
      devToolsPluginOptions: {},
      bootstrapOptions: { entryFile: 'index.ts' },
      externalOptions: false,
      devOptions: { bundledDev: false },
      pinia: false,
      unhead: true,
      janusOptions: false,
    },
    signals: {
      root: 'D:/project',
      packageJsonPath: null,
      dependencies: [],
      browserslist: [],
      browserslistConfigFile: null,
      conventions: {
        components: false,
        janusSchemas: null,
        layouts: false,
        lintConfig: null,
        unoConfig: null,
      },
      watchedDirectories: [],
      watchedFiles: [],
    },
    capabilities: {} as ResolvedMikoConfig['capabilities'],
  };
}

function flattenNames(options: PluginOption[]): string[] {
  return options.flatMap((option) => {
    if (!option) return [];
    if (Array.isArray(option)) return flattenNames(option);
    return [option.name];
  });
}

describe('assembleMikoPlugins', () => {
  it('keeps a stable logical order without renaming real Vite plugins', async () => {
    const result = await assembleMikoPlugins(project());

    expect(result.order).toEqual([
      'miko:ssr-css',
      'miko:vue',
      'miko:runtime',
      'miko:layouts',
      'miko:components',
      'miko:unocss',
      'miko:linter',
      'miko:devtools',
      'miko:legacy',
      'miko:bootstrap',
      'miko:external-resolve',
      'miko:html-entry',
    ]);

    const names = flattenNames(result.plugins);
    expect(names.indexOf('miko:ssr-css')).toBeLessThan(names.indexOf('miko:runtime'));
    expect(names.indexOf('miko:runtime')).toBeLessThan(
      names.indexOf('@minar-kotonoha/vite-plugin-bootstrap'),
    );
    expect(names.indexOf('@minar-kotonoha/vite-plugin-bootstrap')).toBeLessThan(
      names.indexOf('@minar-kotonoha/vite-plugin-index-html'),
    );
    expect(result.protectedPluginNames).toEqual(
      expect.arrayContaining([
        'miko:ssr-css',
        'miko:runtime',
        '@minar-kotonoha/vite-plugin-bootstrap',
        '@minar-kotonoha/vite-plugin-index-html',
      ]),
    );
  });

  it('omits disabled optional groups without changing the remaining order', async () => {
    const configured = project();
    configured.miko.componentsPluginOptions = false;
    configured.miko.devToolsPluginOptions = false;
    configured.miko.legacyPluginOptions = false;
    configured.miko.linterOptions = false;

    const result = await assembleMikoPlugins(configured);

    expect(result.order).toEqual([
      'miko:ssr-css',
      'miko:vue',
      'miko:runtime',
      'miko:layouts',
      'miko:unocss',
      'miko:bootstrap',
      'miko:external-resolve',
      'miko:html-entry',
    ]);
  });
});
