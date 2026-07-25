import { resolve } from 'node:path';
import { exists } from 'fs-extra';
import type { PluginOption } from 'vite';

const virtualModuleId = 'virtual:bootstrap';

/**
 * 初始化插件
 *
 * 该插件会搜索项目根目录的index.ts的默认导出，并将Vue App实例作为参数传递。
 */
export function bootstrapPlugin() {
  return {
    name: '@minar-kotonoha/vite-plugin-bootstrap',
    resolveId(id: string, importer: string | undefined) {
      if (importer && id === virtualModuleId) {
        return `\0${id}`;
      }
    },
    load: async (id: string) => {
      if (id.startsWith(`\0${virtualModuleId}`)) {
        return (await exists(resolve(process.cwd(), 'index.ts')))
          ? `import * as Index from '@/index';export const bootstrap = Index.default ?? (() => {});`
          : `export const bootstrap = () =>{};`;
      }
    },
  } satisfies PluginOption;
}
