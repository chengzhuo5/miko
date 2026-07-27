# Miko

基于 Vite 8 + Vue 3 的 SSG 构建工具链，开箱即用。

## 快速开始

```sh
# 安装依赖
bun install

# 启动开发服务器
cd app && bun dev

# 生产构建
bun x miko build
```

## 项目结构

```
miko/
├── app/                       # Starter 模板（新项目起点）
│   ├── pages/                 # 文件系统路由
│   ├── stores/                # Pinia 状态管理
│   ├── tests/                 # 测试 (e2e/ + components/)
│   ├── vite.config.ts         # Vite 配置（含插件用法示例）
│   ├── miko.config.ts         # miko 插件配置（可选，proxy/路径）
│   └── index.ts               # 应用初始化入口（bootstrap）
├── template/                  # Vite 入口模板（App.vue, main.ts, layouts）
├── packages/
│   ├── framework/             # CDN 外部化框架包（Vue, vue-router, axios, unhead）
│   ├── linter/                # 共享 lint/format/tsconfig 配置
│   ├── vite-plugin-bootstrap/ # virtual:bootstrap 插件
│   ├── vite-plugin-external/  # CDN 外部化插件
│   ├── vite-plugin-index-html/# virtual:index + dev/prod 根目录分离插件
│   └── vite-plugin-miko/      # 总控插件（defineMikoConfig 统一入口）
└── packages/cli/               # miko CLI（dev, build, preview, tsc）
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 构建 | Vite 8.1、Bun、Rolldown |
| 框架 | Vue 3.5、vue-router 5.2、Pinia 4 |
| SSG | vite-ssg 28、@unhead 3 |
| UI | Vant 4 / Element Plus、UnoCSS |
| 类型 | TypeScript 7 (tsgo)、vue-tsc 3.3 |
| 测试 | Vitest 4.1、Playwright Test 1.61 |
| 代码检查 | Oxlint 1.74、ESLint 10.7、Oxfmt |

## 测试

```sh
# 单元测试（jsdom）
cd app && bun test:unit

# E2E 测试（Playwright，需先启动 dev server）
cd app && bun test:e2e

# Vitest Browser Mode（组件级浏览器测试）
cd app && bun test:e2e:browser
```

> **⚠️ Windows 注意**：Vitest Browser Mode 配置中必须设置 `server: { host: '127.0.0.1' }`。
> 默认 `localhost` 在 Windows 上解析到 IPv6 `::1`，而 Playwright Chromium headless shell 仅 IPv4 可达，
> 否则会报 `ERR_CONNECTION_REFUSED`。

## 项目配置

`vite.config.ts` — 一行搞定所有插件：

```ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
export default await defineMikoConfig()
```

可选创建 `miko.config.ts` 覆盖默认值：

```ts
export default {
  uiLibrary: 'vant',     // 'vant' | 'element-plus'
  proxy: [
    { context: ['/api/**'], target: 'https://dev.example.com', changeOrigin: true },
  ],
}
```

## 新建项目

```sh
# 1. 复制 app/ 目录
cp -r app/ my-new-project/

# 2. 安装依赖
cd my-new-project && bun install

# 3. 编辑 miko.config.ts 配置 UI 库和代理（可选）
# 4. 在 pages/ 下创建页面
# 5. 在 index.ts 中初始化 Pinia / 登录等插件

# 启动开发
bun dev
```

## 插件

Miko 的构建能力通过 4 个 Vite 插件提供，可按需独立使用：

| 插件 | 用途 |
|------|------|
| `@minar-kotonoha/vite-plugin-bootstrap` | virtual:bootstrap — 自动发现项目入口 |
| `@minar-kotonoha/vite-plugin-external` | 生产环境 CDN 外部化 |
| `@minar-kotonoha/vite-plugin-index-html` | virtual:index + dev/prod 根目录分离 |
| `@minar-kotonoha/vite-plugin-miko` | 总控插件 — defineMikoConfig 统一入口 + SSG + 代理 + Janus |

## 许可证

MIT
