import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApplication } from './build';
import { runBrowserCheck } from './browser-check';
import type { CommandContext } from './context';
import { runCheck } from './check';

const roots: string[] = [];
const workspaceNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));

type FixtureMode = 'bootstrap' | 'client-only' | 'hydration' | 'normal' | 'timeout';

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function bootstrapSource(mode: FixtureMode): string {
  if (mode === 'bootstrap') {
    return `export default () => {
  throw new Error('BOOTSTRAP_FAULT')
}
`;
  }
  if (mode === 'timeout') {
    return `export default () => new Promise(() => {})
`;
  }
  return `export default () => {}
`;
}

function pageSource(mode: FixtureMode): string {
  if (mode === 'hydration') {
    return `<script setup lang="ts">
const message = import.meta.env.SSR ? 'server' : 'client'
if (!import.meta.env.SSR) console.warn('Hydration node mismatch')
</script>
<template><main id="hydration-page">{{ message }}</main></template>
`;
  }
  return '<template><main id="fixture-page">Fixture page</main></template>\n';
}

function clientOnlyPageSource(): string {
  return `<route lang="json5">
{ meta: { clientOnly: true } }
</route>
<script setup lang="ts">
const path = window.location.pathname
</script>
<template><main id="client-only-page">{{ path }}</main></template>
`;
}

async function createFixture(mode: FixtureMode): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'miko-check-fault-'));
  roots.push(root);
  await mkdir(resolve(root, 'pages'));
  await symlink(
    workspaceNodeModules,
    resolve(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await Promise.all([
    writeFile(
      resolve(root, 'package.json'),
      `${JSON.stringify({ name: 'miko-check-fault', private: true, type: 'module' }, null, 2)}\n`,
    ),
    writeFile(
      resolve(root, 'tsconfig.json'),
      `${JSON.stringify(
        {
          include: ['**/*.ts', '**/*.vue'],
          compilerOptions: {
            jsx: 'preserve',
            jsxImportSource: 'vue',
            lib: ['ESNext', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            target: 'ESNext',
            types: ['vite/client'],
          },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      resolve(root, 'miko.config.ts'),
      `export default {
  miko: {
    rendering: '${mode === 'client-only' || mode === 'hydration' ? 'ssg' : 'spa'}',
    layoutsPluginOptions: false,
    componentsPluginOptions: false,
    unoCSSPluginOptions: false,
    legacyPluginOptions: false,
    linterOptions: false,
    externalOptions: false,
    janusOptions: false,
    whiteScreen: { timeout: 1000 },
  },
  vite: { publicDir: false },
}
`,
    ),
    writeFile(resolve(root, 'index.ts'), bootstrapSource(mode)),
    writeFile(resolve(root, 'pages/index.vue'), pageSource(mode)),
    ...(mode === 'client-only'
      ? [writeFile(resolve(root, 'pages/client-only.vue'), clientOnlyPageSource())]
      : []),
  ]);
  return root;
}

function checkContext(root: string, allRoutes = false): CommandContext {
  return {
    allRoutes,
    command: 'check',
    json: false,
    lib: false,
    mode: 'production',
    root,
  };
}

describe('miko check browser integration', () => {
  it('accepts a normal empty application and a ClientOnly route', async () => {
    await expect(runCheck(checkContext(await createFixture('normal')))).resolves.toBeUndefined();
    await expect(
      runCheck(checkContext(await createFixture('client-only'), true)),
    ).resolves.toBeUndefined();
  }, 90_000);

  it('fails with browser exit code six when project bootstrap throws', async () => {
    await expect(runCheck(checkContext(await createFixture('bootstrap')))).rejects.toMatchObject({
      code: 'MIKO_CHECK_BROWSER',
      exitCode: 6,
      message: expect.stringMatching(/MIKO_CHECK_(?:PAGE_ERROR|BOOT_FAILURE|NOT_READY)/u),
    });
  }, 60_000);

  it('fails when the boot monitor times out before the application becomes ready', async () => {
    await expect(runCheck(checkContext(await createFixture('timeout')))).rejects.toMatchObject({
      code: 'MIKO_CHECK_BROWSER',
      exitCode: 6,
      message: expect.stringMatching(/MIKO_CHECK_(?:BOOT_FAILURE|NOT_READY|CLOAK)/u),
    });
  }, 60_000);

  it('fails when hydration reports a mismatch even if the application reaches ready', async () => {
    await expect(runCheck(checkContext(await createFixture('hydration')))).rejects.toMatchObject({
      code: 'MIKO_CHECK_BROWSER',
      exitCode: 6,
      message: expect.stringMatching(/MIKO_CHECK_HYDRATION/u),
    });
  }, 60_000);

  it('fails when the built application entry cannot be loaded', async () => {
    const root = await createFixture('normal');
    const outDir = await mkdtemp(resolve(tmpdir(), 'miko-check-output-'));
    roots.push(outDir);
    const result = await buildApplication(checkContext(root), { outputOverride: outDir });
    const manifest = JSON.parse(await readFile(join(outDir, '.miko/assets.json'), 'utf8')) as {
      assets: { file: string }[];
    };
    const applicationEntry = manifest.assets.find(
      ({ file }) => file.endsWith('.js') && !file.includes('miko-white-screen-'),
    );
    expect(applicationEntry).toBeDefined();
    await rm(join(outDir, applicationEntry!.file));

    await expect(runBrowserCheck(result, false)).rejects.toMatchObject({
      code: 'MIKO_CHECK_BROWSER',
      exitCode: 6,
      message: expect.stringMatching(/MIKO_CHECK_RESOURCE/u),
    });
  }, 60_000);
});
