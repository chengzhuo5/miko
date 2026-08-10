# Miko v1 Slice 4 Reliability, Migration, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Miko v1 with default white-screen protection, isolated `miko check`, safe `miko migrate`, a verified upgrade path, and release-ready package artifacts.

**Architecture:** Add one small boot protocol shared by an independent HTML monitor entry and the Vue runtime adapter. Reuse the existing resolved project, build, preview, manifest, and Doctor pipelines for static/browser verification; do not create a second configuration or plugin graph. Migration is a conservative source-to-source operation for the last supported pre-v1 format, dry-run by default and backed up before writes.

**Tech Stack:** Bun workspaces and scripts, Node.js + jiti CLI runtime, TypeScript, Vite 8/Rolldown, Vue 3/ViteSSG, Vitest, Playwright Chromium, parse5, Node standard library.

---

## Scope and file boundaries

The zero-config starter correction is already committed as `79dc1ea`: the tracked starter no longer contains `vite.config.ts` or `miko.config.ts`, and demo delays/debug output are removed.

New and changed files are grouped by responsibility:

- `packages/vite-plugin-miko/config/types.ts`, `resolve.ts`, and capability files own the typed `whiteScreen` option and its deterministic default.
- `packages/vite-plugin-index-html/white-screen.ts` owns the dependency-free browser boot state machine and failure-panel source.
- `packages/vite-plugin-index-html/index.ts` owns injection of the independent monitor entry before the application entry.
- `packages/vite-plugin-miko/plugins/runtime.ts` owns the Vue error/warning bridge and ready callback exposed through `virtual:miko-runtime`.
- `packages/vite-plugin-miko/template/App.vue` only signals successful first render; it does not own timeout or error UI.
- `packages/cli/static-check.ts` owns post-build filesystem/HTML validation.
- `packages/cli/check.ts` owns temporary output isolation, preview lifecycle, route selection, and browser smoke verification.
- `packages/cli/migrate/` owns discovery, source analysis, planning, backups, writes, and recovery notes.
- `packages/cli/args.ts`, `context.ts`, `run.ts`, and `errors.ts` expose the new commands and stable exit categories.
- `docs/migration-v1.md` and package READMEs own the supported upgrade contract and compatibility matrix.

The first v1 release does not add a production SSR server, application data API, general error-reporting SDK, custom router, or custom chunking strategy.

---

### Task 1: Add the default white-screen capability contract

**Files:**
- Modify: `packages/vite-plugin-miko/types.ts`
- Modify: `packages/vite-plugin-miko/config/types.ts`
- Modify: `packages/vite-plugin-miko/config/resolve.ts`
- Modify: `packages/vite-plugin-miko/capabilities/resolve.ts`
- Test: `packages/vite-plugin-miko/capabilities/resolve.test.ts`
- Test: `packages/vite-plugin-miko/config/resolve.test.ts`
- Test: `packages/cli/doctor.test.ts`

- [ ] **Step 1: Write failing capability tests**

Add tests with this public contract:

```ts
expect(resolveCapabilities({}, signals, env).whiteScreen).toMatchObject({
  enabled: true,
  source: 'builtin',
  value: { timeout: 8000 },
})

expect(resolveCapabilities({ whiteScreen: false }, signals, env).whiteScreen).toMatchObject({
  enabled: false,
  source: 'explicit',
  value: { timeout: 8000 },
})

expect(
  resolveCapabilities({ whiteScreen: { timeout: 3500 } }, signals, env).whiteScreen,
).toMatchObject({
  enabled: true,
  source: 'explicit',
  value: { timeout: 3500 },
})
```

Add resolver validation:

```ts
expect(() =>
  resolveProject({ miko: { whiteScreen: { timeout: 0 } } }),
).toThrow(/miko\.whiteScreen\.timeout/u)
```

