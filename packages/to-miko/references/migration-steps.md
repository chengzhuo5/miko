# 迁移步骤清单

## 概览

将 Vue 3 + Vite 项目迁移到 miko 架构的逐步操作清单。每步含前置条件、操作、验证方法。

---

## Step 0: 分流决策

到达 skill 后，先帮用户判断迁移路径。

### 双路径对比

| 维度 | Vite 配置模式 | CLI 模式 |
|------|-------------|---------|
| **入口** | `vite.config.ts` → `defineMikoConfig()` | 无 vite.config.ts，使用 `miko dev/build` |
| **灵活性** | 高 — 可混用其他 Vite 插件，传入自定义 UserConfig | 中 — 大部分 miko 内置，极端定制需退到配置模式 |
| **零配置程度** | 低 — 仍需 vite.config.ts | 高 — 完全零配置 |
| **适用场景** | 有大量自定义 Vite 配置的项目 | 标准 Vue 3 + Vite 项目，或愿意接受 miko 约定的项目 |
| **miko 升级** | 手动更新依赖版本 | `bun update @minar-kotonoha/miko-cli` |
| **推荐** | 以下情况选此：有自定义 Vite 插件、特殊构建流程、多环境复杂配置 | **默认推荐**：大多数项目的首选 |

### 兼容性检查

检查源项目是否满足 miko 硬前提：

- [ ] 使用 Vue 3（非 Vue 2）
- [ ] 使用 Vite 构建（非 Webpack/vue-cli）
- [ ] 路由可转为文件系统路由（或接受自动路由）
- [ ] 接受 SSG 为默认生产构建方式（或愿意显式禁用）

如果任一项不满足 → 告知用户无法直接迁移，或需额外改造。

---

## Step 1: 配置迁移

### 1.1 创建 `miko.config.ts`

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  uiLibrary: 'vant',  // 或 'element-plus'
  dev: { port: 5175 },
  // proxy: [{ context: ['/api/**'], target: 'https://dev.example.com', changeOrigin: true }]
} satisfies MikoUserConfig
```

从原始配置自动提取：
- `server.port` → `dev.port`
- `server.proxy` → `proxy` 数组（格式略有不同，需转换）
- `resolver` 类型 → `uiLibrary`

### 1.2 CLI 模式：更新 `package.json`

```json
{
  "scripts": {
    "dev": "miko dev",
    "build": "miko build",
    "preview": "miko preview",
    "typecheck": "vue-tsc --noEmit"
  },
  "devDependencies": {
    "@minar-kotonoha/miko-cli": "^0.1.11"
  }
}
```

从原始 scripts 迁移：
- `vite --port XXXX --mode development` → `miko dev`
- `vite build --mode production` → `miko build`
- `vite preview --port XXXX` → `miko preview`

### 1.3 Vite 配置模式：更新 `vite.config.ts`

```ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default await defineMikoConfig({
  uiLibrary: 'vant',
  dev: { port: 5175 }
} satisfies MikoUserConfig)
```

### 1.4 删除不再需要的依赖

以下依赖由 miko 内置提供，可从 `package.json` 中移除：
- `vite`（CLI 模式下；来自 `@minar-kotonoha/miko-cli`）
- `@vitejs/plugin-vue`
- `@vitejs/plugin-vue-jsx`
- `unplugin-auto-import`
- `unplugin-vue-components`
- `vite-plugin-vue-layouts-next`
- `@vitejs/plugin-legacy`
- `unocss`（CLI 模式下 miko 自带；Vite 配置模式保留）

**验证**：`bun install` 成功，无 peer dependency 警告。

---

## Step 2: 路由迁移

### 2.1 将 `src/pages/` 移到根目录 `pages/`

```bash
mv src/pages pages/
```

### 2.2 为每个页面添加 `<route>` SFC block

对每个 `pages/` 下的 `.vue` 文件，添加 `<route>` 块声明路由元数据：

```vue
<route lang="yaml">
name: market
meta:
  title: 行情
</route>

