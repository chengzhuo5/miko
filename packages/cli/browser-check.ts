import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preview } from 'vite';
import type { PreviewServer } from 'vite';
import type { ApplicationBuildResult } from './build';
import { createPreviewConfig } from './preview-config';
import { MikoCliError } from './errors';

export interface BrowserCheckIssue {
  route: string;
  code: string;
  message: string;
}

export interface BrowserRouteObservation {
  route: string;
  status: number | null;
  ready: boolean;
  vCloak: boolean;
  failureCode: string | null;
  failedRequests: string[];
  hydrationWarnings: string[];
  pageErrors: string[];
}

interface RouteManifest {
  routes: string[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function routeDepth(route: string): number {
  return route.split('/').filter(Boolean).length;
}

export function selectBrowserCheckRoutes(routes: string[], allRoutes: boolean): string[] {
  const unique = [...new Set(routes)].sort(compareText);
  const selected = allRoutes
    ? unique
    : [
        unique.includes('/') ? '/' : unique[0],
        [...unique].sort(
          (left, right) =>
            routeDepth(right) - routeDepth(left) ||
            right.length - left.length ||
            compareText(left, right),
        )[0],
      ];
  return [
    ...new Set(selected.filter((route): route is string => typeof route === 'string')),
    '/__miko_missing__',
  ];
}

function browserIssue(
  observation: BrowserRouteObservation,
  code: string,
  message: string,
): BrowserCheckIssue {
  return { route: observation.route, code, message };
}

export function inspectBrowserObservation(
  observation: BrowserRouteObservation,
): BrowserCheckIssue[] {
  const issues: BrowserCheckIssue[] = [];
  if (observation.status === null || (observation.status >= 400 && observation.status !== 404)) {
    issues.push(
      browserIssue(
        observation,
        'MIKO_CHECK_DOCUMENT',
        `页面响应状态异常：${String(observation.status)}`,
      ),
    );
  }
  if (observation.failedRequests.length > 0) {
    issues.push(
      browserIssue(
        observation,
        'MIKO_CHECK_RESOURCE',
        `关键资源失败：${observation.failedRequests.join(', ')}`,
      ),
    );
  }
  if (observation.pageErrors.length > 0) {
    issues.push(
      browserIssue(
        observation,
        'MIKO_CHECK_PAGE_ERROR',
        `页面异常：${observation.pageErrors.join(' | ')}`,
      ),
    );
  }
  if (observation.hydrationWarnings.length > 0) {
    issues.push(
      browserIssue(
        observation,
        'MIKO_CHECK_HYDRATION',
        `Hydration 警告：${observation.hydrationWarnings.join(' | ')}`,
      ),
    );
  }
  if (observation.failureCode) {
    issues.push(
      browserIssue(
        observation,
        'MIKO_CHECK_BOOT_FAILURE',
        `启动监控失败：${observation.failureCode}`,
      ),
    );
  }
  if (!observation.ready) {
    issues.push(browserIssue(observation, 'MIKO_CHECK_NOT_READY', '页面没有进入 ready 状态'));
  }
  if (observation.vCloak) {
    issues.push(browserIssue(observation, 'MIKO_CHECK_CLOAK', '页面仍保留 v-cloak'));
  }
  return issues;
}

function routeUrl(origin: string, base: string, route: string): string {
  const basePath = new URL(base, origin).pathname;
  const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const suffix = route === '/' ? '' : route.replace(/^\/+/u, '');
  return new URL(`${prefix}${suffix}`, origin).href;
}

function isCriticalResource(resourceType: string): boolean {
  return resourceType === 'script' || resourceType === 'stylesheet';
}

async function observeRoute(
  page: Page,
  origin: string,
  base: string,
  route: string,
  timeout: number,
): Promise<BrowserRouteObservation> {
  const failedRequests: string[] = [];
  const hydrationWarnings: string[] = [];
  const pageErrors: string[] = [];
  page.on('requestfailed', (request) => {
    if (isCriticalResource(request.resourceType())) failedRequests.push(request.url());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && isCriticalResource(response.request().resourceType())) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('console', (message) => {
    if (
      (message.type() === 'warning' || message.type() === 'error') &&
      /hydration|mismatch/iu.test(message.text())
    ) {
      hydrationWarnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let status: number | null = null;
  try {
    status =
      (
        await page.goto(routeUrl(origin, base, route), {
          waitUntil: 'domcontentloaded',
          timeout,
        })
      )?.status() ?? null;
  } catch (error) {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    await page.waitForFunction(
      () => {
        const browserGlobal = globalThis as unknown as {
          document: {
            getElementById(id: string): {
              dataset: Record<string, string | undefined>;
            } | null;
          };
        };
        const root = browserGlobal.document.getElementById('app');
        return root?.dataset.mikoReady === 'true' || Boolean(root?.dataset.mikoFailed);
      },
      undefined,
      { timeout },
    );
  } catch {}

  const state = await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      __MIKO_BOOT__?: { warnings?: string[] };
      document: {
        getElementById(id: string): {
          dataset: Record<string, string | undefined>;
          hasAttribute(name: string): boolean;
        } | null;
      };
    };
    const root = browserGlobal.document.getElementById('app');
    const boot = browserGlobal.__MIKO_BOOT__;
    return {
      failureCode: root?.dataset.mikoFailed ?? null,
      hydrationWarnings: [...(boot?.warnings ?? [])],
      ready: root?.dataset.mikoReady === 'true',
      vCloak: root?.hasAttribute('v-cloak') ?? false,
    };
  });

  return {
    route,
    status,
    failedRequests: [...new Set(failedRequests)],
    hydrationWarnings: [...new Set([...hydrationWarnings, ...state.hydrationWarnings])],
    pageErrors,
    failureCode: state.failureCode,
    ready: state.ready,
    vCloak: state.vCloak,
  };
}

async function readRoutes(outDir: string): Promise<string[]> {
  const manifest = JSON.parse(
    await readFile(join(outDir, '.miko/routes.json'), 'utf8'),
  ) as RouteManifest;
  return manifest.routes;
}

export async function runBrowserCheck(
  result: ApplicationBuildResult,
  allRoutes: boolean,
): Promise<void> {
  const routes = selectBrowserCheckRoutes(await readRoutes(result.outDir), allRoutes);
  const previewConfig = await createPreviewConfig(result.project);
  let server: PreviewServer | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    server = await preview({
      ...previewConfig,
      logLevel: 'silent',
      preview: {
        ...previewConfig.preview,
        host: '127.0.0.1',
        port: 0,
        strictPort: true,
      },
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') {
      throw new MikoCliError('MIKO_CHECK_BROWSER', 'Preview 没有提供 TCP 地址', 6);
    }

    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${address.port}`;
    const base = String(result.config.base ?? '/');
    const timeout =
      (result.project.miko.whiteScreenOptions && result.project.miko.whiteScreenOptions.timeout) ||
      8000;
    const observations: BrowserRouteObservation[] = [];
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
      try {
        observations.push(await observeRoute(page, origin, base, route, timeout + 2000));
      } finally {
        await page.close();
      }
    }

    const issues = observations.flatMap(inspectBrowserObservation);
    if (issues.length > 0) {
      const summary = issues
        .map((issue) => `${issue.route}: [${issue.code}] ${issue.message}`)
        .join('\n');
      throw new MikoCliError(
        'MIKO_CHECK_BROWSER',
        `浏览器启动检查失败（${issues.length} 项）\n${summary}`,
        6,
      );
    }
  } finally {
    await browser?.close();
    await server?.close();
  }
}
