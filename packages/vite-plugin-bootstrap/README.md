# @minar-kotonoha/vite-plugin-bootstrap

虚拟模块 `virtual:bootstrap` — 自动发现项目的 `index.ts` 默认导出，将 Vue App 实例作为参数传入。

## 用法

```ts
// vite.config.ts
import { bootstrapPlugin } from '@minar-kotonoha/vite-plugin-bootstrap'

export default defineConfig({
  plugins: [bootstrapPlugin()]
})
```

在项目根目录的 `index.ts` 中：

```ts
import type { App } from 'vue'
import type { Router } from 'vue-router'

export default (app: App, router: Router) => {
  // 在此处初始化你的应用
  app.use(createPinia())
}
```

插件会将 `virtual:bootstrap` 解析为该默认导出，这样 `template/main.ts` 就可以通过 `import { bootstrap } from 'virtual:bootstrap'` 加载，无需硬编码项目路径。
