import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build as viteSsgBuild } from '@minar-kotonoha/vite-ssg/node';
import { build, preview } from 'vite';
import type { PreviewServer } from 'vite';
import { resolveCapabilities } from '../capabilities';
import type { ProjectSignals } from '../capabilities/types';
import { createMikoViteConfig, getBundledTemplate } from '../index';
import { resolveMikoConfig as resolveMikoConfigRaw } from './resolve';
import type { LoadedMikoConfig, MikoConfigEnv, MikoOptions } from './types';

const roots: string[] = [];
const browsers: BrowserHandle[] = [];
const previewServers: PreviewServer[] = [];
const workspaceNodeModules = fileURLToPath(new URL('../../../node_modules', import.meta.url));

interface BrowserPage {
  on(event: 'console', listener: (message: { text(): string }) => void): void;
  on(event: 'pageerror', listener: (error: Error) => void): void;
  goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  locator(selector: string): {
    count(): Promise<number>;
    getAttribute(name: string): Promise<string | null>;
    textContent(): Promise<string | null>;
  };
  evaluate<T>(callback: () => T): Promise<T>;
}

interface BrowserHandle {
  close(): Promise<void>;
  newPage(): Promise<BrowserPage>;
}

async function loadChromium() {
  const require = createRequire(new URL('../../../app/package.json', import.meta.url));
  const playwrightUrl = pathToFileURL(require.resolve('@playwright/test')).href;
  const playwright = (await import(playwrightUrl)) as {
    chromium: {
      launch(options: { headless: boolean }): Promise<BrowserHandle>;
    };
  };
  return playwright.chromium;
}

