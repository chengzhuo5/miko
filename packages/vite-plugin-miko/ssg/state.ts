import type { SSGConfig } from '../types';

const emptyInitialStateScript = '<script>window.__INITIAL_STATE__="{}"</script>';

type PageRenderedHook = NonNullable<SSGConfig['onPageRendered']>;

export function stripEmptyInitialState(renderedHTML: string): string {
  return renderedHTML.replace(emptyInitialStateScript, '');
}

export function composeSsgPageRendered(userHook?: PageRenderedHook): PageRenderedHook {
  return (route, renderedHTML) =>
    stripEmptyInitialState(userHook?.(route, renderedHTML) ?? renderedHTML);
}
