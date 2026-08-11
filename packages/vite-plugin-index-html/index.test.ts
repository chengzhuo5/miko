import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { indexHTMLPlugin } from './index';

const roots: string[] = [];
const servers: ViteDevServer[] = [];

async function createFixture(
  userHtml?: string,
  whiteScreen?: { enabled: boolean; timeout: number; development: boolean },
) {
  const root = await mkdtemp(join(tmpdir(), 'miko-html-'));
  const template = resolve(root, 'template');
  const entry = resolve(root, 'entry.ts');
  roots.push(root);

  await mkdir(template, { recursive: true });
  await writeFile(
    resolve(template, 'index.html'),
    '<!doctype html><html><head><meta name="fallback-shell"></head><body><div id="app"></div></body></html>',
  );
  await writeFile(
    entry,
    `document.querySelector('#app')!.textContent = 'INDEX_HTML_RUNTIME_MARKER'`,
  );
  if (userHtml) await writeFile(resolve(root, 'index.html'), userHtml);

  return { root, template, entry, whiteScreen };
}

async function compile(fixture: Awaited<ReturnType<typeof createFixture>>) {
  let resolvedRoot = '';
  const result = await build({
    root: fixture.root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [
      await indexHTMLPlugin(fixture),
      {
        name: 'test:capture-root',
        configResolved(config) {
          resolvedRoot = config.root;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
    },
  });

  const builds = Array.isArray(result) ? result : [result];
  const output = builds.flatMap((buildResult) =>
    'output' in buildResult ? buildResult.output : [],
  );
  const htmlAsset = output.find((item) => item.fileName === 'index.html') as
    | { source: string | Uint8Array }
    | undefined;
  const source = htmlAsset?.source;

  return {
    assets: output.filter((item) => item.type === 'asset'),
    chunks: output.filter((item) => item.type === 'chunk'),
    code: output
      .filter((item) => item.type === 'chunk')
      .map((item) => ('code' in item ? item.code : ''))
      .join('\n'),
    html: typeof source === 'string' ? source : source ? new TextDecoder().decode(source) : '',
    resolvedRoot,
  };
}

async function startDevServer(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [await indexHTMLPlugin(fixture)],
    server: {
      host: '127.0.0.1',
      port: 0,
    },
  });
  await server.listen();
  servers.push(server);

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Vite dev server did not expose a TCP address');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    async request(path: string, accept?: string) {
      return fetch(`${origin}${path}`, {
        headers: accept ? { accept } : undefined,
      });
    },
    async requestHtml() {
      const response = await fetch(`${origin}/deep/route`, {
        headers: {
          accept: 'text/html',
        },
      });
      expect(response.status).toBe(200);
      return response.text();
    },
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('indexHTMLPlugin', () => {
  it('builds from the in-memory fallback without writing or replacing root/index.html', async () => {
    const fixture = await createFixture();
    const result = await compile(fixture);

    expect(resolve(result.resolvedRoot)).toBe(resolve(fixture.root));
    expect(existsSync(resolve(fixture.root, 'index.html'))).toBe(false);
    expect(result.html).toContain('fallback-shell');
    expect(result.chunks).toHaveLength(1);
    expect(result.code).toContain('INDEX_HTML_RUNTIME_MARKER');
  });

  it('bundles inline styles in the in-memory fallback without intercepting html-proxy ids', async () => {
    const fixture = await createFixture(
      undefined,
      undefined,
    );
    await writeFile(
      resolve(fixture.template, 'index.html'),
      [
        '<!doctype html><html><head><style>#app { color: red; }</style></head>',
        '<body><div id="app"></div></body></html>',
      ].join(''),
    );
    const result = await compile(fixture);

    expect(result.html).toContain('#app { color: red');
    expect(result.code).toContain('INDEX_HTML_RUNTIME_MARKER');
  });

  it('prefers and transforms a user-owned root/index.html', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><head><meta name="user-shell"></head><body><div id="app"></div></body></html>',
    );
    const result = await compile(fixture);

    expect(result.html).toContain('user-shell');
    expect(result.html).not.toContain('fallback-shell');
    expect(result.chunks).toHaveLength(1);
    expect(result.code).toContain('INDEX_HTML_RUNTIME_MARKER');
  });

  it('builds an independent white-screen monitor before the application entry', async () => {
    const fixture = await createFixture(undefined, {
      enabled: true,
      timeout: 8000,
      development: false,
    });
    const result = await compile(fixture);
    const monitor = result.assets.find((asset) => asset.fileName.includes('miko-white-screen'));

    expect(result.chunks).toHaveLength(1);
    expect(monitor).toBeDefined();
    expect(String(monitor && 'source' in monitor ? monitor.source : '')).toContain(
      'MIKO_BOOT_TIMEOUT',
    );
    expect(result.code).toContain('INDEX_HTML_RUNTIME_MARKER');
    expect(result.html).toContain('data-miko-monitor');
    expect(result.html).toContain(monitor!.fileName);
    expect(result.html.indexOf(monitor!.fileName)).toBeLessThan(
      result.html.indexOf(result.chunks[0]!.fileName),
    );
    expect(result.html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[^<]+<\/script>/u);
  });

  it('injects the Miko module entry when a classic script uses the virtual id', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><body><div id="app"></div><script src="virtual:index"></script></body></html>',
    );
    const result = await compile(fixture);

    expect(result.chunks).toHaveLength(1);
    expect(result.code).toContain('INDEX_HTML_RUNTIME_MARKER');
  });

  it('reuses an exact module src as the single Miko entry', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><body><div id="app"></div><script type="module" src="virtual:index"></script></body></html>',
    );
    const result = await compile(fixture);

    expect(result.chunks).toHaveLength(1);
    expect(result.code).toContain('INDEX_HTML_RUNTIME_MARKER');
  });

  it('injects the Miko entry for non-exact module type values', async () => {
    for (const type of ['MODULE', ' module ']) {
      const fixture = await createFixture(
        `<!doctype html><html><body><div id="app"></div><script type="${type}" src="virtual:index"></script></body></html>`,
      );
      const result = await compile(fixture);

      expect(result.chunks).toHaveLength(1);
      expect(result.code).toContain('INDEX_HTML_RUNTIME_MARKER');
    }
  });

  it('rewrites an exact user module src to the single loadable dev entry', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><head><meta name="user-shell"></head><body><div id="app"></div><script type="module" src="virtual:index"></script></body></html>',
    );
    const client = await startDevServer(fixture);
    const html = await client.requestHtml();

    expect(html).toContain('user-shell');
    expect(html).not.toContain('src="virtual:index"');

    const virtualUrls = [...html.matchAll(/src="(\/@id\/__x00__virtual:index[^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(virtualUrls).toHaveLength(1);

    const virtualResponse = await client.request(virtualUrls[0]!);
    expect(virtualResponse.status).toBe(200);
    const virtualModule = await virtualResponse.text();
    const entryUrl = virtualModule.match(/\bimport\s+["']([^"']+entry\.ts[^"']*)["']/)?.[1];
    expect(entryUrl).toBeTruthy();

    const entryResponse = await client.request(entryUrl!);
    expect(entryResponse.status).toBe(200);
    await expect(entryResponse.text()).resolves.toContain('INDEX_HTML_RUNTIME_MARKER');
  });

  it('rewrites only the exact module src attribute without serializing user HTML', async () => {
    const fixture = await createFixture(
      [
        '<!doctype html><html><body><div id="app"></div>',
        '<!-- <script type="module" src="virtual:index"></script> -->',
        '<script src="virtual:index"></script>',
        '<script type="module" src="virtual:index-example"></script>',
        '<script defer type="module" src = \'virtual:index\'></script>',
        '</body></html>',
      ].join(''),
    );
    const client = await startDevServer(fixture);
    const html = await client.requestHtml();

    expect(html).toContain('<!-- <script type="module" src="virtual:index"></script> -->');
    expect(html).toContain('<script src="virtual:index"></script>');
    expect(html).toContain('<script type="module" src="virtual:index-example"></script>');
    expect(html).toContain(
      `<script defer type="module" src = '/@id/__x00__virtual:index'></script>`,
    );
  });

  it('still rejects exact user module entries without an app mount node in dev', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><body><script type="module" src="virtual:index"></script></body></html>',
    );
    const client = await startDevServer(fixture);

    const response = await client.request('/deep/route', 'text/html');

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain('index.html 必须包含唯一的 #app 挂载节点');
  });

  it('serves transformed fallback HTML for deep routes in dev', async () => {
    const fixture = await createFixture();
    const client = await startDevServer(fixture);
    const html = await client.requestHtml();

    expect(html).toContain('fallback-shell');
    expect(html).not.toContain('src="virtual:index"');

    const virtualUrl = html.match(/src="(\/@id\/__x00__virtual:index[^"]*)"/)?.[1];
    expect(virtualUrl).toBeTruthy();

    const virtualResponse = await client.request(virtualUrl!);
    expect(virtualResponse.status).toBe(200);
    const virtualModule = await virtualResponse.text();
    const entryUrl = virtualModule.match(/\bimport\s+["']([^"']+entry\.ts[^"']*)["']/)?.[1];
    expect(entryUrl).toBeTruthy();

    const entryResponse = await client.request(entryUrl!);
    expect(entryResponse.status).toBe(200);
    await expect(entryResponse.text()).resolves.toContain('INDEX_HTML_RUNTIME_MARKER');
  });

  it('switches between fallback and user HTML without restarting or changing root', async () => {
    const fixture = await createFixture();
    const client = await startDevServer(fixture);

    await writeFile(
      resolve(fixture.root, 'index.html'),
      '<!doctype html><html><head><meta name="user-shell"></head><body><div id="app"></div></body></html>',
    );
    const userHtml = await client.requestHtml();
    expect(userHtml).toContain('user-shell');
    expect(userHtml).not.toContain('src="virtual:index"');

    await rm(resolve(fixture.root, 'index.html'));
    const fallbackHtml = await client.requestHtml();
    expect(fallbackHtml).toContain('fallback-shell');
    expect(fallbackHtml).not.toContain('src="virtual:index"');
  });
});
