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

  it('documents the Bun runner boundary and keeps generated results out of Git', async () => {
    const [readme, gitignore] = await Promise.all([
      readFile(new URL('./README.md', import.meta.url), 'utf8'),
      readFile(new URL('../../.gitignore', import.meta.url), 'utf8'),
    ]);

    expect(readme).toContain('Bun');
    expect(readme).toContain('process.execPath');
    expect(readme).toContain('3 cold');
    expect(readme).toContain('5 warm');
    expect(readme).toContain('5 browser');
    expect(gitignore).toContain('packages/performance/results/');
  });
});
