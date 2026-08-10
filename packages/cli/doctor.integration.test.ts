import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko';

const roots: string[] = [];
const cliPath = fileURLToPath(new URL('./miko', import.meta.url));
const workspaceNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));
const workspaceMikoPackage = fileURLToPath(new URL('../vite-plugin-miko', import.meta.url));

interface DoctorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface DoctorJson {
  rendering: 'ssg' | 'spa';
  capabilities: Record<
    string,
    {
      enabled: boolean;
      source: string;
      reason: string;
      value?: unknown;
    }
  >;
  plugins: string[];
}

interface ProjectOptions {
  dependencies?: string[];
  browserslist?: string[];
  config?: MikoUserConfig;
  legacyConfigSource?: string;
  application?: boolean;
}

function withoutTypeScriptBridgeStatus(stderr: string): string {
  return stderr.replace(/(?:^|\n)┌─+┐\n│\s+✅\s+TNB ACTIVE[^\n]*│\n└─+┘(?:\n|$)/u, '').trim();
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createProject(options: ProjectOptions = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'miko-doctor-'));
  roots.push(root);
  await symlink(
    workspaceNodeModules,
    resolve(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await writeFile(
    resolve(root, 'package.json'),
    JSON.stringify({
      name: 'miko-doctor-fixture',
      private: true,
      dependencies: Object.fromEntries(
        (options.dependencies ?? []).map((dependency) => [dependency, '1.0.0']),
      ),
      ...(options.browserslist ? { browserslist: options.browserslist } : {}),
    }),
  );
  if (options.legacyConfigSource) {
    await writeFile(resolve(root, 'miko.config.ts'), options.legacyConfigSource);
  } else if (options.config) {
    await writeFile(
      resolve(root, 'miko.config.ts'),
      `export default ${JSON.stringify(options.config, null, 2)}`,
    );
  }
  if (options.application) {
    await mkdir(resolve(root, 'pages'));
    await Promise.all([
      writeFile(
        resolve(root, 'tsconfig.json'),
        `${JSON.stringify(
          {
            include: ['**/*.ts', '**/*.vue'],
            compilerOptions: {
              baseUrl: '.',
              lib: ['ESNext', 'DOM', 'DOM.Iterable'],
              module: 'ESNext',
              moduleResolution: 'Bundler',
              noEmit: true,
              skipLibCheck: true,
              strict: true,
              target: 'ESNext',
              types: ['vite/client'],
              paths: {
                '@minar-kotonoha/vite-plugin-miko': [workspaceMikoPackage],
              },
            },
          },
          null,
          2,
        )}\n`,
      ),
      writeFile(
        resolve(root, 'pages/index.vue'),
        '<template><main id="migration-check-page">Ready</main></template>\n',
      ),
    ]);
  }
  return root;
}

async function runMigrate(root: string, check = false): Promise<DoctorResult> {
  return await new Promise<DoctorResult>((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, 'migrate', '--root', root, '--write', ...(check ? ['--check'] : [])],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        env: { ...process.env, NO_COLOR: '1' },
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolveResult({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function runDoctor(root: string): Promise<DoctorResult> {
  return await new Promise<DoctorResult>((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, 'doctor', '--root', root, '--json'], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolveResult({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function readDoctor(root: string): Promise<DoctorJson> {
  const result = await runDoctor(root);
  if (result.exitCode !== 0 || result.stderr) {
    throw new Error(result.stderr || `Doctor exited with code ${result.exitCode}`);
  }
  return JSON.parse(result.stdout) as DoctorJson;
}

describe('miko doctor automatic capability matrix under Node.js', () => {
  it('validates a written legacy migration through the real Node CLI', async () => {
    const root = await createProject({
      application: true,
      legacyConfigSource: `export default { ssg: false, linter: false }\n`,
    });

    const result = await runMigrate(root, true);

    expect(result.exitCode).toBe(0);
    expect(withoutTypeScriptBridgeStatus(result.stderr)).toBe('');
    expect(result.stdout).toContain('Miko Doctor');
    expect(result.stdout).toContain('Migration written');
    expect(result.stdout).toContain('[miko] Check 完成');
    const source = await readFile(join(root, 'miko.config.ts'), 'utf8');
    expect(source).toContain('miko:');
    expect(source).toContain(`rendering: 'spa'`);
    expect(await readdir(join(root, '.miko-migrate'))).toHaveLength(1);
  }, 120_000);

  it('keeps zero-config projects on SSG, modern output, and bundled dependencies', async () => {
    const report = await readDoctor(await createProject());

    expect(report.rendering).toBe('ssg');
    expect(report.capabilities.legacy).toMatchObject({ enabled: false, source: 'default' });
    expect(report.capabilities.cdn).toMatchObject({ enabled: false, source: 'default' });
    expect(report.plugins).not.toContain('miko:legacy');
    expect(report.plugins).not.toContain('miko:external-cdn');
  });

  it('detects Pinia and one supported UI library from direct dependencies', async () => {
    const report = await readDoctor(await createProject({ dependencies: ['pinia', 'vant'] }));

    expect(report.capabilities.pinia).toMatchObject({ enabled: true, source: 'dependency' });
    expect(report.capabilities.uiLibrary).toMatchObject({
      enabled: true,
      source: 'dependency',
      value: 'vant',
    });
    expect(report.plugins).toContain('miko:runtime');
    expect(report.plugins).toContain('miko:components');
  });

  it('rejects ambiguous UI libraries before Vite starts', async () => {
    const result = await runDoctor(await createProject({ dependencies: ['vant', 'element-plus'] }));

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('[miko:MIKO_CAPABILITY_CONFLICT]');
  });

  it('enables Legacy for old targets and honors an explicit false override', async () => {
    const automatic = await readDoctor(await createProject({ browserslist: ['chrome 79'] }));
    const disabled = await readDoctor(
      await createProject({
        browserslist: ['ie 11'],
        config: { miko: { legacyPluginOptions: false } },
      }),
    );

    expect(automatic.capabilities.legacy).toMatchObject({
      enabled: true,
      source: 'convention',
    });
    expect(automatic.plugins).toContain('miko:legacy');
    expect(disabled.capabilities.legacy).toMatchObject({
      enabled: false,
      source: 'explicit',
    });
    expect(disabled.plugins).not.toContain('miko:legacy');
  });

  it('enables CDN only from an explicit framework URL', async () => {
    const report = await readDoctor(
      await createProject({
        dependencies: ['@minar-kotonoha/framework'],
        config: {
          miko: {
            externalOptions: {
              frameworkCDN: 'https://cdn.example.com/framework.umd.js',
            },
          },
        },
      }),
    );

    expect(report.capabilities.cdn).toMatchObject({ enabled: true, source: 'explicit' });
    expect(report.plugins).toContain('miko:external-cdn');
  });

  it('uses exit code three for an explicitly enabled missing Janus integration', async () => {
    const result = await runDoctor(
      await createProject({ config: { miko: { janusOptions: true } } }),
    );

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('[miko:MIKO_CAPABILITY_MISSING_DEPENDENCY]');
  });

  it('reports explicit SPA rendering without changing the Node runtime path', async () => {
    const report = await readDoctor(
      await createProject({ config: { miko: { rendering: 'spa' } } }),
    );

    expect(report.rendering).toBe('spa');
  });
});
