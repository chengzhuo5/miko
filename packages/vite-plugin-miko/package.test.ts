import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('vite-plugin-miko package', () => {
  it('ships every imported runtime directory', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('./package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      files?: string[];
    };

    expect(packageJson.dependencies?.browserslist).toBeDefined();
    expect(packageJson.files).toEqual(expect.arrayContaining(['capabilities/', 'config/']));
  });
});
