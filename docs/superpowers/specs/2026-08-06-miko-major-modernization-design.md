# Miko 破坏性大版本现代化设计

日期：2026-08-06
状态：待用户审阅

## 背景

Miko 是基于 Vue 3、Vite 和 SSG 的约定式前端框架。它的核心价值不是提供另一套应用运行时，而是让用户在尽量不写配置的情况下获得完整、可靠且高性能的开发与构建能力。

当前实现已经具备文件系统路由、Layouts、组件自动导入、UnoCSS、SPA、SSG、Pinia hydration、Unhead、Legacy、CDN 外部化、预览代理、Library Mode、Lint 和 Janus 等能力，但这些能力逐步累积在总控插件、CLI 脚本和内置模板中，产生了以下问题：

- CLI、配置加载和 Vite 插件编排之间职责交叉。
- `loadMikoConfig()` 在解析失败时静默返回空对象，隐藏真实错误。
- 多处在模块加载阶段读取并缓存 `process.cwd()`，不利于测试和多项目调用。
- 部分可选能力在未启用时仍执行模块解析或文件扫描。
- `dev`、`build`、`preview` 重复处理配置和运行环境。
- 预览代理在请求热路径创建正则表达式，并默认关闭上游 TLS 校验。
- 根应用模板混合了路由渲染、Skeleton、ClientOnly、CDN 注入和 Unhead 修补。
- SPA 模式整体进入 `ClientOnly`，增加无意义的启动和渲染开销。
- CLI、核心插件、预览代理和配置合并缺少直接回归测试。
- 构建性能与构建后浏览器运行时性能都缺少稳定基线。
- 白屏、脚本加载失败、Hydration 失败和永久 Skeleton 缺少统一检测与兜底。

本次允许发布破坏性大版本，不要求保持旧配置和旧公共 API 兼容，但必须提供迁移工具、迁移诊断和升级文档。

## 设计原则

### 大道至简

- 能使用 Vue/Vite 原生能力解决的问题，不新增 Miko 专属 API。
- 能通过目录约定和环境检测完成的事情，不要求用户配置。
- 自动能力默认启用，配置主要用于覆盖、关闭和提供无法推断的信息。
- CLI 是唯一执行入口，构建链只保留一条真实路径。
- 所有“自动”行为必须确定、可解释、可诊断。
- 不以增加运行时抽象换取表面上的功能丰富。

### 工具链边界

- Bun 负责安装依赖、workspace、lockfile 和发布。
- 分发后的 Miko CLI 和构建链不得依赖 Bun 运行时。
- CLI 必须能在 Node.js + jiti 下运行。
- 支持的 Node 基线为 `^20.19.0 || >=22.12.0`。

## 目标

- 无配置文件即可运行默认 SSG 项目，并能通过唯一配置切换到 SPA。
- 强制通过 Miko CLI 启动、构建和预览。
- 只支持一个可选的 Miko/Vite 构建配置文件：`miko.config.ts`。
- 在 `miko.config.ts` 中同时支持 Miko 配置和完整 Vite 配置。
- 内置插件选项与用户选项递归合并，不整块覆盖。
- 默认提供丰富功能，并根据项目和环境自动启用。
- 默认构建现代浏览器产物，Legacy 根据浏览器目标自动启用或被显式覆盖。
- 默认正常打包应用依赖，CDN 外部化只在显式提供部署信息时启用。
- 同时优化开发、构建和构建后浏览器运行性能。
- 增加构建期、预览期和生产运行时三层白屏检测。
- 为配置、CLI、插件、SPA、SSG、Hydration 和性能建立回归测试。

## 非目标

- 不提供常驻生产 SSR Server。
- 不新增 Miko 数据请求体系。
- 不新增 Miko 状态管理、国际化或业务插件系统。
- 不重新实现 Vue Router、Pinia、Unhead 或 UnoCSS 已提供的能力。
- 不默认依赖 CDN。
- 不为了“可扩展”而拆分大量公开 preset 或 runtime 包。
- 不在没有基准数据时加入复杂手工分包和微优化。

