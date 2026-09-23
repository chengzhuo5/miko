# Deep Interview Spec: miko-migration Skill

## Metadata
- Interview ID: `migration-skill-2026-07-28`
- Rounds: 8
- Final Ambiguity Score: 7.1%
- Type: brownfield
- Generated: 2026-07-28T00:00:00Z
- Threshold: 0% (source: C:\Users\cheng\.claude\settings.json)
- Initial Context Summarized: no
- Status: PASSED (early exit — user signaled readiness at Round 8)

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.332 |
| Constraint Clarity | 0.92 | 0.25 | 0.230 |
| Success Criteria | 0.90 | 0.25 | 0.225 |
| Context Clarity | 0.95 | 0.15 | 0.143 |
| **Total Clarity** | | | **0.929** |
| **Ambiguity** | | | **7.1%** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| Miko架构知识库 | active | 结构化映射表（插件→配置→文件转换），供自动化脚本和人工引用 | references/ 下 4 个文件覆盖 |
| 双路径迁移流程 | active | 用户到达时先分流：Vite配置模式（defineMikoConfig嵌入）vs CLI模式（miko dev/build） | 优劣对比表 + 决策树 |
| 自动化迁移辅助 | active | 检测源项目 → 生成配置 → 迁移路由 → 扫描问题 → Playwright验证 | 含自动化验证（原验证清单已合并） |
| ~~验证检查清单~~ | ~~merged~~ | 已合并入自动化迁移辅助——Playwright 自动截图对比 | — |

## Goal
编写一个 Claude Code skill (`miko-migration`)，将任意 Vue 3 + Vite 项目迁移到 miko 架构。Skill 提供三个层次的能力：

1. **决策层**：帮用户判断是否应该迁移——对比 Vite 配置模式 vs CLI 模式优劣，检查项目对 miko 硬假设（文件系统路由 + SSG）的兼容性
2. **执行层**：逐步引导用户完成迁移——创建 `miko.config.ts`、改造路由为文件系统路由、改造入口为 bootstrap 模式、替换/删除 `vite.config.ts`、适配 SSG
3. **自动化层**：机器能做的事不让人做——检测源项目结构、生成 `miko.config.ts`、迁移已有路由到 `pages/`、扫描需手动处理的问题、Playwright 验证

## Constraints
- **硬前提（不可妥协）**：
  - 文件系统路由（`vue-router/auto-routes` + `vite-plugin-vue-layouts-next`）
  - SSG 优先（`vite-ssg`，生产构建默认 SSG）
- **软约束（用户决策，skill 提供推荐）**：
  - Hash history → 推荐改为 HTML5 history（SSG 兼容），但用户可保留 hash（需禁用 SSG）
  - `htmlInjectPlugin` 等自定义插件 → 推荐用 `useHead` 替代元数据注入
  - wujie 微前端 → 保留，不参与 miko 迁移
  - `@sec/*` workspace 依赖 → 直接保留
- **可选功能（完全 opt-out）**：
  - Bun 运行时（已改为 preferred-but-optional，jiti 回退）
  - CDN 外部化（需要 `external.frameworkCDN` 时才启用）
  - Pinia（bootstrap 模板已兼容）
  - UnoCSS（可设 `false`）

## Non-Goals
- 不迁移 wujie 微前端架构（`@sec/*` 依赖保留原样）
- 不处理 monolith 项目（多子应用合并的特殊结构）
- 不迁移非 Vue 3 或非 Vite 项目
- 不替代用户的 CI/CD 流程

## Acceptance Criteria
- [ ] Skill 文件位于 `.claude/skills/miko-migration/SKILL.md`
- [ ] `references/` 包含 4 个数据文件：`plugin-map.json`、`migration-steps.md`、`route-migration.md`、`common-diffs.md`
- [ ] Skill 到达时先展示双路径对比表，引导用户选择 Vite 配置模式或 CLI 模式
- [ ] 自动化迁移脚本能：检测源项目结构 → 生成 `miko.config.ts` → 迁移手动路由到 `pages/`（含 `<route>` SFC block）→ 改造入口为 bootstrap 模式 → 更新 `package.json` scripts 和 deps
- [ ] 迁移后验证使用 Playwright：`miko build` 构建通过 + 关键页面截图对比
- [ ] 以 `D:\Code\CMS\trading-business-h5\apps\market` 为验收项目，迁移后 `miko build` 成功，页面渲染与迁移前一致
- [ ] `defineMikoConfig()` 支持接受参数（`MikoUserConfig` 覆盖 + Vite `UserConfig` 合并），使 Vite 配置模式不再是空壳
- [ ] Bun 改为 optional——CLI 优先使用 bun，不可用时 jiti 回退（`packages/cli/miko` 已改造）

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 迁移需要人工验证清单 | "任何东西都可以自动化，HTML验证用Playwright" | 验证清单合并入自动化迁移辅助，全部用 Playwright 自动化 |
| Bun 是硬依赖 | "改造成脱离强假设" | Bun 改为 preferred-but-optional，CLI 加入 jiti 回退（已实现） |
| `defineMikoConfig` 不需要参数 | "vite.config 下只有一个 defineMikoConfig 不如没有" | 需要支持参数传递，接受 MikoUserConfig + Vite UserConfig |
| references 数据应嵌入 SKILL.md | "前者"（放 references/ 目录） | 结构化 JSON/MD 独立存放 |
| 验证只需冒烟测试 | "拿其他项目试试" | 以 market 为真实验收目标 |
| Hash history 需要保留 | "推荐HTML5 history，SSG是最大优势" | 用户决策，skill 推荐 HTML5 history |

