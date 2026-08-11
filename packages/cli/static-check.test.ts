import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertStaticOutput, checkStaticOutput } from './static-check';

const roots: string[] = [];

async function createOutput(options: {
  base?: string;
  html?: string;
  route?: string;
  writeAssets?: boolean;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'miko-static-check-'));
  const outDir = join(root, 'dist');
  const route = options.route ?? 'index.html';
  roots.push(root);
  await mkdir(join(outDir, 'assets'), { recursive: true });
  await mkdir(join(outDir, route, '..'), { recursive: true });

  const base = options.base ?? '/cms/';
  const html =
    options.html ??
    `<!doctype html><html><head>
      <link rel="stylesheet" href="${base}assets/app.css">
      <script defer data-miko-monitor src="${base}assets/miko-white-screen-a1B2c3D4.js" vite-ignore></script>
      <script type="module" src="${base}assets/app-a1B2c3D4.js"></script>
    </head><body><div id="app" v-cloak><main>ready shell</main></div></body></html>`;
  await writeFile(join(outDir, route), html);

  if (options.writeAssets !== false) {
    await Promise.all([
      writeFile(join(outDir, 'assets/app.css'), 'body{}'),
      writeFile(join(outDir, 'assets/app-a1B2c3D4.js'), 'export {}'),
      writeFile(join(outDir, 'assets/miko-white-screen-a1B2c3D4.js'), 'void 0'),
    ]);
  }
  return { outDir, base };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('checkStaticOutput', () => {
  it('accepts root and nested SSG shells with resolvable base assets', async () => {
    const fixture = await createOutput();
    await mkdir(join(fixture.outDir, 'docs'), { recursive: true });
    await writeFile(
      join(fixture.outDir, 'docs/index.html'),
      '<!doctype html><html><body><div id="app"></div><script type="module" src="/cms/assets/app-a1B2c3D4.js"></script></body></html>',
    );

    await expect(checkStaticOutput(fixture.outDir, fixture.base)).resolves.toEqual({
      routes: ['/', '/docs/'],
      issues: [],
    });
  });

  it('reports a missing output directory and an output without HTML', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-static-check-missing-'));
    roots.push(root);

    await expect(checkStaticOutput(join(root, 'missing'), '/')).resolves.toMatchObject({
      issues: [expect.objectContaining({ code: 'MIKO_STATIC_OUTPUT_MISSING' })],
    });
    await mkdir(join(root, 'empty'));
    await expect(checkStaticOutput(join(root, 'empty'), '/')).resolves.toMatchObject({
      issues: [expect.objectContaining({ code: 'MIKO_STATIC_NO_HTML' })],
    });
  });

  it('requires one app root and a non-permanent cloak protocol', async () => {
    const missingRoot = await createOutput({
      html: '<!doctype html><html><body><main>missing root</main><script type="module" src="/cms/assets/app-a1B2c3D4.js"></script></body></html>',
    });
    const duplicateRoot = await createOutput({
      html: '<!doctype html><html><body><div id="app"></div><main id="app"></main><script type="module" src="/cms/assets/app-a1B2c3D4.js"></script></body></html>',
    });
    const permanentCloak = await createOutput({
      html: '<!doctype html><html><body><div id="app" v-cloak></div><script type="module" src="/cms/assets/app-a1B2c3D4.js"></script></body></html>',
    });

    await expect(checkStaticOutput(missingRoot.outDir, '/cms/')).resolves.toMatchObject({
      issues: [expect.objectContaining({ code: 'MIKO_STATIC_APP_ROOT' })],
    });
    await expect(checkStaticOutput(duplicateRoot.outDir, '/cms/')).resolves.toMatchObject({
      issues: [expect.objectContaining({ code: 'MIKO_STATIC_APP_ROOT' })],
    });
    await expect(checkStaticOutput(permanentCloak.outDir, '/cms/')).resolves.toMatchObject({
      issues: [expect.objectContaining({ code: 'MIKO_STATIC_BOOT_PROTOCOL' })],
    });
  });

  it('skips application-protocol checks for public passthrough static pages', async () => {
    const fixture = await createOutput();
    await mkdir(join(fixture.outDir, 'perf-tab'), { recursive: true });
    await writeFile(
      join(fixture.outDir, 'perf-tab/index.html'),
      '<!doctype html><html><body><div id="root"></div><script>render()</script></body></html>',
    );

    await expect(checkStaticOutput(fixture.outDir, '/cms/')).resolves.toEqual({
      routes: ['/', '/perf-tab/'],
      issues: [],
    });
  });

  it('reports missing local assets and resource paths outside the configured base', async () => {
    const missingAsset = await createOutput({ writeAssets: false });
    const wrongBase = await createOutput({
      html: '<!doctype html><html><body><div id="app"></div><script type="module" src="/wrong/assets/app.js"></script></body></html>',
    });

    const missing = await checkStaticOutput(missingAsset.outDir, '/cms/');
    expect(missing.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MIKO_STATIC_ASSET_MISSING' }),
      ]),
    );
    await expect(checkStaticOutput(wrongBase.outDir, '/cms/')).resolves.toMatchObject({
      issues: [expect.objectContaining({ code: 'MIKO_STATIC_BASE_MISMATCH' })],
    });
  });

  it('rejects emitted Vite error pages and exposes build exit code five', async () => {
    const fixture = await createOutput({
      html: '<!doctype html><html><body><div id="app"></div><vite-error-overlay></vite-error-overlay></body></html>',
    });

    await expect(assertStaticOutput(fixture.outDir, '/cms/')).rejects.toMatchObject({
      code: 'MIKO_BUILD_STATIC_CHECK',
      exitCode: 5,
    });
  });
});
