# Miko Library CSS Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in `miko.lib.cssScope` so `miko build --lib` can confine generated CSS to a consumer-provided container.

**Architecture:** Keep scope transformation inside the Library Mode Vite configuration. A small, dependency-free PostCSS-compatible plugin rewrites ordinary selectors at build time, while configuration validation prevents empty scopes and the ambiguous combination of a scope with a string-form PostCSS config path. The regular application pipeline remains untouched.

**Tech Stack:** TypeScript, Vite 8/Rolldown, PostCSS plugin interface supplied by Vite, Vitest, Bun, Oxlint, Oxfmt.

---

## File structure

- Create: `packages/vite-plugin-miko/lib-css-scope.ts`
  - Pure selector rewriting helpers and the PostCSS-compatible scope plugin.
- Create: `packages/vite-plugin-miko/lib-css-scope.test.ts`
  - Unit coverage for selector handling without a Vite build.
- Modify: `packages/vite-plugin-miko/types.ts`
  - Add the public `LibConfig.cssScope?: string` API.
- Modify: `packages/vite-plugin-miko/config/validate.ts`
  - Validate and normalize library scope configuration.
- Modify: `packages/vite-plugin-miko/config/validate.test.ts`
  - Regress empty scope and string PostCSS-path conflict diagnostics.
- Modify: `packages/vite-plugin-miko/index.ts`
  - Use the normalized scope to add the internal PostCSS plugin in Library Mode.
- Modify: `packages/vite-plugin-miko/lib.integration.test.ts`
  - Run a real Vite library build and inspect emitted CSS.
- Modify: `packages/vite-plugin-miko/README.md`
  - Document the consumer wrapper contract and limitations.
- Modify: `.remember/now.md`
  - Record the verified behavior and test evidence after implementation.

## Task 1: Define and validate the public library scope contract

**Files:**

- Modify: `packages/vite-plugin-miko/config/validate.test.ts`
- Modify: `packages/vite-plugin-miko/types.ts:42-51`
- Modify: `packages/vite-plugin-miko/config/validate.ts:34-45`

- [ ] **Step 1: Add failing validation tests**

  Add this block after the existing `validateResolvedProject` tests. Reuse the file-local `project()` helper and override only `miko.lib` or `vite`.

  ```ts
  describe('validateLibCssScope', () => {
    it('rejects an empty library CSS scope', () => {
      const configured = project({
        miko: { lib: { cssScope: '   ' } } as ResolvedMikoConfig['miko'],
      })

      expect(() => validateResolvedProject(configured)).toThrow(/miko\.lib\.cssScope/)
    })

    it('rejects a scope combined with a string PostCSS config path', () => {
      const configured = project({
        vite: { css: { postcss: './postcss.config.cjs' } },
        miko: { lib: { cssScope: '[data-miko-lib="fixture"]' } } as ResolvedMikoConfig['miko'],
      })

      expect(() => validateResolvedProject(configured)).toThrow(/vite\.css\.postcss/)
    })
  })
  ```

- [ ] **Step 2: Run the focused tests and verify they fail for missing validation**

  Run:

  ```powershell
  bunx vitest run packages/vite-plugin-miko/config/validate.test.ts
  ```

  Expected: the two new expectations fail because the current validator accepts both configurations.

- [ ] **Step 3: Add the `cssScope` type and normalizing validator**

  In `packages/vite-plugin-miko/types.ts`, add this property to `LibConfig`:

  ```ts
  /**
   * 将库 CSS 限定到该宿主选择器；使用方必须提供匹配容器。
   * @example '[data-miko-lib="quote-kit"]'
   */
  cssScope?: string
  ```

  In `packages/vite-plugin-miko/config/validate.ts`, add an exported function before
  `validateResolvedProject`:

  ```ts
  export function validateLibCssScope(project: ResolvedMikoConfig): string | undefined {
    const cssScope = project.miko.lib?.cssScope
    if (cssScope === undefined) return undefined

    if (typeof cssScope !== 'string' || cssScope.trim().length === 0) {
      throw new MikoConfigError({
        code: 'MIKO_CONFIG_INVALID',
        field: 'miko.lib.cssScope',
        message: 'miko.lib.cssScope 必须是非空 CSS 选择器字符串',
      })
    }

    if (typeof project.vite.css?.postcss === 'string') {
      throw new MikoConfigError({
        code: 'MIKO_CONFIG_CONFLICT',
        field: 'vite.css.postcss',
        message: 'miko.lib.cssScope 不能与字符串形式的 vite.css.postcss 同时使用；请改为 vite.css.postcss.plugins',
      })
    }

    return cssScope.trim()
  }
  ```

  Call `validateLibCssScope(project)` at the end of `validateResolvedProject`. This
  keeps the CLI path fail-fast while the return value remains available to the library
  config factory in Task 3.

