import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Miko App template', () => {
  it('does not wrap every SPA route in ClientOnly', async () => {
    const source = await readFile(new URL('./App.vue', import.meta.url), 'utf8');

    expect(source).not.toContain('isSpaMode');
    expect(source).not.toContain('useClientOnly');
    expect(source).toContain('route.meta.clientOnly === true');
  });

  it('injects the framework CDN only when an explicit URL is defined', async () => {
    const source = await readFile(new URL('./App.vue', import.meta.url), 'utf8');

    expect(source).toContain('const frameworkCDN = import.meta.env.VITE_FRAMEWORK_CDN');
    expect(source).toContain('...(frameworkCDN');
    expect(source).not.toContain('cdn.jsdelivr.net/npm/@minar-kotonoha/framework');
    expect(source).not.toContain('VITE_LIB_VERSION');
  });

  it('signals readiness through the shared runtime protocol', async () => {
    const source = await readFile(new URL('./App.vue', import.meta.url), 'utf8');

    expect(source).toContain("import { markMikoReady } from 'virtual:miko-runtime'");
    expect(source).toContain('markMikoReady()');
    expect(source).not.toContain("document.getElementById('app')!.removeAttribute('v-cloak')");
  });
});
