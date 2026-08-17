import { describe, expect, it } from 'vitest';
import type { ResolvedMikoConfig } from './config/types';
import { createLibConfig } from './index';

const scope = '[data-miko-lib="quote-kit"]';

interface CssParent {
  name?: string;
  parent?: CssParent;
  type?: string;
}

interface CssRule {
  parent?: CssParent;
  selector: string;
}

interface CssScopePlugin {
  postcssPlugin: string;
  Rule(rule: CssRule): void;
}

function project(): ResolvedMikoConfig {
  return {
    viteRoot: 'D:/library',
    outDir: 'D:/library/dist',
    vite: {},
    miko: {
      lib: { cssScope: scope },
      vuePluginOptions: {},
      vueJsxPluginOptions: {},
      unoCSSPluginOptions: false,
    },
  } as ResolvedMikoConfig;
}

function cssScopePlugin(): CssScopePlugin | undefined {
  const postcss = createLibConfig({ config: project() }).css?.postcss;
  if (!postcss || typeof postcss === 'string') return undefined;
  return postcss.plugins?.find(
    (plugin): plugin is CssScopePlugin =>
      typeof plugin === 'object' &&
      plugin !== null &&
      'postcssPlugin' in plugin &&
      plugin.postcssPlugin === 'miko:lib-css-scope',
  );
}

function transform(selector: string, parent?: CssParent): string {
  const plugin = cssScopePlugin();
  expect(plugin).toBeDefined();
  if (!plugin) return selector;

  const rule = { selector, parent };
  plugin.Rule(rule);
  return rule.selector;
}

describe('Library Mode CSS scope plugin', () => {
  it('adds a scope plugin when miko.lib.cssScope is configured', () => {
    expect(cssScopePlugin()).toMatchObject({ postcssPlugin: 'miko:lib-css-scope' });
  });

  it('prefixes ordinary and application root selectors', () => {
    expect(transform('.button, .card > .title')).toBe(`${scope} .button, ${scope} .card > .title`);
    expect(transform(':root, html .button, body .card, #app > .panel')).toBe(
      `${scope}, ${scope} .button, ${scope} .card, ${scope} > .panel`,
    );
    expect(transform(`${scope} .button`)).toBe(`${scope} .button`);
  });

  it('leaves keyframe frame selectors untouched', () => {
    const keyframes = { type: 'atrule', name: 'keyframes' } as const;
    expect(transform('from, 50%, to', keyframes)).toBe('from, 50%, to');
  });

  it('keeps commas inside functional and attribute selectors', () => {
    expect(transform(':is(.first, .second), [data-label="a,b"]')).toBe(
      `${scope} :is(.first, .second), ${scope} [data-label="a,b"]`,
    );
  });
});
