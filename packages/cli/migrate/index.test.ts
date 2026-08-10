import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../context';
import { runMigrate } from './index';
import type { MigrationPlan } from './types';

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

  it('refuses an unsafe write with exit code seven', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-migrate-unsafe-'));
    roots.push(root);
    const write = vi.fn();
    const unsafePlan: MigrationPlan = {
      root,
      sourceFiles: [join(root, 'vite.config.ts')],
      targetFile: join(root, 'miko.config.ts'),
      generatedSource: null,
      findings: [
        {
          code: 'MIKO_MIGRATE_MANUAL',
          file: 'vite.config.ts',
          level: 'warning',
          message: 'manual',
        },
      ],
      safeToWrite: false,
    };

    await expect(
      runMigrate(
        {
          allRoutes: false,
          checkAfterWrite: false,
          command: 'migrate',
          json: false,
          lib: false,
          mode: 'production',
          root,
          write: true,
        },
        {
          analyze: async () => unsafePlan,
          output: () => {},
          write,
        },
      ),
    ).rejects.toMatchObject({
      code: 'MIKO_MIGRATE_UNSAFE',
      exitCode: 7,
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('runs Doctor and optional Check after a successful write with the same root and mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-migrate-verify-'));
    roots.push(root);
    const calls: string[] = [];
    const migrationPlan: MigrationPlan = {
      root,
      sourceFiles: [join(root, 'vite.config.ts')],
      targetFile: join(root, 'miko.config.ts'),
      generatedSource: 'export default {}\n',
      findings: [],
      safeToWrite: true,
    };

    await runMigrate(
      {
        allRoutes: false,
        checkAfterWrite: true,
        command: 'migrate',
        json: false,
        lib: false,
        mode: 'test',
        root,
        write: true,
      },
      {
        analyze: async () => migrationPlan,
        check: async (context) => {
          calls.push(`check:${context.command}:${context.root}:${context.mode}`);
        },
        doctor: async (context) => {
          calls.push(`doctor:${context.command}:${context.root}:${context.mode}`);
        },
        output: () => {},
        write: async () => {
          calls.push('write');
          return {
            backupDir: join(root, '.miko-migrate/backup'),
            removedFiles: [],
            targetFile: migrationPlan.targetFile,
          };
        },
      },
    );

    expect(calls).toEqual(['write', `doctor:doctor:${root}:test`, `check:check:${root}:test`]);
  });

  it('treats an already-current project as a successful no-op', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-migrate-current-'));
    roots.push(root);
    const write = vi.fn();
    const output: string[] = [];

    await expect(
      runMigrate(
        {
          allRoutes: false,
          checkAfterWrite: false,
          command: 'migrate',
          json: false,
          lib: false,
          mode: 'production',
          root,
          write: true,
        },
        {
          analyze: async () => ({
            root,
            sourceFiles: [join(root, 'miko.config.ts')],
            targetFile: join(root, 'miko.config.ts'),
            generatedSource: null,
            findings: [
              {
                code: 'MIKO_MIGRATE_CURRENT',
                file: 'miko.config.ts',
                level: 'info',
                message: 'current',
              },
            ],
            safeToWrite: false,
          }),
          output: (message) => output.push(message),
          write,
        },
      ),
    ).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    expect(output.join('\n')).toContain('Status: current');
    expect(output.at(-1)).toBe('No migration changes are required.');
  });
});
