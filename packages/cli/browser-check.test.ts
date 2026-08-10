import { describe, expect, it } from 'vitest';
import {
  inspectBrowserObservation,
  selectBrowserCheckRoutes,
  type BrowserRouteObservation,
} from './browser-check';

function observation(overrides: Partial<BrowserRouteObservation> = {}): BrowserRouteObservation {
  return {
    route: '/',
    status: 200,
    ready: true,
    vCloak: false,
    failureCode: null,
    failedRequests: [],
    hydrationWarnings: [],
    pageErrors: [],
    ...overrides,
  };
}

describe('selectBrowserCheckRoutes', () => {
  it('checks the home route, deepest route and a missing route by default', () => {
    expect(selectBrowserCheckRoutes(['/', '/about', '/docs/', '/docs/deep/page'], false)).toEqual([
      '/',
      '/docs/deep/page',
      '/__miko_missing__',
    ]);
  });

  it('checks every deterministic route plus a missing route when requested', () => {
    expect(selectBrowserCheckRoutes(['/z', '/', '/a', '/a'], true)).toEqual([
      '/',
      '/a',
      '/z',
      '/__miko_missing__',
    ]);
  });
});

describe('inspectBrowserObservation', () => {
  it('accepts a ready page with no startup diagnostics', () => {
    expect(inspectBrowserObservation(observation())).toEqual([]);
  });

  it('classifies browser startup failures with stable issue codes', () => {
    expect(
      inspectBrowserObservation(
        observation({
          status: 500,
          ready: false,
          vCloak: true,
          failureCode: 'MIKO_BOOT_TIMEOUT',
          failedRequests: ['/assets/app.js'],
          hydrationWarnings: ['Hydration node mismatch'],
          pageErrors: ['bootstrap failed'],
        }),
      ).map((issue) => issue.code),
    ).toEqual([
      'MIKO_CHECK_DOCUMENT',
      'MIKO_CHECK_RESOURCE',
      'MIKO_CHECK_PAGE_ERROR',
      'MIKO_CHECK_HYDRATION',
      'MIKO_CHECK_BOOT_FAILURE',
      'MIKO_CHECK_NOT_READY',
      'MIKO_CHECK_CLOAK',
    ]);
  });

  it('allows a rendered application-owned 404 page', () => {
    expect(inspectBrowserObservation(observation({ status: 404 }))).toEqual([]);
  });
});
