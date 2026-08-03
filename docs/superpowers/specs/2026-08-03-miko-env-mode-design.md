# miko 构建/开发命令支持指定环境（--env）设计

日期：2026-08-03
状态：已批准

## 背景与问题

当前 `miko build` 在 `packages/cli/build.ts` 中把 vite `mode` 写死为 `'production'`，
`miko dev` 写死为 `'development'`，且没有把 mode 传递给 vite 构建配置。
因此无法针对测试环境打包（无法加载 `.env.test`、`import.meta.env.MODE` 恒为
production）。需求：支持打测试包，并支持开发时加载测试环境变量。

## 目标

- `miko build --env <name>` 按指定环境构建，自动加载 `.env.<name>`，产物输出到 `dist/`
- `miko dev --env <name>` 开发服务器加载对应环境变量
- 不传 `--env` 时行为与现状完全一致（build=production、dev=development）
- `import.meta.env.MODE` / `VITE_*` 变量按 Vite 原生 mode 语义生效

## 非目标

- 不为不同环境拆分输出目录（测试构建直接覆盖 `dist/`）
- 不支持 `miko preview --env`（预览只是静态服务，环境在构建期已固化）
- 不修改 vite-plugin-miko 插件包

## 方案选型

选定方案：CLI 解析 `--env` 并映射为 Vite mode（方案 1）。

备选方案 2（插件内 loadEnv 集中处理）会要求改插件包并重新发包，成本高；
方案 3（只加载 .env 文件、不改 mode）导致 `import.meta.env.MODE` 语义错误，被否决。

## 设计细节

### CLI 语法

- `miko build --env test` 或 `miko build --env=test`
- `miko dev --env test` 或 `miko dev --env=test`
- 缺省：build → mode `production`；dev → mode `development`

### 改动点

1. `packages/cli/index.ts`
   - 用 yargs-parser 解析 `--env`
   - 校验 env 名：仅允许 `[A-Za-z0-9_-]+`，防止路径穿越；非法值直接报错退出
   - 设置 `process.env.MIKO_MODE = env`
   - 环境变量加载顺序：先 `dotenv.config({ path: .env.<env>, override: true })`（环境文件优先），
     再 `dotenv.config()`（.env 兜底，不覆盖已存在变量）；无 `--env` 时保持现状只加载 `.env`
2. `packages/cli/build.ts`
   - `const mode = process.env.MIKO_MODE || 'production'`
   - 传给 `miko({ command: 'build', mode, ... })`
   - 显式传给 `viteSsgBuild(undefined, { configFile: false, mode, ...config })`，
     让 vite 按 mode 加载 `.env.<mode>` 并注入 `import.meta.env`
3. `packages/cli/dev.ts`
   - `const mode = process.env.MIKO_MODE || 'development'`
   - 传给 `miko({ command: 'serve', mode, ... })` 和 `createServer({ configFile: false, mode, ...config })`

### 环境文件约定

- 用户在项目根目录（cwd）放置 `.env.test`，内容为测试环境的 `VITE_*` 变量
- 仓库 `app/` 下提供 `.env.test.example` 示例（含注释）

### 错误处理

- `.env.<env>` 不存在：不报错（与 Vite 行为一致），仅提示一行日志
- `--env` 重复传值：取最后一个字符串值

## 验证

1. `cd app && npx miko build --env test`：检查 `dist/` 产物中测试变量被正确替换、
   `import.meta.env.MODE === 'test'`（在产物中检索模式标记）
2. `cd app && npx miko build`：产物仍为 production 语义，无回归
3. `cd app && npx miko dev --env test`：启动日志与请求验证环境生效
4. 非法 env 名（如 `--env ../x`）：CLI 报错并退出

## 文件改动清单

- `packages/cli/index.ts`（修改）
- `packages/cli/build.ts`（修改）
- `packages/cli/dev.ts`（修改）
- `app/.env.test.example`（新增）
- `CLAUDE.md` / `AGENTS.md`（常用命令文档更新）
- `docs/superpowers/specs/2026-08-03-miko-env-mode-design.md`（本文档）