- [ ] **Step 4: Re-run the focused validation tests**

  Run:

  ```powershell
  bunx vitest run packages/vite-plugin-miko/config/validate.test.ts
  ```

  Expected: all tests pass, including the two new stable error cases.

- [ ] **Step 5: Commit the public contract**

  Run:

  ```powershell
  git add -- packages/vite-plugin-miko/types.ts packages/vite-plugin-miko/config/validate.ts packages/vite-plugin-miko/config/validate.test.ts
  git commit -m "feat(miko): validate library CSS scopes"
  ```

  Expected: one commit containing only the type, validation, and test changes.

## Task 2: Implement the pure selector scope transformer

**Files:**

- Create: `packages/vite-plugin-miko/lib-css-scope.test.ts`
- Create: `packages/vite-plugin-miko/lib-css-scope.ts`

- [ ] **Step 1: Write failing unit tests for selector transformation**

  Create `packages/vite-plugin-miko/lib-css-scope.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { createLibCssScopePlugin } from './lib-css-scope'

  const scope = '[data-miko-lib="quote-kit"]'

  interface Parent {
    name?: string
    parent?: Parent
    type?: string
  }

  function transform(selector: string, parent?: Parent): string {
    const rule = { selector, parent }
    const plugin = createLibCssScopePlugin(scope) as {
      Rule(rule: typeof rule): void
    }
    plugin.Rule(rule)
    return rule.selector
  }

  describe('createLibCssScopePlugin', () => {
    it('prefixes each ordinary comma-separated selector once', () => {
      expect(transform('.button, .card > .title')).toBe(
        `${scope} .button, ${scope} .card > .title`,
      )
      expect(transform(`${scope} .button`)).toBe(`${scope} .button`)
    })

    it('maps leading application root selectors to the library scope', () => {
      expect(transform(':root, html .button, body .card, #app > .panel')).toBe(
        `${scope}, ${scope} .button, ${scope} .card, ${scope} > .panel`,
      )
    })

    it('keeps keyframe frame selectors untouched', () => {
      const keyframes = { type: 'atrule', name: 'keyframes' } as const
      expect(transform('from, 50%, to', keyframes)).toBe('from, 50%, to')
    })

    it('preserves commas inside functional and attribute selectors', () => {
      expect(transform(':is(.first, .second), [data-label="a,b"]')).toBe(
        `${scope} :is(.first, .second), ${scope} [data-label="a,b"]`,
      )
    })
  })
  ```

- [ ] **Step 2: Run the new unit tests and verify the missing plugin failure**

  Run:

  ```powershell
  bunx vitest run packages/vite-plugin-miko/lib-css-scope.test.ts
  ```

  Expected: failure because `./lib-css-scope` does not exist yet.

- [ ] **Step 3: Add the dependency-free PostCSS-compatible plugin**

  Create `packages/vite-plugin-miko/lib-css-scope.ts` with this implementation:

  ```ts
  import type { CSSOptions } from 'vite'

  type PostCSSPlugin = NonNullable<
    Exclude<NonNullable<CSSOptions['postcss']>, string>['plugins']
  >[number]

  interface CssParent {
    name?: string
    parent?: CssParent
    type?: string
  }

  interface CssRule {
    parent?: CssParent
    selector: string
  }

  const ROOT_SELECTOR = /^(?::root|:host|html|body|#app)(?=$|[\s>+~.:#[])/iu

  function splitSelectorList(selector: string): string[] {
    const selectors: string[] = []
    let current = ''
    let depth = 0
    let quote = ''
    let escaped = false

    for (const character of selector) {
      if (quote) {
        current += character
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = ''
        continue
      }

      if (character === '"' || character === "'") {
        quote = character
        current += character
        continue
      }
      if (character === '(' || character === '[') depth++
      else if (character === ')' || character === ']') depth--

      if (character === ',' && depth === 0) {
        selectors.push(current)
        current = ''
        continue
      }
      current += character
    }

    selectors.push(current)
    return selectors
  }

  function isInsideKeyframes(rule: CssRule): boolean {
    let parent = rule.parent
    while (parent) {
      if (parent.type === 'atrule' && /(?:^|-)keyframes$/iu.test(parent.name ?? '')) {
        return true
      }
      parent = parent.parent
    }
    return false
  }

  function isAlreadyScoped(selector: string, scope: string): boolean {
    if (selector === scope) return true
    const suffix = selector.slice(scope.length, scope.length + 1)
    return (
      selector.startsWith(scope) &&
      (suffix === ' ' || suffix === '>' || suffix === '+' || suffix === '~' || suffix === ':')
    )
  }

  function scopeSelector(selector: string, scope: string): string {
    const trimmed = selector.trim()
    if (!trimmed || isAlreadyScoped(trimmed, scope)) return trimmed
    if (ROOT_SELECTOR.test(trimmed)) return `${scope}${trimmed.replace(ROOT_SELECTOR, '')}`.trim()
    return `${scope} ${trimmed}`
  }

  export function createLibCssScopePlugin(scope: string): PostCSSPlugin {
    return {
      postcssPlugin: 'miko:lib-css-scope',
      Rule(rule: CssRule) {
        if (isInsideKeyframes(rule)) return
        const selectors = splitSelectorList(rule.selector)
          .map(selector => scopeSelector(selector, scope))
          .filter(Boolean)
        rule.selector = [...new Set(selectors)].join(', ')
      },
    } as PostCSSPlugin
  }
  ```

  Do not add a direct `postcss` dependency: the implementation exposes only Vite's
  public CSS option shape and returns a structural PostCSS-compatible plugin object.

