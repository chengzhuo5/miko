# miko --env 环境选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `miko build --env <name>` / `miko dev --env <name>` 支持指定环境，自动加载 `.env.<name>` 并映射为 Vite mode；不传 `--env` 时行为与现状完全一致。

**Architecture:** CLI 层新增 `packages/cli/env.ts` 纯函数模块（参数校验 + mode 解析 + env 文件加载），`index.ts` 解析 `--env` 后写入 `MIKO_MODE`，`build.ts`/`dev.ts` 读取该值并把 `mode` 显式传给 miko 配置工厂与 Vite 的 inline config。环境文件优先级：`.env.<env>` > `.env`。

**Tech Stack:** TypeScript、Node.js、yargs-parser、dotenv、Vite（mode 语义）、Vitest（单元测试）。

**前置说明：** 仓库工作区有大量与本次任务无关的未提交改动；每个任务只提交本任务涉及的文件，不触碰其他改动。本计划在当前工作区执行（不另开 worktree）。

---

### Task 1: 新增 env.ts 纯函数模块（TDD）

**Files:**
- Create: `packages/cli/env.ts`
- Test: `packages/cli/env.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/cli/env.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { normalizeEnvArg, resolveMode } from './env';

describe('normalizeEnvArg', () => {
  it('未传值时返回 undefined', () => {
    expect(normalizeEnvArg(undefined)).toBeUndefined();
    expect(normalizeEnvArg(null)).toBeUndefined();
    expect(normalizeEnvArg('')).toBeUndefined();
  });

  it('合法字符串原样返回', () => {
    expect(normalizeEnvArg('test')).toBe('test');
    expect(normalizeEnvArg('staging-2')).toBe('staging-2');
  });

  it('重复传值时取最后一个', () => {
    expect(normalizeEnvArg(['test', 'staging'])).toBe('staging');
  });

  it('非法字符抛错', () => {
    expect(() => normalizeEnvArg('../x')).toThrow(/非法 --env/);
    expect(() => normalizeEnvArg('a b')).toThrow(/非法 --env/);
  });
});

describe('resolveMode', () => {
  it('build 缺省 production', () => {
    expect(resolveMode(undefined, 'build')).toBe('production');
  });

  it('serve 缺省 development', () => {
    expect(resolveMode(undefined, 'serve')).toBe('development');
  });

  it('指定 --env 后覆盖默认值', () => {
    expect(resolveMode('test', 'build')).toBe('test');
    expect(resolveMode('test', 'serve')).toBe('test');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（仓库根目录）: `npx vitest run packages/cli/env.test.ts`
Expected: FAIL，报错内容包含 `Cannot find module './env'` 或类似模块不存在错误。

- [ ] **Step 3: 实现 env.ts**

创建 `packages/cli/env.ts`：

```ts
/**
 * `--env` 参数解析与 `.env.<env>` 加载。
 * 纯函数（normalizeEnvArg / resolveMode）可单测；loadEnvFiles 负责 dotenv 接线。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const ENV_NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 归一化 yargs 解析出的 --env 值。
 * 未传/空值返回 undefined；重复传值取最后一个；非法字符抛错（防路径穿越）。
 */
export function normalizeEnvArg(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value[value.length - 1] : String(value);
  if (!ENV_NAME_RE.test(raw)) {
    throw new Error(`非法 --env 值: "${raw}"（仅允许字母/数字/-/_）`);
  }
  return raw;
}

/**
 * 根据命令与 --env 解析最终 vite mode。
 * build 缺省 production，serve 缺省 development。
 */
export function resolveMode(envArg: string | undefined, command: 'build' | 'serve'): string {
  return envArg ?? (command === 'build' ? 'production' : 'development');
}

/**
 * 加载环境变量文件：先 .env.<env>（override: true，优先级高），再 .env 兜底（不覆盖已有变量）。
 * 无 --env 时仅加载 .env，与现状一致。.env.<env> 不存在时仅提示，不报错。
 */
export function loadEnvFiles(
  envArg: string | undefined,
  log: (msg: string) => void = console.log,
): void {
  if (envArg) {
    const envPath = `.env.${envArg}`;
    const result = dotenv.config({ path: envPath, override: true });
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        log(`[miko] 提示: 未找到 ${envPath}，仅使用 .env 中的变量`);
      } else {
        throw result.error;
      }
    }
  }
  dotenv.config();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run（仓库根目录）: `npx vitest run packages/cli/env.test.ts`
Expected: PASS（3 个 describe / 7 个 it 全部通过）。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/env.ts packages/cli/env.test.ts
git commit -m "feat(cli): add --env parsing helpers with unit tests"
```

---

### Task 2: index.ts 解析 --env 并写入 MIKO_MODE

**Files:**
- Modify: `packages/cli/index.ts`

- [ ] **Step 1: 修改 index.ts**

将 `packages/cli/index.ts` 整体替换为：

```ts
#!/usr/bin/env node
import parser from 'yargs-parser';
import { normalizeEnvArg, loadEnvFiles } from './env.ts';

const { _, lib, env } = parser(process.argv.slice(2));
if (_.length === 0) {
  console.log('请指定命令');
  process.exit(1);
}
if (lib) process.env.MIKO_LIB_MODE = '1';