## 用户体验

### 零配置项目

符合约定的项目不需要任何构建配置文件：

```text
my-app/
├─ pages/
│  └─ index.vue
└─ package.json
```

直接执行：

```sh
miko dev
miko build
miko preview
```

Miko 自动发现页面、入口、布局、组件、环境和已安装集成，并默认执行 SSG 构建。需要纯 SPA 时，在 `miko.config.ts` 中设置 `miko.rendering = 'spa'`。项目根 `index.ts` 继续作为可选 bootstrap 入口；不存在时使用空实现。

### HTML 入口契约

Miko 应用始终保持最终解析出的 Vite `root` 指向真实应用目录。这里记为 `<viteRoot>`：默认等于 CLI `--root`，用户显式设置 `vite.root` 时则使用该目录。不得为了提供默认 HTML 而把它改到 `node_modules`、缓存目录或内置模板目录。

HTML 入口按以下规则解析：

```text
<viteRoot>/index.html 存在
 → 使用用户文件
<viteRoot>/index.html 不存在
 → 使用 Miko 内置 HTML 内容
 → 入口身份仍然是 <viteRoot>/index.html
```

内置 HTML 不复制到项目或 `node_modules`。Miko HTML 插件只在文件缺失时，通过 Vite 插件的 `resolveId`/`load` 为绝对路径 `<viteRoot>/index.html` 提供合成内容。它使用真实 HTML 路径身份而不是 `\0virtual:*.html`，使 Vite 的标准 HTML 转换、资源处理和最终 `index.html` 输出继续生效。

开发模式遵循同一来源优先级：

- 用户 HTML 存在时交给 Vite 原生 HTML 和 SPA fallback 中间件。
- 用户 HTML 不存在时，Miko 中间件为首页、`/index.html` 和 SPA 导航请求读取已缓存的内置 HTML，并调用 `server.transformIndexHtml()` 后返回。
- 用户在开发期间新增或删除 `index.html` 时，下一次 HTML 请求按当前文件状态重新选择来源，不要求改变 `root`。

用户 HTML 和内置 HTML 都经过统一的 `transformIndexHtml` 钩子。Miko 自动注入唯一的 module 入口脚本，用户不需要手写 `virtual:index` 或模板 `main.ts`：

```html
<script type="module" data-miko-entry>
  import 'virtual:index'
</script>
```

注入器检测 `data-miko-entry` 和既有 Miko 虚拟入口，避免重复执行。用户 HTML 可以包含自己的 module script、Meta、Link 和页面结构，但必须包含唯一的 `#app` 挂载节点；缺失或重复时在 Dev 返回 HTML 或 Build 调用 Vite 前给出明确错误。

应用模式的 HTML input 是 Miko 不可关闭的核心约定。用户可以自定义 `index.html` 内容，但不能把 SPA/SSG 应用改成另一个 HTML/JavaScript input；需要多页入口或完全自定义入口图的项目应直接使用 Vite。Library Mode 不使用该 HTML 入口契约。

### 高级配置

只有需要改变默认行为时才创建 `miko.config.ts`：

```ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'

export default defineMikoConfig({
  miko: {
    rendering: 'ssg',

    vuePluginOptions: {
      template: {
        compilerOptions: {
          isCustomElement: tag => tag.startsWith('x-'),
        },
      },
    },

    legacy: {
      targets: ['chrome >= 80'],
    },

    cdn: {
      frameworkCDN: 'https://cdn.example.com/framework.js',
    },
  },

  vite: {
    server: {
      proxy: {
        '/api': 'https://api.example.com',
      },
    },

    build: {
      sourcemap: true,
    },

    plugins: [],
  },
})
```

`defineMikoConfig` 是纯类型辅助函数，不读取文件、不启动进程、不修改传入对象。它同时接受普通对象和基于命令、mode 的同步或异步配置函数。主包是否在大版本中重命名不属于本设计的既定决策；示例沿用当前公开包名。