Add a Doctor assertion that `whiteScreen` is reported as enabled with scalar value `8000`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/capabilities/resolve.test.ts packages/vite-plugin-miko/config/resolve.test.ts packages/cli/doctor.test.ts
```

Expected: failure because `WhiteScreenOptions` and `capabilities.whiteScreen` do not exist.

- [ ] **Step 3: Implement the minimal typed capability**

Add to `packages/vite-plugin-miko/types.ts`:

```ts
export interface WhiteScreenOptions {
  /**
   * 首次成功渲染前的最长等待时间，单位毫秒。
   * @default 8000
   */
  timeout?: number
}
```

Add `whiteScreen?: AutoOption<WhiteScreenOptions>` to `MikoOptions`, a resolved capability entry, and `whiteScreenOptions: WhiteScreenOptions | false` to `ResolvedMikoOptions`.

Resolve only one configurable field:

```ts
const defaultWhiteScreen = { timeout: 8000 }
const whiteScreen =
  raw.whiteScreen === false
    ? capability(false, defaultWhiteScreen, 'explicit', 'miko.whiteScreen 显式关闭')
    : raw.whiteScreen === undefined || raw.whiteScreen === true
      ? capability(
          true,
          defaultWhiteScreen,
          raw.whiteScreen === true ? 'explicit' : 'builtin',
          raw.whiteScreen === true
            ? 'miko.whiteScreen 显式启用'
            : '默认启用首次渲染白屏保护',
        )
      : capability(
          true,
          { ...defaultWhiteScreen, ...raw.whiteScreen },
          'explicit',
          'miko.whiteScreen 使用显式选项',
        )
```

Reject non-finite values or values below 1000 ms with `MIKO_CONFIG_INVALID` and field `miko.whiteScreen.timeout`.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same targeted command. Expected: all pass.

- [ ] **Step 5: Commit**

```sh
git add packages/vite-plugin-miko/types.ts packages/vite-plugin-miko/config packages/vite-plugin-miko/capabilities packages/cli/doctor.test.ts
git commit -m "feat(miko): define white-screen capability"
```

---

### Task 2: Build the independent boot monitor state machine

**Files:**
- Create: `packages/vite-plugin-index-html/white-screen.ts`
- Create: `packages/vite-plugin-index-html/white-screen.test.ts`
- Modify: `packages/vite-plugin-index-html/index.ts`
- Modify: `packages/vite-plugin-index-html/html.ts`
- Modify: `packages/vite-plugin-index-html/index.test.ts`
- Modify: `packages/vite-plugin-index-html/package.json`

- [ ] **Step 1: Write failing state-machine tests**

Define the generated browser protocol as:

```ts
interface MikoBootState {
  status: 'pending' | 'ready' | 'failed'
  errors: Array<{ code: string; detail?: string }>
  warnings: string[]
  ready(): void
  fail(code: string, detail?: string): void
}
```

Tests must execute the generated module in jsdom with fake timers and assert:

```ts
expect(root.dataset.mikoReady).toBeUndefined()
vi.advanceTimersByTime(8000)
expect(root.dataset.mikoFailed).toBe('MIKO_BOOT_TIMEOUT')
expect(document.querySelector('[data-miko-failure]')).not.toBeNull()
```

Also cover:

- `ready()` sets `data-miko-ready="true"`, removes `v-cloak`, clears the timer, and removes listeners.
- `window.error` for a failed script produces `MIKO_BOOT_RESOURCE`.
- `unhandledrejection` before ready produces `MIKO_BOOT_REJECTION`.
- events after ready do not replace the application.
- an existing `window.__MIKO_BOOT__` is reused, making duplicate monitor execution harmless.

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-index-html/white-screen.test.ts
```

Expected: module missing.

- [ ] **Step 3: Implement a dependency-free generated module**

Export:

```ts
export interface WhiteScreenMonitorOptions {
  enabled: boolean
  timeout: number
  development: boolean
}

export function createWhiteScreenMonitorModule(options: WhiteScreenMonitorOptions): string
```

