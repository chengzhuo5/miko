/**
 * Vitest 浏览器模式配置 — 组件测试（应用级）
 *
 * 在真实 Chromium 浏览器中测试 Vue 组件。
 * 与根目录 vitest.browser.config.ts 独立——项目可按需覆盖。
 *
 * 关键配置:
 *   optimizeDeps.noDiscovery — 避免 monorepo 依赖预优化冲突
 *
 * 用法:
 *   bun test:e2e:browser       # 运行组件浏览器测试
 */
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [{ find: '@', replacement: process.cwd() }],
  },
  // Windows 上 localhost → ::1 (IPv6)，Chromium headless shell 仅 IPv4 可达
  server: { host: '127.0.0.1' },
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: { args: ['--no-sandbox'] },
      }),
      instances: [{
        browser: 'chromium',
        headless: true,
      }],
    },
    include: ['tests/components/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
  optimizeDeps: { noDiscovery: true },
})
