import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { bootstrapPlugin } from './index';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function buildBootstrap(root: string, input: string) {
  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [bootstrapPlugin()],
    build: {
      write: false,
      rolldownOptions: {
        input,
      },
    },
  });
  const builds = Array.isArray(result) ? result : [result];
  const output = builds.flatMap((buildResult) =>
    'output' in buildResult ? buildResult.output : [],
  );
  return output.find((item) => item.type === 'chunk') as { code: string } | undefined;
}

describe('bootstrapPlugin', () => {
  it('resolves the optional bootstrap from Vite root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-bootstrap-'));
    const input = resolve(root, 'main.ts');
    roots.push(root);

    await writeFile(
      resolve(root, 'index.ts'),
      `export default () => { globalThis.__mikoBootstrap = 'ROOT_BOOTSTRAP_MARKER' }`,
    );
    await writeFile(input, `import { bootstrap } from 'virtual:bootstrap'; bootstrap()`);

    const chunk = await buildBootstrap(root, input);

    expect(chunk?.code).toContain('ROOT_BOOTSTRAP_MARKER');
  });

  it('keeps zero-config builds working when the optional bootstrap is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-bootstrap-'));
    const input = resolve(root, 'main.ts');
    roots.push(root);

    await writeFile(
      input,
      `import { bootstrap } from 'virtual:bootstrap'; bootstrap(); globalThis.__mikoAfterBootstrap = 'AFTER_BOOTSTRAP_MARKER'`,
    );

    const chunk = await buildBootstrap(root, input);

    expect(chunk?.code).toContain('AFTER_BOOTSTRAP_MARKER');
  });
});
