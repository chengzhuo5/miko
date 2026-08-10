import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCommandContext } from './context';

describe('createCommandContext', () => {
  it('defaults dev to development and resolves an absolute root', () => {
    expect(
      createCommandContext(
        { command: 'dev', lib: false, json: false, allRoutes: false },
        'D:/repo',
      ),
    ).toMatchObject({
      mode: 'development',
      modeArg: undefined,
      root: resolve('D:/repo'),
    });
  });

  it('defaults build and preview to production', () => {
    expect(
      createCommandContext(
        { command: 'build', lib: false, json: false, allRoutes: false },
        'D:/repo',
      ).mode,
    ).toBe('production');
    expect(
      createCommandContext(
        { command: 'preview', lib: false, json: false, allRoutes: false },
        'D:/repo',
      ).mode,
    ).toBe('production');
  });

  it('retains whether the mode was explicitly selected for dotenv loading', () => {
    expect(
      createCommandContext(
        { command: 'build', modeArg: 'test', lib: false, json: false, allRoutes: false },
        'D:/repo',
      ),
    ).toMatchObject({
      mode: 'test',
      modeArg: 'test',
    });
  });

  it('defaults check to production and preserves all-route coverage', () => {
    expect(
      createCommandContext(
        { command: 'check', lib: false, json: false, allRoutes: true },
        'D:/repo',
      ),
    ).toMatchObject({
      allRoutes: true,
      command: 'check',
      mode: 'production',
    });
  });

  it('defaults migrate to production and preserves write verification flags', () => {
    expect(
      createCommandContext(
        {
          command: 'migrate',
          lib: false,
          json: false,
          allRoutes: false,
          write: true,
          checkAfterWrite: true,
        },
        'D:/repo',
      ),
    ).toMatchObject({
      checkAfterWrite: true,
      command: 'migrate',
      mode: 'production',
      write: true,
    });
  });
});
