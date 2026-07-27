# @minar-kotonoha/vite-plugin-miko

Miko 总控插件 — 一行搞定 Vue 3 SSG 项目的全部 Vite 配置。**零配置即可运行。**

## 内置

| 类别 | 插件 | 说明 |
|------|------|------|
| Vue 生态 | Vue / Vue JSX / Vue Macros / Vue Router | 文件系统路由、TSX 支持 |
| 布局 | vite-plugin-vue-layouts-next | 默认布局 + 项目布局 |
| 组件 | unplugin-vue-components | Vant 4 / Element Plus 自动导入 |
| 样式 | UnoCSS | 原子化 CSS |
| 兼容 | @vitejs/plugin-legacy | chrome 49, ios 10 |
| 检查 | @minar-kotonoha/linter | 构建时 Oxlint + ESLint |
| 启动 | vite-plugin-bootstrap | virtual:bootstrap 自动发现入口 |
| 外部化 | vite-plugin-external | 生产环境 CDN 加载 |
| 入口 | vite-plugin-index-html | dev/prod root 分离 |
| SSG | vite-ssg | beasties + flat 目录 |
| 可选 | Janus | 接口拦截器，安装后自动发现 |

## 用法

```ts
// vite.config.ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
export default await defineMikoConfig()
```

可选创建 `miko.config.ts` 覆盖默认值：

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  uiLibrary: 'vant',
  proxy: [
    { context: ['/api/**'], target: 'https://dev.example.com', changeOrigin: true },
  ],
} satisfies MikoUserConfig
```

## 配置参考

以下所有字段均为可选，包含完整默认值。

### 基础路径

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `template` | `string` | 自动探测 | 模板目录（含 App.vue, main.ts, index.html, layouts/） |
| `entry` | `string` | `<template>/main.ts` | 应用入口文件路径 |
| `outDir` | `string` | `'./dist'` | 构建输出目录 |
| `pagesDir` | `string` | `'./pages'` | 文件系统路由的页面目录 |

### UI 框架

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `uiLibrary` | `'vant' \| 'element-plus'` | `'vant'` | UI 组件库 |

### 布局

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `layout` | `string` | `'flexible'` | 默认布局名（`layouts.defaultLayout` 的快捷方式） |
| `layouts.defaultLayout` | `string` | `'flexible'` | 默认布局名（与 `layout` 等效，优先级更高） |
| `layouts.layoutsDirs` | `string \| string[]` | `['<template>/layouts', '<cwd>/layouts']` | 布局文件目录 |
| `layouts.pagesDirs` | `string \| string[]` | `'<cwd>/pages'` | 页面文件目录 |

### 开发服务器

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `proxy` | `ProxyConfig[]` | `[]` | 开发服务器代理规则 |
| `dev.bundledDev` | `boolean` | `false` | 启用 Rolldown bundledDev |
| `dev.port` | `number` | 自动分配 | 开发服务器端口 |
| `dev.open` | `boolean \| string` | `false` | 自动打开浏览器 |

### Vue 核心

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `vue` | `VuePluginOptions` | `{}` | `@vitejs/plugin-vue` 选项透传 |
| `vueJsx` | `VueJsxPluginOptions` | `{}` | `@vitejs/plugin-vue-jsx` 选项透传 |

### 路由

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `vueRouter.extensions` | `string[]` | `['.vue', '.setup.tsx']` | 路由文件扩展名 |
| `vueRouter.routesFolder` | `string` | `<pagesDir>` | 路由扫描目录 |
| `vueRouter.dts` | `string` | `'<cwd>/types/routes.d.ts'` | 路由类型声明路径 |

### 组件自动导入

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `components.dirs` | `string \| string[]` | `['./components']` | 组件扫描目录 |
| `components.extensions` | `string[]` | `['vue', 'tsx', 'ts']` | 组件文件扩展名 |
| `components.dts` | `string \| boolean` | `'<cwd>/types/components.d.ts'` | 组件类型声明路径 |

### UnoCSS

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `unoCSS` | `UnoCSSOptions \| false` | `{ configFile: false }` | 设为 `false` 禁用。`configFile: false` 使用默认预设 |

### 浏览器兼容

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `legacy` | `LegacyOptions \| false` | `{ targets: ['chrome 49', 'ios 10'] }` | 设为 `false` 禁用 legacy |

### SSG

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ssg` | `SSGConfig \| false` | — | 设为 `false` 禁用 SSG（降级为纯 SPA） |
| `ssg.beastiesOptions` | `object` | `{ external: false }` | 资源内联与压缩 |
| `ssg.dirStyle` | `'flat' \| 'nested'` | `'flat'` | 输出目录结构 |
| `ssg.formatting` | `'none' \| 'prettier'` | `'none'` | HTML 格式化 |

### 代码检查

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `linter` | `LinterOptions \| false` | `{ oxlint: true, eslint: true }` | 设为 `false` 禁用 linter |

### CDN 外部化

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `external.frameworkCDN` | `string` | `unpkg` 自动地址 | Framework CDN 地址，覆盖 `.env` 中的 `VITE_FRAMEWORK_CDN` |

### Bootstrap

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `bootstrap.entryFile` | `string` | `'index.ts'` | 启动入口文件名（相对于 cwd） |

### Janus

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `janus` | `JanusOptions \| false` | 自动发现 | 设为 `false` 禁用。安装 `@janus/unplugin` 后自动启用 |

### 库模式

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `lib.entry` | `string` | — | 库入口文件 |
| `lib.formats` | `('es' \| 'cjs' \| 'umd')[]` | `['es', 'cjs']` | 输出格式 |
| `lib.name` | `string` | — | 全局变量名（UMD） |
| `lib.fileName` | `string` | — | 输出文件名 |

## 导出

```ts
import {
  defineMikoConfig,    // 统一入口 — await defineMikoConfig()
  loadMikoConfig,      // 加载 miko.config.ts
  createLibConfig,     // 库模式配置工厂
  // 类型
  type MikoUserConfig,
  type ProxyConfig,
  type LibConfig,
  type SSGConfig,
  type VueOptions,
  type VueJsxOptions,
  type VueRouterOptions,
  type LayoutsUserOptions,
  type LegacyOptions,
  type ComponentsOptions,
  type UnoCSSVitePluginConfig,
  type LinterOptions,
  type BootstrapOptions,
  type ExternalOptions,
  type DevOptions,
  type JanusOptions,
} from '@minar-kotonoha/vite-plugin-miko'
```
