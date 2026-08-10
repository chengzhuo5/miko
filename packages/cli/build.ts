import { spawn } from 'node:child_process';
import { build as viteSsgBuild } from '@minar-kotonoha/vite-ssg/node';
import {
  createLibConfig,
  createMikoViteConfig,
  resolveMikoProject,
} from '@minar-kotonoha/vite-plugin-miko';
import type { ResolvedMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as viteBuild } from 'vite';
import type { UserConfig } from 'vite';
import type { CommandContext } from './context';
import { writeStaticDeploymentManifest } from './static-manifest';

let cssLoaderRegistration: Promise<void> | undefined;

async function runTypecheck(root: string): Promise<void> {
  // spawn 子进程执行 vue-tsc 类型检查，通过 jiti/register 加载 .ts 文件
  const tscPath = fileURLToPath(new URL('./tsc.ts', import.meta.url));
  // Node.js ESM 在 Windows 上需要 file:// URL 格式
  const jitiUrl = import.meta.resolve('jiti/register');
  const tscUrl = pathToFileURL(tscPath).href;

  const { promise, resolve: res, reject: rej } = Promise.withResolvers<void>();
  // --eval + dynamic import 执行 tsc.ts，避免文件作为 CLI 位置参数触发 TS5112
  spawn(process.execPath, ['--import', jitiUrl, '--eval', `import('${tscUrl}')`], {
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

export async function runBuild(context: CommandContext): Promise<void> {
  const { lib: isLib, mode, root } = context;
  const project = await resolveMikoProject({ command: 'build', mode, root });

  if (isLib) {
    await viteBuild(createLibConfig({ config: project }));
    console.log('[miko] 库构建完成');
  } else {
    const config = await prepareApplicationBuild(project, () => runTypecheck(root));
    const inlineConfig = { ...config, configFile: false as const, mode };

    if (project.miko.rendering === 'ssg') {
      await registerCssLoader();
      await viteSsgBuild(undefined, inlineConfig);
    } else {
      await viteBuild(inlineConfig);
    }

    await writeStaticDeploymentManifest(project.outDir, String(config.base ?? '/'));
  }
}
