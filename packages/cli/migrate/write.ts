import { access, copyFile, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { MikoCliError } from '../errors';
import type { MigrationPlan } from './types';

interface AtomicFileHandle {
  writeFile(source: string, options?: { encoding: 'utf8' }): Promise<unknown>;
  sync(): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface AtomicWriteDependencies {
  pid: number;
  openFile(path: string, flags: 'wx'): Promise<AtomicFileHandle>;
  removeFile(path: string): Promise<unknown>;
  renameFile(from: string, to: string): Promise<unknown>;
}

export interface MigrationWriteDependencies extends AtomicWriteDependencies {
  copyFile(source: string, target: string): Promise<unknown>;
  makeDirectory(path: string, options: { recursive: boolean }): Promise<unknown>;
  now(): Date;
  pathExists(path: string): Promise<boolean>;
  writeTextFile(path: string, source: string): Promise<unknown>;
}

export interface MigrationWriteResult {
  backupDir: string;
  targetFile: string;
  removedFiles: string[];
}

const defaultDependencies: MigrationWriteDependencies = {
  copyFile,
  makeDirectory: (path, options) => mkdir(path, options),
  now: () => new Date(),
  openFile: (path, flags) => open(path, flags),
  pathExists: async (path) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  pid: process.pid,
  removeFile: (path) => rm(path, { force: true }),
  renameFile: rename,
  writeTextFile: (path, source) => writeFile(path, source, 'utf8'),
};

function migrationError(code: string, message: string, cause?: unknown): MikoCliError {
  return new MikoCliError(code, message, 7, cause);
}

function relativeSource(root: string, path: string): string {
  const file = relative(root, resolve(path));
  if (!file || file.startsWith('..') || isAbsolute(file)) {
    throw migrationError('MIKO_MIGRATE_SOURCE_OUTSIDE_ROOT', `迁移源文件不在项目根目录内：${path}`);
  }
  return file;
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function quotePowerShell(path: string): string {
  return `'${path.replaceAll("'", "''")}'`;
}

function quotePosix(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

function recoverySource(root: string, backupDir: string, sources: string[]): string {
  const backupRoot = relative(root, backupDir);
  const entries = sources.map((source) => {
    const file = relativeSource(root, source);
    return {
      backupPowerShell: join(backupRoot, file),
      backupPosix: toPosix(join(backupRoot, file)),
      targetPowerShell: file,
      targetPosix: toPosix(file),
    };
  });
  return [
    '# Miko migration recovery',
    '',
    'The migration backup is complete. Run the commands from the project root.',
    'These commands copy files back and do not delete any current files.',
    '',
    '## PowerShell',
    '',
    '```powershell',
    ...entries.map(
      (entry) =>
        `Copy-Item -LiteralPath ${quotePowerShell(entry.backupPowerShell)} -Destination ${quotePowerShell(entry.targetPowerShell)} -Force`,
    ),
    '```',
    '',
    '## POSIX shell',
    '',
    '```sh',
    ...entries.map(
      (entry) => `cp -- ${quotePosix(entry.backupPosix)} ${quotePosix(entry.targetPosix)}`,
    ),
    '```',
    '',
  ].join('\n');
}

function backupTimestamp(date: Date): string {
  return date.toISOString().replaceAll(':', '-');
}

export async function atomicWriteFile(
  targetFile: string,
  source: string,
  overrides: Partial<AtomicWriteDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const temporaryFile = `${targetFile}.${dependencies.pid}.tmp`;
  let handle: AtomicFileHandle | undefined;
  let closed = false;
  try {
    handle = await dependencies.openFile(temporaryFile, 'wx');
    await handle.writeFile(source, { encoding: 'utf8' });
    await handle.sync();
    await handle.close();
    closed = true;
    await dependencies.renameFile(temporaryFile, targetFile);
  } catch (error) {
    if (handle && !closed) {
      try {
        await handle.close();
      } catch {}
    }
    try {
      await dependencies.removeFile(temporaryFile);
    } catch {}
    throw error;
  }
}

export async function writeMigration(
  plan: MigrationPlan,
  overrides: Partial<MigrationWriteDependencies> = {},
): Promise<MigrationWriteResult> {
  if (!plan.safeToWrite) {
    throw migrationError('MIKO_MIGRATE_UNSAFE', '迁移计划包含需要人工处理的内容，拒绝写入');
  }

  const dependencies = { ...defaultDependencies, ...overrides };
  const root = resolve(plan.root);
  const targetFile = resolve(plan.targetFile);
  relativeSource(root, targetFile);
  const sourceFiles = plan.sourceFiles.map((file) => resolve(file));
  const sourceSet = new Set(sourceFiles);
  if ((await dependencies.pathExists(targetFile)) && !sourceSet.has(targetFile)) {
    throw migrationError(
      'MIKO_MIGRATE_TARGET_EXISTS',
      `目标文件已存在且不属于迁移源，拒绝覆盖：${targetFile}`,
    );
  }

  const backupDir = join(root, '.miko-migrate', backupTimestamp(dependencies.now()));
  try {
    await dependencies.makeDirectory(dirname(backupDir), { recursive: true });
    await dependencies.makeDirectory(backupDir, { recursive: false });
    for (const source of sourceFiles) {
      const file = relativeSource(root, source);
      const backupFile = join(backupDir, file);
      await dependencies.makeDirectory(dirname(backupFile), { recursive: true });
      await dependencies.copyFile(source, backupFile);
    }
    await dependencies.writeTextFile(
      join(backupDir, 'RECOVER.md'),
      recoverySource(root, backupDir, sourceFiles),
    );

    if (plan.generatedSource === null) {
      for (const source of sourceFiles) await dependencies.removeFile(source);
    } else {
      await dependencies.makeDirectory(dirname(targetFile), { recursive: true });
      await atomicWriteFile(targetFile, plan.generatedSource, dependencies);
      for (const source of sourceFiles) {
        if (source !== targetFile) await dependencies.removeFile(source);
      }
    }

    return {
      backupDir,
      targetFile,
      removedFiles: sourceFiles.filter(
        (source) => plan.generatedSource === null || source !== targetFile,
      ),
    };
  } catch (error) {
    if (error instanceof MikoCliError) throw error;
    throw migrationError('MIKO_MIGRATE_WRITE', `迁移写入失败；恢复数据保留在 ${backupDir}`, error);
  }
}
