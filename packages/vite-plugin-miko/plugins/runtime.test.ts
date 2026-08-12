import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeModule } from './runtime';

interface BootState {
  status: 'pending' | 'ready' | 'failed';
  errors: Array<{ code: string; detail?: string }>;
  warnings: string[];
  ready: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
}

function executeRuntime(code: string) {
  const executable = code.replaceAll('export function ', 'function ');
  return new Function(
    `${executable}; return { setupMikoRuntime, markMikoReady }`,
  )() as {
    setupMikoRuntime(app: { config: Record<string, unknown> }): void;
    markMikoReady(): void;
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('createRuntimeModule', () => {
  it('generates one Pinia install, client restore, and non-empty SSR serialization path', () => {
    const code = createRuntimeModule({ pinia: true });

    expect(code).toContain("import { createPinia } from 'pinia'");
    expect(code.match(/createPinia\(\)/g)).toHaveLength(1);
    expect(code).toContain('app.use(pinia)');
    expect(code).toContain('pinia.state.value = initialState.pinia');
    expect(code).toContain('onSSRAppRendered(() => {');
    expect(code).toContain('const piniaState = pinia.state.value');
    expect(code).toContain('Object.keys(piniaState).length > 0');
    expect(code).toContain('initialState.pinia = piniaState');
    expect(code).toContain('delete initialState.pinia');
    expect(code).not.toContain('afterBootstrap');
    expect(code).toContain('} else if (initialState?.pinia) {');
  });

  it('generates a zero-cost no-op when Pinia is disabled', () => {
    const code = createRuntimeModule({ pinia: false });

    expect(code).not.toContain("from 'pinia'");
    expect(code).toContain('export function setupMikoRuntime(app,');
    expect(code).toContain('attachMikoBootHandlers(app)');
    expect(code).toContain('export function markMikoReady()');
  });

  it('reports only pre-ready Vue failures and preserves existing handlers', () => {
    const boot: BootState = {
      status: 'pending',
      errors: [],
      warnings: [],
      ready: vi.fn(),
      fail: vi.fn(),
    };
    Object.assign(globalThis, { window: { __MIKO_BOOT__: boot } });
    const previousErrorHandler = vi.fn();
    const previousWarnHandler = vi.fn();
    const app = {
      config: {
        errorHandler: previousErrorHandler,
        warnHandler: previousWarnHandler,
      },
      mixin: vi.fn(),
    };
    const runtime = executeRuntime(createRuntimeModule({ pinia: false }));

    runtime.setupMikoRuntime(app);
    (app.config.errorHandler as (...args: unknown[]) => void)(
      new Error('startup failed'),
      null,
      'setup',
    );
    (app.config.warnHandler as (...args: unknown[]) => void)(
      'Hydration node mismatch',
      null,
      '',
    );

    expect(boot.fail).toHaveBeenCalledWith('MIKO_BOOT_VUE', 'startup failed');
    expect(boot.warnings).toEqual(['Hydration node mismatch']);
    expect(previousErrorHandler).toHaveBeenCalledOnce();
    expect(previousWarnHandler).toHaveBeenCalledOnce();

    boot.status = 'ready';
    (app.config.errorHandler as (...args: unknown[]) => void)(new Error('business error'));
    (app.config.warnHandler as (...args: unknown[]) => void)('Hydration mismatch after ready');

    expect(boot.fail).toHaveBeenCalledOnce();
    expect(boot.warnings).toEqual(['Hydration node mismatch']);
  });

  it('delegates the successful first render to the monitor', () => {
    const boot: BootState = {
      status: 'pending',
      errors: [],
      warnings: [],
      ready: vi.fn(),
      fail: vi.fn(),
    };
    Object.assign(globalThis, { window: { __MIKO_BOOT__: boot } });
    const runtime = executeRuntime(createRuntimeModule({ pinia: false }));

    runtime.markMikoReady();

    expect(boot.ready).toHaveBeenCalledOnce();
  });

  it('auto-marks ready after the first router navigation without explicit calls', async () => {
    const boot: BootState = {
      status: 'pending',
      errors: [],
      warnings: [],
      ready: vi.fn(),
      fail: vi.fn(),
    };
    Object.assign(globalThis, { window: { __MIKO_BOOT__: boot } });
    let resolveReady!: () => void;
    const router = {
      isReady: vi.fn(() => new Promise<void>((resolve) => (resolveReady = resolve))),
    };
    const mixins: Array<{ mounted?: () => void }> = [];
    const app = {
      config: {
        globalProperties: { $router: undefined },
      },
      mixin: (options: { mounted?: () => void }) => mixins.push(options),
    };
    const runtime = executeRuntime(createRuntimeModule({ pinia: false }));

    runtime.setupMikoRuntime(app as never);
    expect(boot.ready).not.toHaveBeenCalled();

    // 首个组件挂载时从实例拿到 $router，等待首次导航完成
    mixins[0]!.mounted?.call({ $router: router });
    resolveReady();
    await Promise.resolve();

    expect(boot.ready).toHaveBeenCalledOnce();
  });

  it('skips auto-ready when the app has no router', () => {
    const boot: BootState = {
      status: 'pending',
      errors: [],
      warnings: [],
      ready: vi.fn(),
      fail: vi.fn(),
    };
    Object.assign(globalThis, { window: { __MIKO_BOOT__: boot } });
    const mixins: Array<{ mounted?: () => void }> = [];
    const runtime = executeRuntime(createRuntimeModule({ pinia: false }));

    runtime.setupMikoRuntime({
      config: {},
      mixin: (options: { mounted?: () => void }) => mixins.push(options),
    } as never);
    mixins[0]!.mounted?.call({});

    expect(boot.ready).not.toHaveBeenCalled();
  });

  it('registers the SSR-rendered lifecycle before project bootstrap', async () => {
    const source = await readFile(new URL('../template/main.ts', import.meta.url), 'utf8');

    expect(source).toContain("from 'virtual:miko-runtime'");
    expect(source).toContain('onSSRAppRendered');
    expect(source).toContain('setupMikoRuntime(app, initialState, onSSRAppRendered)');
    expect(source.indexOf('setupMikoRuntime(')).toBeLessThan(source.indexOf('await bootstrap('));
    expect(source).not.toContain('afterBootstrap');
  });
});
