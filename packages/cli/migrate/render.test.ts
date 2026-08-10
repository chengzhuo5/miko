import { describe, expect, it } from 'vitest';
import { renderMigrationSource } from './render';

describe('renderMigrationSource', () => {
  it('renders known Miko and Vite keys in documented public order', () => {
    expect(
      renderMigrationSource({
        miko: {
          vuePluginOptions: { reactivityTransform: false },
          uiLibrary: 'vant',
          rendering: 'spa',
        },
        vite: {
          server: { port: 5173 },
          base: '/legacy/',
          define: { __APP_NAME__: 'legacy' },
        },
      }),
    ).toBe(`import type { MikoUserConfig } from '@minar-kotonoha/vite-plugin-miko'

export default {
  miko: {
    rendering: 'spa',
    uiLibrary: 'vant',
    vuePluginOptions: {
      reactivityTransform: false,
    },
  },
  vite: {
    base: '/legacy/',
    server: {
      port: 5173,
    },
    define: {
      __APP_NAME__: 'legacy',
    },
  },
} satisfies MikoUserConfig
`);
  });

  it('omits empty namespaces and quotes unsafe property names', () => {
    expect(
      renderMigrationSource({
        miko: {},
        vite: {
          define: {
            'process.env.LEGACY': true,
          },
        },
      }),
    ).toContain(`'process.env.LEGACY': true`);
    expect(renderMigrationSource({ miko: {}, vite: {} })).toBeNull();
  });
});