<template>...</template>
```

参照 `references/route-migration.md` 中的映射规则。

### 2.3 处理 catch-all 路由

确保存在 `pages/[...path].vue` 作为 404 页面。

### 2.4 迁移路由守卫

将 `src/router/index.ts` 中的 `beforeEach`/`afterEach` 等守卫移到 `index.ts` bootstrap 函数中。

### 2.5 删除 `src/router/index.ts`

文件系统路由不需要手动路由表。

**验证**：`miko dev` 启动后所有原路由可访问。

---

## Step 3: 入口改造

### 3.1 创建根目录 `index.ts`（bootstrap）

```ts
import type { App } from 'vue'
import type { Router } from 'vue-router'
import { createPinia } from 'pinia'

export default (app: App<Element>, router: Router, initialState?: Record<string, unknown>) => {
  const pinia = createPinia()
  app.use(pinia)

  // ===== Pinia SSR =====
  if (import.meta.env.SSR) {
    if (initialState) initialState.pinia = pinia.state.value
  } else if (initialState?.pinia) {
    pinia.state.value = initialState.pinia as typeof pinia.state.value
  }

  // 原 main.ts 中的插件注册
  // app.use(UiCore)
  // app.use(UiBiz)
}
```

### 3.2 合并 `src/main.ts` 和 `src/main-mf.ts`（如有）

将 `mount()` 中的初始化逻辑移到 bootstrap，删除这两个文件。

### 3.3 删除 `src/app.vue` 和 `index.html`

miko 模板提供这些文件。

**验证**：`miko dev` 启动后页面正常渲染。

---

## Step 4: 源码结构调整

### 4.1 将 `src/` 下其他目录移到根目录

```bash
mv src/components components/
mv src/stores stores/
mv src/composables composables/
mv src/api api/
mv src/utils utils/
mv src/typing typing/  # 如有
```

### 4.2 更新 import 路径

`@/` import 从指向 `src/` 改为指向根目录：
- miko 的 `@` alias 默认指向 CWD（项目根目录）
- `src/pages/hq/index.vue` 中的 `@/components/xxx` → 保持不变（文件移到根目录后路径仍然有效）
- 如有深层相对路径 import，需检查是否仍然有效

### 4.3 迁移 tsconfig

从 `../../tsconfig.base.json` 改为 `@minar-kotonoha/linter/tsconfig`：

```json
{
  "extends": "@minar-kotonoha/linter/tsconfig",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  }
}
```

注意保留原有的 `@sec/*` 等 workspace 路径映射。

**验证**：`vue-tsc --noEmit` 无类型错误。

---

## Step 5: SSG 适配

### 5.1 处理浏览器特定 API

检查代码中是否有 `window`/`document`/`localStorage` 等浏览器 API 在组件顶层调用——SSR 时会报错。包裹在 `if (!import.meta.env.SSR)` 或 `onMounted()` 中。

### 5.2 处理动态导入

SSG 预渲染时，异步组件需要 Suspense 包裹。miko 模板的 `App.vue` 已包含 `<Suspense>`。

### 5.3 Hash history 项目特殊处理

如原项目使用 Hash history 且无法改为 HTML5 history，在 `miko.config.ts` 中禁用 SSG：

```ts
export default { ssg: false } satisfies MikoUserConfig
```

**验证**：`miko build` 构建成功，`miko preview` 预览正常。

---

## Step 6: 验证

### 6.1 构建验证

```bash
miko build
# 预期：0 errors，dist/ 目录生成
```

### 6.2 类型检查

```bash
vue-tsc --noEmit
# 预期：0 errors
```

### 6.3 视觉验证（Playwright）

用 Playwright 截图对比迁移前后的关键页面：

```bash
bun x playwright test tests/migration-screenshots.spec.ts
```

### 6.4 E2E 测试（如有）

```bash
bun test:e2e
```

---

## 快速参考：从 self-stock 学到的模式

self-stock 是已迁移的参考实现，关键特征：

- **极简配置**：6 行 `miko.config.ts`
- **无 `src/`**：代码在根目录
- **文件系统路由**：`pages/` 下 3 个页面文件
- **CLI 模式**：`miko dev` / `miko build` / `miko preview`
- **SSG 就绪**：bootstrap 含 Pinia SSR 序列化/注水
- **保留业务依赖**：所有 `@sec/*` workspace 包不变
