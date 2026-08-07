# @minar-kotonoha/vite-plugin-miko

Miko 的配置解析、自动能力图与 Vite 插件装配引擎。日常项目通过 `miko` CLI 使用，不需要也不支持 `vite.config.ts`。

项目使用 Bun 安装依赖；分发后的 CLI 使用 Node.js + jiti 运行。

## 零配置

项目没有 `miko.config.ts` 时，Miko 使用固定优先级解析能力：

```text
显式配置 → 根目录约定文件 → package.json 直接依赖 → 当前命令 → 安全默认值
```

| 能力 | 自动规则 |
|------|----------|
| Rendering | 默认 `ssg`，可显式设为 `spa` |
| Layouts | 项目 `layouts/` 优先，否则使用内置布局 |
| Components | 检测到 `components/` 或受支持 UI 库时启用 |
| UnoCSS | 检测 `uno.config.*`、`unocss` 或 `@unocss/vite` 直接依赖 |
| Linter | 默认启用；根目录 lint 配置会被识别 |
| Pinia | 检测到 `pinia` 直接依赖后自动安装和 SSG 注水 |
| Legacy | Browserslist 包含旧浏览器目标时启用 |
| DevTools | 仅开发命令启用 |
| CDN | 永不自动启用，必须显式提供 `frameworkCDN` |
| Janus | 同时检测到 `@janus/unplugin` 和 `schemas/` 时启用 |

`undefined` 表示自动检测，`false` 表示禁用，`true` 或对象表示显式启用；插件选项对象与 Miko 默认值合并，不会整块覆盖。

## 可选配置

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  miko: {
    rendering: 'ssg',
    uiLibrary: 'vant',
    legacyPluginOptions: false,
    componentsPluginOptions: {
      dirs: ['./components', './features'],
    },
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

- `miko`：框架能力和内置插件选项。
- `vite`：完整 Vite `UserConfig`，按字段与 Miko 默认值合并。
- `vite.input`、`vite.build.rollupOptions.input`、`vite.build.rolldownOptions.input` 和应用 `build.lib` 由 Miko 校验。

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

## HTML 入口

Vite `root` 始终保持真实项目目录：

- 根目录存在 `index.html`：使用用户文件。
- 不存在：插件以相同绝对路径身份在内存中提供内置 HTML。
- 两种来源都经过 `transformIndexHtml`，自动注入唯一 Miko 模块入口并校验唯一 `#app`。

不会复制临时 `index.html`，也不会把 Vite root 指向 `node_modules` 或模板目录。

## Pinia 运行时

检测到 `pinia` 直接依赖后，`virtual:miko-runtime` 会：

1. 在业务 bootstrap 前创建并安装唯一 Pinia 实例。
2. 客户端恢复 `window.__INITIAL_STATE__.pinia`。
3. SSG 渲染后写回 Pinia state，由 ViteSSG 序列化。

项目 `index.ts` 不再需要手动创建或注水 Pinia。

## Preview 代理

`miko preview` 优先使用 `vite.preview.proxy`，否则浅克隆并复用 `vite.server.proxy`。函数、RegExp、Agent 等合法引用保持不变；Miko 不注入 `secure: false` 或 `rejectUnauthorized: false`。

## CDN 外部化

应用依赖默认正常打包。只有提供 `frameworkCDN` 时才启用 CDN：

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

启用时项目必须直接依赖 `@minar-kotonoha/framework`。只有依赖优化或 SSR 选项而没有 URL 时，配置仍合法但不会启用 CDN。

## Doctor

```sh
bunx miko doctor
bunx miko doctor --json
```

Doctor 复用 Dev / Build / Preview 的同一份项目解析与插件装配结果，报告配置文件、渲染模式、能力来源、实际标量值、插件顺序和警告。它不启动 Vite，也不写项目文件。能力冲突和缺失依赖使用退出码 3。

## 主要导出

```ts
import {
  assembleMikoPlugins,
  createLibConfig,
  createMikoViteConfig,
  defineMikoConfig,
  resolveMikoProject,
  type MikoConfig,
  type MikoConfigEnv,
  type MikoConfigFactory,
  type MikoUserConfig,
  type PluginAssembly,
} from '@minar-kotonoha/vite-plugin-miko'
```
