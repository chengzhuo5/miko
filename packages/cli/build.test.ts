import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserConfig } from 'vite';
import type { ResolvedMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import type { CommandContext } from './context';

const mocks = vi.hoisted(() => ({
  createMikoViteConfig: vi.fn<(project: ResolvedMikoConfig) => Promise<UserConfig>>(),
  assertStaticOutput: vi.fn<(outDir: string, base: string) => Promise<void>>(),
  resolveMikoProject: vi.fn<() => Promise<ResolvedMikoConfig>>(),
  spawn: vi.fn<() => unknown>(),
  viteBuild: vi.fn<(config?: UserConfig) => Promise<void>>(),
  viteSsgBuild: vi.fn<() => Promise<void>>(),
  writeStaticDeploymentManifest: vi.fn<(outDir: string, base: string) => Promise<unknown>>(),
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));
vi.mock('@minar-kotonoha/vite-plugin-miko', () => ({
  createLibConfig: vi.fn<() => UserConfig>(),
  createMikoViteConfig: mocks.createMikoViteConfig,
  resolveMikoProject: mocks.resolveMikoProject,
}));
vi.mock('@minar-kotonoha/vite-ssg/node', () => ({
  build: mocks.viteSsgBuild,
}));
vi.mock('vite', () => ({
  build: mocks.viteBuild,
}));
vi.mock('./static-manifest', () => ({
  writeStaticDeploymentManifest: mocks.writeStaticDeploymentManifest,
}));
vi.mock('./static-check', () => ({
  assertStaticOutput: mocks.assertStaticOutput,
}));

import { buildApplication, prepareApplicationBuild, runBuild } from './build';

describe('prepareApplicationBuild', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts config preparation and type checking together, then waits for both', async () => {
    const configGate = Promise.withResolvers<UserConfig>();
    const typecheckGate = Promise.withResolvers<void>();
    const configStarted = Promise.withResolvers<void>();
    const typecheckStarted = Promise.withResolvers<void>();
    const events: string[] = [];
    const project = {} as ResolvedMikoConfig;
    const expectedConfig: UserConfig = { base: '/cms/' };

    mocks.createMikoViteConfig.mockImplementationOnce(async () => {
      events.push('config:start');
      configStarted.resolve();
      await configGate.promise;
      events.push('config:end');
      return expectedConfig;
    });
    const runTypecheck = vi.fn<() => Promise<void>>(async () => {
      events.push('typecheck:start');
      typecheckStarted.resolve();
      await typecheckGate.promise;
      events.push('typecheck:end');
    });

    let settled = false;
    const preparation = prepareApplicationBuild(project, runTypecheck).finally(() => {
      settled = true;
    });
    await Promise.all([configStarted.promise, typecheckStarted.promise]);

    expect(events).toEqual(['config:start', 'typecheck:start']);
    expect(settled).toBe(false);

    configGate.resolve(expectedConfig);
    await Promise.resolve();
    expect(settled).toBe(false);

    typecheckGate.resolve();
    await expect(preparation).resolves.toBe(expectedConfig);
    expect(events).toEqual(['config:start', 'typecheck:start', 'config:end', 'typecheck:end']);
    expect(mocks.createMikoViteConfig).toHaveBeenCalledWith(project);
    expect(runTypecheck).toHaveBeenCalledOnce();
  });

  it('starts Vite only after config preparation and the Node typecheck both finish', async () => {
    const configGate = Promise.withResolvers<UserConfig>();
    const configStarted = Promise.withResolvers<void>();
    const typecheckProcess = new EventEmitter();
    const project = {
      outDir: 'D:/project/dist',
      miko: { rendering: 'spa' },
    } as ResolvedMikoConfig;
    const context: CommandContext = {
      command: 'build',
      root: 'D:/project',
      mode: 'production',
      lib: false,
      json: false,
      allRoutes: false,
    };

    mocks.resolveMikoProject.mockResolvedValueOnce(project);
    mocks.createMikoViteConfig.mockImplementationOnce(async () => {
      configStarted.resolve();
      return configGate.promise;
    });
    mocks.spawn.mockReturnValueOnce(typecheckProcess);
    mocks.viteBuild.mockResolvedValueOnce();
    mocks.assertStaticOutput.mockResolvedValueOnce();
    mocks.writeStaticDeploymentManifest.mockResolvedValueOnce({});

    const execution = runBuild(context);
    await configStarted.promise;
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.viteBuild).not.toHaveBeenCalled();

    configGate.resolve({ base: '/cms/' });
    await Promise.resolve();
    expect(mocks.viteBuild).not.toHaveBeenCalled();

    typecheckProcess.emit('exit', 0);
    await execution;

    expect(mocks.viteBuild).toHaveBeenCalledOnce();
    expect(mocks.viteSsgBuild).not.toHaveBeenCalled();
    expect(mocks.assertStaticOutput).toHaveBeenCalledWith('D:/project/dist', '/cms/');
    expect(mocks.writeStaticDeploymentManifest).toHaveBeenCalledWith('D:/project/dist', '/cms/');
    expect(mocks.assertStaticOutput.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeStaticDeploymentManifest.mock.invocationCallOrder[0]!,
    );
    expect(mocks.viteBuild.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.createMikoViteConfig.mock.invocationCallOrder[0]!,
    );
    expect(mocks.viteBuild.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.spawn.mock.invocationCallOrder[0]!,
    );
  });

  it('applies a command-level output override without mutating the resolved project', async () => {
    const typecheckProcess = new EventEmitter();
    const project = {
      env: { command: 'check', mode: 'production', root: 'D:/project' },
      outDir: 'D:/project/formal-dist',
      vite: { build: { outDir: 'D:/project/formal-dist' } },
      miko: { rendering: 'spa' },
    } as ResolvedMikoConfig;
    const context: CommandContext = {
      command: 'check',
      root: 'D:/project',
      mode: 'production',
      lib: false,
      json: false,
      allRoutes: false,
    };

    mocks.resolveMikoProject.mockResolvedValueOnce(project);
    mocks.createMikoViteConfig.mockImplementationOnce(async (resolvedProject) => ({
      base: '/',
      build: { outDir: resolvedProject.outDir },
    }));
    mocks.spawn.mockReturnValueOnce(typecheckProcess);
    mocks.viteBuild.mockResolvedValueOnce();
    mocks.assertStaticOutput.mockResolvedValueOnce();
    mocks.writeStaticDeploymentManifest.mockResolvedValueOnce({});

    const execution = buildApplication(context, {
      outputOverride: 'D:/temporary/miko-check',
    });
    await Promise.resolve();
    typecheckProcess.emit('exit', 0);
    const result = await execution;

    expect(project.outDir).toBe('D:/project/formal-dist');
    expect(project.vite.build?.outDir).toBe('D:/project/formal-dist');
    expect(mocks.createMikoViteConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        outDir: resolve('D:/temporary/miko-check'),
        vite: expect.objectContaining({
          build: expect.objectContaining({ outDir: resolve('D:/temporary/miko-check') }),
        }),
      }),
    );
    expect(mocks.viteBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        build: expect.objectContaining({ outDir: resolve('D:/temporary/miko-check') }),
        configFile: false,
      }),
    );
    expect(result.outDir).toBe(resolve('D:/temporary/miko-check'));
  });
});
