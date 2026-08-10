# Miko v1 迁移步骤

目标是把 Vue 3 + Vite 项目迁到 Miko 的 CLI、零配置和单一 `miko.config.ts` 架构，同时保留业务路由、API、状态和微前端语义。

## Step 0：建立可回滚基线

记录：

```sh
git branch --show-current
git rev-parse HEAD
git status --short
```

运行并保存迁移前的：

- 安装、类型检查和生产构建结果
- 关键路由清单
- Playwright 截图、控制台和失败请求
- API mock/真实响应约束
- 当前包版本和 lockfile

不要覆盖未提交的用户改动。

## Step 1：静态分析配置

先读取源项目的 `package.json`、构建配置、路由、入口、根组件、HTML、tsconfig、环境变量、UnoCSS、Browserslist 和 lint 配置。

安装目标依赖后执行：

```sh
bun install
bunx miko migrate
```

dry-run 不修改文件。逐项确认：

- 源文件列表完整。
- 目标是根目录 `miko.config.ts`。
- 结果只有 `miko` 和 `vite`。
- `Status` 为 `safe`。
- 没有动态表达式、自定义插件顺序、构建 input 或跨文件冲突。

安全计划执行：

```sh
bunx miko migrate --write --check
```

写入前会创建 `.miko-migrate/<UTC timestamp>/` 备份；写入后运行 Doctor 和隔离 Check。

## Step 2：人工配置收口

只有自动计划不安全时才人工处理。零配置项目不创建配置；需要覆盖约定时使用：

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko';

export default {
  miko: {
    rendering: 'ssg',
    uiLibrary: 'vant',
    legacyPluginOptions: false,
  },
  vite: {
    base: '/',
    server: {
      port: 5173,
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
} satisfies MikoUserConfig;
```

映射规则：

| 旧配置                                        | v1                                 |
| --------------------------------------------- | ---------------------------------- |
| `ssg` 布尔值                                  | `miko.rendering`（`ssg` 或 `spa`） |
| Vue/JSX/Router/Layout/Components/UnoCSS 选项  | `miko` 对应插件选项                |
| Legacy/CDN/Linter/DevTools/Janus/白屏选项     | `miko` 对应能力                    |
| `base`、alias、proxy、CSS、define、build、SSR | `vite`                             |
| `outDir`                                      | `vite.build.outDir`                |

额外规则：

- 自定义 Vite 插件确认顺序兼容后才能人工放入 `vite.plugins`。
- 应用入口 input 和应用 `build.lib` 由 Miko 管理。
- 不确定的动态逻辑保持为人工任务，不把行为近似成静态值。

## Step 3：更新 package.json

应用 scripts 使用 CLI：

```json
{
  "scripts": {
    "dev": "miko dev",
    "build": "miko build",
    "preview": "miko preview",
    "check": "miko check",
    "doctor": "miko doctor",
    "migrate": "miko migrate",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

使用 Bun 更新依赖和 lockfile。只删除已被 Miko 明确替代且业务源码不再直接 import 的构建依赖。Vue、Pinia、UI 库和业务 workspace 包是否保留，以直接依赖检测和源码 import 为准。

## Step 4：迁移路由

按照 `route-migration.md`：

1. 将页面迁到根目录 `pages/`。
2. 用文件名表达静态、动态、嵌套和 catch-all 路由。
3. 用 `<route>` 块保留 name、meta、alias 等信息。
4. 将全局守卫移入根 `index.ts` bootstrap。
5. 建立旧路由到新文件的逐项映射表。
6. 未映射路由标记为未完成，不用其他页面代替。

文件系统路由默认按页面拆分 chunk。

## Step 5：迁移入口和运行时

根 `index.ts` 只注册业务能力：

```ts
import type { App } from 'vue';
import type { Router } from 'vue-router';

export default (app: App<Element>, router: Router) => {
  // app.use(业务插件)
  // router.beforeEach(业务守卫)
};
```

- 检测到 `pinia` 直接依赖时，Miko 自动创建唯一实例并完成 SSG 注水，不重复创建。
- 保留 Wujie 等微前端 mount/unmount 和通信语义。
- 项目有自己的 `index.html` 就继续使用；没有时不生成临时文件。
- 原入口中的日志、延时、随机值和仅用于演示的 hydration 分支不要迁入生产模板。

## Step 6：SSG 与 SPA 适配

默认 SSG。业务必须使用 hash history 或完全依赖客户端环境时，明确评估后设置：

```ts
export default {
  miko: {
    rendering: 'spa',
  },
};
```

无论 SPA 还是 SSG，都检查：

- 顶层 `window`、`document`、`localStorage` 等浏览器 API。
- 服务端和客户端首屏数据是否一致。
- 异步路由、Suspense、ClientOnly 和永久骨架状态。
- Pinia、Unhead 和路由 base 的序列化/hydration。
- 深路由刷新和部署 fallback。

## Step 7：验证

先运行 Miko 门禁：

```sh
bunx miko doctor
bunx miko build
bunx miko check --all-routes
```

再运行项目门禁：

```sh
bun run vue-tsc --noEmit
bun test
bun test:e2e
```

验收必须包括：

- 安装和 lockfile 无意外变化。
- 所有旧业务路由都有新路由证据。
- 页面无 `pageerror`、hydration 警告、白屏面板和关键失败请求。
- API、权限、状态、微前端和导航行为保持。
- 正式 `dist` 只含现代默认产物；仅在明确启用时出现 Legacy 或 CDN。
- `dist/.miko/routes.json` 与 `assets.json` 可用于部署检查。

构建成功不是唯一验收标准。

## Step 8：恢复

写入迁移失败或验证不通过时：

1. 打开 `.miko-migrate/<timestamp>/RECOVER.md`。
2. 从项目根目录执行对应平台的复制命令。
3. 如果迁移新建了此前不存在的 `miko.config.ts`，人工删除该新文件。
4. 恢复升级前包版本并运行 `bun install`。
5. 重跑迁移前的构建和业务基线。
