import type { CSSOptions } from 'vite';

type PostCSSPlugin = NonNullable<
  Exclude<NonNullable<CSSOptions['postcss']>, string>['plugins']
>[number];

interface CssParent {
  name?: string;
  parent?: CssParent;
  type?: string;
}

interface CssRule {
  parent?: CssParent;
  selector: string;
}

const ROOT_SELECTOR = /^(?::root|:host|html|body|#app)(?=$|[\s>+~.:#[])/iu;

function splitSelectorList(selector: string): string[] {
  const selectors: string[] = [];
  let current = '';
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (const character of selector) {
    if (quote) {
      current += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;

    if (character === ',' && depth === 0) {
      selectors.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  selectors.push(current);
  return selectors;
}

function isInsideKeyframes(rule: CssRule): boolean {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'atrule' && /(?:^|-)keyframes$/iu.test(parent.name ?? '')) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function isAlreadyScoped(selector: string, scope: string): boolean {
  if (selector === scope) return true;
  const suffix = selector.slice(scope.length, scope.length + 1);
  return (
    selector.startsWith(scope) &&
    (suffix === ' ' ||
      suffix === '>' ||
      suffix === '+' ||
      suffix === '~' ||
      suffix === ':' ||
      suffix === '.' ||
      suffix === '#' ||
      suffix === '[')
  );
}

function scopeSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed || isAlreadyScoped(trimmed, scope)) return trimmed;
  if (ROOT_SELECTOR.test(trimmed)) return `${scope}${trimmed.replace(ROOT_SELECTOR, '')}`.trim();
  return `${scope} ${trimmed}`;
}

export function createLibCssScopePlugin(scope: string): PostCSSPlugin {
  return {
    postcssPlugin: 'miko:lib-css-scope',
    Rule(rule: CssRule) {
      if (isInsideKeyframes(rule)) return;
      const selectors = splitSelectorList(rule.selector)
        .map((selector) => scopeSelector(selector, scope))
        .filter(Boolean);
      rule.selector = [...new Set(selectors)].join(', ');
    },
  } as PostCSSPlugin;
}
