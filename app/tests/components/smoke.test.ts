/**
 * 冒烟测试 — Vitest Browser Mode
 *
 * 在真实 Chromium 浏览器中渲染 Vue 组件并断言 DOM。
 *
 * 运行: bun test:e2e:browser
 */
import { describe, it, expect } from 'vitest'
import { page } from 'vitest/browser'

describe('冒烟测试', () => {
  it('可写入 DOM 并断言', async () => {
    document.body.innerHTML = '<div id="app"><h1>Miko</h1></div>'
    await expect.element(page.getByText('Miko')).toBeInTheDocument()
  })

  it('可渲染 Vue 组件', async () => {
    const { createApp, h } = await import('vue')
    document.body.innerHTML = '<div id="app"></div>'
    createApp({
      setup() { return () => h('span', { class: 'title' }, 'Hello Miko') },
    }).mount('#app')
    await expect.element(page.getByText('Hello Miko')).toBeInTheDocument()
  })
})