## 统一配置模型

配置只包含两个命名空间：

```ts
interface MikoConfig {
  miko?: MikoOptions
  vite?: UserConfig
}
```

`miko` 描述框架语义和内置插件选项，`vite` 接受 Vite `UserConfig`。由于 CLI 强制控制配置加载和渲染模式，少量 Vite 字段使用下文规定的模式相关策略，而不是交给 Vite 再次读取配置文件。

CLI 的配置处理流程固定为：

```text
查找 miko.config.ts
 → 不存在则使用空用户配置
 → 通过 jiti 加载并执行配置函数
 → 校验 Miko 配置
 → 自动检测项目能力
 → 解析 Miko 默认值
 → 解析用户或内置 HTML 入口
 → 合并内置插件选项
 → 合并完整 Vite 配置
 → 校验最终插件和构建不变量
 → 调用 Vite/SSG，configFile=false
```

不再支持 `vite.config.ts`，也不允许 Vite 再次自动加载配置文件。这里的“唯一配置文件”仅指 Miko/Vite 构建配置；`.env*`、Browserslist、UnoCSS 和 Lint 配置仍按各自工具约定存在。

### 配置执行契约

CLI 在读取配置前先解析：

```text
--root（默认当前工作目录）
 → command（serve/build/preview/check）
 → --env/--mode（默认 development 或 production）
 → miko.config.ts
```

配置函数接收：

```ts
interface MikoConfigEnv {
  command: 'dev' | 'build' | 'preview' | 'check' | 'doctor'
  mode: string
  root: string
}
```

- 配置函数可以返回对象或 Promise。
- `rendering` 在配置函数返回后解析，因此配置函数上下文不包含 `isSsgBuild` 等循环依赖字段。
- `miko migrate` 不执行目标项目的新配置函数；写入完成后的 Doctor 是独立命令。
- 配置加载、执行或校验失败时保留原始异常链并退出。
- `.env` 文件由最终 `root`、`vite.envDir` 和 mode 决定；CLI 不维护第二套应用环境变量覆盖规则。
- `MIKO_*` 仅用于 CLI 自身控制，不注入客户端。
- 开发期间修改 `miko.config.ts`、`package.json` 或关键约定文件会触发一次受控 Server Restart，不在运行中的插件图上局部热改。

### 三态配置

自动能力遵循统一意图，但每个能力拥有明确类型：

- `undefined`：自动检测。
- `false`：明确关闭。
- `true`：明确启用并使用默认选项。
- 对象、字符串、数组或函数：由该能力的类型定义决定，表示启用并覆盖相应选项。

例如：

```ts
export default defineMikoConfig({
  miko: {
    devtools: false,
    lint: { failOnError: true },
    legacy: { targets: ['chrome >= 80'] },
  },
})
```

### 合并规则

不使用一个通用 Deep Merge 处理所有字段。合并策略固定如下：

| 字段 | 策略 |
|---|---|
| 普通对象 | 递归合并，用户基础值优先 |
| 函数 | 用户函数替换默认函数；需要组合的钩子由对应适配器显式串联 |
| `vite.plugins` | 保留 Miko 核心插件；用户插件按 `enforce` 分组后加入，重复核心插件报错 |
| `resolve.alias` | 统一规范化为数组；相同 `find` 的用户项优先，其余保序合并 |
| `optimizeDeps.include/exclude` | 合并去重；同一包同时 include/exclude 时失败 |
| `ssr.noExternal` | `true` 直接生效；数组/正则保序合并；与 external 冲突时失败 |
| `input` / `build.rollupOptions.input` | SPA/SSG 应用均由 Miko 固定为 `<viteRoot>/index.html`；用户设置时失败。Library Mode 使用独立入口 |
| `build.rollupOptions.output` | 对象递归合并；数组逐项保留，不跨项猜测合并 |
| `build.lib` | 只在 `miko build --lib` 中接受；普通 SPA/SSG 构建设置时失败 |
| `root/base/publicDir/envDir/build.outDir` | 用户值作为最终来源，Miko 路由、模板和 SSG 必须跟随 |
| Vue 等内置插件选项 | 默认选项与 `xxxPluginOptions` 递归合并；数组和函数遵循该插件自身适配策略 |

