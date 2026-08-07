import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('performance package', () => {
  it('is private and launches every benchmark command through Node', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('./package.json', import.meta.url), 'utf8'),
    ) as {
      private?: boolean;
      scripts?: Record<string, string>;
    };

    expect(packageJson.private).toBe(true);
    for (const command of ['baseline', 'measure', 'check']) {
      expect(packageJson.scripts?.[command]).toBe(`node runner.mjs ${command}`);
    }
  });
});
