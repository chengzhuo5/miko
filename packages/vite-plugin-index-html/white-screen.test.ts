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

  it('renders the signal-loss panel with title, signal bars, and reload button', () => {
    vi.useFakeTimers();
    const { dom, state } = executeMonitor();

    vi.advanceTimersByTime(8000);

    const panel = dom.window.document.querySelector<HTMLElement>('[data-miko-failure]')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.miko-fail__title')?.textContent).toContain('页面加载失败');
    expect(panel.querySelectorAll('.miko-fail__signal i')).toHaveLength(5);
    expect(panel.querySelector('.miko-fail__code')?.textContent).toBe('MIKO_BOOT_TIMEOUT');
    expect(dom.window.document.querySelector('#app style')).not.toBeNull();
    expect(panel.textContent).toContain('重新加载');
    expect(state?.errors).toEqual([{ code: 'MIKO_BOOT_TIMEOUT' }]);
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

  it('ignores cross-origin resource failures (native bridge SDK) but records a warning', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();
    const script = dom.window.document.createElement('script');
    script.src = 'https://other.test/native-bridge.js';
    dom.window.document.body.append(script);

    script.dispatchEvent(new dom.window.Event('error'));
    vi.advanceTimersByTime(2000);

    expect(state?.status).toBe('pending');
    expect(state?.errors).toEqual([]);
    expect(state?.warnings.some((warning) => warning.includes('other.test'))).toBe(true);
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(root.dataset.mikoFailed).toBeUndefined();

    state?.ready();
    expect(state?.status).toBe('ready');
  });

  it('still fails on same-origin application chunk resource errors', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();
    const script = dom.window.document.createElement('script');
    script.src = 'https://example.test/assets/app-abc123.js';
    dom.window.document.body.append(script);

    script.dispatchEvent(new dom.window.Event('error'));

    expect(state?.status).toBe('failed');
    expect(root.dataset.mikoFailed).toBe('MIKO_BOOT_RESOURCE');
  });

  it('records unhandled rejections as warnings without failing the boot', () => {
    vi.useFakeTimers();
    const { dom, state } = executeMonitor();
    const event = new dom.window.Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: new Error('async noise') });
    dom.window.dispatchEvent(event);

    expect(state?.status).toBe('pending');
    expect(state?.errors).toEqual([]);
    expect(state?.warnings.some((warning) => warning.includes('async noise'))).toBe(true);
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();

    // 应用随后正常 ready，不受异步噪音影响
    state?.ready();
    expect(state?.status).toBe('ready');
  });

  it('does not render the failure panel in development while keeping pending', () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { dom, root, state } = executeMonitor({ development: true });
    const script = dom.window.document.createElement('script');
    script.src = 'https://example.test/assets/app-abc123.js';
    dom.window.document.body.append(script);

    script.dispatchEvent(new dom.window.Event('error'));
    vi.advanceTimersByTime(30000);

    expect(state?.status).toBe('pending');
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(root.dataset.mikoFailed).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    // dev 下 ready 仍然生效（应用正常启动）
    state?.ready();
    expect(state?.status).toBe('ready');
    warnSpy.mockRestore();
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