Miko 不静默覆盖用户字段，也不接受无法解释的合并结果。

## 自动能力检测

检测优先级固定为：

```text
显式配置
 → 项目文件约定
 → package.json 依赖
 → 当前命令与环境
 → 安全默认值
```

检测必须离线、只读、确定且可重复。

主要规则：

- 文件路由、Layouts、Components 和约定模板默认启用。
- SSG 默认启用，`rendering: 'spa'` 时关闭。
- Pinia、Unhead、UI 库、UnoCSS、Janus 等根据依赖和文件自动接入。
- DevTools 只在开发环境自动启用。
- Lint 使用内置配置或项目配置，并使用缓存。
- Legacy 先读取显式配置，再读取浏览器目标，最后回退到现代构建。
- CDN 不猜测地址，只有显式提供部署信息时启用。
- Library Mode 由明确的 CLI 命令或参数触发。

能力契约：

| 能力 | 配置类型 | 自动检测信号 | 自动结果 | 失败/降级 |
|---|---|---|---|---|
| Rendering | `'ssg' \| 'spa'` | 无 | 默认 `ssg` | SSG 不兼容代码在构建期报错；不自动改成 SPA |
| Legacy | `false \| true \| LegacyOptions` | 最近 package.json 的 Browserslist 和配置文件 | 有旧浏览器目标时启用，否则关闭 | 显式启用但依赖不可用时失败 |
| Lint | `false \| true \| LinterOptions` | 项目 Lint 配置；否则使用 Miko 内置规则 | Build/Check 启用缓存检查 | Dev 后台失败不停止 Server；Build 按 failOnError 决定 |
| DevTools | `false \| true \| DevToolsOptions` | command=serve | 开发启用，生产关闭 | 自动加载失败时警告；显式启用时失败 |
| CDN | `false \| CDNOptions` | 不自动检测 URL | 默认关闭 | 缺地址或 framework 包时失败 |
| UI Library | `false \| 'vant' \| 'element-plus'` | 最近 package.json 的直接依赖 | 唯一命中时启用 | 多个命中时失败 |
| Layouts | `false \| true \| LayoutsOptions` | 内置和项目 layouts 目录 | 有可用目录时启用 | `false` 时仅使用无布局 Route Outlet |
| Components | `false \| true \| ComponentsOptions` | components 目录或显式 options | 命中时启用自动导入 | `false` 时关闭自动导入 |
| Pinia | `false \| true \| PiniaOptions` | 最近 package.json 的直接依赖 | 命中时接入 hydration adapter | 自动模式不可用时不接入；显式启用时失败 |
| Unhead | `false \| true \| UnheadOptions` | 最近 package.json 的直接依赖 | 命中时接入 Head adapter | 规则同 Pinia |
| UnoCSS | `false \| true \| UnoCSSOptions` | 直接依赖或 root 下配置文件 | 命中时启用 | 显式启用但依赖缺失时失败 |
| Janus | `false \| true \| JanusOptions` | 直接依赖和 schema 目录 | 两者存在时启用 | 自动模式警告降级；显式启用时失败 |
| White Screen | `false \| true \| WhiteScreenOptions` | 无 | 默认启用启动监控和静态检查 | 只在启动 ready 前判断白屏 |

自动检测范围固定为 `--root` 对应的最近 `package.json`、直接 dependencies/devDependencies 和 root 内约定文件；不递归读取传递依赖，也不跨 workspace 猜测其他应用。`package.json`、配置和约定文件变化时重启开发服务器；页面内容变化只交给 HMR，不重新检测整个能力图。

