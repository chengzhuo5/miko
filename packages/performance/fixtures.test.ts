import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateFixture } from './fixtures';

const roots: string[] = [];
const workspaceNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createParent(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'miko-performance-fixture-'));
  roots.push(root);
  return root;
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(relative(root, path).replaceAll('\\', '/'));
    }
  }

  await visit(root);
  return files.sort();
}

describe('generateFixture', () => {
  it.each([
    ['small', 3, 20, 1],
    ['medium', 50, 200, 3],
    ['large', 500, 1000, 5],
  ] as const)(
    'generates the exact %s route, component and layout counts',
    async (name, routeCount, componentCount, layoutCount) => {
      const fixture = await generateFixture(await createParent(), name);
      const files = await listFiles(fixture.root);

      expect(fixture).toMatchObject({
        name,
        routeCount,
        componentCount,
        deepRoute: `/route-${String(routeCount - 1).padStart(4, '0')}`,
        unvisitedRoute: '/route-0001',
      });
      expect(files.filter(file => file.startsWith('pages/') && file.endsWith('.vue'))).toHaveLength(
        routeCount,
      );
      expect(
        files.filter(file => file.startsWith('components/') && file.endsWith('.vue')),
      ).toHaveLength(componentCount);
      expect(
        files.filter(file => file.startsWith('layouts/') && file.endsWith('.vue')),
      ).toHaveLength(layoutCount);
      expect(await realpath(join(fixture.root, 'node_modules'))).toBe(
        await realpath(workspaceNodeModules),
      );
    },
    30_000,
  );

  it('generates identical source trees for the same fixture name', async () => {
    const first = await generateFixture(await createParent(), 'small');
    const second = await generateFixture(await createParent(), 'small');
    const firstFiles = await listFiles(first.root);
    const secondFiles = await listFiles(second.root);

    expect(firstFiles).toEqual(secondFiles);
    for (const file of firstFiles) {
      expect(await readFile(join(first.root, file), 'utf8')).toBe(
        await readFile(join(second.root, file), 'utf8'),
      );
    }
  });

  it('creates the runtime Pinia, Head, ClientOnly and route-splitting signals', async () => {
    const fixture = await generateFixture(await createParent(), 'runtime');
    const packageJson = await readFile(join(fixture.root, 'package.json'), 'utf8');
    const indexPage = await readFile(join(fixture.root, 'pages/index.vue'), 'utf8');
    const clientOnlyPage = await readFile(
      join(fixture.root, 'pages/client-only.vue'),
      'utf8',
    );
    const unvisitedPage = await readFile(join(fixture.root, 'pages/unvisited.vue'), 'utf8');

    expect(fixture).toMatchObject({
      name: 'runtime',
      routeCount: 4,
      componentCount: 1,
      deepRoute: '/deep/nested',
      unvisitedRoute: '/unvisited',
    });
    expect(packageJson).toContain('"pinia"');
    expect(packageJson).toContain('"@unhead/vue"');
    expect(indexPage).toContain('useRuntimeStore');
    expect(indexPage).toContain('useHead');
    expect(indexPage).toContain('defineAsyncComponent');
    expect(clientOnlyPage).toContain('clientOnly: true');
    expect(unvisitedPage).toContain('UNVISITED_ROUTE_MARKER');
  });
});
