import { dirname, resolve } from 'node:path';
import { env } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as esResolve } from '@dual-bundle/import-meta-resolve';
import type { Plugin, PluginOption, UserConfig } from 'vite';

const queryEnableExternal = () => env.VITE_SSG !== 'true';

async function resolveModule(id: string, cwd: string): Promise<string> {
  return fileURLToPath(esResolve(id, pathToFileURL(resolve(cwd, 'node_modules')).href));
}

async function scanFrameworkModules(): Promise<string[]> {
  const [{ default: fg }, frameworkEntry] = await Promise.all([
    import('fast-glob'),
    Promise.resolve(import.meta.resolve('@minar-kotonoha/framework')),
  ]);
  return fg(['./modules/**/*.ts'], {
    cwd: fileURLToPath(dirname(frameworkEntry)),
  });
}

export function externalResolvePlugin(root = process.cwd()): Plugin {
  return {
    name: '@minar-kotonoha/vite-plugin-external',
    config: (_: UserConfig, { mode }: { mode: string }) => {
      return {
        ssr: {
          noExternal: [/.*\/vant/, ...(mode === 'development' ? ['vue-router'] : [])],
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
        return await resolveModule(source, root);
      } catch {
        return;
      }
    },
  };
}

export async function externalCdnPlugin(
  additionalExternals: string[] = [],
): Promise<PluginOption[]> {
  const [{ default: pluginExternal }, externalPkgs] = await Promise.all([
    import('vite-plugin-external'),
    scanFrameworkModules(),
  ]);
  const externalMap = Object.fromEntries(
    [
      ...externalPkgs.map((filePath) => filePath.slice('./modules/'.length).split('.')[0]),
      ...additionalExternals,
    ].map((pkg) => [pkg, `(framework['${pkg}'] || framework.default['${pkg}'])`] as const),
  );

  return [
    {
      ...pluginExternal({
        get externals() {
          return queryEnableExternal() ? externalMap : {};
        },
        externalizeDeps: ['vue-router/auto', 'vue-router/auto-routes'],
      }),
      apply(config, environment) {
        return environment.command === 'build';
      },
    },
  ];
}

export function externalPlugin(enableCDN?: boolean): Promise<PluginOption[]>;
export function externalPlugin(
  root: string,
  enableCDN?: boolean,
  additionalExternals?: string[],
): Promise<PluginOption[]>;
export async function externalPlugin(
  rootOrEnableCDN: string | boolean = process.cwd(),
  enableCDN = false,
  additionalExternals: string[] = [],
): Promise<PluginOption[]> {
  const root = typeof rootOrEnableCDN === 'string' ? rootOrEnableCDN : process.cwd();
  const resolvedEnableCDN = typeof rootOrEnableCDN === 'boolean' ? rootOrEnableCDN : enableCDN;
  const plugins: PluginOption[] = [externalResolvePlugin(root)];
  if (resolvedEnableCDN) plugins.push(...(await externalCdnPlugin(additionalExternals)));
  return plugins;
}
