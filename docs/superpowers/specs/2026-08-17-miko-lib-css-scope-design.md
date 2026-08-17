# Miko Library Mode CSS Scope 设计

日期：2026-08-17
状态：待文档审阅

## 背景

`miko build --lib` 用于输出可被任意宿主应用消费的 Vue 组件库。库中的普通 CSS
选择器可能与宿主或其他库冲突；例如 `.button`、`:root`、`body` 和 `#app`。

库模式已默认隔离根目录自动发现的 PostCSS 配置，避免应用的 `postcss-pxtorem`
隐式将库 CSS 转换为 rem。本设计解决独立问题：在库构建时，将库 CSS 限定在调用方
显式提供的宿主容器内。

## 目标

- 为 Library Mode 提供一个最小、显式、无运行时依赖的 CSS 选择器隔离能力。
- 不改写 Vue 模板中的 class 名，不要求库源码迁移到 CSS Modules。
- 不改变未配置作用域的现有库输出。
- 保持 `miko.config.ts` 的 `vite.css.postcss` 原生扩展能力。

## 非目标

- 不自动创建或注入宿主容器。
- 不把组件渲染到 Shadow DOM。
- 不重命名 class、id、CSS 自定义属性、`@font-face` 或动画名称。
- 不试图解析或修复用户写出的无效 CSS 选择器。

## 配置 API

在 `miko.lib` 增加可选字段：

```ts
export default defineMikoConfig({
  miko: {
    lib: {
      entry: 'src/index.ts',
      cssScope: '[data-miko-lib="quote-kit"]',
    },
  },
})
```

`cssScope` 是一个非空 CSS 选择器字符串。未设置时不执行 CSS 作用域转换。

使用方必须提供匹配的容器：

```vue
<template>
  <section data-miko-lib="quote-kit">
    <QuoteKit />
  </section>
</template>
```

## 转换规则

构建时，Miko 在 Library Mode 的 PostCSS 链中加入一个内部作用域插件。

| 原选择器 | `cssScope: '[data-miko-lib="quote-kit"]'` 后 |
| --- | --- |
| `.button` | `[data-miko-lib="quote-kit"] .button` |
| `.card > .title` | `[data-miko-lib="quote-kit"] .card > .title` |
| `:root` | `[data-miko-lib="quote-kit"]` |
| `html`、`body`、`#app` | `[data-miko-lib="quote-kit"]` |
| `html .button` | `[data-miko-lib="quote-kit"] .button` |
| `@media` 内普通规则 | 按相同规则转换 |
| `@keyframes` 内 `from`、`to`、百分比规则 | 不转换 |

一个已以该作用域开头的选择器不重复添加前缀。逗号分隔的选择器按项独立处理。

## 配置合并与顺序

- Library Mode 继续默认使用空 PostCSS 插件数组，阻断根目录自动发现的应用级转换。
- 配置 `cssScope` 时，Miko 内部作用域插件是默认数组中的首项。
- 用户在 `vite.css.postcss.plugins` 中显式提供的插件继续通过既有 Vite 合并规则追加。
- 如果用户提供 `vite.css.postcss` 的字符串配置路径，Miko 在构建前拒绝与
  `miko.lib.cssScope` 同时使用，并给出确定性配置错误。这样不会静默丢失作用域插件或
  覆盖用户配置；用户应把该 PostCSS 配置迁入 `vite.css.postcss.plugins`。

## 错误处理

- `cssScope: ''` 或仅空白：在配置校验阶段报 `MIKO_CONFIG_INVALID`。
- `cssScope` 与字符串形式 `vite.css.postcss` 同时出现：在配置校验阶段报
  `MIKO_CONFIG_CONFLICT`。
- CSS 中无法被 PostCSS 正常解析的内容仍由 Vite/PostCSS 原始错误处理。

## 测试

新增真实 Vite Library Mode 构建回归：

1. 未配置 `cssScope` 时，普通选择器保持不变。
2. 配置 `cssScope` 时，普通规则、根选择器、逗号选择器和嵌套 `@media` 均落到宿主容器。
3. `@keyframes` 的帧选择器不被污染。
4. 已带前缀的选择器不重复前缀。
5. 显式 `vite.css.postcss.plugins` 仍能与作用域插件共同工作。
6. 空 scope 和字符串型 PostCSS 配置冲突产生稳定错误。

现有库模式 PostCSS 隔离测试继续验证：默认构建不读取项目根目录的
`postcss-pxtorem`，但显式 Vite PostCSS 配置仍可按需启用。

## 验收标准

- 不配置 `cssScope` 的库产物字节语义保持原有行为。
- 配置 `cssScope` 的库 CSS 不再匹配作用域容器外的普通 DOM。
- 使用方可仅通过外层容器启用样式，无需改写组件模板或引入运行时代码。
- 包级测试、类型检查、Oxlint 和 Oxfmt 通过。
