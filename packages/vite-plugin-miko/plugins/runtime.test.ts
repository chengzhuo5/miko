import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createRuntimeModule } from './runtime';

describe('createRuntimeModule', () => {
  it('generates one Pinia install, client restore, and SSR serialization path', () => {
    const code = createRuntimeModule({ pinia: true });

    expect(code).toContain("import { createPinia } from 'pinia'");
    expect(code.match(/createPinia\(\)/g)).toHaveLength(1);
    expect(code).toContain('app.use(pinia)');
    expect(code).toContain('pinia.state.value = initialState.pinia');
    expect(code).toContain('initialState.pinia = pinia.state.value');
    expect(code.indexOf('pinia.state.value = initialState.pinia')).toBeLessThan(
      code.indexOf('return {'),
    );
  });

  it('generates a zero-cost no-op when Pinia is disabled', () => {
    const code = createRuntimeModule({ pinia: false });

    expect(code).not.toContain("from 'pinia'");
    expect(code).toContain('afterBootstrap() {}');
  });

  it('wires runtime setup around the project bootstrap', async () => {
    const source = await readFile(new URL('../template/main.ts', import.meta.url), 'utf8');

    expect(source).toContain("from 'virtual:miko-runtime'");
    expect(source.indexOf('setupMikoRuntime(')).toBeLessThan(source.indexOf('await bootstrap('));
    expect(source.indexOf('await bootstrap(')).toBeLessThan(
      source.indexOf('await runtime.afterBootstrap()'),
    );
  });
});