The generated module must:

1. Return immediately on SSR or when disabled.
2. Install one `window.__MIKO_BOOT__` object.
3. Listen to `error` in capture mode and `unhandledrejection`.
4. Start one timeout.
5. Render a panel containing a safe error code and a reload button.
6. Include detailed text only when `development` is true.
7. Never report environment variables, URLs with query strings, stack traces, tokens, or arbitrary rejection objects in production.

Use DOM node creation plus text content; never use `innerHTML`.

- [ ] **Step 4: Inject the monitor as its own module entry**

Extend `IndexHTMLOptions`:

```ts
whiteScreen?: {
  enabled: boolean
  timeout: number
  development: boolean
}
```

Resolve/load `virtual:miko-white-screen`. `transformIndexHtml` injects:

```ts
{
  tag: 'script',
  attrs: {
    type: 'module',
    'data-miko-monitor': '',
    src: monitorSource,
  },
  injectTo: 'head-prepend',
}
```

The application entry remains the sole `data-miko-entry` script. User HTML containing `data-miko-monitor` must not receive a duplicate.

- [ ] **Step 5: Verify build and dev HTML**

Extend real Vite tests to prove:

- no-config build produces separate hashed monitor and app assets;
- monitor precedes app entry;
- `whiteScreen: false` omits monitor code and tag;
- user HTML is preserved and gets exactly one monitor;
- no inline executable script is required.

Run:

```sh
bun run test:packages -- packages/vite-plugin-index-html
```

Expected: all pass.

- [ ] **Step 6: Commit**

```sh
git add packages/vite-plugin-index-html
git commit -m "feat(html): add independent boot monitor"
```

---

### Task 3: Connect Vue startup errors and first render to the boot protocol

**Files:**
- Modify: `packages/vite-plugin-miko/plugins/runtime.ts`
- Modify: `packages/vite-plugin-miko/plugins/runtime.test.ts`
- Modify: `packages/vite-plugin-miko/plugins/core.ts`
- Modify: `packages/vite-plugin-miko/template/App.vue`
- Modify: `packages/vite-plugin-miko/template/App.test.ts`
- Modify: `packages/vite-plugin-miko/config/factory.integration.test.ts`

- [ ] **Step 1: Write failing runtime-module tests**

Require these exports from `virtual:miko-runtime`:

```ts
setupMikoRuntime(app, initialState, onSSRAppRendered)
markMikoReady()
```

Tests must prove:

- client setup temporarily wraps existing `app.config.errorHandler` and `warnHandler`;
- errors before ready call `__MIKO_BOOT__.fail('MIKO_BOOT_VUE', message)`;
- hydration mismatch warnings are appended to `__MIKO_BOOT__.warnings` but do not fail production by themselves;
- `markMikoReady()` calls the monitor’s `ready()` once;
- after ready, original handlers remain responsible and the boot bridge no longer reports business errors;
- Pinia behavior remains identical.

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/plugins/runtime.test.ts packages/vite-plugin-miko/template/App.test.ts
```

Expected: missing `markMikoReady`.

- [ ] **Step 3: Implement the bridge in the virtual runtime**

Generate client-only helpers:

```ts
function boot() {
  return typeof window === 'undefined' ? undefined : window.__MIKO_BOOT__
}

export function markMikoReady() {
  boot()?.ready()
}
```

During setup, preserve and delegate to existing handlers. Warning detection is limited to `/hydration|mismatch/i`.

- [ ] **Step 4: Make App.vue signal first resolved route render**

Replace direct DOM manipulation with:

```ts
import { markMikoReady } from 'virtual:miko-runtime'

