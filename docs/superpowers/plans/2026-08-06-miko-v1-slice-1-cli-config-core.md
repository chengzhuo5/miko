# Miko V1 Slice 1 CLI and Unified Configuration Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the implicit environment-variable/dynamic-import CLI flow with one testable Node.js command pipeline and one optional `miko.config.ts` that contains both Miko and complete Vite configuration.

**Architecture:** Introduce a pure configuration core under `packages/vite-plugin-miko/config/`, keep plugin assembly behind an adapter, and make CLI commands receive an explicit root/mode/context instead of reading module-level `process.cwd()` or `MIKO_*` state. The HTML plugin keeps Vite rooted at the real application directory, uses a user `index.html` when present, and otherwise supplies the same `<viteRoot>/index.html` ID from memory. This slice deliberately does not implement automatic capability detection, performance optimizations, browser white-screen checks, or migration; it creates the stable interfaces those slices will use.

**Tech Stack:** TypeScript, Node.js 20.19+, Bun workspaces, jiti, Vite 8, Vitest 4, Vue 3, vite-ssg.

**Design spec:** `docs/superpowers/specs/2026-08-06-miko-major-modernization-design.md`

---

## Locked File Structure

Create:

```text
vitest.config.ts
packages/vite-plugin-miko/config/
├─ define.ts
├─ errors.ts
├─ index.ts
├─ load.ts
├─ merge.ts
├─ resolve.ts
├─ types.ts
├─ define.test.ts
├─ factory.test.ts
├─ load.test.ts
├─ merge.test.ts
└─ resolve.test.ts
packages/vite-plugin-index-html/
├─ html.ts
├─ html.test.ts
└─ index.test.ts
packages/vite-plugin-bootstrap/
└─ index.test.ts
packages/cli/
├─ args.ts
├─ args.test.ts
├─ context.ts
├─ context.test.ts
├─ errors.ts
├─ process.ts
├─ run.ts
├─ run.test.ts
├─ tsconfig.json
└─ commands/
   ├─ build.ts
   ├─ dev.ts
   └─ preview.ts
packages/cli/test/
├─ cli.integration.test.ts
└─ fixtures/
   ├─ zero-config/
   │  ├─ package.json
   │  └─ pages/index.vue
   ├─ spa-config/
   │  ├─ miko.config.ts
   │  ├─ package.json
   │  └─ pages/index.vue
   ├─ user-html/
   │  ├─ index.html
   │  ├─ miko.config.ts
   │  ├─ package.json
   │  └─ pages/index.vue
   └─ invalid-config/
      ├─ miko.config.ts
      └─ package.json
```

Modify:

```text
package.json
bun.lock
packages/vite-plugin-miko/index.ts
packages/vite-plugin-miko/package.json
packages/vite-plugin-miko/tsconfig.json
packages/vite-plugin-index-html/index.ts
packages/vite-plugin-index-html/package.json
packages/vite-plugin-index-html/README.md
packages/vite-plugin-index-html/tsconfig.json
packages/vite-plugin-bootstrap/index.ts
packages/vite-plugin-bootstrap/tsconfig.json
packages/vite-plugin-miko/template/index.html
packages/cli/index.ts
packages/cli/build.ts
packages/cli/dev.ts
packages/cli/preview.ts
packages/cli/env.ts
packages/cli/env.test.ts
packages/cli/package.json
app/miko.config.ts
```

Delete:

```text
app/vite.config.ts
```

Do not stage or modify the existing user-owned `.omc/**`, `app/.env.test`, or `app/preview.log.err` files.

---

### Task 1: Establish the package-level test harness

**Files:**

- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `packages/cli/env.test.ts`

- [ ] **Step 1: Add a root Vitest configuration**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
  },
})
```

- [ ] **Step 2: Add non-mutating root scripts**

Add this `scripts` block to the root `package.json`:

```json
{
  "scripts": {
    "test:packages": "vitest run --config vitest.config.ts",
    "test:packages:watch": "vitest --config vitest.config.ts",
    "typecheck:packages": "vue-tsc --noEmit -p tsconfig.builder.json && vue-tsc --noEmit -p packages/vite-plugin-bootstrap/tsconfig.json && vue-tsc --noEmit -p packages/vite-plugin-index-html/tsconfig.json && vue-tsc --noEmit -p packages/vite-plugin-miko/tsconfig.json"
  }
}
```

- [ ] **Step 3: Run the existing CLI environment tests**

Run:

```sh
bun run test:packages -- packages/cli/env.test.ts
```

Expected: 11 tests pass.

- [ ] **Step 4: Run package type checking**

Run:

```sh
bun run typecheck:packages
```

Expected: exit code 0. If current source errors are exposed, record them before proceeding; do not weaken TypeScript settings.

- [ ] **Step 5: Commit the test harness**

```sh
git add package.json vitest.config.ts
git commit -m "test: add package-level vitest harness"
```

---

### Task 2: Define the new public configuration contract

**Files:**

- Create: `packages/vite-plugin-miko/config/types.ts`
- Create: `packages/vite-plugin-miko/config/define.ts`
- Create: `packages/vite-plugin-miko/config/define.test.ts`
- Modify: `packages/vite-plugin-miko/tsconfig.json`

- [ ] **Step 1: Write failing tests for the identity helper**

```ts
// packages/vite-plugin-miko/config/define.test.ts
import { describe, expect, it } from 'vitest'
import { defineMikoConfig } from './define'

describe('defineMikoConfig', () => {
  it('returns an empty object when called without arguments', () => {
    expect(defineMikoConfig()).toEqual({})
  })

  it('returns the same object without mutation', () => {
    const config = {
      miko: { rendering: 'spa' as const },
      vite: { base: '/cms/' },
    }

    expect(defineMikoConfig(config)).toBe(config)
  })

  it('returns the same config function', () => {
    const config = () => ({ miko: { rendering: 'ssg' as const } })

    expect(defineMikoConfig(config)).toBe(config)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/define.test.ts
```

Expected: FAIL because `./define` does not exist.

- [ ] **Step 3: Add the configuration types**

```ts
// packages/vite-plugin-miko/config/types.ts
import type { UserConfig } from 'vite'
import type {
  BootstrapOptions,
  ComponentsOptions,
  DevOptions,
  ExternalOptions,
  JanusOptions,
  LayoutsUserOptions,
  LegacyOptions,
  LibConfig,
  LinterOptions,
  SSGConfig,
  UnoCSSVitePluginConfig,
  VueJsxOptions,
  VueOptions,
  VueRouterOptions,
} from '../types'

export type MikoCommand = 'dev' | 'build' | 'preview' | 'check' | 'doctor'
export type MikoRendering = 'ssg' | 'spa'
export type Awaitable<T> = T | Promise<T>

export interface MikoConfigEnv {
  command: MikoCommand
  mode: string
  root: string
}

export interface MikoOptions {
  rendering?: MikoRendering
  template?: string
  entry?: string
  pagesDir?: string
  uiLibrary?: 'vant' | 'element-plus'
  layout?: string
  lib?: LibConfig
  vuePluginOptions?: VueOptions
  vueJsxPluginOptions?: VueJsxOptions
  routerPluginOptions?: VueRouterOptions
  layoutsPluginOptions?: LayoutsUserOptions | false
  componentsPluginOptions?: ComponentsOptions | false
  unoCSSPluginOptions?: UnoCSSVitePluginConfig | false
  legacyPluginOptions?: LegacyOptions | false
  ssgOptions?: SSGConfig
  linterOptions?: LinterOptions | false
  bootstrapOptions?: BootstrapOptions
  externalOptions?: ExternalOptions | false
  devOptions?: DevOptions
  janusOptions?: JanusOptions | false
}

export interface MikoConfig {
  miko?: MikoOptions
  vite?: UserConfig
}

export type MikoConfigFactory = (env: MikoConfigEnv) => Awaitable<MikoConfig>
export type MikoConfigExport = MikoConfig | MikoConfigFactory

export interface LoadedMikoConfig {
  config: MikoConfig
  configFile: string | null
}

export interface ResolvedMikoOptions
  extends Required<Pick<MikoOptions, 'rendering' | 'template' | 'entry' | 'pagesDir' | 'uiLibrary' | 'layout'>> {
  lib?: LibConfig
  vuePluginOptions: VueOptions
  vueJsxPluginOptions: VueJsxOptions
  routerPluginOptions: VueRouterOptions
  layoutsPluginOptions: LayoutsUserOptions | false
  componentsPluginOptions: ComponentsOptions | false
  unoCSSPluginOptions: UnoCSSVitePluginConfig | false
  legacyPluginOptions: LegacyOptions | false
  ssgOptions: SSGConfig
  linterOptions: LinterOptions | false
  bootstrapOptions: BootstrapOptions
  externalOptions: ExternalOptions | false
  devOptions: DevOptions
  janusOptions: JanusOptions | false
}

export interface ResolvedMikoConfig {
  env: MikoConfigEnv
  configFile: string | null
  viteRoot: string
  miko: ResolvedMikoOptions
  vite: UserConfig
  outDir: string
}
```

- [ ] **Step 4: Implement the pure helper**

```ts
// packages/vite-plugin-miko/config/define.ts
import type { MikoConfig, MikoConfigExport } from './types'

export function defineMikoConfig(): MikoConfig
export function defineMikoConfig<T extends MikoConfigExport>(config: T): T
export function defineMikoConfig(config: MikoConfigExport = {}): MikoConfigExport {
  return config
}
```

- [ ] **Step 5: Include the new folder in TypeScript**

Change `packages/vite-plugin-miko/tsconfig.json` to:

```json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "esnext",
    "lib": ["esnext", "dom"],
    "strict": true,
    "types": ["node", "vite/client"]
  },
  "include": ["index.ts", "types.ts", "config/**/*.ts"]
}
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/define.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit the public contract**

```sh
git add packages/vite-plugin-miko/config packages/vite-plugin-miko/tsconfig.json
git commit -m "feat(config): define unified miko config contract"
```

---

### Task 3: Load `miko.config.ts` without swallowing errors

**Files:**

- Create: `packages/vite-plugin-miko/config/errors.ts`
- Create: `packages/vite-plugin-miko/config/load.ts`
- Create: `packages/vite-plugin-miko/config/load.test.ts`
- Modify: `packages/vite-plugin-miko/package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Write failing loader tests**

```ts
// packages/vite-plugin-miko/config/load.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadMikoConfig } from './load'
import type { MikoConfigEnv } from './types'

const roots: string[] = []
const env: MikoConfigEnv = {
  command: 'build',
  mode: 'production',
  root: '',
}

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), 'miko-config-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('loadMikoConfig', () => {
  it('returns an empty config when the file is absent', async () => {
    const root = await createRoot()

    await expect(loadMikoConfig({ ...env, root })).resolves.toEqual({
      config: {},
      configFile: null,
    })
  })

  it('loads an object export', async () => {
    const root = await createRoot()
    await writeFile(
      join(root, 'miko.config.ts'),
      `export default { miko: { rendering: 'spa' }, vite: { base: '/cms/' } }`,
    )

    const loaded = await loadMikoConfig({ ...env, root })

    expect(loaded.config.miko?.rendering).toBe('spa')
    expect(loaded.config.vite?.base).toBe('/cms/')
  })

  it('executes a config function with the stable context', async () => {
    const root = await createRoot()
    await writeFile(
      join(root, 'miko.config.ts'),
      `export default env => ({ vite: { define: { __MODE__: JSON.stringify(env.mode) } } })`,
    )

    const loaded = await loadMikoConfig({ ...env, root, mode: 'test' })

    expect(loaded.config.vite?.define?.__MODE__).toBe('"test"')
  })

  it('preserves syntax errors with the config file path', async () => {
    const root = await createRoot()
    await writeFile(join(root, 'miko.config.ts'), `export default { broken:`)

    await expect(loadMikoConfig({ ...env, root })).rejects.toMatchObject({
      code: 'MIKO_CONFIG_LOAD',
      file: join(root, 'miko.config.ts'),
    })
  })

  it('rejects legacy flat fields instead of silently ignoring them', async () => {
    const root = await createRoot()
    await writeFile(join(root, 'miko.config.ts'), `export default { base: '/legacy/' }`)

    await expect(loadMikoConfig({ ...env, root })).rejects.toMatchObject({
      code: 'MIKO_CONFIG_INVALID',
      file: join(root, 'miko.config.ts'),
      field: 'base',
    })
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/load.test.ts
```

Expected: FAIL because `./load` does not exist.

- [ ] **Step 3: Add a structured configuration error**

```ts
// packages/vite-plugin-miko/config/errors.ts
export class MikoConfigError extends Error {
  readonly code: string
  readonly file?: string
  readonly field?: string

  constructor(options: {
    code: string
    message: string
    file?: string
    field?: string
    cause?: unknown
  }) {
    super(options.message, { cause: options.cause })
    this.name = 'MikoConfigError'
    this.code = options.code
    this.file = options.file
    this.field = options.field
  }
}
```

- [ ] **Step 4: Implement the jiti loader and minimal runtime validation**

```ts
// packages/vite-plugin-miko/config/load.ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { MikoConfigError } from './errors'
import type { LoadedMikoConfig, MikoConfig, MikoConfigEnv, MikoConfigExport } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateConfig(value: unknown, file: string): MikoConfig {
  if (!isRecord(value)) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      message: 'miko.config.ts 必须导出一个对象或返回对象的函数',
    })
  }

  const unknownFields = Object.keys(value).filter(key => key !== 'miko' && key !== 'vite')
  if (unknownFields.length > 0) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: unknownFields[0],
      message: `未知顶层字段 "${unknownFields[0]}"；请放入 miko 或 vite 命名空间`,
    })
  }

  if (value.miko !== undefined && !isRecord(value.miko)) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: 'miko',
      message: 'miko 字段必须是对象',
    })
  }

  if (value.vite !== undefined && !isRecord(value.vite)) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: 'vite',
      message: 'vite 字段必须是对象',
    })
  }

  const rendering = (value.miko as { rendering?: unknown } | undefined)?.rendering
  if (rendering !== undefined && rendering !== 'spa' && rendering !== 'ssg') {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: 'miko.rendering',
      message: `miko.rendering 只能是 "spa" 或 "ssg"`,
    })
  }

  return value as MikoConfig
}

