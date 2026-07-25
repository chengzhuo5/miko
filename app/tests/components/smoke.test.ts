/**
 * E2E 冒烟测试 — 示例
 *
 * 使用 Vitest Browser Mode + Playwright Provider 验证应用核心页面可访问。
 * 开发服务器必须已启动: bun dev
 *
 * 运行: bun test:e2e
 *
 * 注意: Vitest 4.x BrowserPage 类型尚不完整覆盖 Playwright API，
 * page 对象在运行时实际为 Playwright Page（使用 playwright provider 时），
 * 此处使用 any 绕过类型检查期限制。
 */
import { describe, it, expect } from 'vitest'
import { page } from '@vitest/browser/context'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pg: any = page

const BASE = 'http://localhost:5173'

describe('应用冒烟测试', () => {
  it('首页可访问', async () => {
    await pg.goto(BASE)
    await pg.waitForLoadState('networkidle')

    const title = await pg.title()
    expect(title).toBeTruthy()

    const app = pg.locator('#app')
    await expect(app).toBeVisible()
  })

  it('无 JS 运行时错误', async () => {
    const errors: string[] = []
    pg.on('pageerror', (err: Error) => errors.push(err.message))

    await pg.goto(BASE)
    await pg.waitForLoadState('networkidle')
    await pg.waitForTimeout(2000)

    const realErrors = errors.filter(
      (e: string) => !e.includes('ResizeObserver') && !e.includes('Hydration'),
    )
    expect(realErrors).toEqual([])
  })
})
