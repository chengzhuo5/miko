import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeStaticDeploymentManifest } from './static-manifest';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('writeStaticDeploymentManifest', () => {
  it('writes deterministic route and cache-policy manifests without following outside links', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-static-manifest-'));
    const outDir = join(root, 'dist');
    const outsideDir = join(root, 'outside');
    roots.push(root);

    await Promise.all([
      mkdir(join(outDir, 'assets'), { recursive: true }),
      mkdir(join(outDir, 'docs'), { recursive: true }),
      mkdir(outsideDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(outDir, 'index.html'), 'root'),
      writeFile(join(outDir, 'about.html'), 'about'),
      writeFile(join(outDir, 'docs/index.html'), 'docs'),
      writeFile(join(outDir, 'assets/app-a1B2c3D4.js'), 'hashed'),
      writeFile(join(outDir, 'assets/logo.svg'), 'logo'),
      writeFile(join(outsideDir, 'sentinel.txt'), 'outside'),
    ]);
    await symlink(
      outsideDir,
      join(outDir, 'outside-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const manifest = await writeStaticDeploymentManifest(outDir, '/cms/');
    const routesPath = join(outDir, '.miko/routes.json');
    const assetsPath = join(outDir, '.miko/assets.json');
    const firstRoutes = await readFile(routesPath, 'utf8');
    const firstAssets = await readFile(assetsPath, 'utf8');

    expect(manifest.base).toBe('/cms/');
    expect(manifest.routes).toEqual(['/', '/about', '/docs/']);
    expect(manifest.assets).toEqual([
      { file: 'about.html', bytes: 5, cacheControl: 'no-cache' },
      {
        file: 'assets/app-a1B2c3D4.js',
        bytes: 6,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      { file: 'assets/logo.svg', bytes: 4, cacheControl: 'no-cache' },
      { file: 'docs/index.html', bytes: 4, cacheControl: 'no-cache' },
      { file: 'index.html', bytes: 4, cacheControl: 'no-cache' },
    ]);
    expect(JSON.parse(firstRoutes)).toEqual({
      base: '/cms/',
      routes: ['/', '/about', '/docs/'],
    });
    expect(JSON.parse(firstAssets)).toEqual({
      base: '/cms/',
      assets: manifest.assets,
    });
    expect(manifest.assets.some((asset) => asset.file.includes('outside-link'))).toBe(false);
    await expect(readFile(join(outsideDir, 'sentinel.txt'), 'utf8')).resolves.toBe('outside');

    await writeStaticDeploymentManifest(outDir, '/cms/');
    await expect(readFile(routesPath, 'utf8')).resolves.toBe(firstRoutes);
    await expect(readFile(assetsPath, 'utf8')).resolves.toBe(firstAssets);
  });
});
