import { dirname, resolve } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import type { PluginOption } from 'vite';
import pluginExternal from 'vite-plugin-external';
import { resolve as esResolve } from '@dual-bundle/import-meta-resolve';

const isBun = process.versions.bun !== undefined;

const resolveModule = await (async () => {
  if (isBun) {
    const resolveBun = await import('bun').then((mod) => mod.resolve);
    return (id: string, cwd: string) => resolveBun(id, cwd);
  }
  return (id: string, cwd: string) =>
    fileURLToPath(esResolve(id, pathToFileURL(resolve(cwd, 'node_modules')).href));
})();

const externalPkgs = (
  isBun
    ? await Array.fromAsync(
        new (await import('bun').then((mod) => mod.Glob))('./modules/**/*.ts').scan(
          fileURLToPath(dirname(import.meta.resolve('@minar-kotonoha/framework'))),
        ),
      )
    : await fg(['./modules/**/*.ts'], {
        cwd: fileURLToPath(dirname(import.meta.resolve('@minar-kotonoha/framework'))),
      })
).map((filePath: string) => filePath.slice('./modules/'.length).split('.')[0]);
const queryEnableExternal = () => env.VITE_SSG !== 'true';
const externalMap = Object.fromEntries(
  externalPkgs.map((pkg) => [pkg, `(framework['${pkg}'] || framework.default['${pkg}'])`] as const),
);
const cwd = process.cwd();

export function externalPlugin() {
  return [
    {
      name: '@minar-kotonoha/vite-plugin-external',
      config: (_: UserConfig, { mode }: { mode: string }) => {
        return {
          ssr: {
            /**
             * 服务端渲染的时候，vant不能外部化，因为vant会有css in js的逻辑，而node.js并不支持css
             */
            noExternal: [
              /.*\/vant/,
              // 参考https://uvr.esm.is/guide/configuration.html。不能在打包阶段外部化router，会报错：vue-router/auto找不到
              ...(mode === 'development' ? ['vue-router'] : []),
            ],
          },
        };
      },
      async resolveId(source: string, _importer: string | undefined, _options: unknown) {
        if (
          source.includes('vite/preload-helper.js') ||
          source.startsWith('/') ||
          source.startsWith('.') ||
          source.startsWith('virtual:')
        ) {
          return;
        }
        // rolldown目前的modules配置无效，此处用于把引入的依赖从项目的node_modules中引入
        try {
          const resolvedId = await resolveModule(source, cwd);
          return resolvedId;
        } catch {
          return;
        }
      },
    },
    {
      ...pluginExternal({
        get externals() {
          return queryEnableExternal() ? externalMap : {};
        },
        externalizeDeps: ['vue-router/auto', 'vue-router/auto-routes'],
      }),
      apply(config, env) {
        return env.command === 'build';
      },
    },
  ] satisfies PluginOption[];
}
