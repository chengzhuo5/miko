import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createRuntimeModule } from './runtime';

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
    expect(code).toBe('export function setupMikoRuntime() {}');
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
