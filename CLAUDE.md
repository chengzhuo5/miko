# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 常用命令

所有依赖安装、工作区管理和脚本执行使用 **Bun**。CLI 运行时使用 **Node.js + jiti**，不要求 Bun runtime。

```sh
# 安装依赖（在根目录执行）
bun install

# 启动开发服务器（在 app/ 目录执行）
bun dev        # 或: bun run miko dev (bundledDev 默认关闭)

# 生产构建（先类型检查，再 SSG 构建）
bun run build

# 库构建（输出 ESM + CJS + 类型声明）
bun run miko build --lib

# 指定环境构建（加载 .env.test，产物输出 dist/）
bun run miko build --env test

# 指定环境开发（加载 .env.test）
bun run miko dev --env test

# 仅类型检查
bun run vue-tsc --noEmit  # 类型检查（TypeScript 7 通过 typescript-native-bridge 适配 vue-tsc）

# 预览生产构建
bun run preview

# 检查实际能力、来源和插件顺序
bunx miko doctor
bunx miko doctor --json

# 代码检查（oxlint + eslint，均带 --fix）
bun lint

# 格式化
bun format      # 使用 oxfmt

# 性能测量与相对基线门禁
bun run perf:measure
bun run perf:check

# 单元测试（在 app/ 目录执行）
cd app && bun test:unit

# E2E 测试 — Playwright Test（推荐，需先启动 dev server）
cd app && bun dev &         # 先启动开发服务器
cd app && bun test:e2e       # TypeScript E2E（@playwright/test, tests/e2e/）

# E2E 测试 — Vitest 浏览器模式（组件级浏览器测试）
cd app && bun test:e2e:browser  # @vitest/browser-playwright, tests/components/
```

`miko` 命令行工具位于 `packages/cli/`，分发到 `packages/cli/<子命令>.ts`。运行时使用 Node.js + jiti（入口 `miko` shell 脚本通过 `createJiti` 加载 TypeScript）。

## 大仓结构

Bun workspaces：`packages/*` + `app`。三个包加应用模板：

| 包 | 用途 |
|---------|---------|
| `@minar-kotonoha/framework`（`packages/framework/`） | 核心框架：将 Vue 生态依赖聚合为 UMD 包，供 CDN 加载 |
| `@minar-kotonoha/linter`（`packages/linter/`） | 共享的 ESLint/Oxlint/Oxfmt 配置 + Vite 代码检查插件 + 共享 tsconfig |
| `@minar-kotonoha/cli`（`packages/cli/`） | miko CLI（dev、build、preview、doctor） |
| `@minar-kotonoha/vite-plugin-*`（`packages/vite-plugin-*/`） | 四个 Vite 插件（bootstrap、external、indexHTML、miko 总控） |
| `@minar-kotonoha/create-miko`（`app/`） | Starter 模板 |

## 架构

### 可选框架 CDN 外部化

应用在 SPA、SSG 和开发模式下都默认正常打包依赖。只有 `miko.externalOptions.frameworkCDN` 显式提供 URL 时，`@minar-kotonoha/vite-plugin-external` 才把框架依赖映射到 `framework` 全局对象；此时项目必须直接依赖 `@minar-kotonoha/framework`。

只配置 `optimizeDepsExclude`、`ssrNoExternal` 或额外解析选项不会启用 CDN。默认路径保持 tree-shaking、代码分割和无额外运行时网络依赖。

### 虚拟模块启动模式

应用入口是 `template/main.ts`，它导入 `virtual:bootstrap`。`@minar-kotonoha/vite-plugin-bootstrap` 将此虚拟模块解析到项目 `index.ts` 的默认导出，将 Vue 应用实例作为参数传入。这样应用代码可以在框架初始化后运行，而无需硬编码导入路径。

### 零配置 HTML 入口

Vite `root` 始终保持真实项目目录。根目录存在 `index.html` 时使用用户文件；不存在时，`@minar-kotonoha/vite-plugin-index-html` 以相同绝对路径身份在内存中提供内置 HTML。两种来源都经过 `transformIndexHtml`，自动注入唯一 Miko 模块入口并校验唯一 `#app`。

不会复制临时 `index.html`，也不会把 root 指向 `node_modules` 或模板目录。

### 代码检查分层

1. **Oxlint**（主力，速度快）——配置于 `packages/linter/.oxlintrc.json`，正确性类别为 error，启用 12 个插件
2. **ESLint**（辅助）——配置于 `packages/linter/eslint.config.ts`，继承 Vue/TypeScript 推荐配置
3. **构建时检查**——linter Vite 插件（`packages/linter/vite.ts`）在生产构建时运行（SSG 时跳过）

