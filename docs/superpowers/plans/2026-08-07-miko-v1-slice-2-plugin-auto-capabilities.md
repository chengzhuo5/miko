# Miko v1 Slice 2 Plugin Orchestration and Automatic Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic project-capability graph, assemble optional plugins from that graph, add automatic Pinia runtime setup, make Preview reuse Vite proxy configuration safely, and expose the final result through `miko doctor`.

**Architecture:** Keep Slice 1's `resolveMikoProject()` boundary and insert one pure detection/resolution stage between config loading and final config resolution. Optional plugins consume only resolved capabilities; they do not inspect the filesystem independently. CLI commands continue to use literal lazy loaders, and Doctor reads the same resolved project object used by Dev/Build/Preview.

**Tech Stack:** TypeScript, Node.js 20/22, Bun workspaces, Vite 8, Vitest 4, Vue 3, Pinia 4, Browserslist 4.28, jiti.

---

## Scope

This slice includes:

- Direct dependency and convention-file detection under the explicit CLI root.
- Tri-state optional capabilities: automatic, disabled, or explicitly enabled/configured.
- Stable plugin ordering and duplicate-core-plugin validation.
- Modern-by-default Legacy behavior and explicit-only CDN behavior.
- Automatic Pinia installation and SSG hydration through a virtual runtime module.
- Development-only Vue DevTools.
- Capability-sensitive dev-server restart.
- Preview proxy reuse through Vite's native proxy implementation.
- `miko doctor` text and JSON reports.

This slice does not include:

- Performance benchmarks or performance gates (Slice 3).
- White-screen detection, `miko check`, or `miko migrate` (Slice 4).
- Replacing Vite's proxy implementation with a custom proxy server.
- Recursive dependency discovery or cross-workspace guessing.

## File Structure

Create:

- `packages/vite-plugin-miko/capabilities/types.ts` — serializable detection and resolution contracts.
- `packages/vite-plugin-miko/capabilities/manifest.ts` — nearest manifest and convention-file reader.
- `packages/vite-plugin-miko/capabilities/resolve.ts` — explicit/config/convention/dependency/default precedence.
- `packages/vite-plugin-miko/capabilities/index.ts` — public capability exports.
- `packages/vite-plugin-miko/capabilities/manifest.test.ts`
- `packages/vite-plugin-miko/capabilities/resolve.test.ts`
- `packages/vite-plugin-miko/config/validate.ts` — final Vite/plugin invariant validation.
- `packages/vite-plugin-miko/config/validate.test.ts`
- `packages/vite-plugin-miko/plugins/core.ts` — mandatory Vue/router/bootstrap/HTML plugins.
- `packages/vite-plugin-miko/plugins/conventions.ts` — layouts/components/UnoCSS and disabled fallbacks.
- `packages/vite-plugin-miko/plugins/integrations.ts` — DevTools/Lint/Legacy/CDN/Janus.
- `packages/vite-plugin-miko/plugins/runtime.ts` — `virtual:miko-runtime` and Pinia adapter.
- `packages/vite-plugin-miko/plugins/restart.ts` — capability-input watcher.
- `packages/vite-plugin-miko/plugins/index.ts` — fixed plugin order.
- `packages/vite-plugin-miko/plugins/runtime.test.ts`
- `packages/vite-plugin-miko/plugins/order.test.ts`
- `packages/cli/doctor.ts` — Doctor renderer and runner.
- `packages/cli/doctor.test.ts`
- `packages/cli/preview-config.ts` — pure Preview config builder.
- `packages/cli/preview-config.test.ts`

Modify:

- `packages/vite-plugin-miko/config/types.ts`
- `packages/vite-plugin-miko/config/errors.ts`
- `packages/vite-plugin-miko/config/resolve.ts`
- `packages/vite-plugin-miko/index.ts`
- `packages/vite-plugin-miko/types.ts`
- `packages/vite-plugin-miko/template/main.ts`
- `packages/vite-plugin-miko/package.json`
- `packages/cli/args.ts`
- `packages/cli/args.test.ts`
- `packages/cli/errors.ts`
- `packages/cli/errors.test.ts`
- `packages/cli/run.ts`
- `packages/cli/entry.test.ts`
- `packages/cli/preview.ts`
- `packages/cli/package.json`
- `app/index.ts`
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

