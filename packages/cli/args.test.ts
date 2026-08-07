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
});
