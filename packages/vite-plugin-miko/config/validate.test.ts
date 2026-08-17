import { describe, expect, it } from 'vitest';
import type { PluginOption } from 'vite';
import type { ResolvedMikoConfig } from './types';
import { validateFinalConfig, validateResolvedProject } from './validate';

function project(overrides: Partial<ResolvedMikoConfig> = {}): ResolvedMikoConfig {
  return {
    env: { command: 'build', mode: 'production', root: 'D:/project' },
    configFile: null,
    viteRoot: 'D:/project',
    outDir: 'D:/project/dist',
    vite: {},
    miko: {} as ResolvedMikoConfig['miko'],
    signals: {
      root: 'D:/project',
      packageJsonPath: 'D:/project/package.json',
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
      cdn: { enabled: false, value: {}, source: 'default', reason: '' },
    } as ResolvedMikoConfig['capabilities'],
    ...overrides,
  };
}

describe('validateFinalConfig', () => {
  it('rejects a user plugin that duplicates a nested Miko core plugin', async () => {
    await expect(
      validateFinalConfig(project(), {
        plugins: [
          { name: '@minar-kotonoha/vite-plugin-index-html' },
          [{ name: '@minar-kotonoha/vite-plugin-index-html' }] satisfies PluginOption,
        ],
      }),
    ).rejects.toThrow(/核心插件/);
  });

  it('rejects optimizeDeps include and exclude conflicts', async () => {
    await expect(
      validateFinalConfig(project(), {
        optimizeDeps: { include: ['vue'], exclude: ['vue'] },
      }),
    ).rejects.toThrow(/optimizeDeps/);
  });

  it('rejects build.lib during an application build', async () => {
    await expect(
      validateFinalConfig(project(), {
        build: { lib: { entry: 'src/index.ts' } },
      }),
    ).rejects.toThrow(/build\.lib/);
  });

  it('rejects exact SSR external and noExternal conflicts', async () => {
    await expect(
      validateFinalConfig(project(), {
        ssr: {
          external: ['vue'],
          noExternal: ['vue', /^internal-/],
        },
      }),
    ).rejects.toThrow(/ssr/);
  });
});

describe('validateResolvedProject', () => {
  it('rejects CDN externalization without a direct framework dependency', () => {
    const resolved = project({
      capabilities: {
        ...project().capabilities,
        cdn: {
          enabled: true,
          value: { frameworkCDN: 'https://cdn.example.com/framework.umd.js' },
          source: 'explicit',
          reason: '',
        },
      },
    });

    expect(() => validateResolvedProject(resolved)).toThrowError(
      expect.objectContaining({ code: 'MIKO_CAPABILITY_MISSING_DEPENDENCY' }),
    );
  });

  it('rejects a whitespace-only library CSS scope', () => {
    const resolved = project();
    Object.assign(resolved.miko, { lib: { cssScope: '   ' } });

    expect(() => validateResolvedProject(resolved)).toThrowError(
      expect.objectContaining({
        code: 'MIKO_CONFIG_INVALID',
        field: 'miko.lib.cssScope',
      }),
    );
  });

  it('rejects a library CSS scope with a string PostCSS config path', () => {
    const resolved = project({
      vite: { css: { postcss: './postcss.config.cjs' } },
    });
    Object.assign(resolved.miko, { lib: { cssScope: '[data-miko-lib="fixture"]' } });

    expect(() => validateResolvedProject(resolved)).toThrowError(
      expect.objectContaining({
        code: 'MIKO_CONFIG_CONFLICT',
        field: 'vite.css.postcss',
      }),
    );
  });
});
