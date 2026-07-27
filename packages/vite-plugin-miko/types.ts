/**
 * # @minar-kotonoha/vite-plugin-miko 类型定义
 *
 * `MikoUserConfig` 为 `miko.config.ts` 的完整配置类型。
 * 所有字段均为可选，默认值在 JSDoc 中标注。
 *
 * 插件子类型直接引用底层插件的 Options 类型，保证类型始终准确。
 */

// ===== 直接引用底层插件类型（保证与插件版本同步） =====

import type { Options as VueOptions } from '@vitejs/plugin-vue'
import type { Options as VueJsxOptions } from '@vitejs/plugin-vue-jsx'
import type { Options as LegacyOptions } from '@vitejs/plugin-legacy'
import type { UserOptions as LayoutsUserOptions } from 'vite-plugin-vue-layouts-next'
import type { VitePluginConfig as UnoCSSVitePluginConfig } from '@unocss/vite'

// ===================================================================
// 重新导出底层插件类型（方便用户直接在 miko.config.ts 中使用）
// ===================================================================

export type { VueOptions, VueJsxOptions, LegacyOptions, LayoutsUserOptions, UnoCSSVitePluginConfig }

// ===== 基础配置 =====

/** 开发服务器代理规则 */
export interface ProxyConfig {
  /** 要代理的路径模式，如 `['/api/**']` */
  context: string[]
  /** 代理目标地址 */
  target: string
  /** 是否修改请求头 origin */
  changeOrigin?: boolean
  /** 代理日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'
  /** 自定义代理事件 */
  configure?: (proxy: unknown) => void
}

// ===== 库模式 =====

export interface LibConfig {
  /** 库入口文件 */
  entry?: string
  /** 输出格式 */
  formats?: ('es' | 'cjs' | 'umd')[]
  /** 全局变量名（UMD 模式） */
  name?: string
  /** 输出文件名 */
  fileName?: string
}

// ===== Vue Router =====

export interface VueRouterOptions {
  /**
   * 路由文件扩展名
   * @default ['.vue', '.setup.tsx']
   */
  extensions?: string[]
  /**
   * 页面文件目录（文件系统路由扫描根目录）
   * @default '<cwd>/pages'
   */
  routesFolder?: string
  /**
   * 路由类型声明输出路径
   * @default '<cwd>/types/routes.d.ts'
   */
  dts?: string
}

// ===== 组件自动导入 =====

export interface ComponentsOptions {
  /**
   * 组件文件目录
   * @default ['<cwd>/components']
   */
  dirs?: string | string[]
  /**
   * 组件文件扩展名
   * @default ['vue', 'tsx', 'ts']
   */
  extensions?: string[]
  /**
   * 类型声明输出路径，false 表示不生成
   * @default '<cwd>/types/components.d.ts'
   */
  dts?: string | boolean
  /** 额外自定义 resolvers（会替换 uiLibrary 的默认 resolver） */
  resolvers?: unknown[]
}

// ===== SSG =====

/**
 * vite-ssg 配置。
 * 设为 `false` 禁用 SSG（降级为纯 SPA）。
 */
export interface SSGConfig {
  /** beasties 配置（控制资源内联与压缩） */
  beastiesOptions?: {
    /** 是否外部化资源，默认 false（所有 CSS/JS 内联到 HTML） */
    external?: boolean
    /** 压缩配置 */
    compress?: boolean | Record<string, unknown>
    [key: string]: unknown
  }
  /**
   * 输出目录结构
   * - `'flat'`：/about.html
   * - `'nested'`：/about/index.html
   * @default 'flat'
   */
  dirStyle?: 'flat' | 'nested'
  /**
   * HTML 格式化
   * @default 'none'
   */
  formatting?: 'none' | 'prettier'
  /** 需要被包含的路由过滤函数 */
  includedRoutes?: (paths: string[]) => string[]
  /** 页面渲染完成钩子（可在此注入脚本、修改 HTML） */
  onPageRendered?: (route: string, renderedHTML: string) => string
  /** SSG 构建完成钩子（可在此做清理工作） */
  onFinished?: () => Promise<void>
}

// ===== 代码检查 =====

export interface LinterOptions {
  /**
   * 是否启用 oxlint
   * @default true
   */
  oxlint?: boolean
  /**
   * 是否启用 ESLint
   * @default true
   */
  eslint?: boolean
}

// ===== Bootstrap 启动器 =====

export interface BootstrapOptions {
  /**
   * 项目入口文件路径（相对于 cwd）
   * @default 'index.ts'
   */
  entryFile?: string
}

// ===== 外部化 / CDN =====

