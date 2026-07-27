import { spawn } from 'node:child_process';
import { build as viteSsgBuild } from 'vite-ssg/node';
import { defineMikoConfig, loadMikoConfig, createLibConfig } from '@minar-kotonoha/vite-plugin-miko';
import { fileURLToPath } from 'node:url';
import { cwd } from 'node:process';
import { resolve } from 'node:path';

const isLib = process.env.MIKO_LIB_MODE === '1';

if (isLib) {
  const { build: viteBuild } = await import('vite');

  const cfg = await loadMikoConfig();
  const libCfg = {
    entry: 'src/index.ts',
    formats: ['es', 'cjs'] as ('es' | 'cjs' | 'umd')[],
    ...cfg.lib,
  };

  await viteBuild(createLibConfig({
    entry: resolve(cwd(), libCfg.entry),
    formats: libCfg.formats,
    name: libCfg.name as string | undefined,
    fileName: libCfg.fileName as string | undefined,
  }));
  console.log('[miko] 库构建完成');
} else {
  // --import 用 file:// URL（Windows 下路径 D:\ 会被误判为协议），脚本入口用普通路径
  const jitiRegister = import.meta.resolve('jiti/register');
  const tscPath = fileURLToPath(new URL('./tsc.ts', import.meta.url));

  const { promise, resolve: res, reject: rej } = Promise.withResolvers<void>();
  spawn(process.execPath, [
    '--import', jitiRegister,
    tscPath,
  ], {
    stdio: 'inherit',
  }).on('exit', (code) => {
    if (code === 0) {
      console.log('TypeScript 类型检查成功');
      res();
    } else {
      rej(new Error(`TypeScript 类型检查失败`));
    }
  });
  await promise;

  const miko = await defineMikoConfig();
  const config = miko({ command: 'build', mode: 'production', isPreview: false, isSsrBuild: false });
  await viteSsgBuild(undefined, { configFile: false, ...config });
}
