# 常见差异及处理

## 1. Hash history 与 SSG

SSG 需要可预渲染的 HTML5 路由。优先将 `createWebHashHistory()` 迁为文件系统路由和 HTML5 history。

如果宿主协议必须使用 hash，明确切换为 SPA：

```ts
export default {
  miko: {
    rendering: 'spa',
  },
};
```

切换渲染模式不能省略深路由、刷新、宿主跳转和回退验证。

## 2. HTML 注入

Meta、title、link 和结构化数据优先迁到 Unhead：

```ts
useHead({
  title: '行情',
  meta: [{ name: 'app-id', content: 'sec-market' }],
});
```

需要在 HTML 解析前运行的脚本、CSP nonce 或非标准转换，应先确认 Miko 的 HTML hook 和 `vite` 配置能否表达。不能表达时标记为人工阻塞项，不保留第二个构建入口。

## 3. 自定义 Vite 插件

先判断插件是否已被 Miko 内置能力替代。确实需要保留时，检查它与 Vue、Router、Runtime、HTML、Legacy 和 CDN 插件的顺序及 hook 冲突，再人工放入 `miko.config.ts`：

```ts
export default {
  vite: {
    plugins: [customPlugin()],
  },
};
```

自动迁移器不会猜测插件顺序。包含自定义插件的旧配置应产生人工处理项。

## 4. `src/` 目录

Miko 默认以项目根目录为 `@`：

- `src/pages/` → `pages/`
- `src/components/` → `components/`
- `src/stores/` → `stores/`
- `src/composables/` → `composables/`
- `src/api/` → `api/`
- `src/utils/` → `utils/`

移动后检查所有 alias、动态 import、CSS URL 和测试路径。业务项目也可以通过 `vite.resolve.alias` 保留其他必要 alias。

## 5. Pinia

检测到 `pinia` 直接依赖后，Miko 自动安装唯一实例并处理 SSG 状态。删除入口中重复的 `createPinia()` 和手工 hydration，但保留 store 定义和业务调用。

如果业务依赖自定义 Pinia 插件，确认能够取得 Miko 创建的实例；不能重复安装第二个实例。

## 6. Wujie 等微前端

保留宿主约定的 mount、unmount、路由同步、通信和缓存行为。只迁移构建入口，不借迁移删除业务生命周期。

SPA/SSG 选择必须与宿主 URL 和加载方式一致，并在真实主应用中验证。

## 7. Vue Router 版本和路由语义

文件系统路由替代手工路由表，但以下语义必须逐项保留：

- path、name、meta、alias、redirect
- 动态参数、可选参数、嵌套路由和 404
- beforeEach/afterEach 等守卫
- scrollBehavior、base 和宿主同步

仅“页面能打开”不足以证明路由迁移完成。

## 8. CSS 预处理器

Miko 不强制把 SCSS 改成 Less。源码仍使用 Sass 特性时保留 `sass` 直接依赖；只删除已经没有 import 的构建依赖。

UnoCSS 根据根目录配置或直接依赖自动启用。保留项目 `uno.config.*`，必要时通过 `miko.unoCSSPluginOptions` 覆盖选项。

## 9. Legacy 与 CDN

默认现代构建、应用内打包：

- 旧浏览器目标由 Browserslist 或 `miko.legacyPluginOptions` 决定。
- 只有 `miko.externalOptions.frameworkCDN` 提供 URL 时才启用 CDN。
- 不要为了兼容旧项目默认开启 Legacy 或 CDN。

## 10. Proxy 和 TLS

旧代理迁到 `vite.server.proxy`，Preview 特有规则放 `vite.preview.proxy`。函数、RegExp、Agent 和 configure 回调可以保留。

不要自动注入 `secure: false` 或 `rejectUnauthorized: false`。TLS 行为必须来自项目明确配置。

## 11. 环境变量

保留 `.env`、`.env.local` 和 `.env.<mode>`。CLI 使用：

```sh
miko dev --env test
miko build --env test
```

检查环境变量是否仅在客户端使用 `VITE_` 前缀，且 SSG 构建期和浏览器运行时取值一致。

## 12. Monolith 或多应用合并

跨应用源码合并、自定义模块解析和多入口构建通常包含 Miko 所有权 input。不要自动降级为一个近似配置；先拆清应用边界，或将其标记为暂不支持的人工迁移。
