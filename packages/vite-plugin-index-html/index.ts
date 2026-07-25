import { resolve } from 'node:path';
import type { PluginOption, UserConfig } from 'vite';
import { copy, ensureDir } from 'fs-extra';

const virtualModuleId = 'virtual:index';

const cwd = process.cwd();
export async function indexHTMLPlugin(entry: string, template: string) {
  return {
    name: '@minar-kotonoha/vite-plugin-index-html',
    async config(_: UserConfig, { command }: { command: string }) {
      const isBuild = command === 'build';
      // 开发环境：root 需靠近 cwd，否则依赖预构建失效
      // 生产环境：root 指向 template/，确保 vite-ssg 的 entry 在 root 内
      const root = isBuild ? template : resolve(cwd, './node_modules/.vite_entry');
      if (!isBuild) {
        await ensureDir(root);
        await copy(resolve(template, 'index.html'), resolve(root, 'index.html'));
      }
      return { root };
    },
    resolveId(id: string, importer: string | undefined) {
      if (importer && id === virtualModuleId) {
        return `\0${id}`;
      }
    },
    load: (id: string) => {
      if (id.startsWith(`\0${virtualModuleId}`)) {
        return `import '${entry.replace(/\\/g, '/')}'`;
      }
    },
  } satisfies PluginOption;
}