- [ ] **Step 4: Run selector unit tests**

  Run:

  ```powershell
  bunx vitest run packages/vite-plugin-miko/lib-css-scope.test.ts
  ```

  Expected: 4 tests pass. The `@keyframes` case must retain `from`, `50%`, and `to`
  exactly, rather than prefixing them.

- [ ] **Step 5: Commit the transformer**

  Run:

  ```powershell
  git add -- packages/vite-plugin-miko/lib-css-scope.ts packages/vite-plugin-miko/lib-css-scope.test.ts
  git commit -m "feat(miko): scope library CSS selectors"
  ```

  Expected: one commit containing the pure transformer and its unit coverage.

## Task 3: Wire CSS scope into real Library Mode output

**Files:**

- Modify: `packages/vite-plugin-miko/index.ts:103-148`
- Modify: `packages/vite-plugin-miko/lib.integration.test.ts`

- [ ] **Step 1: Add a failing real-build scope assertion**

  In `packages/vite-plugin-miko/lib.integration.test.ts`, add a fixture writer and a
  test that changes `src/style.css` before calling `createLibConfig`:

  ```ts
  it('scopes emitted library CSS without losing explicit PostCSS plugins', async () => {
    const root = await createLibraryFixture()
    const scope = '[data-miko-lib="fixture"]'
    await writeFile(
      resolve(root, 'src/style.css'),
      [
        '.fixture, .secondary { width: 20px }',
        ':root { --fixture-color: red }',
        'html .nested, body .from-body, #app > .from-app { color: red }',
        '@media (min-width: 1px) { .media { display: block } }',
        '@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }',
      ].join('\n'),
    )
    const project = libraryProject(root)
    Object.assign(project.miko.lib!, { cssScope: scope })
    project.vite.css = {
      postcss: {
        plugins: [
          {
            postcssPlugin: 'fixture-explicit-plugin',
            Declaration(decl: { prop: string; value: string }) {
              if (decl.prop === 'width') decl.value = '21px'
            },
          },
        ],
      },
    }

    const css = (await buildLibraryCss(createLibConfig({ config: project }))).replace(/\s+/g, '')

    expect(css).toContain(`${scope} .fixture`)
    expect(css).toContain(`${scope} .secondary`)
    expect(css).toContain(`${scope}{--fixture-color:red}`)
    expect(css).toContain(`${scope} .nested`)
    expect(css).toContain(`${scope} .from-body`)
    expect(css).toContain(`${scope}>.from-app`)
    expect(css).toContain(`${scope} .media`)
    expect(css).toContain('@keyframes pulse{from{opacity:0}to{opacity:1}}')
    expect(css).toContain('width:21px')
  })
  ```

  Extract the duplicated `vite.build({ write: false })` result-to-CSS code from the
  existing tests into a `buildLibraryCss(config: UserConfig): Promise<string>` helper
  in the same file. The helper must retain `minify: false`; assertions may normalize
  whitespace with `css.replace(/\s+/g, '')` before comparison.

- [ ] **Step 2: Run the focused integration test and verify it fails**

  Run:

  ```powershell
  bunx vitest run packages/vite-plugin-miko/lib.integration.test.ts
  ```

  Expected: the new test fails because `createLibConfig` does not yet place the scope
  plugin into `css.postcss.plugins`.

