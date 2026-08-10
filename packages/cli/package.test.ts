import { access, readFile } from 'node:fs/promises';
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
        'check.ts',
        'context.ts',
        'doctor.ts',
        'errors.ts',
        'preview-config.ts',
        'run.ts',
        'static-check.ts',
        'static-manifest.ts',
      ]),
    );
  });

  it('ships a CLI-only zero-config starter', async () => {
    await expect(access(new URL('../../app/vite.config.ts', import.meta.url))).rejects.toThrow();
    await expect(access(new URL('../../app/miko.config.ts', import.meta.url))).rejects.toThrow();
  });

  it('keeps starter runtime sources free of demo delays and debug output', async () => {
    const sources = await Promise.all(
      ['../../app/index.ts', '../../app/pages/index.vue', '../../app/pages/page1.vue', '../../app/pages/page2.vue'].map(
        (file) => readFile(new URL(file, import.meta.url), 'utf8'),
      ),
    );

    expect(sources.join('\n')).not.toMatch(
      /console\.(?:debug|info|log)|Promise\.withResolvers|setTimeout|Date\.now/u,
    );
  });
});
