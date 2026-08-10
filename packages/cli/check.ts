import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandContext } from './context';
import {
  buildApplication,
  type ApplicationBuildOptions,
  type ApplicationBuildResult,
} from './build';

export interface CheckDependencies {
  build(
    context: CommandContext,
    options: ApplicationBuildOptions,
  ): Promise<ApplicationBuildResult>;
  createTemporaryDirectory(): Promise<string>;
  output(message: string): void;
  remove(path: string): Promise<void>;
}

const defaultDependencies: CheckDependencies = {
  build: buildApplication,
  createTemporaryDirectory: () => mkdtemp(join(tmpdir(), 'miko-check-')),
  output: console.log,
  remove: (path) => rm(path, { force: true, recursive: true }),
};

export async function runCheck(
  context: CommandContext,
  dependencies: CheckDependencies = defaultDependencies,
): Promise<void> {
  const isolatedOutDir = await dependencies.createTemporaryDirectory();
  try {
    await dependencies.build(context, {
      outputOverride: isolatedOutDir,
      onProjectResolved(project) {
        dependencies.output(`[miko] Check 原始输出目录：${project.outDir}`);
        dependencies.output(`[miko] Check 隔离输出目录：${isolatedOutDir}`);
      },
    });
    dependencies.output('[miko] Check 完成');
  } finally {
    await dependencies.remove(isolatedOutDir);
  }
}
