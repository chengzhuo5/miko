# @minar-kotonoha/to-miko

将 Vue 3 + Vite 项目安全迁移到 Miko v1 的 Agent Skill。

Miko v1 只支持 CLI 入口：零配置项目不需要配置文件；需要覆盖约定时只使用根目录 `miko.config.ts`，并将配置分为 `{ miko, vite }`。源项目的构建配置用于分析，迁移完成后不再作为 Miko 入口。

## 安装

```sh
bun add -D @minar-kotonoha/to-miko
bunx agents export
```

支持 Claude Code、Cursor、Codex、Copilot、OpenCode、Windsurf、Goose 和 Amp。

## 工作流

1. 读取源项目的构建、路由、入口、HTML、环境变量、依赖和业务测试。
2. 记录 Git 基线，运行 `bunx miko migrate` 生成不写文件的计划。
3. 安全计划使用 `bunx miko migrate --write --check`；不安全计划人工迁入唯一 `miko.config.ts`。
4. 将手工路由迁为文件系统路由，保留业务 path、meta、守卫和微前端行为。
5. 运行 Doctor、构建、全路由 Check、类型检查、单元测试和 Playwright 回归。

## 硬约束

- Bun 是唯一包管理器。
- 分发 CLI 使用 Node.js + jiti，应用运行时不依赖 Bun API。
- SPA 与构建期 SSG 都支持，不增加生产 SSR Server。
- 默认现代构建和应用内打包；Legacy 与 CDN 是可选能力。
- 动态配置、自定义插件顺序和 Miko 所有权 input 不做猜测式自动迁移。
- `miko build` 成功不能替代真实路由、API、浏览器和业务规则验证。

完整流程见 [SKILL.md](./SKILL.md) 和 `references/`。

## 许可证

MIT
