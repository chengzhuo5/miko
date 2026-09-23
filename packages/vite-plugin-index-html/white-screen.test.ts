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

// 防闪现窗口：与 white-screen.ts 内置的 REVEAL_DELAY 保持一致
const REVEAL_DELAY = 1000;
// 非超时失败信号确认窗口：与 white-screen.ts 内置的 CONFIRM_DELAY 保持一致
const CONFIRM_DELAY = 2000;

function executeMonitor(
  options: {
    enabled?: boolean;
    timeout?: number;
    development?: boolean;
    showFailure?: boolean;
    vCloak?: boolean;
    entryScript?: boolean;
  } = {},
) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="app" ${options.vCloak === false ? '' : 'v-cloak'}><p>prerendered</p></div>${options.entryScript ? '<script type="module" src="https://example.test/assets/app.js"></script>' : ''}</body></html>`,
    { url: 'https://example.test/' },
  );
  const source = createWhiteScreenMonitorModule({
    enabled: options.enabled ?? true,
    timeout: options.timeout ?? 8000,
    development: options.development ?? false,
    showFailure: options.showFailure ?? true,
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

    // 防闪现：面板先隐藏挂载，v-cloak 暂不解除（骨架延续）
    const panel = dom.window.document.querySelector<HTMLElement>('[data-miko-failure]')!;
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('miko-fail--pending')).toBe(true);
    expect(root.hasAttribute('v-cloak')).toBe(true);

    // 持续失败超过防闪现窗口：解除 v-cloak 并显示面板
    vi.advanceTimersByTime(REVEAL_DELAY);
    expect(panel.classList.contains('miko-fail--pending')).toBe(false);
    expect(root.hasAttribute('v-cloak')).toBe(false);
    expect(panel.textContent).toContain('MIKO_BOOT_TIMEOUT');
    expect(dom.window.document.querySelector('[data-miko-reload]')).not.toBeNull();
  });

  it('renders the signal-loss panel with title, signal bars, and reload button', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();

    vi.advanceTimersByTime(8000 + REVEAL_DELAY);

    const panel = dom.window.document.querySelector<HTMLElement>('[data-miko-failure]')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.miko-fail__title')?.textContent).toContain('页面加载失败');
    expect(panel.querySelectorAll('.miko-fail__signal i')).toHaveLength(5);
    expect(panel.querySelector('.miko-fail__code')?.textContent).toBe('MIKO_BOOT_TIMEOUT');
    expect(dom.window.document.querySelector('head style[data-miko-fail-style]')).not.toBeNull();
    expect(panel.textContent).toContain('重新加载');
    expect(state?.errors).toEqual([{ code: 'MIKO_BOOT_TIMEOUT' }]);

    // 覆盖层：不清空 #app，SSG/预渲染内容保持原状，面板挂在 #app 之外
    expect(root.querySelector('p')?.textContent).toBe('prerendered');
    expect(root.querySelector('[data-miko-failure]')).toBeNull();
    expect(panel.parentElement).not.toBe(root);
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

  it('never reveals the failure panel when the app becomes ready within the anti-flash delay', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();

    // 超时触发：面板隐藏挂载（用户看到的仍是骨架/空白，无失败页）
    vi.advanceTimersByTime(8000);
    expect(state?.status).toBe('failed');
    const panel = dom.window.document.querySelector<HTMLElement>('[data-miko-failure]')!;
    expect(panel.classList.contains('miko-fail--pending')).toBe(true);

    // 应用在防闪现窗口内启动成功：面板在可见前被撤销，之后也不再出现
    vi.advanceTimersByTime(500);
    state?.ready();

    expect(state?.status).toBe('ready');
    expect(root.dataset.mikoReady).toBe('true');
    expect(root.dataset.mikoFailed).toBeUndefined();
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(dom.window.document.querySelector('[data-miko-fail-style]')).toBeNull();

    vi.advanceTimersByTime(REVEAL_DELAY + 5000);
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
  });

  it('recovers from a revealed failure panel when the app becomes ready later', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();

    vi.advanceTimersByTime(8000);
    expect(state?.status).toBe('failed');

    // 持续失败超过防闪现窗口：面板真正显示
    vi.advanceTimersByTime(REVEAL_DELAY);
    const panel = dom.window.document.querySelector<HTMLElement>('[data-miko-failure]')!;
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('miko-fail--pending')).toBe(false);

    // 应用随后启动成功：撤销面板，恢复页面
    state?.ready();

    expect(state?.status).toBe('ready');
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(dom.window.document.querySelector('[data-miko-fail-style]')).toBeNull();
    expect(root.dataset.mikoReady).toBe('true');
    expect(root.dataset.mikoFailed).toBeUndefined();
  });

  it('classifies failed script requests as boot resource failures after the confirm window', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();
    const script = dom.window.document.createElement('script');
    dom.window.document.body.append(script);

    script.dispatchEvent(new dom.window.Event('error'));

    // 非超时信号先进入确认窗口，不立即判死
    expect(state?.status).toBe('pending');
    expect(state?.warnings.some((warning) => warning.includes('confirming'))).toBe(true);

    vi.advanceTimersByTime(CONFIRM_DELAY);
    expect(state?.status).toBe('failed');
    expect(state?.errors).toEqual([{ code: 'MIKO_BOOT_RESOURCE' }]);
    expect(root.dataset.mikoFailed).toBe('MIKO_BOOT_RESOURCE');
  });

  it('cancels deferred resource failures when the app becomes ready within the confirm window', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();
    const script = dom.window.document.createElement('script');
    script.src = 'https://example.test/assets/app-abc123.js';
    dom.window.document.body.append(script);

    script.dispatchEvent(new dom.window.Event('error'));
    vi.advanceTimersByTime(CONFIRM_DELAY - 1);
    expect(state?.status).toBe('pending');

    // 应用在确认窗口内启动成功：失败信号作废，面板永不出现
    state?.ready();
    vi.advanceTimersByTime(CONFIRM_DELAY + REVEAL_DELAY + 5000);

    expect(state?.status).toBe('ready');
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(root.dataset.mikoFailed).toBeUndefined();
  });

  it('never fails the boot on link resource errors (favicon, stylesheets)', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();
    const link = dom.window.document.createElement('link');
    link.href = '/favicon.ico';
    dom.window.document.body.append(link);

    link.dispatchEvent(new dom.window.Event('error'));
    vi.advanceTimersByTime(7999);

    expect(state?.status).toBe('pending');
    expect(state?.errors).toEqual([]);
    expect(state?.warnings.some((warning) => warning.includes('/favicon.ico'))).toBe(true);
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(root.dataset.mikoFailed).toBeUndefined();

    state?.ready();
    expect(state?.status).toBe('ready');
  });

  it('ignores the vite legacy modern-browser probe error', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor();
    const event = new dom.window.Event('error');
    Object.defineProperty(event, 'error', {
      value: new Error('import.meta.resolve not supported'),
    });

    dom.window.dispatchEvent(event);
    vi.advanceTimersByTime(7999);

    expect(state?.status).toBe('pending');
    expect(state?.errors).toEqual([]);
    expect(state?.warnings.some((warning) => warning.includes('legacy browser probe'))).toBe(true);
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(root.dataset.mikoFailed).toBeUndefined();

    state?.ready();
    expect(state?.status).toBe('ready');
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
    vi.advanceTimersByTime(CONFIRM_DELAY);

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
      showFailure: true,
    });
    const execute = new Function('window', 'document', 'setTimeout', 'clearTimeout', source);

    execute(first.dom.window, first.dom.window.document, setTimeout, clearTimeout);
    vi.advanceTimersByTime(1000);

    expect(first.state?.status).toBe('pending');
    vi.advanceTimersByTime(7000);
    expect(first.state?.status).toBe('failed');
  });

  it('restarts the boot timeout when the application entry script executes', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor({ entryScript: true });
    const entry = dom.window.document.querySelector('script[type="module"][src]')!;

    // 入口脚本执行前：下载阶段不计入启动预算
    vi.advanceTimersByTime(7999);
    expect(state?.status).toBe('pending');

    // 入口执行完成：从此刻起重新获得完整预算
    entry.dispatchEvent(new dom.window.Event('load'));
    vi.advanceTimersByTime(7999);
    expect(state?.status).toBe('pending');

    vi.advanceTimersByTime(1);
    expect(state?.status).toBe('failed');
    expect(root.dataset.mikoFailed).toBe('MIKO_BOOT_TIMEOUT');
  });

  it('does not time out while the entry script is still downloading', () => {
    vi.useFakeTimers();
    const { dom, state } = executeMonitor({ entryScript: true });
    const entry = dom.window.document.querySelector('script[type="module"][src]')!;

    // 弱网下载超过 timeout 默认值：宽限计时未到期，不判失败
    vi.advanceTimersByTime(25000);
    expect(state?.status).toBe('pending');

    // 入口最终执行完成：从此起算完整 timeout
    entry.dispatchEvent(new dom.window.Event('load'));
    vi.advanceTimersByTime(7999);
    expect(state?.status).toBe('pending');
    vi.advanceTimersByTime(1);
    expect(state?.status).toBe('failed');
  });

  it('does not fail the boot when the page already rendered', () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { dom, root, state } = executeMonitor({ vCloak: false });

    // 页面已渲染（无 v-cloak 且有内容）：超时不弹面板、不置 failed，ready 仍生效
    vi.advanceTimersByTime(20000);

    expect(state?.status).toBe('pending');
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(root.dataset.mikoFailed).toBeUndefined();
    expect(state?.errors).toEqual([{ code: 'MIKO_BOOT_TIMEOUT' }]);

    state?.ready();
    expect(state?.status).toBe('ready');
    expect(root.dataset.mikoReady).toBe('true');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('ignores same-origin resource errors once the page rendered', () => {
    vi.useFakeTimers();
    const { dom, root, state } = executeMonitor({ vCloak: false });
    const script = dom.window.document.createElement('script');
    script.src = 'https://example.test/assets/app-abc123.js';
    dom.window.document.body.append(script);

    script.dispatchEvent(new dom.window.Event('error'));

    expect(state?.status).toBe('pending');
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(state?.warnings.some((warning) => warning.includes('MIKO_BOOT_RESOURCE'))).toBe(true);

    state?.ready();
    expect(state?.status).toBe('ready');
    expect(root.dataset.mikoReady).toBe('true');
  });

  it('does not render the failure panel when the failure page is disabled (production)', () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { dom, root, state } = executeMonitor({ showFailure: false });

    // 生产环境（失败页未开启）：超时只记录告警，不弹面板、不置 failed
    vi.advanceTimersByTime(20000);

    expect(state?.status).toBe('pending');
    expect(dom.window.document.querySelector('[data-miko-failure]')).toBeNull();
    expect(root.dataset.mikoFailed).toBeUndefined();
    expect(state?.errors).toEqual([{ code: 'MIKO_BOOT_TIMEOUT' }]);
    expect(warnSpy).toHaveBeenCalled();

    // 应用随后正常 ready
    state?.ready();
    expect(state?.status).toBe('ready');
    expect(root.dataset.mikoReady).toBe('true');
    warnSpy.mockRestore();
  });
});
