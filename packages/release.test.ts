import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  name: string;
  version?: string;
  private?: boolean;
  description?: string;
  files?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
  publishConfig?: {
    access?: string;
    registry?: string;
  };
}

const publicPackages = [
  ['cli', '@minar-kotonoha/miko-cli'],
  ['framework', '@minar-kotonoha/framework'],
  ['linter', '@minar-kotonoha/linter'],
  ['to-miko', '@minar-kotonoha/to-miko'],
  ['vite-plugin-bootstrap', '@minar-kotonoha/vite-plugin-bootstrap'],
  ['vite-plugin-external', '@minar-kotonoha/vite-plugin-external'],
  ['vite-plugin-index-html', '@minar-kotonoha/vite-plugin-index-html'],
  ['vite-plugin-miko', '@minar-kotonoha/vite-plugin-miko'],
] as const;

/** 当前发布版本（v1 主版本内的补丁演进；发布时同步更新） */
const publicVersions: Record<(typeof publicPackages)[number][1], string> = {
  '@minar-kotonoha/miko-cli': '1.0.3',
  '@minar-kotonoha/framework': '1.0.0',
  '@minar-kotonoha/linter': '1.0.0',
  '@minar-kotonoha/to-miko': '1.0.0',
  '@minar-kotonoha/vite-plugin-bootstrap': '1.0.0',
  '@minar-kotonoha/vite-plugin-external': '1.0.0',
  '@minar-kotonoha/vite-plugin-index-html': '1.0.5',
  '@minar-kotonoha/vite-plugin-miko': '1.0.9',
};

const publicNames = new Set(publicPackages.map(([, name]) => name));
const nodeRange = '^20.19.0 || >=22.12.0';

async function readManifest(url: URL): Promise<PackageManifest> {
  return JSON.parse(await readFile(url, 'utf8')) as PackageManifest;
}

describe('Miko v1 release contract', () => {
  it('uses one coherent public v1 package set with workspace dependency edges', async () => {
    for (const [directory, name] of publicPackages) {
      const manifest = await readManifest(new URL(`./${directory}/package.json`, import.meta.url));

      expect(manifest).toMatchObject({
        name,
        version: publicVersions[name],
        engines: { node: nodeRange },
        publishConfig: {
          access: 'public',
          registry: 'https://registry.npmjs.org/',
        },
      });
      expect(manifest.description).toBeTruthy();
      expect(
        manifest.files
          ?.filter((file) => !file.startsWith('!'))
          .some((file) => /(?:^|\/)(?:fixtures?|tests?)\/|\.test\./u.test(file)),
      ).not.toBe(true);

      const publicDependencies = Object.entries(manifest.dependencies ?? {}).filter(
        ([dependency]) => publicNames.has(dependency),
      );
      for (const [, version] of publicDependencies) {
        expect(version).toBe('workspace:^');
      }
    }
  });

  it('publishes the library CSS scope transformer', async () => {
    const manifest = await readManifest(
      new URL('./vite-plugin-miko/package.json', import.meta.url),
    );

    expect(manifest.files).toContain('lib-css-scope.ts');
  });

  it('keeps private workspaces private and points the starter at v1', async () => {
    const [starter, performance] = await Promise.all([
      readManifest(new URL('../app/package.json', import.meta.url)),
      readManifest(new URL('./performance/package.json', import.meta.url)),
    ]);

    expect(starter).toMatchObject({
      private: true,
      version: '1.0.0',
      devDependencies: {
        '@minar-kotonoha/miko-cli': '^1.0.0',
        '@minar-kotonoha/linter': '^1.0.0',
      },
    });
    expect(starter.devDependencies?.['@minar-kotonoha/framework']).toBeUndefined();
    expect(starter.devDependencies?.['@minar-kotonoha/vite-plugin-miko']).toBeUndefined();
    expect(performance.private).toBe(true);
    expect(performance.version).toBeUndefined();
  });

  it('documents the supported runtimes and optional compatibility paths', async () => {
    const document = await readFile(
      new URL('../docs/compatibility-v1.md', import.meta.url),
      'utf8',
    );

    for (const value of [
      'Bun 1.3.x',
      'Node.js 20.19',
      'Node.js 22.12+',
      'SPA',
      'SSG',
      'Legacy',
      'CDN',
      '127.0.0.1',
      'Node.js + jiti',
    ]) {
      expect(document).toContain(value);
    }
    expect(document).toContain('Bun.*');
    expect(document).toContain('workspace:^');
  });
});