---

### Task 1: Read the nearest project manifest and convention signals

**Files:**

- Create: `packages/vite-plugin-miko/capabilities/types.ts`
- Create: `packages/vite-plugin-miko/capabilities/manifest.ts`
- Test: `packages/vite-plugin-miko/capabilities/manifest.test.ts`
- Test: `packages/vite-plugin-miko/package.test.ts`
- Modify: `packages/vite-plugin-miko/package.json`

- [ ] **Step 1: Write the failing manifest tests**

Cover:

```ts
it('uses the nearest package.json and only direct dependencies', async () => {
  const result = await inspectProject(root, 'production');
  expect(result.packageJsonPath).toBe(join(root, 'package.json'));
  expect(result.dependencies).toEqual(['pinia', 'vant']);
  expect(result.dependencies).not.toContain('transitive-only');
});

it('records only root-local convention files', async () => {
  const result = await inspectProject(root, 'production');
  expect(result.conventions).toMatchObject({
    components: true,
    layouts: true,
    unoConfig: join(root, 'uno.config.ts'),
    janusSchemas: join(root, 'schemas'),
  });
});

it('reads browserslist from package.json or a root config file', async () => {
  const result = await inspectProject(root, 'production');
  expect(result.browserslist).toEqual(['chrome 79']);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/capabilities/manifest.test.ts
```

Expected: FAIL because `inspectProject` does not exist.

- [ ] **Step 3: Implement serializable project signals**

Define:

```ts
export interface ProjectConventions {
  components: boolean;
  layouts: boolean;
  unoConfig: string | null;
  janusSchemas: string | null;
  lintConfig: string | null;
}

export interface ProjectSignals {
  root: string;
  packageJsonPath: string | null;
  dependencies: string[];
  browserslist: string[];
  browserslistConfigFile: string | null;
  conventions: ProjectConventions;
  watchedFiles: string[];
  watchedDirectories: string[];
}
```

`inspectProject(root, mode)` must:

1. Resolve `root`.
2. Walk upward only until the first `package.json`.
3. Read only `dependencies`, `devDependencies`, and `peerDependencies`.
4. Resolve Browserslist with its public `findConfigFile(root)` and `loadConfig({ path: root, env })`
   APIs. When no project Browserslist config exists, return an empty target list so Miko keeps
   its modern default instead of silently treating Browserslist's global defaults as project intent.
5. Check convention files only inside `root`.
6. Record ordinary files and watched directories separately so changes inside `schemas/` can
   trigger a restart.
7. Return sorted arrays for deterministic snapshots.
8. Never import or execute project code.

Add `browserslist` as a direct dependency of `@minar-kotonoha/vite-plugin-miko`. Add
`capabilities/` and the already-imported `config/` directory to the package `files` allow-list,
with a package-content regression test.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 1 test. Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add packages/vite-plugin-miko/capabilities packages/vite-plugin-miko/package.json packages/vite-plugin-miko/package.test.ts bun.lock
git commit -m "feat(miko): inspect project capability signals"
```

---

### Task 2: Resolve tri-state capabilities with stable provenance

**Files:**

- Create: `packages/vite-plugin-miko/capabilities/resolve.ts`
- Create: `packages/vite-plugin-miko/capabilities/index.ts`
- Test: `packages/vite-plugin-miko/capabilities/resolve.test.ts`
- Modify: `packages/vite-plugin-miko/config/types.ts`
- Modify: `packages/vite-plugin-miko/types.ts`
- Modify: `packages/vite-plugin-miko/config/errors.ts`

- [ ] **Step 1: Write the failing capability matrix**

Test these exact rules:

```ts
it('uses modern defaults without optional dependencies', () => {
  const result = resolveCapabilities(raw(), signals(), env({ command: 'build' }));
  expect(result.legacy).toMatchObject({ enabled: false, source: 'default' });
  expect(result.cdn).toMatchObject({ enabled: false, source: 'default' });
  expect(result.devtools).toMatchObject({ enabled: false, source: 'command' });
});

