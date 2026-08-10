import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWhiteScreenMonitorModule } from './white-screen';

interface BootState {
  readonly status: 'pending' | 'ready' | 'failed';
  readonly errors: Array<{ code: string; detail?: string }>;
  readonly warnings: string[];
  ready(): void;
  fail(code: string, detail?: string): void;
}

function executeMonitor(
  options: {
    enabled?: boolean;
    timeout?: number;
    development?: boolean;
  } = {},
) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app" v-cloak><p>prerendered</p></div></body></html>',
    { url: 'https://example.test/' },
  );
  const source = createWhiteScreenMonitorModule({
    enabled: options.enabled ?? true,
    timeout: options.timeout ?? 8000,
    development: options.development ?? false,
  });
  const execute = new Function('window', 'document', 'setTimeout', 'clearTimeout', source);
  execute(dom.window, dom.window.document, setTimeout, clearTimeout);

  return {
    dom,
    root: dom.window.document.querySelector<HTMLElement>('#app')!,
    state: (dom.window as unknown as { __MIKO_BOOT__?: BootState }).__MIKO_BOOT__,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createWhiteScreenMonitorModule', () => {
  it('shows a safe failure panel when the application never becomes ready', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();

    expect(state?.status).toBe('pending');
    vi.advanceTimersByTime(8000);

    expect(state?.status).toBe('failed');
    expect(root.dataset.mikoFailed).toBe('MIKO_BOOT_TIMEOUT');
    expect(root.hasAttribute('v-cloak')).toBe(false);
    expect(dom.window.document.querySelector('[data-miko-failure]')?.textContent).toContain(
      'MIKO_BOOT_TIMEOUT',
    );
    expect(dom.window.document.querySelector('[data-miko-reload]')).not.toBeNull();
  });

  it('marks the root ready and ignores later startup events', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();

    state?.ready();
    vi.advanceTimersByTime(9000);
    const rejection = new dom.window.Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: new Error('late failure') });
    dom.window.dispatchEvent(rejection);

    expect(state?.status).toBe('ready');
    expect(root.dataset.mikoReady).toBe('true');
    expect(root.hasAttribute('v-cloak')).toBe(false);
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
  });

  it('classifies failed script requests as boot resource failures', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();
    const script = dom.window.document.createElement('script');
    dom.window.document.body.append(script);

    script.dispatchEvent(new dom.window.Event('error'));

    expect(state?.status).toBe('failed');
    expect(state?.errors).toEqual([{ code: 'MIKO_BOOT_RESOURCE' }]);
    expect(root.dataset.mikoFailed).toBe('MIKO_BOOT_RESOURCE');
  });

  it('records rejection details only in development', () => {
    vi.useFakeTimers();
    const production = executeMonitor();
    const productionEvent = new production.dom.window.Event('unhandledrejection');
    Object.defineProperty(productionEvent, 'reason', {
      value: new Error('token=secret https://example.test/private?key=value'),
    });
    production.dom.window.dispatchEvent(productionEvent);

    expect(production.state?.errors).toEqual([{ code: 'MIKO_BOOT_REJECTION' }]);
    expect(production.dom.window.document.body.textContent).not.toContain('secret');

    const development = executeMonitor({ development: true });
    const developmentEvent = new development.dom.window.Event('unhandledrejection');
    Object.defineProperty(developmentEvent, 'reason', { value: new Error('development detail') });
    development.dom.window.dispatchEvent(developmentEvent);

    expect(development.state?.errors[0]).toEqual({
      code: 'MIKO_BOOT_REJECTION',
      detail: 'development detail',
    });
  });

  it('reuses an existing monitor state instead of installing duplicate listeners', () => {
    vi.useFakeTimers();
    const first = executeMonitor();
    const source = createWhiteScreenMonitorModule({
      enabled: true,
      timeout: 1000,
      development: false,
    });
    const execute = new Function('window', 'document', 'setTimeout', 'clearTimeout', source);

    execute(first.dom.window, first.dom.window.document, setTimeout, clearTimeout);
    vi.advanceTimersByTime(1000);

    expect(first.state?.status).toBe('pending');
    vi.advanceTimersByTime(7000);
    expect(first.state?.status).toBe('failed');
  });
});
