import { describe, expect, it } from 'vitest';
import { MikoCliError } from './errors';

type ErrorNormalizer = (error: unknown) => MikoCliError;

async function loadErrorNormalizer(): Promise<ErrorNormalizer> {
  const errors = (await import('./errors')) as {
    toMikoCliError?: ErrorNormalizer;
  };
  expect(errors.toMikoCliError).toBeTypeOf('function');
  return errors.toMikoCliError!;
}

describe('toMikoCliError', () => {
  it('preserves CLI errors and maps structured Miko errors without importing their class', async () => {
    const toMikoCliError = await loadErrorNormalizer();
    const cliError = new MikoCliError('MIKO_CLI_COMMAND', 'bad command', 2);
    const configError = Object.assign(new Error('bad config'), { code: 'MIKO_CONFIG_LOAD' });

    expect(toMikoCliError(cliError)).toBe(cliError);
    expect(toMikoCliError(configError)).toMatchObject({
      code: 'MIKO_CONFIG_LOAD',
      exitCode: 2,
      cause: configError,
    });
  });

  it('maps unknown failures to exit code one', async () => {
    const toMikoCliError = await loadErrorNormalizer();
    const failure = new Error('boom');

    expect(toMikoCliError(failure)).toMatchObject({
      code: 'MIKO_UNEXPECTED',
      message: 'boom',
      exitCode: 1,
      cause: failure,
    });
  });

  it('maps capability failures to exit code three', async () => {
    const toMikoCliError = await loadErrorNormalizer();
    const failure = Object.assign(new Error('ambiguous UI libraries'), {
      code: 'MIKO_CAPABILITY_CONFLICT',
    });

    expect(toMikoCliError(failure)).toMatchObject({
      code: 'MIKO_CAPABILITY_CONFLICT',
      exitCode: 3,
      cause: failure,
    });
  });
});
