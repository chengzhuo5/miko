/**
 * miko 项目配置文件（可选，所有字段均可选，配置文件也可以不存在）
 *
 * defineMikoConfig() 会自动加载此文件并合并默认值。
 *
 * @see {@link import('@minar-kotonoha/vite-plugin-miko').MikoUserConfig}
 */

import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko';

export default {
  miko: {
    /** UI 组件库会根据直接依赖自动检测；多库并存时再显式选择 */
    // uiLibrary: 'vant',
    /** 默认布局名（layoutsPluginOptions.defaultLayout 的快捷方式） */
    // layout: 'flexible',
    /** 模板目录路径（默认自动探测） */
    // template: 'template',
    /** 应用入口文件路径（默认 <template>/main.ts） */
    // entry: 'template/main.ts',
    /** 页面目录 — 文件系统路由扫描根目录（默认 ./pages） */
    // pagesDir: 'pages',
    // ===== 库模式（miko build --lib 使用）=====
    // lib: {
    //   entry: 'src/index.ts',
    //   formats: ['es', 'cjs'],
    // },
    // ===== 各插件深度配置（均含默认值，按需覆盖）=====
    // vuePluginOptions: { /* @vitejs/plugin-vue 选项 */ },
    // vueJsxPluginOptions: { /* @vitejs/plugin-vue-jsx 选项 */ },
    // routerPluginOptions: { extensions: ['.vue', '.setup.tsx'] },
    // layoutsPluginOptions: { defaultLayout: 'flexible' },
    // componentsPluginOptions: { dirs: ['./components'], extensions: ['vue', 'tsx', 'ts'] },
    // unoCSSPluginOptions: { configFile: false },
    // legacyPluginOptions: { targets: ['chrome 49', 'ios 10'] },
    // ssgOptions: { beastiesOptions: { external: false }, dirStyle: 'flat', formatting: 'none' },
    // linterOptions: { oxlint: true, eslint: true },
    // bootstrapOptions: { entryFile: 'index.ts' },
    // externalOptions: { frameworkCDN: 'https://unpkg.com/@minar-kotonoha/framework/dist/framework.umd.js' },
    // devOptions: { bundledDev: false },
    // janusOptions: false,
  },
  vite: {
    /** 部署基础路径：所有 Vite 配置都放在 vite 命名空间 */
    base: '/cms/',
    // build: { outDir: 'dist' },
    // server: { host: '127.0.0.1', port: 5173, open: false },
    // server: {
    //   proxy: {
    //     '/api': {
    //       target: 'https://dev.example.com',
    //       changeOrigin: true,
    //     },
    //   },
    // },
  },
} satisfies MikoUserConfig;