const onResolve = () => {
  if (!import.meta.env.SSR) markMikoReady()
}
```

No timer, watcher, route meta heuristic, or business-content inspection is added.

- [ ] **Step 5: Pass white-screen options into the HTML plugin**

`htmlEntryPlugins(project)` passes:

```ts
whiteScreen: {
  enabled: project.capabilities.whiteScreen.enabled,
  timeout: project.capabilities.whiteScreen.value.timeout ?? 8000,
  development: project.env.command === 'dev',
}
```

- [ ] **Step 6: Verify real SPA and SSG readiness**

Extend the browser integration to assert:

```ts
await page.waitForSelector('#app[data-miko-ready="true"]')
expect(await page.locator('#app').getAttribute('v-cloak')).toBeNull()
expect(await page.locator('[data-miko-failure]').count()).toBe(0)
```

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/plugins/runtime.test.ts packages/vite-plugin-miko/template/App.test.ts packages/vite-plugin-miko/config/factory.integration.test.ts
```

- [ ] **Step 7: Commit**

```sh
git add packages/vite-plugin-miko
git commit -m "feat(miko): signal successful application boot"
```

---

### Task 4: Add deterministic post-build static validation

**Files:**
- Create: `packages/cli/static-check.ts`
- Create: `packages/cli/static-check.test.ts`
- Modify: `packages/cli/build.ts`
- Modify: `packages/cli/build.test.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Write failing validator tests**

Use temporary output fixtures for:

- missing output directory;
- no HTML routes;
- missing unique `#app`;
- permanent `v-cloak` without monitor/ready protocol;
- referenced local script or stylesheet missing under `base`;
- SSG HTML containing Vite error overlay or serialized fatal error markers;
- valid root base and non-root base;
- valid ClientOnly and 404 HTML shells.

The public API is:

```ts
export interface StaticCheckIssue {
  code: string
  file: string
  message: string
}

export async function checkStaticOutput(
  outDir: string,
  base: string,
): Promise<{ routes: string[]; issues: StaticCheckIssue[] }>

export async function assertStaticOutput(outDir: string, base: string): Promise<void>
```

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/cli/static-check.test.ts
```

- [ ] **Step 3: Implement validation with parse5 and filesystem checks**

Parse HTML structurally. Resolve only same-origin root-relative or relative asset paths. Ignore external `http:`, `https:`, `data:`, and protocol-relative URLs. Never follow symlinks outside `outDir`.

Throw `MikoCliError('MIKO_BUILD_STATIC_CHECK', summary, 5)` from `assertStaticOutput` when issues exist.

- [ ] **Step 4: Run static validation in normal application builds**

After SPA/SSG build and before writing manifests:

```ts
const base = String(config.base ?? '/')
await assertStaticOutput(project.outDir, base)
await writeStaticDeploymentManifest(project.outDir, base)
```

Library mode remains unchanged.

- [ ] **Step 5: Verify targeted tests and starter build**

Run:

```sh
bun run test:packages -- packages/cli/static-check.test.ts packages/cli/build.test.ts
cd app
bun run build
```

- [ ] **Step 6: Commit**

```sh
git add packages/cli
git commit -m "feat(cli): validate static application output"
```

---

### Task 5: Add `miko check` with isolated output

**Files:**
- Modify: `packages/cli/args.ts`
- Modify: `packages/cli/args.test.ts`
- Modify: `packages/cli/context.ts`
- Modify: `packages/cli/context.test.ts`
- Modify: `packages/cli/run.ts`
- Modify: `packages/cli/run.test.ts`
- Modify: `packages/cli/build.ts`
- Create: `packages/cli/check.ts`
- Create: `packages/cli/check.test.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Write failing CLI contract tests**

Add `check` to commands and parse:

```sh
miko check
miko check --all-routes
```

Rules:

- `--all-routes` is valid only for `check`;
- `--lib` remains valid only for `build`;
- `--json` remains valid only for `doctor`;
- help includes `check`;
- command context exposes `allRoutes: boolean`.

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/cli/args.test.ts packages/cli/context.test.ts packages/cli/run.test.ts
```

- [ ] **Step 3: Extract an application build function with an output override**

Add:

```ts
export interface ApplicationBuildOptions {
  outputOverride?: string
}

