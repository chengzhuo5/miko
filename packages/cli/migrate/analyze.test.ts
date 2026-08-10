import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeMigration } from './analyze';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'miko-migrate-analyze-'));
  roots.push(root);
  return root;
}

describe('analyzeMigration', () => {
  it('combines a legacy flat Miko config and defineMikoConfig Vite config', async () => {
    const root = await project();
    await Promise.all([
      writeFile(
        join(root, 'miko.config.ts'),
        `export default {
  ssg: false,
  uiLibrary: 'vant',
  vue: { reactivityTransform: false },
}
`,
      ),
      writeFile(
        join(root, 'vite.config.ts'),
        `import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
export default await defineMikoConfig({
  base: '/legacy/',
  server: { port: 5173 },
})
`,
      ),
    ]);

    const plan = await analyzeMigration(root);

    expect(plan.safeToWrite).toBe(true);
    expect(plan.sourceFiles).toEqual([join(root, 'miko.config.ts'), join(root, 'vite.config.ts')]);
    expect(plan.targetFile).toBe(join(root, 'miko.config.ts'));
    expect(plan.generatedSource).toContain(`rendering: 'spa'`);
    expect(plan.generatedSource).toContain(`uiLibrary: 'vant'`);
    expect(plan.generatedSource).toContain(`vuePluginOptions:`);
    expect(plan.generatedSource).toContain(`base: '/legacy/'`);
    expect(plan.generatedSource).toContain(`port: 5173`);
    expect(plan.findings.some((finding) => finding.level === 'error')).toBe(false);
  });

  it('never executes source and marks dynamic or custom plugin logic for manual migration', async () => {
    const root = await project();
    const sentinel = join(root, 'executed.txt');
    await writeFile(
      join(root, 'vite.config.ts'),
      `import { writeFileSync } from 'node:fs'
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
import shared from './shared'
writeFileSync(${JSON.stringify(sentinel)}, 'executed')
export default defineMikoConfig({
  base: '/safe/',
  ...shared,
  plugins: [customPlugin()],
})
`,
    );

    const plan = await analyzeMigration(root);

    await expect(access(sentinel)).rejects.toThrow();
    expect(plan.safeToWrite).toBe(false);
    expect(plan.generatedSource).toContain(`base: '/safe/'`);
    expect(plan.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MIKO_MIGRATE_MANUAL',
          level: 'warning',
        }),
      ]),
    );
  });

  it('does not rewrite an already unified v1 config', async () => {
    const root = await project();
    await writeFile(
      join(root, 'miko.config.ts'),
      `export default {
  miko: { rendering: 'spa' },
  vite: { base: '/current/' },
}
`,
    );

    const plan = await analyzeMigration(root);

    expect(plan.generatedSource).toBeNull();
    expect(plan.safeToWrite).toBe(false);
    expect(plan.findings).toContainEqual(
      expect.objectContaining({
        code: 'MIKO_MIGRATE_CURRENT',
        level: 'info',
      }),
    );
  });

  it('reports function configs and conditional values without evaluating them', async () => {
    const root = await project();
    await writeFile(
      join(root, 'miko.config.ts'),
      `export default ({ mode }) => ({
  ssg: mode === 'production',
  uiLibrary: mode ? 'vant' : 'element-plus',
})
`,
    );

    const plan = await analyzeMigration(root);

    expect(plan.safeToWrite).toBe(false);
    expect(plan.generatedSource).toBeNull();
    expect(plan.findings).toContainEqual(
      expect.objectContaining({
        code: 'MIKO_MIGRATE_MANUAL',
        level: 'warning',
      }),
    );
  });

  it('maps legacy proxy, dev, output and two-argument defineMikoConfig fields', async () => {
    const root = await project();
    await Promise.all([
      writeFile(
        join(root, 'miko.config.ts'),
        `export default {
  outDir: 'build',
  proxy: [{ context: ['/api/**'], target: 'https://api.example.com', changeOrigin: true }],
  dev: { bundledDev: false, port: 5174 },
  ssg: { dirStyle: 'nested' },
  componentsPluginOptions: false,
}
`,
      ),
      writeFile(
        join(root, 'vite.config.ts'),
        `import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
export default defineMikoConfig(
  { uiLibrary: 'vant' },
  {
    resolve: { alias: { '@legacy': '/legacy' } },
    preview: { port: 4173 },
  },
)
`,
      ),
    ]);

    const plan = await analyzeMigration(root);

    expect(plan.safeToWrite).toBe(true);
    expect(plan.generatedSource).toContain(`componentsPluginOptions: false`);
    expect(plan.generatedSource).toContain(`ssgOptions:`);
    expect(plan.generatedSource).toContain(`devOptions:`);
    expect(plan.generatedSource).toContain(`bundledDev: false`);
    expect(plan.generatedSource).toContain(`outDir: 'build'`);
    expect(plan.generatedSource).toContain(`'/api':`);
    expect(plan.generatedSource).toContain(`port: 5174`);
    expect(plan.generatedSource).toContain(`preview:`);
    expect(plan.generatedSource).toContain(`'@legacy': '/legacy'`);
  });

  it('rejects conflicting values from multiple legacy sources', async () => {
    const root = await project();
    await Promise.all([
      writeFile(join(root, 'miko.config.ts'), `export default { dev: { port: 5174 } }\n`),
      writeFile(
        join(root, 'vite.config.ts'),
        `import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
export default defineMikoConfig({ server: { port: 5173 } })
`,
      ),
    ]);

    const plan = await analyzeMigration(root);

    expect(plan.safeToWrite).toBe(false);
    expect(plan.findings).toContainEqual(
      expect.objectContaining({
        code: 'MIKO_MIGRATE_CONFLICT',
        level: 'error',
      }),
    );
  });
});