格式化由 **Oxfmt** 处理（singleQuote，不使用分号）。VSCode 配置 `oxc.oxc-vscode` 为默认格式化工具。

### 文件系统路由和布局

页面位于 `app/pages/`，使用 `vue-router/auto-routes` 实现基于文件的路由。布局使用 `vite-plugin-vue-layouts-next`，默认布局由 `VITE_LAYOUT` 环境变量控制（默认为 `flexible`）。布局目录：`template/layouts/` 和 `<项目>/layouts/`。

### 类型检查

TypeScript 7（tsgo + `typescript-native-bridge`）通过 `vue-tsc` 进行类型检查——bridge 模拟经典 TypeScript API 使 vue-tsc 能使用 Go 原生编译器。`@minar-kotonoha/linter` 中的共享 tsconfig 继承 `@vue/tsconfig/tsconfig.dom.json`，并启用 vue-router 和 vue-macros 编译器插件。

### E2E 测试

项目支持两种测试模式：

**Playwright Test（推荐）** — 页面级 E2E，导航 dev server、点检 UI、监控 API：

- **配置**: `app/playwright.config.ts`（375×812 移动端视口, chromium, testDir `./tests/e2e`）
- **测试文件**: `app/tests/e2e/**/*.spec.ts`
- **运行**: `bun dev &` 先启动 server，再 `bun test:e2e`
- **截图**: 每项测试自动截图至 `tests/e2e/screenshots/`
- **API 监控**: `page.route()` 拦截配置的 API 前缀

**Vitest Browser Mode** — 组件级浏览器测试，渲染 Vue 组件到真实浏览器：

- **配置**: `app/vitest.browser.config.ts`
- **测试文件**: `app/tests/components/**/*.test.ts`
- **运行**: `bun test:e2e:browser`
- **注意**: 运行在 Vitest 内部 iframe 沙箱，不支持 `page.goto()` 导航外部 URL
- **⚠️ Windows 必须配置** `server: { host: '127.0.0.1' }` — vitest 默认 `localhost` 在 Windows 上解析到 IPv6 `::1`，而 Playwright Chromium headless shell 仅 IPv4 可达，导致 `ERR_CONNECTION_REFUSED`
- **与单元测试隔离**: `app/vitest.config.ts`（jsdom）排除 `tests/e2e/` 和 `tests/components/`

## 关键约定