- [ ] **Step 3: Attach the validated scope plugin to Library Mode**

  In `packages/vite-plugin-miko/index.ts`:

  ```ts
  import { validateLibCssScope } from './config/validate'
  import { createLibCssScopePlugin } from './lib-css-scope'
  ```

  At the start of `createLibConfig`, obtain the normalized optional scope:

  ```ts
  const cssScope = validateLibCssScope(config)
  ```

  Replace the library CSS default with:

  ```ts
  css: {
    // 库不能隐式继承应用根目录的 postcss-pxtorem 等自适应转换。
    // 如需 PostCSS，使用者可在 miko.config.ts 的 vite.css.postcss 显式提供。
    postcss: {
      plugins: cssScope ? [createLibCssScopePlugin(cssScope)] : [],
    },
  },
  ```

  Preserve the final `mergeViteConfig(generated, config.vite)` call. It is responsible
  for adding explicit user plugins after the Miko scope plugin.

- [ ] **Step 4: Run the real-build regression suite**

  Run:

  ```powershell
  bunx vitest run packages/vite-plugin-miko/lib.integration.test.ts packages/vite-plugin-miko/lib-css-scope.test.ts packages/vite-plugin-miko/config/validate.test.ts
  ```

  Expected: all library scope, library PostCSS isolation, selector, and validation
  tests pass.

- [ ] **Step 5: Commit the Library Mode wiring**

  Run:

  ```powershell
  git add -- packages/vite-plugin-miko/index.ts packages/vite-plugin-miko/lib.integration.test.ts
  git commit -m "feat(miko): enable scoped library styles"
  ```

  Expected: one commit containing only the library configuration wiring and real Vite
  regression coverage.

## Task 4: Document the consumption contract and run final verification

**Files:**

- Modify: `packages/vite-plugin-miko/README.md`
- Modify: `.remember/now.md`

- [ ] **Step 1: Document Library Mode CSS scope usage**

  Add a `## 组件库样式作用域` section after the configuration example in
  `packages/vite-plugin-miko/README.md`:

  ````md
  ## 组件库样式作用域

  `miko build --lib` 默认不改变 CSS。需要隔离组件库样式时，显式设置
  `miko.lib.cssScope`：

  ```ts
  export default defineMikoConfig({
    miko: {
      lib: {
        cssScope: '[data-miko-lib="quote-kit"]',
      },
    },
  })
  ```

  使用方必须以相同选择器包裹组件：

  ```vue
  <section data-miko-lib="quote-kit">
    <QuoteKit />
  </section>
  ```

  Miko 只作用域化普通 CSS 选择器及 `html`、`body`、`:root`、`#app`。
  它不会重命名 class、CSS 变量、动画名称或字体名称；需要完全隔离时应由组件库自行采用
  Shadow DOM。
  ````

- [ ] **Step 2: Record the verified behavior in project memory**

  Append a dated `.remember/now.md` entry that records:

  ```md
  ## 2026-08-17 | Library Mode CSS Scope 已实现

  `miko.lib.cssScope` 可选地将 Library Mode 普通 CSS 选择器限定到调用方容器；
  `html`、`body`、`:root`、`#app` 映射为该容器，keyframe 帧选择器保持原样。空 scope
  和字符串型 `vite.css.postcss` 同时配置会产生确定性错误。默认不修改现有库样式，显式
  PostCSS 插件继续合并。记录实际测试数量与类型检查结果。
  ```

- [ ] **Step 3: Run package verification**

  Run:

  ```powershell
  bunx vitest run packages/vite-plugin-miko
  bun run typecheck:packages
  bunx oxlint packages/vite-plugin-miko
  bunx oxfmt --check packages/vite-plugin-miko
  git diff --check
  ```

  Expected: all commands exit 0. Preserve unrelated worktree changes; do not stage
  `.omc/`, app environment files, logs, or unrelated documentation artifacts.

- [ ] **Step 4: Commit documentation and memory-visible source documentation**

  Run:

  ```powershell
  git add -- packages/vite-plugin-miko/README.md
  git commit -m "docs(miko): explain library CSS scopes"
  ```

  Expected: one documentation-only commit. `.remember/now.md` remains ignored and is
  not staged.

## Plan self-review

- Spec coverage:
  - Optional `miko.lib.cssScope`: Task 1.
  - Host-container selector rewriting and keyframe boundary: Task 2 and Task 3.
  - Existing default PostCSS isolation plus explicit plugin compatibility: Task 3.
  - Empty scope/string-path failures: Task 1.
  - Consumer usage and non-goals: Task 4.
- Placeholder scan: no unfinished marker, implied validation, or unspecified test assertion remains.
- Type consistency:
  - The public field is consistently named `cssScope`.
  - `validateLibCssScope()` is defined in Task 1 and consumed in Task 3.
  - `createLibCssScopePlugin()` is defined in Task 2 and consumed in Task 3.
