import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export interface StaticAssetRecord {
  file: string;
  bytes: number;
  cacheControl: 'no-cache' | 'public, max-age=31536000, immutable';
}

export interface StaticDeploymentManifest {
  base: string;
  routes: string[];
  assets: StaticAssetRecord[];
}

const immutableCacheControl = 'public, max-age=31536000, immutable' as const;
const hashedAssetPattern = /-[\dA-Z_a-z-]{8,}\.[^./]+$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toRelativeFile(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function toRoute(file: string): string | undefined {
  if (!file.endsWith('.html')) return;
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file.slice(0, -'.html'.length)}`;
}

function cacheControlFor(file: string): StaticAssetRecord['cacheControl'] {
  if (file.endsWith('.html')) return 'no-cache';
  return hashedAssetPattern.test(file) ? immutableCacheControl : 'no-cache';
}

export async function writeStaticDeploymentManifest(
  outDir: string,
  base: string,
): Promise<StaticDeploymentManifest> {
  const root = resolve(outDir);
  const assets: StaticAssetRecord[] = [];
  const routes: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.miko') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;

      const file = toRelativeFile(root, path);
      const route = toRoute(file);
      if (route) routes.push(route);
      assets.push({
        file,
        bytes: (await stat(path)).size,
        cacheControl: cacheControlFor(file),
      });
    }
  }

  await visit(root);
  routes.sort(compareText);
  assets.sort((left, right) => compareText(left.file, right.file));

  const manifest = { base, routes, assets };
  const manifestDir = join(root, '.miko');
  await mkdir(manifestDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(manifestDir, 'routes.json'),
      `${JSON.stringify({ base, routes }, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      join(manifestDir, 'assets.json'),
      `${JSON.stringify({ base, assets }, null, 2)}\n`,
      'utf8',
    ),
  ]);
  return manifest;
}