export async function buildApplication(
  context: CommandContext,
  options: ApplicationBuildOptions = {},
): Promise<{ project: ResolvedMikoConfig; config: UserConfig; outDir: string }>
```

When `outputOverride` exists, clone the resolved project and set both `outDir` and `vite.build.outDir` to the absolute temporary path after configuration resolution. Do not merge the override into user config and do not mutate the original project.

- [ ] **Step 4: Implement isolated check orchestration**

`runCheck` must:

1. Create `mkdtemp(join(tmpdir(), 'miko-check-'))`.
2. Print original and isolated output paths.
3. Run `buildApplication(context, { outputOverride })`.
4. Reuse `assertStaticOutput`.
5. Run browser smoke from Task 6.
6. Close browser and preview server.
7. Remove the temporary directory in `finally`.

Any browser failure becomes `MikoCliError` exit code 6. Build/type/lint failures retain their existing categories.

- [ ] **Step 5: Verify isolation**

Tests use a pre-existing sentinel file under the user’s configured `dist` and assert it remains byte-for-byte unchanged after both successful and failed checks.

- [ ] **Step 6: Commit**

```sh
git add packages/cli
git commit -m "feat(cli): add isolated check command"
```

---

### Task 6: Implement browser white-screen smoke and fault injection

**Files:**
- Create: `packages/cli/browser-check.ts`
- Create: `packages/cli/browser-check.test.ts`
- Modify: `packages/cli/check.ts`
- Modify: `packages/cli/package.json`
- Modify: `app/package.json`
- Create: `packages/cli/test/fixtures/white-screen/`

- [ ] **Step 1: Write failing route-selection tests**

Given manifest routes, default selection is:

```ts
['/', deepestRoute, '/__miko_missing__']
```

Deduplicate routes and preserve `/`. `--all-routes` selects every manifest route plus the missing route.

- [ ] **Step 2: Write failing browser-contract tests**

For every route, collect:

- failed requests and HTTP responses `>= 400` for scripts/styles/documents;
- `pageerror`;
- `unhandledrejection` surfaced by the boot monitor;
- hydration mismatch warnings;
- final `#app[data-miko-ready="true"]`;
- absence of `v-cloak`;
- absence of `[data-miko-failure]`.

Return a structured report and throw code `MIKO_CHECK_BROWSER` with route-specific summaries.

- [ ] **Step 3: Verify RED**

Run:

```sh
bun run test:packages -- packages/cli/browser-check.test.ts
```

- [ ] **Step 4: Implement preview and Playwright lifecycle**

Use Vite’s programmatic `preview()` with `host: '127.0.0.1'` and port `0`. Use Playwright Chromium from the CLI package dependency. Do not start a visible browser.

The browser timeout is `whiteScreen.timeout + 2000`.

- [ ] **Step 5: Add fault fixtures**

Provide deterministic modes:

- normal empty page reaches ready;
- bootstrap throws;
- application entry request is aborted;
- hydration mismatch reaches ready but fails Check;
- monitor timeout leaves permanent skeleton;
- ClientOnly page reaches ready.

Each failure test asserts exit code 6 and a stable Miko error code.

- [ ] **Step 6: Verify real starter**

Run:

```sh
cd app
bun run miko check
```

Expected: homepage, deepest route, and missing route pass; formal `dist` is untouched.

- [ ] **Step 7: Commit**

```sh
git add packages/cli app/package.json bun.lock
git commit -m "test(cli): enforce browser boot reliability"
```

---

### Task 7: Implement conservative migration analysis and dry-run