以下不是“自动能力”，而是 Miko 的不可关闭核心：CLI 配置控制、Vue App 创建、文件路由、虚拟 Bootstrap、HTML 入口和 SPA/SSG Runner。需要完全接管这些能力的项目应直接使用 Vite，而不是通过关闭全部 Miko 核心把 Miko 退化为 Vite Wrapper。

冲突规则：

- 同时发现多个互斥 UI 库且未明确选择时失败。
- 明确开启的能力缺少依赖时失败并输出安装命令。
- 自动发现的非必需能力不可用时降级并输出一次警告。
- 路径、base、outDir、SSG 输入和虚拟入口冲突时，在调用 Vite 前失败。

`miko doctor` 显示最终检测结果、依赖、插件顺序、字段来源和潜在冲突。

## CLI 与构建流水线

CLI 是唯一入口：

```text
miko dev
miko build
miko preview
miko check
miko doctor
miko migrate
```

`miko build --lib` 保留 Library Mode，但它是明确命令，不参与普通应用自动检测。

命令职责：

| 命令 | 输入 | 产物/副作用 | 失败条件 |
|---|---|---|---|
| `miko dev` | root、mode、配置 | 启动 Dev Server；后台类型检查/Lint | 配置、依赖、Server 启动失败；后台检查只显示 Overlay/日志 |
| `miko build` | root、mode、配置 | 类型检查、Lint、SPA/SSG 或 Lib 产物、静态白屏检查 | 任一强制检查或构建失败 |
| `miko preview` | 已有 dist、配置 | 只读静态预览和代理 | dist/配置/端口失败 |
| `miko check` | root、mode、配置 | 在临时目录构建，执行类型、Lint、静态检查和浏览器白屏冒烟；不覆盖正式 dist | 任一验证失败 |
| `miko doctor` | root、配置 | 只读诊断报告 | 严重配置冲突返回非零；普通建议返回零 |
| `miko migrate` | 旧项目、参数 | 默认只输出迁移计划；`--write` 时写入新配置和备份 | 无法安全分析或目标冲突 |

所有失败使用稳定退出码类别：配置 2、环境/依赖 3、类型/Lint 4、构建 5、浏览器验证 6、迁移 7。底层工具原始错误作为 cause 保留。

`miko check` 使用 Runner 级 `outputOverride`，把最终产物写入系统临时目录，而不是修改或重新合并用户的 `vite.build.outDir`。启动时明确打印原始 outDir 和隔离目录；验证结束后清理隔离目录。该命令级隔离规则优先于用户 outDir，不能关闭，因为 Check 的契约就是不覆盖正式产物。

所有命令复用同一套：

- 参数解析。
- mode/env 解析。
- 配置加载。
- 项目能力检测。
- 日志与错误格式。
- 进程和退出码管理。

禁止 `dev`、`build`、`preview` 各自重新实现配置或代理逻辑。

## 构建性能

### 开发

- 每个进程只解析一次配置和项目能力。
- 文件变化时按依赖精确失效缓存。
- 可选能力使用动态导入。
- CDN 未启用时不解析 framework 模块映射。
- 内置 HTML 模板缓存，文件变化时失效。
- HTML fallback 只提供内容，不写临时文件、不改变 Vite `root`。
- Dev Server 优先启动，类型检查和 Lint 在后台执行。
- 路由、布局、组件和依赖扫描结果在插件之间复用。

### 生产构建

- 配置只加载一次。
- 类型检查、Lint 和无依赖准备任务并行调度。
- SSG 页面使用有上限的并发渲染。
- 未启用能力不导入、不扫描、不创建插件。
- 默认只构建现代产物。
- 不默认启用复杂 `manualChunks`。
- 所有并发任务受控，避免以内存峰值换取表面速度。

### 请求热路径

- 代理 context 在服务启动时编译。
- 路由、模板和 CDN 映射在启动阶段计算。
- 不在请求过程中重复创建正则或扫描文件。
- 不在模块顶层缓存全局 `process.cwd()`；root 由命令上下文显式传递。

## 构建后运行时性能

