# Miko v1 Slice 3 Build and Runtime Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish reproducible build/browser performance baselines, remove measurable default-path overhead, tighten SPA/SSG hydration output, and enforce regression budgets without adding a second application runtime.

**Architecture:** Add one private Bun-managed benchmark package that generates deterministic Miko projects, always invokes the distributed CLI through Node.js, records raw build/browser samples, and compares medians against an environment-matched baseline. Production changes remain inside existing Miko boundaries: optional plugins become lazy, CDN mapping is computed only when CDN is enabled, empty SSG state is removed, SPA stops using an unnecessary full-route `ClientOnly`, and successful builds emit deployment manifests through a small CLI post-build step.

**Tech Stack:** Bun workspaces, Node.js 20/22 + jiti, TypeScript, Vite 8/Rolldown, Vue 3, ViteSSG, Pinia, Vitest 4, Playwright/Chromium.

---

## Scope and non-goals

This slice includes:

- Small, Medium, Large, and Runtime benchmark fixtures.
- Raw JSON samples, medians, environment fingerprints, and relative budget comparison.
- Node-driven CLI build measurements, including elapsed time and child-process peak RSS.
- Browser measurements for FCP, LCP, hydration-ready proxy, script duration, route navigation, request count, and transfer bytes.
- Request-topology assertions proving unvisited route chunks are not fetched.
- Lazy loading of disabled optional plugins.
- No framework-module scan when CDN is disabled.
- Removal of the production SPA-wide `ClientOnly` wrapper.
- Removal of empty Pinia state and empty ViteSSG state scripts.
- Deployment route/asset manifests with explicit cache-policy recommendations.
- Safe overlap of type checking with config/plugin preparation, but not with the memory-heavy Vite build.

This slice does not include:

- White-screen ready protocol or failure panel; those remain Slice 4.
- A custom router, hydration engine, proxy, chunking algorithm, or cache server.
- Default `manualChunks`; Rolldown/Vite remains responsible for shared chunking.
- Platform-independent absolute timing thresholds. Timing gates apply only when the current environment matches the baseline fingerprint.
- Automatic deployment response headers; manifests only describe the intended boundary.

## File structure

Create:

- `packages/performance/package.json` — private benchmark package and scripts.
- `packages/performance/tsconfig.json` — Node/Playwright type checking.
- `packages/performance/types.ts` — stable raw result and budget contracts.
- `packages/performance/statistics.ts` — median and sample validation.
- `packages/performance/statistics.test.ts`
- `packages/performance/compare.ts` — environment-aware relative regression gates.
- `packages/performance/compare.test.ts`
- `packages/performance/fixtures.ts` — deterministic fixture generator.
- `packages/performance/fixtures.test.ts`
- `packages/performance/worker.ts` — Node child that runs the real CLI and reports peak RSS.
- `packages/performance/build.ts` — cold/warm build sampling and artifact sizes.
- `packages/performance/runtime.ts` — Playwright metrics and route request topology.
- `packages/performance/index.ts` — `baseline`, `measure`, and `check` entry.
- `packages/performance/baselines/miko-v1-slice-3-before.json` — pre-optimization raw baseline.
- `packages/performance/README.md` — reproduction and interpretation guide.
- `packages/cli/static-manifest.ts` — post-build route/asset manifest generator.
- `packages/cli/static-manifest.test.ts`
- `packages/vite-plugin-miko/ssg/state.ts` — empty-state HTML cleanup and hook composition.
- `packages/vite-plugin-miko/ssg/state.test.ts`

Modify:

