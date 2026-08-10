---
name: to-miko
description: 将 Vue 3 + Vite 项目安全迁移到 Miko v1 的 CLI、零配置和单一 miko.config.ts 架构
---

# to-miko

将 Vue 3 + Vite 项目迁移到 Miko v1。Miko 使用 Bun 管理依赖和脚本，分发 CLI 运行在 Node.js + jiti；项目只通过 `miko` CLI 执行，不支持项目级 `vite.config.ts`。

## 不可变契约

- 先分析、后修改；第一次只运行 `miko migrate` dry-run。
- 修改前记录 Git 分支、HEAD 和工作区状态，现有业务改动不得被覆盖。
- 零配置项目不生成配置文件。
- 需要覆盖约定时只使用根目录 `miko.config.ts`，结构严格为 `{ miko, vite }`。
- 原 Vite 字段迁入 `vite`；框架能力和内置插件选项迁入 `miko`。
- 文件系统路由、SPA/SSG 语义和业务路由行为必须逐项验证。
- 动态配置、自定义插件顺序、构建 input 和跨文件冲突不得猜测迁移。
- Bun 是唯一包管理器；不要使用 npm、pnpm 或 yarn 改写 workspace/lockfile。

## Phase 0：建立基线

先读取并记录：

1. `package.json`、Bun lockfile 和 scripts。
2. 源项目的 `vite.config.ts` 或等效构建配置。
3. `src/router/`、入口文件、根组件和 `index.html`。
4. `tsconfig.json`、`.env.*`、UnoCSS、Browserslist 和 lint 配置。
5. 页面、布局、组件、store、API、微前端和业务 workspace 依赖。
6. 迁移前构建、关键路由、控制台错误、API 请求和截图基线。

读取 `references/plugin-map.json`，将每项标为：

- `replace`：Miko 内置能力替代。
- `adapt`：迁入 `miko.config.ts` 或调整源码。
- `keep`：业务依赖和业务行为保持。
- `manual`：自动迁移不安全，需要明确方案。

## Phase 1：生成安全计划

安装目标依赖后运行：

```sh
bun install
bunx miko migrate
```

检查 dry-run：

- `Source` 是否覆盖全部旧配置。
- `Target` 是否为根目录 `miko.config.ts`。
- `Status` 是否为 `safe`。
- 生成结果是否只包含 `miko` 和 `vite`。
- 是否存在 `MIKO_MIGRATE_MANUAL` 或 `MIKO_MIGRATE_CONFLICT`。

没有确认安全计划前，不运行 `--write`，也不手工删除旧配置。

## Phase 2：执行配置迁移

安全计划使用：

```sh
bunx miko migrate --write --check
```

该命令会备份旧配置、原子写入目标、删除已备份的旧 `vite.config.ts`，然后运行 Doctor 和隔离 Check。备份位于 `.miko-migrate/<UTC timestamp>/`。

如果计划不安全，人工迁移到：

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko';

export default {
  miko: {
    rendering: 'ssg',
    uiLibrary: 'vant',
  },
  vite: {
    base: '/',
    server: {
      proxy: {},
    },
  },
} satisfies MikoUserConfig;
```

规则：

- 旧 `ssg` 布尔值改为 `miko.rendering: 'ssg' | 'spa'`。
- `server`、`preview`、`resolve`、`build`、`css`、`define`、`optimizeDeps` 和 `ssr` 放入 `vite`。
- Vue、Router、Layouts、Components、UnoCSS、Legacy、CDN、Linter、DevTools、Janus 和白屏选项放入 `miko` 的对应字段。
- 自定义 Vite 插件只能在确认与 Miko 插件顺序兼容后人工放入 `vite.plugins`。
- `vite.build.rolldownOptions.input`、`vite.build.rollupOptions.input` 和应用 `build.lib` 由 Miko 管理，不能直接照搬。

## Phase 3：迁移应用结构

按 `references/migration-steps.md` 执行：

1. 将手工路由表转换为 `pages/` 文件系统路由，保留 path、name、meta、alias、守卫和 404 语义。
2. 创建或收敛根 `index.ts` bootstrap，只保留业务插件注册和路由守卫。
3. Pinia 由 Miko 根据直接依赖自动安装和注水，不重复 `createPinia()`。
4. 保留项目自己的 `index.html`；没有时让 Miko 提供内存 HTML。
5. 检查 SSR 构建期执行中的浏览器 API、异步状态和 hydration 一致性。
6. 保留 `@sec/*` 等业务依赖、微前端生命周期和 API 行为，除非用户明确要求改造。

## Phase 4：验证

按顺序运行：

```sh
bun install
bunx miko doctor
bunx miko build
bunx miko check --all-routes
```

再运行项目自己的：

- `vue-tsc --noEmit`
- 单元测试
- Playwright E2E
- 组件浏览器测试
- 关键 API、控制台、页面错误和截图回归

`miko build` 成功不是唯一验收标准。每个原业务路由必须有对应新路由证据；未映射或未访问的页面标为未验证。

## 恢复

发生问题时读取本次 `.miko-migrate/<timestamp>/RECOVER.md`，从项目根目录执行对应平台的复制命令。恢复旧配置后还原升级前的包版本并执行 `bun install`，再重跑旧构建和业务测试。

## 参考资料

- `references/migration-steps.md`
- `references/route-migration.md`
- `references/common-diffs.md`
- `references/plugin-map.json`