### 首屏

- SSG 输出可直接展示的 HTML。
- 关键 CSS 内联只在现有 SSG CSS 处理链能够稳定提取且性能基准证明有效时启用；否则保持 Vite 标准 CSS 资源。
- JavaScript 使用现代 ESM 资源。
- 默认不注入 framework CDN 脚本。
- 不序列化无用的全局状态和空状态。

### JavaScript 与 CSS

- 页面组件按路由懒加载。
- 路由生成器必须产出动态 import；浏览器冒烟断言未访问路由 chunk 不进入当前页面请求链。
- 公共依赖由构建器自动拆分。
- Debug、DevTools、构建诊断代码不进入生产包。
- Legacy 产物与现代产物隔离。

### Hydration

- 只恢复实际生成的 Pinia 状态。
- Head 条目去重并只注入一次。
- SPA 不再整体包裹 `ClientOnly`。
- 只有明确的客户端页面或组件跳过预渲染。
- 根应用壳保持稳定，路由变化不重建全局结构。

### 静态部署

- 静态资源使用内容哈希名称。
- 输出路由清单和静态资源清单。
- HTML 与哈希资源具有清晰的缓存边界。
- 缓存响应头仍由部署平台负责。

## 白屏检测

白屏检测是默认可靠性能力，不要求用户配置。

### 构建期静态检查

- HTML 包含应用根节点。
- 入口 JS/CSS 文件存在。
- base 下资源路径可解析。
- SSG 路由生成非错误 HTML。
- ClientOnly、404 和深层路由输出结构有效。
- 不允许空路由产物和永久 Skeleton 标记。

### Preview 浏览器冒烟

`miko check` 在临时构建完成后启动临时 preview，默认检查首页、一个最深层静态路由和 404；`--all-routes` 检查所有可预渲染路由。普通 `miko build` 不强制启动浏览器，只执行静态检查。

- 页面成功打开。
- 资源请求无关键失败。
- 首次 ready 前没有导致启动中断的 Vue、Hydration 或 Promise 错误。
- 根节点完成首次渲染。
- Skeleton 被正常移除。
- 根节点写入 `data-miko-ready="true"`。
- base、深层路由和 404 正常。

检测失败时输出具体路由、资源和浏览器错误，并使验证任务失败。

### 生产运行时兜底

内置模板加载一个独立、可缓存且不依赖应用入口成功执行的极小启动监控资源，以兼容严格 CSP：

```text
页面开始加载
 → 等待首次成功渲染
 → 写入 data-miko-ready
 → 移除 v-cloak/Skeleton
```

以下情况触发失败界面：

- 入口脚本加载失败。
- Vue 启动失败。
- Hydration 过程抛出异常或导致 ready 超时。
- 未处理的 Promise 异常。
- 默认 8 秒内没有首次成功渲染。
- 根节点没有 ready 标记。

`data-miko-ready` 是白屏监控唯一成功协议，由根应用在 Router Ready 且首次 Vue Render 完成后写入。页面是否有业务可见内容不作为运行时判断条件，因此合法空页面不会误报。ClientOnly 页面也使用相同 ready 协议。

Vue adapter 在首次 ready 前临时接入 `app.config.errorHandler` 和 `app.config.warnHandler`。抛出的 Hydration 异常属于启动失败；可恢复的 Hydration mismatch warning 会被记录，但应用若正常 ready，不显示生产失败界面。`miko check` 把任何 Hydration mismatch warning 视为浏览器验证失败，从而阻止它长期进入生产。

监控只处理首次 ready 之前的错误；ready 之后的普通业务异常不等同白屏。开发环境显示详细错误；生产环境显示安全错误编号和重新加载按钮。默认超时 8 秒，可通过 `miko.whiteScreen.timeout` 覆盖，也可使用 `false` 完全关闭。

## 错误与安全

错误分为配置、环境和构建三类，并统一包含：

- 错误代码。
- 文件路径。
- 字段路径或路由。
- 原始原因。
- 可执行修复建议。

