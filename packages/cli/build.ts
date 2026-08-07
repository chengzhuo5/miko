import { spawn } from 'node:child_process';
import { build as viteSsgBuild } from '@minar-kotonoha/vite-ssg/node';
import {
  createLibConfig,
  createMikoViteConfig,
  resolveMikoProject,
} from '@minar-kotonoha/vite-plugin-miko';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as viteBuild } from 'vite';
import type { CommandContext } from './context';

export async function runBuild(context: CommandContext): Promise<void> {
  const { lib: isLib, mode, root } = context;
  const project = await resolveMikoProject({ command: 'build', mode, root });

  if (isLib) {
    await viteBuild(createLibConfig({ config: project }));
    console.log('[miko] 库构建完成');
  } else {
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
    }).on('exit', (code) => {
      if (code === 0) {
        console.log('TypeScript 类型检查成功');
        res();
      } else {
        rej(new Error(`TypeScript 类型检查失败`));
      }
    });
    await promise;

    // 注册 CSS ESM loader hook，避免 SSG 预渲染时 vant 的 .css 文件被 Node.js 当成 ESM 加载报错
    const { register } = await import('node:module');
    register('./css-loader.mjs', import.meta.url);

    const config = await createMikoViteConfig(project);
    const inlineConfig = { ...config, configFile: false as const, mode };

    if (project.miko.rendering === 'ssg') {
      await viteSsgBuild(undefined, inlineConfig);
    } else {
      await viteBuild(inlineConfig);
    }
  }
}
