import { describe, expect, it, vi } from 'vitest';
import { createMikoViteConfig } from '../index';
import type { ResolvedMikoConfig } from './types';

const mocks = vi.hoisted(() => ({
  externalPlugin: vi.fn<(root: string, enableCDN?: boolean, additionalExternals?: string[]) => []>(
    () => [],
  ),
}));

vi.mock('@minar-kotonoha/vite-plugin-index-html', () => ({
  indexHTMLPlugin: async () => [],
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
      bootstrapOptions: { entryFile: 'index.ts' },
      externalOptions: false,
      devOptions: { bundledDev: false },
      janusOptions: false,
    },
  };
}

describe('createMikoViteConfig', () => {
  it('preserves user Vite config while adding Miko defaults', async () => {
    const config = await createMikoViteConfig(project());

    expect(mocks.externalPlugin).toHaveBeenCalledWith('D:/project', false, []);
    expect(config.root).toBe('D:/project');
    expect(config.input).toBe('D:/project/index.html');
    expect(config.cacheDir).toBe('D:/project/node_modules/.vite');
    expect(config.base).toBe('/cms/');
    expect(config.build).toMatchObject({
      outDir: 'D:/project/dist',
      sourcemap: true,
    });
    expect(config.resolve?.alias).toEqual([{ find: '@', replacement: 'D:/project' }]);
    expect(config.define).toMatchObject({
      'import.meta.env.VITE_MIKO_SPA': JSON.stringify('true'),
    });
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
