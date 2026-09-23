# @minar-kotonoha/vite-plugin-miko

Miko 的配置解析、自动能力图与 Vite 插件装配引擎。日常项目通过 `miko` CLI 使用，不需要也不支持 `vite.config.ts`。

项目使用 Bun 安装依赖；分发后的 CLI 使用 Node.js + jiti 运行。

## 零配置

项目没有 `miko.config.ts` 时，Miko 使用固定优先级解析能力：

```text
显式配置 → 根目录约定文件 → package.json 直接依赖 → 当前命令 → 安全默认值
```

| 能力         | 自动规则                                                 |
| ------------ | -------------------------------------------------------- |
| Rendering    | 默认 `ssg`，可显式设为 `spa`                             |
| Layouts      | 项目 `layouts/` 优先，否则使用内置布局                   |
| Components   | 检测到 `components/` 或受支持 UI 库时启用                |
| UnoCSS       | 检测 `uno.config.*`、`unocss` 或 `@unocss/vite` 直接依赖 |
| Linter       | 默认启用；根目录 lint 配置会被识别                       |
| Pinia        | 检测到 `pinia` 直接依赖后自动安装和 SSG 注水             |
| Legacy       | Browserslist 包含旧浏览器目标时启用                      |
| DevTools     | 仅开发命令启用                                           |
| CDN          | 永不自动启用，必须显式提供 `frameworkCDN`                |
| Janus        | 同时检测到 `@janus/unplugin` 和 `schemas/` 时启用        |
| White screen | 默认启用 8000ms 独立启动监控                             |

`undefined` 表示自动检测，`false` 表示禁用，`true` 或对象表示显式启用；插件选项对象与 Miko 默认值合并，不会整块覆盖。

## 可选配置

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko';

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
} satisfies MikoUserConfig;
```

- `miko`：框架能力和内置插件选项。
- `vite`：完整 Vite `UserConfig`，按字段与 Miko 默认值合并。
- `vite.input`、`vite.build.rollupOptions.input`、`vite.build.rolldownOptions.input` 和应用 `build.lib` 由 Miko 校验。

配置也可以是函数：

```ts
import type { MikoConfigFactory } from '@minar-kotonoha/vite-plugin-miko';

export default ((env) => ({
  miko: {
    rendering: env.command === 'build' ? 'ssg' : 'spa',
  },
  vite: {
    define: {
      __MODE__: JSON.stringify(env.mode),
    },
  },
})) satisfies MikoConfigFactory;
```

## 组件库样式作用域

`miko build --lib` 默认不改变 CSS。需要隔离组件库样式时，显式设置
`miko.lib.cssScope`：

```ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko';

export default defineMikoConfig({
  miko: {
    lib: {
      cssScope: '[data-miko-lib="quote-kit"]',
    },
  },
});
```

使用方必须以相同选择器包裹组件：

```vue
<section data-miko-lib="quote-kit">
  <QuoteKit />
</section>
```

Miko 只作用域化普通 CSS 选择器及 `html`、`body`、`:root`、`#app`。它不会重命名
class、id、CSS 自定义属性、动画名称或字体名称，也不会使用 Shadow DOM；需要完全隔离时，
应由组件库自行采用 Shadow DOM。仍需 PostCSS 时，请通过 `vite.css.postcss.plugins` 显式
配置插件；`cssScope` 不支持与字符串形式的 `vite.css.postcss` 同时使用。

## CLI

项目只通过 Miko CLI 执行：

```sh
bunx miko dev
bunx miko build
bunx miko preview
bunx miko check
bunx miko doctor
bunx miko migrate
```

- `miko check [--all-routes]` 在临时目录完成类型检查、构建、静态校验、Preview 和 Chromium 冒烟，不覆盖正式 `dist`。
- `miko doctor [--json]` 只读输出能力来源、实际值和插件顺序。
- `miko migrate [--write] [--check]` 静态分析旧配置；安全写入前创建可恢复备份。

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

## 白屏保护

白屏能力默认启用。构建时生成独立哈希监控脚本，开发时由独立中间件提供；runtime 在应用首个真实渲染（`#app` 出现内容）后自动标记 ready，业务模板无需任何额外调用（零配置），也不依赖路由导航成功。入口资源失败、Vue 启动异常、hydration 警告和永久未完成渲染会被运行时协议或 `miko check` 发现。

监控只对"页面仍为空白"负责：`#app` 已渲染出可见内容时，启动噪音（业务异步错误、单资源失败、路由异步初始化慢于超时）只记录告警，不弹失败面板；失败面板仅在测试环境（`miko build --mode test`）渲染，生产构建只记录告警不弹失败页。失败面板以覆盖层渲染，不清空 `#app`、不破坏 SSG 预渲染内容与后续 hydration；面板先以隐藏态挂载，持续失败超过 1s（防闪现窗口）才解除 `v-cloak` 并淡入，应用在窗口内启动成功时 `markMikoReady` 会在面板可见前将其撤销，不会出现"短暂闪现页面加载失败后马上恢复正常页面"的误导体验。除超时外的失败信号（资源加载失败、启动异常）先进入 2s 确认窗口，应用在窗口内启动成功则信号作废——页面加载瞬间的非致命事件不会误弹失败面板；`<link>` 资源失败（favicon、样式表等，不阻断 JS 启动）与 vite-legacy 现代浏览器探针错误只记录告警，永不判死。超时以应用入口脚本执行完成（下载阶段结束）为起点计时，弱网下载耗时不计入启动预算。

使用 `miko.whiteScreen: false` 禁用，或通过 `{ timeout }` 覆盖等待时间。

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
};
```

启用时项目必须直接依赖 `@minar-kotonoha/framework`。只有依赖优化或 SSR 选项而没有 URL 时，配置仍合法但不会启用 CDN。

## Doctor

Doctor 复用 Dev / Build / Preview 的同一份项目解析与插件装配结果，报告配置文件、渲染模式、能力来源、实际标量值、插件顺序和警告。它不启动 Vite，也不写项目文件。能力冲突和缺失依赖使用退出码 3。

## v1 迁移

先运行 `miko migrate` dry-run。安全计划可使用 `miko migrate --write --check`，自动备份旧配置、原子写入 `miko.config.ts`，再运行 Doctor 和完整 Check。动态配置、自定义插件顺序和 Miko 所有权 input 必须人工迁移。

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
} from '@minar-kotonoha/vite-plugin-miko';
```
