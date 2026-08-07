import { describe, expect, it } from 'vitest';
import { createMetricSamples, median } from './statistics';

describe('performance statistics', () => {
  it('uses the middle value or average of two middle values', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([8, 2, 6, 4])).toBe(5);
  });

  it('does not mutate the caller samples', () => {
    const samples = [9, 1, 5];

    expect(median(samples)).toBe(5);
    expect(samples).toEqual([9, 1, 5]);
  });

  it('rejects empty or non-finite samples', () => {
    expect(() => median([])).toThrow(/至少一个样本/);
    expect(() => median([1, Number.NaN])).toThrow(/有限数字/);
    expect(() => median([Number.POSITIVE_INFINITY])).toThrow(/有限数字/);
  });

  it('copies samples into a stable metric record', () => {
    const samples = [3, 1, 2];
    const result = createMetricSamples(samples);
    samples.push(4);

    expect(result).toEqual({ samples: [3, 1, 2], median: 2 });
  });
});
