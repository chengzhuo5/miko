import { spawn } from 'node:child_process';
import { readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createMetricSamples } from './statistics';
import { generateFixture } from './fixtures';
import type { GeneratedFixture } from './fixtures';
import type { BuildFixtureName, BuildMetrics } from './types';

export interface WorkerResult {
  marker: 'MIKO_PERF_RESULT';
  peakRssBytes: number;
  workerRuntime: string;
}

export interface NodeBuildResult extends WorkerResult {
  elapsedMs: number;
  stdout: string;
  stderr: string;
}

export interface NodeBuildInvocation {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type ArtifactMetrics = Pick<
  BuildMetrics,
  'htmlBytes' | 'jsBytes' | 'cssBytes' | 'assetCount'
>;

export interface BuildMeasurementDependencies {
  clearOutputs: typeof clearFixtureOutputs;
  runBuild: (root: string) => Promise<NodeBuildResult>;
  analyzeArtifacts: (outDir: string) => Promise<ArtifactMetrics>;
}

export interface BuildSuiteDependencies {
  generate: typeof generateFixture;
  measure: typeof measureBuildFixture;
}

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

export function createNodeBuildInvocation(root: string): NodeBuildInvocation {
  const workerPath = fileURLToPath(new URL('./worker.mjs', import.meta.url));
  return {
    command: process.execPath,
    args: [workerPath],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      MIKO_PERF_ROOT: resolve(root),
    },
  };
}

export function parseWorkerResult(stdout: string): WorkerResult {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    if (!line.includes('MIKO_PERF_RESULT')) continue;
    try {
      const result = JSON.parse(line) as Partial<WorkerResult>;
      if (
        result.marker === 'MIKO_PERF_RESULT' &&
        Number.isFinite(result.peakRssBytes) &&
        typeof result.workerRuntime === 'string' &&
        result.workerRuntime.length > 0
      ) {
        return result as WorkerResult;
      }
    } catch {
      // Ignore non-JSON build output that happens to contain the marker text.
    }
  }
  throw new Error('Node build worker did not emit MIKO_PERF_RESULT');
}

export async function runNodeBuild(root: string): Promise<NodeBuildResult> {
  const invocation = createNodeBuildInvocation(root);
  const startedAt = performance.now();

  return await new Promise<NodeBuildResult>((resolveResult, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      stdio: ['ignore', 'pipe', 'pipe'],
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
      if (code !== 0) {
        reject(
          new Error(
            [`Miko build worker exited with code ${String(code)}`, stderr.trim(), stdout.trim()]
              .filter(Boolean)
              .join('\n'),
          ),
        );
        return;
      }
      try {
        resolveResult({
          ...parseWorkerResult(stdout),
          elapsedMs: performance.now() - startedAt,
          stdout,
          stderr,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function analyzeBuildArtifacts(outDir: string): Promise<ArtifactMetrics> {
  const metrics: ArtifactMetrics = {
    htmlBytes: 0,
    jsBytes: 0,
    cssBytes: 0,
    assetCount: 0,
  };

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.miko') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }

      const bytes = (await stat(path)).size;
      metrics.assetCount++;
      const extension = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
      if (extension === '.html') metrics.htmlBytes += bytes;
      else if (extension === '.js') metrics.jsBytes += bytes;
      else if (extension === '.css') metrics.cssBytes += bytes;
    }
  }

  await visit(resolve(outDir));
  return metrics;
}

function assertInside(root: string, target: string): void {
  const path = relative(root, target);
  if (!path || path.startsWith('..') || isAbsolute(path)) {
    throw new Error(`Refusing to remove performance path outside fixture: ${target}`);
  }
}

export async function clearFixtureOutputs(
  root: string,
  options: { cold: boolean },
): Promise<void> {
  const fixtureRoot = resolve(root);
  const targets = [
    resolve(fixtureRoot, 'dist'),
    ...(options.cold
      ? [
          resolve(fixtureRoot, '.miko-cache'),
          resolve(fixtureRoot, '.vite-ssg-temp'),
        ]
      : []),
  ];

  for (const target of targets) {
    assertInside(fixtureRoot, target);
    await rm(target, { recursive: true, force: true });
  }
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} 必须是正整数`);
  }
}

export async function measureBuildFixture(
  fixture: GeneratedFixture,
  options: { coldSamples: number; warmSamples: number },
  dependencies: BuildMeasurementDependencies = {
    clearOutputs: clearFixtureOutputs,
    runBuild: runNodeBuild,
    analyzeArtifacts: analyzeBuildArtifacts,
  },
): Promise<BuildMetrics> {
  requirePositiveInteger('coldSamples', options.coldSamples);
  requirePositiveInteger('warmSamples', options.warmSamples);

  const coldMs: number[] = [];
  const warmMs: number[] = [];
  const peakRssBytes: number[] = [];

  for (let sample = 0; sample < options.coldSamples; sample++) {
    await dependencies.clearOutputs(fixture.root, { cold: true });
    const result = await dependencies.runBuild(fixture.root);
    coldMs.push(result.elapsedMs);
    peakRssBytes.push(result.peakRssBytes);
  }
  for (let sample = 0; sample < options.warmSamples; sample++) {
    await dependencies.clearOutputs(fixture.root, { cold: false });
    const result = await dependencies.runBuild(fixture.root);
    warmMs.push(result.elapsedMs);
    peakRssBytes.push(result.peakRssBytes);
  }

  return {
    coldMs: createMetricSamples(coldMs),
    warmMs: createMetricSamples(warmMs),
    peakRssBytes: createMetricSamples(peakRssBytes),
    ...(await dependencies.analyzeArtifacts(join(fixture.root, 'dist'))),
  };
}

export async function measureBuildSuite(
  parent: string,
  options: {
    coldSamples: number;
    warmSamples: number;
    fixtures: BuildFixtureName[];
    onFixtureStart?: (fixture: BuildFixtureName) => void;
  },
  dependencies: BuildSuiteDependencies = {
    generate: generateFixture,
    measure: measureBuildFixture,
  },
): Promise<Partial<Record<BuildFixtureName, BuildMetrics>>> {
  const result: Partial<Record<BuildFixtureName, BuildMetrics>> = {};

  for (const name of options.fixtures) {
    options.onFixtureStart?.(name);
    const fixture = await dependencies.generate(parent, name);
    result[name] = await dependencies.measure(fixture, {
      coldSamples: options.coldSamples,
      warmSamples: options.warmSamples,
    });
  }

  return result;
}