async function linkWorkspaceNodeModules(root: string): Promise<void> {
  await symlink(
    workspaceNodeModules,
    resolve(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
}

function resolveMikoConfig(
  loaded: LoadedMikoConfig,
  env: MikoConfigEnv,
  template: string,
  dependencies: string[] = [],
) {
  const signals: ProjectSignals = {
    root: env.root,
    packageJsonPath: null,
    dependencies,
    browserslist: [],
    browserslistConfigFile: null,
    conventions: {
      components: false,
      janusSchemas: null,
      layouts: false,
      lintConfig: null,
      unoConfig: null,
    },
    watchedDirectories: [],
    watchedFiles: [],
  };
  return resolveMikoConfigRaw(
    loaded,
    env,
    template,
    resolveCapabilities(loaded.config.miko ?? {}, signals, env),
    signals,
  );
}

afterEach(async () => {
  await Promise.all(browsers.splice(0).map((browser) => browser.close()));
  await Promise.all(previewServers.splice(0).map((server) => server.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function buildSpa(
  options: Pick<MikoOptions, 'layoutsPluginOptions' | 'unoCSSPluginOptions'>,
) {
  const root = await mkdtemp(join(tmpdir(), 'miko-spa-'));
  const pagesDir = resolve(root, 'pages');
  roots.push(root);

  await linkWorkspaceNodeModules(root);
  await writeFile(resolve(root, 'package.json'), '{"type":"module"}');
  await mkdir(pagesDir, { recursive: true });
  await writeFile(
    resolve(pagesDir, 'index.vue'),
    `<script setup>globalThis.__mikoSpaRuntime = 'SPA_RUNTIME_MARKER'</script><template><main>SPA</main></template>`,
  );

  const env = { command: 'build' as const, mode: 'production', root };
  const project = resolveMikoConfig(
    {
      configFile: null,
      config: {
        miko: {
          rendering: 'spa',
          componentsPluginOptions: false,
          legacyPluginOptions: false,
          linterOptions: false,
          externalOptions: false,
          janusOptions: false,
          ...options,
        },
        vite: {
          publicDir: false,
        },
      },
    },
    env,
    getBundledTemplate(),
  );
  const config = await createMikoViteConfig(project);
  const result = await build({
    ...config,
    configFile: false,
    logLevel: 'silent',
    build: {
      ...config.build,
      write: false,
      minify: false,
    },
  });
  const builds = Array.isArray(result) ? result : [result];
  return builds
    .flatMap((buildResult) => ('output' in buildResult ? buildResult.output : []))
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
}

async function buildSsgFixture() {
  const root = await mkdtemp(join(tmpdir(), 'miko-ssg-state-'));
  const pagesDir = resolve(root, 'pages');
  roots.push(root);

  await linkWorkspaceNodeModules(root);
  await writeFile(resolve(root, 'package.json'), '{"type":"module"}');
  await mkdir(pagesDir, { recursive: true });
  await writeFile(
    resolve(pagesDir, 'index.vue'),
    `<script setup>
import { useHead } from '@unhead/vue'
useHead({ title: 'Empty State', meta: [{ name: 'description', content: 'empty-state' }] })
</script>
<template><main id="empty-state-page">EMPTY_STATE_PAGE</main></template>`,
  );
  await writeFile(
    resolve(pagesDir, 'state.vue'),
    `<script setup>
import { defineStore } from 'pinia'
import { useHead } from '@unhead/vue'
const useCart = defineStore('cart', { state: () => ({ count: 0 }) })
const cart = useCart()
if (import.meta.env.SSR) cart.count = 7
useHead({ title: 'Pinia State', meta: [{ name: 'description', content: 'pinia-state' }] })
</script>
<template><main id="pinia-count">{{ cart.count }}</main></template>`,
  );

  const env = { command: 'build' as const, mode: 'production', root };
  const project = resolveMikoConfig(
    {
      configFile: null,
      config: {
        miko: {
          rendering: 'ssg',
          pinia: true,
          layoutsPluginOptions: false,
          componentsPluginOptions: false,
          unoCSSPluginOptions: false,
          legacyPluginOptions: false,
          linterOptions: false,
          externalOptions: false,
          janusOptions: false,
          ssgOptions: {
            onPageRendered(_route, html) {
              return html.replace('<body', '<body data-user-page-hook="true"');
            },
          },
        },
        vite: {
          publicDir: false,
        },
      },
    },
    env,
    getBundledTemplate(),
    ['pinia'],
  );
  const config = await createMikoViteConfig(project);
  await viteSsgBuild(undefined, {
    ...config,
    configFile: false,
    logLevel: 'silent',
  });

  const emptyHtml = await readFile(resolve(project.outDir, 'index.html'), 'utf8');
  const stateHtml = await readFile(resolve(project.outDir, 'state.html'), 'utf8');
  const assetFiles = (await readdir(resolve(project.outDir, 'assets'))).sort();
  const productionSource = [
    emptyHtml,
    stateHtml,
    ...(await Promise.all(
      assetFiles
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFile(resolve(project.outDir, 'assets', file), 'utf8')),
    )),
  ].join('\n');

  return {
    root,
    outDir: project.outDir,
    config,
    emptyHtml,
    stateHtml,
    assetFiles,
    productionSource,
  };
}

describe('createMikoViteConfig SPA build', () => {
  it('keeps the SPA application in the runtime chunks', async () => {
    const code = await buildSpa({
      layoutsPluginOptions: {},
      unoCSSPluginOptions: {},
    });

    expect(code).toContain('SPA_RUNTIME_MARKER');
  });

  it('builds when layouts and UnoCSS are disabled', async () => {
    const code = await buildSpa({
      layoutsPluginOptions: false,
      unoCSSPluginOptions: false,
    });

    expect(code).toContain('SPA_RUNTIME_MARKER');
  });

  it('runs project bootstrap exactly once without mounting ClientOnly for a normal SPA route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-spa-browser-'));
    const pagesDir = resolve(root, 'pages');
    roots.push(root);

    await linkWorkspaceNodeModules(root);
    await mkdir(pagesDir, { recursive: true });
    await writeFile(
      resolve(pagesDir, 'home.vue'),
      '<template><main id="browser-page-marker">BROWSER_PAGE_MARKER</main></template>',
    );
    await writeFile(
      resolve(root, 'index.ts'),
      `export default (app) => {
        const state = globalThis as typeof globalThis & {
          __mikoBootstrapCount?: number
          __mikoClientOnlySetupCount?: number
        }
        state.__mikoBootstrapCount = (state.__mikoBootstrapCount ?? 0) + 1
        const clientOnly = app.component('ClientOnly')
        if (clientOnly && typeof clientOnly.setup === 'function') {
          const setup = clientOnly.setup
          clientOnly.setup = (...args) => {
            state.__mikoClientOnlySetupCount = (state.__mikoClientOnlySetupCount ?? 0) + 1
            return setup(...args)
          }
        }
      }`,
    );

    const env = { command: 'build' as const, mode: 'production', root };
    const project = resolveMikoConfig(
      {
        configFile: null,
        config: {
          miko: {
            rendering: 'spa',
            layoutsPluginOptions: false,
            componentsPluginOptions: false,
            unoCSSPluginOptions: false,
            legacyPluginOptions: false,
            linterOptions: false,
            externalOptions: false,
            janusOptions: false,
          },
          vite: {
            publicDir: false,
          },
        },
      },
      env,
      getBundledTemplate(),
    );
    const config = await createMikoViteConfig(project);
    await build({
      ...config,
      configFile: false,
      logLevel: 'silent',
      build: {
        ...config.build,
        minify: false,
      },
    });

    const server = await preview({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir: project.outDir,
      },
      preview: {
        host: '127.0.0.1',
        port: 0,
        strictPort: true,
      },
    });
    previewServers.push(server);

    const address = server.httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Vite preview did not expose a TCP address');
    }

    const chromium = await loadChromium();
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const page = await browser.newPage();
    const browserDiagnostics: string[] = [];
    page.on('console', (message) => browserDiagnostics.push(`console: ${message.text()}`));
    page.on('pageerror', (error) => browserDiagnostics.push(`pageerror: ${error.message}`));
    await page.goto(`http://127.0.0.1:${address.port}/home`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    try {
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (
                  globalThis as typeof globalThis & {
                    __mikoBootstrapCount?: number;
                  }
                ).__mikoBootstrapCount ?? 0,
            ),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0);
    } catch (error) {
      throw new Error(browserDiagnostics.join('\n') || 'bootstrap did not run', {
        cause: error,
      });
    }
    await page.waitForSelector('#browser-page-marker');
    await page.waitForSelector('#app[data-miko-ready="true"]');

    expect(await page.locator('#browser-page-marker').textContent()).toBe('BROWSER_PAGE_MARKER');
    expect(await page.locator('#app').getAttribute('v-cloak')).toBeNull();
    expect(await page.locator('[data-miko-failure]').count()).toBe(0);
    expect(
      await page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __mikoBootstrapCount?: number;
            }
          ).__mikoBootstrapCount,
      ),
    ).toBe(1);
    expect(
      await page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __mikoClientOnlySetupCount?: number;
            }
          ).__mikoClientOnlySetupCount ?? 0,
      ),
    ).toBe(0);
  });
});

