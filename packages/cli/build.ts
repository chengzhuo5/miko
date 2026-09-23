import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { build as viteSsgBuild } from '@minar-kotonoha/vite-ssg/node';
import {
  createLibConfig,
  createMikoViteConfig,
  resolveMikoProject,
} from '@minar-kotonoha/vite-plugin-miko';
import type { ResolvedMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import { join, resolve } from 'node:path';
import { build as viteBuild } from 'vite';
import type { UserConfig } from 'vite';
import type { CommandContext } from './context';
import { assertStaticOutput } from './static-check';
import { writeStaticDeploymentManifest } from './static-manifest';

let cssLoaderRegistration: Promise<void> | undefined;

/** 跳过类型检查的逃生口（CI 容器 Node 版本受限时的临时开关）。
 *
 * 背景（2026-09-23）：CI 容器 Node 22 + \`typescript-native-bridge\`(tsgo) + vue-tsc 3.3.10
 * 会在 @volar/typescript 的 runTsc 里崩（delete require.cache[undefined] →
 * "Cannot convert undefined or null to object"），而本地 Node 25 正常、容器 Node 又无法升级。
 * 因此提供一个**显式**开关；默认关闭，打开时打印醒目告警，避免被长期误用。
 *
 * 用法：MIKO_SKIP_TYPECHECK=1 miko build ...（只建议在受容器 Node 限制的流水线里设置）
 */
const SKIP_TYPECHECK_ENV = 'MIKO_SKIP_TYPECHECK'

async function runTypecheck(root: string): Promise<void> {
  if (process.env[SKIP_TYPECHECK_ENV] === '1') {
    console.warn(
      `[miko] ⚠️ 已跳过 TypeScript 类型检查（${SKIP_TYPECHECK_ENV}=1）——仅用于 CI 容器 Node 版本受限的场景，本地与其它流水线请勿设置`,
    );
    return;
  }
  // 直接用官方 vue-tsc CLI，在**干净 node 子进程**里跑，不经 jiti。
  // 为什么：jiti 环境下 require.cache 不可用，@volar/typescript 的 runTsc 会在
  //   delete require.cache[tscPath] 处崩（TypeError: Cannot convert undefined or null to object）。
  //   这是本仓库早已定位过的坑（见 pnpm-workspace.yaml 里 0.1.25 时期的记录：patch 改为
  //   直接跑 vue-tsc/bin/vue-tsc.js --noEmit），v1.x 曾把这层 jiti 载体又带回来 —— 不要在改回去。
  const requireFromProject = createRequire(join(root, 'package.json'));
  const vueTscBin = requireFromProject.resolve('vue-tsc/bin/vue-tsc.js');

  const { promise, resolve: res, reject: rej } = Promise.withResolvers<void>();
  spawn(process.execPath, [vueTscBin, '--noEmit'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
    .once('error', rej)
    .once('exit', (code) => {
      if (code === 0) {
        console.log('TypeScript 类型检查成功');
        res();
      } else {
        rej(new Error(`TypeScript 类型检查失败`));
      }
    });
  await promise;
}

function registerCssLoader(): Promise<void> {
  if (!cssLoaderRegistration) {
    cssLoaderRegistration = import('node:module').then(({ register }) => {
      // 避免 SSG 预渲染时把依赖中的样式文件当成 Node.js ESM 执行
      register('./css-loader.mjs', import.meta.url);
    });
  }
  return cssLoaderRegistration;
}

export async function prepareApplicationBuild(
  project: ResolvedMikoConfig,
  typecheck: () => Promise<void>,
): Promise<UserConfig> {
  const [config] = await Promise.all([createMikoViteConfig(project), typecheck()]);
  return config;
}

export interface ApplicationBuildOptions {
  outputOverride?: string;
  onProjectResolved?: (project: ResolvedMikoConfig) => void;
}

export interface ApplicationBuildResult {
  project: ResolvedMikoConfig;
  config: UserConfig;
  outDir: string;
}

function withOutputOverride(
  project: ResolvedMikoConfig,
  outputOverride: string | undefined,
): ResolvedMikoConfig {
  if (!outputOverride) return project;
  const outDir = resolve(outputOverride);
  return {
    ...project,
    outDir,
    vite: {
      ...project.vite,
      build: {
        ...project.vite.build,
        outDir,
      },
    },
  };
}

export async function buildApplication(
  context: CommandContext,
  options: ApplicationBuildOptions = {},
): Promise<ApplicationBuildResult> {
  if (context.command === 'migrate') {
    throw new TypeError('migrate does not build an application');
  }
  const { mode, root } = context;
  const resolvedProject = await resolveMikoProject({ command: context.command, mode, root });
  options.onProjectResolved?.(resolvedProject);
  const project = withOutputOverride(resolvedProject, options.outputOverride);
  const config = await prepareApplicationBuild(project, () => runTypecheck(root));
  const inlineConfig = { ...config, configFile: false as const, mode };

  if (project.miko.rendering === 'ssg') {
    await registerCssLoader();
    await viteSsgBuild(undefined, inlineConfig);
  } else {
    await viteBuild(inlineConfig);
  }

  const base = String(config.base ?? '/');
  await assertStaticOutput(project.outDir, base);
  await writeStaticDeploymentManifest(project.outDir, base);
  return { project, config, outDir: project.outDir };
}

export async function runBuild(context: CommandContext): Promise<void> {
  const { lib: isLib, mode, root } = context;
  if (isLib) {
    const project = await resolveMikoProject({ command: 'build', mode, root });
    await viteBuild(createLibConfig({ config: project }));
    console.log('[miko] 库构建完成');
  } else {
    await buildApplication(context);
  }
}
