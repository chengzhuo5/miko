import { spawn } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko';

const roots: string[] = [];
const cliPath = fileURLToPath(new URL('./miko', import.meta.url));
const workspaceNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));

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
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
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
        (options.dependencies ?? []).map(dependency => [dependency, '1.0.0']),
      ),
      ...(options.browserslist ? { browserslist: options.browserslist } : {}),
    }),
  );
  if (options.config) {
    await writeFile(
      resolve(root, 'miko.config.ts'),
      `export default ${JSON.stringify(options.config, null, 2)}`,
    );
  }
  return root;
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
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', code => {
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
  it('keeps zero-config projects on SSG, modern output, and bundled dependencies', async () => {
    const report = await readDoctor(await createProject());

    expect(report.rendering).toBe('ssg');
    expect(report.capabilities.legacy).toMatchObject({ enabled: false, source: 'default' });
    expect(report.capabilities.cdn).toMatchObject({ enabled: false, source: 'default' });
    expect(report.plugins).not.toContain('miko:legacy');
    expect(report.plugins).not.toContain('miko:external-cdn');
  });

  it('detects Pinia and one supported UI library from direct dependencies', async () => {
    const report = await readDoctor(
      await createProject({ dependencies: ['pinia', 'vant'] }),
    );

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
    const result = await runDoctor(
      await createProject({ dependencies: ['vant', 'element-plus'] }),
    );

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('[miko:MIKO_CAPABILITY_CONFLICT]');
  });

  it('enables Legacy for old targets and honors an explicit false override', async () => {
    const automatic = await readDoctor(
      await createProject({ browserslist: ['chrome 79'] }),
    );
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
