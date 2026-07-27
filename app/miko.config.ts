/**
 * miko 项目配置文件（可选，所有字段均可选，配置文件也可以不存在）
 *
 * defineMikoConfig() 会自动加载此文件并合并默认值。
 *
 * @see {@link import('@minar-kotonoha/vite-plugin-miko').MikoUserConfig}
 */

import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  // ===== 基础路径 =====
  /** UI 组件库：'vant'（默认）| 'element-plus' */
  uiLibrary: 'vant' as const,

  /** 默认布局名（layouts.defaultLayout 的快捷方式） */
  // layout: 'flexible',

  /** 模板目录路径（默认自动探测） */
  // template: 'template',

  /** 应用入口文件路径（默认 <template>/main.ts） */
  // entry: 'template/main.ts',

  /** 构建输出目录（默认 ./dist） */
  // outDir: 'dist',

  /** 页面目录 — 文件系统路由扫描根目录（默认 ./pages） */
  // pagesDir: 'pages',

  // ===== 开发服务器 =====
  proxy: [
    // {
    //   context: ['/api/**'],
    //   target: 'https://dev.example.com',
    //   changeOrigin: true,
    // },
  ],

  // ===== 库模式（miko build --lib 使用）=====
  // lib: {
  //   entry: 'src/index.ts',
  //   formats: ['es', 'cjs'],
  // },

  // ===== 各插件深度配置（均含默认值，按需覆盖）=====

  // vue: { /* @vitejs/plugin-vue 选项 */ },
  // vueJsx: { /* @vitejs/plugin-vue-jsx 选项 */ },
  // vueRouter: { extensions: ['.vue', '.setup.tsx'] },
  // layouts: { defaultLayout: 'flexible', layoutsDirs: ['template/layouts', './layouts'] },
  // components: { dirs: ['./components'], extensions: ['vue', 'tsx', 'ts'] },
  // unoCSS: { configFile: false },
  // legacy: { targets: ['chrome 49', 'ios 10'] },
  // ssg: { beastiesOptions: { external: false }, dirStyle: 'flat', formatting: 'none' },
  // linter: { oxlint: true, eslint: true },
  // bootstrap: { entryFile: 'index.ts' },
  // external: { frameworkCDN: 'https://unpkg.com/@minar-kotonoha/framework@0.1.1/dist/framework_v0.1.1.umd.js' },
  // dev: { bundledDev: false, port: 5173 },
  // janus: false,
} satisfies MikoUserConfig
