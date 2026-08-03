import { dirname, resolve } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import type { PluginOption, UserConfig } from 'vite';
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

export function externalPlugin(enableCDN = false) {
  const plugins: PluginOption[] = [
    {
      name: '@minar-kotonoha/vite-plugin-external',
      config: (_: UserConfig, { mode }: { mode: string }) => {
        return {
          ssr: {
            noExternal: [
              /.*\/vant/,
              ...(mode === 'development' ? ['vue-router'] : []),
            ],
          },
        };
      },
      async resolveId(source: string, _importer: string | undefined, options: { ssr?: boolean }) {
        // SSR 时跳过解析，让 Vite 自己外部化 node_modules 依赖
        if (options?.ssr) return;
        if (
          source.includes('vite/preload-helper.js') ||
          source.startsWith('/') ||
          source.startsWith('.') ||
          source.startsWith('virtual:')
        ) {
          return;
        }
        try {
          const resolvedId = await resolveModule(source, cwd);
          return resolvedId;
        } catch {
          return;
        }
      },
    },
  ];

  if (enableCDN) {
    plugins.push({
      ...pluginExternal({
        get externals() {
          return queryEnableExternal() ? externalMap : {};
        },
        externalizeDeps: ['vue-router/auto', 'vue-router/auto-routes'],
      }),
      apply(config, env) {
        return env.command === 'build';
      },
    });
  }

  return plugins;
}
