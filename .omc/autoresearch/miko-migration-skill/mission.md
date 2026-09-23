# Mission: miko-migration-skill

## Goal
编写一个 Claude Code skill，将任意 Vue 3 + Vite 项目迁移到 miko 架构。

## Scope
- Skill 位置：`.claude/skills/miko-migration/`
- 三层能力：决策层（双路径对比+兼容性检查）、执行层（逐步迁移清单）、自动化层（结构检测+配置生成+路由迁移+Playwright验证）
- 结构化数据：`references/` 下 4 个文件

## Constraints
- 硬前提：文件系统路由 + SSG
- 软约束让用户决策，skill 提供推荐
- 自动化优先 — 能机器做的事不让人做

## Target
- 验收项目：`D:\Code\CMS\trading-business-h5\apps\market`
- 参考实现：`D:\Code\CMS\trading-business-h5\apps\self-stock`
