import { spawnSync } from 'node:child_process';
import { cpus } from 'node:os';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { version as viteVersion } from 'vite';
import { measureBuildSuite } from './build';
import { compareReports } from './compare';
import type { MetricComparison } from './compare';
import { runtimeRouteInfo } from './fixtures';
import { measureRuntimeFixture } from './runtime';
import type {
  BuildFixtureName,
  BuildMetrics,
  EnvironmentFingerprint,
  PerformanceReport,
} from './types';

const FIXTURES: BuildFixtureName[] = ['small', 'medium', 'large', 'runtime'];
const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const baselinePath = join(packageRoot, 'baselines', 'miko-v1-slice-3-before.json');
const resultPath = join(packageRoot, 'results', 'miko-v1-slice-3-current.json');

export interface PerformanceCliDependencies {
  measure(): Promise<PerformanceReport>;
  readReport(path: string): Promise<PerformanceReport>;
  writeReport(path: string, report: PerformanceReport): Promise<void>;
  output(message: string): void;
}

async function readBunVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(join(workspaceRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
  };
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

async function readPerformanceReport(path: string): Promise<PerformanceReport> {
  return JSON.parse(await readFile(path, 'utf8')) as PerformanceReport;
}

export async function measurePerformanceReport(): Promise<PerformanceReport> {
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
    if (FIXTURES.some((fixture) => !build[fixture])) {
      throw new Error('Performance build suite did not return every fixture');
    }
    const runtime = await measureRuntimeFixture(
      {
        root: join(parent, 'runtime'),
        deepRouteChunkName: runtimeRouteInfo.deepRouteChunkName,
        unvisitedRoute: runtimeRouteInfo.unvisitedRoute,
      },
      {
        samples: 5,
        onSampleStart(sample, total) {
          console.log(`[miko:perf] measuring browser runtime ${sample}/${total}`);
        },
      },
    );

    return {
      schemaVersion: 1,
      environment: await environmentFingerprint(),
      createdAt: new Date().toISOString(),
      commit: readCommit(),
      workerRuntime: process.execPath,
      build: build as Record<BuildFixtureName, BuildMetrics>,
      runtime,
    };
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function formatDelta(comparison: MetricComparison): string {
  if (!Number.isFinite(comparison.regressionRatio)) return '+∞';
  const percentage = comparison.regressionRatio * 100;
  return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
}

function formatComparison(comparison: MetricComparison): string {
  const status = comparison.skipped ? 'SKIP' : comparison.passed ? 'PASS' : 'FAIL';
  const allowance =
    comparison.fixedAllowance && comparison.fixedAllowance > 0
      ? `, fixed allowance +${comparison.fixedAllowance}`
      : '';
  if (typeof comparison.baseline === 'number' && typeof comparison.current === 'number') {
    return `${comparison.metric}: ${comparison.baseline} -> ${comparison.current} (${formatDelta(comparison)}${allowance}) ${status}`;
  }
  return `${comparison.metric}: ${String(comparison.current)} ${status}`;
}

const defaultDependencies: PerformanceCliDependencies = {
  measure: measurePerformanceReport,
  readReport: readPerformanceReport,
  writeReport: writeJsonAtomic,
  output: console.log,
};

export async function runPerformanceCli(
  argv: string[],
  dependencies: PerformanceCliDependencies = defaultDependencies,
): Promise<void> {
  const command = argv[0];
  if (command !== 'baseline' && command !== 'measure' && command !== 'check') {
    throw new Error(`Unknown performance command: ${command ?? '(empty)'}`);
  }
  if (command === 'check') {
    const [baseline, current] = await Promise.all([
      dependencies.readReport(baselinePath),
      dependencies.measure(),
    ]);
    await dependencies.writeReport(resultPath, current);
    const result = compareReports(baseline, current);

    dependencies.output('Miko Performance');
    dependencies.output(
      `Environment: ${result.environmentCompatible ? 'compatible' : 'incompatible'}`,
    );
    for (const comparison of result.comparisons) {
      if (comparison.metric !== 'environment') {
        dependencies.output(formatComparison(comparison));
      }
    }

    if (result.failures.length > 0) {
      dependencies.output(`Miko Performance: ${result.failures.length} failed`);
      throw new Error(`Miko performance budget failed with ${result.failures.length} failure(s)`);
    }
    dependencies.output('Miko Performance: all budgets passed');
    return;
  }

  const report = await dependencies.measure();
  const outputPath = command === 'baseline' ? baselinePath : resultPath;
  await dependencies.writeReport(outputPath, report);
  dependencies.output(`[miko:perf] wrote ${outputPath}`);
}