it('enables devtools only for dev', () => {
  expect(resolveCapabilities(raw(), signals(), env({ command: 'dev' })).devtools.enabled).toBe(
    true,
  );
  expect(resolveCapabilities(raw(), signals(), env({ command: 'build' })).devtools.enabled).toBe(
    false,
  );
});

it('auto-detects one UI library and rejects an ambiguous pair', () => {
  expect(
    resolveCapabilities(raw(), signals({ dependencies: ['vant'] }), env({ command: 'build' }))
      .uiLibrary.value,
  ).toBe('vant');
  expect(() =>
    resolveCapabilities(
      raw(),
      signals({ dependencies: ['vant', 'element-plus'] }),
      env({ command: 'build' }),
    ),
  ).toThrowError(expect.objectContaining({ code: 'MIKO_CAPABILITY_CONFLICT' }));
});

it('enables legacy for old browser targets but honors explicit false', () => {
  expect(
    resolveCapabilities(raw(), signals({ browserslist: ['chrome 79'] }), env({ command: 'build' }))
      .legacy.enabled,
  ).toBe(true);
  expect(
    resolveCapabilities(
      raw({ legacyPluginOptions: false }),
      signals({ browserslist: ['ie 11'] }),
      env({ command: 'build' }),
    ).legacy.enabled,
  ).toBe(false);
});

it('fails when an explicitly enabled integration is missing', () => {
  expect(() =>
    resolveCapabilities(raw({ janusOptions: true }), signals(), env({ command: 'build' })),
  ).toThrowError(expect.objectContaining({ code: 'MIKO_CAPABILITY_MISSING_DEPENDENCY' }));
});
```

- [ ] **Step 2: Run and verify RED**

Expected: missing resolver/types.

- [ ] **Step 3: Add tri-state public types**

Use:

```ts
export type AutoOption<T extends object> = boolean | T;

export interface MikoOptions {
  rendering?: MikoRendering;
  uiLibrary?: false | 'vant' | 'element-plus';
  legacyPluginOptions?: AutoOption<LegacyOptions>;
  linterOptions?: AutoOption<LinterOptions>;
  devToolsPluginOptions?: AutoOption<DevToolsOptions>;
  layoutsPluginOptions?: AutoOption<LayoutsUserOptions>;
  componentsPluginOptions?: AutoOption<ComponentsOptions>;
  unoCSSPluginOptions?: AutoOption<UnoCSSVitePluginConfig>;
  pinia?: boolean;
  unhead?: boolean;
  janusOptions?: AutoOption<JanusOptions>;
  externalOptions?: ExternalOptions | false;
}
```

`undefined` means automatic. `false` means disabled. `true` means enabled with defaults.
Use the real `VitePluginVueDevToolsOptions` type exported by `vite-plugin-vue-devtools` rather
than inventing a parallel options contract.

Define serializable resolved states:

```ts
export type CapabilitySource =
  'explicit' | 'convention' | 'dependency' | 'command' | 'default' | 'builtin';

export interface ResolvedCapability<T> {
  enabled: boolean;
  value: T;
  source: CapabilitySource;
  reason: string;
}
```

- [ ] **Step 4: Implement the fixed precedence**

Resolve in this order:

```text
explicit config
→ root convention
→ direct dependency
→ command
→ safe default
```

Legacy classification uses Browserslist's normalized target list. Treat IE, Opera Mini, Android
below 80, Chrome/Edge below 80, Firefox below 78, Safari/iOS below 13 as legacy. Handle normalized
mobile names (`and_chr`, `and_ff`, `ios_saf`) and version ranges deterministically.

CDN remains explicit-only: `frameworkCDN` is required.

Unhead resolves as `builtin` for both Miko rendering modes because the selected ViteSSG runtime
owns and installs the single head instance; `unhead: false` is rejected instead of installing a
second or partially disabled head runtime.

- [ ] **Step 5: Run tests and type checking**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/capabilities/resolve.test.ts
bun run typecheck:packages
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add packages/vite-plugin-miko/capabilities/resolve.ts packages/vite-plugin-miko/capabilities/index.ts packages/vite-plugin-miko/capabilities/resolve.test.ts packages/vite-plugin-miko/config/types.ts packages/vite-plugin-miko/config/errors.ts packages/vite-plugin-miko/types.ts
git commit -m "feat(miko): resolve automatic capabilities"
```