必须修复：

- 配置加载失败不再返回空对象。
- CLI 保留真实子进程退出码。
- Preview Proxy 默认启用 TLS 证书校验。
- 只有用户显式配置时才允许不安全 TLS。
- Proxy 上游错误返回明确的网关错误，不静默交给后续中间件。
- 日志不得泄露环境变量、令牌和完整敏感 URL。

## 测试

### 单元测试

- 配置加载和运行时校验。
- 三态配置。
- 字段级递归合并。
- 自动检测和冲突。
- 插件顺序和重复插件。
- 虚拟模块。
- 用户 HTML 优先、缺失文件时合成 HTML、入口自动注入与 `#app` 校验。
- root/base/outDir。
- Proxy context、TLS 和错误处理。
- CLI 参数、退出码和日志脱敏。
- 白屏启动监控状态机。

### 集成测试

- 无配置文件项目。
- 有/无用户 `index.html` 的 Dev、SPA Build 和 SSG Build。
- 完整 `miko.config.ts`。
- SPA、SSG、Library Mode。
- 深层路由和非根 base。
- 自定义 Vue/Vite 插件选项。
- Legacy 自动检测。
- CDN 显式启用。
- Pinia、Unhead 和 Hydration。
- 构建失败时不留下可误用产物。

### 浏览器测试

- 开发页面。
- 生产 Preview。
- SSG 首页和深层路由。
- ClientOnly。
- 404。
- Proxy。
- 脚本失败、Hydration 失败和永久 Skeleton 的白屏兜底。

### 运行环境矩阵

- Bun 负责安装依赖和 workspace。
- Node 20.19。
- Node 22.12 或当前 LTS。
- 必要时增加 Bun Runtime 兼容冒烟，但不把它作为唯一运行路径。

所有功能和缺陷修复遵循测试先行；发现的每个缺陷都必须先形成可失败的回归测试。

### 需求—测试追踪

| 需求 | 主要测试 |
|---|---|
| 零配置默认 SSG | `fixtures/zero-config` CLI 集成测试 + 首页浏览器测试 |
| 零配置 HTML 入口 | 用户 HTML 优先、缺失文件合成入口、无临时文件、root 不变和重复注入测试 |
| SPA 切换 | `fixtures/spa-config` 构建测试 + 无 SSG 输出断言 |
| 唯一配置和完整 Vite 表面 | 配置加载、字段策略和禁止 `vite.config.ts` 测试 |
| 自动能力 | 每项能力的依赖/文件/显式覆盖 fixture |
| Node 运行时独立于 Bun | Node 20/22 CLI 冒烟，扫描和执行路径禁止 Bun API |
| Preview Proxy 安全 | TLS、context、上游失败和日志脱敏测试 |
| SSG/Hydration | Pinia、Head、ClientOnly 和 base 浏览器测试 |
| 白屏检测 | 入口 404、启动抛错、Hydration 失败、超时和正常空页面故障注入 |
| 构建与运行性能 | Small/Medium/Large/Runtime 基准 fixture 和预算比较 |
| 迁移安全 | dry-run、备份、冲突、幂等、无法分析配置和迁移后 doctor |

## 性能基准与门禁

实施前记录现有版本基线：

- 冷启动和热启动时间。
- HMR 延迟。
- 类型检查和 Lint 时间。
- SPA/SSG 构建时间。
- SSG 不同路由数量下的扩展曲线。
- 峰值内存。
- JS/CSS/HTML 体积。
- 浏览器 FCP、LCP、JS 执行、Hydration 和路由切换时间。
- 首屏请求数量和未使用路由加载情况。

基准 fixture 固定为：

- Small：3 个路由、1 个布局、20 个组件。
- Medium：50 个路由、3 个布局、200 个组件。
- Large：500 个路由、5 个布局、1000 个组件。
- Runtime：包含首页、深层路由、Pinia、Head、ClientOnly 和共享异步组件。

采样规则：