let envArg: string | undefined;
try {
  envArg = normalizeEnvArg(env);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
if (envArg) {
  process.env.MIKO_MODE = envArg;
}
loadEnvFiles(envArg);

await import(`./${_[0]}.ts`);
```

说明：原来的顶层 `dotenv.config()` 移到 `loadEnvFiles` 内统一处理；无 `--env` 时 `loadEnvFiles(undefined)` 仅加载 `.env`，行为不变。

- [ ] **Step 2: 静态检查**

Run（仓库根目录）: `npx oxlint packages/cli/index.ts`
Expected: PASS，无报错。

- [ ] **Step 3: 回归验证 --env 校验**

Run: `node packages/cli/index.ts build --env ../x`
Expected: 输出 `非法 --env 值: "../x"（仅允许字母/数字/-/_）`，退出码 1（注意：本步只验证校验分支，build 不会真正执行）。

- [ ] **Step 4: 提交**

```bash
git add packages/cli/index.ts
git commit -m "feat(cli): parse --env flag and load .env.<env>"
```

---

### Task 3: build.ts / dev.ts 使用 mode

**Files:**
- Modify: `packages/cli/build.ts`
- Modify: `packages/cli/dev.ts`

- [ ] **Step 1: 修改 build.ts**

在 `packages/cli/build.ts` 顶部 import 区追加：

```ts
import { resolveMode } from './env';
```

在 `const isLib = process.env.MIKO_LIB_MODE === '1';` 之后追加：

```ts
const mode = resolveMode(process.env.MIKO_MODE, 'build');
```

将 SSG 分支中的两处写死的 `'production'` 替换为变量 `mode`：

```ts
const config = miko({ command: 'build', mode, isPreview: false, isSsrBuild: false });
await viteSsgBuild(undefined, { configFile: false, mode, ...config });
```

（lib 分支保持不变。）

- [ ] **Step 2: 修改 dev.ts**

在 `packages/cli/dev.ts` 顶部 import 区追加：

```ts
import { resolveMode } from './env';
```

将模式相关行改为：

```ts
const mode = resolveMode(process.env.MIKO_MODE, 'serve');
const config = miko({ command: 'serve', mode, isPreview: false, isSsrBuild: false });
const server = await createServer({ configFile: false, mode, ...config });
```

- [ ] **Step 3: 静态检查两个文件**

Run（仓库根目录）: `npx oxlint packages/cli/build.ts packages/cli/dev.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add packages/cli/build.ts packages/cli/dev.ts
git commit -m "feat(cli): pass --env mode into build and dev"
```

---

### Task 4: 示例环境文件与文档

**Files:**
- Create: `app/.env.test.example`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 创建 app/.env.test.example**

创建 `app/.env.test.example`：

```
# 测试环境变量示例 —— 复制为 .env.test 后按需修改
VITE_APP_NAME=Miko_H5_Test
VITE_LIB_VERSION=1.0.0
# 测试环境接口地址（示例）
# VITE_API_BASE=https://test-api.example.com
# 测试环境 CDN（示例）
# VITE_FRAMEWORK_CDN=https://unpkg.com/@minar-kotonoha/framework@1.0.0/dist/framework.umd.js
```

- [ ] **Step 2: 更新 CLAUDE.md / AGENTS.md 常用命令**

在两个文件的 `# 库构建（输出 ESM + CJS + 类型声明）` 一行之后追加：

````markdown
# 指定环境构建（加载 .env.test，产物输出 dist/）
npx miko build --env test

# 指定环境开发（加载 .env.test）
npx miko dev --env test
````

- [ ] **Step 3: 提交**

```bash
git add app/.env.test.example CLAUDE.md AGENTS.md
git commit -m "docs: add --env usage docs and test env example"
```

---

### Task 5: 集成验证

**Files:** 无（只运行命令验证）

- [ ] **Step 1: 准备测试环境变量**

创建 `app/.env.test`（仅用于验证，验证后可删除或保留为真实配置）：

```
VITE_APP_NAME=Miko_H5_Test
VITE_LIB_VERSION=9.9.9
```

- [ ] **Step 2: 构建测试包**

Run: `cd app && npx miko build --env test`
Expected: 构建成功；`dist/` 产物中检索到 `framework@9.9.9`（证明 `.env.test` 的 VITE_LIB_VERSION 生效）。
检查方式: `rg -n "framework@9.9.9" dist` 有命中。

- [ ] **Step 3: 回归生产构建**

Run: `cd app && npx miko build`
Expected: 构建成功；`dist/` 产物中检索到 `framework@1.0.0`（来自 `.env`，证明默认行为未回归）。
检查方式: `rg -n "framework@1.0.0" dist` 有命中。

- [ ] **Step 4: 开发服务器指定环境**

Run: `cd app && npx miko dev --env test`（后台启动，观察 10 秒）
Expected: dev server 正常启动并打印 URL；随后关闭进程（Ctrl+C / Stop-Process）。

- [ ] **Step 5: 非法环境名校验**

Run: `cd app && npx miko build --env ../x`
Expected: 输出 `非法 --env 值: "../x"（仅允许字母/数字/-/_）`，退出码 1，不执行构建。

- [ ] **Step 6: 收尾提交（如有验证临时文件需清理）**

若 `.env.test` 仅为验证而建且用户不需要，删除它；否则保留。无需提交新代码。

---

## Self-Review

- 覆盖度：spec 的 CLI 语法 / env 加载顺序 / build+dev / 产物 dist / 默认行为 / 错误处理 全部有对应任务。
- 占位符：无 TBD/TODO，所有代码块完整。
- 类型一致性：`normalizeEnvArg` / `resolveMode` / `loadEnvFiles` 在 Task 1 定义、Task 2/3 使用，签名一致；`MIKO_MODE` 在 index.ts 写入、build.ts/dev.ts 读取，一致。