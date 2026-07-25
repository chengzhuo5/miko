import { resolve } from 'node:path'
import { exists } from 'fs-extra'
import type { PluginOption } from 'vite'

const virtualModuleId = 'virtual:bootstrap'

/**
 * virtual:bootstrap 插件
 *
 * 搜索项目根目录的启动文件（默认 index.ts）的默认导出，
 * 将 Vue App 实例作为参数传入。
 *
 * @param entryFile 启动入口文件名（相对于 cwd），默认 'index.ts'
 */
export function bootstrapPlugin(entryFile?: string) {
  const entry = entryFile || 'index.ts'
  return {
    name: '@minar-kotonoha/vite-plugin-bootstrap',
    resolveId(id: string, importer: string | undefined) {
      if (importer && id === virtualModuleId) {
        return `\0${id}`
      }
    },
    load: async (id: string) => {
      if (id.startsWith(`\0${virtualModuleId}`)) {
        return (await exists(resolve(process.cwd(), entry)))
          ? `import * as Index from '@/index';export const bootstrap = Index.default ?? (() => {});`
          : `export const bootstrap = () =>{};`
      }
    },
  } satisfies PluginOption
}