## Technical Context
### Miko 架构（已完整映射）
- **插件链**：VueMacros → vueDevTools → Layouts → Linter → Legacy → Components → UnoCSS → Bootstrap → External → IndexHTML → Janus
- **虚拟模块**：`virtual:bootstrap`（bootstrap 入口）、`virtual:index`（HTML 入口）、`virtual:generated-layouts`、`virtual:uno.css`
- **配置系统**：`MikoUserConfig` 18+ 类型接口，`resolveConfig()` 深度合并，`defineMikoConfig()` 异步工厂
- **CLI**：`miko dev/build/preview`，`--lib` 库模式，`jiti` Node 回退

### 迁移目标项目结构
- **仓库**：`D:\Code\CMS\trading-business-h5\apps\`
- **已迁移**：`self-stock`（参考实现）
- **未迁移**：`market`（验收目标）、`trade`、`shell`、`monolith`（特殊情况不迁移）
- **共享基建**：`../../vite/config/create-app-config`（vue + AutoImport + Components + UnoCSS + htmlInjectPlugin + proxy + alias）
- **路由模式**：全部使用 `createWebHashHistory`（受限于银行 APP 内嵌环境）

### 源码改造（本次对话已完成）
- `packages/cli/miko`：bun-first, jiti-fallback 替代硬编码的 `spawnSync('bun', ...)`

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Miko架构知识库 | core domain | 插件链, 配置类型, 虚拟模块, 模板结构 | 被 双路径迁移流程 和 自动化迁移辅助 引用 |
| 双路径迁移流程 | core domain | Vite配置模式, CLI模式, 优劣对比表, 决策树 | 分流到 自动化迁移辅助 |
| 自动化迁移辅助 | core domain | 结构检测, 配置生成, 路由迁移, Playwright验证 | 读取 插件映射表, 路由迁移规则 |
| 插件映射表 | supporting | createAppConfig→miko等价物, 三态(替换/适配/保留) | 属于 Miko架构知识库 |
| 路由迁移规则 | supporting | 手动路由→文件系统路由, <route> block, 动态/嵌套/catch-all | 被 自动化迁移辅助 读取 |
| defineMikoConfig | core domain | 参数支持, MikoUserConfig, UserConfig合并 | Vite配置模式 的入口 |
| 文件系统路由 | constraint | vue-router/auto-routes, pages/ 目录 | miko 硬前提 |
| SSG | constraint | vite-ssg, beastiesOptions, HTML5 history 推荐 | miko 硬前提 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 5 | 1 | 0 | 4 | 80% |
| 3 | 5 | 0 | 0 | 5 | 100% |
| 4 | 6 | 1 | 0 | 5 | 83% |
| 5 | 6 | 0 | 0 | 6 | 100% |
| 6 | 6 | 0 | 0 | 6 | 100% |
| 7 | 7 | 1 | 0 | 6 | 86% |
| 8 | 8 | 1 | 0 | 7 | 88% |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 1
**Q:** 两个模式之间的实际差异到底有多大？CLI 模式到底比 Vite 配置模式多提供了什么？
**A:** 目前的 vite 配置有问题——`defineMikoConfig` 不提供参数，导致 vite.config 下只有一个空调用，还不如没有这个文件。
**Ambiguity:** 60.9%

### Round 2
**Q:** miko 的哪些假设是不可妥协的硬前提？
**A:** 1（文件系统路由）、2（SSG）是强假设，其他可以随便。要求改造源码让 Bun 也脱离强假设。
**Ambiguity:** 44.4%

### Round 3
**Q:** 迁移 skill 的三层交付物（决策层/执行层/自动化层）合理吗？
**A:** 好。
**Ambiguity:** 26.8%

### Round 4 (Contrarian)
**Q:** 如果自动化迁移脚本已经做了所有该做的，验证清单是不是多余的？
**A:** 任何东西都可以自动化，HTML 验证应该用 Playwright。
**Ambiguity:** 22.5%

### Round 5
**Q:** references/ 数据放 JSON 还是直接写在 SKILL.md？
**A:** 前者（references/ 目录）。
**Ambiguity:** 17.4%

### Round 6 (Simplifier)
**Q:** 最少需要跑通几个真实项目来证明 skill 有效？
**A:** `D:\Code\CMS\trading-business-h5\apps` 下只迁移了 self-stock，拿其他项目试试并参考 self-stock 思路。
**Ambiguity:** 14.5%

### Round 7 (Ontologist)
**Q:** `htmlInjectPlugin` 和 `createWebHashHistory` 是迁移阻塞点，如何处理？
**A:** 让用户决定，推荐改成 HTML5 history（SSG 是最大优势）。
**Ambiguity:** 9.5%

### Round 8
**Q:** references/ 四个文件够不够？
**A:** 你觉得够了就行。
**Ambiguity:** 7.1%

</details>
