/**
 * Playwright Test 配置 — E2E 页面测试
 *
 * TypeScript 原生端到端测试，用于验证页面导航、API 调用和 UI 渲染。
 * 开发服务器需提前启动: bun dev
 *
 * 用法:
 *   npx playwright test                    # 运行所有 E2E
 *   npx playwright test --ui               # 交互式 UI
 *   npx playwright test --headed           # 有头模式调试
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 375, height: 812 },
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
