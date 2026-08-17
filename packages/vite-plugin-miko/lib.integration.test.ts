import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import type { ResolvedMikoConfig } from './config/types';
import { createLibConfig } from './index';

const roots: string[] = [];
const workspaceNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));

async function createLibraryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'miko-lib-postcss-'));
  roots.push(root);
  await symlink(
    workspaceNodeModules,
    resolve(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await mkdir(resolve(root, 'src'), { recursive: true });
  await writeFile(resolve(root, 'package.json'), '{"name":"fixture-library","type":"module"}');
  await writeFile(resolve(root, 'src/index.ts'), "import './style.css'\nexport const value = 1\n");
  await writeFile(resolve(root, 'src/style.css'), '.fixture { width: 20px }');
  await writeFile(
    resolve(root, 'postcss.config.cjs'),
    `module.exports = {
  plugins: [{
    postcssPlugin: 'fixture-px-to-rem',
    Declaration(decl) {
      decl.value = decl.value.replace(/20px/g, '1rem')
    },
  }],
}`,
  );
  return root;
}

function libraryProject(root: string): ResolvedMikoConfig {
  return {
    viteRoot: root,
    outDir: resolve(root, 'dist'),
    vite: { publicDir: false },
    miko: {
      lib: { entry: 'src/index.ts' },
      vuePluginOptions: {},
      vueJsxPluginOptions: {},
      unoCSSPluginOptions: false,
    },
  } as ResolvedMikoConfig;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('miko build --lib CSS isolation', () => {
  it('does not automatically apply the application PostCSS transform', async () => {
    const root = await createLibraryFixture();
    const config = createLibConfig({ config: libraryProject(root) });
    const result = await build({
      ...config,
      configFile: false,
      logLevel: 'silent',
      build: {
        ...config.build,
        minify: false,
        write: false,
      },
    });
    const builds = Array.isArray(result) ? result : [result];
    const css = builds
      .flatMap((buildResult) => ('output' in buildResult ? buildResult.output : []))
      .filter((output) => output.type === 'asset' && output.fileName.endsWith('.css'))
      .map((output) =>
        typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source),
      )
      .join('\n');

    expect(css).toContain('20px');
    expect(css).not.toContain('1rem');
  });

  it('allows an explicit Vite PostCSS configuration', async () => {
    const root = await createLibraryFixture();
    const project = libraryProject(root);
    project.vite.css = { postcss: resolve(root, 'postcss.config.cjs') };
    const config = createLibConfig({ config: project });
    const result = await build({
      ...config,
      configFile: false,
      logLevel: 'silent',
      build: {
        ...config.build,
        minify: false,
        write: false,
      },
    });
    const builds = Array.isArray(result) ? result : [result];
    const css = builds
      .flatMap((buildResult) => ('output' in buildResult ? buildResult.output : []))
      .filter((output) => output.type === 'asset' && output.fileName.endsWith('.css'))
      .map((output) =>
        typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source),
      )
      .join('\n');

    expect(css).toContain('1rem');
  });
});
