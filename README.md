# Miko

基于 Vite 8 + Vue 3 的约定式 SPA / SSG 框架。项目使用 Bun 管理依赖和脚本；发布后的 `miko` CLI 运行在 Node.js + jiti 上，不要求 Bun 作为应用运行时。

## 快速开始

```sh
# 根工作区安装
bun install

# Starter 开发、构建、预览
cd app
bun dev
bun run build
bun run preview

# 查看 Miko 实际解析结果
bunx miko doctor
bunx miko doctor --json
```

零配置项目不需要 `vite.config.ts` 或 `miko.config.ts`。CLI 是唯一入口；只有需要覆盖约定时才创建 `miko.config.ts`。

## 默认能力

Miko 使用固定优先级解析能力：

```text
显式配置 → 根目录约定文件 → package.json 直接依赖 → 当前命令 → 安全默认值
```

| 能力 | 默认行为 |
|------|----------|
| 渲染 | 默认 SSG，可显式切换 SPA |
| HTML | 保持真实项目 root；有 `index.html` 就使用，没有则在内存中提供内置入口 |
| 构建目标 | 默认现代构建；Browserslist 包含旧浏览器时自动启用 Legacy |
| 依赖 | 默认正常打包；只有显式提供 `frameworkCDN` 才启用 CDN 外部化 |
| Pinia | 检测到直接依赖后自动创建唯一实例并完成 SSG 注水 |
| UI | 从直接依赖自动识别 Vant 或 Element Plus；同时存在时要求显式选择 |
| 组件 / UnoCSS | 根据根目录约定和直接依赖自动启用 |
| DevTools | 仅 `miko dev` 自动启用 |
| Lint | 默认使用 Miko 内置 Oxlint / ESLint 配置 |

能力输入发生变化时，开发服务器自动重启；普通页面和组件源码仍使用 Vite HMR。

## 项目配置

`miko.config.ts` 严格使用 `{ miko, vite }` 两个命名空间：

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  miko: {
    rendering: 'ssg',
    uiLibrary: 'vant',
    // undefined = 自动检测，false = 禁用，对象 = 启用并合并选项
    legacyPluginOptions: false,
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
  },
} satisfies MikoUserConfig
```

- `miko`：Miko 管理的框架能力与内置插件选项。
- `vite`：完整 Vite `UserConfig`，按字段与 Miko 默认值合并。
- 应用入口 input 由 Miko 管理，不能通过 Vite 配置覆盖。
- 不支持 `vite.config.ts`，也不会让 Vite 自动加载其他配置文件。

`miko preview` 优先使用 `vite.preview.proxy`；未配置时复用 `vite.server.proxy`。代理由 Vite 原生实现，回调、Agent 等引用会保留，Miko 不注入弱 TLS 默认值。

### 可选 CDN

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

启用 CDN 时项目必须直接依赖 `@minar-kotonoha/framework`。只配置 `optimizeDepsExclude` 或 `ssrNoExternal` 不会开启 CDN。

## 项目结构

```text
miko/
├── app/                         # Starter 模板
│   ├── pages/                   # 文件系统路由
│   ├── stores/                  # Pinia store（运行时由 Miko 自动安装）
│   ├── tests/                   # 单元、组件浏览器与 E2E 测试
│   └── index.ts                 # 应用 bootstrap
└── packages/
    ├── cli/                     # miko dev/build/preview/doctor
    ├── framework/               # 可选 CDN framework.umd.js
    ├── linter/                  # 共享 lint/format/tsconfig
    ├── vite-plugin-bootstrap/   # virtual:bootstrap
    ├── vite-plugin-external/    # 可选 CDN 外部化
    ├── vite-plugin-index-html/  # 用户 HTML / 内存 HTML 入口
    └── vite-plugin-miko/        # 配置、能力图与插件装配
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 包管理 | Bun workspace + `bun.lock` |
| CLI 运行时 | Node.js 20/22 + jiti |
| 构建 | Vite 8、Rolldown |
| 框架 | Vue 3、Vue Router、Pinia、Unhead |
| 渲染 | SPA + 构建期 SSG |
| 测试 | Vitest、Playwright |
| 代码质量 | Oxlint、ESLint、Oxfmt、vue-tsc |

## 测试

```sh
# 包测试与类型检查（根目录）
bun run test:packages
bun run typecheck:packages

# 性能测量与相对基线门禁
bun run perf:measure
bun run perf:check

# Starter 测试
cd app
bun test:unit
bun test:e2e
bun test:e2e:browser
```

Windows 下 Vitest Browser Mode 必须使用 `server: { host: '127.0.0.1' }`，避免 `localhost` 解析到 Chromium headless shell 不可达的 IPv6 `::1`。

性能命令由 Bun 调度，但 benchmark runner 和每次真实 Miko 构建都使用 Node.js；详细采样规则、环境匹配和预算见 `packages/performance/README.md`。应用构建成功后会生成 `dist/.miko/routes.json` 与 `dist/.miko/assets.json`，用于部署路由和缓存策略参考。

## 新建项目

```sh
cp -r app/ my-new-project/
cd my-new-project
bun install
bun dev
```

通常只需在 `pages/` 创建页面并在 `index.ts` 注册业务插件。Pinia、布局、HTML 入口等由 Miko 根据项目能力自动处理。

## 许可证

MIT