export interface ExternalOptions {
  /**
   * Framework CDN 地址，覆盖 .env 中的 VITE_FRAMEWORK_CDN
   * @default 'https://unpkg.com/@minar-kotonoha/framework@<version>/dist/framework_v<version>.umd.js'
   */
  frameworkCDN?: string
  /** 额外需要外部化的包名 */
  additionalExternals?: string[]
}

// ===== 开发 / 构建调优 =====

export interface DevOptions {
  /**
   * 是否启用 bundledDev（Rolldown 原生 dev 模式）
   * @default false
   */
  bundledDev?: boolean
  /**
   * 开发服务器主机名（Vite server.host）
   * @default 'localhost'
   */
  host?: string | boolean
  /**
   * 开发服务器端口（Vite server.port）
   * @default 5173
   */
  port?: number
  /**
   * 是否自动打开浏览器
   * @default false
   */
  open?: boolean | string
}

// ===== Janus 接口拦截器 =====

export interface JanusOptions {
  /** Janus schema 目录 */
  schemasDir?: string
}

// ===================================================================
// 主配置类型
// ===================================================================

/**
 * miko 项目配置文件（`miko.config.ts`）的类型定义。
 *
 * **所有字段均为可选**，默认值已在每个字段的 JSDoc 中标注。
 *
 * ## 插件配置分类
 *
 * | 分类 | 字段 | 类型来源 |
 * |------|------|----------|
 * | Vue SFC 编译 | `vue` | `@vitejs/plugin-vue` Options |
 * | JSX / TSX | `vueJsx` | `@vitejs/plugin-vue-jsx` Options |
 * | 文件系统路由 | `vueRouter` | 自定义（vue-router/vite 参数） |
 * | 布局系统 | `layouts` | `vite-plugin-vue-layouts-next` UserOptions |
 * | 组件自动导入 | `components` | 自定义（unplugin-vue-components 参数） |
 * | 原子 CSS | `unoCSS` | `@unocss/vite` VitePluginConfig（`false` 禁用） |
 * | 浏览器兼容 | `legacy` | `@vitejs/plugin-legacy` Options（`false` 禁用） |
 * | 静态生成 | `ssg` | 自定义（vite-ssg 参数）（`false` 禁用） |
 * | 代码检查 | `linter` | 自定义（`false` 禁用） |
 * | 入口启动 | `bootstrap` | 自定义 |
 * | CDN 外部化 | `external` | 自定义 |
 * | 接口拦截 | `janus` | 自定义（`false` 禁用） |
 * | 开发调优 | `dev` | 自定义 |
 *
 * @example 最小配置
 * ```ts
 * // miko.config.ts
 * import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'
 * export default { uiLibrary: 'vant' } satisfies MikoUserConfig
 * ```
 *
 * @example 完整配置
 * ```ts
 * import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'
 * export default {
 *   // 基础
 *   uiLibrary: 'element-plus',
 *   layout: 'default',
 *   pagesDir: 'src/pages',
 *
 *   // 代理
 *   proxy: [{ context: ['/api/**'], target: 'https://api.example.com', changeOrigin: true }],
 *
 *   // 插件透传（直接使用底层插件 Options）
 *   vue: { features: { optionsAPI: false } },           // @vitejs/plugin-vue Options
 *   vueJsx: { tsTransform: 'built-in' },                // @vitejs/plugin-vue-jsx Options
 *   layouts: { extensions: ['vue', 'tsx'] },            // vite-plugin-vue-layouts-next UserOptions
 *   legacy: { targets: ['chrome 80', 'ios 13'] },       // @vitejs/plugin-legacy Options
 *   unoCSS: { configFile: 'uno.config.ts' },            // @unocss/vite VitePluginConfig
 *   ssg: { dirStyle: 'nested' },                        // false 禁用 SSG
 * } satisfies MikoUserConfig
 * ```
 */
export interface MikoUserConfig {
  // === 基础路径 ===

  /**
   * 模板目录路径。
   * 包含 App.vue、main.ts、index.html、layouts/ 等 Vite 入口模板文件。
   * @default 自动探测（优先项目根 `template/` → 回退包内 `template/`）
   */
  template?: string

  /**
   * 应用入口文件路径（传给 vite-ssg 的 entry）。
   * @default `<template>/main.ts`
   */
  entry?: string

  /**
   * 构建输出目录。
   * @default `'./dist'`
   */
  outDir?: string

  /**
   * 页面目录（文件系统路由的扫描根目录）。
   * @default `'./pages'`
   */
  pagesDir?: string

  // === UI 框架 ===

  /**
   * UI 组件库，控制自动导入 resolver 的选择。
   * @default `'vant'`
   */
  uiLibrary?: 'vant' | 'element-plus'

  /**
   * 默认布局名（`layouts.defaultLayout` 的快捷方式，向后兼容）。
   * 当同时设置了 `layout` 和 `layouts.defaultLayout` 时，后者优先。
   * @default `'flexible'`
   */
  layout?: string

