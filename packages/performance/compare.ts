import type { BuildFixtureName, EnvironmentFingerprint, PerformanceReport } from './types';

export interface MetricComparison {
  metric: string;
  baseline: number | boolean | string;
  current: number | boolean | string;
  budgetRatio: number;
  regressionRatio: number;
  passed: boolean;
  skipped: boolean;
}

export interface ComparisonResult {
  environmentCompatible: boolean;
  comparisons: MetricComparison[];
  failures: MetricComparison[];
}

const BUILD_TIMING_BUDGET = 0.1;
const RUNTIME_BUDGET = 0.05;
const BUILD_FIXTURES: BuildFixtureName[] = ['small', 'medium', 'large', 'runtime'];

function majorMinor(version: string): string {
  return version.match(/^\d+\.\d+/u)?.[0] ?? version;
}

function environmentsMatch(
  baseline: EnvironmentFingerprint,
  current: EnvironmentFingerprint,
): boolean {
  return (
    baseline.platform === current.platform &&
    baseline.arch === current.arch &&
    baseline.cpu === current.cpu &&
    majorMinor(baseline.node) === majorMinor(current.node) &&
    majorMinor(baseline.bun) === majorMinor(current.bun) &&
    majorMinor(baseline.vite) === majorMinor(current.vite)
  );
}

function regressionRatio(baseline: number, current: number): number {
  if (baseline === 0) return current <= 0 ? 0 : Number.POSITIVE_INFINITY;
  return (current - baseline) / baseline;
}

function compareNumber(
  comparisons: MetricComparison[],
  metric: string,
  baseline: number,
  current: number,
  budgetRatio: number,
  skipped = false,
): void {
  const regression = regressionRatio(baseline, current);
  comparisons.push({
    metric,
    baseline,
    current,
    budgetRatio,
    regressionRatio: regression,
    passed: skipped || current <= baseline * (1 + budgetRatio) + Number.EPSILON * baseline,
    skipped,
  });
}

export function compareReports(
  baseline: PerformanceReport,
  current: PerformanceReport,
): ComparisonResult {
  const environmentCompatible = environmentsMatch(baseline.environment, current.environment);
  const comparisons: MetricComparison[] = [];

  if (!environmentCompatible) {
    comparisons.push({
      metric: 'environment',
      baseline: JSON.stringify(baseline.environment),
      current: JSON.stringify(current.environment),
      budgetRatio: 0,
      regressionRatio: Number.POSITIVE_INFINITY,
      passed: false,
      skipped: false,
    });
  }

  for (const fixture of BUILD_FIXTURES) {
    const before = baseline.build[fixture];
    const after = current.build[fixture];

    for (const key of ['coldMs', 'warmMs', 'peakRssBytes'] as const) {
      compareNumber(
        comparisons,
        `build.${fixture}.${key}`,
        before[key].median,
        after[key].median,
        BUILD_TIMING_BUDGET,
        !environmentCompatible,
      );
    }
    for (const key of ['htmlBytes', 'jsBytes', 'cssBytes', 'assetCount'] as const) {
      compareNumber(
        comparisons,
        `build.${fixture}.${key}`,
        before[key],
        after[key],
        RUNTIME_BUDGET,
      );
    }
  }

  for (const key of [
    'fcpMs',
    'lcpMs',
    'hydrationMs',
    'scriptDurationMs',
    'routeNavigationMs',
  ] as const) {
    compareNumber(
      comparisons,
      `runtime.${key}`,
      baseline.runtime[key].median,
      current.runtime[key].median,
      RUNTIME_BUDGET,
      !environmentCompatible,
    );
  }
  for (const key of ['transferBytes', 'requestCount'] as const) {
    compareNumber(
      comparisons,
      `runtime.${key}`,
      baseline.runtime[key].median,
      current.runtime[key].median,
      RUNTIME_BUDGET,
    );
  }

  comparisons.push({
    metric: 'runtime.unvisitedRouteRequested',
    baseline: baseline.runtime.unvisitedRouteRequested,
    current: current.runtime.unvisitedRouteRequested,
    budgetRatio: 0,
    regressionRatio: current.runtime.unvisitedRouteRequested ? Number.POSITIVE_INFINITY : 0,
    passed: !current.runtime.unvisitedRouteRequested,
    skipped: false,
  });

  return {
    environmentCompatible,
    comparisons,
    failures: comparisons.filter(comparison => !comparison.passed),
  };
}
