# @minar-kotonoha/vite-plugin-miko

Miko 总控插件 — 一行搞定 Vue 3 SSG 项目的全部 Vite 配置。

## 内置插件

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
import { defineConfig } from 'vite'
import { mikoPlugin } from '@minar-kotonoha/vite-plugin-miko'

export default defineConfig(async () => ({
  plugins: [...await mikoPlugin()]
}))
```

可选创建 `miko.config.ts`：

```ts
export default {
  uiLibrary: 'vant',    // 'vant' | 'element-plus'
  layout: 'flexible',   // 默认布局
  proxy: [
    { context: ['/api/**'], target: 'https://dev.example.com', changeOrigin: true },
  ],
}
```

## 配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `uiLibrary` | `'vant' \| 'element-plus'` | `'vant'` | UI 组件库 |
| `layout` | `string` | `'flexible'` | 默认布局名 |
| `template` | `string` | 自动探测 | 模板目录 |
| `entry` | `string` | `<template>/main.ts` | 入口文件 |
| `outDir` | `string` | `./dist` | 输出目录 |
| `proxy` | `ProxyConfig[]` | — | 开发代理 |
| `lib` | `object` | — | 库模式配置 |

## 导出

```ts
import {
  mikoPlugin,        // 主插件
  loadMikoConfig,    // 加载 miko.config.ts
  createLibConfig,   // 库模式配置工厂
} from '@minar-kotonoha/vite-plugin-miko'
```