- `package.json`
- `.gitignore`
- `bun.lock`
- `tsconfig.builder.json`
- `packages/cli/build.ts`
- `packages/cli/build.test.ts`
- `packages/cli/package.json`
- `packages/cli/package.test.ts`
- `packages/vite-plugin-external/index.ts`
- `packages/vite-plugin-external/index.test.ts`
- `packages/vite-plugin-miko/index.ts`
- `packages/vite-plugin-miko/config/factory.test.ts`
- `packages/vite-plugin-miko/plugins/conventions.ts`
- `packages/vite-plugin-miko/plugins/integrations.ts`
- `packages/vite-plugin-miko/plugins/index.ts`
- `packages/vite-plugin-miko/plugins/order.test.ts`
- `packages/vite-plugin-miko/plugins/runtime.ts`
- `packages/vite-plugin-miko/plugins/runtime.test.ts`
- `packages/vite-plugin-miko/template/App.vue`
- `packages/vite-plugin-miko/template/App.test.ts`
- `packages/vite-plugin-miko/config/factory.integration.test.ts`
- `packages/vite-plugin-miko/package.json`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.remember/now.md`

---

### Task 1: Add stable metric, median, and comparison contracts

**Files:**

- Create: `packages/performance/package.json`
- Create: `packages/performance/tsconfig.json`
- Create: `packages/performance/types.ts`
- Create: `packages/performance/statistics.ts`
- Create: `packages/performance/statistics.test.ts`
- Create: `packages/performance/compare.ts`
- Create: `packages/performance/compare.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.builder.json`
- Modify: `bun.lock`

- [ ] **Step 1: Write failing statistics and comparison tests**

Use these contracts:

```ts
export interface EnvironmentFingerprint {
  platform: NodeJS.Platform
  arch: string
  cpu: string
  node: string
  bun: string
  vite: string
}

export interface MetricSamples {
  samples: number[]
  median: number
}

export interface BuildMetrics {
  coldMs: MetricSamples
  warmMs: MetricSamples
  peakRssBytes: MetricSamples
  htmlBytes: number
  jsBytes: number
  cssBytes: number
  assetCount: number
}

export interface RuntimeMetrics {
  fcpMs: MetricSamples
  lcpMs: MetricSamples
  hydrationMs: MetricSamples
  scriptDurationMs: MetricSamples
  routeNavigationMs: MetricSamples
  transferBytes: MetricSamples
  requestCount: MetricSamples
  unvisitedRouteRequested: boolean
}

export interface PerformanceReport {
  schemaVersion: 1
  environment: EnvironmentFingerprint
  createdAt: string
  build: Record<'small' | 'medium' | 'large' | 'runtime', BuildMetrics>
  runtime: RuntimeMetrics
}
```

Test exact median behavior and budget boundaries:

```ts
it('uses the middle value or average of two middle values', () => {
  expect(median([9, 1, 5])).toBe(5)
  expect(median([8, 2, 6, 4])).toBe(5)
})

it('rejects empty or non-finite samples', () => {
  expect(() => median([])).toThrow(/至少一个样本/)
  expect(() => median([1, Number.NaN])).toThrow(/有限数字/)
})

it('uses five percent runtime and ten percent build budgets', () => {
  const result = compareReports(baseline(), current({
    runtime: { fcpMs: 105 },
    build: { small: { warmMs: 110 } },
  }))
  expect(result.failures).toEqual([])
})

