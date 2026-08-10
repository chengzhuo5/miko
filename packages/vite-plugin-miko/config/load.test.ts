import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMikoConfig } from './load';
import type { MikoConfigEnv } from './types';

const roots: string[] = [];
const env: MikoConfigEnv = {
  command: 'build',
  mode: 'production',
  root: '',
};

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), 'miko-config-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('loadMikoConfig', () => {
  it('loads the starter through the zero-config contract', async () => {
    const loaded = await loadMikoConfig({
      ...env,
      root: fileURLToPath(new URL('../../../app/', import.meta.url)),
    });

    expect(loaded).toEqual({
      config: {},
      configFile: null,
    });
  });

  it('returns an empty config when the file is absent', async () => {
    const root = await createRoot();

    await expect(loadMikoConfig({ ...env, root })).resolves.toEqual({
      config: {},
      configFile: null,
    });
  });

  it('loads an object export', async () => {
    const root = await createRoot();
    await writeFile(
      join(root, 'miko.config.ts'),
      `export default { miko: { rendering: 'spa' }, vite: { base: '/cms/' } }`,
    );

    const loaded = await loadMikoConfig({ ...env, root });

    expect(loaded.config.miko?.rendering).toBe('spa');
    expect(loaded.config.vite?.base).toBe('/cms/');
  });

  it('reloads a changed config from the same path', async () => {
    const root = await createRoot();
    const configFile = join(root, 'miko.config.ts');
    await writeFile(configFile, `export default { vite: { base: '/first/' } }`);

    const first = await loadMikoConfig({ ...env, root });
    await writeFile(configFile, `export default { vite: { base: '/second/' } }`);
    const second = await loadMikoConfig({ ...env, root });

    expect(first.config.vite?.base).toBe('/first/');
    expect(second.config.vite?.base).toBe('/second/');
  });

  it('executes a config function with the stable context', async () => {
    const root = await createRoot();
    await writeFile(
      join(root, 'miko.config.ts'),
      `export default env => ({ vite: { define: { __MODE__: JSON.stringify(env.mode) } } })`,
    );

    const loaded = await loadMikoConfig({ ...env, root, mode: 'test' });

    expect(loaded.config.vite?.define?.__MODE__).toBe('"test"');
  });

  it('preserves syntax errors with the config file path', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'miko.config.ts'), `export default { broken:`);

    await expect(loadMikoConfig({ ...env, root })).rejects.toMatchObject({
      code: 'MIKO_CONFIG_LOAD',
      file: join(root, 'miko.config.ts'),
    });
  });

  it('rejects a non-plain top-level object', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'miko.config.ts'), `export default new Date()`);

    await expect(loadMikoConfig({ ...env, root })).rejects.toMatchObject({
      code: 'MIKO_CONFIG_INVALID',
      file: join(root, 'miko.config.ts'),
    });
  });

  it('rejects a non-plain miko object', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'miko.config.ts'), `export default { miko: new Date() }`);

    await expect(loadMikoConfig({ ...env, root })).rejects.toMatchObject({
      code: 'MIKO_CONFIG_INVALID',
      file: join(root, 'miko.config.ts'),
      field: 'miko',
    });
  });

  it('rejects legacy flat fields instead of silently ignoring them', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'miko.config.ts'), `export default { base: '/legacy/' }`);

    await expect(loadMikoConfig({ ...env, root })).rejects.toMatchObject({
      code: 'MIKO_CONFIG_INVALID',
      file: join(root, 'miko.config.ts'),
      field: 'base',
    });
  });
});
