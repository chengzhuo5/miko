import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationGuidanceFiles = [
  '../../README.md',
  '../../AGENTS.md',
  '../../CLAUDE.md',
  '../../packages/vite-plugin-miko/README.md',
  '../../packages/to-miko/SKILL.md',
  '../../packages/to-miko/README.md',
  '../../packages/to-miko/references/common-diffs.md',
  '../../packages/to-miko/references/migration-steps.md',
  '../../packages/to-miko/references/plugin-map.json',
  '../../packages/to-miko/references/route-migration.md',
];

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
        'browser-check.ts',
        'check.ts',
        'context.ts',
        'doctor.ts',
        'errors.ts',
        'migrate/analyze.ts',
        'migrate/index.ts',
        'migrate/render.ts',
        'migrate/types.ts',
        'migrate/write.ts',
        'preview-config.ts',
        'run.ts',
        'static-check.ts',
        'static-manifest.ts',
      ]),
    );
    expect(packageJson.files).not.toContain('migrate');
  });

  it('ships a CLI-only zero-config starter', async () => {
    await expect(access(new URL('../../app/vite.config.ts', import.meta.url))).rejects.toThrow();
    await expect(access(new URL('../../app/miko.config.ts', import.meta.url))).rejects.toThrow();
  });

  it('keeps starter runtime sources free of demo delays and debug output', async () => {
    const sources = await Promise.all(
      [
        '../../app/index.ts',
        '../../app/pages/index.vue',
        '../../app/pages/page1.vue',
        '../../app/pages/page2.vue',
      ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
    );

    expect(sources.join('\n')).not.toMatch(
      /console\.(?:debug|info|log)|Promise\.withResolvers|setTimeout|Date\.now/u,
    );
  });

  it('documents the complete v1 migration and CLI contract', async () => {
    const guide = await readFile(new URL('../../docs/migration-v1.md', import.meta.url), 'utf8');

    expect(guide).toContain('miko.config.ts');
    expect(guide).toMatch(/\bmiko:\s*\{/u);
    expect(guide).toMatch(/\bvite:\s*\{/u);
    for (const command of ['dev', 'build', 'preview', 'check', 'doctor', 'migrate']) {
      expect(guide).toContain(`miko ${command}`);
    }
    expect(guide).toContain('Bun');
    expect(guide).toContain('Node.js + jiti');
  });

  it('keeps current migration guidance free of removed configuration contracts', async () => {
    const guidance = (
      await Promise.all(
        migrationGuidanceFiles.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
      )
    ).join('\n');

    expect(guidance).not.toMatch(/(?:创建|保留|更新)[^\n。]*vite\.config\.ts/u);
    expect(guidance).not.toMatch(/通过\s*vite\.config\.ts/u);
    expect(guidance).not.toMatch(/\bssg:\s*false\b/u);
    expect(guidance).not.toContain('Vite 配置模式');
    expect(guidance).not.toMatch(/defineMikoConfig\([\s\S]{0,300}\bplugins\s*:/u);
  });
});