export async function loadMikoConfig(env: MikoConfigEnv): Promise<LoadedMikoConfig> {
  const configFile = resolve(env.root, 'miko.config.ts')
  if (!existsSync(configFile)) return { config: {}, configFile: null }

  try {
    const jiti = createJiti(import.meta.url, { interopDefault: true })
    const moduleValue = await jiti.import(configFile)
    const exported = (
      isRecord(moduleValue) && 'default' in moduleValue
        ? moduleValue.default
        : moduleValue
    ) as MikoConfigExport
    const value = typeof exported === 'function' ? await exported(env) : exported

    return {
      config: validateConfig(value, configFile),
      configFile,
    }
  } catch (error) {
    if (error instanceof MikoConfigError) throw error
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_LOAD',
      file: configFile,
      message: `无法加载 ${configFile}`,
      cause: error,
    })
  }
}
```

- [ ] **Step 5: Add jiti to the package that owns configuration loading**

Add to `packages/vite-plugin-miko/package.json` dependencies:

```json
{
  "jiti": "^2.7.0"
}
```

Run:

```sh
bun install
```

Expected: `bun.lock` records `jiti` as a runtime dependency of `@minar-kotonoha/vite-plugin-miko`.

- [ ] **Step 6: Run the loader tests and verify GREEN**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/load.test.ts
```

Expected: 5 tests pass, including syntax-error preservation and rejection of legacy flat fields.

- [ ] **Step 7: Commit the loader**

```sh
git add bun.lock packages/vite-plugin-miko/config packages/vite-plugin-miko/package.json
git commit -m "feat(config): load miko config with actionable errors"
```

---

### Task 4: Implement field-aware Vite configuration merging

**Files:**

- Create: `packages/vite-plugin-miko/config/merge.ts`
- Create: `packages/vite-plugin-miko/config/merge.test.ts`

- [ ] **Step 1: Write failing merge tests**

```ts
// packages/vite-plugin-miko/config/merge.test.ts
import { describe, expect, it } from 'vitest'
import { mergeViteConfig } from './merge'

describe('mergeViteConfig', () => {
  it('deep-merges ordinary objects', () => {
    const result = mergeViteConfig(
      { build: { outDir: 'dist', sourcemap: false } },
      { build: { sourcemap: true } },
    )

    expect(result.build).toMatchObject({ outDir: 'dist', sourcemap: true })
  })

  it('merges aliases by find with user precedence', () => {
    const result = mergeViteConfig(
      { resolve: { alias: [{ find: '@', replacement: '/default' }] } },
      {
        resolve: {
          alias: {
            '@': '/user',
            '~': '/shared',
          },
        },
      },
    )

    expect(result.resolve?.alias).toEqual([
      { find: '@', replacement: '/user' },
      { find: '~', replacement: '/shared' },
    ])
  })

  it('deduplicates include and exclude lists', () => {
    const result = mergeViteConfig(
      { optimizeDeps: { include: ['vue'], exclude: ['vant'] } },
      { optimizeDeps: { include: ['vue', 'pinia'], exclude: ['vant'] } },
    )

    expect(result.optimizeDeps?.include).toEqual(['vue', 'pinia'])
    expect(result.optimizeDeps?.exclude).toEqual(['vant'])
  })

  it('rejects an optimizeDeps include/exclude conflict', () => {
    expect(() =>
      mergeViteConfig(
        { optimizeDeps: { include: ['vue'] } },
        { optimizeDeps: { exclude: ['vue'] } },
      ),
    ).toThrow(/optimizeDeps.*vue/)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/merge.test.ts
```

Expected: FAIL because `./merge` does not exist.

- [ ] **Step 3: Implement the field-aware merger**

```ts
// packages/vite-plugin-miko/config/merge.ts
import { mergeConfig } from 'vite'
import type { Alias, AliasOptions, PluginOption, UserConfig } from 'vite'
import { MikoConfigError } from './errors'

function unique(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined
  return [...new Set(values)]
}

function normalizeAlias(alias: AliasOptions | undefined): Alias[] {
  if (!alias) return []
  if (Array.isArray(alias)) return [...alias]
  return Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))
}

function aliasKey(alias: Alias): string {
  return typeof alias.find === 'string' ? alias.find : alias.find.toString()
}

function mergeAlias(base: AliasOptions | undefined, user: AliasOptions | undefined): Alias[] | undefined {
  const result = new Map<string, Alias>()
  for (const alias of normalizeAlias(base)) result.set(aliasKey(alias), alias)
  for (const alias of normalizeAlias(user)) result.set(aliasKey(alias), alias)
  return result.size > 0 ? [...result.values()] : undefined
}

function flattenPlugins(options: PluginOption[] | undefined): PluginOption[] {
  if (!options) return []
  return options.flat(Infinity).filter(Boolean) as PluginOption[]
}

export function mergeViteConfig(base: UserConfig, user: UserConfig): UserConfig {
  const merged = mergeConfig(base, user)
  const include = unique([...(base.optimizeDeps?.include ?? []), ...(user.optimizeDeps?.include ?? [])])
  const exclude = unique([...(base.optimizeDeps?.exclude ?? []), ...(user.optimizeDeps?.exclude ?? [])])
  const conflicts = include?.filter(id => exclude?.includes(id)) ?? []

  if (conflicts.length > 0) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.optimizeDeps',
      message: `optimizeDeps 同时 include/exclude: ${conflicts.join(', ')}`,
    })
  }

  return {
    ...merged,
    plugins: [...flattenPlugins(base.plugins), ...flattenPlugins(user.plugins)],
    resolve: {
      ...merged.resolve,
      alias: mergeAlias(base.resolve?.alias, user.resolve?.alias),
    },
    optimizeDeps: {
      ...merged.optimizeDeps,
      include,
      exclude,
    },
  }
}
```

- [ ] **Step 4: Run the merge tests and verify GREEN**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/merge.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the merger**