describe('createMikoViteConfig SSG state output', () => {
  it('removes empty state while preserving Pinia hydration and head output', async () => {
    const { root, outDir, config, emptyHtml, stateHtml, assetFiles, productionSource } =
      await buildSsgFixture();

    expect(emptyHtml).not.toContain('window.__INITIAL_STATE__');
    expect(emptyHtml).toContain('data-user-page-hook="true"');
    expect(emptyHtml.match(/<title>Empty State<\/title>/g)).toHaveLength(1);
    expect(emptyHtml.match(/content="empty-state"/g)).toHaveLength(1);

    expect(stateHtml).toContain('window.__INITIAL_STATE__');
    expect(stateHtml).toContain('\\"cart\\":{\\"count\\":7}');
    expect(stateHtml).toContain('data-user-page-hook="true"');
    expect(stateHtml.match(/<title>Pinia State<\/title>/g)).toHaveLength(1);
    expect(stateHtml.match(/content="pinia-state"/g)).toHaveLength(1);
    expect(assetFiles.filter((file) => /\.(?:css|js)$/u.test(file))).toSatisfy(
      (files: string[]) =>
        files.length > 0 && files.every((file) => /-[\dA-Z_a-z-]{8}\.(?:css|js)$/u.test(file)),
    );
    expect(productionSource).not.toMatch(
      /framework\.umd\.js|legacy-polyfills|MIKO_PERF_RESULT|polyfills-legacy|vite-plugin-vue-devtools/u,
    );
    expect(config.build?.rolldownOptions?.output).toBeUndefined();
    expect(config.build?.rollupOptions?.output).toBeUndefined();

    const server = await preview({
      root,
      configFile: false,
      logLevel: 'silent',
      build: { outDir },
      preview: {
        host: '127.0.0.1',
        port: 0,
        strictPort: true,
      },
    });
    previewServers.push(server);
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Vite preview did not expose a TCP address');
    }

    const chromium = await loadChromium();
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/state.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.waitForSelector('#pinia-count');

    expect(await page.locator('#pinia-count').textContent()).toBe('7');
    expect(pageErrors).toEqual([]);
  }, 60_000);
});
