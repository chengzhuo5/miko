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
 * miko.config.ts（可选，零配置即可运行）:
 *   export default {
 *     uiLibrary: 'vant',
 *     proxy: [{ context: ['/api/**'], target: 'https://dev.example.com' }],
 *   } satisfies import('@minar-kotonoha/vite-plugin-miko').MikoUserConfig
 */

import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { remove } from 'fs-extra'
import { defineConfig, mergeConfig } from 'vite'
import type { PluginOption, ProxyOptions, UserConfig } from 'vite'

// Vue 生态
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import VueRouter from 'vue-router/vite'
import VueMacros from 'vue-macros/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

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

// 类型
import type {
  MikoUserConfig,
  ProxyConfig,
  LibConfig,
  SSGConfig,
  VueOptions,
  VueJsxOptions,
  VueRouterOptions,
  LayoutsUserOptions,
  LegacyOptions,
  ComponentsOptions,
  UnoCSSVitePluginConfig,
  LinterOptions,
  BootstrapOptions,
  ExternalOptions,
  DevOptions,
  JanusOptions,
} from './types'

// 重新导出类型供外部使用
export type {
  MikoUserConfig,
  ProxyConfig,
  LibConfig,
  SSGConfig,
  VueOptions,
  VueJsxOptions,
  VueRouterOptions,
  LayoutsUserOptions,
  LegacyOptions,
  ComponentsOptions,
  UnoCSSVitePluginConfig,
  LinterOptions,
  BootstrapOptions,
  ExternalOptions,
  DevOptions,
  JanusOptions,
}

const cwd = process.cwd()

// ===================================================================
// 默认值常量
// ===================================================================

const DEFAULTS = {
  uiLibrary: 'vant' as const,
  layout: 'flexible',
  outDir: './dist',
  pagesDir: './pages',
  componentsDir: './components',
  entryFile: 'index.ts',
  extensionsRoute: ['.vue', '.setup.tsx'] as string[],
  extensionsComponent: ['vue', 'tsx', 'ts'] as string[],
  legacyTargets: ['chrome 49', 'ios 10'] as string[],
  bundledDev: false,
} as const

// ===================================================================
// 路径探测
// ===================================================================

function detectTemplate(): string {
  // 优先项目本地 template/（用户可覆盖）
  const local = resolve(cwd, 'template')
  if (existsSync(local)) return local
  // 回退到插件内置 template/
  const bundled = fileURLToPath(new URL('./template', import.meta.url))
  if (existsSync(bundled)) return bundled
  return local
}

function detectEntry(template: string): string {
  return resolve(template, 'main.ts')
}

// ===================================================================
// 配置加载
// ===================================================================

/**
 * 从 `miko.config.ts` 加载用户配置。
 * 文件不存在或解析失败时返回空对象。
 */
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

// ===================================================================
// 配置解析 —— 将用户配置与默认值合并
// ===================================================================

interface ResolvedConfig {
  template: string
  entry: string
  outDir: string
  pagesDir: string
  uiLibrary: 'vant' | 'element-plus'
  layout: string
  layoutsDirs: string[]
  proxy: ProxyConfig[] | undefined
  lib: LibConfig | undefined

  // 插件深度配置
  vue: VueOptions
  vueJsx: VueJsxOptions
  vueRouter: VueRouterOptions
  layouts: LayoutsUserOptions
  components: ComponentsOptions
  unoCSS: UnoCSSVitePluginConfig | false
  legacy: LegacyOptions | false
  ssg: SSGConfig | false
  linter: LinterOptions | false
  bootstrap: BootstrapOptions
  external: ExternalOptions
  dev: DevOptions
  janus: JanusOptions | false
}

