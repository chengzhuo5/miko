import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import type { CommandContext } from './context';
import { runCheck, type CheckDependencies } from './check';

const roots: string[] = [];

function context(root: string): CommandContext {
  return {
    allRoutes: false,
    command: 'check',
    json: false,
    lib: false,
    mode: 'production',
    root,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('runCheck', () => {
  it('builds in an isolated directory and preserves the formal output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-check-project-'));
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'miko-check-output-'));
    const formalOutDir = join(root, 'dist');
    roots.push(root, temporaryRoot);
    await mkdir(formalOutDir);
    await writeFile(join(formalOutDir, 'sentinel.txt'), 'formal output');
    const output: string[] = [];
    const build = vi.fn<CheckDependencies['build']>(async (_context, options) => {
      options.onProjectResolved?.({
        outDir: formalOutDir,
      } as ResolvedMikoConfig);
      await mkdir(options.outputOverride!, { recursive: true });
      await writeFile(join(options.outputOverride!, 'checked.txt'), 'isolated output');
      return {
        project: { outDir: options.outputOverride! } as ResolvedMikoConfig,
        config: {},
        outDir: options.outputOverride!,
      };
    });

    await runCheck(context(root), {
      build,
      createTemporaryDirectory: async () => temporaryRoot,
      output: (message) => output.push(message),
      remove: async (path) => rm(path, { force: true, recursive: true }),
    });

    await expect(readFile(join(formalOutDir, 'sentinel.txt'), 'utf8')).resolves.toBe(
      'formal output',
    );
    await expect(readFile(join(temporaryRoot, 'checked.txt'), 'utf8')).rejects.toThrow();
    expect(output).toEqual([
      `[miko] Check 原始输出目录：${formalOutDir}`,
      `[miko] Check 隔离输出目录：${temporaryRoot}`,
      '[miko] Check 完成',
    ]);
  });

  it('cleans isolated output when the build fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-check-project-'));
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'miko-check-output-'));
    roots.push(root, temporaryRoot);
    const failure = new Error('build failed');

    await expect(
      runCheck(context(root), {
        build: async () => {
          throw failure;
        },
        createTemporaryDirectory: async () => temporaryRoot,
        output: () => {},
        remove: async (path) => rm(path, { force: true, recursive: true }),
      }),
    ).rejects.toBe(failure);

    await expect(readFile(join(temporaryRoot, 'anything'), 'utf8')).rejects.toThrow();
  });
});
