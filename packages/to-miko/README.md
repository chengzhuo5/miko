# @minar-kotonoha/to-miko

将任意 Vue 3 + Vite 项目迁移到 [miko](https://github.com/minar-kotonoha/miko) 架构的 Claude Code skill。

## 安装

```sh
# 通用（所有支持 Agent Skills 标准的 agent）
bun add -D @minar-kotonoha/to-miko
npx agents export                        # 自动检测 agent 类型

# Claude Code
claude skills install @minar-kotonoha/to-miko

# 或手动
npm i @minar-kotonoha/to-miko
```

支持的 agent：Claude Code · Cursor · Codex · Copilot · OpenCode · Windsurf · Goose · Amp

## 用法

在 Claude Code 中说：

```
帮我把这个项目迁移到 miko
```

Skill 会自动：
1. **分析源项目** — 通读 vite.config.ts、router、入口文件、package.json
2. **分流决策** — 对比 Vite 配置模式 vs CLI 模式，检查兼容性
3. **执行迁移** — 创建 miko.config.ts、改造路由为文件系统路由、重写入口为 bootstrap、更新依赖
4. **验证** — `miko build` 构建 + Playwright 截图对比

## 硬前提

- Vue 3 + Vite 项目
- 接受文件系统路由（vue-router/auto-routes）
- 接受 SSG 为默认生产构建方式（可显式禁用）

## 许可证

MIT