function resolveConfig(cfg: MikoUserConfig): ResolvedConfig {
  const template = cfg.template || detectTemplate()
  const entry = cfg.entry || detectEntry(template)
  const outDir = cfg.outDir ? resolve(cwd, cfg.outDir) : resolve(cwd, DEFAULTS.outDir)
  const pagesDir = cfg.pagesDir ? resolve(cwd, cfg.pagesDir) : resolve(cwd, DEFAULTS.pagesDir)

  // === 布局 ===
  const layout = cfg.layouts?.defaultLayout ?? cfg.layout ?? process.env.VITE_LAYOUT ?? DEFAULTS.layout
  const layoutsDirs = cfg.layouts?.layoutsDirs
    ? (Array.isArray(cfg.layouts.layoutsDirs) ? cfg.layouts.layoutsDirs : [cfg.layouts.layoutsDirs])
    : [resolve(template, 'layouts'), resolve(cwd, './layouts')]

  // === Vue Router ===
  const vueRouter: VueRouterOptions = {
    extensions: cfg.vueRouter?.extensions ?? DEFAULTS.extensionsRoute,
    routesFolder: cfg.vueRouter?.routesFolder ?? pagesDir,
    dts: cfg.vueRouter?.dts ?? resolve(cwd, 'types', 'routes.d.ts'),
  }

  // === 组件 ===
  const components: ComponentsOptions = {
    dirs: cfg.components?.dirs ?? [resolve(cwd, DEFAULTS.componentsDir)],
    extensions: cfg.components?.extensions ?? DEFAULTS.extensionsComponent,
    dts: cfg.components?.dts ?? resolve(cwd, 'types', 'components.d.ts'),
    resolvers: cfg.components?.resolvers ?? undefined,
  }

  // === UnoCSS ===
  const unoCSS: UnoCSSVitePluginConfig | false =
    cfg.unoCSS === false
      ? false
      : {
          configFile: existsSync(resolve(cwd, 'uno.config.ts')) ? resolve(cwd, 'uno.config.ts') : false,
          ...cfg.unoCSS,
        }

  // === Legacy ===
  const legacyResolved: LegacyOptions | false =
    cfg.legacy === false
      ? false
      : {
          targets: DEFAULTS.legacyTargets,
          ...cfg.legacy,
        }

  // === SSG ===
  const ssg: SSGConfig | false =
    cfg.ssg === false
      ? false
      : (mergeConfig(
          {
            beastiesOptions: { external: false },
            dirStyle: 'flat',
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
          } as UserConfig,
          cfg.ssg as UserConfig,
        ) as unknown as SSGConfig)

  // === Linter ===
  const linter: LinterOptions | false =
    cfg.linter === false
      ? false
      : { oxlint: true, eslint: true, ...cfg.linter }

  // === Bootstrap ===
  const bootstrap: BootstrapOptions = {
    entryFile: DEFAULTS.entryFile,
    ...cfg.bootstrap,
  }

  // === External ===
  const external: ExternalOptions = {
    ...cfg.external,
  }

  // === Dev ===
  const dev: DevOptions = {
    bundledDev: DEFAULTS.bundledDev,
    ...cfg.dev,
  }

  // === Janus ===
  const janus: JanusOptions | false =
    cfg.janus === false ? false : { ...cfg.janus }

  return {
    template,
    entry,
    outDir,
    pagesDir,
    uiLibrary: cfg.uiLibrary || DEFAULTS.uiLibrary,
    layout,
    layoutsDirs,
    proxy: cfg.proxy,
    lib: cfg.lib,
    vue: cfg.vue ?? {},
    vueJsx: cfg.vueJsx ?? {},
    vueRouter,
    layouts: cfg.layouts ?? {},
    components,
    unoCSS,
    legacy: legacyResolved,
    ssg,
    linter,
    bootstrap,
    external,
    dev,
    janus,
  }
}

// ===================================================================
// 工具
// ===================================================================

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

function loadJanus(opts: JanusOptions | false): PluginOption | null {
  if (opts === false) return null
  try {
    const janusEntry = resolve(cwd, 'node_modules/@janus/unplugin/dist/unplugin.cjs')
    if (!existsSync(janusEntry)) return null
    const _require = createRequire(import.meta.url)
    const mod = _require(janusEntry)
    const janusOpts = Object.keys(opts).length > 0 ? opts : {}
    const plugin = mod?.vite?.(janusOpts) || mod?.default?.vite?.(janusOpts)
    if (plugin) console.log('[miko] Janus 接口拦截器已启用')
    return plugin
  } catch (e: unknown) {
    console.warn('[miko] Janus 加载失败:', (e as Error)?.message)
    return null
  }
}

// ===================================================================
// 库模式配置工厂
// ===================================================================

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

// ===================================================================
// 主入口
// ===================================================================

/**
 * 统一配置入口 —— 直接展开所有插件和配置，不嵌套。
 *
 * 返回 sync defineConfig 工厂，兼容 viteSsgBuild。
 *
 * 配置读取优先级：`miko.config.ts`（项目根目录） > 默认值。
 * 所有字段均可选，零配置即可运行。
 *
 * @example
 *   // vite.config.ts
 *   import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
 *   export default await defineMikoConfig()
 */
