# @minar-kotonoha/vite-plugin-index-html

虚拟模块 `virtual:index` + dev/prod 根目录分离。

## 功能

- **开发模式**：将 Vite root 指向 `node_modules/.vite_entry`，使 root 和 cwd 在同一位置，保证依赖预构建性能
- **生产模式**：将 Vite root 设为模板目录
- **虚拟模块**：`virtual:index` 解析为应用入口文件

## 用法

```ts
// vite.config.ts
import { indexHTMLPlugin } from '@minar-kotonoha/vite-plugin-index-html'

export default defineConfig({
  plugins: [indexHTMLPlugin(entry, template)]
})
```

参数：
- `entry`：应用入口文件路径（如 `template/main.ts`）
- `template`：模板目录路径
