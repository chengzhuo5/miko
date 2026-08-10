import { describe, expect, it, vi } from 'vitest';
import type {
  BuildMetrics,
  EnvironmentFingerprint,
  MetricSamples,
  PerformanceReport,
  RuntimeMetrics,
} from './types';
import { runPerformanceCli, type PerformanceCliDependencies } from './index';

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

function environment(overrides: Partial<EnvironmentFingerprint> = {}): EnvironmentFingerprint {
  return {
    platform: 'win32',
    arch: 'x64',
    cpu: 'Test CPU',
    node: '25.7.0',
    bun: '1.3.14',
    vite: '8.1.5',
    ...overrides,
  };
}

function report(
  overrides: {
    environment?: Partial<EnvironmentFingerprint>;
    runtime?: Partial<RuntimeMetrics>;
  } = {},
): PerformanceReport {
  return {
    schemaVersion: 1,
    environment: environment(overrides.environment),
    createdAt: '2026-08-10T00:00:00.000Z',
    commit: 'test-commit',
    workerRuntime: 'node.exe',
    build: {
      small: buildMetrics(),
      medium: buildMetrics(),
      large: buildMetrics(),
      runtime: buildMetrics(),
    },
    runtime: { ...runtimeMetrics(), ...overrides.runtime },
  };
}

function dependencies(
  baseline: PerformanceReport,
  current: PerformanceReport,
): {
  dependencies: PerformanceCliDependencies;
  output: string[];
  measure: ReturnType<typeof vi.fn<() => Promise<PerformanceReport>>>;
  writeReport: ReturnType<typeof vi.fn<(path: string, report: PerformanceReport) => Promise<void>>>;
} {
  const output: string[] = [];
  const measure = vi.fn<() => Promise<PerformanceReport>>(async () => current);
  const writeReport = vi.fn<(path: string, report: PerformanceReport) => Promise<void>>(
    async () => {},
  );
  return {
    output,
    measure,
    writeReport,
    dependencies: {
      measure,
      readReport: vi.fn<(path: string) => Promise<PerformanceReport>>(async () => baseline),
      writeReport,
      output: (message) => output.push(message),
    },
  };
}

describe('runPerformanceCli check', () => {
  it('measures fresh results, writes them, and prints every passing budget', async () => {
    const baseline = report();
    const current = report({
      runtime: {
        hydrationMs: samples(90),
      },
    });
    const state = dependencies(baseline, current);

    await runPerformanceCli(['check'], state.dependencies);

    expect(state.measure).toHaveBeenCalledOnce();
    expect(state.writeReport).toHaveBeenCalledWith(expect.stringContaining('results'), current);
    expect(state.output).toContain('Miko Performance');
    expect(state.output).toContain('Environment: compatible');
    expect(
      state.output.some((line) => line.includes('runtime.hydrationMs') && line.includes('PASS')),
    ).toBe(true);
    expect(
      state.output.some(
        (line) =>
          line.includes('runtime.unvisitedRouteRequested') &&
          line.includes('false') &&
          line.includes('PASS'),
      ),
    ).toBe(true);
  });

  it('prints all comparisons and fails when a budget or environment check fails', async () => {
    const current = report({
      environment: { cpu: 'Different CPU' },
      runtime: {
        fcpMs: samples(106),
        transferBytes: samples(106),
      },
    });
    const state = dependencies(report(), current);

    await expect(runPerformanceCli(['check'], state.dependencies)).rejects.toThrow(
      /performance budget/u,
    );
    expect(state.output).toContain('Environment: incompatible');
    expect(
      state.output.some((line) => line.includes('runtime.fcpMs') && line.includes('SKIP')),
    ).toBe(true);
    expect(
      state.output.some((line) => line.includes('runtime.transferBytes') && line.includes('FAIL')),
    ).toBe(true);
    expect(state.output.at(-1)).toMatch(/failed/u);
  });
});