export async function defineMikoConfig() {
  const raw = await loadMikoConfig()
  const cfg = resolveConfig(raw)

  // 解构已解析的配置
  const {
    template,
    entry,
    outDir,
    pagesDir,
    uiLibrary,
    layout,
    layoutsDirs,
    proxy,
    vue: vueOpts,
    vueJsx: vueJsxOpts,
    vueRouter: vueRouterOpts,
    layouts: layoutsOpts,
    components: componentsOpts,
    unoCSS: unoCSSOpts,
    legacy: legacyOpts,
    ssg: ssgOpts,
    linter: linterOpts,
    bootstrap: bootstrapOpts,
    external: externalOpts,
    dev: devOpts,
    janus: janusOpts,
  } = cfg

  // 设置环境变量（external 插件和 template/App.vue 通过 env 读取）
  if (externalOpts.frameworkCDN) {
    process.env.VITE_FRAMEWORK_CDN = externalOpts.frameworkCDN
  }

  // 设置环境变量（自定义 bootstrap 入口文件）
  if (bootstrapOpts.entryFile !== DEFAULTS.entryFile) {
    process.env.MIKO_BOOTSTRAP_ENTRY = bootstrapOpts.entryFile
  }

  console.log(`[miko] UI 组件库: ${uiLibrary}`)
  console.log(`[miko] 布局: ${layout}`)
  console.log(`[miko] 模板目录: ${template}`)
  console.log(`[miko] 入口文件: ${entry}`)

  // ===== 构建 PluginOption 数组 =====

  const plugins: PluginOption[] = []

  // 1. Vue 生态
  plugins.push(
    VueMacros({
      plugins: {
        vue: vue(vueOpts),
        vueJsx: vueJsx(vueJsxOpts),
        vueRouter: VueRouter({
          extensions: vueRouterOpts.extensions,
          routesFolder: vueRouterOpts.routesFolder,
          dts: vueRouterOpts.dts,
          extendRoute(route: { path?: string; addAlias: (a: string[]) => void }) {
            if (route.path) route.addAlias([route.path === '/' ? 'index.html' : `${route.path}.html`])
          },
        }),
      },
    }),
    vueDevTools(),
  )

  // 2. 布局
  plugins.push(
    Layouts({
      defaultLayout: layout,
      layoutsDirs,
      pagesDirs: layoutsOpts.pagesDirs ?? pagesDir,
    }),
  )

  // 3. 代码检查
  if (linterOpts !== false) {
    // linterPlugin 内部已处理 oxlint/eslint 开关，直接传入
    plugins.push(linterPlugin)
  }

  // 4. Legacy 浏览器兼容
  if (legacyOpts !== false) {
    plugins.push(legacy({ targets: DEFAULTS.legacyTargets, ...legacyOpts }))
  }

  // 5. 组件自动导入
  const componentResolvers = cfg.components.resolvers
    ? cfg.components.resolvers
    : uiLibrary === 'vant'
      ? [VantResolver()]
      : [ElementPlusResolver()]

  plugins.push(
    Components({
      dirs: Array.isArray(componentsOpts.dirs) ? componentsOpts.dirs : [componentsOpts.dirs],
      extensions: componentsOpts.extensions,
      dts: componentsOpts.dts,
      resolvers: componentResolvers,
    }),
  )

  // 6. UnoCSS
  if (unoCSSOpts !== false) {
    plugins.push(UnoCSS({ configFile: false, ...unoCSSOpts } as Parameters<typeof UnoCSS>[0]))
  }

  // 7. Bootstrap（virtual:bootstrap）
  plugins.push(bootstrapPlugin(bootstrapOpts.entryFile))

  // 8. External（CDN 外部化）
  plugins.push(...externalPlugin())

  // 9. IndexHTML
  plugins.push(await indexHTMLPlugin(entry, template))

  // 10. Janus（可选）
  const janusPlugin = loadJanus(janusOpts)
  if (janusPlugin) plugins.push(janusPlugin)

  // ===== 组装 defineConfig =====

  return defineConfig(() => ({
    server: {
      host: devOpts.host ?? true,
      port: devOpts.port,
      proxy: proxy ? normalizeProxy(proxy) : undefined,
    },
    build: { outDir, emptyOutDir: true },
    cacheDir: resolve(cwd, './node_modules/.vite'),
    resolve: { alias: [{ find: '@', replacement: cwd }], tsconfigPaths: true },
    experimental: { bundledDev: devOpts.bundledDev ?? DEFAULTS.bundledDev },
    ssgOptions: ssgOpts === false
      ? undefined
      : {
          beastiesOptions: ssgOpts.beastiesOptions ?? { external: false },
          dirStyle: ssgOpts.dirStyle ?? 'flat',
          entry,
          formatting: ssgOpts.formatting ?? 'none',
          includedRoutes: ssgOpts.includedRoutes ?? ((paths: string[]) => paths.filter((p) => !p.includes('node_modules'))),
          onPageRendered: ssgOpts.onPageRendered ?? ((_route: string, renderedHTML: string) => renderedHTML),
          onFinished: ssgOpts.onFinished ?? (async () => { await remove(resolve(outDir, '.vite')) }),
        },
    plugins,
  }))
}
