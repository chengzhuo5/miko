import { createServer } from 'node:net';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import type { GeneratedFixture } from './fixtures';
import { createMetricSamples } from './statistics';
import type { RuntimeMetrics } from './types';

export interface RuntimeSample {
  fcpMs: number;
  lcpMs: number;
  hydrationMs: number;
  scriptDurationMs: number;
  routeNavigationMs: number;
  transferBytes: number;
  requestCount: number;
  whiteScreenMonitorRequestCount: number;
  requestedScripts: string[];
}

export interface CdpMetric {
  name: string;
  value: number;
}

export interface RuntimeMeasurementOptions {
  samples: number;
  onSampleStart?: (sample: number, total: number) => void;
}

type RuntimeFixture = Pick<GeneratedFixture, 'root' | 'unvisitedRoute'> & {
  deepRouteChunkName: string;
};

export function extractScriptDurationMs(metrics: CdpMetric[]): number {
  const value = metrics.find((metric) => metric.name === 'ScriptDuration')?.value;
  if (!Number.isFinite(value) || value === undefined || value < 0) {
    throw new Error('CDP Performance metrics did not include a finite ScriptDuration');
  }
  return value * 1000;
}

export function isChunkScript(url: string, chunkName: string): boolean {
  const normalizedChunkName = chunkName.toLowerCase();
  if (!normalizedChunkName) return false;
  let fileName: string;
  try {
    fileName = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '').toLowerCase();
  } catch {
    fileName = decodeURIComponent(url.split(/[/?#]/u).at(-1) ?? '').toLowerCase();
  }
  return (
    fileName.endsWith('.js') &&
    (fileName === `${normalizedChunkName}.js` || fileName.startsWith(`${normalizedChunkName}-`))
  );
}

export function isRouteScript(url: string, route: string): boolean {
  return isChunkScript(url, route.split('/').filter(Boolean).join('-'));
}

export function isUnvisitedRouteScript(url: string, unvisitedRoute: string): boolean {
  return isRouteScript(url, unvisitedRoute);
}

export function isWhiteScreenMonitorScript(url: string): boolean {
  try {
    return /^miko-white-screen-[^.]+\.js$/u.test(new URL(url).pathname.split('/').at(-1) ?? '');
  } catch {
    return /^miko-white-screen-[^.]+\.js(?:[?#].*)?$/u.test(url.split('/').at(-1) ?? '');
  }
}

export function assertRouteRequestTopology(
  initialScripts: string[],
  navigatedScripts: string[],
  deepRouteChunkName: string,
  unvisitedRoute: string,
): void {
  if (initialScripts.some((url) => isRouteScript(url, unvisitedRoute))) {
    throw new Error(`Initial route eagerly requested unvisited route chunk: ${unvisitedRoute}`);
  }
  if (!navigatedScripts.some((url) => isChunkScript(url, deepRouteChunkName))) {
    throw new Error(`Navigation did not request the deep route chunk: ${deepRouteChunkName}`);
  }
}

export function summarizeRuntimeSamples(
  samples: RuntimeSample[],
  unvisitedRoute: string,
): RuntimeMetrics {
  return {
    fcpMs: createMetricSamples(samples.map((sample) => sample.fcpMs)),
    lcpMs: createMetricSamples(samples.map((sample) => sample.lcpMs)),
    hydrationMs: createMetricSamples(samples.map((sample) => sample.hydrationMs)),
    scriptDurationMs: createMetricSamples(samples.map((sample) => sample.scriptDurationMs)),
    routeNavigationMs: createMetricSamples(samples.map((sample) => sample.routeNavigationMs)),
    transferBytes: createMetricSamples(samples.map((sample) => sample.transferBytes)),
    requestCount: createMetricSamples(samples.map((sample) => sample.requestCount)),
    whiteScreenMonitorRequestCount: createMetricSamples(
      samples.map((sample) => sample.whiteScreenMonitorRequestCount),
    ),
    unvisitedRouteRequested: samples.some((sample) =>
      sample.requestedScripts.some((url) => isUnvisitedRouteScript(url, unvisitedRoute)),
    ),
  };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to reserve a local preview port');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return address.port;
}

async function closeBrowser(browser: Browser | undefined): Promise<void> {
  if (browser) await browser.close();
}

async function closePreview(server: PreviewServer | undefined): Promise<void> {
  if (server) await server.close();
}

async function installBrowserObservers(page: Page): Promise<void> {
  await page.addInitScript({
    content: `(() => {
    const state = {
      lcpMs: 0,
      hydrationMs: 0,
    }
    window.__MIKO_PERF__ = state

    const recordHydration = () => {
      const app = document.querySelector('#app')
      if (
        state.hydrationMs === 0 &&
        app &&
        !app.hasAttribute('v-cloak') &&
        app.childNodes.length > 0
      ) {
        state.hydrationMs = performance.now()
      }
    }
    new MutationObserver(recordHydration).observe(document, {
      attributes: true,
      attributeFilter: ['v-cloak'],
      childList: true,
      subtree: true,
    })
    document.addEventListener('DOMContentLoaded', recordHydration, { once: true })

    new PerformanceObserver(list => {
      const entry = list.getEntries().at(-1)
      if (entry) state.lcpMs = entry.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })()`,
  });
}

function requirePositiveMetric(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Browser runtime metric ${name} must be a positive finite number`);
  }
  return value;
}

async function readInitialBrowserMetrics(
  page: Page,
): Promise<Pick<RuntimeSample, 'fcpMs' | 'lcpMs' | 'hydrationMs'>> {
  await page.waitForFunction('() => (window.__MIKO_PERF__?.hydrationMs ?? 0) > 0');
  await page.waitForTimeout(100);

  const metrics = await page.evaluate<{
    fcpMs: number;
    lcpMs: number;
    hydrationMs: number;
  }>(`(() => {
    const state = window.__MIKO_PERF__
    const fcp = performance.getEntriesByName('first-contentful-paint').at(0)?.startTime ?? 0
    return {
      fcpMs: fcp,
      lcpMs: state?.lcpMs ?? 0,
      hydrationMs: state?.hydrationMs ?? 0,
    }
  })()`);

  return {
    fcpMs: requirePositiveMetric('fcpMs', metrics.fcpMs),
    lcpMs: requirePositiveMetric('lcpMs', metrics.lcpMs),
    hydrationMs: requirePositiveMetric('hydrationMs', metrics.hydrationMs),
  };
}

async function measureRouteNavigation(page: Page): Promise<number> {
  const startedAt = await page.evaluate<number>('performance.now()');
  await page.locator('#deep-route-link').click();
  await page.waitForSelector('#deep-route-marker');
  await page.waitForLoadState('networkidle');
  const finishedAt = await page.evaluate<number>('performance.now()');
  return requirePositiveMetric('routeNavigationMs', finishedAt - startedAt);
}

async function measureRuntimeSample(fixture: RuntimeFixture): Promise<RuntimeSample> {
  const port = await reservePort();
  let server: PreviewServer | undefined;
  let browser: Browser | undefined;
  let cdp: CDPSession | undefined;

  try {
    server = await preview({
      root: fixture.root,
      configFile: false,
      logLevel: 'silent',
      build: { outDir: 'dist' },
      preview: {
        host: '127.0.0.1',
        port,
        strictPort: true,
      },
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const requestedScripts: string[] = [];
    const pageErrors: string[] = [];
    let requestCount = 0;
    let transferBytes = 0;
    let whiteScreenMonitorRequestCount = 0;

    page.on('request', (request) => {
      if (!request.url().startsWith('http')) return;
      requestCount++;
      if (request.resourceType() === 'script') {
        requestedScripts.push(request.url());
        if (isWhiteScreenMonitorScript(request.url())) whiteScreenMonitorRequestCount++;
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    await installBrowserObservers(page);

    cdp = await page.context().newCDPSession(page);
    cdp.on('Network.loadingFinished', (event) => {
      transferBytes += event.encodedDataLength;
    });
    await Promise.all([cdp.send('Network.enable'), cdp.send('Performance.enable')]);

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#runtime-home');
    const initialMetrics = await readInitialBrowserMetrics(page);
    const initialScripts = [...requestedScripts];
    const routeNavigationMs = await measureRouteNavigation(page);
    assertRouteRequestTopology(
      initialScripts,
      requestedScripts,
      fixture.deepRouteChunkName,
      fixture.unvisitedRoute,
    );
    const performanceMetrics = await cdp.send('Performance.getMetrics');
    const scriptDurationMs = extractScriptDurationMs(performanceMetrics.metrics);

    if (pageErrors.length > 0) {
      throw new Error(`Runtime fixture emitted page errors:\n${pageErrors.join('\n')}`);
    }

    return {
      ...initialMetrics,
      scriptDurationMs: requirePositiveMetric('scriptDurationMs', scriptDurationMs),
      routeNavigationMs,
      transferBytes: requirePositiveMetric('transferBytes', transferBytes),
      requestCount: requirePositiveMetric('requestCount', requestCount),
      whiteScreenMonitorRequestCount,
      requestedScripts,
    };
  } finally {
    if (cdp) await cdp.detach().catch(() => undefined);
    await closeBrowser(browser);
    await closePreview(server);
  }
}

export async function measureRuntimeFixture(
  fixture: RuntimeFixture,
  options: RuntimeMeasurementOptions,
): Promise<RuntimeMetrics> {
  if (!Number.isInteger(options.samples) || options.samples <= 0) {
    throw new TypeError('samples 必须是正整数');
  }

  const samples: RuntimeSample[] = [];
  for (let index = 0; index < options.samples; index++) {
    options.onSampleStart?.(index + 1, options.samples);
    samples.push(await measureRuntimeSample(fixture));
  }
  return summarizeRuntimeSamples(samples, fixture.unvisitedRoute);
}
