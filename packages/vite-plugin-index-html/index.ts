import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { PluginOption, UserConfig } from 'vite'

const virtualModuleId = 'virtual:index'

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
      // 负责两件事：
      //   1. SPA history fallback —— 任意非静态资源 GET 都返回 index.html，
      //      让 vue-router (createWebHistory) 在 dev 阶段可以处理 /page1 等深层路径。
      //      不依赖 server.appType，因为本插件已经接管了 / 的响应，Vite 内置的
      //      spaFallback 中间件会因本中间件已 end() 而不会再次触发。
      //   2. 把 template/index.html 作为 / 和 /index.html 的根 HTML。
      const SPA_FALLBACK_PREFIXES = ['/@', '/node_modules/', '/__vite_ping', '/.well-known/']
      const STATIC_EXT = /\.[a-z0-9]+$/i
      const isStaticAsset = (url: string) =>
        STATIC_EXT.test(url) || SPA_FALLBACK_PREFIXES.some((p) => url.startsWith(p))

      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const url = req.url?.split('?')[0] || ''
        if (url === '/' || url === '/index.html' || (!isStaticAsset(url) && !url.startsWith('/api'))) {
          try {
            const html = await readFile(templatePath, 'utf-8')
            const transformed = await server.transformIndexHtml(url, html, req.originalUrl)
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(transformed)
            return
          } catch (err) {
            return next(err as Error)
          }
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
