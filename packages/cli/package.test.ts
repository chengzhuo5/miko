import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('cli package', () => {
  it('declares Bun as the workspace package manager', async () => {
    const rootPackageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { packageManager?: string };

    expect(rootPackageJson.packageManager).toMatch(/^bun@/u);
  });

  it('publishes every typed dispatch module', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('./package.json', import.meta.url), 'utf8'),
    ) as { files?: string[] };

    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        'args.ts',
        'context.ts',
        'doctor.ts',
        'errors.ts',
        'preview-config.ts',
        'run.ts',
        'static-manifest.ts',
      ]),
    );
  });
});
