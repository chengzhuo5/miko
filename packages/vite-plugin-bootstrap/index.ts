import { resolve } from 'node:path';
import { exists } from 'fs-extra';
import { normalizePath } from 'vite';
import type { PluginOption } from 'vite';

const virtualModuleId = 'virtual:bootstrap';
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

/**
 * virtual:bootstrap 插件
 *
 * 搜索项目根目录的启动文件（默认 index.ts）的默认导出，
 * 将 Vue App 实例作为参数传入。
 *
 * @param entryFile 启动入口文件名（相对于 Vite root），默认 'index.ts'
 */
export function bootstrapPlugin(entryFile = 'index.ts') {
  let root = '';

  return {
    name: '@minar-kotonoha/vite-plugin-bootstrap',

    configResolved(config) {
      root = config.root;
    },

    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
    },

    async load(id) {
      if (id !== resolvedVirtualModuleId) return;
      if (!root) throw new Error('[miko] bootstrapPlugin 尚未获得 Vite root');

      const entry = normalizePath(resolve(root, entryFile));
      return (await exists(entry))
        ? `import * as Index from ${JSON.stringify(entry)};export const bootstrap = Index.default ?? (() => {});`
        : 'export const bootstrap = () => {}';
    },
  } satisfies PluginOption;
}