**Files:**
- Modify: `packages/cli/args.ts`
- Modify: `packages/cli/context.ts`
- Modify: `packages/cli/run.ts`
- Create: `packages/cli/migrate/types.ts`
- Create: `packages/cli/migrate/analyze.ts`
- Create: `packages/cli/migrate/render.ts`
- Create: `packages/cli/migrate/index.ts`
- Create: `packages/cli/migrate/analyze.test.ts`
- Create: `packages/cli/migrate/render.test.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Write failing command tests**

Supported forms:

```sh
miko migrate
miko migrate --write
miko migrate --check
```

Default is dry-run. `--check` is valid only with `--write`. Repeated flags and unknown positional values fail with exit code 2.

- [ ] **Step 2: Define the migration plan model**

```ts
export interface MigrationFinding {
  level: 'info' | 'warning' | 'error'
  code: string
  file: string
  message: string
}

export interface MigrationPlan {
  root: string
  sourceFiles: string[]
  targetFile: string
  generatedSource: string | null
  findings: MigrationFinding[]
  safeToWrite: boolean
}
```

- [ ] **Step 3: Analyze only the supported legacy surface**

Recognize:

- old `vite.config.ts` that imports/calls `defineMikoConfig()`;
- old flat `miko.config.ts` fields from the pre-v1 repository;
- native Vite keys `base`, `resolve`, `server`, `preview`, `build`, `css`, `define`, `optimizeDeps`, `ssr`, `plugins`;
- framework keys that map directly to the current `miko` namespace.

Dynamic functions, conditional expressions, spreads from unknown modules, and custom plugin order produce `MIKO_MIGRATE_MANUAL` warnings and `safeToWrite: false`. Source files remain untouched.

Do not execute source config code during analysis.

- [ ] **Step 4: Render deterministic output**

Generated source uses:

```ts
import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  miko: {
    rendering: 'spa',
    vuePluginOptions: { reactivityTransform: false },
  },
  vite: {
    base: '/legacy/',
    server: { port: 5173 },
  },
} satisfies MikoUserConfig
```

Omit empty namespaces. Sort known keys by the documented public order, not alphabetically.

- [ ] **Step 5: Verify dry-run is non-mutating**

Tests snapshot stdout and assert source/target mtimes and bytes are unchanged.

- [ ] **Step 6: Commit**

```sh
git add packages/cli
git commit -m "feat(cli): plan safe miko migrations"
```

---

### Task 8: Add migration backups, writes, idempotency, and recovery

**Files:**
- Create: `packages/cli/migrate/write.ts`
- Create: `packages/cli/migrate/write.test.ts`
- Modify: `packages/cli/migrate/index.ts`
- Modify: `packages/cli/doctor.ts`
- Test: `packages/cli/doctor.integration.test.ts`

- [ ] **Step 1: Write failing write-safety tests**

Cover:

- unsafe plans refuse `--write` with exit code 7;
- an existing target is never overwritten;
- backup directory is inside `.miko-migrate/<UTC timestamp>/`;
- backup contains every source file plus `RECOVER.md`;
- target write is atomic;
- repeated migration after a successful write reports no changes;
- a failure after backup but before target rename leaves recovery data and no partial target.

- [ ] **Step 2: Implement atomic writes**

Write target to `miko.config.ts.<pid>.tmp`, fsync/close, then rename. Backup names preserve relative paths. Recovery instructions list exact PowerShell and POSIX copy commands without deleting user files.

- [ ] **Step 3: Run Doctor after successful write**

Call the existing `runDoctor` pipeline with the same root/mode. If `--check` was supplied, call `runCheck` after Doctor. A failed Doctor/Check keeps the generated target and backup so the user can inspect or restore it.

- [ ] **Step 4: Verify GREEN**

Run:

```sh
bun run test:packages -- packages/cli/migrate packages/cli/doctor.integration.test.ts
```

- [ ] **Step 5: Commit**

```sh
git add packages/cli
git commit -m "feat(cli): write recoverable migrations"
```

---

### Task 9: Replace stale migration guidance and document v1

**Files:**
- Create: `docs/migration-v1.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/package.test.ts`
- Modify: `packages/vite-plugin-miko/README.md`
- Modify: `packages/to-miko/SKILL.md`
- Modify: `packages/to-miko/README.md`
- Modify: `packages/to-miko/references/common-diffs.md`
- Modify: `packages/to-miko/references/migration-steps.md`
- Modify: `packages/to-miko/references/plugin-map.json`

- [ ] **Step 1: Write failing documentation/package tests**

Assert:

- no current guidance tells users to keep or create `vite.config.ts`;
- examples use `miko.config.ts` with `{ miko, vite }`;
- commands list `dev`, `build`, `preview`, `check`, `doctor`, and `migrate`;
- package `files` includes every new CLI/runtime module and excludes tests/fixtures;
- Bun remains the package manager and Node remains the distributed runtime.

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/cli/package.test.ts packages/vite-plugin-miko/package.test.ts
```

