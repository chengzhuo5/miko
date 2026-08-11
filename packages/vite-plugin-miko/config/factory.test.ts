import { describe, expect, it, vi } from 'vitest';
import { createMikoViteConfig } from '../index';
import type { ResolvedMikoConfig } from './types';

const mocks = vi.hoisted(() => ({
  externalPlugin: vi.fn<(root: string, enableCDN?: boolean, additionalExternals?: string[]) => []>(
    () => [],
  ),
  indexHTMLPlugin: vi.fn(async () => []),
}));

vi.mock('@minar-kotonoha/vite-plugin-index-html', () => ({
  indexHTMLPlugin: mocks.indexHTMLPlugin,
}));
vi.mock('@minar-kotonoha/vite-plugin-external', () => ({
  externalPlugin: mocks.externalPlugin,
}));

function project(): ResolvedMikoConfig {
  return {
    env: { command: 'build', mode: 'production', root: 'D:/project' },
    configFile: null,
    viteRoot: 'D:/project',
    outDir: 'D:/project/dist',
    vite: {
      base: '/cms/',
      build: { sourcemap: true },
    },
    miko: {
      rendering: 'spa',
      template: 'D:/template',
      entry: 'D:/template/main.ts',
      pagesDir: 'D:/project/pages',
      uiLibrary: 'vant',
      layout: 'flexible',
      vuePluginOptions: {},
      vueJsxPluginOptions: {},
      routerPluginOptions: {},
      layoutsPluginOptions: {},
      componentsPluginOptions: false,
      unoCSSPluginOptions: false,
      legacyPluginOptions: false,
      ssgOptions: {},
      linterOptions: false,
      devToolsPluginOptions: false,
      bootstrapOptions: { entryFile: 'index.ts' },
      externalOptions: false,
      devOptions: { bundledDev: false },
      pinia: false,
      unhead: true,
      janusOptions: false,
      whiteScreenOptions: { timeout: 8000 },
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
      uiLibrary: { enabled: true, value: 'vant', source: 'explicit', reason: '' },
      legacy: { enabled: false, value: {}, source: 'explicit', reason: '' },
      cdn: { enabled: false, value: {}, source: 'explicit', reason: '' },
      devtools: { enabled: false, value: {}, source: 'command', reason: '' },
      layouts: { enabled: true, value: {}, source: 'builtin', reason: '' },
      components: { enabled: false, value: {}, source: 'explicit', reason: '' },
      unoCSS: { enabled: false, value: {}, source: 'explicit', reason: '' },
      linter: { enabled: false, value: {}, source: 'explicit', reason: '' },
      pinia: { enabled: false, value: false, source: 'default', reason: '' },
      unhead: { enabled: true, value: true, source: 'builtin', reason: '' },
      janus: { enabled: false, value: {}, source: 'explicit', reason: '' },
      whiteScreen: {
        enabled: true,
        value: { timeout: 8000 },
        source: 'builtin',
        reason: '',
      },
    },
  };
}

describe('createMikoViteConfig', () => {
  it('preserves user Vite config while adding Miko defaults', async () => {
    const config = await createMikoViteConfig(project());

    expect(mocks.externalPlugin).toHaveBeenCalledWith('D:/project', false, []);
    expect(mocks.indexHTMLPlugin).toHaveBeenCalledWith({
      entry: 'D:/template/main.ts',
      root: 'D:/project',
      template: 'D:/template',
      whiteScreen: {
        development: false,
        enabled: true,
        timeout: 8000,
      },
    });
    expect(config.root).toBe('D:/project');
    expect(config.input).toBe('D:/project/index.html');
    expect(config.cacheDir).toBe('D:/project/node_modules/.vite');
    expect(config.base).toBe('/cms/');
    expect(config.build).toMatchObject({
      outDir: 'D:/project/dist',
      sourcemap: true,
    });
    expect(config.resolve?.alias).toEqual([{ find: '@', replacement: 'D:/project' }]);
    expect(config.resolve?.dedupe).toEqual(['vue', 'vue-router', 'pinia']);
    expect(config.define).toMatchObject({
      'import.meta.env.VITE_MIKO_SPA': JSON.stringify('true'),
    });
  });

  it('binds the dev server to IPv4 by default', async () => {
    const devProject = project();
    devProject.env.command = 'dev';

    const config = await createMikoViteConfig(devProject);

    expect(config.server?.host).toBe('127.0.0.1');
  });

  it('allows user Vite server host to override the dev default', async () => {
    const devProject = project();
    devProject.env.command = 'dev';
    devProject.vite.server = { host: '0.0.0.0' };

    const config = await createMikoViteConfig(devProject);

    expect(config.server?.host).toBe('0.0.0.0');
  });

  it('wires every external option into the generated Vite config', async () => {
    const configured = project();
    configured.miko.externalOptions = {
      frameworkCDN: 'https://cdn.example.com/framework.umd.js',
      additionalExternals: ['custom-runtime'],
      optimizeDepsExclude: ['custom-runtime'],
      ssrNoExternal: ['custom-runtime'],
    };

    const config = await createMikoViteConfig(configured);

    expect(mocks.externalPlugin).toHaveBeenLastCalledWith('D:/project', true, ['custom-runtime']);
    expect(config.define).toMatchObject({
      'import.meta.env.VITE_FRAMEWORK_CDN': JSON.stringify(
        'https://cdn.example.com/framework.umd.js',
      ),
    });
    expect(config.optimizeDeps?.exclude).toContain('custom-runtime');
    expect(config.ssr?.noExternal).toContain('custom-runtime');
  });
});
