# 常见差异及处理策略

迁移过程中最常见的差异点及推荐处理方式。

## 1. Hash History → HTML5 History

**差异**：原始项目使用 `createWebHashHistory()`，miko SSG 要求 HTML5 history。

**推荐**：改为 HTML5 history。SSG 是 miko 最大优势。

**例外**：如果业务强依赖 hash（如银行 APP 内嵌、URL hash 传递参数），在 `miko.config.ts` 中设置 `ssg: false`：

```ts
export default { ssg: false } satisfies MikoUserConfig
```

## 2. htmlInjectPlugin → useHead

**差异**：原始项目使用自定义 `htmlInjectPlugin` 注入 `<meta>` 标签和 `window.__APP_CONFIG__`。

**推荐**：使用 unhead 的 `useHead()` 替代：

```ts
// App.vue 或页面组件中
useHead({
  meta: [
    { name: 'app-id', content: 'sec-market' },
    { name: 'version', content: import.meta.env.VITE_APP_VERSION },
  ],
  script: [
    { innerHTML: `window.__APP_CONFIG__ = ${JSON.stringify(config)}` }
  ]
})
```

**例外**：如果 `htmlInjectPlugin` 注入了大量复杂逻辑且短期内无法迁移，保留原插件并通过 `defineMikoConfig()` 参数传入手动注册。

## 3. wujie-vue3 微前端

**差异**：原始项目作为 wujie 子应用，通过 `main-mf.ts` 的 `mount()/unmount()` 生命周期被加载。

**策略**：**保留原样**。miko 迁移不影响微前端架构。`src/main-mf.ts` 的 `mount()` 逻辑移到 `index.ts` bootstrap：

```ts
// index.ts bootstrap
export default (app, router, initialState) => {
  // 原 main-mf.ts mount() 内容
  const pinia = createPinia()
  app.use(pinia)
  app.use(UiCore)
  app.use(UiBiz)
  // ... 其他初始化

  // SSR hydration
  if (import.meta.env.SSR) {
    if (initialState) initialState.pinia = pinia.state.value
  } else if (initialState?.pinia) {
    pinia.state.value = initialState.pinia as typeof pinia.state.value
  }
}
```

## 4. `src/` 目录 → 根目录

**差异**：原始项目代码在 `src/` 下，miko 项目代码在根目录。

**处理**：
- `src/pages/` → `pages/`
- `src/components/` → `components/`
- `src/stores/` → `stores/`
- `src/composables/` → `composables/`
- `src/api/` → `api/`
- `src/utils/` → `utils/`
- `@/` import 路径从指向 `src/` 改为指向根目录
- `src/typing/auto-import.d.ts` → `typing/auto-import.d.ts`
- `src/typing/components.d.ts` → `typing/components.d.ts`

## 5. vue-router v4 → v5

**差异**：miko 强制 `vue-router@^5.2.0`。

**兼容性**：v5 API 与 v4 基本兼容。常见差异：
- `router.resolve()` 签名变化
- 部分类型导出路径变化

**处理**：更新 `package.json` 中 `vue-router` 版本，运行 `vue-tsc --noEmit` 检查类型错误。

## 6. SCSS → Less

**差异**：原始项目用 SCSS（`sass` 依赖），miko 模板默认 Less。

**处理**：
- 如果项目重度使用 SCSS 特性（`@mixin`、`@extend`、`$变量`），**保留 `sass` 依赖**。miko 不阻止使用其他 CSS 预处理器
- 如果只是简单嵌套，考虑迁移到 Less（miko 模板默认）
- Vant 4 本身使用 CSS 变量，对预处理器无特殊要求

## 7. `@sec/*` workspace 依赖

**差异**：原始项目依赖多个 `@sec/*` workspace 包。

**策略**：**全部保留**。这些是业务依赖，与构建系统无关。miko 迁移只改构建层。

## 8. `vite.config.ts` 特殊逻辑

**差异**：原始项目 `vite.config.ts` 中可能有自定义插件、特殊 alias、monolith 式多源合并等。

**处理**：
- 大部分逻辑已被 miko 内置覆盖（见 plugin-map.json）
- 无法覆盖的自定义逻辑通过 `defineMikoConfig()` 参数传入额外 plugins：

```ts
// vite.config.ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'

export default await defineMikoConfig({
  // miko 配置
  uiLibrary: 'vant',
  dev: { port: 5175 },
  // 额外 Vite 插件
}, {
  // Vite UserConfig 覆盖
  plugins: [customPlugin()],
  resolve: { alias: { '@custom': '/path/to/custom' } }
})
```

## 9. 环境变量

**差异**：原始项目有多个 `.env.*` 文件。

**处理**：**保留全部 `.env.*` 文件**。miko 兼容 Vite 的环境变量系统：
- `.env` — 所有模式
- `.env.development` — `miko dev`
- `.env.production` — `miko build`
- `.env.test` — `--mode test`

## 10. monolith 项目

**差异**：monolith 将多个子应用的源码合并到一个 SPA，使用自定义 `@/` 解析器区分不同应用。

**策略**：**不在迁移范围内**。monolith 的跨应用合并结构过于特殊，迁移成本高于收益。建议保持原有构建方式。
