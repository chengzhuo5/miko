import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './args';

describe('parseCliArgs', () => {
  it('parses command, root, mode and lib', () => {
    expect(parseCliArgs(['build', '--root', 'app', '--env', 'test', '--lib'])).toMatchObject({
      command: 'build',
      rootArg: 'app',
      modeArg: 'test',
      lib: true,
    });
  });

  it('parses doctor JSON output', () => {
    expect(parseCliArgs(['doctor', '--root', 'app', '--json'])).toMatchObject({
      command: 'doctor',
      rootArg: 'app',
      json: true,
    });
  });

  it('rejects --json outside doctor', () => {
    expect(() => parseCliArgs(['build', '--json'])).toThrowError(
      expect.objectContaining({
        code: 'MIKO_CLI_ARGS',
        exitCode: 2,
      }),
    );
  });

  it('rejects unknown commands instead of dynamically importing a filename', () => {
    expect(() => parseCliArgs(['../../evil'])).toThrow(/未知命令/);
  });

  it('rejects invalid environment names', () => {
    expect(() => parseCliArgs(['build', '--env', '../test'])).toThrowError(
      expect.objectContaining({
        code: 'MIKO_CLI_ENV',
        exitCode: 2,
      }),
    );
  });

  it('rejects unknown flags and extra positional arguments', () => {
    for (const argv of [
      ['build', '--unknown'],
      ['build', 'extra'],
    ]) {
      expect(() => parseCliArgs(argv)).toThrowError(
        expect.objectContaining({
          code: 'MIKO_CLI_ARGS',
          exitCode: 2,
        }),
      );
    }
  });

  it('rejects duplicate root values with a structured CLI error', () => {
    expect(() => parseCliArgs(['build', '--root', 'app', '--root', 'other'])).toThrowError(
      expect.objectContaining({
        code: 'MIKO_CLI_ARGS',
        exitCode: 2,
      }),
    );
  });

  it('accepts global and command help without requiring a command', () => {
    expect(parseCliArgs(['--help'])).toMatchObject({ help: true });
    expect(parseCliArgs(['build', '--help'])).toMatchObject({ command: 'build', help: true });
  });
});
