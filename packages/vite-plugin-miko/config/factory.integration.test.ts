import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
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

function resolveMikoConfig(loaded: LoadedMikoConfig, env: MikoConfigEnv, template: string) {
  const signals: ProjectSignals = {
    root: env.root,
    packageJsonPath: null,
    dependencies: [],
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

  it('runs project bootstrap exactly once in a real browser', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-spa-browser-'));
    const template = resolve(root, 'template');
    const pagesDir = resolve(root, 'pages');
    roots.push(root);

    await linkWorkspaceNodeModules(root);
    await mkdir(resolve(template, 'layouts'), { recursive: true });
    await mkdir(pagesDir, { recursive: true });
    await writeFile(
      resolve(template, 'main.ts'),
      await readFile(resolve(getBundledTemplate(), 'main.ts'), 'utf8'),
    );
    await writeFile(
      resolve(template, 'index.html'),
      '<!doctype html><html><body><div id="app"></div></body></html>',
    );
    await writeFile(resolve(template, 'App.vue'), '<template><RouterView /></template>');
    await writeFile(
      resolve(template, 'layouts/default.vue'),
      '<template><RouterView /></template>',
    );
    await writeFile(
      resolve(pagesDir, 'home.vue'),
      '<template><main id="browser-page-marker">BROWSER_PAGE_MARKER</main></template>',
    );
    await writeFile(
      resolve(root, 'index.ts'),
      `export default () => {
        const state = globalThis as typeof globalThis & { __mikoBootstrapCount?: number }
        state.__mikoBootstrapCount = (state.__mikoBootstrapCount ?? 0) + 1
      }`,
    );

    const env = { command: 'build' as const, mode: 'production', root };
    const project = resolveMikoConfig(
      {
        configFile: null,
        config: {
          miko: {
            rendering: 'spa',
            template,
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

    expect(await page.locator('#browser-page-marker').textContent()).toBe('BROWSER_PAGE_MARKER');
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
  });
});
