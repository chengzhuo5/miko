---
name: to-miko
description: 将任意 Vue 3 + Vite 项目迁移到 miko 架构
---

# to-miko

将任意 Vue 3 + Vite 项目迁移到 [miko](https://github.com/minar-kotonoha/miko) 架构。

**触发条件:** "迁移到 miko"、"接入 miko"、"miko 迁移" 等。

---

## 架构

```
to-miko/
  SKILL.md
  references/
    plugin-map.json
    migration-steps.md
    route-migration.md
    common-diffs.md
```

---

## Phase 0: 了解源项目

### P0.1 通读关键文件

在提出任何迁移建议前，先完整阅读源项目的以下文件：

1. `package.json` — 依赖和 scripts
2. `vite.config.ts`（或等效构建配置）— 插件链、alias、代理
3. `src/router/index.ts` — 路由表
4. `src/main.ts` + `src/main-mf.ts`（如有）— 入口和应用初始化
5. `src/app.vue` — 根组件
6. `index.html` — HTML 入口
7. `tsconfig.json` — TypeScript 配置
8. `.env.*` 文件 — 环境变量

### P0.2 识别模式

用 Glob 列出源文件结构：
```
src/pages/    → 页面组件
src/components/ → 组件
src/stores/   → 状态管理
src/router/   → 路由配置
src/composables/ → 组合式函数
src/api/      → API 层
```

### P0.3 对照 plugin-map

读取 `references/plugin-map.json`，将源项目的每个插件/配置映射到 miko 等价物，标注状态：`replace` / `adapt` / `keep` / `remove`。

---

## Phase 1: 分流决策

### 展示双路径对比

向用户展示两种迁移路径的优劣对比表（见 `references/migration-steps.md#step-0`），

推荐：
- **CLI 模式**为默认 — 零配置，全面享受 miko 内置优化
- **Vite 配置模式**为备选 — 有大量自定义 Vite 配置时使用

### 兼容性检查

- [ ] Vue 3（非 Vue 2）
- [ ] Vite 构建（非 Webpack）
- [ ] 路由可转为文件系统路由
- [ ] 接受 SSG 默认（或显式禁用）

如有不满足 → 告知用户风险和建议。

### 识别阻塞点

特别关注：
- **Hash history** → 推荐改 HTML5 history，否则需禁用 SSG
- **自定义 html 注入插件** → 推荐用 `useHead` 替代
- **monolith 式多源合并** → 不在迁移范围内

---

## Phase 2: 执行迁移

按 `references/migration-steps.md` 中的 6 步清单执行：

| Step | 内容 | 参考文件 |
|------|------|---------|
| Step 1 | 创建 `miko.config.ts` + 更新 `package.json`/`vite.config.ts` | plugin-map.json |
| Step 2 | 路由迁移：`src/pages/` → `pages/` + `<route>` SFC block | route-migration.md |
| Step 3 | 入口改造：创建 `index.ts` bootstrap | self-stock 参考 |
| Step 4 | 源码结构调整：`src/` → 根目录 | common-diffs.md §4 |
| Step 5 | SSG 适配：浏览器 API、Suspense、hash history 处理 | common-diffs.md §1, §3 |
| Step 6 | 验证：`miko build` + `vue-tsc` + Playwright 截图 | — |

### 自动化优先原则

每步中能自动化处理的优先自动化：
- **配置生成**：从源 `vite.config.ts` + `package.json` 自动提取端口、代理、UI 库类型
- **路由迁移**：解析 `src/router/index.ts` 路由表，自动生成 `pages/` 目录 + `<route>` 块
- **路径更新**：自动更新移动后的 import 路径
- **依赖清理**：自动识别和移除可被 miko 内置替换的依赖

只把无法自动化的差异交给用户决策。

---

## Phase 3: 验证

### 构建验证

```bash
miko build   # 或 bun x miko build（Vite 配置模式）
```

0 errors = 迁移成功。

### 类型检查

```bash
vue-tsc --noEmit
```

### 视觉验证（Playwright）

使用 Playwright 截图迁移前后的关键页面，对比确认渲染一致。

---

## 核心规则

| # | 规则 |
|---|------|
| 1 | 先读文件，后做决策 — 不知道源项目结构不给出迁移建议 |
| 2 | 硬前提不可妥协：文件系统路由 + SSG |
| 3 | 让用户决策阻塞点，skill 提供推荐 |
| 4 | 自动化能做的不要让用户手动做 |
| 5 | `@sec/*` 等业务依赖一律保留不动 |
| 6 | `miko build` 0 errors 是唯一的客观验收标准 |

---

## 参考实现

`D:\Code\CMS\trading-business-h5\apps\self-stock` — 已完成的 miko 迁移案例，可作为参考对照。
