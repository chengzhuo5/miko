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

async function createFixture(userHtml?: string) {
  const root = await mkdtemp(join(tmpdir(), 'miko-html-'));
  const template = resolve(root, 'template');
  const entry = resolve(root, 'entry.ts');
  roots.push(root);

  await mkdir(template, { recursive: true });
  await writeFile(
    resolve(template, 'index.html'),
    '<!doctype html><html><head><meta name="fallback-shell"></head><body><div id="app"></div></body></html>',
  );
  await writeFile(entry, `document.querySelector('#app')!.textContent = 'ready'`);
  if (userHtml) await writeFile(resolve(root, 'index.html'), userHtml);

  return { root, template, entry };
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
    chunks: output.filter((item) => item.type === 'chunk'),
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
  });

  it('prefers and transforms a user-owned root/index.html', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><head><meta name="user-shell"></head><body><div id="app"></div></body></html>',
    );
    const result = await compile(fixture);

    expect(result.html).toContain('user-shell');
    expect(result.html).not.toContain('fallback-shell');
    expect(result.chunks).toHaveLength(1);
  });

  it('injects the Miko module entry when a classic script uses the virtual id', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><body><div id="app"></div><script src="virtual:index"></script></body></html>',
    );
    const result = await compile(fixture);

    expect(result.chunks).toHaveLength(1);
  });

  it('reuses an exact module src as the single Miko entry', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><body><div id="app"></div><script type="module" src="virtual:index"></script></body></html>',
    );
    const result = await compile(fixture);

    expect(result.chunks).toHaveLength(1);
  });

  it('injects the Miko entry for non-exact module type values', async () => {
    for (const type of ['MODULE', ' module ']) {
      const fixture = await createFixture(
        `<!doctype html><html><body><div id="app"></div><script type="${type}" src="virtual:index"></script></body></html>`,
      );
      const result = await compile(fixture);

      expect(result.chunks).toHaveLength(1);
    }
  });

  it('serves transformed fallback HTML for deep routes in dev', async () => {
    const fixture = await createFixture();
    const client = await startDevServer(fixture);
    const html = await client.requestHtml();

    expect(html).toContain('fallback-shell');
    expect(html).not.toContain('virtual:index');

    const proxyUrl = html.match(/src="([^"]*html-proxy[^"]*)"/)?.[1];
    expect(proxyUrl).toBeTruthy();

    const proxyResponse = await client.request(proxyUrl!);
    expect(proxyResponse.status).toBe(200);
    const proxyModule = await proxyResponse.text();
    const virtualUrl = proxyModule.match(/["'](\/@id\/__x00__virtual:index[^"']*)["']/)?.[1];
    expect(virtualUrl).toBeTruthy();

    const virtualResponse = await client.request(virtualUrl!);
    expect(virtualResponse.status).toBe(200);
    const virtualModule = await virtualResponse.text();
    const entryUrl = virtualModule.match(/\bimport\s+["']([^"']+entry\.ts[^"']*)["']/)?.[1];
    expect(entryUrl).toBeTruthy();

    const entryResponse = await client.request(entryUrl!);
    expect(entryResponse.status).toBe(200);
    await expect(entryResponse.text()).resolves.toContain('ready');
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
    expect(userHtml).not.toContain('virtual:index');

    await rm(resolve(fixture.root, 'index.html'));
    const fallbackHtml = await client.requestHtml();
    expect(fallbackHtml).toContain('fallback-shell');
    expect(fallbackHtml).not.toContain('virtual:index');
  });
});
