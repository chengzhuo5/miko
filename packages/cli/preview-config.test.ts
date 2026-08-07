import { Agent } from 'node:https';
import { describe, expect, it, vi } from 'vitest';
import type { UserConfig } from 'vite';
import type { ResolvedMikoConfig } from '@minar-kotonoha/vite-plugin-miko';

const mocks = vi.hoisted(() => ({
  createMikoViteConfig: vi.fn<(project: ResolvedMikoConfig) => Promise<UserConfig>>(
    async project => project.vite,
  ),
}));

vi.mock('@minar-kotonoha/vite-plugin-miko', () => ({
  createMikoViteConfig: mocks.createMikoViteConfig,
}));

import { createPreviewConfig } from './preview-config';

function project(vite: UserConfig): ResolvedMikoConfig {
  return {
    env: { command: 'preview', mode: 'production', root: 'D:/project' },
    outDir: 'D:/project/dist',
    vite,
  } as ResolvedMikoConfig;
}

describe('createPreviewConfig', () => {
  it('uses explicit preview.proxy before server.proxy', async () => {
    const previewProxy = { '/preview': 'http://127.0.0.1:4100' };
    const devProxy = { '/dev': 'http://127.0.0.1:4200' };

    const config = await createPreviewConfig(
      project({ preview: { proxy: previewProxy }, server: { proxy: devProxy } }),
    );

    expect(config.preview?.proxy).toEqual(previewProxy);
    expect(config.preview?.proxy).not.toBe(previewProxy);
    expect(config.preview?.proxy).not.toHaveProperty('/dev');
  });

  it('falls back to server.proxy without mutating it', async () => {
    const rule = { target: 'http://127.0.0.1:4300', changeOrigin: true };
    const devProxy = { '/api': rule };

    const config = await createPreviewConfig(project({ server: { proxy: devProxy } }));

    expect(config.preview?.proxy).toEqual(devProxy);
    expect(config.preview?.proxy).not.toBe(devProxy);
    expect(config.preview?.proxy?.['/api']).not.toBe(rule);
    expect(devProxy).toEqual({ '/api': rule });
  });

  it('preserves proxy references without injecting insecure TLS options', async () => {
    const rewrite = (path: string) => path.replace(/^\/api/u, '');
    const matcher = /health/u;
    const agent = new Agent();
    const rule = {
      target: 'https://example.com',
      rewrite,
      matcher,
      agent,
    };

    const config = await createPreviewConfig(project({ server: { proxy: { '/api': rule } } }));
    const cloned = config.preview?.proxy?.['/api'];

    expect(cloned).not.toBe(rule);
    expect(cloned).toMatchObject({ rewrite, matcher, agent });
    expect(JSON.stringify(config)).not.toContain('"secure":false');
    expect(JSON.stringify(config)).not.toContain('"rejectUnauthorized":false');
  });
});