---

### Task 3: Insert detection into `resolveMikoProject` and validate final invariants

**Files:**

- Create: `packages/vite-plugin-miko/config/validate.ts`
- Test: `packages/vite-plugin-miko/config/validate.test.ts`
- Modify: `packages/vite-plugin-miko/config/resolve.ts`
- Modify: `packages/vite-plugin-miko/config/types.ts`
- Modify: `packages/vite-plugin-miko/index.ts`
- Modify: `packages/vite-plugin-miko/config/resolve.test.ts`

- [ ] **Step 1: Write failing resolution and invariant tests**

Cover:

```ts
it('returns signals and capability provenance with the resolved project', async () => {
  const project = await resolveMikoProject(env);
  expect(project.capabilities.pinia).toMatchObject({
    enabled: true,
    source: 'dependency',
  });
});

it('rejects a user plugin that duplicates a Miko core plugin', () => {
  expect(() =>
    validateFinalConfig(project, {
      plugins: [{ name: '@minar-kotonoha/vite-plugin-index-html' }],
    }),
  ).toThrow(/核心插件/);
});

it('rejects optimizeDeps include/exclude conflicts', () => {
  expect(() =>
    validateFinalConfig(project, {
      optimizeDeps: { include: ['vue'], exclude: ['vue'] },
    }),
  ).toThrow(/optimizeDeps/);
});

it('rejects build.lib during an application build', () => {
  expect(() => validateFinalConfig(project, { build: { lib: { entry: 'src/index.ts' } } })).toThrow(
    /build\.lib/,
  );
});
```

- [ ] **Step 2: Verify RED**

Run the two config test files. Expected: FAIL.

- [ ] **Step 3: Change the project-resolution flow**

Implement:

```ts
export async function resolveMikoProject(env: MikoConfigEnv): Promise<ResolvedMikoConfig> {
  const [loaded, signals] = await Promise.all([
    loadMikoConfig(env),
    inspectProject(env.root, env.mode),
  ]);
  const capabilities = resolveCapabilities(loaded.config.miko ?? {}, signals, env);
  const project = resolveMikoConfig(loaded, env, getBundledTemplate(), capabilities, signals);
  validateResolvedProject(project);
  return project;
}
```

`ResolvedMikoConfig` must contain `signals` and `capabilities`.

- [ ] **Step 4: Validate the final Vite config before invoking Vite**

Reject:

- Duplicate Miko core plugin names using the actual flattened plugin names produced by Miko
  (`@minar-kotonoha/vite-plugin-bootstrap`,
  `@minar-kotonoha/vite-plugin-index-html`, its `:entry` companion, and Miko-owned virtual
  plugins). Do not rename third-party plugins merely to make diagnostics prettier.
- `optimizeDeps.include`/`exclude` overlap.
- Application `build.lib`.
- Application input overrides already covered by Slice 1.
- CDN enabled without framework package resolution.
- Contradictory SSR external/noExternal entries when both are exact strings.

- [ ] **Step 5: Verify GREEN and commit**

Run config tests plus type checking, then:

```sh
git add packages/vite-plugin-miko/config/validate.ts packages/vite-plugin-miko/config/validate.test.ts packages/vite-plugin-miko/config/resolve.ts packages/vite-plugin-miko/config/resolve.test.ts packages/vite-plugin-miko/config/types.ts packages/vite-plugin-miko/index.ts
git commit -m "feat(miko): validate resolved capability graph"
```