```sh
git add packages/vite-plugin-miko/config
git commit -m "feat(config): add field-aware vite config merging"
```

---

### Task 5: Resolve paths and defaults without module-level `cwd`

**Files:**

- Create: `packages/vite-plugin-miko/config/resolve.ts`
- Create: `packages/vite-plugin-miko/config/resolve.test.ts`

- [ ] **Step 1: Write failing resolver tests**

```ts
// packages/vite-plugin-miko/config/resolve.test.ts
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveMikoConfig } from './resolve'

const env = {
  command: 'build' as const,
  mode: 'production',
  root: 'D:/projects/demo',
}

describe('resolveMikoConfig', () => {
  it('uses SSG and conventional paths by default', () => {
    const result = resolveMikoConfig(
      { config: {}, configFile: null },
      env,
      'D:/packages/miko/template',
    )

    expect(result.miko.rendering).toBe('ssg')
    expect(result.miko.pagesDir).toBe(resolve(env.root, 'pages'))
    expect(result.outDir).toBe(resolve(env.root, 'dist'))
  })

  it('uses vite.root for Vite-relative conventions without changing config lookup root', () => {
    const result = resolveMikoConfig(
      {
        config: {
          miko: {
            entry: 'src/main.ts',
            pagesDir: 'src/pages',
            rendering: 'spa',
          },
          vite: { root: 'app', build: { outDir: 'output' } },
        },
        configFile: null,
      },
      env,
      'D:/packages/miko/template',
    )

    expect(result.viteRoot).toBe(resolve(env.root, 'app'))
    expect(result.vite.root).toBe(resolve(env.root, 'app'))
    expect(result.vite.build?.outDir).toBe(resolve(env.root, 'app/output'))
    expect(result.miko.entry).toBe(resolve(env.root, 'app/src/main.ts'))
    expect(result.miko.pagesDir).toBe(resolve(env.root, 'app/src/pages'))
    expect(result.outDir).toBe(resolve(env.root, 'app/output'))
    expect(result.miko.rendering).toBe('spa')
  })

  it('deep-merges built-in SSG options with user options', () => {
    const result = resolveMikoConfig(
      {
        config: {
          miko: {
            ssgOptions: {
              dirStyle: 'nested',
            },
          },
        },
        configFile: null,
      },
      env,
      'D:/packages/miko/template',
    )

    expect(result.miko.ssgOptions.dirStyle).toBe('nested')
    expect(result.miko.ssgOptions.beastiesOptions).toEqual({ external: false })
  })

  it('rejects application input overrides owned by Miko', () => {
    expect(() =>
      resolveMikoConfig(
        {
          config: {
            vite: {
              input: 'src/custom.html',
            },
          },
          configFile: null,
        },
        env,
        'D:/packages/miko/template',
      ),
    ).toThrow(/vite\.input/)

    expect(() =>
      resolveMikoConfig(
        {
          config: {
            vite: {
              build: {
                rollupOptions: {
                  input: 'src/custom.html',
                },
              },
            },
          },
          configFile: null,
        },
        env,
        'D:/packages/miko/template',
      ),
    ).toThrow(/build\.rollupOptions\.input/)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/resolve.test.ts
```

Expected: FAIL because `./resolve` does not exist.

- [ ] **Step 3: Implement deterministic default resolution**

```ts
// packages/vite-plugin-miko/config/resolve.ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { remove } from 'fs-extra'
import { mergeConfig } from 'vite'
import type { UserConfig } from 'vite'
import { MikoConfigError } from './errors'
import type { LoadedMikoConfig, MikoConfigEnv, ResolvedMikoConfig } from './types'

function mergeOptions<T extends object>(defaults: T, user: object | undefined): T {
  return mergeConfig(defaults as UserConfig, (user ?? {}) as UserConfig) as T
}

export function resolveMikoConfig(
  loaded: LoadedMikoConfig,
  env: MikoConfigEnv,
  bundledTemplate: string,
): ResolvedMikoConfig {
  const raw = loaded.config.miko ?? {}
  const vite = loaded.config.vite ?? {}

  if (vite.input !== undefined) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.input',
      message: 'SPA/SSG 应用入口由 Miko 管理，请通过根目录 index.html 自定义页面外壳',
    })
  }

  if (vite.build?.rollupOptions?.input !== undefined) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.build.rollupOptions.input',
      message: 'SPA/SSG 应用入口由 Miko 管理，请通过根目录 index.html 自定义页面外壳',
    })
  }

  const viteRoot = resolve(env.root, vite.root ?? '.')
  const localTemplate = resolve(viteRoot, 'template')
  const template = resolve(
    viteRoot,
    raw.template ?? (existsSync(localTemplate) ? localTemplate : bundledTemplate),
  )
  const pagesDir = resolve(viteRoot, raw.pagesDir ?? 'pages')
  const outDirValue = vite.build?.outDir ?? 'dist'
  const outDir = resolve(viteRoot, outDirValue)
  const rendering = raw.rendering ?? 'ssg'
  const defaultSsgOptions = {
    beastiesOptions: { external: false },
    dirStyle: 'flat' as const,
    formatting: 'none' as const,
    includedRoutes(paths: string[]) {
      return paths.filter(path => !path.includes('node_modules'))
    },
    onPageRendered(_route: string, renderedHTML: string) {
      return renderedHTML
    },
    async onFinished() {
      await remove(resolve(outDir, '.vite'))
    },
  }
  const defaultComponents = {
    dirs: [resolve(viteRoot, 'components')],
    extensions: ['vue', 'tsx', 'ts'],
    dts: resolve(viteRoot, 'types/components.d.ts'),
  }

  return {
    env,
    configFile: loaded.configFile,
    viteRoot,
    outDir,
    vite: {
      ...vite,
      root: viteRoot,
      build: {
        ...vite.build,
        outDir,
      },
    },
    miko: {
      rendering,
      template,
      entry: resolve(viteRoot, raw.entry ?? resolve(template, 'main.ts')),
      pagesDir,
      uiLibrary: raw.uiLibrary ?? 'vant',
      layout: raw.layout ?? 'flexible',
      lib: raw.lib,
      vuePluginOptions: mergeOptions({}, raw.vuePluginOptions),
      vueJsxPluginOptions: mergeOptions({}, raw.vueJsxPluginOptions),
      routerPluginOptions: mergeOptions(
        {
          extensions: ['.vue', '.setup.tsx'],
          routesFolder: pagesDir,
          dts: resolve(viteRoot, 'types/routes.d.ts'),
        },
        raw.routerPluginOptions,
      ),
      layoutsPluginOptions: raw.layoutsPluginOptions === false
        ? false
        : mergeOptions({}, raw.layoutsPluginOptions),
      componentsPluginOptions: raw.componentsPluginOptions === false
        ? false
        : mergeOptions(defaultComponents, raw.componentsPluginOptions),
      unoCSSPluginOptions: raw.unoCSSPluginOptions === false
        ? false
        : mergeOptions({ configFile: false as const }, raw.unoCSSPluginOptions),
      legacyPluginOptions: raw.legacyPluginOptions ?? false,
      ssgOptions: mergeOptions(defaultSsgOptions, raw.ssgOptions),
      linterOptions: raw.linterOptions === false
        ? false
        : mergeOptions({ oxlint: true, eslint: true }, raw.linterOptions),
      bootstrapOptions: mergeOptions({ entryFile: 'index.ts' }, raw.bootstrapOptions),
      externalOptions: raw.externalOptions ?? false,
      devOptions: mergeOptions({ bundledDev: false }, raw.devOptions),
      janusOptions: raw.janusOptions === false
        ? false
        : mergeOptions({}, raw.janusOptions),
    },
  }
}
```

- [ ] **Step 4: Run the resolver tests and verify GREEN**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/resolve.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Add a single config barrel**

```ts
// packages/vite-plugin-miko/config/index.ts
export { defineMikoConfig } from './define'
export { MikoConfigError } from './errors'
export { loadMikoConfig } from './load'
export { mergeViteConfig } from './merge'
export { resolveMikoConfig } from './resolve'
export type * from './types'
```

- [ ] **Step 6: Commit resolution**

```sh
git add packages/vite-plugin-miko/config
git commit -m "feat(config): resolve project config from explicit root"
```

---

### Task 6: Provide a zero-config HTML entry without changing Vite root

**Files:**

- Create: `packages/vite-plugin-index-html/html.ts`
- Create: `packages/vite-plugin-index-html/html.test.ts`
- Create: `packages/vite-plugin-index-html/index.test.ts`
- Modify: `packages/vite-plugin-index-html/index.ts`
- Modify: `packages/vite-plugin-index-html/package.json`
- Modify: `packages/vite-plugin-index-html/README.md`
- Modify: `packages/vite-plugin-index-html/tsconfig.json`
- Modify: `packages/vite-plugin-miko/template/index.html`
- Modify: `bun.lock`

- [ ] **Step 1: Write failing HTML validation and injection tests**

```ts
// packages/vite-plugin-index-html/html.test.ts
import { describe, expect, it } from 'vitest'
import { createMikoEntryTags } from './html'

const shell = '<!doctype html><html><body><div id="app"></div></body></html>'

describe('createMikoEntryTags', () => {
  it('injects the Miko entry into a valid HTML shell', () => {
    expect(createMikoEntryTags(shell)).toEqual([
      {
        tag: 'script',
        attrs: {
          type: 'module',
          'data-miko-entry': '',
        },
        children: "import 'virtual:index'",
        injectTo: 'body',
      },
    ])
  })

  it('does not inject a second Miko entry', () => {
    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script type="module" data-miko-entry>import "virtual:index"</script></body></html>',
      ),
    ).toEqual([])

    expect(
      createMikoEntryTags(
        '<html><body><div id="app"></div><script type="module">import "virtual:index"</script></body></html>',
      ),
    ).toEqual([])
  })

  it('requires exactly one app mount node', () => {
    expect(() => createMikoEntryTags('<html><body></body></html>')).toThrow(
      /唯一的 #app.*当前找到 0 个/,
    )
    expect(() =>
      createMikoEntryTags(
        '<html><body><div id="app"></div><main id=app></main></body></html>',
      ),
    ).toThrow(/唯一的 #app.*当前找到 2 个/)
  })
})
```

