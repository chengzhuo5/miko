import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli, type CommandRunners } from './run';
import type { CommandContext } from './context';

type LegacyEnvironmentRunner = (
  context: CommandContext,
  loader: () => Promise<unknown>,
) => Promise<void>;

async function loadLegacyEnvironmentRunner(): Promise<LegacyEnvironmentRunner> {
  const runModule = (await import('./run')) as {
    runWithLegacyEnvironment?: LegacyEnvironmentRunner;
  };
  expect(runModule.runWithLegacyEnvironment).toBeTypeOf('function');
  return runModule.runWithLegacyEnvironment!;
}

describe('runCli', () => {
  it('dispatches a parsed build context', async () => {
    const build = vi.fn<CommandRunners['build']>().mockResolvedValue(undefined);

    await runCli(['build', '--root', 'app'], {
      cwd: () => 'D:/repo',
      runners: {
        build,
        dev: vi.fn<CommandRunners['dev']>(),
        preview: vi.fn<CommandRunners['preview']>(),
      },
    });

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'build',
        root: resolve('D:/repo', 'app'),
        mode: 'production',
      }),
    );
  });

  it('sets and restores the legacy process environment after success', async () => {
    const runWithLegacyEnvironment = await loadLegacyEnvironmentRunner();
    const originalCwd = process.cwd();
    const originalMode = process.env.MIKO_MODE;
    const originalLibMode = process.env.MIKO_LIB_MODE;
    const root = await mkdtemp(join(tmpdir(), 'miko-cli-run-'));

    try {
      process.env.MIKO_MODE = 'before-mode';
      delete process.env.MIKO_LIB_MODE;

      await runWithLegacyEnvironment(
        {
          command: 'build',
          root,
          mode: 'test',
          lib: true,
        },
        async () => {
          expect(process.cwd()).toBe(root);
          expect(process.env.MIKO_MODE).toBe('test');
          expect(process.env.MIKO_LIB_MODE).toBe('1');
        },
      );

      expect(process.cwd()).toBe(originalCwd);
      expect(process.env.MIKO_MODE).toBe('before-mode');
      expect(process.env.MIKO_LIB_MODE).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      if (originalMode === undefined) delete process.env.MIKO_MODE;
      else process.env.MIKO_MODE = originalMode;
      if (originalLibMode === undefined) delete process.env.MIKO_LIB_MODE;
      else process.env.MIKO_LIB_MODE = originalLibMode;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('restores absent and existing legacy values when the loader throws', async () => {
    const runWithLegacyEnvironment = await loadLegacyEnvironmentRunner();
    const originalCwd = process.cwd();
    const originalMode = process.env.MIKO_MODE;
    const originalLibMode = process.env.MIKO_LIB_MODE;
    const root = await mkdtemp(join(tmpdir(), 'miko-cli-run-'));
    const failure = new Error('legacy loader failed');

    try {
      delete process.env.MIKO_MODE;
      process.env.MIKO_LIB_MODE = 'before-lib';

      await expect(
        runWithLegacyEnvironment(
          {
            command: 'preview',
            root,
            mode: 'production',
            lib: false,
          },
          async () => {
            expect(process.cwd()).toBe(root);
            expect(process.env.MIKO_MODE).toBe('production');
            expect(process.env.MIKO_LIB_MODE).toBeUndefined();
            throw failure;
          },
        ),
      ).rejects.toBe(failure);

      expect(process.cwd()).toBe(originalCwd);
      expect(process.env.MIKO_MODE).toBeUndefined();
      expect(process.env.MIKO_LIB_MODE).toBe('before-lib');
    } finally {
      process.chdir(originalCwd);
      if (originalMode === undefined) delete process.env.MIKO_MODE;
      else process.env.MIKO_MODE = originalMode;
      if (originalLibMode === undefined) delete process.env.MIKO_LIB_MODE;
      else process.env.MIKO_LIB_MODE = originalLibMode;
      await rm(root, { recursive: true, force: true });
    }
  });
});
