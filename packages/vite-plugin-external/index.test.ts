import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { externalPlugin } from './index';

const mocks = vi.hoisted(() => ({
  scanFrameworkModules: vi.fn<() => Promise<string[]>>(async () => ['./modules/vue.ts']),
}));

vi.mock('fast-glob', () => ({
  default: mocks.scanFrameworkModules,
}));
vi.mock('vite-plugin-external', () => ({
  default: () => ({ name: 'vite-plugin-external' }),
}));

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('externalPlugin', () => {
  it('does not scan framework modules when CDN is disabled', async () => {
    await expect(externalPlugin(process.cwd(), false, [])).resolves.toHaveLength(1);
    expect(mocks.scanFrameworkModules).not.toHaveBeenCalled();

    await expect(externalPlugin(process.cwd(), true, [])).resolves.toHaveLength(2);
    expect(mocks.scanFrameworkModules).toHaveBeenCalledOnce();
  });

  it('keeps the legacy boolean signature for CDN externalization', async () => {
    await expect(externalPlugin(false)).resolves.toHaveLength(1);
    await expect(externalPlugin(true)).resolves.toHaveLength(2);
    await expect(externalPlugin(process.cwd(), true, ['custom-runtime'])).resolves.toHaveLength(2);
  });

  it('resolves dependencies from the explicit target root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-external-root-'));
    const packageRoot = resolve(root, 'node_modules/miko-target-root-fixture');
    const entry = resolve(packageRoot, 'index.js');
    roots.push(root);

    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      resolve(packageRoot, 'package.json'),
      JSON.stringify({
        name: 'miko-target-root-fixture',
        type: 'module',
        exports: './index.js',
      }),
    );
    await writeFile(entry, 'export const marker = true');

    const plugin = (await externalPlugin(root))[0] as Plugin;
    const resolveId = plugin.resolveId as (
      source: string,
      importer: string | undefined,
      options: { ssr?: boolean },
    ) => Promise<string | undefined>;

    const resolvedId = await resolveId('miko-target-root-fixture', undefined, { ssr: false });

    expect(resolve(resolvedId!)).toBe(entry);
  });
});