  // === 开发服务器 ===

  /**
   * 开发服务器代理规则。
   * 数组格式（webpack-dev-server 风格），支持将多个路径映射到同一目标。
   *
   * @example
   * ```ts
   * proxy: [
   *   { context: ['/api/**'], target: 'https://dev.example.com', changeOrigin: true },
   * ]
   * ```
   * @default `[]`（无代理）
   */
  proxy?: ProxyConfig[]

  // === 库模式 ===

  /**
   * 库模式配置（供 `miko build --lib` 使用）。
   * @default `undefined`（应用模式）
   */
  lib?: LibConfig

  // === 开发调优 ===

  /**
   * 开发与构建行为微调。
   * @default `{ bundledDev: false }`
   */
  dev?: DevOptions

  // ===================================================================
  // 以下为各插件的独立配置分组
  // 类型直接引自底层插件 Options，保证与 npm 包版本同步
  // ===================================================================

  /**
   * `@vitejs/plugin-vue` 的完整 Options。
   *
   * 透传给 `vue()` 函数，支持 include/exclude/script/template/style/features/compiler 等。
   *
   * @see https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue
   * @default `{}`
   */
  vue?: VueOptions

  /**
   * `@vitejs/plugin-vue-jsx` 的完整 Options。
   *
   * 透传给 `vueJsx()` 函数，支持 include/exclude/babelPlugins/tsTransform 等。
   *
   * @see https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue-jsx
   * @default `{}`
   */
  vueJsx?: VueJsxOptions

  /**
   * vue-router 文件系统路由选项。
   * @default `{ extensions: ['.vue', '.setup.tsx'], routesFolder: '<pagesDir>', dts: '<cwd>/types/routes.d.ts' }`
   */
  vueRouter?: VueRouterOptions

  /**
   * `vite-plugin-vue-layouts-next` 的完整 UserOptions。
   *
   * 透传给 `Layouts()` 函数。
   * 注意：`layoutsDirs`、`pagesDirs`、`defaultLayout` 均有 miko 默认值，
   * 未设置时不会使用插件自身的默认值（`src/layouts` / `src/pages` / `default`）。
   *
   * @see https://github.com/JohnCampionJr/vite-plugin-vue-layouts-next
   * @default `{ defaultLayout: 'flexible', layoutsDirs: ['<template>/layouts', '<cwd>/layouts'], pagesDirs: '<pagesDir>' }`
   */
  layouts?: LayoutsUserOptions

  /**
   * unplugin-vue-components 选项。
   * @default `{ dirs: ['<cwd>/components'], extensions: ['vue', 'tsx', 'ts'], dts: '<cwd>/types/components.d.ts' }`
   */
  components?: ComponentsOptions

  /**
   * `@unocss/vite` 的完整 VitePluginConfig + UserConfig。
   *
   * 透传给 `UnoCSS()` 函数。设为 `false` 禁用 UnoCSS。
   *
   * 常用：`{ configFile: 'uno.config.ts' }` 加载自定义配置，
   * 或 `{ configFile: false }`（默认）使用默认预设。
   *
   * @see https://unocss.dev/integrations/vite
   * @default `{ configFile: false }`
   */
  unoCSS?: UnoCSSVitePluginConfig | false

  /**
   * `@vitejs/plugin-legacy` 的完整 Options。
   *
   * 透传给 `legacy()` 函数。设为 `false` 禁用（不生成 `-legacy` 产物）。
   *
   * @see https://github.com/vitejs/vite/tree/main/packages/plugin-legacy
   * @default `{ targets: ['chrome 49', 'ios 10'] }`
   */
  legacy?: LegacyOptions | false

  /**
   * vite-ssg 选项。
   * 设为 `false` 禁用 SSG（降级为纯 SPA）。
   *
   * @default `{ beastiesOptions: { external: false }, dirStyle: 'flat', formatting: 'none' }`
   */
  ssg?: SSGConfig | false

  /**
   * 构建时代码检查选项。
   * 设为 `false` 禁用所有 linter（oxlint + ESLint 均跳过）。
   *
   * @default `{ oxlint: true, eslint: true }`
   */
  linter?: LinterOptions | false

  /**
   * virtual:bootstrap 入口启动器选项。
   * @default `{ entryFile: 'index.ts' }`
   */
  bootstrap?: BootstrapOptions

  /**
   * CDN 外部化选项。
   * @default `{}`
   */
  external?: ExternalOptions

  /**
   * Janus 接口拦截器选项。
   * 设为 `false` 禁用（即使安装了 `@janus/unplugin` 也不加载）。
   *
   * @default 自动发现（安装了 `@janus/unplugin` 则自动启用）
   */
  janus?: JanusOptions | false
}