- [ ] **Step 3: Write the v1 migration guide**

`docs/migration-v1.md` must include:

- old package/entry to v1 mapping;
- deletion of `vite.config.ts`;
- unified `miko.config.ts` example;
- SPA/SSG, Legacy, CDN, Proxy, Pinia, Unhead, HTML, and white-screen behavior changes;
- `miko migrate`, `miko doctor`, and `miko check` workflow;
- backup/recovery procedure;
- unsupported dynamic config examples;
- measurable Slice 3 performance results;
- rollback by restoring the backup and previous package versions.

- [ ] **Step 4: Update the migration skill**

Remove every instruction that creates a Miko-owned `vite.config.ts`, passes extra plugins through `defineMikoConfig()`, uses legacy `ssg: false`, or places Vite fields at the old top level. Preserve business-route analysis and explicit warnings for unsupported custom plugins.

- [ ] **Step 5: Verify GREEN**

Run package tests and:

```sh
rg -n "create.*vite\\.config|defineMikoConfig\\(.*\\)|ssg:\\s*false" packages/to-miko README.md docs/migration-v1.md
```

Expected: no stale instruction match outside clearly labelled “old configuration” examples.

- [ ] **Step 6: Commit**

```sh
git add README.md AGENTS.md CLAUDE.md docs/migration-v1.md packages/cli/package.json packages/cli/package.test.ts packages/vite-plugin-miko/README.md packages/to-miko
git commit -m "docs(miko): publish v1 migration contract"
```

---

### Task 10: Prepare v1 package metadata without publishing

**Files:**
- Modify: package manifests under `packages/`
- Modify: `app/package.json`
- Modify: `bun.lock`
- Create: `docs/compatibility-v1.md`
- Test: package tests under each publishable package

- [ ] **Step 1: Inventory publishable packages**

Generate a checked list from Bun workspace manifests. Private packages remain private. Record current versions and dependency edges in `docs/compatibility-v1.md`.

- [ ] **Step 2: Set a coherent v1 release set**

Packages whose public contract changed receive `1.0.0`. Internal dependencies use `workspace:^` in the repository; Bun publish dry-run must rewrite them to real semver. The starter uses the v1 ranges.

- [ ] **Step 3: Document runtime compatibility**

The matrix must prove:

- dependency install and scripts use Bun 1.3.x;
- distributed CLI works on Node 20.19 and Node 22.12+;
- SPA and SSG work without Bun runtime APIs;
- modern output is default;
- Legacy and CDN remain optional;
- Windows browser checks bind `127.0.0.1`.

- [ ] **Step 4: Verify package contents**

Run for every public package:

```sh
bun publish --dry-run --ignore-scripts --registry https://registry.npmjs.org/ --access public
```

Confirm source, templates, monitor, Check, migration, and types are included; tests, fixtures, `.omc`, `.remember`, results, logs, and environment files are excluded.

- [ ] **Step 5: Commit**

```sh
git add package.json bun.lock app/package.json packages docs/compatibility-v1.md
git commit -m "chore!: prepare miko v1 packages"
```

