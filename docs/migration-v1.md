# Miko v1 迁移指南

Miko v1 是破坏性大版本。它保留 Vue、Vite、SPA 和构建期 SSG，但收敛了配置和执行入口：

- Bun 是唯一包管理器、workspace、脚本调度和发布工具。
- 分发后的 `miko` CLI 使用 Node.js + jiti，不要求 Bun 作为应用运行时。
- CLI 是唯一入口，不支持项目级 `vite.config.ts`。
- 零配置项目不需要配置文件；高级配置只使用根目录 `miko.config.ts`。
- `miko.config.ts` 只有 `{ miko, vite }` 两个命名空间。
- 默认现代构建、应用内打包和 SSG；Legacy、CDN、SPA 都是显式或确定性能力决策。

## 旧版到 v1 的映射

| 旧版入口或字段                         | v1                                                                  |
| -------------------------------------- | ------------------------------------------------------------------- |
| `vite` / `vite build` / `vite preview` | `miko dev` / `miko build` / `miko preview`                          |
| 项目级 `vite.config.ts`                | 删除；Vite 原生字段迁入 `miko.config.ts` 的 `vite`                  |
| 顶层 Miko 配置                         | 迁入 `miko`                                                         |
| `ssg: false`                           | `miko.rendering: 'spa'`                                             |
| `ssg: true`                            | `miko.rendering: 'ssg'`，通常可省略                                 |
| `dev.port`                             | `vite.server.port`                                                  |
| 旧 `proxy` 数组                        | `vite.server.proxy`                                                 |
| 顶层 `outDir`                          | `vite.build.outDir`                                                 |
| `vue` / `legacy` / `external`          | `miko.vuePluginOptions` / `legacyPluginOptions` / `externalOptions` |
| 手工创建 Pinia 并注水                  | 直接依赖 `pinia`，由 Miko 自动安装和完成 SSG 状态传递               |
| 手工 HTML 模板复制或修改 Vite root     | 保持真实项目 root；缺少 `index.html` 时使用内存入口                 |

## 推荐迁移流程

先提交或保存当前 Git 状态，再执行：

```sh
bun install

# 只分析，不修改文件
bunx miko migrate

# 安全计划才会写入；自动备份并运行 Doctor
bunx miko migrate --write

# 写入后继续完成隔离构建和浏览器检查
bunx miko migrate --write --check
```

迁移器使用 `oxc-parser` 静态读取旧配置，不会 import 或执行配置文件。函数、条件表达式、自定义插件顺序、未知对象展开、顶层可执行语句和 Miko 所有权的构建 input 都会转为人工处理项；存在这些项目时 `--write` 使用退出码 7 拒绝修改。

安全写入会：

1. 在 `.miko-migrate/<UTC timestamp>/` 备份全部源配置。
2. 生成 `RECOVER.md`，列出 PowerShell 和 POSIX 恢复命令。
3. 原子写入 `miko.config.ts`。
4. 仅在备份成功后删除已迁移的旧 `vite.config.ts`。
5. 运行 `miko doctor`；提供 `--check` 时继续运行完整 `miko check`。

Doctor 或 Check 失败不会回滚新配置，也不会删除备份，便于检查后恢复。

## v1 配置

零配置项目不创建任何配置文件。确实需要覆盖时才创建 `miko.config.ts`：

```ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko';

export default defineMikoConfig({
  miko: {
    rendering: 'ssg',
    uiLibrary: 'vant',
    vuePluginOptions: {
      features: {
        optionsAPI: false,
      },
    },
    legacyPluginOptions: false,
    whiteScreen: {
      timeout: 8000,
    },
  },
  vite: {
    base: '/cms/',
    server: {
      proxy: {
        '/api': {
          target: 'https://dev.example.com',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  },
});
```

`miko` 管理框架能力和内置插件选项；`vite` 接受完整 Vite `UserConfig`。对象选项与默认值合并，不会整块覆盖。应用入口 input 和应用 `build.lib` 仍由 Miko 管理。

配置可以是接收 `{ command, mode, root }` 的函数，但自动迁移器不会执行旧函数配置。动态配置必须人工迁移并通过 Doctor/Check 验证。

## 行为变化