- [ ] **Step 2: Write failing Vite build integration tests**

```ts
// packages/vite-plugin-index-html/index.test.ts
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build, createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { indexHTMLPlugin } from './index'

const roots: string[] = []
const servers: ViteDevServer[] = []

async function createFixture(userHtml?: string) {
  const root = await mkdtemp(join(tmpdir(), 'miko-html-'))
  const template = resolve(root, 'template')
  const entry = resolve(root, 'entry.ts')
  roots.push(root)

  await mkdir(template, { recursive: true })
  await writeFile(
    resolve(template, 'index.html'),
    '<!doctype html><html><head><meta name="fallback-shell"></head><body><div id="app"></div></body></html>',
  )
  await writeFile(entry, `document.querySelector('#app')!.textContent = 'ready'`)
  if (userHtml) await writeFile(resolve(root, 'index.html'), userHtml)

  return { root, template, entry }
}

async function compile(fixture: Awaited<ReturnType<typeof createFixture>>) {
  let resolvedRoot = ''
  const result = await build({
    root: fixture.root,
    input: resolve(fixture.root, 'index.html'),
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [
      await indexHTMLPlugin(fixture),
      {
        name: 'test:capture-root',
        configResolved(config) {
          resolvedRoot = config.root
        },
      },
    ],
    build: {
      write: false,
    },
  })

  const builds = Array.isArray(result) ? result : [result]
  const output = builds.flatMap(buildResult =>
    'output' in buildResult ? buildResult.output : [],
  )
  const htmlAsset = output.find(item => item.fileName === 'index.html') as
    | { source: string | Uint8Array }
    | undefined
  const source = htmlAsset?.source

  return {
    chunks: output.filter(item => item.type === 'chunk'),
    html: typeof source === 'string'
      ? source
      : source
        ? new TextDecoder().decode(source)
        : '',
    resolvedRoot,
  }
}

async function startDevServer(
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [await indexHTMLPlugin(fixture)],
    server: {
      host: '127.0.0.1',
      port: 0,
    },
  })
  await server.listen()
  servers.push(server)

  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Vite dev server did not expose a TCP address')
  }

  return async () => {
    const response = await fetch(`http://127.0.0.1:${address.port}/deep/route`, {
      headers: {
        accept: 'text/html',
      },
    })
    expect(response.status).toBe(200)
    return response.text()
  }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('indexHTMLPlugin', () => {
  it('builds from the in-memory fallback without writing or replacing root/index.html', async () => {
    const fixture = await createFixture()
    const result = await compile(fixture)

    expect(resolve(result.resolvedRoot)).toBe(resolve(fixture.root))
    expect(existsSync(resolve(fixture.root, 'index.html'))).toBe(false)
    expect(result.html).toContain('fallback-shell')
    expect(result.chunks).toHaveLength(1)
  })

  it('prefers and transforms a user-owned root/index.html', async () => {
    const fixture = await createFixture(
      '<!doctype html><html><head><meta name="user-shell"></head><body><div id="app"></div></body></html>',
    )
    const result = await compile(fixture)

    expect(result.html).toContain('user-shell')
    expect(result.html).not.toContain('fallback-shell')
    expect(result.chunks).toHaveLength(1)
  })

  it('serves transformed fallback HTML for deep routes in dev', async () => {
    const fixture = await createFixture()
    const requestHtml = await startDevServer(fixture)
    const html = await requestHtml()

    expect(html).toContain('fallback-shell')
    expect(html).toContain('data-miko-entry')
    expect(html).toContain('virtual:index')
  })

  it('switches between fallback and user HTML without restarting or changing root', async () => {
    const fixture = await createFixture()
    const requestHtml = await startDevServer(fixture)

    await writeFile(
      resolve(fixture.root, 'index.html'),
      '<!doctype html><html><head><meta name="user-shell"></head><body><div id="app"></div></body></html>',
    )
    const userHtml = await requestHtml()
    expect(userHtml).toContain('user-shell')
    expect(userHtml).toContain('data-miko-entry')

    await rm(resolve(fixture.root, 'index.html'))
    const fallbackHtml = await requestHtml()
    expect(fallbackHtml).toContain('fallback-shell')
  })
})
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-index-html
```

Expected: FAIL because `html.ts` and the options-based `indexHTMLPlugin()` contract do not exist.

- [ ] **Step 4: Implement pure HTML validation and entry injection**

```ts
// packages/vite-plugin-index-html/html.ts
import type { HtmlTagDescriptor } from 'vite'

const START_TAG_RE = /<[a-z][^>]*>/gi
const ID_ATTR_RE = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i
const MIKO_ENTRY_MARKER_RE = /<script\b[^>]*\bdata-miko-entry\b/i
const MIKO_ENTRY_IMPORT_RE = /['"]virtual:index['"]/

export function createMikoEntryTags(html: string): HtmlTagDescriptor[] {
  const appRoots = [...html.matchAll(START_TAG_RE)].filter(([tag]) => {
    const match = ID_ATTR_RE.exec(tag)
    return (match?.[1] ?? match?.[2] ?? match?.[3]) === 'app'
  }).length

  if (appRoots !== 1) {
    throw new Error(
      `[miko] index.html 必须包含唯一的 #app 挂载节点，当前找到 ${appRoots} 个`,
    )
  }

  if (MIKO_ENTRY_MARKER_RE.test(html) || MIKO_ENTRY_IMPORT_RE.test(html)) return []

  return [
    {
      tag: 'script',
      attrs: {
        type: 'module',
        'data-miko-entry': '',
      },
      children: "import 'virtual:index'",
      injectTo: 'body',
    },
  ]
}
```

- [ ] **Step 5: Replace root switching with a synthetic physical HTML ID**

Replace `packages/vite-plugin-index-html/index.ts` with:

```ts
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizePath } from 'vite'
import type { PluginOption } from 'vite'
import { createMikoEntryTags } from './html'

const virtualModuleId = 'virtual:index'
const resolvedVirtualModuleId = `\0${virtualModuleId}`

export interface IndexHTMLOptions {
  entry: string
  root: string
  template: string
}

export async function indexHTMLPlugin(options: IndexHTMLOptions) {
  const htmlPath = normalizePath(resolve(options.root, 'index.html'))
  const fallbackHtml = await readFile(resolve(options.template, 'index.html'), 'utf8')
  const hasUserHtml = () => existsSync(htmlPath)
  const isHtmlId = (id: string) =>
    normalizePath(id.split('?', 1)[0]) === htmlPath

  return {
    name: '@minar-kotonoha/vite-plugin-index-html',
    enforce: 'pre',

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (hasUserHtml()) return next()
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        if (!req.headers.accept?.includes('text/html')) return next()

        const url = req.url?.split('?')[0] || '/'
        try {
          const transformed = await server.transformIndexHtml(
            url,
            fallbackHtml,
            req.originalUrl,
          )
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(req.method === 'HEAD' ? undefined : transformed)
        } catch (error) {
          next(error as Error)
        }
      })
    },

    resolveId(id) {
      if (!hasUserHtml() && isHtmlId(id)) return htmlPath
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },

    load(id) {
      if (!hasUserHtml() && isHtmlId(id)) return fallbackHtml
      if (id === resolvedVirtualModuleId) {
        return `import ${JSON.stringify(normalizePath(options.entry))}`
      }
    },

    transformIndexHtml(html) {
      return createMikoEntryTags(html)
    },
  } satisfies PluginOption
}
```

The HTML ID is deliberately the absolute `<viteRoot>/index.html`, not a `\0virtual:*` ID. This lets Vite keep its normal HTML build pipeline and output name while the file remains absent on disk.

- [ ] **Step 6: Remove the hard-coded entry script from the fallback template**

Set `packages/vite-plugin-miko/template/index.html` to:

```html
<!doctype html>
<html lang="zh-cmn-Hans">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta
      content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=0,viewport-fit=cover"
      name="viewport"
    />
  </head>
  <body>
    <div id="app" v-cloak="true" data-allow-mismatch=""></div>
  </body>
