import { describe, expect, it } from 'vitest';
import type { MikoConfigEnv, MikoOptions } from '../config/types';
import type { ProjectSignals } from './types';
import { resolveCapabilities } from './resolve';

function raw(overrides: MikoOptions = {}): MikoOptions {
  return overrides;
}

function env(overrides: Partial<MikoConfigEnv> = {}): MikoConfigEnv {
  return {
    command: 'build',
    mode: 'production',
    root: 'D:/project',
    ...overrides,
  };
}

function signals(overrides: Partial<ProjectSignals> = {}): ProjectSignals {
  return {
    root: 'D:/project',
    packageJsonPath: 'D:/project/package.json',
    dependencies: [],
    browserslist: [],
    browserslistConfigFile: null,
    conventions: {
      components: false,
      layouts: false,
      unoConfig: null,
      janusSchemas: null,
      lintConfig: null,
    },
    watchedFiles: [],
    watchedDirectories: [],
    ...overrides,
  };
}

describe('resolveCapabilities', () => {
  it('uses modern defaults without optional dependencies', () => {
    const result = resolveCapabilities(raw(), signals(), env());

    expect(result.legacy).toMatchObject({ enabled: false, source: 'default' });
    expect(result.cdn).toMatchObject({ enabled: false, source: 'default' });
    expect(result.devtools).toMatchObject({ enabled: false, source: 'command' });
    expect(result.unhead).toMatchObject({ enabled: true, source: 'builtin' });
    expect(result.whiteScreen).toMatchObject({
      enabled: true,
      source: 'builtin',
      value: { timeout: 8000 },
    });
  });

  it('allows white-screen protection to be disabled or override its timeout', () => {
    expect(
      resolveCapabilities(raw({ whiteScreen: false }), signals(), env()).whiteScreen,
    ).toMatchObject({
      enabled: false,
      source: 'explicit',
      value: { timeout: 8000 },
    });
    expect(
      resolveCapabilities(
        raw({ whiteScreen: { timeout: 3500 } }),
        signals(),
        env(),
      ).whiteScreen,
    ).toMatchObject({
      enabled: true,
      source: 'explicit',
      value: { timeout: 3500 },
    });
  });

  it('enables devtools only for dev unless explicitly overridden', () => {
    expect(resolveCapabilities(raw(), signals(), env({ command: 'dev' })).devtools).toMatchObject({
      enabled: true,
      source: 'command',
    });
    expect(resolveCapabilities(raw(), signals(), env({ command: 'build' })).devtools).toMatchObject(
      {
        enabled: false,
        source: 'command',
      },
    );
    expect(
      resolveCapabilities(
        raw({ devToolsPluginOptions: true }),
        signals(),
        env({ command: 'build' }),
      ).devtools,
    ).toMatchObject({
      enabled: true,
      source: 'explicit',
    });
  });

  it('auto-detects one UI library and rejects an ambiguous pair', () => {
    expect(
      resolveCapabilities(raw(), signals({ dependencies: ['vant'] }), env()).uiLibrary,
    ).toMatchObject({
      enabled: true,
      source: 'dependency',
      value: 'vant',
    });

    expect(() =>
      resolveCapabilities(raw(), signals({ dependencies: ['element-plus', 'vant'] }), env()),
    ).toThrowError(expect.objectContaining({ code: 'MIKO_CAPABILITY_CONFLICT' }));
  });

  it('lets an explicit UI library resolve an otherwise ambiguous pair', () => {
    expect(
      resolveCapabilities(
        raw({ uiLibrary: 'element-plus' }),
        signals({ dependencies: ['element-plus', 'vant'] }),
        env(),
      ).uiLibrary,
    ).toMatchObject({
      enabled: true,
      source: 'explicit',
      value: 'element-plus',
    });
  });

  it.each([
    'ie 11',
    'op_mini all',
    'android 4.4.3-4.4.4',
    'and_chr 79',
    'and_ff 77',
    'edge 79',
    'firefox 77',
    'ios_saf 12.2-12.5',
    'safari 12.1',
  ])('enables legacy for the old normalized target %s', (target) => {
    expect(
      resolveCapabilities(raw(), signals({ browserslist: [target] }), env()).legacy,
    ).toMatchObject({
      enabled: true,
      source: 'convention',
    });
  });

  it('keeps modern targets modern and honors explicit false', () => {
    expect(
      resolveCapabilities(
        raw(),
        signals({
          browserslist: ['and_chr 80', 'edge 80', 'firefox 78', 'ios_saf 13.0', 'safari 13'],
        }),
        env(),
      ).legacy.enabled,
    ).toBe(false);
    expect(
      resolveCapabilities(
        raw({ legacyPluginOptions: false }),
        signals({ browserslist: ['ie 11'] }),
        env(),
      ).legacy,
    ).toMatchObject({
      enabled: false,
      source: 'explicit',
    });
  });

  it('auto-enables Pinia from a direct dependency', () => {
    expect(
      resolveCapabilities(raw(), signals({ dependencies: ['pinia'] }), env()).pinia,
    ).toMatchObject({
      enabled: true,
      source: 'dependency',
    });
  });

  it.each([
    ['pinia', { pinia: true }],
    ['@janus/unplugin', { janusOptions: true }],
    ['vant', { uiLibrary: 'vant' }],
  ] as const)('fails when explicitly enabled %s is missing', (dependency, options) => {
    expect(() => resolveCapabilities(raw(options), signals(), env())).toThrowError(
      expect.objectContaining({
        code: 'MIKO_CAPABILITY_MISSING_DEPENDENCY',
        message: expect.stringContaining(dependency),
      }),
    );
  });

  it('enables Janus automatically only when dependency and schemas both exist', () => {
    expect(
      resolveCapabilities(
        raw(),
        signals({
          dependencies: ['@janus/unplugin'],
          conventions: {
            ...signals().conventions,
            janusSchemas: 'D:/project/schemas',
          },
        }),
        env(),
      ).janus,
    ).toMatchObject({
      enabled: true,
      source: 'convention',
      value: { schemasDir: 'D:/project/schemas' },
    });
  });

  it('keeps CDN explicit-only while preserving non-CDN external options', () => {
    expect(resolveCapabilities(raw(), signals(), env()).cdn.enabled).toBe(false);
    expect(
      resolveCapabilities(
        raw({ externalOptions: { optimizeDepsExclude: ['vant'] } }),
        signals(),
        env(),
      ).cdn,
    ).toMatchObject({
      enabled: false,
      source: 'explicit',
      value: { optimizeDepsExclude: ['vant'] },
    });
    expect(
      resolveCapabilities(
        raw({
          externalOptions: {
            frameworkCDN: 'https://cdn.example.com/framework.umd.js',
          },
        }),
        signals(),
        env(),
      ).cdn,
    ).toMatchObject({
      enabled: true,
      source: 'explicit',
    });
  });

  it('rejects disabling the ViteSSG-owned head runtime', () => {
    expect(() => resolveCapabilities(raw({ unhead: false }), signals(), env())).toThrowError(
      expect.objectContaining({ code: 'MIKO_CAPABILITY_CONFLICT' }),
    );
  });
});