---

### Task 4: Split plugin assembly into fixed, inspectable groups

**Files:**

- Create: `packages/vite-plugin-miko/plugins/core.ts`
- Create: `packages/vite-plugin-miko/plugins/conventions.ts`
- Create: `packages/vite-plugin-miko/plugins/integrations.ts`
- Create: `packages/vite-plugin-miko/plugins/index.ts`
- Test: `packages/vite-plugin-miko/plugins/order.test.ts`
- Modify: `packages/vite-plugin-miko/index.ts`

- [ ] **Step 1: Write the failing order tests**

Assert the exact logical capability order:

```ts
expect(result.order).toEqual([
  'miko:ssr-css',
  'miko:vue',
  'miko:runtime',
  'miko:layouts',
  'miko:components',
  'miko:unocss',
  'miko:linter',
  'miko:devtools',
  'miko:legacy',
  'miko:bootstrap',
  'miko:external-resolve',
  'miko:external-cdn',
  'miko:html-entry',
  'miko:janus',
  'miko:restart-on-capability-change',
]);
```

`order` is a stable diagnostic list of Miko capability groups, not a replacement for the real Vite
plugin names. Disabled optional entries are omitted, but relative order never changes. Tests must
also flatten the returned `PluginOption[]` and prove that the protected real plugin names stay in
the same relative order.

- [ ] **Step 2: Verify RED**

Expected: `assembleMikoPlugins` does not exist.

- [ ] **Step 3: Extract plugin groups without changing behavior**

Use:

```ts
export interface PluginAssembly {
  plugins: PluginOption[];
  order: string[];
  protectedPluginNames: string[];
}

export async function assembleMikoPlugins(project: ResolvedMikoConfig): Promise<PluginAssembly>;
```

Rules:

- Core: SSR CSS, Vue Macros/Vue/JSX/Router, runtime, bootstrap, HTML.
- Conventions: Layouts, Components, UnoCSS; disabled virtual fallbacks remain.
- Integrations: Lint, DevTools, Legacy, External, Janus.
- Restart plugin is dev-only.
- User Vite plugins are merged by `mergeViteConfig` after Miko plugins and cannot duplicate core names.
- Add `plugins/` to the package `files` allow-list and verify the published tarball contains
  `config/`, `capabilities/`, and `plugins/`.

- [ ] **Step 4: Replace the large `createMikoPlugins` body**

`packages/vite-plugin-miko/index.ts` should only call `assembleMikoPlugins(project)` and merge the returned plugin list.

- [ ] **Step 5: Verify and commit**

Run order, factory, integration, and HTML tests; commit:

```sh
git add packages/vite-plugin-miko/plugins packages/vite-plugin-miko/index.ts
git commit -m "refactor(miko): make plugin order explicit"
```

---

### Task 5: Add the automatic Pinia runtime adapter

**Files:**

- Create: `packages/vite-plugin-miko/plugins/runtime.ts`
- Test: `packages/vite-plugin-miko/plugins/runtime.test.ts`
- Modify: `packages/vite-plugin-miko/template/main.ts`
- Modify: `app/index.ts`

- [ ] **Step 1: Write failing virtual-module tests**

Cover enabled and disabled output:

```ts
it('generates Pinia install, restore, and SSR serialization when enabled', () => {
  const code = createRuntimeModule({ pinia: true });
  expect(code).toContain("from 'pinia'");
  expect(code).toContain('app.use(pinia)');
  expect(code).toContain('pinia.state.value = initialState.pinia');
  expect(code).toContain('initialState.pinia = pinia.state.value');
});

it('generates a zero-cost no-op when Pinia is disabled', () => {
  const code = createRuntimeModule({ pinia: false });
  expect(code).not.toContain("from 'pinia'");
  expect(code).toContain('afterBootstrap() {}');
});
```

- [ ] **Step 2: Verify RED**

Expected: runtime module missing.

- [ ] **Step 3: Implement `virtual:miko-runtime`**