Do not run a real publish or push without explicit user approval.

---

### Task 11: Run final correctness, fault, performance, and cleanliness gates

**Files:**
- Modify only files required by failures found during this task.
- Record significant verified findings in ignored `.remember/now.md`.

- [ ] **Step 1: Frozen Bun install**

```sh
bun install --frozen-lockfile
```

Expected: no lockfile change.

- [ ] **Step 2: Full package tests and type checks**

```sh
bun run test:packages
bun run typecheck:packages
```

Expected: all tests and all four TypeScript projects pass.

- [ ] **Step 3: Starter gates**

```sh
cd app
bun test:unit
bun run build
bun run miko check
```

Start `bun dev` and run Playwright E2E plus Vitest browser tests. Confirm `data-miko-ready`, no failure panel, no page errors, and no critical failed requests.

- [ ] **Step 4: Fault injection matrix**

Run the fixture suite for:

- entry request failure;
- bootstrap throw;
- hydration mismatch;
- unresolved Suspense/permanent skeleton;
- valid empty page;
- ClientOnly;
- root and non-root base;
- deepest SSG route;
- missing route.

Expected: normal cases pass; each injected fault fails with exit code 6 and route/error code.

- [ ] **Step 5: Migration matrix**

Run dry-run and write cases for:

- zero-config project;
- supported legacy Vite wrapper;
- supported flat Miko config;
- existing target conflict;
- dynamic/conditional config;
- repeated migration;
- recovery after simulated failure.

Expected: no source loss, safe cases produce valid Doctor output, unsafe cases remain non-mutating.

- [ ] **Step 6: Performance regression gate**

```sh
cd ..
bun run perf:check
```

Expected: environment compatible and no budget failure. The white-screen monitor must not introduce more than the existing 5% runtime/asset gate.

- [ ] **Step 7: Production artifact scan**

Inspect `app/dist`:

```sh
rg -n "vite-plugin-vue-devtools|framework\\.umd\\.js|polyfills-legacy|MIKO_PERF_RESULT|当前APP|console\\.log" app/dist -g "*.html" -g "*.js"
```

Expected: no matches. Confirm one hashed monitor module, one application entry, hashed JS/CSS, route/assets manifests, and no empty Pinia state.

- [ ] **Step 8: Final publish dry-runs and Git audit**

Repeat all package dry-runs. Run:

```sh
git diff --check
git status --short
```

Only explicitly excluded user-local files may remain:

- `.omc/`
- `app/.env.test`
- `app/preview.log.err`
- ignored `.remember/now.md`
- ignored performance results.

- [ ] **Step 9: Final release-readiness commit**

Stage only corrections produced by the final gates and commit:

```sh
git commit -m "test(miko): verify v1 release readiness"
```

---

## Plan self-review

- Spec coverage: default white-screen capability, independent monitor, Vue startup bridge, build static checks, isolated Check, browser smoke, route/fault matrix, dry-run migration, recoverable writes, Doctor/Check follow-up, upgrade guide, compatibility matrix, Bun/Node boundary, package artifacts, and performance gates each have a concrete task.
- Simplicity: one boot protocol, one static validator, one browser runner, and one conservative migration pipeline reuse the existing resolved project and plugin graph. No general telemetry SDK, SSR server, extra configuration file, or parallel runtime abstraction is introduced.
- Safety: browser processes, preview servers, temporary output, migration writes, backups, and user-owned configuration have explicit lifecycle and failure rules.
- Type consistency: `WhiteScreenOptions`, `MikoBootState`, `StaticCheckIssue`, `ApplicationBuildOptions`, `MigrationFinding`, and `MigrationPlan` keep the same names and meanings across tasks.
- Placeholder scan: the plan contains no deferred implementation marker, unspecified validation step, or ambiguous “handle errors” instruction.
- Publication boundary: all release artifacts are prepared and dry-run verified, but real publish and push remain outside scope until explicitly authorized.
