/**
 * E2E 冒烟测试 — Playwright Test
 *
 * 功能点:
 *   F01 首页可访问
 *   F02 无 JS 运行时错误
 *
 * 运行: npx playwright test
 * 前置: bun dev
 */
import { test, expect } from '@playwright/test'
import { goto, screenshot, setupApiMonitor, type ApiCall } from './helpers'

const calls: ApiCall[] = []

test.describe('冒烟测试', () => {
  test.beforeEach(async ({ page }) => {
    setupApiMonitor(page, calls)
  })

  test('F01: 首页可访问', async ({ page }) => {
    await goto(page, '/')
    await expect(page.locator('#app')).toBeVisible()
    await screenshot(page, 'smoke-f01-homepage')
  })

  test('F02: 无 JS 运行时错误', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await goto(page, '/')
    await page.waitForTimeout(1000)
    const realErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Hydration'),
    )
    expect(realErrors).toEqual([])
  })
})