- Node 引擎要求：`^20.19.0 || >=22.12.0`
- 模块系统：ESM（`"type": "module"`）
- 路径别名：`@` → 项目根目录（`cwd`）
- 自动生成的类型文件（`types/routes.d.ts`、`types/components.d.ts`）在 gitignore 中
- `.npmrc` 指向私有中国制品仓库（已注释），发布时使用 `--registry` 覆盖或 `publishConfig`
- `vite` 版本通过 Bun catalog（`catalog:vite`）和 overrides 统一管理
- `template/` 已内置于 `@minar-kotonoha/vite-plugin-miko` 包中（App.vue, main.ts, layouts），`app/` 为项目模板（stores, e2e）
- 插件架构：`resolveMikoProject()` 先生成唯一能力图，再按固定顺序装配 Vue/Router/Runtime/Layouts/Components/UnoCSS/Linter/DevTools/Legacy/Bootstrap/External/HTML/Janus；各插件不得自行重复探测项目
- 能力优先级：显式配置 → 根目录约定文件 → `package.json` 直接依赖 → 当前命令 → 安全默认值；`undefined` 自动、`false` 禁用、对象合并覆盖默认项
- Pinia SSR：检测到 `pinia` 直接依赖后，`virtual:miko-runtime` 在 bootstrap 前安装唯一实例，客户端恢复 `initialState.pinia`，服务端在 ViteSSG `onSSRAppRendered` 后写回非空 state；项目 `index.ts` 不再手动创建或注水
- 骨架屏：`App.vue` 通过 `useHead({ style: [skeletonStyles] })` 注入骨架 CSS。`injectHead()` 补设 `head.ssr = true` 解决 unhead v3.x server createHead() 未设 SSR 标记导致条目丢失的问题
- preview 代理：优先使用 `vite.preview.proxy`，否则浅克隆并复用 `vite.server.proxy`；使用 Vite 原生代理，不注入 `secure: false` / `rejectUnauthorized: false`
- Doctor：`miko doctor [--json]` 复用同一项目解析和插件装配，只读输出能力来源、实际标量值、插件顺序和警告；能力错误退出码为 3
- Dev 重启：package、Miko/Browserslist/Uno 配置或 schemas 内容变化时合并触发一次 server restart；页面和组件继续使用 HMR
- 发包：使用 `bun publish --registry https://registry.npmjs.org/ --access public`（bun 会自动把 `workspace:^` / `catalog:` 改写为真实版本号；`prepublishOnly` 已配置为 `bun run build`）。认证沿用 `~/.npmrc` 的 token（`npm login` 或 `NPM_CONFIG_TOKEN` 均可）。**认证需要浏览器确认**：`bun publish` 会输出形如 `https://www.npmjs.com/auth/cli/<id>` 的确认链接并等待。Agent 发包时必须持续检测发布日志，提取该链接并**自动打开浏览器**让用户确认；发布流程会等待确认，未确认前不要误判为卡死或提前中断。若直接调用被沙箱策略拦截，可用 `explorer.exe <url>` 或 `rundll32 url.dll,FileProtocolHandler <url>` 打开
- 包版本以各 `package.json` 和 npm registry 验证结果为准，不依赖文档中的历史发布号
- 新建项目: 复制 `app/` 结构 → `bun install` → `bun dev`；`miko.config.ts` 仅在覆盖自动能力或 Vite 默认值时创建
- Janus 前端接口拦截器：`bun link @janus/core @janus/unplugin` 后自动发现（`defineMikoConfig` 通过 `createRequire` 同步加载 CJS 构建产物），无需手动配插件
- Vue DevTools 仅在 `miko dev` 自动启用，Build / Preview / Doctor 不加载
- `miko.config.ts`（可选）严格使用 `{ miko, vite }` 两个命名空间。`miko` 放框架能力（如 `rendering`、`uiLibrary`、`vuePluginOptions`、`legacyPluginOptions`、`externalOptions`），`vite` 接受 Vite 原生配置；入口 input 仍由 Miko 管理。完整类型见 `MikoUserConfig`
- 应用构建：类型检查与配置/插件准备并行，但 Vite/SSG 构建必须等待两者完成；成功后生成 `dist/.miko/routes.json` 与 `assets.json`，提供部署路由和缓存建议
- 性能基准：Bun 只负责 workspace 和命令调度，`node runner.mjs` 及 `process.execPath` worker 执行真实构建；3 次 cold、5 次 warm、5 次浏览器样本取中位数，结果目录 `packages/performance/results/` 不提交

### 依赖版本 (2026-08-07)

| 类别 | 包 | 版本 |
|------|-----|------|
| 构建 | vite | 8.1.5 |
| | typescript | 7.0.2 (tsgo, through typescript-native-bridge) |
| | vue-tsc | ~3.3.8 |
| 测试 | vitest | 4.1.10 |
| | @vitest/browser | 4.1.10 |
| | @playwright/test | 1.62.1 |
| 框架 | vue | 3.5.40 |
| | vue-router | 5.2.0 |
| | pinia | 4.0.2 |
| | @unhead/* | 3.2.1 |
| | @vitejs/plugin-vue | 6.0.8 |
| | @vitejs/plugin-legacy | 8.2.2 |
| Lint | oxlint / oxfmt | 1.74 / 0.59 |
| | eslint | 10.7.0 |

### ExternalOptions 扩展 (0.2.18+)

`miko.config.ts` 的 `miko.externalOptions` 支持额外字段，解决特殊依赖与 Vite dep optimizer 的路径冲突：

```ts
miko: {
  externalOptions: {
    optimizeDepsExclude: ['vant'],  // 从 Vite dep 预构建中排除
    ssrNoExternal: ['vant'],        // SSR 时内联打包
  },
}
```

`ExternalOptions` 类型定义在 `packages/vite-plugin-miko/types.ts`，逻辑在 `packages/vite-plugin-miko/index.ts` 的 `defineMikoConfig` 中读取并传给 Vite。

### TypeScript 类型检查 (0.1.23+)

`packages/cli/build.ts` 通过 `spawn(process.execPath, ['--import', jitiUrl, '--eval', ...])` 在子进程中执行 `vue-tsc` 类型检查。`jitiUrl` / `tscUrl` 使用 `import.meta.resolve` / `pathToFileURL` 生成 `file://` URL（Node.js ESM 在 Windows 上需要此格式）。子进程以项目根目录为 `cwd`，依赖由 Bun 安装的标准 `node_modules` 结构交给 Node.js 正常解析。
