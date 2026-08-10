import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandContext } from '../context';
import { runMigrate } from './index';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('runMigrate', () => {
  it('prints a deterministic dry-run without changing source or target files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-migrate-dry-run-'));
    roots.push(root);
    const sourceFile = join(root, 'miko.config.ts');
    const source = `export default { ssg: false, uiLibrary: 'vant' }\n`;
    await writeFile(sourceFile, source);
    const before = await stat(sourceFile);
    const output: string[] = [];
    const context: CommandContext = {
      allRoutes: false,
      checkAfterWrite: false,
      command: 'migrate',
      json: false,
      lib: false,
      mode: 'production',
      root,
      write: false,
    };

    await runMigrate(context, { output: (message) => output.push(message) });

    const after = await stat(sourceFile);
    await expect(readFile(sourceFile, 'utf8')).resolves.toBe(source);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(output.join('\n')).toMatchInlineSnapshot(`
      "Miko v1 migration dry-run
      Source: miko.config.ts
      Target: miko.config.ts
      Status: safe

      import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

      export default {
        miko: {
          rendering: 'spa',
          uiLibrary: 'vant',
        },
      } satisfies MikoUserConfig

      No files were changed. Run "miko migrate --write" to apply this plan."
    `);
  });
});
