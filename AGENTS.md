# AGENTS.md

此文件为 Codex (Codex.ai/code) 在此仓库中工作时提供指导。

## 常用命令

所有命令使用 **pnpm** 作为包管理器。运行时使用 **Node.js + jiti**（不再依赖 Bun）。

```sh
# 安装依赖（在根目录执行）
pnpm install

# 启动开发服务器（在 app/ 目录执行）
pnpm dev        # 或: npx miko dev (bundledDev 默认关闭)

# 生产构建（先类型检查，再 SSG 构建）
npx miko build

# 库构建（输出 ESM + CJS + 类型声明）
npx miko build --lib

# 指定环境构建（加载 .env.test，产物输出 dist/）
npx miko build --env test

# 指定环境开发（加载 .env.test）
npx miko dev --env test

# 仅类型检查
npx vue-tsc --noEmit  # 类型检查（TypeScript 7 通过 typescript-native-bridge 适配 vue-tsc）

# 预览生产构建
npx miko preview

# 代码检查（oxlint + eslint，均带 --fix）
pnpm lint

# 格式化
pnpm format      # 使用 oxfmt

# 单元测试（在 app/ 目录执行）
cd app && pnpm test:unit

# E2E 测试 — Playwright Test（推荐，需先启动 dev server）
cd app && pnpm dev &         # 先启动开发服务器
cd app && pnpm test:e2e       # TypeScript E2E（@playwright/test, tests/e2e/）

# E2E 测试 — Vitest 浏览器模式（组件级浏览器测试）
cd app && pnpm test:e2e:browser  # @vitest/browser-playwright, tests/components/
```

`miko` 命令行工具位于 `packages/cli/`，分发到 `packages/cli/<子命令>.ts`。运行时使用 Node.js + jiti（入口 `miko` shell 脚本通过 `createJiti` 加载 TypeScript）。

## 大仓结构

pnpm workspaces：`packages/*` + `app`。三个包加应用模板：

| 包 | 用途 |
|---------|---------|
| `@minar-kotonoha/framework`（`packages/framework/`） | 核心框架：将 Vue 生态依赖聚合为 UMD 包，供 CDN 加载 |
| `@minar-kotonoha/linter`（`packages/linter/`） | 共享的 ESLint/Oxlint/Oxfmt 配置 + Vite 代码检查插件 + 共享 tsconfig |
| `@minar-kotonoha/cli`（`packages/cli/`） | miko CLI（dev、build、preview、tsc） |
| `@minar-kotonoha/vite-plugin-*`（`packages/vite-plugin-*/`） | 四个 Vite 插件（bootstrap、external、indexHTML、miko 总控） |
| `@minar-kotonoha/create-miko`（`app/`） | Starter 模板 |

## 架构

### 框架 CDN 外部化

框架包将 Vue、vue-router、axios、unhead 及相关依赖构建为单个 UMD 包（`framework.umd.js`）。构建目标为 `chrome49, safari10`，以支持旧版浏览器。

在**生产模式**（非 SSG）下，这些依赖被外部化：应用不打包它们，而是引用从 CDN 加载的全局 `framework` 对象（通过 `VITE_FRAMEWORK_CDN` 环境变量配置，默认使用 unpkg）。`@minar-kotonoha/vite-plugin-external` 将 `import { ref } from 'vue'` 映射为 `framework['vue'].ref`。

在 **SSG/开发模式**下，依赖不会被外部化——Vite 正常打包它们。`vant` UI 库始终不参与外部化（其 CSS-in-JS 在 SSR 中会出错）。

### 虚拟模块启动模式

应用入口是 `template/main.ts`，它导入 `virtual:bootstrap`。`@minar-kotonoha/vite-plugin-bootstrap` 将此虚拟模块解析到项目 `index.ts` 的默认导出，将 Vue 应用实例作为参数传入。这样应用代码可以在框架初始化后运行，而无需硬编码导入路径。

### 虚拟模块 indexHTML

`@minar-kotonoha/vite-plugin-index-html` 提供 `virtual:index`，并处理开发/生产环境的根目录分离：

