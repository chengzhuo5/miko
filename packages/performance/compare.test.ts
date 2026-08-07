import { describe, expect, it } from 'vitest';
import type {
  BuildMetrics,
  EnvironmentFingerprint,
  MetricSamples,
  PerformanceReport,
  RuntimeMetrics,
} from './types';
import { compareReports } from './compare';

function samples(value: number): MetricSamples {
  return { samples: [value], median: value };
}

function buildMetrics(value = 100): BuildMetrics {
  return {
    coldMs: samples(value),
    warmMs: samples(value),
    peakRssBytes: samples(value),
    htmlBytes: value,
    jsBytes: value,
    cssBytes: value,
    assetCount: value,
  };
}

function runtimeMetrics(value = 100): RuntimeMetrics {
  return {
    fcpMs: samples(value),
    lcpMs: samples(value),
    hydrationMs: samples(value),
    scriptDurationMs: samples(value),
    routeNavigationMs: samples(value),
    transferBytes: samples(value),
    requestCount: samples(value),
    unvisitedRouteRequested: false,
  };
}

function environment(
  overrides: Partial<EnvironmentFingerprint> = {},
): EnvironmentFingerprint {
  return {
    platform: 'win32',
    arch: 'x64',
    cpu: 'Test CPU',
    node: '24.5.0',
    bun: '1.3.14',
    vite: '8.1.5',
    ...overrides,
  };
}

function report(
  overrides: {
    environment?: Partial<EnvironmentFingerprint>;
    small?: Partial<BuildMetrics>;
    runtime?: Partial<RuntimeMetrics>;
  } = {},
): PerformanceReport {
  return {
    schemaVersion: 1,
    environment: environment(overrides.environment),
    createdAt: '2026-08-07T00:00:00.000Z',
    commit: 'test-commit',
    workerRuntime: 'node.exe',
    build: {
      small: { ...buildMetrics(), ...overrides.small },
      medium: buildMetrics(),
      large: buildMetrics(),
      runtime: buildMetrics(),
    },
    runtime: { ...runtimeMetrics(), ...overrides.runtime },
  };
}

describe('compareReports', () => {
  it('accepts the exact five percent runtime and ten percent build boundaries', () => {
    const result = compareReports(
      report(),
      report({
        small: {
          coldMs: samples(110),
          warmMs: samples(110),
          peakRssBytes: samples(110),
          htmlBytes: 105,
          jsBytes: 105,
          cssBytes: 105,
          assetCount: 105,
        },
        runtime: {
          fcpMs: samples(105),
          lcpMs: samples(105),
          hydrationMs: samples(105),
          scriptDurationMs: samples(105),
          routeNavigationMs: samples(105),
          transferBytes: samples(105),
          requestCount: samples(105),
        },
      }),
    );

    expect(result.environmentCompatible).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('returns every metric that exceeds its budget', () => {
    const result = compareReports(
      report(),
      report({
        small: {
          warmMs: samples(111),
          jsBytes: 106,
        },
        runtime: {
          hydrationMs: samples(106),
          routeNavigationMs: samples(107),
        },
      }),
    );

    expect(result.failures.map(failure => failure.metric)).toEqual(
      expect.arrayContaining([
        'build.small.warmMs',
        'build.small.jsBytes',
        'runtime.hydrationMs',
        'runtime.routeNavigationMs',
      ]),
    );
  });

  it('compares timing only for matching platform and major-minor tool versions', () => {
    expect(
      compareReports(report(), report({ environment: { node: '24.5.9', vite: '8.1.9' } }))
        .environmentCompatible,
    ).toBe(true);

    const result = compareReports(
      report(),
      report({
        environment: { cpu: 'Different CPU' },
        small: { warmMs: samples(500), jsBytes: 106 },
      }),
    );

    expect(result.environmentCompatible).toBe(false);
    expect(result.failures).toContainEqual(
      expect.objectContaining({ metric: 'environment' }),
    );
    expect(result.failures).toContainEqual(
      expect.objectContaining({ metric: 'build.small.jsBytes' }),
    );
    expect(result.failures).not.toContainEqual(
      expect.objectContaining({ metric: 'build.small.warmMs' }),
    );
  });

  it('always fails when the first route requests an unvisited route chunk', () => {
    const result = compareReports(
      report(),
      report({
        runtime: { unvisitedRouteRequested: true },
      }),
    );

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        metric: 'runtime.unvisitedRouteRequested',
        current: true,
      }),
    );
  });
});
