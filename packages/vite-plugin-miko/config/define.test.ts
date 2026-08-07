import { describe, expect, it } from 'vitest';
import { defineMikoConfig } from './define';
import type { MikoUserConfig } from '../types';

const namespacedConfig: MikoUserConfig = {
  miko: { rendering: 'spa' },
  vite: { base: '/cms/' },
};
void namespacedConfig;

// @ts-expect-error rejects misspelled top-level options
defineMikoConfig({ miko: { rendering: 'spa' }, mikoo: {} });
// @ts-expect-error rejects misspelled Miko options
defineMikoConfig({ miko: { rendering: 'spa', renderng: 'spa' } });
// @ts-expect-error rejects misspelled Vite options
defineMikoConfig({ vite: { base: '/cms/', baas: '/cms/' } });
// @ts-expect-error Vite dev-server options belong in vite.server
defineMikoConfig({ miko: { devOptions: { port: 5173 } } });

describe('defineMikoConfig', () => {
  it('returns an empty object when called without arguments', () => {
    expect(defineMikoConfig()).toEqual({});
  });

  it('returns the same object without mutation', () => {
    const config = {
      miko: { rendering: 'spa' as const },
      vite: { base: '/cms/' },
    };

    expect(defineMikoConfig(config)).toBe(config);
  });

  it('returns the same config function', () => {
    const config = () => ({ miko: { rendering: 'ssg' as const } });

    expect(defineMikoConfig(config)).toBe(config);
  });
});