- 在同一机器、同一 Node/Bun 版本和相同电源策略下比较。
- 冷缓存清理 Miko/Vite 项目缓存但保留依赖安装；采样 3 次取中位数。
- 热缓存连续采样 5 次取中位数。
- 浏览器指标使用固定视口、禁用扩展的 Chromium，采样 5 次取中位数。
- CI 保存原始 JSON 和环境信息，禁止只提交摘要。

初始门禁：

- 生产 JS/CSS 体积、Hydration、路由切换和浏览器关键指标不得回退超过 5%。
- 冷/热启动、SPA/SSG 构建时间和峰值内存不得回退超过 10%。
- 超过门禁必须在设计记录中说明可量化收益并获得批准。

每项性能改动必须提供前后数据。没有数据证明收益的复杂优化不进入主干。性能提升不得以正确性、可诊断性或不可控内存为代价。

## 大版本迁移

提供：

```sh
miko migrate
miko doctor
```

迁移工具负责：

- 读取旧 `vite.config.ts` 和旧 `miko.config.ts`。
- 生成新的单一 `miko.config.ts`。
- 把 Vite 配置移动到 `vite` 命名空间。
- 把框架配置移动到 `miko` 命名空间。
- 转换旧插件字段为新的 `xxxPluginOptions`。
- 报告无法自动迁移的函数和插件顺序。
- 输出迁移摘要，不静默删除行为。

迁移安全契约：

- 默认是 `--dry-run`；只有 `--write` 才修改文件。
- 写入前在项目内创建带时间戳的迁移备份和恢复说明。
- 已存在目标 `miko.config.ts` 时不覆盖，除非用户显式指定合并目标。
- 无法静态分析的配置函数、动态插件和条件分支保留原文件并标记人工处理。
- 同一项目重复执行必须幂等。
- 首个大版本只保证迁移当前主分支所代表的最后一个旧版配置格式。
- 写入后自动运行 `miko doctor`；用户选择完整验证时再运行 `miko check`。

升级文档包含：

- 旧包到新入口的映射。
- CLI 命令变化。
- 配置字段变化。
- 默认自动能力变化。
- SPA/SSG、Legacy、CDN 和 Proxy 行为变化。
- 性能基准前后对比。
- 常见错误和回滚方法。

## 实施切片

本设计是大版本总设计，不作为一个不可分割的巨型改动实施。后续拆成四个各自可运行、可测试、可发布检查点：

1. **CLI 与统一配置内核**：唯一配置、字段合并、错误模型、Node 运行链路和基础测试。
2. **插件编排与自动能力**：插件拆分、检测矩阵、SPA/SSG、Legacy/CDN、Proxy 和 Doctor。
3. **构建与运行时性能**：缓存、并发、产物优化、Hydration、基准和性能门禁。
4. **白屏、迁移与大版本发布**：三层白屏检测、Check、Migrate、升级文档和最终兼容矩阵。

每个切片使用独立实施计划和测试门禁；前一个切片必须保持可工作的框架，再进入下一个切片。

## 验收标准

- 新项目在没有任何配置文件时可以开发、构建和预览。
- 唯一可选的 Miko/Vite 构建配置文件是 `miko.config.ts`。
- `miko.config.ts` 支持完整 Vite 配置和内置插件深度配置。
- 所有自动集成可诊断、可覆盖、可关闭；Miko 核心约定明确不可关闭。
- SPA、SSG、base、深层路由、Pinia、Head、Legacy 和 CDN 回归测试通过。
- Node.js 运行链路不调用 Bun 专属 API。
- 默认现代产物不包含 CDN 和 Legacy 额外成本。
- 构建与浏览器运行时性能均有基线和回归门禁。
- Build 静态检查、Check 浏览器冒烟和生产运行时启动监控均通过故障注入测试。
- 配置和构建错误不再被静默吞掉。
- Preview Proxy 默认安全，并有完整错误测试。
- 迁移工具能处理仓库提供的旧版示例项目。
