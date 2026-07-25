/**
 * # @minar-kotonoha/vite-plugin-miko
 *
 * `defineMikoConfig` — 一行搞定 Vue 3 SSG 项目的全部 Vite 配置。
 *
 * 所有插件直接展开在 defineConfig 中（不嵌套），兼容 vite-ssg。
 *
 * ===== 用法 =====
 *
 * vite.config.ts:
 *   import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
 *   export default await defineMikoConfig()
 *
 * miko.config.ts（可选）:
 *   export default {
 *     uiLibrary: 'vant',
 *     layout: 'flexible',
 *     proxy: [{ context: ['/api/**'], target: 'https://dev.example.com' }],
 *   }
 */
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { remove } from 'fs-extra'
import { defineConfig } from 'vite'
import type { ProxyOptions } from 'vite'

// Vue 生态
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import VueRouter from 'vue-router/vite'
import VueMacros from 'vue-macros/vite'

// Layouts
import Layouts from 'vite-plugin-vue-layouts-next'

// Linter
import linterPlugin from '@minar-kotonoha/linter/vite'

// Legacy
import legacy from '@vitejs/plugin-legacy'

// Components auto-import
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { VantResolver } from '@vant/auto-import-resolver'

// UnoCSS
import UnoCSS from 'unocss/vite'

// Miko 子插件
import { bootstrapPlugin } from '@minar-kotonoha/vite-plugin-bootstrap'
import { externalPlugin } from '@minar-kotonoha/vite-plugin-external'
import { indexHTMLPlugin } from '@minar-kotonoha/vite-plugin-index-html'

// ===== 类型 =====

export interface ProxyConfig {
  context: string[]
  target: string
  changeOrigin?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'
  configure?: (proxy: unknown) => void
}

export interface MikoUserConfig {
  template?: string
  entry?: string
  outDir?: string
  uiLibrary?: 'vant' | 'element-plus'
  layout?: string
  proxy?: ProxyConfig[]
  lib?: {
    entry?: string
    formats?: ('es' | 'cjs' | 'umd')[]
    name?: string
    fileName?: string
  }
}

const cwd = process.cwd()

// ===== 路径探测 =====

function detectTemplate(): string {
  const local = resolve(cwd, 'template')
  if (existsSync(local)) return local
  const pkgRelative = fileURLToPath(new URL('../../template', import.meta.url))
  if (existsSync(pkgRelative)) return pkgRelative
  return local
}

function detectEntry(template: string): string {
  return resolve(template, 'main.ts')
}

// ===== 配置加载 =====

export async function loadMikoConfig(): Promise<MikoUserConfig> {
  const configPath = resolve(cwd, 'miko.config.ts')
  if (!existsSync(configPath)) return {}
  try {
    const mod = await import(configPath)
    return (mod.default || mod) as MikoUserConfig
  } catch {
    return {}
  }
}

// ===== 工具 =====

function normalizeProxy(proxy: ProxyConfig[] | Record<string, string | ProxyOptions>): Record<string, string | ProxyOptions> {
  if (Array.isArray(proxy)) {
    const result: Record<string, string | ProxyOptions> = {}
    for (const rule of proxy) {
      const { context, ...options } = rule
      for (const path of context) {
        result[path.replace(/\/\*+$/, '')] = options as string | ProxyOptions
      }
    }
    return result
  }
  return proxy
}

function loadJanus() {
  try {
    const janusEntry = resolve(cwd, 'node_modules/@janus/unplugin/dist/unplugin.cjs')
    if (!existsSync(janusEntry)) return null
    const _require = createRequire(import.meta.url)
    const mod = _require(janusEntry)
    const plugin = (mod?.vite?.({}) || mod?.default?.vite?.({}))
    if (plugin) console.log('[miko] Janus 接口拦截器已启用')
    return plugin
  } catch (e: unknown) {
    console.warn('[miko] Janus 加载失败:', (e as Error)?.message)
    return null
  }
}

// ===== 库模式配置工厂 =====

