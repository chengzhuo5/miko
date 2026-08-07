import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectProject } from './manifest';

const roots: string[] = [];

async function createRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `miko-${name}-`));
  roots.push(root);
  return root;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('inspectProject', () => {
  it('uses the nearest package.json and only direct dependencies', async () => {
    const workspace = await createRoot('manifest-nearest');
    const packageRoot = join(workspace, 'apps', 'web');
    const root = join(packageRoot, 'src');

    await writeJson(join(workspace, 'package.json'), {
      dependencies: { 'transitive-only': '1.0.0' },
    });
    await writeJson(join(packageRoot, 'package.json'), {
      dependencies: { pinia: '^4.0.0' },
      devDependencies: { vant: '^4.0.0' },
      peerDependencies: { vue: '^3.5.0' },
    });
    await mkdir(root, { recursive: true });

    const result = await inspectProject(root, 'production');

    expect(result.packageJsonPath).toBe(resolve(packageRoot, 'package.json'));
    expect(result.dependencies).toEqual(['pinia', 'vant', 'vue']);
    expect(result.dependencies).not.toContain('transitive-only');
  });

  it('records only root-local convention paths', async () => {
    const workspace = await createRoot('manifest-conventions');
    const root = join(workspace, 'app');
    await writeJson(join(root, 'package.json'), {});
    await Promise.all([
      mkdir(join(root, 'components'), { recursive: true }),
      mkdir(join(root, 'layouts'), { recursive: true }),
      mkdir(join(root, 'schemas'), { recursive: true }),
      mkdir(join(workspace, 'layouts'), { recursive: true }),
      writeFile(join(root, 'uno.config.ts'), 'export default {}\n'),
      writeFile(join(root, 'eslint.config.ts'), 'export default []\n'),
      writeFile(join(workspace, 'uno.config.ts'), 'export default {}\n'),
    ]);

    const result = await inspectProject(root, 'production');

    expect(result.conventions).toEqual({
      components: true,
      janusSchemas: resolve(root, 'schemas'),
      layouts: true,
      lintConfig: resolve(root, 'eslint.config.ts'),
      unoConfig: resolve(root, 'uno.config.ts'),
    });
    expect(result.watchedDirectories).toEqual([
      resolve(root, 'components'),
      resolve(root, 'layouts'),
      resolve(root, 'schemas'),
    ]);
    expect(result.watchedFiles).toEqual(
      expect.arrayContaining([
        resolve(root, 'eslint.config.ts'),
        resolve(root, 'miko.config.ts'),
        resolve(root, 'package.json'),
        resolve(root, 'uno.config.ts'),
      ]),
    );
    expect(result.watchedFiles).not.toContain(resolve(workspace, 'uno.config.ts'));
  });

  it.each([
    {
      name: 'package.json',
      prepare: (root: string) =>
        writeJson(join(root, 'package.json'), {
          browserslist: {
            development: ['last 1 chrome version'],
            production: ['chrome 79'],
          },
        }),
      configFile: (root: string) => join(root, 'package.json'),
    },
    {
      name: '.browserslistrc',
      prepare: async (root: string) => {
        await writeJson(join(root, 'package.json'), {});
        await writeFile(
          join(root, '.browserslistrc'),
          '[development]\nlast 1 chrome version\n[production]\nchrome 79\n',
        );
      },
      configFile: (root: string) => join(root, '.browserslistrc'),
    },
  ])('reads the $name Browserslist environment', async ({ prepare, configFile }) => {
    const root = await createRoot('manifest-browserslist');
    await prepare(root);

    const result = await inspectProject(root, 'production');

    expect(result.browserslist).toEqual(['chrome 79']);
    expect(result.browserslistConfigFile).toBe(resolve(configFile(root)));
    expect(result.watchedFiles).toContain(resolve(configFile(root)));
  });

  it('keeps modern defaults when no project Browserslist config exists', async () => {
    const root = await createRoot('manifest-modern');
    await writeJson(join(root, 'package.json'), {});

    const result = await inspectProject(root, 'production');

    expect(result.browserslist).toEqual([]);
    expect(result.browserslistConfigFile).toBeNull();
  });
});
