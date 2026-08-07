# @minar-kotonoha/vite-plugin-miko

Miko 的配置与 Vite 组装引擎。日常项目通过 `miko` CLI 使用，不需要 `vite.config.ts`。

## 零配置

项目没有 `miko.config.ts` 时，Miko 自动启用 Vue、文件系统路由、布局、组件自动导入、UnoCSS、SSG、代码检查、Bootstrap 和 HTML 入口。

```json
{
  "scripts": {
    "dev": "miko dev",
    "build": "miko build",
    "preview": "miko preview"
  }
}
```

## 可选配置

只有需要覆盖默认值时才创建 `miko.config.ts`：

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  miko: {
    rendering: 'ssg',
    uiLibrary: 'vant',
    legacyPluginOptions: false,
    externalOptions: false,
  },
  vite: {
    base: '/cms/',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'https://dev.example.com',
          changeOrigin: true,
        },
      },
    },
  },
} satisfies MikoUserConfig
```

- `miko`：Miko 管理的框架能力。
- `vite`：Vite 原生 `UserConfig`，按字段与 Miko 默认值合并。
- `vite.input`、`vite.build.rollupOptions.input` 和 `vite.build.rolldownOptions.input` 由 Miko 管理，不能覆盖。

配置也可以是函数：

```ts
import type { MikoConfigFactory } from '@minar-kotonoha/vite-plugin-miko'

export default ((env) => ({
  miko: {
    rendering: env.command === 'build' ? 'ssg' : 'spa',
  },
  vite: {
    define: {
      __MODE__: JSON.stringify(env.mode),
    },
  },
})) satisfies MikoConfigFactory
```

## Miko 配置

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `rendering` | `'ssg'` | `'ssg'` 或 `'spa'` |
| `template` | 自动探测 | 模板目录 |
| `entry` | `<template>/main.ts` | 应用入口 |
| `pagesDir` | `<root>/pages` | 文件系统路由目录 |
| `uiLibrary` | `'vant'` | `'vant'` 或 `'element-plus'` |
| `layout` | `'flexible'` | 默认布局 |
| `lib` | — | `miko build --lib` 配置 |
| `vuePluginOptions` | `{}` | `@vitejs/plugin-vue` 配置 |
| `vueJsxPluginOptions` | `{}` | `@vitejs/plugin-vue-jsx` 配置 |
| `routerPluginOptions` | 内置默认值 | 文件系统路由配置 |
| `layoutsPluginOptions` | `{}` | 布局插件配置，`false` 禁用 |
| `componentsPluginOptions` | 内置默认值 | 组件自动导入配置，`false` 禁用 |
| `unoCSSPluginOptions` | `{ configFile: false }` | UnoCSS 配置，`false` 禁用 |
| `legacyPluginOptions` | `false` | 按需启用 legacy 包 |
| `ssgOptions` | 内置默认值 | SSG 配置 |
| `linterOptions` | `{ oxlint: true, eslint: true }` | 构建检查，`false` 禁用 |
| `bootstrapOptions` | `{ entryFile: 'index.ts' }` | 项目启动入口 |
| `externalOptions` | `false` | 按需启用 CDN 外部化 |
| `devOptions` | `{ bundledDev: false }` | Miko 专属开发能力 |
| `janusOptions` | 自动发现 | Janus 配置，`false` 禁用 |

主机、端口、代理、输出目录等 Vite 能力直接配置在 `vite.server`、`vite.preview`、`vite.build` 中。

### CDN 外部化

```ts
export default {
  miko: {
    externalOptions: {
      frameworkCDN: 'https://cdn.example.com/framework.umd.js',
      additionalExternals: ['custom-runtime'],
      optimizeDepsExclude: ['custom-runtime'],
      ssrNoExternal: ['custom-runtime'],
    },
  },
}
```

应用依赖默认正常打包；只有提供 `frameworkCDN` 时才启用 CDN 外部化。

## 主要导出

```ts
import {
  createLibConfig,
  createMikoViteConfig,
  defineMikoConfig,
  loadMikoConfig,
  resolveMikoProject,
  type MikoConfig,
  type MikoConfigEnv,
  type MikoConfigFactory,
  type MikoUserConfig,
} from '@minar-kotonoha/vite-plugin-miko'
```
