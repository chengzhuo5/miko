/**
 * Playwright Test — E2E 测试共享工具
 *
 * 页面级端到端测试，使用 Playwright Test 原生 API。
 * 每个功能点独立测试 + 截图保存至 tests/e2e/screenshots/。
 *
 * 前置条件: bun dev
 * 运行: npx playwright test
 */
import type { Page, Route } from '@playwright/test'

export const BASE = 'http://127.0.0.1:5173'
export const SCREENSHOT_DIR = 'tests/e2e/screenshots'

/** 业务 API 前缀 — 需根据项目配置修改 */
export const API_PREFIX = /\/api\//

export interface ApiCall {
  url: string
  method: string
  reqBody: unknown
}

/** 导航到指定路径，等待网络空闲 + 页面稳定 */
export async function goto(page: Page, path: string) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
}

/** 全页截图 — 保存到 tests/e2e/screenshots/ */
export async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true })
}

/** 视口截图 */
export async function screenshotViewport(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` })
}

/** 安装 API 监控 — 记录所有业务 API 调用 */
export async function setupApiMonitor(page: Page, calls: ApiCall[]) {
  await page.route(API_PREFIX, async (route: Route) => {
    const req = route.request()
    calls.push({ url: req.url(), method: req.method(), reqBody: null })
    try { calls[calls.length - 1].reqBody = req.postDataJSON() } catch { /* GET */ }
    await route.continue()
  })
}
