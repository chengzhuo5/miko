import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCommandContext } from './context';

describe('createCommandContext', () => {
  it('defaults dev to development and resolves an absolute root', () => {
    expect(createCommandContext({ command: 'dev', lib: false, json: false }, 'D:/repo')).toMatchObject({
      mode: 'development',
      modeArg: undefined,
      root: resolve('D:/repo'),
    });
  });

  it('defaults build and preview to production', () => {
    expect(createCommandContext({ command: 'build', lib: false, json: false }, 'D:/repo').mode).toBe(
      'production',
    );
    expect(
      createCommandContext({ command: 'preview', lib: false, json: false }, 'D:/repo').mode,
    ).toBe(
      'production',
    );
  });

  it('retains whether the mode was explicitly selected for dotenv loading', () => {
    expect(
      createCommandContext(
        { command: 'build', modeArg: 'test', lib: false, json: false },
        'D:/repo',
      ),
    ).toMatchObject({
      mode: 'test',
      modeArg: 'test',
    });
  });
});
