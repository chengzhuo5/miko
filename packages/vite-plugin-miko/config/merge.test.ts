import { describe, expect, it } from 'vitest'
import { MikoConfigError } from './errors'
import { mergeViteConfig } from './merge'

describe('mergeViteConfig', () => {
  it('deep-merges ordinary objects', () => {
    const result = mergeViteConfig(
      { build: { outDir: 'dist', sourcemap: false } },
      { build: { sourcemap: true } },
    )

    expect(result.build).toMatchObject({ outDir: 'dist', sourcemap: true })
  })

  it('merges aliases by find with user precedence', () => {
    const result = mergeViteConfig(
      { resolve: { alias: [{ find: '@', replacement: '/default' }] } },
      {
        resolve: {
          alias: {
            '@': '/user',
            '~': '/shared',
          },
        },
      },
    )

    expect(result.resolve?.alias).toEqual([
      { find: '@', replacement: '/user' },
      { find: '~', replacement: '/shared' },
    ])
  })

  it('places user aliases before overlapping defaults without duplicate finds', () => {
    const result = mergeViteConfig(
      {
        resolve: {
          alias: [
            { find: '@', replacement: '/default' },
            { find: '~', replacement: '/shared-default' },
          ],
        },
      },
      {
        resolve: {
          alias: [
            { find: '@/feature', replacement: '/feature' },
            { find: '@', replacement: '/user' },
          ],
        },
      },
    )

    expect(result.resolve?.alias).toEqual([
      { find: '@/feature', replacement: '/feature' },
      { find: '@', replacement: '/user' },
      { find: '~', replacement: '/shared-default' },
    ])
  })

  it('keeps string and RegExp aliases distinct while overriding equal finds', () => {
    const matcher = /^@/
    const literal = '/^@/'
    const result = mergeViteConfig(
      {
        resolve: {
          alias: [
            { find: matcher, replacement: '/default' },
            { find: literal, replacement: '/literal' },
          ],
        },
      },
      {
        resolve: {
          alias: [{ find: /^@/, replacement: '/user' }],
        },
      },
    )

    expect(result.resolve?.alias).toEqual([
      { find: /^@/, replacement: '/user' },
      { find: literal, replacement: '/literal' },
    ])
  })

  it('flattens nested plugin options and removes disabled entries', () => {
    const basePlugin = { name: 'base' }
    const userPlugin = { name: 'user' }
    const result = mergeViteConfig(
      { plugins: [[basePlugin, false], null] },
      { plugins: [undefined, [userPlugin]] },
    )

    expect(result.plugins).toEqual([basePlugin, userPlugin])
  })

  it('deduplicates include and exclude lists', () => {
    const result = mergeViteConfig(
      { optimizeDeps: { include: ['vue'], exclude: ['vant'] } },
      { optimizeDeps: { include: ['vue', 'pinia'], exclude: ['vant'] } },
    )

    expect(result.optimizeDeps?.include).toEqual(['vue', 'pinia'])
    expect(result.optimizeDeps?.exclude).toEqual(['vant'])
  })

  it('rejects an optimizeDeps include/exclude conflict', () => {
    const merge = () =>
      mergeViteConfig(
        { optimizeDeps: { include: ['vue'] } },
        { optimizeDeps: { exclude: ['vue'] } },
      )

    expect(merge).toThrow(MikoConfigError)
    expect(merge).toThrow(/optimizeDeps.*vue/)

    let thrown: unknown
    try {
      merge()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(MikoConfigError)
    expect(thrown).toMatchObject({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.optimizeDeps',
    })
  })
})