The generated API is:

```ts
export interface MikoRuntimeHandle {
  afterBootstrap(): void | Promise<void>;
}

export function setupMikoRuntime(
  app: App,
  initialState: Record<string, unknown>,
): MikoRuntimeHandle;
```

When Pinia is enabled:

1. Create and install one Pinia instance before the project bootstrap.
2. Restore `initialState.pinia` on the client.
3. Serialize `pinia.state.value` after project bootstrap on SSR.

Unhead is not installed again; ViteSSG already creates and installs the single head instance.

- [ ] **Step 4: Wire the template**

Change template setup to:

```ts
const runtime = setupMikoRuntime(app, initialState);
await bootstrap(app, router, initialState);
await runtime.afterBootstrap();
```

Remove manual Pinia creation/hydration from `app/index.ts`.

- [ ] **Step 5: Verify SSG hydration**

Run:

```sh
bun run test:packages -- packages/vite-plugin-miko/plugins/runtime.test.ts
cd app
bun run build
bun run test:unit -- --run
```

Expected: build and unit tests pass; generated HTML still contains `/cms/assets/`.

- [ ] **Step 6: Commit**

```sh
git add packages/vite-plugin-miko/plugins/runtime.ts packages/vite-plugin-miko/template/main.ts app/index.ts
git commit -m "feat(miko): auto-install pinia runtime"
```

---

### Task 6: Restart dev when capability inputs change

**Files:**

- Create: `packages/vite-plugin-miko/plugins/restart.ts`
- Test: `packages/vite-plugin-miko/plugins/restart.test.ts`

- [ ] **Step 1: Write failing watcher tests**

Use a fake watcher/server and prove:

- `package.json`, `miko.config.ts`, Browserslist config, Uno config, and detected schema paths are watched.
- A change to a file inside a watched schema directory schedules a restart.
- One change schedules one `server.restart()`.
- Page and component source changes do not trigger this plugin.
- Multiple events in the same microtask are coalesced.

- [ ] **Step 2: Implement the plugin**

```ts
export function capabilityRestartPlugin(
  watchedFiles: string[],
  watchedDirectories: string[],
): Plugin {
  return {
    name: 'miko:restart-on-capability-change',
    apply: 'serve',
    configureServer(server) {
      const files = new Set(watchedFiles.map(normalizePath));
      const directories = watchedDirectories.map(
        (path) => `${normalizePath(path).replace(/\/$/, '')}/`,
      );
      server.watcher.add([...files, ...watchedDirectories]);
      let pending = false;
      server.watcher.on('change', (file) => {
        const normalized = normalizePath(file);
        const watched =
          files.has(normalized) ||
          directories.some((directory) => normalized.startsWith(directory));
        if (!watched || pending) return;
        pending = true;
        queueMicrotask(() => {
          pending = false;
          void server.restart().catch((error) => server.config.logger.error(String(error)));
        });
      });
    },
  };
}
```

- [ ] **Step 3: Verify and commit**

Run test, type checking, then commit the restart plugin.

---

### Task 7: Reuse Vite proxy config in Preview without weakening TLS

**Files:**

- Create: `packages/cli/preview-config.ts`
- Test: `packages/cli/preview-config.test.ts`
- Modify: `packages/cli/preview.ts`

- [ ] **Step 1: Write failing proxy tests**

Cover:

```ts
it('uses explicit preview.proxy before server.proxy', async () => {
  const config = await createPreviewConfig(
    project({ preview: { proxy: previewProxy }, server: { proxy: devProxy } }),
  );
  expect(config.preview?.proxy).toEqual(previewProxy);
});

it('falls back to server.proxy without mutating it', async () => {
  const config = await createPreviewConfig(project({ server: { proxy: devProxy } }));
  expect(config.preview?.proxy).toEqual(devProxy);
  expect(config.preview?.proxy).not.toBe(devProxy);
});

it('preserves proxy callbacks without injecting insecure TLS options', async () => {
  const rewrite = (path: string) => path;
  const config = await createPreviewConfig(
    project({ server: { proxy: { '/api': { target: 'https://example.com', rewrite } } } }),
  );
  expect(config.preview?.proxy?.['/api']).toMatchObject({ rewrite });
  expect(JSON.stringify(config)).not.toContain('"secure":false');
});
```

