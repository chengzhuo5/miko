import { resolve } from 'node:path';
import type { UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { resolveMikoConfig } from './index';

const env = {
  command: 'build' as const,
  mode: 'production',
  root: 'D:/projects/demo',
};

describe('resolveMikoConfig', () => {
  it('uses SSG and conventional paths by default', () => {
    const result = resolveMikoConfig(
      { config: {}, configFile: null },
      env,
      'D:/packages/miko/template',
    );

    expect(result.miko.rendering).toBe('ssg');
    expect(result.miko.pagesDir).toBe(resolve(env.root, 'pages'));
    expect(result.outDir).toBe(resolve(env.root, 'dist'));
    expect(result.miko.legacyPluginOptions).toBe(false);
    expect(result.miko.externalOptions).toBe(false);
  });

  it('uses vite.root for Vite-relative conventions without changing config lookup root', () => {
    const result = resolveMikoConfig(
      {
        config: {
          miko: {
            entry: 'src/main.ts',
            pagesDir: 'src/pages',
            rendering: 'spa',
          },
          vite: { root: 'app', build: { outDir: 'output' } },
        },
        configFile: null,
      },
      env,
      'D:/packages/miko/template',
    );

    expect(result.env.root).toBe(env.root);
    expect(result.viteRoot).toBe(resolve(env.root, 'app'));
    expect(result.vite.root).toBe(resolve(env.root, 'app'));
    expect(result.vite.build?.outDir).toBe(resolve(env.root, 'app/output'));
    expect(result.miko.entry).toBe(resolve(env.root, 'app/src/main.ts'));
    expect(result.miko.pagesDir).toBe(resolve(env.root, 'app/src/pages'));
    expect(result.outDir).toBe(resolve(env.root, 'app/output'));
    expect(result.miko.rendering).toBe('spa');
  });

  it('deep-merges built-in SSG options with user options', () => {
    const result = resolveMikoConfig(
      {
        config: {
          miko: {
            ssgOptions: {
              dirStyle: 'nested',
            },
          },
        },
        configFile: null,
      },
      env,
      'D:/packages/miko/template',
    );

    expect(result.miko.ssgOptions.dirStyle).toBe('nested');
    expect(result.miko.ssgOptions.beastiesOptions).toEqual({ external: false });
  });

  it('rejects application input overrides owned by Miko', () => {
    expect(() =>
      resolveMikoConfig(
        {
          config: {
            vite: {
              input: 'src/custom.html',
            } as UserConfig & { input: string },
          },
          configFile: null,
        },
        env,
        'D:/packages/miko/template',
      ),
    ).toThrow(/vite\.input/);

    expect(() =>
      resolveMikoConfig(
        {
          config: {
            vite: {
              build: {
                rollupOptions: {
                  input: 'src/custom.html',
                },
              },
            },
          },
          configFile: null,
        },
        env,
        'D:/packages/miko/template',
      ),
    ).toThrow(/build\.rollupOptions\.input/);

    expect(() =>
      resolveMikoConfig(
        {
          config: {
            vite: {
              build: {
                rolldownOptions: {
                  input: 'src/custom.html',
                },
              },
            },
          },
          configFile: null,
        },
        env,
        'D:/packages/miko/template',
      ),
    ).toThrow(/build\.rolldownOptions\.input/);
  });
});
