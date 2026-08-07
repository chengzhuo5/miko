import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  it('prints help without dispatching a command', async () => {
    const output = vi.fn<(message: string) => void>();
    const runners = {
      build: vi.fn<CommandRunners['build']>(),
      dev: vi.fn<CommandRunners['dev']>(),
      preview: vi.fn<CommandRunners['preview']>(),
    };

    await runCli(['build', '--help'], {
      cwd: () => 'D:/repo',
      output,
      runners,
    });

    expect(output).toHaveBeenCalledWith(expect.stringContaining('miko build'));
    expect(runners.build).not.toHaveBeenCalled();
    expect(runners.dev).not.toHaveBeenCalled();
    expect(runners.preview).not.toHaveBeenCalled();
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

  it('restores dotenv variables that did not exist before the command', async () => {
    const runWithLegacyEnvironment = await loadLegacyEnvironmentRunner();
    const originalCwd = process.cwd();
    const root = await mkdtemp(join(tmpdir(), 'miko-cli-run-env-'));
    const envName = 'MIKO_TEST_TRANSIENT_ENV';

    try {
      delete process.env[envName];
      await writeFile(join(root, '.env.test'), `${envName}=from-dotenv\n`);

      await runWithLegacyEnvironment(
        {
          command: 'build',
          root,
          mode: 'test',
          modeArg: 'test',
          lib: false,
        },
        async () => {
          expect(process.env[envName]).toBe('from-dotenv');
        },
      );

      expect(process.env[envName]).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      delete process.env[envName];
      await rm(root, { recursive: true, force: true });
    }
  });

  it('serializes concurrent legacy environments so cwd and env cannot overlap', async () => {
    const runWithLegacyEnvironment = await loadLegacyEnvironmentRunner();
    const originalCwd = process.cwd();
    const firstRoot = await mkdtemp(join(tmpdir(), 'miko-cli-run-first-'));
    const secondRoot = await mkdtemp(join(tmpdir(), 'miko-cli-run-second-'));
    const { promise: firstEntered, resolve: markFirstEntered } = Promise.withResolvers<void>();
    const { promise: releaseFirst, resolve: finishFirst } = Promise.withResolvers<void>();
    let secondEntered = false;

    try {
      const first = runWithLegacyEnvironment(
        {
          command: 'build',
          root: firstRoot,
          mode: 'first',
          modeArg: 'first',
          lib: false,
        },
        async () => {
          markFirstEntered();
          await releaseFirst;
          expect(process.cwd()).toBe(firstRoot);
          expect(process.env.MIKO_MODE).toBe('first');
        },
      );

      await firstEntered;
      const second = runWithLegacyEnvironment(
        {
          command: 'preview',
          root: secondRoot,
          mode: 'second',
          modeArg: 'second',
          lib: false,
        },
        async () => {
          secondEntered = true;
          expect(process.cwd()).toBe(secondRoot);
          expect(process.env.MIKO_MODE).toBe('second');
        },
      );

      await new Promise<void>((resolveTick) => setImmediate(resolveTick));
      const overlapped = secondEntered;
      finishFirst();
      await Promise.all([first, second]);

      expect(overlapped).toBe(false);
      expect(process.cwd()).toBe(originalCwd);
    } finally {
      finishFirst();
      process.chdir(originalCwd);
      await Promise.all([
        rm(firstRoot, { recursive: true, force: true }),
        rm(secondRoot, { recursive: true, force: true }),
      ]);
    }
  });
});
