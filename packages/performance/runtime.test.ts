import { describe, expect, it } from 'vitest';
import {
  extractScriptDurationMs,
  isUnvisitedRouteScript,
  summarizeRuntimeSamples,
  type RuntimeSample,
} from './runtime';

function sample(overrides: Partial<RuntimeSample> = {}): RuntimeSample {
  return {
    fcpMs: 20,
    lcpMs: 40,
    hydrationMs: 30,
    scriptDurationMs: 10,
    routeNavigationMs: 50,
    transferBytes: 1000,
    requestCount: 10,
    requestedScripts: ['http://127.0.0.1:4173/assets/index-AAAA.js'],
    ...overrides,
  };
}

describe('runtime metric extraction', () => {
  it('converts the CDP ScriptDuration metric from seconds to milliseconds', () => {
    expect(
      extractScriptDurationMs([
        { name: 'Timestamp', value: 123 },
        { name: 'ScriptDuration', value: 0.0125 },
      ]),
    ).toBe(12.5);
    expect(() => extractScriptDurationMs([])).toThrow(/ScriptDuration/u);
  });

  it('classifies only the emitted chunk for the unvisited route', () => {
    expect(
      isUnvisitedRouteScript(
        'http://127.0.0.1:4173/assets/unvisited-D4E5F6.js',
        '/unvisited',
      ),
    ).toBe(true);
    expect(
      isUnvisitedRouteScript(
        'http://127.0.0.1:4173/assets/deep-nested-A1B2C3.js',
        '/unvisited',
      ),
    ).toBe(false);
  });

  it('keeps five raw browser samples before calculating medians', () => {
    const samples = [
      sample({ fcpMs: 50, requestCount: 15 }),
      sample({ fcpMs: 10, requestCount: 11 }),
      sample({ fcpMs: 30, requestCount: 13 }),
      sample({ fcpMs: 20, requestCount: 12 }),
      sample({
        fcpMs: 40,
        requestCount: 14,
        requestedScripts: ['http://127.0.0.1:4173/assets/unvisited-XYZ.js'],
      }),
    ];

    expect(summarizeRuntimeSamples(samples, '/unvisited')).toMatchObject({
      fcpMs: { samples: [50, 10, 30, 20, 40], median: 30 },
      requestCount: { samples: [15, 11, 13, 12, 14], median: 13 },
      unvisitedRouteRequested: true,
    });
  });
});
