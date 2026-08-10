# Miko v1 兼容性与发布集合

本文记录 Miko v1 的公开包集合、内部依赖边、运行时边界和发布前验证证据。日期：2026-08-10。

## 发布集合

8 个公开包统一使用 `1.0.0`：

| 包                                       | v1 前版本 | v1 内部依赖                             |
| ---------------------------------------- | --------: | --------------------------------------- |
| `@minar-kotonoha/miko-cli`               |  `0.1.30` | framework、vite-plugin-miko             |
| `@minar-kotonoha/framework`              |   `0.1.8` | linter                                  |
| `@minar-kotonoha/linter`                 |   `0.1.3` | 无                                      |
| `@minar-kotonoha/to-miko`                |   `0.1.3` | 无                                      |
| `@minar-kotonoha/vite-plugin-bootstrap`  |   `0.1.3` | 无                                      |
| `@minar-kotonoha/vite-plugin-external`   |   `0.1.9` | 无                                      |
| `@minar-kotonoha/vite-plugin-index-html` |   `0.1.5` | 无                                      |
| `@minar-kotonoha/vite-plugin-miko`       |  `0.2.32` | linter、bootstrap、external、index-html |

仓库中的公开内部依赖继续使用 `workspace:^`。Bun publish dry-run 必须把它们改写为实际 `^1.0.0`；Vite 的 `catalog:` 也必须改写为实际版本。

私有 workspace：

| Workspace                     | 状态                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `@minar-kotonoha/create-miko` | 保持 `private: true`；版本标记为 `1.0.0`；直接依赖 `miko-cli@^1.0.0` 和 `linter@^1.0.0` |
| `@minar-kotonoha/performance` | 保持 `private: true` 且不设置版本；内部依赖保持 `workspace:^`                           |

Starter 不再直接依赖 `@minar-kotonoha/framework` 或 `@minar-kotonoha/vite-plugin-miko`。零配置应用由 CLI 自己的依赖闭包运行；只有显式配置 CDN 或需要在项目配置中导入类型/API 时，应用才添加相应直接依赖。

## 工具链边界

| 范围                                    | v1 合同                        | 证据                                                                                |
| --------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| 包安装、workspace、lockfile、脚本和发布 | Bun 1.3.x                      | 本轮使用 Bun 1.3.14；根 `packageManager` 固定 Bun                                   |
| 分发 CLI                                | Node.js + jiti                 | `packages/cli/miko` 由 Node shebang 启动并通过 jiti 加载 TypeScript                 |
| Node.js 20                              | Node.js 20.19 及同系列兼容版本 | 使用 Bun 下载的 `v20.19.0` 二进制运行真实 `miko doctor --root app --json`，退出码 0 |
| Node.js 22+                             | Node.js 22.12+                 | 使用 Bun 下载的 `v22.12.0` 二进制运行相同 Doctor，退出码 0                          |
| 应用运行时                              | 不依赖 Bun runtime API         | 发布源码扫描 `Bun.*`、`from 'bun'` 和 `bun:`；不得出现匹配                          |

当前开发机的 Node.js 25.7.0 也满足 `>=22.12.0`，但最低版本兼容性以 20.19.0 和 22.12.0 的精确 smoke 为准。

## 渲染与浏览器

| 能力     | v1 合同                                                        |
| -------- | -------------------------------------------------------------- |
| SPA      | `miko.rendering: 'spa'`；纯静态资产部署，不增加生产 SSR Server |
| SSG      | 默认；服务端执行只发生在构建期                                 |
| 现代构建 | 默认不加载 Legacy 插件，不生成 polyfill                        |
| Legacy   | Browserslist 或 `miko.legacyPluginOptions` 显式/确定性启用     |
| 应用依赖 | 默认由 Vite 正常打包                                           |
| CDN      | 只有 `miko.externalOptions.frameworkCDN` 提供 URL 时启用       |
| HTML     | 项目 root 始终真实；缺少物理 `index.html` 时使用内存入口       |
| 白屏保护 | 默认启用独立监控；静态检查和浏览器 Check 同时验证              |

## Windows 浏览器检查

Miko Check、Starter Playwright 和 Vitest Browser Mode 使用 `127.0.0.1`，不依赖 `localhost` 的 IPv4/IPv6 解析。375×812 Chromium 检查覆盖 ready 标记、残留 `v-cloak`、页面错误、hydration 警告、失败面板和入口资源请求。

## 发布内容约束

每个公开包必须通过：

```sh
bun publish --dry-run --ignore-scripts --registry https://registry.npmjs.org/ --access public
```

必须包含：

- CLI 的 Check、Doctor、Migrate、静态校验、浏览器检查和类型检查入口
- Miko 的 config、capabilities、plugins、SSG 和 template
- HTML 插件的内存入口和白屏监控
- to-miko 的 Skill 与全部 references
- framework、linter、bootstrap 和 external 的公开运行时文件

不得包含：

- `*.test.ts`
- fixtures、测试截图或性能结果
- `.omc`、`.remember`
- 日志、临时环境文件或构建缓存

本提交只准备元数据和 dry-run 证据，不执行真实 publish 或 push。
