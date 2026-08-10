import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginOption } from 'vite';
import type { ResolvedMikoConfig } from '../config/types';

const optionalModules = vi.hoisted(() => ({
  components: vi.fn<() => void>(),
  componentResolvers: vi.fn<() => void>(),
  vantResolver: vi.fn<() => void>(),
  unoCSS: vi.fn<() => void>(),
  legacy: vi.fn<() => void>(),
  devtools: vi.fn<() => void>(),
}));

vi.mock('unplugin-vue-components/vite', () => {
  optionalModules.components();
  return { default: () => ({ name: 'unplugin-vue-components' }) };
});
vi.mock('unplugin-vue-components/resolvers', () => {
  optionalModules.componentResolvers();
  return { ElementPlusResolver: () => ({ type: 'element-plus' }) };
});
vi.mock('@vant/auto-import-resolver', () => {
  optionalModules.vantResolver();
  return { VantResolver: () => ({ type: 'vant' }) };
});
vi.mock('unocss/vite', () => {
  optionalModules.unoCSS();
  return { default: () => ({ name: 'unocss:config' }) };
});
vi.mock('@vitejs/plugin-legacy', () => {
  optionalModules.legacy();
  return { default: () => ({ name: 'vite:legacy' }) };
});
vi.mock('vite-plugin-vue-devtools', () => {
  optionalModules.devtools();
  return { default: () => ({ name: 'vite-plugin-vue-devtools' }) };
});

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
    capabilities: {
      whiteScreen: {
        enabled: true,
        value: { timeout: 8000 },
        source: 'builtin',
        reason: 'test fixture',
      },
    } as ResolvedMikoConfig['capabilities'],
  };
}

function flattenNames(options: PluginOption[]): string[] {
  return options.flatMap((option) => {
    if (!option) return [];
    if (Array.isArray(option)) return flattenNames(option);
    return [option.name];
  });
}

async function assembleMikoPlugins(configured: ResolvedMikoConfig) {
  return (await import('./index')).assembleMikoPlugins(configured);
}

describe('assembleMikoPlugins', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const tracker of Object.values(optionalModules)) tracker.mockClear();
  });

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

  it('imports optional integrations only inside their capability factories', async () => {
    const [conventionsSource, integrationsSource] = await Promise.all([
      readFile(new URL('./conventions.ts', import.meta.url), 'utf8'),
      readFile(new URL('./integrations.ts', import.meta.url), 'utf8'),
    ]);

    for (const specifier of [
      '@vant/auto-import-resolver',
      'unocss/vite',
      'unplugin-vue-components/vite',
      'unplugin-vue-components/resolvers',
    ]) {
      expect(conventionsSource).not.toMatch(
        new RegExp(`^import .*['"]${specifier.replaceAll('/', '\\/')}['"]`, 'mu'),
      );
      expect(conventionsSource).toContain(`import('${specifier}')`);
    }
    for (const specifier of ['@vitejs/plugin-legacy', 'vite-plugin-vue-devtools']) {
      expect(integrationsSource).not.toMatch(
        new RegExp(`^import .*['"]${specifier.replaceAll('/', '\\/')}['"]`, 'mu'),
      );
      expect(integrationsSource).toContain(`import('${specifier}')`);
    }
  });

  it('omits disabled optional groups without changing the remaining order', async () => {
    const configured = project();
    configured.miko.componentsPluginOptions = false;
    configured.miko.unoCSSPluginOptions = false;
    configured.miko.devToolsPluginOptions = false;
    configured.miko.legacyPluginOptions = false;

    const result = await assembleMikoPlugins(configured);

    expect(result.order).toEqual([
      'miko:ssr-css',
      'miko:vue',
      'miko:runtime',
      'miko:layouts',
      'miko:unocss',
      'miko:linter',
      'miko:bootstrap',
      'miko:external-resolve',
      'miko:html-entry',
    ]);
    expect(optionalModules.components).not.toHaveBeenCalled();
    expect(optionalModules.componentResolvers).not.toHaveBeenCalled();
    expect(optionalModules.vantResolver).not.toHaveBeenCalled();
    expect(optionalModules.unoCSS).not.toHaveBeenCalled();
    expect(optionalModules.legacy).not.toHaveBeenCalled();
    expect(optionalModules.devtools).not.toHaveBeenCalled();
  });

  it('adds the capability restart watcher last for dev only', async () => {
    const configured = project();
    configured.env.command = 'dev';

    const result = await assembleMikoPlugins(configured);

    expect(result.order.at(-1)).toBe('miko:restart-on-capability-change');
    expect(flattenNames(result.plugins)).toContain('miko:restart-on-capability-change');
  });
});
