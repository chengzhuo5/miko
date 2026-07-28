# 路由迁移规则：手动路由 → 文件系统路由

## 基本原理

miko 使用 `vue-router/auto-routes` 实现文件系统路由。`pages/` 目录下的 `.vue` 文件自动映射为路由，无需手动声明路由表。

## 目录结构映射

| 手动路由 | 文件系统路由 |
|---------|------------|
| `src/router/index.ts` | **删除**（自动生成 `types/routes.d.ts`） |
| `src/pages/hq/index.vue` → path: `/` | `pages/index.vue` 或 `pages/hq/index.vue`（取决于是否想要 `/hq` 前缀） |
| `src/pages/stock-detail/index.vue` → path: `/stock-detail` | `pages/stock-detail.vue` 或 `pages/stock-detail/index.vue` |

## 路由元数据：`<route>` SFC Block

miko 通过 SFC 自定义块 `<route>` 定义路由元数据（meta、name、alias 等）：

```vue
<route lang="yaml">
meta:
  title: 行情
  requiresAuth: false
</route>

<template>
  <div>...</div>
</template>
```

### 常用映射

| 手动路由 JS 写法 | `<route>` 写法 |
|-----------------|---------------|
| `{ path: '/', name: 'market', meta: { title: '行情' } }` | `name: market` + `meta: { title: 行情 }` |
| `{ path: '/stock-detail', name: 'stock-detail', meta: { title: '个股详情' } }` | `name: stock-detail` + `meta: { title: 个股详情 }` |
| `{ path: '/:pathMatch(.*)*', name: 'not-found' }` | 文件命名为 `pages/[...path].vue`（catch-all 路由） |
| 动态路由 `{ path: '/user/:id' }` | 文件命名为 `pages/user/[id].vue` |

## 动态路由

| 路由模式 | 文件命名 |
|---------|---------|
| `/user/:id` | `pages/user/[id].vue` |
| `/user/:id?`（可选） | `pages/user/[id].vue`（可选参数自动支持） |
| `/user/:id(\\d+)` | `pages/user/[id].vue`（数字约束在 `<route>` 中声明） |

## 嵌套路由

```
pages/
  parent.vue              ← <RouterView /> 渲染子路由
  parent/
    child.vue             ← /parent/child
    index.vue             ← /parent （默认子路由）
```

## Catch-all / 404

`pages/[...path].vue` — 匹配所有未被其他路由匹配的路径。等价于 `{ path: '/:pathMatch(.*)*' }`。

## 特殊规则

### Hash History → HTML5 History
原始项目中常见 `createWebHashHistory()`——这在 SSG 下不工作。迁移后**推荐**改为 HTML5 history。如业务强依赖 hash（如银行 APP 内嵌），需在 `miko.config.ts` 中设置 `ssg: false` 禁用 SSG。

### 路由懒加载
文件系统路由默认懒加载（每个页面独立 chunk），无需手动 `() => import(...)`。

### 路由守卫
将 `router.beforeEach()` 等守卫从 `src/router/index.ts` 移到 `index.ts` bootstrap 中：

```ts
// index.ts bootstrap
export default (app, router, initialState) => {
  router.beforeEach((to, from) => {
    // 守卫逻辑
  })
}
```

## 示例：迁移 market 路由

**迁移前** (`src/router/index.ts`):
```ts
const routes = [
  { path: '/', name: 'market', component: () => import('@/pages/hq/index.vue'), meta: { title: '行情' } },
  { path: '/stock-detail', name: 'stock-detail', component: () => import('@/pages/stock-detail/index.vue'), meta: { title: '个股详情' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/[...path].vue') }
]
```

**迁移后**:
```
pages/
  index.vue              ← <route> name: market; meta: { title: 行情 }
  stock-detail.vue        ← <route> name: stock-detail; meta: { title: 个股详情 }
  [...path].vue           ← catch-all
```

`src/router/index.ts` → **删除**。
