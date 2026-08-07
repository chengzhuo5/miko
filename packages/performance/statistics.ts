import type { MetricSamples } from './types';

export function median(samples: readonly number[]): number {
  if (samples.length === 0) throw new TypeError('性能统计需要至少一个样本');
  if (samples.some(sample => !Number.isFinite(sample))) {
    throw new TypeError('性能样本必须是有限数字');
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function createMetricSamples(samples: readonly number[]): MetricSamples {
  return {
    samples: [...samples],
    median: median(samples),
  };
}
