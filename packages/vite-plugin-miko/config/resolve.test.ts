import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { UserConfig } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCapabilities } from '../capabilities';
import type { ProjectSignals } from '../capabilities/types';
import { resolveMikoProject } from '../index';
import { resolveMikoConfig as resolveMikoConfigRaw } from './index';
import type { LoadedMikoConfig, MikoConfigEnv } from './types';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const env = {
  command: 'build' as const,
  mode: 'production',
  root: 'D:/projects/demo',
};

function signals(root: string): ProjectSignals {
  return {
    root,
    packageJsonPath: resolve(root, 'package.json'),
    dependencies: ['@janus/unplugin'],
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
  };
}

function resolveMikoConfig(loaded: LoadedMikoConfig, environment: MikoConfigEnv, template: string) {
  const projectSignals = signals(environment.root);
  const capabilities = resolveCapabilities(loaded.config.miko ?? {}, projectSignals, environment);
  return resolveMikoConfigRaw(loaded, environment, template, capabilities, projectSignals);
}

describe('resolveMikoConfig', () => {
  it('returns project signals and capability provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-resolved-project-'));
    roots.push(root);
    await writeFile(
      resolve(root, 'package.json'),
      `${JSON.stringify({ dependencies: { pinia: '^4.0.0' } }, null, 2)}\n`,
    );

    const project = await resolveMikoProject({
      command: 'build',
      mode: 'production',
      root,
    });

    expect(project.signals.packageJsonPath).toBe(resolve(root, 'package.json'));
    expect(project.capabilities.pinia).toMatchObject({
      enabled: true,
      source: 'dependency',
    });
  });

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

  it('treats true tri-state plugin options as enabled defaults', () => {
    const result = resolveMikoConfig(
      {
        config: {
          miko: {
            componentsPluginOptions: true,
            janusOptions: true,
            layoutsPluginOptions: true,
            legacyPluginOptions: true,
            linterOptions: true,
            unoCSSPluginOptions: true,
          },
        } as never,
        configFile: null,
      },
      env,
      'D:/packages/miko/template',
    );

    expect(result.miko.componentsPluginOptions).toMatchObject({
      dirs: [resolve(env.root, 'components')],
    });
    expect(result.miko.layoutsPluginOptions).toEqual({});
    expect(result.miko.legacyPluginOptions).toEqual({});
    expect(result.miko.linterOptions).toMatchObject({ eslint: true, oxlint: true });
    expect(result.miko.unoCSSPluginOptions).toMatchObject({ configFile: false });
    expect(result.miko.janusOptions).toEqual({});
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