- **开发**：根目录为 `node_modules/.vite_entry`（用于依赖预构建）
- **生产**：根目录为 `template/` 目录，构建前复制 `index.html`

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
- 插件架构：`defineMikoConfig()` 为统一入口，内部直接展开所有插件（Vue/Router/Layouts/Components/UnoCSS/Legacy/Linter/SSG）。`@minar-kotonoha/vite-plugin-{bootstrap,external,index-html}` 为独立子插件可按需使用
- Pinia SSR：模板 `main.ts` 通过 `initialState` 传递 SSR 上下文给 bootstrap，项目 bootstrap 中 `initialState.pinia = pinia.state.value`（SSR）/ `pinia.state.value = initialState.pinia`（客户端），vite-ssg 自动序列化到 `window.__INITIAL_STATE__`
- 骨架屏：`App.vue` 通过 `useHead({ style: [skeletonStyles] })` 注入骨架 CSS。`injectHead()` 补设 `head.ssr = true` 解决 unhead v3.x server createHead() 未设 SSR 标记导致条目丢失的问题
- preview 代理：`miko preview` 支持 `miko.config.ts` 中 `proxy` 配置（Node.js 原生转发，零额外依赖），格式与 dev server 的 proxy 一致
- 发包：使用 `bun publish --registry https://registry.npmjs.org/ --access public`（bun 会自动把 `workspace:^` / `catalog:` 改写为真实版本号；`prepublishOnly` 已配置为 `bun run build`）。认证沿用 `~/.npmrc` 的 token（`npm login` 或 `NPM_CONFIG_TOKEN` 均可）。**认证需要浏览器确认**：`bun publish` 会输出形如 `https://www.npmjs.com/auth/cli/<id>` 的确认链接并等待。Agent 发包时必须持续检测发布日志，提取该链接并**自动打开浏览器**让用户确认；发布流程会等待确认，未确认前不要误判为卡死或提前中断。若直接调用被沙箱策略拦截，可用 `explorer.exe <url>` 或 `rundll32 url.dll,FileProtocolHandler <url>` 打开
- 包版本（当前发布）：`miko-cli@0.1.23`, `vite-plugin-miko@0.2.18`, `vite-plugin-external@0.1.8`, `vite-plugin-index-html@0.1.4`, `linter@0.1.3`
- 新建项目: 复制 `app/` 结构 → 编辑 `miko.config.ts` 选 UI 库 + 配 proxy（可选）→ `bun dev`
- Janus 前端接口拦截器：`bun link @janus/core @janus/unplugin` 后自动发现（`defineMikoConfig` 通过 `createRequire` 同步加载 CJS 构建产物），无需手动配插件
- `vueDevTools()` 已启用 — 开发时可使用 Vue DevTools 调试
- `miko.config.ts`（可选）支持所有插件的深度配置（`vue`/`vueJsx`/`vueRouter`/`layouts`/`components`/`unoCSS`/`legacy`/`ssg`/`linter`/`bootstrap`/`external`/`dev`/`janus` + `proxy`/`template`/`entry`/`outDir`/`pagesDir`/`uiLibrary`/`layout`/`lib`），完整类型见 `MikoUserConfig`

### 依赖版本 (2026-07-21)

| 类别 | 包 | 版本 |
|------|-----|------|
| 构建 | vite | 8.1.5 |
| | typescript | 7.0.2 (tsgo, through typescript-native-bridge) |
| | vue-tsc | ~3.3.8 |
| 测试 | vitest | 4.1.10 |
| | @vitest/browser | 4.1.10 |
| | @playwright/test | 1.61.1 |
| 框架 | vue | 3.5.40 |
| | vue-router | 5.2.0 |
| | pinia | 4.0.2 |
| | @unhead/* | 3.2.1 |
| | @vitejs/plugin-vue | 6.0.8 |
| | @vitejs/plugin-legacy | 8.2.1 |
| Lint | oxlint / oxfmt | 1.74 / 0.59 |
| | eslint | 10.7.0 |

### ExternalOptions 扩展 (0.2.18+)

`miko.config.ts` 的 `external` 配置支持额外字段，解决 pnpm git 依赖与 Vite dep optimizer 的路径冲突：

```ts
external: {
  optimizeDepsExclude: ['vant'],  // 从 Vite dep 预构建中排除
  ssrNoExternal: ['vant'],        // SSR 时内联打包
}
```
`ExternalOptions` 类型定义在 `packages/vite-plugin-miko/types.ts`，逻辑在 `packages/vite-plugin-miko/index.ts` 的 `defineMikoConfig` 中读取并传给 Vite。

### TypeScript 类型检查 (0.1.23+)

`packages/cli/build.ts` 通过 `spawn(process.execPath, ['--import', jitiUrl, '--eval', ...])` 在子进程中执行 `vue-tsc` 类型检查。`jitiUrl` / `tscUrl` 使用 `import.meta.resolve` / `pathToFileURL` 生成 `file://` URL（Node.js ESM 在 Windows 上需要此格式）。`NODE_PATH` 通过 `pnpm root -w`（workspace）或 `pnpm root`（单包）获取，确保 pnpm 隔离下子进程能解析模块。
