import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import type { UserConfig } from 'vite';
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

async function buildLibraryCss(config: UserConfig): Promise<string> {
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
  return builds
    .flatMap((buildResult) => ('output' in buildResult ? buildResult.output : []))
    .filter((output) => output.type === 'asset' && output.fileName.endsWith('.css'))
    .map((output) =>
      typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source),
    )
    .join('\n');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('miko build --lib CSS isolation', () => {
  it('does not automatically apply the application PostCSS transform', async () => {
    const root = await createLibraryFixture();
    const config = createLibConfig({ config: libraryProject(root) });
    const css = await buildLibraryCss(config);

    expect(css).toContain('20px');
    expect(css).not.toContain('1rem');
  });

  it('allows an explicit Vite PostCSS configuration', async () => {
    const root = await createLibraryFixture();
    const project = libraryProject(root);
    project.vite.css = { postcss: resolve(root, 'postcss.config.cjs') };
    const config = createLibConfig({ config: project });
    const css = await buildLibraryCss(config);

    expect(css).toContain('1rem');
  });

  it('scopes emitted CSS without losing explicit PostCSS plugins', async () => {
    const root = await createLibraryFixture();
    const scope = '[data-miko-lib="fixture"]';
    await writeFile(
      resolve(root, 'src/style.css'),
      [
        '.fixture, .secondary { width: 20px }',
        ':root { --fixture-color: red }',
        'html .nested, body .from-body, #app > .from-app { color: red }',
        '@media (min-width: 1px) { .media { display: block } }',
        '@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }',
      ].join('\n'),
    );
    const project = libraryProject(root);
    project.miko.lib = { ...project.miko.lib, cssScope: scope };
    project.vite.css = {
      postcss: {
        plugins: [
          {
            postcssPlugin: 'fixture-explicit-plugin',
            Declaration(decl: { prop: string; value: string }) {
              if (decl.prop === 'width') decl.value = '21px';
            },
          } as never,
        ],
      },
    };

    const css = (await buildLibraryCss(createLibConfig({ config: project }))).replace(/\s+/g, '');

    expect(css).toContain(`${scope}.fixture`);
    expect(css).toContain(`${scope}.secondary`);
    expect(css).toContain(`${scope}{--fixture-color:red}`);
    expect(css).toContain(`${scope}.nested`);
    expect(css).toContain(`${scope}.from-body`);
    expect(css).toContain(`${scope}>.from-app`);
    expect(css).toContain(`${scope}.media`);
    expect(css).toContain('@keyframespulse{from{opacity:0}to{opacity:1}}');
    expect(css).toContain('width:21px');
  });
});