### SPA 与 SSG

默认是构建期 SSG。需要纯 SPA 时使用：

```ts
export default {
  miko: {
    rendering: 'spa',
  },
};
```

v1 不提供常驻生产 SSR Server。SPA 不再把整条路由包进 `ClientOnly`；只有显式 `route.meta.clientOnly` 的页面使用客户端渲染边界。

### Legacy

默认输出面向现代浏览器。Browserslist 明确包含旧浏览器时可自动启用 Legacy，也可以使用 `miko.legacyPluginOptions` 覆盖或禁用。默认构建不生成 Legacy polyfill。

### CDN

Vue 生态依赖默认正常打包，以保留 tree-shaking、代码分割和离线部署能力。只有 `miko.externalOptions.frameworkCDN` 提供 URL 时才启用 framework CDN；此时项目必须直接依赖 `@minar-kotonoha/framework`。

### Proxy

代理使用 Vite 原生 `vite.server.proxy` 和 `vite.preview.proxy`。Preview 未配置代理时复用 Server 代理。Miko 不注入 `secure: false` 或 `rejectUnauthorized: false`。

### Pinia 与 Unhead

检测到 `pinia` 直接依赖后，Miko 在业务 bootstrap 前安装唯一实例，客户端恢复初始状态，SSG 在页面渲染完成后序列化非空状态。不要在 `index.ts` 重复创建或注水 Pinia。

Unhead 由能力图自动处理。页面继续使用 `useHead()`；SSG head 条目会写入生成的 HTML。

### HTML

Vite root 始终是真实项目目录。存在根 `index.html` 时使用用户文件；不存在时以同一绝对路径身份提供内存 HTML。两种入口都自动注入唯一 Miko 模块入口并校验唯一 `#app`。

### 白屏保护

白屏保护默认启用，默认超时 8000ms。构建产物包含独立哈希监控脚本；Vue 首次成功渲染后标记 ready。入口资源失败、启动异常、hydration 警告或永久未完成渲染会由 `miko check` 和运行时协议发现。可通过 `miko.whiteScreen: false` 禁用，或用对象覆盖超时。

## CLI

```sh
miko dev
miko build
miko preview
miko check
miko doctor
miko migrate
```

- `miko check [--all-routes]`：在系统临时目录完成类型检查、构建、静态产物检查、Preview 和 Chromium 冒烟，不覆盖正式 `dist`。
- `miko doctor [--json]`：只读显示能力来源、实际值和插件顺序。
- `miko migrate [--write] [--check]`：静态分析旧配置，安全写入时创建可恢复备份。

## 验证清单

```sh
bun install --frozen-lockfile
bun run typecheck:packages
bun run build
bunx miko doctor
bunx miko check --all-routes
```

业务项目还应运行自己的单元测试、Playwright E2E 和 API/视觉回归。构建成功只是基础条件，不能替代页面、路由和业务规则验证。

## Slice 3 性能基线

2026-08-10 在相同环境指纹下执行 3 次 cold、5 次 warm 和 5 次浏览器样本，正式 `perf:check` 全部通过：

- Small cold/warm：`-44.96% / -41.74%`
- Medium cold/warm：`+2.24% / -23.62%`
- Large cold/warm：`-28.11% / -41.82%`
- Runtime build cold/warm：`-45.58% / -34.41%`
- FCP：`-46.51%`
- LCP：`-27.91%`
- hydration：`-39.41%`
- script duration：`-35.50%`
- route navigation：`-25.72%`
- 请求数保持 7，未访问路由 chunk 未被请求

这些数字是相对仓库提交基线的同机测量，不是跨机器的绝对性能承诺。

## 恢复与回滚

如果迁移后需要恢复：

1. 打开本次 `.miko-migrate/<timestamp>/RECOVER.md`。
2. 从项目根目录执行其中对应平台的复制命令。
3. 如果旧项目原本没有 `miko.config.ts`，人工删除迁移新建的该文件。
4. 将 Miko 相关依赖恢复到升级前版本并执行 `bun install`。
5. 重新运行旧版本的构建、测试和浏览器验证。

恢复命令只复制备份，不删除当前文件；执行前应先检查 Git 状态。
