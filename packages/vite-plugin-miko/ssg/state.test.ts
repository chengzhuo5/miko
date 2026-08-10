import { describe, expect, it, vi } from 'vitest';
import { composeSsgPageRendered, stripEmptyInitialState } from './state';

const emptyStateScript = '<script>window.__INITIAL_STATE__="{}"</script>';

describe('SSG state output', () => {
  it('removes only the exact empty ViteSSG state script', () => {
    expect(stripEmptyInitialState(emptyStateScript)).toBe('');
    expect(stripEmptyInitialState(`<main>ready</main>${emptyStateScript}`)).toBe(
      '<main>ready</main>',
    );
    expect(
      stripEmptyInitialState(
        '<script>window.__INITIAL_STATE__="{\\"pinia\\":{\\"cart\\":{\\"count\\":1}}}"</script>',
      ),
    ).toContain('count');
    expect(stripEmptyInitialState('<script>window.__INITIAL_STATE__ = "{}"</script>')).toContain(
      '__INITIAL_STATE__',
    );
  });

  it('runs the user page hook before stripping empty state', () => {
    const userHook = vi.fn<(route: string, html: string) => string>((_route, html) =>
      html.replace('before-hook', 'after-hook'),
    );
    const onPageRendered = composeSsgPageRendered(userHook);

    expect(onPageRendered('/page', `before-hook${emptyStateScript}`)).toBe('after-hook');
    expect(userHook).toHaveBeenCalledWith('/page', `before-hook${emptyStateScript}`);
  });
});
