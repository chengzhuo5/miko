import { spawnSync } from 'node:child_process';
import { cpus } from 'node:os';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { version as viteVersion } from 'vite';
import { measureBuildSuite } from './build';
import type {
  BuildFixtureName,
  BuildMetrics,
  BuildPerformanceReport,
  EnvironmentFingerprint,
} from './types';

const FIXTURES: BuildFixtureName[] = ['small', 'medium', 'large', 'runtime'];
const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const baselinePath = join(packageRoot, 'baselines', 'miko-v1-slice-3-before.json');
const resultPath = join(packageRoot, 'results', 'miko-v1-slice-3-current.json');

async function readBunVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(join(workspaceRoot, 'package.json'), 'utf8'),
  ) as { packageManager?: string };
  return packageJson.packageManager?.replace(/^bun@/u, '') ?? 'unknown';
}

function readCommit(): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

async function environmentFingerprint(): Promise<EnvironmentFingerprint> {
  return {
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? 'unknown',
    node: process.versions.node,
    bun: await readBunVersion(),
    vite: viteVersion,
  };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function measureBuildReport(): Promise<BuildPerformanceReport> {
  const parent = await mkdtemp(join(tmpdir(), 'miko-performance-baseline-'));
  try {
    const build = await measureBuildSuite(parent, {
      coldSamples: 3,
      warmSamples: 5,
      fixtures: FIXTURES,
      onFixtureStart(fixture) {
        console.log(`[miko:perf] measuring ${fixture}`);
      },
    });
    if (FIXTURES.some(fixture => !build[fixture])) {
      throw new Error('Performance build suite did not return every fixture');
    }

    return {
      schemaVersion: 1,
      environment: await environmentFingerprint(),
      createdAt: new Date().toISOString(),
      commit: readCommit(),
      workerRuntime: process.execPath,
      build: build as Record<BuildFixtureName, BuildMetrics>,
    };
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

export async function runPerformanceCli(argv: string[]): Promise<void> {
  const command = argv[0];
  if (command !== 'baseline' && command !== 'measure' && command !== 'check') {
    throw new Error(`Unknown performance command: ${command ?? '(empty)'}`);
  }
  if (command === 'check') {
    throw new Error('Runtime performance metrics must be implemented before perf:check can run');
  }

  const report = await measureBuildReport();
  const outputPath = command === 'baseline' ? baselinePath : resultPath;
  await writeJsonAtomic(outputPath, report);
  console.log(`[miko:perf] wrote ${outputPath}`);
}