</html>
```

Both user and fallback HTML now receive the same entry through `transformIndexHtml`.

- [ ] **Step 7: Update package publishing and type-checking boundaries**

Set `packages/vite-plugin-index-html/package.json` to:

```json
{
  "name": "@minar-kotonoha/vite-plugin-index-html",
  "version": "0.1.5",
  "description": "零配置 index.html 合成 + virtual:index 入口管理插件",
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./package.json": "./package.json"
  },
  "files": [
    "html.ts",
    "index.ts"
  ],
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  },
  "peerDependencies": {
    "vite": "catalog:"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

This removes the now-unused `fs-extra` dependency. The package `exports` map remains unchanged, so consumers can only import the documented root entry.

Set `packages/vite-plugin-index-html/tsconfig.json` to:

```json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "esnext",
    "lib": ["esnext"],
    "strict": true,
    "types": ["node"]
  },
  "include": ["index.ts", "html.ts", "*.test.ts"]
}
```

Run:

```sh
bun install
```

Expected: `bun.lock` no longer records `fs-extra` as a direct dependency of `@minar-kotonoha/vite-plugin-index-html`.

Replace `packages/vite-plugin-index-html/README.md` with:

````markdown
# @minar-kotonoha/vite-plugin-index-html

在不改变 Vite `root` 的前提下提供零配置 HTML 入口和 `virtual:index`。

## 行为

- `<root>/index.html` 存在时使用用户文件。
- 文件不存在时，以同一个绝对路径 ID 提供内置 HTML，不写临时文件。
- 两种 HTML 都自动注入唯一的 Miko module 入口。
- HTML 必须包含唯一的 `#app`。
- `virtual:index` 解析为应用入口文件。

## 用法

```ts
import { indexHTMLPlugin } from '@minar-kotonoha/vite-plugin-index-html'

plugins: [
  await indexHTMLPlugin({
    entry: '/project/template/main.ts',
    root: '/project',
    template: '/package/template',
  }),
]
```
````

- [ ] **Step 8: Run the HTML plugin tests and verify GREEN**

Run:

```sh
bun run test:packages -- packages/vite-plugin-index-html
```

Expected: 7 tests pass. Build produces `index.html` and one JavaScript chunk without creating `<viteRoot>/index.html`; Dev serves deep routes and switches between fallback/user HTML without restarting or changing root.

- [ ] **Step 9: Commit the zero-config HTML entry**

```sh
git add bun.lock packages/vite-plugin-index-html packages/vite-plugin-miko/template/index.html
git commit -m "feat(html): synthesize the default vite entry in memory"
```

---

### Task 7: Make the Vite factory consume resolved configuration

**Files:**

- Modify: `packages/vite-plugin-miko/index.ts`
- Create: `packages/vite-plugin-miko/config/factory.test.ts`
- Create: `packages/vite-plugin-bootstrap/index.test.ts`
- Modify: `packages/vite-plugin-bootstrap/index.ts`
- Modify: `packages/vite-plugin-bootstrap/tsconfig.json`

- [ ] **Step 1: Write failing factory and bootstrap-root tests**

```ts
// packages/vite-plugin-miko/config/factory.test.ts
import { describe, expect, it } from 'vitest'
import { createMikoViteConfig } from '../index'
import type { ResolvedMikoConfig } from './types'

function project(): ResolvedMikoConfig {
  return {
    env: { command: 'build', mode: 'production', root: 'D:/project' },
    configFile: null,
    viteRoot: 'D:/project',
    outDir: 'D:/project/dist',
    vite: {
      base: '/cms/',
      build: { sourcemap: true },
    },
    miko: {
      rendering: 'spa',
      template: 'D:/template',
      entry: 'D:/template/main.ts',
      pagesDir: 'D:/project/pages',
      uiLibrary: 'vant',
      layout: 'flexible',
      vuePluginOptions: {},
      vueJsxPluginOptions: {},
      routerPluginOptions: {},
      layoutsPluginOptions: {},
      componentsPluginOptions: false,
      unoCSSPluginOptions: false,
      legacyPluginOptions: false,
      ssgOptions: {},
      linterOptions: false,
      bootstrapOptions: { entryFile: 'index.ts' },
      externalOptions: false,
      devOptions: { bundledDev: false },
      janusOptions: false,
    },
  }
}

describe('createMikoViteConfig', () => {
  it('preserves user Vite config while adding Miko defaults', async () => {
    const config = await createMikoViteConfig(project())

    expect(config.root).toBe('D:/project')
    expect(config.input).toBe('D:/project/index.html')
    expect(config.cacheDir).toBe('D:/project/node_modules/.vite')
    expect(config.base).toBe('/cms/')
    expect(config.build).toMatchObject({
      outDir: 'D:/project/dist',
      sourcemap: true,
    })
    expect(config.resolve?.alias).toEqual([
      { find: '@', replacement: 'D:/project' },
    ])
    expect(config.define).toMatchObject({
      'import.meta.env.VITE_MIKO_SPA': 'true',
    })
  })
})
```

```ts
// packages/vite-plugin-bootstrap/index.test.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { bootstrapPlugin } from './index'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('bootstrapPlugin', () => {
  it('resolves the optional bootstrap from Vite root instead of process.cwd()', async () => {
    const root = await mkdtemp(join(tmpdir(), 'miko-bootstrap-'))
    const input = resolve(root, 'main.ts')
    roots.push(root)

    await writeFile(
      resolve(root, 'index.ts'),
      `export default () => { globalThis.__mikoBootstrap = 'ROOT_BOOTSTRAP_MARKER' }`,
    )
    await writeFile(
      input,
      `import { bootstrap } from 'virtual:bootstrap'; bootstrap()`,
    )

    const result = await build({
      root,
      input,
      configFile: false,
      publicDir: false,
      logLevel: 'silent',
      plugins: [bootstrapPlugin()],
      build: {
        write: false,
      },
    })
    const builds = Array.isArray(result) ? result : [result]
    const output = builds.flatMap(buildResult =>
      'output' in buildResult ? buildResult.output : [],
    )
    const chunk = output.find(item => item.type === 'chunk') as
      | { code: string }
      | undefined

    expect(chunk?.code).toContain('ROOT_BOOTSTRAP_MARKER')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/config/factory.test.ts packages/vite-plugin-bootstrap/index.test.ts
```

Expected: FAIL because `createMikoViteConfig` does not accept a resolved project and `bootstrapPlugin` still resolves from `process.cwd()`.

- [ ] **Step 3: Make virtual bootstrap resolve from Vite root**

Replace `packages/vite-plugin-bootstrap/index.ts` with:

```ts
import { resolve } from 'node:path'
import { exists } from 'fs-extra'
import { normalizePath } from 'vite'
import type { PluginOption } from 'vite'

const virtualModuleId = 'virtual:bootstrap'
const resolvedVirtualModuleId = `\0${virtualModuleId}`

export function bootstrapPlugin(entryFile = 'index.ts') {
  let root = ''

  return {
    name: '@minar-kotonoha/vite-plugin-bootstrap',

    configResolved(config) {
      root = config.root
    },

    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },

    async load(id) {
      if (id !== resolvedVirtualModuleId) return
      if (!root) throw new Error('[miko] bootstrapPlugin 尚未获得 Vite root')

      const entry = normalizePath(resolve(root, entryFile))
      return (await exists(entry))
        ? `import * as Index from ${JSON.stringify(entry)};export const bootstrap = Index.default ?? (() => {});`
        : 'export const bootstrap = () => {}'
    },
  } satisfies PluginOption
}
```

Set `packages/vite-plugin-bootstrap/tsconfig.json` to:

```json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "esnext",
    "lib": ["esnext"],
    "strict": true,
    "types": ["node"]
  },
  "include": ["index.ts", "index.test.ts"]
}
```

- [ ] **Step 4: Remove module-level root state**

In `packages/vite-plugin-miko/index.ts`:

- Delete `const cwd = process.cwd()`.
- Delete the old `detectTemplate()` and `detectEntry()` helpers; Task 5 now owns template and entry resolution.
- Change every `resolve(cwd, ...)` to use the root carried by `ResolvedMikoConfig`.
- Remove the old `loadMikoConfig()` and `resolveConfig()` implementations after all callers are migrated.
- Remove environment-variable mutations such as `MIKO_BOOTSTRAP_ENTRY`; pass the entry directly to `bootstrapPlugin`.

- [ ] **Step 5: Convert the old async public factory into a resolved-config factory**

The exported boundary must become:

```ts
import { fileURLToPath } from 'node:url'
import { mergeViteConfig } from './config/merge'
import type { ResolvedMikoConfig } from './config/types'

export { defineMikoConfig } from './config/define'
export { MikoConfigError } from './config/errors'
export type * from './config/types'

export function getBundledTemplate(): string {
  return fileURLToPath(new URL('./template', import.meta.url))
}

export async function createMikoViteConfig(project: ResolvedMikoConfig) {
  const { miko, outDir } = project
  const ssgEnabled = miko.rendering === 'ssg'
  const plugins = await createMikoPlugins(project)

  const generated = {
    root: project.viteRoot,
    input: resolve(project.viteRoot, 'index.html'),
    base: '/',
    build: {
      outDir,
      emptyOutDir: true,
    },
    cacheDir: resolve(project.viteRoot, 'node_modules/.vite'),
    resolve: {
      alias: [{ find: '@', replacement: project.viteRoot }],
      tsconfigPaths: true,
    },
    experimental: {
      bundledDev: miko.devOptions.bundledDev ?? false,
    },
    ssgOptions: ssgEnabled
      ? {
          ...miko.ssgOptions,
          entry: miko.entry,
        }
      : undefined,
    define: {
      'import.meta.env.VITE_MIKO_SPA': ssgEnabled ? 'false' : 'true',
    },
    plugins,
  }

  return mergeViteConfig(generated, project.vite)
}
```

Use this complete private factory in `packages/vite-plugin-miko/index.ts`:

```ts
async function createMikoPlugins(project: ResolvedMikoConfig): Promise<PluginOption[]> {
  const { miko } = project
  const plugins: PluginOption[] = [
    {
      name: 'miko:ssr-css',
      applyToEnvironment({ name }) {
        return name === 'ssr'
      },
      transform(code, id) {
        if (/\.(css|less|scss|sass)$/.test(id)) return ''
        if (/\.(ts|js|tsx|jsx|vue|mjs|cjs)$/.test(id)) {
          return code.replace(
            /import\s+['"][^'"]+\.(css|less|scss|sass)['"]\s*;?/g,
            '',
          )
        }
      },
    } satisfies PluginOption,
    VueMacros({
      plugins: {
        vue: vue(miko.vuePluginOptions),
        vueJsx: vueJsx(miko.vueJsxPluginOptions),
        vueRouter: VueRouter({
          extensions: miko.routerPluginOptions.extensions,
          routesFolder: miko.routerPluginOptions.routesFolder,
          dts: miko.routerPluginOptions.dts,
          extendRoute(route: { path?: string; addAlias: (aliases: string[]) => void }) {
            if (route.path) {
              route.addAlias([route.path === '/' ? 'index.html' : `${route.path}.html`])
            }
          },
        }),
      },
    }),
    vueDevTools(),
  ]

  if (miko.layoutsPluginOptions !== false) {
    const layoutsDirs = miko.layoutsPluginOptions.layoutsDirs
      ? Array.isArray(miko.layoutsPluginOptions.layoutsDirs)
        ? miko.layoutsPluginOptions.layoutsDirs
        : [miko.layoutsPluginOptions.layoutsDirs]
      : [resolve(miko.template, 'layouts'), resolve(project.viteRoot, 'layouts')]

    plugins.push(
      Layouts({
        ...miko.layoutsPluginOptions,
        defaultLayout: miko.layoutsPluginOptions.defaultLayout ?? miko.layout,
        layoutsDirs,
        pagesDirs: miko.layoutsPluginOptions.pagesDirs ?? miko.pagesDir,
      }),
    )
  }

  if (miko.linterOptions !== false) plugins.push(linterPlugin)
  if (miko.legacyPluginOptions !== false) {
    plugins.push(legacy(miko.legacyPluginOptions))
  }

  if (miko.componentsPluginOptions !== false) {
    const componentResolvers = miko.componentsPluginOptions.resolvers
      ?? (miko.uiLibrary === 'vant' ? [VantResolver()] : [ElementPlusResolver()])

    plugins.push(
      Components({
        ...miko.componentsPluginOptions,
        dirs: Array.isArray(miko.componentsPluginOptions.dirs)
          ? miko.componentsPluginOptions.dirs
          : [miko.componentsPluginOptions.dirs],
        resolvers: componentResolvers,
      }),
    )
  }

  if (miko.unoCSSPluginOptions !== false) {
    plugins.push(
      UnoCSS({
        configFile: false,
        ...miko.unoCSSPluginOptions,
      } as Parameters<typeof UnoCSS>[0]),
    )
  }

  plugins.push(bootstrapPlugin(miko.bootstrapOptions.entryFile))

  const externalEnabled = miko.externalOptions !== false
    && Boolean(miko.externalOptions.frameworkCDN)
  plugins.push(...externalPlugin(externalEnabled))
  plugins.push(
    await indexHTMLPlugin({
      entry: miko.entry,
      root: project.viteRoot,
      template: miko.template,
    }),
  )

  const janusPlugin = loadJanus(miko.janusOptions, project.viteRoot)
  if (janusPlugin) plugins.push(janusPlugin)

  return plugins
}
```

Change `loadJanus` to accept `root` explicitly:

```ts
function loadJanus(opts: JanusOptions | false, root: string): PluginOption | null {
  if (opts === false) return null
  try {
    const janusEntry = resolve(root, 'node_modules/@janus/unplugin/dist/unplugin.cjs')
    if (!existsSync(janusEntry)) return null
    const require = createRequire(import.meta.url)
    const mod = require(janusEntry)
    return mod?.vite?.(opts) || mod?.default?.vite?.(opts) || null
  } catch (error) {
    console.warn('[miko] Janus 加载失败:', (error as Error)?.message)
    return null
  }
}
```

Do not change plugin defaults or ordering beyond the new modern default `legacyPluginOptions: false`; automatic detection belongs to Slice 2.

- [ ] **Step 6: Run the factory and configuration tests**

Run:

```sh
bun run test:packages -- packages/vite-plugin-bootstrap packages/vite-plugin-miko/config
```

Expected: all config tests pass.

- [ ] **Step 7: Run package type checking**

Run:

```sh
bun run typecheck:packages
```

Expected: exit code 0.

- [ ] **Step 8: Commit the factory boundary**

```sh
git add packages/vite-plugin-bootstrap packages/vite-plugin-miko
git commit -m "refactor(miko): build vite config from resolved project"
```

---

### Task 8: Replace dynamic CLI dispatch with a typed command pipeline

**Files:**

- Create: `packages/cli/args.ts`
- Create: `packages/cli/args.test.ts`
- Create: `packages/cli/context.ts`
- Create: `packages/cli/context.test.ts`
- Create: `packages/cli/errors.ts`
- Create: `packages/cli/run.ts`
- Create: `packages/cli/run.test.ts`
- Create: `packages/cli/tsconfig.json`
- Modify: `packages/cli/index.ts`

- [ ] **Step 1: Write failing argument and dispatch tests**

```ts
// packages/cli/args.test.ts
import { describe, expect, it } from 'vitest'
import { parseCliArgs } from './args'

describe('parseCliArgs', () => {
  it('parses command, root, mode and lib', () => {
    expect(parseCliArgs(['build', '--root', 'app', '--env', 'test', '--lib'])).toMatchObject({
      command: 'build',
      rootArg: 'app',
      modeArg: 'test',
      lib: true,
    })
  })

  it('rejects unknown commands instead of dynamically importing a filename', () => {
    expect(() => parseCliArgs(['../../evil'])).toThrow(/未知命令/)
  })

  it('rejects invalid environment names', () => {
    expect.assertions(1)
    try {
      parseCliArgs(['build', '--env', '../test'])
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MIKO_CLI_ENV',
        exitCode: 2,
      })
    }
  })
})
```

```ts
// packages/cli/run.test.ts
import { describe, expect, it, vi } from 'vitest'
import { runCli } from './run'

describe('runCli', () => {
  it('dispatches a parsed build context', async () => {
    const build = vi.fn().mockResolvedValue(undefined)

    await runCli(['build', '--root', 'app'], {
      cwd: () => 'D:/repo',
      runners: {
        build,
        dev: vi.fn(),
        preview: vi.fn(),
      },
    })

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'build',
        root: 'D:/repo/app',
        mode: 'production',
      }),
    )
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run:

```sh
bun run test:packages -- packages/cli/args.test.ts packages/cli/run.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement typed CLI errors**

```ts
// packages/cli/errors.ts
export class MikoCliError extends Error {
  readonly code: string
  readonly exitCode: number

  constructor(code: string, message: string, exitCode: number, cause?: unknown) {
    super(message, { cause })
    this.name = 'MikoCliError'
    this.code = code
    this.exitCode = exitCode
  }
}
```

- [ ] **Step 4: Implement static argument parsing**

```ts
// packages/cli/args.ts
import parser from 'yargs-parser'
import { MikoCliError } from './errors'
import { normalizeEnvArg } from './env'

export type ImplementedCommand = 'dev' | 'build' | 'preview'

export interface CliOptions {
  command: ImplementedCommand
  rootArg?: string
  modeArg?: string
  lib: boolean
}

const COMMANDS = new Set<ImplementedCommand>(['dev', 'build', 'preview'])

export function parseCliArgs(argv: string[]): CliOptions {
  const parsed = parser(argv, {
    boolean: ['lib'],
    string: ['root', 'env', 'mode'],
    alias: { h: 'help' },
  })
  const command = String(parsed._[0] ?? '')

  if (!COMMANDS.has(command as ImplementedCommand)) {
    throw new MikoCliError('MIKO_CLI_COMMAND', `未知命令: ${command || '(空)'}`, 2)
  }

  let modeArg: string | undefined
  try {
    modeArg = normalizeEnvArg(parsed.env ?? parsed.mode)
  } catch (error) {
    throw new MikoCliError(
      'MIKO_CLI_ENV',
      (error as Error)?.message ?? String(error),
      2,
      error,
    )
  }

  return {
    command: command as ImplementedCommand,
    rootArg: parsed.root,
    modeArg,
    lib: parsed.lib === true,
  }
}
```

- [ ] **Step 5: Implement explicit context creation**

```ts
// packages/cli/context.ts
import { resolve } from 'node:path'
import type { MikoConfigEnv } from '@minar-kotonoha/vite-plugin-miko'
import type { CliOptions } from './args'

export interface CommandContext extends Omit<MikoConfigEnv, 'command'> {
  command: CliOptions['command']
  lib: boolean
}

export function createCommandContext(options: CliOptions, cwd: string): CommandContext {
  return {
    command: options.command,
    root: resolve(cwd, options.rootArg ?? '.'),
    mode: options.modeArg ?? (options.command === 'dev' ? 'development' : 'production'),
    lib: options.lib,
  }
}
```

Add tests:

```ts
// packages/cli/context.test.ts
import { describe, expect, it } from 'vitest'
import { createCommandContext } from './context'

describe('createCommandContext', () => {
  it('defaults dev to development', () => {
    expect(
      createCommandContext(
        { command: 'dev', lib: false },
        'D:/repo',
      ),
    ).toMatchObject({ mode: 'development', root: 'D:/repo' })
  })

  it('defaults build and preview to production', () => {
    expect(
      createCommandContext(
        { command: 'preview', lib: false },
        'D:/repo',
      ).mode,
    ).toBe('production')
  })
})
```

- [ ] **Step 6: Implement injected dispatch**

```ts
// packages/cli/run.ts
import { parseCliArgs } from './args'
import { createCommandContext, type CommandContext } from './context'

export interface CommandRunners {
  dev(context: CommandContext): Promise<void>
  build(context: CommandContext): Promise<void>
  preview(context: CommandContext): Promise<void>
}

export interface RunCliDependencies {
  cwd: () => string
  runners: CommandRunners
}

export async function runCli(argv: string[], dependencies: RunCliDependencies): Promise<void> {
  const options = parseCliArgs(argv)
  const context = createCommandContext(options, dependencies.cwd())
  await dependencies.runners[context.command](context)
}
```

- [ ] **Step 7: Make the executable entry thin and testable**

```ts
// packages/cli/index.ts
#!/usr/bin/env node
import { runBuild } from './commands/build'
import { runDev } from './commands/dev'
import { runPreview } from './commands/preview'
import { MikoConfigError } from '@minar-kotonoha/vite-plugin-miko'
import { MikoCliError } from './errors'
import { runCli } from './run'

try {
  await runCli(process.argv.slice(2), {
    cwd: () => process.cwd(),
    runners: {
      build: runBuild,
      dev: runDev,
      preview: runPreview,
    },
  })
} catch (error) {
  const cliError = error instanceof MikoCliError
    ? error
    : error instanceof MikoConfigError
      ? new MikoCliError(error.code, error.message, 2, error)
      : new MikoCliError('MIKO_UNEXPECTED', (error as Error)?.message ?? String(error), 1, error)

  console.error(`[miko:${cliError.code}] ${cliError.message}`)
  if (cliError.cause && process.env.MIKO_DEBUG === '1') console.error(cliError.cause)
  process.exitCode = cliError.exitCode
}
```

- [ ] **Step 8: Update CLI TypeScript includes**

Ensure `packages/cli/tsconfig.json` exists with:

```json
{
  "extends": "../../tsconfig.builder.json",
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 9: Run focused tests and verify GREEN**

Run:

```sh
bun run test:packages -- packages/cli/args.test.ts packages/cli/context.test.ts packages/cli/run.test.ts
```

Expected: all tests pass.

- [ ] **Step 10: Commit the CLI core**

```sh
git add packages/cli
git commit -m "refactor(cli): add typed command dispatch"
```

---

### Task 9: Refactor dev/build/preview into injected command runners

**Files:**

- Create: `packages/cli/process.ts`
- Create: `packages/cli/commands/dev.ts`
- Create: `packages/cli/commands/build.ts`
- Create: `packages/cli/commands/preview.ts`
- Modify: `packages/cli/dev.ts`
- Modify: `packages/cli/build.ts`
- Modify: `packages/cli/preview.ts`
- Modify: `packages/cli/env.ts`
- Modify: `packages/cli/env.test.ts`
- Modify: `packages/cli/package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Add a failing process-exit regression test**

Add to `packages/cli/run.test.ts`:

```ts
it('propagates runner errors', async () => {
  const failure = new Error('build failed')

  await expect(
    runCli(['build'], {
      cwd: () => 'D:/repo',
      runners: {
        build: async () => {
          throw failure
        },
        dev: async () => {},
        preview: async () => {},
      },
    }),
  ).rejects.toBe(failure)
})
```

- [ ] **Step 2: Implement a reusable child-process helper**

```ts
// packages/cli/process.ts
import { spawn, type SpawnOptions } from 'node:child_process'
import { MikoCliError } from './errors'

export async function spawnAndWait(
  command: string,
  args: string[],
  options: SpawnOptions,
  failure: { code: string; exitCode: number; message: string },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, options)
    child.once('error', error => {
      reject(new MikoCliError(failure.code, failure.message, failure.exitCode, error))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new MikoCliError(
          failure.code,
          `${failure.message}（code=${code ?? 'null'}, signal=${signal ?? 'none'}）`,
          failure.exitCode,
        ),
      )
    })
  })
}
```

- [ ] **Step 3: Implement a shared project loader inside the plugin package**

Extend the existing config imports in `packages/vite-plugin-miko/index.ts` and export:

```ts
import { loadMikoConfig, resolveMikoConfig } from './config'
import type { MikoConfigEnv, ResolvedMikoConfig } from './config/types'

export async function resolveMikoProject(env: MikoConfigEnv): Promise<ResolvedMikoConfig> {
  const loaded = await loadMikoConfig(env)
  return resolveMikoConfig(loaded, env, getBundledTemplate())
}
```

- [ ] **Step 4: Implement the dev runner**

```ts
// packages/cli/commands/dev.ts
import { createServer } from 'vite'
import {
  createMikoViteConfig,
  resolveMikoProject,
} from '@minar-kotonoha/vite-plugin-miko'
import type { CommandContext } from '../context'

export async function runDev(context: CommandContext): Promise<void> {
  const project = await resolveMikoProject(context)
  const config = await createMikoViteConfig(project)
  const server = await createServer({
    ...config,
    configFile: false,
    mode: context.mode,
  })

  await server.listen()
  server.printUrls()
}
```

- [ ] **Step 5: Implement Node-only type checking without pnpm probing**

```ts
// packages/cli/commands/build.ts
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { build as viteBuild } from 'vite'
import { build as viteSsgBuild } from '@minar-kotonoha/vite-ssg/node'
import {
  createLibConfig,
  createMikoViteConfig,
  resolveMikoProject,
} from '@minar-kotonoha/vite-plugin-miko'
import type { CommandContext } from '../context'
import { spawnAndWait } from '../process'

async function runTypeCheck(root: string): Promise<void> {
  if (!existsSync(resolve(root, 'tsconfig.json'))) {
    console.log('[miko] 未发现 tsconfig.json，跳过类型检查')
    return
  }

  const tscPath = fileURLToPath(new URL('../tsc.ts', import.meta.url))
  const jitiUrl = import.meta.resolve('jiti/register')
  const tscUrl = pathToFileURL(tscPath).href

  await spawnAndWait(
    process.execPath,
    ['--import', jitiUrl, '--eval', `import('${tscUrl}')`],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
    {
      code: 'MIKO_TYPECHECK',
      exitCode: 4,
      message: 'TypeScript 类型检查失败',
    },
  )
}

export async function runBuild(context: CommandContext): Promise<void> {
  const project = await resolveMikoProject(context)

  if (context.lib) {
    await viteBuild(
      createLibConfig({
        config: project,
      }),
    )
    return
  }

  await runTypeCheck(project.viteRoot)
  register('../css-loader.mjs', import.meta.url)

  const config = await createMikoViteConfig(project)
  const inlineConfig = {
    ...config,
    configFile: false,
    mode: context.mode,
  }

  if (project.miko.rendering === 'ssg') {
    await viteSsgBuild(undefined, inlineConfig)
  } else {
    await viteBuild(inlineConfig)
  }
}
```

Update `createLibConfig` to this explicit-root implementation:

```ts
export function createLibConfig(options: {
  config: ResolvedMikoConfig
}): UserConfig {
  const { config } = options
  const root = config.viteRoot
  const lib = {
    entry: 'src/index.ts',
    formats: ['es', 'cjs'] as ('es' | 'cjs' | 'umd')[],
    ...config.miko.lib,
  }

  const generated: UserConfig = {
    root,
    build: {
      outDir: config.outDir,
      emptyOutDir: true,
      lib: {
        entry: resolve(root, lib.entry),
        formats: lib.formats,
        name: lib.name,
        fileName: lib.fileName,
      },
      rollupOptions: {
        external: ['vue', 'vue-router', 'pinia', 'axios', '@unhead/vue'],
      },
    },
    resolve: {
      alias: [{ find: '@', replacement: root }],
      tsconfigPaths: true,
    },
    plugins: [
      VueMacros({
        plugins: {
          vue: vue(config.miko.vuePluginOptions),
          vueJsx: vueJsx(config.miko.vueJsxPluginOptions),
        },
      }),
      config.miko.unoCSSPluginOptions === false
        ? null
        : UnoCSS(config.miko.unoCSSPluginOptions),
    ],
  }

  return mergeViteConfig(generated, config.vite)
}
```

It must not call `process.cwd()`.

- [ ] **Step 6: Implement preview through Vite's native preview config**

```ts
// packages/cli/commands/preview.ts
import { preview } from 'vite'
import {
  createMikoViteConfig,
  resolveMikoProject,
} from '@minar-kotonoha/vite-plugin-miko'
import type { CommandContext } from '../context'

export async function runPreview(context: CommandContext): Promise<void> {
  const project = await resolveMikoProject(context)
  const config = await createMikoViteConfig(project)
  const server = await preview({
    ...config,
    configFile: false,
    mode: context.mode,
    root: project.outDir,
  })

  server.printUrls()
}
```

This removes the custom preview proxy that compiled a regular expression per request and disabled TLS verification. Users configure preview proxy through `vite.preview.proxy`.

- [ ] **Step 7: Remove environment-variable command transport**

Replace `packages/cli/env.ts` with only the reusable validation function:

```ts
const ENV_NAME_RE = /^[A-Za-z0-9_-]+$/

export function normalizeEnvArg(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const raw = Array.isArray(value) ? String(value.at(-1)) : String(value)
  if (!ENV_NAME_RE.test(raw)) {
    throw new Error(`非法 --env 值: "${raw}"（仅允许字母/数字/-/_）`)
  }
  return raw
}
```

Delete `loadEnvFiles`, `pickEnvArg`, `resolveMode`, `MIKO_MODE`, `MIKO_LIB_MODE`, `dotenv` loading, `pnpm root`, and `NODE_PATH` logic. Replace `packages/cli/env.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeEnvArg } from './env'

describe('normalizeEnvArg', () => {
  it('returns undefined for empty values', () => {
    expect(normalizeEnvArg(undefined)).toBeUndefined()
    expect(normalizeEnvArg(null)).toBeUndefined()
    expect(normalizeEnvArg('')).toBeUndefined()
  })

  it('keeps valid values and uses the last repeated value', () => {
    expect(normalizeEnvArg('test')).toBe('test')
    expect(normalizeEnvArg(['test', 'staging'])).toBe('staging')
  })

  it('rejects path traversal and whitespace', () => {
    expect(() => normalizeEnvArg('../x')).toThrow(/非法 --env/)
    expect(() => normalizeEnvArg('a b')).toThrow(/非法 --env/)
  })
})
```

- [ ] **Step 8: Keep compatibility entry files temporarily**

Replace the old top-level command modules with re-exports:

```ts
// packages/cli/dev.ts
export { runDev as default, runDev } from './commands/dev'
```

```ts
// packages/cli/build.ts
export { runBuild as default, runBuild } from './commands/build'
```

```ts
// packages/cli/preview.ts
export { runPreview as default, runPreview } from './commands/preview'
```

- [ ] **Step 9: Update package files and dependencies**

Set `packages/cli/package.json#files` to:

```json
[
  "miko",
  "commands/",
  "args.ts",
  "context.ts",
  "errors.ts",
  "process.ts",
  "run.ts",
  "env.ts",
  "index.ts",
  "dev.ts",
  "build.ts",
  "preview.ts",
  "tsc.ts",
  "css-loader.mjs"
]
```

Remove `dotenv` from `dependencies`. Keep `jiti` because the executable and type-check child require it.

Run:

```sh
bun install
```

Expected: `bun.lock` no longer records `dotenv` as a direct dependency of `@minar-kotonoha/miko-cli`.

- [ ] **Step 10: Run all package tests and type checking**

Run:

```sh
bun run test:packages
bun run typecheck:packages
```

Expected: all tests pass; no command imports `pnpm`, `dotenv`, or reads `MIKO_MODE`/`MIKO_LIB_MODE`.

- [ ] **Step 11: Commit the command runners**

```sh
git add bun.lock packages/cli packages/vite-plugin-miko
git commit -m "refactor(cli): run commands from one resolved project config"
```

---

### Task 10: Migrate the starter and prove zero-config behavior

**Files:**

- Modify: `app/miko.config.ts`
- Delete: `app/vite.config.ts`
- Create: `packages/cli/test/fixtures/zero-config/package.json`
- Create: `packages/cli/test/fixtures/zero-config/pages/index.vue`
- Create: `packages/cli/test/fixtures/spa-config/miko.config.ts`
- Create: `packages/cli/test/fixtures/spa-config/package.json`
- Create: `packages/cli/test/fixtures/spa-config/pages/index.vue`
- Create: `packages/cli/test/fixtures/user-html/index.html`
- Create: `packages/cli/test/fixtures/user-html/miko.config.ts`
- Create: `packages/cli/test/fixtures/user-html/package.json`
- Create: `packages/cli/test/fixtures/user-html/pages/index.vue`
- Create: `packages/cli/test/fixtures/invalid-config/package.json`
- Create: `packages/cli/test/fixtures/invalid-config/miko.config.ts`
- Create: `packages/cli/test/cli.integration.test.ts`

- [ ] **Step 1: Write failing CLI integration tests**

```ts
// packages/cli/test/cli.integration.test.ts
import { readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const cli = resolve(here, '../miko')
const zeroConfig = resolve(here, 'fixtures/zero-config')
const spaConfig = resolve(here, 'fixtures/spa-config')
const userHtml = resolve(here, 'fixtures/user-html')
const invalidConfig = resolve(here, 'fixtures/invalid-config')

async function execute(args: string[]) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>(resolvePromise => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: resolve(here, '../../..'),
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('exit', code => resolvePromise({ code, stdout, stderr }))
  })
}

afterEach(async () => {
  await Promise.all(
    [zeroConfig, spaConfig, userHtml].map(root =>
      rm(resolve(root, 'dist'), { recursive: true, force: true }),
    ),
  )
})

describe('miko CLI integration', () => {
  it('builds a zero-config project under Node', async () => {
    const result = await execute(['build', '--root', zeroConfig])

    expect(result.code).toBe(0)
    expect(result.stderr).not.toContain('pnpm')
    await expect(readFile(resolve(zeroConfig, 'dist/index.html'), 'utf8')).resolves.toContain(
      'Zero Config',
    )
  }, 120_000)

  it('builds an explicitly configured SPA without prerendering page content', async () => {
    const result = await execute(['build', '--root', spaConfig])

    expect(result.code).toBe(0)
    await expect(readFile(resolve(spaConfig, 'dist/index.html'), 'utf8')).resolves.not.toContain(
      'SPA Config',
    )
  }, 120_000)

  it('preserves a user HTML shell and injects the application entry', async () => {
    const result = await execute(['build', '--root', userHtml])
    const html = await readFile(resolve(userHtml, 'dist/index.html'), 'utf8')

    expect(result.code).toBe(0)
    expect(html).toContain('name="miko-user-html"')
    expect(html).toMatch(/<script[^>]+src="[^"]*assets\/[^"]+\.js"/)
  }, 120_000)

  it('returns a configuration exit code and path for invalid config', async () => {
    const result = await execute(['build', '--root', invalidConfig])

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('miko.config.ts')
    expect(result.stderr).toContain('MIKO_CONFIG')
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run:

```sh
bun run test:packages -- packages/cli/test/cli.integration.test.ts
```

Expected: FAIL because fixtures and the new command pipeline are incomplete.

- [ ] **Step 3: Add the zero-config fixture**

```json
// packages/cli/test/fixtures/zero-config/package.json
{
  "name": "miko-zero-config-fixture",
  "private": true,
  "type": "module"
}
```

```vue
<!-- packages/cli/test/fixtures/zero-config/pages/index.vue -->
<script setup lang="ts">
const title = 'Zero Config'
</script>

<template>
  <main>{{ title }}</main>
</template>
```

- [ ] **Step 4: Add the explicit SPA fixture**

```json
// packages/cli/test/fixtures/spa-config/package.json
{
  "name": "miko-spa-config-fixture",
  "private": true,
  "type": "module"
}
```

```ts
// packages/cli/test/fixtures/spa-config/miko.config.ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'

export default defineMikoConfig({
  miko: {
    rendering: 'spa',
  },
})
```

```vue
<!-- packages/cli/test/fixtures/spa-config/pages/index.vue -->
<template>
  <main>SPA Config</main>
</template>
```

- [ ] **Step 5: Add the user-owned HTML fixture**

```json
// packages/cli/test/fixtures/user-html/package.json
{
  "name": "miko-user-html-fixture",
  "private": true,
  "type": "module"
}
```

```ts
// packages/cli/test/fixtures/user-html/miko.config.ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'

export default defineMikoConfig({
  miko: {
    rendering: 'spa',
  },
})
```

```html
<!-- packages/cli/test/fixtures/user-html/index.html -->
<!doctype html>
<html lang="zh-cmn-Hans">
  <head>
    <meta charset="UTF-8" />
    <meta name="miko-user-html" content="preserved" />
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

```vue
<!-- packages/cli/test/fixtures/user-html/pages/index.vue -->
<template>
  <main>User HTML</main>
</template>
```

- [ ] **Step 6: Add the invalid-config fixture**

```json
// packages/cli/test/fixtures/invalid-config/package.json
{
  "name": "miko-invalid-config-fixture",
  "private": true,
  "type": "module"
}
```

```ts
// packages/cli/test/fixtures/invalid-config/miko.config.ts
export default {
  miko: {
    rendering: 'invalid',
  },
}
```

- [ ] **Step 7: Migrate the starter to the sole configuration file**

Replace `app/miko.config.ts` with:

```ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'

export default defineMikoConfig({
  miko: {
    uiLibrary: 'vant',
  },
  vite: {
    base: '/cms/',
  },
})
```

Delete `app/vite.config.ts`.

- [ ] **Step 8: Run the integration tests and verify GREEN**

Run:

```sh
bun run test:packages -- packages/cli/test/cli.integration.test.ts
```

Expected: all four integration tests pass under `process.execPath` (Node), proving default SSG, explicit SPA, user HTML precedence with automatic entry injection, actionable invalid-config errors, and that Bun is not the required runtime.

- [ ] **Step 9: Build the real starter**

Run:

```sh
cd app
bun run build
```

Expected: type checking succeeds, SSG output is written under `app/dist`, and no `vite.config.ts` is loaded.

- [ ] **Step 10: Commit the starter migration**

```sh
git add app/miko.config.ts app/vite.config.ts packages/cli/test
git commit -m "test: verify zero-config node build"
```

---

### Task 11: Finish public exports, documentation, and slice acceptance

**Files:**

- Modify: `packages/vite-plugin-miko/index.ts`
- Modify: `packages/vite-plugin-miko/package.json`
- Modify: `packages/cli/package.json`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.remember/now.md`

- [ ] **Step 1: Export only the intended configuration surface**

At the public boundary, export:

```ts
export { defineMikoConfig } from './config/define'
export { MikoConfigError } from './config/errors'
export type {
  MikoConfig,
  MikoConfigEnv,
  MikoConfigExport,
  MikoOptions,
  ResolvedMikoConfig,
} from './config/types'
```

`resolveMikoProject`, `createMikoViteConfig`, and `createLibConfig` remain directly declared exports of `index.ts` in this slice. Do not expose internal merge helpers.

- [ ] **Step 2: Update package publish lists**

`packages/vite-plugin-miko/package.json` must include:

```json
{
  "files": [
    "config/",
    "index.ts",
    "types.ts",
    "template/"
  ]
}
```

`packages/cli/package.json` must include every new source directory used at runtime.

- [ ] **Step 3: Update user documentation**

Document exactly:

```ts
// Optional: miko.config.ts
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko'

export default defineMikoConfig({
  miko: {
    rendering: 'ssg',
    vuePluginOptions: {},
  },
  vite: {
    base: '/',
  },
})
```

State that:

- Zero-config projects do not need a configuration file.
- `vite.config.ts` is unsupported.
- CLI is mandatory.
- A user `<viteRoot>/index.html` is preserved and receives the Miko entry automatically; when absent, Miko supplies the same HTML entry from memory without changing `vite.root`.
- SPA/SSG application input is owned by Miko; Library Mode uses `miko.lib.entry`.
- Bun is the package manager; Node.js + jiti is the supported runtime path.
- Slice 1 keeps existing plugin behavior except the modern default disables Legacy.

- [ ] **Step 4: Record the project memory event**

Append a concise entry to `.remember/now.md`:

```markdown
## 2026-08-06 | Miko v1 Slice 1

Unified the CLI and configuration pipeline: CLI is the only execution path, `miko.config.ts` is the sole optional build config, configuration loading is root-aware and fails loudly, Vite options live under `vite`, and Node.js no longer probes pnpm or depends on Bun runtime APIs. Vite root remains the real application directory; user HTML is preferred, while a missing `<viteRoot>/index.html` is synthesized in memory and receives the Miko entry automatically.
```

- [ ] **Step 5: Run the complete slice verification**

Run:

```sh
bun run test:packages
bun run typecheck:packages
cd app
bun run test:unit -- --run
bun run build
```

Expected:

- All package unit/integration tests pass.
- Package type checking passes.
- Existing app unit tests pass.
- Starter SSG build passes.
- HTML plugin tests prove user HTML precedence, fallback synthesis, automatic entry injection, no temporary HTML file, and unchanged Vite root.
- No tracked `vite.config.ts` remains in the starter.
- `rg -n "MIKO_MODE|MIKO_LIB_MODE|pnpm root|loadEnvFiles|rejectUnauthorized: false" packages` returns no matches.
- `rg -n "root: template|process\\.cwd\\(\\)" packages/vite-plugin-index-html packages/vite-plugin-bootstrap` returns no matches.

- [ ] **Step 6: Inspect the final diff**

Run:

```sh
git diff --check
git status --short
```

Expected: no whitespace errors; only Slice 1 files and the pre-existing user-owned changes appear.

- [ ] **Step 7: Commit Slice 1**

```sh
git add package.json vitest.config.ts packages/cli packages/vite-plugin-index-html packages/vite-plugin-miko app/miko.config.ts app/vite.config.ts README.md AGENTS.md
git commit -m "feat!: unify miko cli and configuration core"
```

---

## Subsequent Plans

Create these only after Slice 1 is implemented and its actual interfaces are stable:

1. `2026-08-06-miko-v1-slice-2-plugin-auto-capabilities.md`
2. `2026-08-06-miko-v1-slice-3-build-runtime-performance.md`
3. `2026-08-06-miko-v1-slice-4-whitescreen-migration-release.md`

Each later plan must use the committed Slice 1 interfaces rather than copying assumptions from the umbrella design.
