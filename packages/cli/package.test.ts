import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('cli package', () => {
  it('publishes every typed dispatch module', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('./package.json', import.meta.url), 'utf8'),
    ) as { files?: string[] };

    expect(packageJson.files).toEqual(
      expect.arrayContaining(['args.ts', 'context.ts', 'errors.ts', 'run.ts']),
    );
  });
});
