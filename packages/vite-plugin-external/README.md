# @minar-kotonoha/vite-plugin-external

生产环境 CDN 外部化 — 将 Vue 生态依赖（vue、vue-router、axios 等）映射为从 CDN 加载的全局 `framework` 对象，避免重复打包。

## 原理

1. 读取 `@minar-kotonoha/framework` 的模块列表，获取所有可外部化的包
2. 在生产构建（非 SSG）中，将 `import { ref } from 'vue'` 重写为 `framework['vue'].ref`
3. 开发/SSG 模式下依赖正常打包，不做外部化

## 用法

```ts
// vite.config.ts
import { externalPlugin } from '@minar-kotonoha/vite-plugin-external'

export default defineConfig({
  plugins: [externalPlugin()]
})
```

需要安装 `@minar-kotonoha/framework`，并在生产环境通过 CDN 加载其 UMD 包。
