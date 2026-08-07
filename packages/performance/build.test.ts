import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeBuildArtifacts,
  clearFixtureOutputs,
  createNodeBuildInvocation,
  measureBuildFixture,
  measureBuildSuite,
  parseWorkerResult,
} from './build';
import type { GeneratedFixture } from './fixtures';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'miko-performance-build-'));
  roots.push(root);
  return root;
}

describe('Node build worker', () => {
  it('uses process.execPath with the same createJiti loader as the distributed CLI', async () => {
    const root = resolve('D:/fixture');
    const invocation = createNodeBuildInvocation(root);
    const workerRunner = fileURLToPath(new URL('./worker.mjs', import.meta.url));

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.command.toLowerCase()).not.toContain('bun');
    expect(invocation.args).toEqual([workerRunner]);
    expect(invocation.env.MIKO_PERF_ROOT).toBe(root);
    expect(resolve(invocation.cwd)).toBe(
      resolve(fileURLToPath(new URL('../../', import.meta.url))),
    );
    await expect(readFile(workerRunner, 'utf8')).resolves.toMatch(
      /createJiti[\s\S]*import\(['"]\.\/worker\.ts['"]\)/u,
    );
  });

  it('parses only the explicit worker result marker', () => {
    expect(
      parseWorkerResult(
        [
          'Vite build output',
          '{"unrelated":true}',
          '{"marker":"MIKO_PERF_RESULT","peakRssBytes":1234,"workerRuntime":"node.exe"}',
        ].join('\n'),
      ),
    ).toEqual({
      marker: 'MIKO_PERF_RESULT',
      peakRssBytes: 1234,
      workerRuntime: 'node.exe',
    });

    expect(() => parseWorkerResult('build finished without marker')).toThrow(
      /MIKO_PERF_RESULT/,
    );
  });
});

describe('build artifact analysis', () => {
  it('sums HTML, JavaScript and CSS while excluding Miko reports', async () => {
    const root = await createRoot();
    const dist = join(root, 'dist');
    await Promise.all([
      mkdir(join(dist, 'assets'), { recursive: true }),
      mkdir(join(dist, '.miko'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(dist, 'index.html'), 'html'),
      writeFile(join(dist, 'assets/app-ABCDEFGH.js'), 'javascript'),
      writeFile(join(dist, 'assets/app-ABCDEFGH.css'), 'css'),
      writeFile(join(dist, '.miko/routes.json'), 'ignored-report'),
    ]);

    await expect(analyzeBuildArtifacts(dist)).resolves.toEqual({
      htmlBytes: 4,
      jsBytes: 10,
      cssBytes: 3,
      assetCount: 3,
    });
  });

  it('clears only validated fixture outputs', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await Promise.all([
      mkdir(join(root, 'dist'), { recursive: true }),
      mkdir(join(root, '.miko-cache', 'vite'), { recursive: true }),
      mkdir(join(root, '.vite-ssg-temp'), { recursive: true }),
      writeFile(join(outside, 'sentinel.txt'), 'keep'),
    ]);

    await clearFixtureOutputs(root, { cold: true });

    await expect(readFile(join(outside, 'sentinel.txt'), 'utf8')).resolves.toBe('keep');
    await expect(stat(join(root, 'dist'))).rejects.toThrow(/ENOENT/u);
    await expect(stat(join(root, '.miko-cache'))).rejects.toThrow(/ENOENT/u);
    await expect(stat(join(root, '.vite-ssg-temp'))).rejects.toThrow(/ENOENT/u);
  });
});

describe('measureBuildFixture', () => {
  it('keeps raw cold, warm and RSS samples before calculating medians', async () => {
    const fixture: GeneratedFixture = {
      name: 'small',
      root: 'D:/fixture',
      routeCount: 3,
      componentCount: 20,
      deepRoute: '/route-0002',
      unvisitedRoute: '/route-0001',
    };
    const clearCalls: boolean[] = [];
    const results = [
      { elapsedMs: 300, peakRssBytes: 3000 },
      { elapsedMs: 100, peakRssBytes: 1000 },
      { elapsedMs: 200, peakRssBytes: 2000 },
    ];

    const metrics = await measureBuildFixture(
      fixture,
      { coldSamples: 2, warmSamples: 1 },
      {
        clearOutputs: async (_root, options) => {
          clearCalls.push(options.cold);
        },
        runBuild: async () => ({
          marker: 'MIKO_PERF_RESULT',
          workerRuntime: process.execPath,
          stdout: '',
          stderr: '',
          ...results.shift()!,
        }),
        analyzeArtifacts: async () => ({
          htmlBytes: 10,
          jsBytes: 20,
          cssBytes: 30,
          assetCount: 4,
        }),
      },
    );

    expect(clearCalls).toEqual([true, true, false]);
    expect(metrics).toEqual({
      coldMs: { samples: [300, 100], median: 200 },
      warmMs: { samples: [200], median: 200 },
      peakRssBytes: { samples: [3000, 1000, 2000], median: 2000 },
      htmlBytes: 10,
      jsBytes: 20,
      cssBytes: 30,
      assetCount: 4,
    });
  });

  it('requires positive cold and warm sample counts', async () => {
    const fixture = {
      name: 'small',
      root: 'D:/fixture',
      routeCount: 3,
      componentCount: 20,
      deepRoute: '/route-0002',
      unvisitedRoute: '/route-0001',
    } satisfies GeneratedFixture;

    await expect(
      measureBuildFixture(fixture, { coldSamples: 0, warmSamples: 1 }),
    ).rejects.toThrow(/coldSamples.*正整数/u);
    await expect(
      measureBuildFixture(fixture, { coldSamples: 1, warmSamples: 0 }),
    ).rejects.toThrow(/warmSamples.*正整数/u);
  });
});

describe('measureBuildSuite', () => {
  it('measures requested fixtures in stable order', async () => {
    const generated: string[] = [];
    const measured: string[] = [];

    const result = await measureBuildSuite(
      'D:/parent',
      {
        coldSamples: 1,
        warmSamples: 1,
        fixtures: ['small', 'runtime'],
      },
      {
        generate: async (_parent, name) => {
          generated.push(name);
          return {
            name,
            root: `D:/parent/${name}`,
            routeCount: 1,
            componentCount: 0,
            deepRoute: '/',
            unvisitedRoute: '/unvisited',
          };
        },
        measure: async fixture => {
          measured.push(fixture.name);
          return {
            coldMs: { samples: [1], median: 1 },
            warmMs: { samples: [2], median: 2 },
            peakRssBytes: { samples: [3], median: 3 },
            htmlBytes: 4,
            jsBytes: 5,
            cssBytes: 6,
            assetCount: 7,
          };
        },
      },
    );

    expect(generated).toEqual(['small', 'runtime']);
    expect(measured).toEqual(['small', 'runtime']);
    expect(Object.keys(result)).toEqual(['small', 'runtime']);
  });
});
