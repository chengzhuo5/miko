import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('cli entry', () => {
  it('keeps miko lazy and uses only literal legacy command loaders', async () => {
    const [buildSource, indexSource, runSource] = await Promise.all([
      readFile(new URL('./build.ts', import.meta.url), 'utf8'),
      readFile(new URL('./index.ts', import.meta.url), 'utf8'),
      readFile(new URL('./run.ts', import.meta.url), 'utf8'),
    ]);

    expect(indexSource).not.toContain('@minar-kotonoha/vite-plugin-miko');
    expect(buildSource).not.toContain('pnpm');
    expect(buildSource).not.toContain('NODE_PATH');
    expect(runSource).toContain("import('./build.ts')");
    expect(runSource).toContain("import('./dev.ts')");
    expect(runSource).toContain("import('./preview.ts')");
    expect(runSource).toContain('.runBuild');
    expect(runSource).toContain('.runDev');
    expect(runSource).toContain('.runPreview');
    expect(runSource).not.toMatch(/import\(`\.\/\$\{/u);
  });
});
