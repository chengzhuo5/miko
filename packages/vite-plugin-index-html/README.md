# @minar-kotonoha/vite-plugin-index-html

在不改变 Vite `root` 的前提下提供零配置 HTML 入口和 `virtual:index`。

## 行为

- `<root>/index.html` 存在时使用用户文件。
- 文件不存在时，以同一个绝对路径 ID 提供内置 HTML，不写临时文件。
- 两种 HTML 都自动注入唯一的 Miko module 入口。
- HTML 必须包含唯一的 `#app`。
- `virtual:index` 解析为应用入口文件。

## 用法

```ts
import { indexHTMLPlugin } from '@minar-kotonoha/vite-plugin-index-html';

plugins: [
  await indexHTMLPlugin({
    entry: '/project/template/main.ts',
    root: '/project',
    template: '/package/template',
  }),
];
```