- [ ] **Step 2: Implement a pure Preview builder**

```ts
export async function createPreviewConfig(project: ResolvedMikoConfig): Promise<UserConfig> {
  const config = await createMikoViteConfig(project);
  const proxy = config.preview?.proxy ?? config.server?.proxy;
  return {
    ...config,
    configFile: false,
    mode: project.env.mode,
    root: project.outDir,
    preview: {
      ...config.preview,
      proxy: cloneProxyConfig(proxy),
    },
  };
}
```

`cloneProxyConfig` clones the proxy record and each object-valued rule while preserving callback,
RegExp, agent, and stream references. Do not use `structuredClone`: Vite proxy options legitimately
contain functions such as `rewrite` and `configure`.

Do not add `secure: false`, `rejectUnauthorized: false`, or custom credential logging.

- [ ] **Step 3: Wire `runPreview`, verify, and commit**

Run unit tests plus a real Preview smoke request through a local HTTP upstream. Expect proxied 200 and upstream failure 502.

---

### Task 8: Add `miko doctor`

**Files:**

- Create: `packages/cli/doctor.ts`
- Test: `packages/cli/doctor.test.ts`
- Modify: `packages/cli/args.ts`
- Modify: `packages/cli/args.test.ts`
- Modify: `packages/cli/errors.ts`
- Modify: `packages/cli/errors.test.ts`
- Modify: `packages/cli/run.ts`
- Modify: `packages/cli/entry.test.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Write failing parser and renderer tests**

Add `doctor` and `--json`.

Text report must contain:

```text
Miko Doctor
Root:
Config:
Rendering:
Capabilities:
Plugin order:
Warnings:
```

JSON report must be stable and serializable:

```ts
expect(JSON.parse(output)).toMatchObject({
  root,
  configFile: null,
  rendering: 'ssg',
  capabilities: {
    legacy: { enabled: false, source: 'default' },
  },
  plugins: expect.any(Array),
  warnings: expect.any(Array),
});
```

- [ ] **Step 2: Verify RED**

Expected: unknown command/option.

- [ ] **Step 3: Implement the literal lazy runner**

Add:

```ts
doctor: async () => (await import('./doctor.ts')).runDoctor;
```

`runDoctor(context)` resolves the project and plugin assembly but never starts Vite or writes application files.

Map `MIKO_CAPABILITY_*` errors to exit code 3. Configuration errors remain exit code 2.

- [ ] **Step 4: Publish all runtime files**

Add Doctor and Preview builder files to the CLI package `files` array. Keep the Miko package
allow-list covered by its package-content test so every imported `config/`, `capabilities/`, and
`plugins/` runtime file ships.

- [ ] **Step 5: Verify Node runtime and commit**

Run:

```sh
node packages/cli/miko doctor --root app
node packages/cli/miko doctor --root app --json
```

Expected: both exit 0; JSON parses.

---

### Task 9: Add the automatic-capability integration matrix

**Files:**

- Modify: `packages/vite-plugin-miko/config/factory.integration.test.ts`
- Create: `packages/cli/doctor.integration.test.ts`
- Modify: `app/miko.config.ts`

- [ ] **Step 1: Add temp-project integration cases**

Build fixtures for:

1. No optional dependencies: SSG, modern output, no CDN/Legacy.
2. Direct Pinia dependency: virtual runtime includes Pinia.
3. Vant only: Vant resolver selected.
4. Vant + Element Plus without explicit choice: fails before Vite.
5. Old Browserslist target: Legacy enabled.
6. Explicit `legacyPluginOptions: false`: Legacy disabled despite old target.
7. Explicit CDN: framework URL define and external plugin enabled.
8. Explicit Janus with missing dependency: exit code 3.
9. `rendering: 'spa'`: no SSG render and no full-app `ClientOnly` behavior change in this slice.

- [ ] **Step 2: Verify under Node**

Spawn the CLI with `process.execPath`, not Bun. Bun remains the package manager only.

- [ ] **Step 3: Run the full matrix**

```sh
bun run test:packages
bun run typecheck:packages
```

Expected: all green.

- [ ] **Step 4: Commit**

```sh
git add packages/vite-plugin-miko/config/factory.integration.test.ts packages/cli/doctor.integration.test.ts app/miko.config.ts
git commit -m "test(miko): cover automatic capability matrix"
```

---

### Task 10: Documentation, memory, and Slice 2 acceptance

**Files:**

- Modify: `README.md`
- Modify: `packages/vite-plugin-miko/README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.remember/now.md`

- [ ] **Step 1: Document the zero-config detection table**

Document:

- Explicit/config/convention/dependency/command/default precedence.
- Bun package management and Node+jiti runtime.
- Modern default: no Legacy and no CDN.
- `vite.server`/`vite.preview` proxy behavior.
- Doctor text/JSON commands.
- Pinia automatic setup and removal of manual starter boilerplate.

- [ ] **Step 2: Record project memory**

Append to the local project memory:

```markdown
## 2026-08-07 | Miko v1 Slice 2

