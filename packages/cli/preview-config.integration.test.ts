import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { preview, type PreviewServer } from 'vite';
import { resolveMikoProject } from '@minar-kotonoha/vite-plugin-miko';
import { createPreviewConfig } from './preview-config';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })),
  );
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP server did not expose a port');
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

async function reservePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

describe('preview proxy integration', () => {
  it('uses Vite preview proxy for successful and unavailable upstreams', async () => {
    const upstream = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ path: request.url }));
    });
    const upstreamPort = await listen(upstream);
    const unavailablePort = await reservePort();
    const previewPort = await reservePort();
    const root = await mkdtemp(join(tmpdir(), 'miko-preview-'));
    temporaryDirectories.push(root);
    let previewServer: PreviewServer | undefined;

    try {
      await mkdir(join(root, 'dist'));
      await writeFile(join(root, 'package.json'), '{"name":"preview-fixture","private":true}');
      await writeFile(join(root, 'dist', 'index.html'), '<div id="app">preview</div>');
      await writeFile(
        join(root, 'miko.config.ts'),
        `export default {
          miko: { rendering: 'spa' },
          vite: {
            logLevel: 'silent',
            preview: { host: '127.0.0.1', port: ${previewPort}, strictPort: true },
            server: {
              proxy: {
                '/api': {
                  target: 'http://127.0.0.1:${upstreamPort}',
                  rewrite: path => path.replace(/^\\/api/u, ''),
                },
                '/offline': 'http://127.0.0.1:${unavailablePort}',
              },
            },
          },
        }`,
      );

      const project = await resolveMikoProject({
        command: 'preview',
        mode: 'production',
        root,
      });
      previewServer = await preview(await createPreviewConfig(project));

      const proxied = await fetch(`http://127.0.0.1:${previewPort}/api/health`);
      expect(proxied.status).toBe(200);
      await expect(proxied.json()).resolves.toEqual({ path: '/health' });

      const unavailable = await fetch(`http://127.0.0.1:${previewPort}/offline`);
      expect(unavailable.status).toBe(502);
    } finally {
      await previewServer?.close();
      await close(upstream);
    }
  });
});
