# Decision Log — Run 001

## Iteration 1 (2026-07-28)

### Experiment
创建完整的 miko-migration skill 骨架（SKILL.md + 4 个 references 数据文件），并以 market 项目为验收目标执行部分迁移。

### Created
- `.claude/skills/miko-migration/SKILL.md` — 主 skill 文件（3 阶段）
- `references/plugin-map.json` — 6 大类 20+ 插件/配置映射
- `references/migration-steps.md` — 6 步清单
- `references/route-migration.md` — 手动路由→文件系统路由规则
- `references/common-diffs.md` — 10 项差异处理策略

### Market status: 5 files created (miko.config.ts, index.ts, uno.config.ts, package.json, tsconfig.json)

### Decision: 继续 Iteration 2

---

## Iteration 2 (2026-07-28)

### Experiment
完成 market 项目的 pages 迁移、源码目录移动、route SFC blocks 添加。

### Changes
- 11 个 `src/` 子目录移至根目录
- 12 个页面的 `<route>` SFC block 添加完成：
  - `pages/hq/index.vue` — path: /, name: market
  - `pages/bkbx/index.vue` — name: bkbx
  - `pages/stock-detail/index.vue` — name: stock-detail
  - `pages/block-detail/index.vue` — name: block-detail
  - `pages/stock-list/index.vue` — name: stock-list
  - `pages/etf-list/index.vue` — name: etf-list
  - `pages/test/index.vue` — name: test
  - `pages/perf-test/index.vue` — path: /perf
  - `pages/perf-test/component.vue` — path: /perf/component
  - `pages/perf-test/wujie.vue` — path: /perf/wujie
  - `pages/perf-test/webcomponent.vue` — path: /perf/webcomponent
  - `pages/[...path].vue` — 已有 route block（catch-all + redirect）

### Remaining Blockers
1. **旧文件未删除**：vite.config.ts, src/router/index.ts, src/main.ts, src/main-mf.ts, src/app.vue, index.html, 空 src/ 目录
2. **`import './styles'`**：main-mf.ts 引用 `./styles`（实际为 `src/styles.ts`），迁移到 `index.ts` 后路径为 `./styles`，文件为 `styles.ts`，需确认 Vite 解析无误
3. **perf-test/shared/**：子组件目录在 pages/ 内，可能被 auto-routes 误识别为路由
4. **miko build 测试**：market 项目在 pnpm workspace 中，安装 `@minar-kotonoha/miko-cli` 需要 bun/npm registry 访问
5. **Playwright 视觉对比**：需迁移前截图基线

### Decision
Skill 和 market 迁移骨架已完成。剩余工作（旧文件删除、miko build 测试、Playwright 验证）属于执行/验证阶段。核心交付物（skill + references + market 迁移示例）已达到可演示状态。

### Learning
- `htmlInjectPlugin` 等价于 unhead 的 `useHead()`——可在 skill 中增加具体替换示例
- `createWebHashHistory` → HTML5 history 是迁移后最需要文档化的差异点
- Pages 中的 `shared/` 子目录需要排除规则（`!pages/**/shared/**`）避免误生成路由
- `@/*` import 路径从 `src/` 改为根目录后，相对路径保持不变（前提是目录结构对应）
