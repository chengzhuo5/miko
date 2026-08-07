export type BuildFixtureName = 'small' | 'medium' | 'large' | 'runtime';

export interface EnvironmentFingerprint {
  platform: NodeJS.Platform;
  arch: string;
  cpu: string;
  node: string;
  bun: string;
  vite: string;
}

export interface MetricSamples {
  samples: number[];
  median: number;
}

export interface BuildMetrics {
  coldMs: MetricSamples;
  warmMs: MetricSamples;
  peakRssBytes: MetricSamples;
  htmlBytes: number;
  jsBytes: number;
  cssBytes: number;
  assetCount: number;
}

export interface RuntimeMetrics {
  fcpMs: MetricSamples;
  lcpMs: MetricSamples;
  hydrationMs: MetricSamples;
  scriptDurationMs: MetricSamples;
  routeNavigationMs: MetricSamples;
  transferBytes: MetricSamples;
  requestCount: MetricSamples;
  unvisitedRouteRequested: boolean;
}

export interface BuildPerformanceReport {
  schemaVersion: 1;
  environment: EnvironmentFingerprint;
  createdAt: string;
  commit: string;
  workerRuntime: string;
  build: Record<BuildFixtureName, BuildMetrics>;
}

export interface PerformanceReport extends BuildPerformanceReport {
  runtime: RuntimeMetrics;
}