Added one deterministic capability graph shared by Dev, Build, Preview, and Doctor. Optional plugins no longer inspect the project independently. Modern builds keep Legacy and CDN disabled unless detection or explicit configuration enables them; Pinia setup is generated through the Miko runtime virtual module.
```

`.remember/now.md` is intentionally ignored by Git. Update it as local project memory, but do not
force-add it and do not stage the already-dirty `.omc/project-memory.json`.

- [ ] **Step 3: Run acceptance**

```sh
bun install --frozen-lockfile
bun run test:packages
bun run typecheck:packages
cd app
bun run test:unit -- --run
bun run build
bun run miko doctor --json
```

Expected:

- All tests and type checks pass.
- Starter SSG build succeeds.
- Generated HTML uses `/cms/assets/`.
- Doctor JSON parses and shows Pinia from direct dependency, DevTools disabled for build, Legacy disabled, CDN disabled.
- `rg -n "^(const|let|var) .*process\\.cwd\\(" packages/vite-plugin-miko packages/cli` finds
  no module-load-time cached root.
- `rg -n "createPinia\\(" app/index.ts` finds no starter-owned Pinia setup.
- `rg -n "rejectUnauthorized:\\s*false|secure:\\s*false" packages/vite-plugin-miko packages/cli`
  finds no injected insecure proxy defaults.

- [ ] **Step 4: Inspect package contents**

Run Bun publish dry-runs for CLI, Miko plugin, and external plugin. Confirm every new runtime file is included.

- [ ] **Step 5: Final diff and commit**

```sh
git diff --check
git status --short
git add README.md AGENTS.md CLAUDE.md packages/vite-plugin-miko/README.md
git commit -m "feat!: add miko automatic capabilities and doctor"
```

Before every commit, stage exact intended paths only. Never use broad `git add packages app` in
this worktree because user-owned `.omc/`, `app/.env.test`, and `app/preview.log.err` changes are
outside this slice.

---

## Plan Self-Review

- Spec coverage: project detection, tri-state capabilities, fixed plugin ordering, Pinia adapter, DevTools, Legacy/CDN, Preview Proxy, Doctor, restart behavior, and Node runtime matrix are assigned to tasks.
- Deferred by design: performance work remains Slice 3; white-screen, Check, Migrate, and release remain Slice 4.
- Placeholder scan: no implementation step contains TBD/TODO or an unspecified “handle errors” instruction.
- Type consistency: all tasks retain Slice 1's `{ miko, vite }`, `resolveMikoProject`,
  `ResolvedMikoConfig`, and `*PluginOptions` naming. Preview config creation is async; diagnostic
  plugin order is distinct from real Vite plugin names; watched files and directories are modeled
  separately.