export function createLibConfig(libOptions: {
  entry: string
  formats?: ('es' | 'cjs' | 'umd')[]
  name?: string
  fileName?: string
}) {
  const { entry, formats = ['es', 'cjs'], name, fileName } = libOptions

  return defineConfig({
    build: {
      outDir: resolve(cwd, './dist'),
      emptyOutDir: true,
      lib: { entry, formats, name, fileName },
      rollupOptions: { external: ['vue', 'vue-router', 'pinia', 'axios', '@unhead/vue'] },
    },
    resolve: { alias: [{ find: '@', replacement: cwd }], tsconfigPaths: true },
    plugins: [
      VueMacros({ plugins: { vue: vue(), vueJsx: vueJsx() } }),
      UnoCSS({ configFile: false }),
    ],
  })
}

// ===== 主入口 =====

/**
 * 统一配置入口 —— 直接展开所有插件和配置，不嵌套。
 *
 * 返回 sync defineConfig 工厂，兼容 viteSsgBuild。
 *
 * @example
 *   import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
 *   export default await defineMikoConfig()
 */
export async function defineMikoConfig() {
  const cfg = await loadMikoConfig()

  const template = cfg.template || detectTemplate()
  const entry = cfg.entry || detectEntry(template)
  const outDir = cfg.outDir ? resolve(cwd, cfg.outDir) : resolve(cwd, './dist')
  const uiLibrary = cfg.uiLibrary || 'vant'
  const layout = cfg.layout || process.env.VITE_LAYOUT || 'flexible'
  const proxy = cfg.proxy
  const janus = loadJanus()

  console.log(`[miko] UI 组件库: ${uiLibrary}`)
  console.log(`[miko] 布局: ${layout}`)
  console.log(`[miko] 模板目录: ${template}`)
  console.log(`[miko] 入口文件: ${entry}`)

  return defineConfig(() => ({
    server: proxy ? { proxy: normalizeProxy(proxy) } : undefined,
    build: { outDir, emptyOutDir: true },
    cacheDir: resolve(cwd, './node_modules/.vite'),
    resolve: { alias: [{ find: '@', replacement: cwd }], tsconfigPaths: true },
    experimental: { bundledDev: true },
    ssgOptions: {
      beastiesOptions: { external: false },
      dirStyle: 'flat',
      entry,
      formatting: 'none',
      includedRoutes(paths: string[]) {
        return paths.filter((p) => !p.includes('node_modules'))
      },
      onPageRendered(_route: string, renderedHTML: string) {
        return renderedHTML
      },
      async onFinished() {
        await remove(resolve(outDir, '.vite'))
      },
    },
    plugins: [
      VueMacros({
        plugins: {
          vue: vue(),
          vueJsx: vueJsx(),
          vueRouter: VueRouter({
            extensions: ['.vue', '.setup.tsx'],
            extendRoute(route: { path?: string; addAlias: (a: string[]) => void }) {
              if (route.path) route.addAlias([route.path === '/' ? 'index.html' : `${route.path}.html`])
            },
            routesFolder: resolve(cwd, './pages'),
            dts: resolve(cwd, 'types', 'routes.d.ts'),
          }),
        },
      }),
      Layouts({
        defaultLayout: layout,
        layoutsDirs: [resolve(template, 'layouts'), resolve(cwd, './layouts')],
        pagesDirs: resolve(cwd, './pages'),
      }),
      linterPlugin,
      legacy({ targets: ['chrome 49', 'ios 10'] }),
      Components({
        dirs: [resolve(cwd, './components')],
        extensions: ['vue', 'tsx', 'ts'],
        dts: resolve(cwd, 'types', 'components.d.ts'),
        resolvers: uiLibrary === 'vant' ? [VantResolver()] : [ElementPlusResolver()],
      }),
      UnoCSS({ configFile: false }),
      bootstrapPlugin(),
      ...externalPlugin(),
      indexHTMLPlugin(entry, template),
      janus,
    ].filter(Boolean),
  }))
}
