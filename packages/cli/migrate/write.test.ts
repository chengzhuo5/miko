import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeMigration } from './analyze';
import type { MigrationPlan } from './types';
import { atomicWriteFile, writeMigration } from './write';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'miko-migrate-write-'));
  roots.push(root);
  return root;
}

function plan(root: string, overrides: Partial<MigrationPlan> = {}): MigrationPlan {
  return {
    root,
    sourceFiles: [],
    targetFile: join(root, 'miko.config.ts'),
    generatedSource: "export default { miko: { rendering: 'spa' } }\n",
    findings: [],
    safeToWrite: true,
    ...overrides,
  };
}

describe('atomicWriteFile', () => {
  it('writes, fsyncs and closes before the atomic rename', async () => {
    const events: string[] = [];

    await atomicWriteFile('D:/project/miko.config.ts', 'generated', {
      pid: 42,
      openFile: async (path, flags) => {
        events.push(`open:${path}:${flags}`);
        return {
          close: async () => {
            events.push('close');
          },
          sync: async () => {
            events.push('sync');
          },
          writeFile: async (source) => {
            events.push(`write:${source}`);
          },
        };
      },
      removeFile: async (path) => {
        events.push(`remove:${path}`);
      },
      renameFile: async (from, to) => {
        events.push(`rename:${from}:${to}`);
      },
    });

    expect(events).toEqual([
      'open:D:/project/miko.config.ts.42.tmp:wx',
      'write:generated',
      'sync',
      'close',
      'rename:D:/project/miko.config.ts.42.tmp:D:/project/miko.config.ts',
    ]);
  });
});

describe('writeMigration', () => {
  it('refuses unsafe plans with exit code seven', async () => {
    const root = await project();

    await expect(writeMigration(plan(root, { safeToWrite: false }))).rejects.toMatchObject({
      code: 'MIKO_MIGRATE_UNSAFE',
      exitCode: 7,
    });
    await expect(access(join(root, '.miko-migrate'))).rejects.toThrow();
  });

  it('never overwrites an existing target that is not included in the backup sources', async () => {
    const root = await project();
    const targetFile = join(root, 'miko.config.ts');
    await writeFile(targetFile, 'user-owned target\n');

    await expect(writeMigration(plan(root))).rejects.toMatchObject({
      code: 'MIKO_MIGRATE_TARGET_EXISTS',
      exitCode: 7,
    });
    await expect(readFile(targetFile, 'utf8')).resolves.toBe('user-owned target\n');
  });

  it('backs up every source, writes atomically and removes obsolete vite.config.ts', async () => {
    const root = await project();
    const targetFile = join(root, 'miko.config.ts');
    const viteFile = join(root, 'vite.config.ts');
    const oldMiko = `export default { ssg: false }\n`;
    const oldVite = `export default await defineMikoConfig()\n`;
    await Promise.all([writeFile(targetFile, oldMiko), writeFile(viteFile, oldVite)]);
    const migration = plan(root, {
      sourceFiles: [targetFile, viteFile],
    });

    const result = await writeMigration(migration, {
      now: () => new Date('2026-08-10T00:00:00.000Z'),
      pid: 123,
    });

    expect(result.backupDir).toBe(join(root, '.miko-migrate', '2026-08-10T00-00-00.000Z'));
    await expect(readFile(join(result.backupDir, 'miko.config.ts'), 'utf8')).resolves.toBe(oldMiko);
    await expect(readFile(join(result.backupDir, 'vite.config.ts'), 'utf8')).resolves.toBe(oldVite);
    const recovery = await readFile(join(result.backupDir, 'RECOVER.md'), 'utf8');
    expect(recovery).toContain('Copy-Item -LiteralPath');
    expect(recovery).toContain("cp -- '.miko-migrate/2026-08-10T00-00-00.000Z/miko.config.ts'");
    await expect(readFile(targetFile, 'utf8')).resolves.toBe(migration.generatedSource);
    await expect(access(viteFile)).rejects.toThrow();
    await expect(access(`${targetFile}.123.tmp`)).rejects.toThrow();
  });

  it('keeps recovery data and no partial target when rename fails', async () => {
    const root = await project();
    const viteFile = join(root, 'vite.config.ts');
    await writeFile(viteFile, `export default await defineMikoConfig()\n`);
    const targetFile = join(root, 'miko.config.ts');

    await expect(
      writeMigration(
        plan(root, {
          sourceFiles: [viteFile],
          targetFile,
        }),
        {
          now: () => new Date('2026-08-10T01:00:00.000Z'),
          pid: 456,
          renameFile: vi.fn(async () => {
            throw new Error('rename failed');
          }),
        },
      ),
    ).rejects.toMatchObject({
      code: 'MIKO_MIGRATE_WRITE',
      exitCode: 7,
    });

    const backupDir = join(root, '.miko-migrate', '2026-08-10T01-00-00.000Z');
    await expect(readFile(join(backupDir, 'vite.config.ts'), 'utf8')).resolves.toContain(
      'defineMikoConfig',
    );
    await expect(readFile(join(backupDir, 'RECOVER.md'), 'utf8')).resolves.toContain(
      'vite.config.ts',
    );
    await expect(access(targetFile)).rejects.toThrow();
    await expect(access(`${targetFile}.456.tmp`)).rejects.toThrow();
    await expect(access(viteFile)).resolves.toBeUndefined();
  });

  it('never reuses an existing timestamped backup directory', async () => {
    const root = await project();
    const sourceFile = join(root, 'vite.config.ts');
    await writeFile(sourceFile, `export default await defineMikoConfig()\n`);
    const backupDir = join(root, '.miko-migrate', '2026-08-10T01-30-00.000Z');
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, 'sentinel.txt'), 'existing backup');

    await expect(
      writeMigration(
        plan(root, {
          sourceFiles: [sourceFile],
        }),
        {
          now: () => new Date('2026-08-10T01:30:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      code: 'MIKO_MIGRATE_WRITE',
      exitCode: 7,
    });

    await expect(readFile(join(backupDir, 'sentinel.txt'), 'utf8')).resolves.toBe(
      'existing backup',
    );
    await expect(access(sourceFile)).resolves.toBeUndefined();
  });

  it('produces no second backup after a successful migration is analyzed again', async () => {
    const root = await project();
    const targetFile = join(root, 'miko.config.ts');
    await writeFile(targetFile, `export default { ssg: false }\n`);
    const firstPlan = await analyzeMigration(root);
    await writeMigration(firstPlan, {
      now: () => new Date('2026-08-10T02:00:00.000Z'),
    });

    const secondPlan = await analyzeMigration(root);

    expect(secondPlan.safeToWrite).toBe(false);
    expect(secondPlan.findings).toContainEqual(
      expect.objectContaining({ code: 'MIKO_MIGRATE_CURRENT' }),
    );
    expect(await readdir(join(root, '.miko-migrate'))).toEqual(['2026-08-10T02-00-00.000Z']);
  });
});
