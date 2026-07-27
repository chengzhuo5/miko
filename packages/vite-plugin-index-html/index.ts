import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { PluginOption, UserConfig } from 'vite'

const virtualModuleId = 'virtual:index'

const cwd = process.cwd()

export async function indexHTMLPlugin(entry: string, template: string) {
  return {
    name: '@minar-kotonoha/vite-plugin-index-html',
    async config(_: UserConfig, { command }: { command: string }) {
      // 生产环境：root 指向 template/，确保 vite-ssg entry 在 root 内
      if (command === 'build') return { root: template }
      // 开发环境：不改 root（否则 UnoCSS 等内容扫描插件失效）
      return {}
    },
    configureServer(server) {
      const templatePath = resolve(template, 'index.html')
      // configureServer 先于 Vite 内部中间件执行，因此这里的中间件跑在最前面
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (url === '/' || url === '/index.html') {
          const html = await readFile(templatePath, 'utf-8')
          const transformed = await server.transformIndexHtml(url, html, req.originalUrl)
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(transformed)
          return
        }
        next()
      })
    },
    resolveId(id: string, importer: string | undefined) {
      if (importer && id === virtualModuleId) {
        return `\0${id}`
      }
    },
    load: (id: string) => {
      if (id.startsWith(`\0${virtualModuleId}`)) {
        return `import '${entry.replace(/\\/g, '/')}'`
      }
    },
  } satisfies PluginOption
}