it('refuses timing comparisons across different environments', () => {
  const result = compareReports(
    baseline({ environment: { cpu: 'CPU A' } }),
    current({ environment: { cpu: 'CPU B' } }),
  )
  expect(result.environmentCompatible).toBe(false)
  expect(result.failures).toContainEqual(expect.objectContaining({ metric: 'environment' }))
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```sh
bun run test:packages -- packages/performance/statistics.test.ts packages/performance/compare.test.ts
```

Expected: FAIL because the package and functions do not exist.

- [ ] **Step 3: Implement the private package and pure comparison logic**

`packages/performance/package.json`:

```json
{
  "name": "@minar-kotonoha/performance",
  "private": true,
  "type": "module",
  "scripts": {
    "baseline": "bun index.ts baseline",
    "measure": "bun index.ts measure",
    "check": "bun index.ts check"
  },
  "dependencies": {
    "@minar-kotonoha/miko-cli": "workspace:^",
    "@minar-kotonoha/vite-plugin-miko": "workspace:^",
    "@playwright/test": "^1.62.1",
    "jiti": "^2.7.0",
    "vite": "catalog:"
  }
}
```

`median()` sorts a copy and never mutates the caller's sample array. `compareReports()`:

1. Requires exact `platform`, `arch`, CPU model, Node major/minor, Bun major/minor, and Vite major/minor matches before timing/RSS comparison.
2. Applies a 10% budget to cold/warm build time and peak RSS.
3. Applies a 5% budget to JS/CSS bytes, hydration, navigation, FCP, LCP, script duration, request count, and transfer bytes.
4. Always fails when `unvisitedRouteRequested` becomes `true`.
5. Returns every failure instead of stopping at the first.

Add root scripts:

```json
{
  "perf:baseline": "bun --cwd packages/performance baseline",
  "perf:measure": "bun --cwd packages/performance measure",
  "perf:check": "bun --cwd packages/performance check"
}
```

Add `packages/performance/**/*` to `tsconfig.builder.json` and run `bun install` to update `bun.lock`.

- [ ] **Step 4: Verify GREEN**

Run:

```sh
bun run test:packages -- packages/performance/statistics.test.ts packages/performance/compare.test.ts
bun run typecheck:packages
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add package.json bun.lock tsconfig.builder.json packages/performance/package.json packages/performance/tsconfig.json packages/performance/types.ts packages/performance/statistics.ts packages/performance/statistics.test.ts packages/performance/compare.ts packages/performance/compare.test.ts
git commit -m "test(miko): add performance metric contracts"
```

---

### Task 2: Generate deterministic Small, Medium, Large, and Runtime fixtures

**Files:**

- Create: `packages/performance/fixtures.ts`
- Create: `packages/performance/fixtures.test.ts`

- [ ] **Step 1: Write failing fixture tests**

The generator API is:

```ts
export type FixtureName = 'small' | 'medium' | 'large' | 'runtime'

export interface GeneratedFixture {
  name: FixtureName
  root: string
  routeCount: number
  componentCount: number
  deepRoute: string
  unvisitedRoute: string
}

export async function generateFixture(
  parent: string,
  name: FixtureName,
): Promise<GeneratedFixture>
```

Test the exact sizes:

```ts
it.each([
  ['small', 3, 20],
  ['medium', 50, 200],
  ['large', 500, 1000],
] as const)('generates %s deterministically', async (name, routes, components) => {
  const fixture = await generateFixture(root, name)
  expect(fixture.routeCount).toBe(routes)
  expect(fixture.componentCount).toBe(components)
  expect(await countVueFiles(join(fixture.root, 'pages'))).toBe(routes)
  expect(await countVueFiles(join(fixture.root, 'components'))).toBe(components)
})

it('creates a runtime fixture with Pinia, Head, ClientOnly and an unvisited route marker', async () => {
  const fixture = await generateFixture(root, 'runtime')
  expect(await readFile(join(fixture.root, 'package.json'), 'utf8')).toContain('"pinia"')
  expect(await readFile(join(fixture.root, 'pages/unvisited.vue'), 'utf8')).toContain(
    'UNVISITED_ROUTE_MARKER',
  )
})
```

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/performance/fixtures.test.ts
```

Expected: FAIL because `generateFixture` does not exist.

- [ ] **Step 3: Implement deterministic generation**

Rules:

1. Generate into a caller-owned temporary parent.
2. Create a junction/symlink from fixture `node_modules` to workspace `node_modules`.
3. Write a minimal `package.json`, `index.ts`, `miko.config.ts`, pages, components, and layouts.
4. Use zero-padded names (`route-0001.vue`) so filesystem order is deterministic.
5. Never run package installation inside a fixture.
6. Runtime fixture includes:
   - `/` with an LCP marker and navigation link.
   - `/deep/nested` with a deterministic target marker.
   - `/client-only` with `meta.clientOnly = true`.
   - `/unvisited` with a unique chunk marker.
   - Pinia state on the rendered home route.
   - one shared async component.
   - `useHead()` title/meta.
7. Generated source contains no randomness or timestamps.

- [ ] **Step 4: Verify GREEN**

Run fixture tests and inspect one generated tree in a temporary directory. Expected: exact counts and stable file names.

- [ ] **Step 5: Commit**

```sh
git add packages/performance/fixtures.ts packages/performance/fixtures.test.ts
git commit -m "test(miko): add deterministic performance fixtures"
```

---

### Task 3: Measure real Node CLI builds and record the pre-optimization baseline

**Files:**

- Create: `packages/performance/worker.ts`
- Create: `packages/performance/build.ts`
- Create: `packages/performance/build.test.ts`
- Create: `packages/performance/index.ts`
- Create: `packages/performance/baselines/miko-v1-slice-3-before.json`

- [ ] **Step 1: Write failing worker and artifact tests**

The worker must use the real CLI dispatcher:

```ts
await runCli(['build', '--root', root], {
  cwd: () => workspaceRoot,
  runners: legacyCommandRunners,
})

process.stdout.write(
  `${JSON.stringify({
    marker: 'MIKO_PERF_RESULT',
    peakRssBytes: process.resourceUsage().maxRSS * (process.platform === 'darwin' ? 1 : 1024),
  })}\n`,
)
```

Test that `runNodeBuild()`:

- spawns `process.execPath`, never `bun`;
- passes `--import <jiti/register URL>`;
- parses only the `MIKO_PERF_RESULT` line;
- rejects a non-zero exit;
- sums `.html`, `.js`, and `.css` bytes while excluding `.miko/` reports.

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/performance/build.test.ts
```

Expected: missing build worker/runner.

- [ ] **Step 3: Implement build sampling**

Use:

```ts
export async function measureBuildFixture(
  fixture: GeneratedFixture,
  options: { coldSamples: number; warmSamples: number },
): Promise<BuildMetrics>
```

For each cold sample, remove only these resolved paths inside the fixture:

- `<root>/dist`
- `<root>/node_modules/.vite`
- `<root>/.vite-ssg-temp`

Verify each resolved path begins with the resolved fixture root before removal. Warm samples remove `dist` only. Capture `performance.now()` around the Node child and use the worker marker for peak RSS.

`index.ts baseline` runs:

```ts
{
  coldSamples: 3,
  warmSamples: 5,
  fixtures: ['small', 'medium', 'large', 'runtime'],
}
```

Write raw samples and medians atomically to `baselines/miko-v1-slice-3-before.json`. Include CPU model, platform, arch, Node, Bun, Vite, and the current commit hash.

- [ ] **Step 4: Run the baseline before production optimization**

Run:

```sh
bun run perf:baseline
```

Expected:

- All four fixtures build successfully.
- The baseline contains 3 cold and 5 warm samples per fixture.
- `workerRuntime` records `process.execPath`.
- Raw JSON is retained; no sample is replaced by a hand-written summary.

- [ ] **Step 5: Commit harness and baseline**

```sh
git add packages/performance/worker.ts packages/performance/build.ts packages/performance/build.test.ts packages/performance/index.ts packages/performance/baselines/miko-v1-slice-3-before.json
git commit -m "test(miko): record pre-optimization build baseline"
```

---

### Task 4: Measure real browser runtime and route request topology

**Files:**

- Create: `packages/performance/runtime.ts`
- Create: `packages/performance/runtime.test.ts`
- Modify: `packages/performance/index.ts`
- Modify: `packages/performance/baselines/miko-v1-slice-3-before.json`

- [ ] **Step 1: Write failing metric extraction tests**

Define:

```ts
export interface RuntimeSample {
  fcpMs: number
  lcpMs: number
  hydrationMs: number
  scriptDurationMs: number
  routeNavigationMs: number
  transferBytes: number
  requestCount: number
  requestedScripts: string[]
}
```

Test pure extraction from browser/CDP payloads and assert that a URL containing `UNVISITED_ROUTE_MARKER`'s emitted chunk is classified as an unvisited-route request.

- [ ] **Step 2: Verify RED**

Run:

```sh
bun run test:packages -- packages/performance/runtime.test.ts
```

Expected: missing runtime analyzer.

- [ ] **Step 3: Implement the Playwright measurement**

For each of five samples:

1. Start Vite Preview on `127.0.0.1` with a reserved strict port.
2. Launch bundled Chromium headless at viewport `375x812`.
3. Before navigation, inject:
   - an LCP `PerformanceObserver`;
   - a `MutationObserver` that records when `#app` loses `v-cloak` as the Slice 3 hydration-ready proxy.
4. Enable the CDP `Performance` domain and read `ScriptDuration`.
5. Navigate to `/`, wait for the home marker, and collect FCP/LCP/hydration.
6. Record all script requests and resource transfer sizes.
7. Assert the unvisited route chunk was not requested.
8. Click the deep-route link, wait for its marker, and measure navigation duration.
9. Close page, browser, and preview in `finally`.

The runtime result uses medians of five samples and sets `unvisitedRouteRequested` from the complete request list.

- [ ] **Step 4: Extend the pre-optimization baseline**

Run:

```sh
bun run perf:baseline
```

Expected: the baseline now contains both build and runtime raw samples.

- [ ] **Step 5: Commit**

```sh
git add packages/performance/runtime.ts packages/performance/runtime.test.ts packages/performance/index.ts packages/performance/baselines/miko-v1-slice-3-before.json
git commit -m "test(miko): record browser runtime baseline"
```

---

### Task 5: Lazily load optional plugins and skip CDN mapping work by default

**Files:**

- Modify: `packages/vite-plugin-external/index.ts`
- Modify: `packages/vite-plugin-external/index.test.ts`
- Modify: `packages/vite-plugin-miko/plugins/conventions.ts`
- Modify: `packages/vite-plugin-miko/plugins/integrations.ts`
- Modify: `packages/vite-plugin-miko/plugins/index.ts`
- Modify: `packages/vite-plugin-miko/plugins/order.test.ts`
- Modify: `packages/vite-plugin-miko/config/factory.test.ts`

- [ ] **Step 1: Write failing lazy-import tests**

Cover:

```ts
it('does not scan framework modules when CDN is disabled', async () => {
  const result = await externalPlugin(root, false, [])
  expect(mocks.scanFrameworkModules).not.toHaveBeenCalled()
  expect(flattenNames(result)).toEqual(['@minar-kotonoha/vite-plugin-external'])
})

it('does not import disabled components, UnoCSS, Legacy or DevTools', async () => {
  const result = await assembleMikoPlugins(projectWithOptionalCapabilitiesDisabled())
  expect(mocks.componentsFactory).not.toHaveBeenCalled()
  expect(mocks.unoFactory).not.toHaveBeenCalled()
  expect(mocks.legacyFactory).not.toHaveBeenCalled()
  expect(mocks.devtoolsFactory).not.toHaveBeenCalled()
  expect(result.order).toEqual([
    'miko:ssr-css',
    'miko:vue',
    'miko:runtime',
    'miko:layouts',
    'miko:linter',
    'miko:bootstrap',
    'miko:external-resolve',
    'miko:html-entry',
  ])
})
```

- [ ] **Step 2: Verify RED**

Expected: imports and framework scanning occur at module load.

- [ ] **Step 3: Split external resolution from CDN mapping**

Replace module-load work with:

```ts
export function externalResolvePlugin(root: string): Plugin

export async function externalCdnPlugin(
  additionalExternals: string[] = [],
): Promise<PluginOption[]>

export async function externalPlugin(
  rootOrEnableCDN: string | boolean = process.cwd(),
  enableCDN = false,
  additionalExternals: string[] = [],
): Promise<PluginOption[]>
```

`externalResolvePlugin()` must not import `vite-plugin-external`, scan framework modules, or resolve `@minar-kotonoha/framework`. `externalCdnPlugin()` performs those operations only after CDN capability validation has succeeded.

The legacy boolean overload remains source-compatible in the major branch but becomes async.

- [ ] **Step 4: Make optional Miko factories async**

Use dynamic imports after the capability guard:

```ts
export async function componentPlugins(project: ResolvedMikoConfig): Promise<PluginOption> {
  if (project.miko.componentsPluginOptions === false) return []
  const [{ default: Components }, resolvers] = await Promise.all([
    import('unplugin-vue-components/vite'),
    import('unplugin-vue-components/resolvers'),
  ])
  // construct the configured plugin
}
```

Apply the same pattern to UnoCSS, Legacy, DevTools, Janus, and CDN. Compute independent optional groups with `Promise.all`, then append results in the existing fixed order. Do not make mandatory Vue/Router/Bootstrap/HTML plugins optional.

- [ ] **Step 5: Verify behavior and measure**

Run:

```sh
bun run test:packages -- packages/vite-plugin-external/index.test.ts packages/vite-plugin-miko/plugins/order.test.ts packages/vite-plugin-miko/config/factory.test.ts
bun run typecheck:packages
bun run perf:measure
```

Expected:

- Default project plugin order is unchanged except disabled groups remain omitted.
- Default build has no CDN mapping scan.
- Doctor/build cold startup is lower or neutral; if timing is worse by more than the 10% budget, revert the parallel import portion while retaining correct lazy guards.

- [ ] **Step 6: Commit**

```sh
git add packages/vite-plugin-external/index.ts packages/vite-plugin-external/index.test.ts packages/vite-plugin-miko/plugins/conventions.ts packages/vite-plugin-miko/plugins/integrations.ts packages/vite-plugin-miko/plugins/index.ts packages/vite-plugin-miko/plugins/order.test.ts packages/vite-plugin-miko/config/factory.test.ts
git commit -m "perf(miko): lazy-load optional integrations"
```

---

### Task 6: Remove unnecessary SPA ClientOnly and empty SSG state

**Files:**

- Modify: `packages/vite-plugin-miko/template/App.vue`
- Modify: `packages/vite-plugin-miko/template/App.test.ts`
- Modify: `packages/vite-plugin-miko/plugins/runtime.ts`
- Modify: `packages/vite-plugin-miko/plugins/runtime.test.ts`
- Create: `packages/vite-plugin-miko/ssg/state.ts`
- Create: `packages/vite-plugin-miko/ssg/state.test.ts`
- Modify: `packages/vite-plugin-miko/index.ts`
- Modify: `packages/vite-plugin-miko/config/factory.integration.test.ts`
- Modify: `packages/vite-plugin-miko/package.json`

- [ ] **Step 1: Write failing runtime output tests**

Assert:

```ts
it('does not wrap every SPA route in ClientOnly', async () => {
  const source = await readFile(new URL('./App.vue', import.meta.url), 'utf8')
  expect(source).not.toContain('isSpaMode')
  expect(source).toContain('route.meta.clientOnly === true')
})

it('deletes empty Pinia state after SSG bootstrap', () => {
  const code = createRuntimeModule({ pinia: true })
  expect(code).toContain('Object.keys(piniaState).length')
  expect(code).toContain('delete initialState.pinia')
})

it('removes only an exactly empty ViteSSG state script', () => {
  expect(stripEmptyInitialState('<script>window.__INITIAL_STATE__=\"{}\"</script>')).toBe('')
  expect(
    stripEmptyInitialState(
      '<script>window.__INITIAL_STATE__=\"{\\\\\"pinia\\\\\":{\\\\\"cart\\\\\":{\\\\\"count\\\\\":1}}}\"</script>',
    ),
  ).toContain('count')
})
```

- [ ] **Step 2: Verify RED**

Run the three test files. Expected: current SPA-wide condition and empty Pinia serialization fail.

- [ ] **Step 3: Simplify the App shell**

Remove `computed`, `isSpaMode`, and `useClientOnly`. Render:

```vue
<ClientOnly v-if="route.meta.clientOnly === true">
  <component :is="Component" />
</ClientOnly>
<component :is="Component" v-else />
```

SPA already runs only in the browser, so it does not need the SSR-only compatibility wrapper.

- [ ] **Step 4: Remove empty state without deleting real state**

Generated runtime behavior:

```ts
afterBootstrap() {
  if (!import.meta.env.SSR || !initialState) return
  const piniaState = pinia.state.value
  if (Object.keys(piniaState).length > 0) initialState.pinia = piniaState
  else delete initialState.pinia
}
```

Compose the user's `ssgOptions.onPageRendered` first, then remove only the exact empty state script from its returned HTML. Do not use a broad script regex.

Add `ssg/` to the Miko package `files` allow-list and extend the package-content test so `ssg/state.ts` ships while `*.test.ts` remains excluded.

- [ ] **Step 5: Verify real SPA and SSG output**

Extend the real integration build to assert:

- SPA bootstrap still runs once.
- SPA page renders without a `ClientOnly` placeholder cycle.
- Empty-state SSG HTML contains no `window.__INITIAL_STATE__`.
- Non-empty Pinia state still serializes and hydrates.
- Head title/meta occur once.

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/template/App.test.ts packages/vite-plugin-miko/plugins/runtime.test.ts packages/vite-plugin-miko/ssg/state.test.ts packages/vite-plugin-miko/config/factory.integration.test.ts
bun run perf:measure
```

- [ ] **Step 6: Commit**

```sh
git add packages/vite-plugin-miko/template/App.vue packages/vite-plugin-miko/template/App.test.ts packages/vite-plugin-miko/plugins/runtime.ts packages/vite-plugin-miko/plugins/runtime.test.ts packages/vite-plugin-miko/ssg packages/vite-plugin-miko/index.ts packages/vite-plugin-miko/config/factory.integration.test.ts packages/vite-plugin-miko/package.json
git commit -m "perf(miko): minimize hydration overhead"
```

---

### Task 7: Overlap safe build preparation and emit deployment manifests

**Files:**

- Create: `packages/cli/static-manifest.ts`
- Create: `packages/cli/static-manifest.test.ts`
- Modify: `packages/cli/build.ts`
- Create: `packages/cli/build.test.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/package.test.ts`

- [ ] **Step 1: Write failing manifest tests**

Define:

```ts
export interface StaticAssetRecord {
  file: string
  bytes: number
  cacheControl: 'no-cache' | 'public, max-age=31536000, immutable'
}

export interface StaticDeploymentManifest {
  base: string
  routes: string[]
  assets: StaticAssetRecord[]
}

export async function writeStaticDeploymentManifest(
  outDir: string,
  base: string,
): Promise<StaticDeploymentManifest>
```

Test:

- `index.html` becomes `/`.
- `about.html` becomes `/about`.
- `docs/index.html` becomes `/docs/`.
- hashed assets receive immutable cache guidance.
- HTML and unhashed files receive `no-cache`.
- `.miko/routes.json` and `.miko/assets.json` are sorted and deterministic.
- paths outside `outDir` are never read or removed.

- [ ] **Step 2: Write failing build orchestration tests**

Extract:

```ts
export async function prepareApplicationBuild(
  project: ResolvedMikoConfig,
  runTypecheck: () => Promise<void>,
): Promise<UserConfig>
```

Use deferred promises to prove type checking and `createMikoViteConfig(project)` start before either finishes, while Vite build starts only after both complete.

- [ ] **Step 3: Verify RED**

Run:

```sh
bun run test:packages -- packages/cli/static-manifest.test.ts packages/cli/build.test.ts
```

- [ ] **Step 4: Implement bounded preparation**

Use:

```ts
const [config] = await Promise.all([
  createMikoViteConfig(project),
  runTypecheck(),
])
```

Do not run Vite build concurrently with type checking. Register the CSS loader once after preparation and before SSG server build.

After a successful SPA or SSG build:

```ts
await writeStaticDeploymentManifest(project.outDir, String(config.base ?? '/'))
```

Do not write manifests for library mode.

- [ ] **Step 5: Publish the new CLI runtime file**

Add `static-manifest.ts` to the CLI `files` list and its package-content test.

- [ ] **Step 6: Verify real output**

Run:

```sh
cd app
bun run build
```

Expected:

- `.miko/routes.json` lists `/`, `/page1`, and `/page2`.
- `.miko/assets.json` marks hashed JS/CSS immutable and HTML no-cache.
- Existing `/cms/assets/` URLs remain unchanged.
- No default CDN or Legacy assets appear.

- [ ] **Step 7: Measure and commit**

Run `bun run perf:measure`. Keep the overlap only if cold/warm build medians remain within budget and peak RSS does not regress over 10%.

```sh
git add packages/cli/static-manifest.ts packages/cli/static-manifest.test.ts packages/cli/build.ts packages/cli/build.test.ts packages/cli/package.json packages/cli/package.test.ts
git commit -m "perf(miko): streamline application builds"
```

---

### Task 8: Enforce route splitting, production cleanliness, and performance budgets

**Files:**

- Modify: `packages/vite-plugin-miko/config/factory.integration.test.ts`
- Modify: `packages/performance/index.ts`
- Modify: `.gitignore`
- Create: `packages/performance/README.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.remember/now.md`

- [ ] **Step 1: Add real bundle/request assertions**

Extend the Runtime fixture integration test:

```ts
expect(initialScriptUrls.some(url => url.includes('unvisited'))).toBe(false)
await page.getByRole('link', { name: 'Deep route' }).click()
await page.waitForSelector('#deep-route-marker')
expect(requestedScripts.some(url => url.includes(deepRouteChunkName))).toBe(true)
```

Also inspect production output and assert:

- no `vite-plugin-vue-devtools` marker;
- no Miko Doctor/benchmark code;
- no Legacy polyfill when Legacy is disabled;
- no framework CDN URL when CDN is disabled;
- no user-unconfigured `manualChunks`;
- content-hashed JS/CSS names.

- [ ] **Step 2: Verify the assertions fail for any intentionally injected regression**

Temporarily make the test fixture eagerly import the unvisited route, run the test, and observe the request-topology failure. Revert the intentional regression before implementation continues.

- [ ] **Step 3: Implement `measure` and `check` commands**

`measure` writes:

```text
packages/performance/results/miko-v1-slice-3-current.json
```

The results directory is gitignored. `check` loads the committed baseline, requires an environment match, runs fresh measurements, prints every percentage delta, and exits 1 on a budget failure.

Add this root ignore rule:

```gitignore
packages/performance/results/
```

Example text output:

```text
Miko Performance
Environment: compatible
runtime.hydrationMs: 41.2 -> 37.8 (-8.25%) PASS
runtime.unvisitedRouteRequested: false PASS
build.small.warmMs: 1910 -> 1844 (-3.46%) PASS
```

- [ ] **Step 4: Record final measurements**

Run:

```sh
bun run perf:measure
bun run perf:check
```

Expected:

- JS/CSS, hydration, route navigation, FCP/LCP, script duration, requests, and transfer bytes do not regress over 5%.
- cold/warm build and peak RSS do not regress over 10%.
- unvisited route remains absent from the first-route request chain.
- any optimization that fails its target without a compensating approved benefit is reverted.

- [ ] **Step 5: Document reproduction and boundaries**

Document:

- Bun is the benchmark/package runner; every Miko build under test is launched by `process.execPath`.
- exact sample counts and median rules;
- environment matching;
- cache directories cleared for cold samples;
- browser viewport and Chromium requirements;
- deployment manifests are recommendations, not an HTTP server;
- no default manual chunk configuration.

Append project memory:

```markdown
## 2026-08-07 | Miko v1 Slice 3

Added Node-driven build and Playwright runtime baselines with raw samples and relative gates. Optional plugins load only when enabled, default builds skip framework CDN mapping work, SPA no longer uses a full-route ClientOnly wrapper, empty SSG state is removed, and application builds emit deterministic route/asset deployment manifests.
```

- [ ] **Step 6: Run Slice 3 acceptance**

```sh
bun install --frozen-lockfile
bun run test:packages
bun run typecheck:packages
bunx oxlint packages
bunx eslint packages/cli packages/vite-plugin-miko packages/vite-plugin-external packages/performance
cd app
bun run test:unit -- --run --passWithNoTests
bun run build
cd ..
bun run perf:check
```

Inspect:

```sh
rg -n "framework\\.umd\\.js|VITE_FRAMEWORK_CDN" app/dist -g "*.html" -g "*.js"
rg -n "vite-plugin-vue-devtools|MIKO_PERF_RESULT" app/dist -g "*.js"
rg -n "\"pinia\":\\{\\}|window\\.__INITIAL_STATE__=\"\\{\\}\"" app/dist -g "*.html"
```

Expected: no default CDN, DevTools, benchmark marker, or empty state matches.

- [ ] **Step 7: Inspect publish contents**

Run Bun publish dry-runs for CLI, Miko plugin, and external plugin. Confirm:

- CLI contains `static-manifest.ts`.
- Miko contains `ssg/state.ts` and excludes all tests.
- External contains only runtime files.
- Private `@minar-kotonoha/performance` cannot publish.

- [ ] **Step 8: Final diff and commit**

Stage exact documentation and benchmark files only:

```sh
git add .gitignore README.md AGENTS.md CLAUDE.md packages/performance/README.md packages/performance/index.ts packages/vite-plugin-miko/config/factory.integration.test.ts
git commit -m "perf!: enforce miko build and runtime budgets"
```

Do not stage `.omc/`, `app/.env.test`, `app/preview.log.err`, generated `packages/performance/results/`, or ignored `.remember/now.md`.

---

## Plan self-review

- Spec coverage: build/runtime raw baselines, fixture sizes, sample counts, medians, environment fingerprint, build time, peak RSS, JS/CSS/HTML bytes, FCP/LCP, script duration, hydration proxy, navigation, requests, lazy routes, static manifests, cache boundaries, and 5%/10% gates all have implementation tasks.
- Scope boundary: white-screen monitoring, `miko check`, migration tooling, and release remain Slice 4.
- Simplicity: no custom chunking, router, hydration runtime, proxy, cache server, or always-on production instrumentation is introduced.
- Type consistency: `PerformanceReport`, `BuildMetrics`, `RuntimeMetrics`, `GeneratedFixture`, `StaticDeploymentManifest`, and their command/file names remain consistent across tasks.
- Placeholder scan: no TBD/TODO, unspecified error-handling step, or “similar to another task” instruction remains.
