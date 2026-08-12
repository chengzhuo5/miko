export interface WhiteScreenMonitorOptions {
  enabled: boolean;
  timeout: number;
  development: boolean;
}

export function createWhiteScreenMonitorModule(options: WhiteScreenMonitorOptions): string {
  if (!options.enabled) return '';

  return `(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.__MIKO_BOOT__) return

  const development = ${JSON.stringify(options.development)}
  let status = 'pending'
  let timer
  const errors = []
  const warnings = []

  const detailOf = (value) => {
    if (!development) return undefined
    const detail =
      value instanceof Error
        ? value.message
        : typeof value === 'string'
          ? value
          : 'Unknown startup error'
    return detail.slice(0, 1000)
  }

  const cleanup = () => {
    clearTimeout(timer)
    window.removeEventListener('error', onError, true)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }

  const renderFailure = (code, detail) => {
    const root = document.getElementById('app')
    if (!root) return

    root.removeAttribute('v-cloak')
    root.removeAttribute('data-miko-ready')
    root.setAttribute('data-miko-failed', code)

    const panel = document.createElement('section')
    panel.setAttribute('data-miko-failure', '')
    panel.setAttribute('role', 'alert')

    const title = document.createElement('h1')
    title.textContent = development ? 'Miko application failed to start' : '应用启动失败'

    const message = document.createElement('p')
    message.textContent = code

    panel.append(title, message)
    if (detail) {
      const description = document.createElement('pre')
      description.textContent = detail
      panel.append(description)
    }

    const reload = document.createElement('button')
    reload.type = 'button'
    reload.setAttribute('data-miko-reload', '')
    reload.textContent = '重新加载'
    reload.addEventListener('click', () => window.location.reload())
    panel.append(reload)
    root.replaceChildren(panel)
  }

  const fail = (code, value) => {
    if (status !== 'pending') return
    const detail = detailOf(value)
    if (development) {
      // dev 模式不渲染失败面板（Vite error overlay 已覆盖排查），只记录并保持 pending，
      // 避免业务异步噪音导致面板闪现；应用随后 ready() 仍可正常生效。
      console.warn('[miko] boot issue (dev):', code, detail ?? '')
      errors.push(detail ? { code, detail } : { code })
      return
    }
    status = 'failed'
    errors.push(detail ? { code, detail } : { code })
    cleanup()
    renderFailure(code, detail)
  }

  const ready = () => {
    if (status !== 'pending') return
    status = 'ready'
    cleanup()
    const root = document.getElementById('app')
    if (!root) return
    root.removeAttribute('v-cloak')
    root.removeAttribute('data-miko-failed')
    root.setAttribute('data-miko-ready', 'true')
  }

  function onError(event) {
    const target = event.target
    if (
      target &&
      target !== window &&
      (target.tagName === 'SCRIPT' || target.tagName === 'LINK')
    ) {
      const url = target.src || target.href || ''
      // 跨域外链资源（native bridge SDK 等）失败不代表应用启动失败，
      // 只记录 warning；同源/相对路径的应用资源失败才判定致命。
      const isHttpUrl = url.startsWith('https://') || url.startsWith('http://')
      if (isHttpUrl && !url.startsWith(window.location.origin)) {
        warnings.push('cross-origin resource failed to load: ' + url)
        return
      }
      fail('MIKO_BOOT_RESOURCE')
      return
    }
    fail('MIKO_BOOT_ERROR', event.error ?? event.message)
  }

  function onUnhandledRejection(event) {
    // 未捕获的 Promise 拒绝多为业务异步噪音（接口失败、第三方时序），
    // 不判定启动失败，仅记录 warning；真正启动失败由同步错误/资源/超时兜底。
    const reason = event.reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'unknown reason'
    warnings.push('unhandled rejection: ' + message)
  }

  window.__MIKO_BOOT__ = {
    get status() {
      return status
    },
    errors,
    warnings,
    ready,
    fail,
  }

  window.addEventListener('error', onError, true)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  timer = setTimeout(() => fail('MIKO_BOOT_TIMEOUT'), ${JSON.stringify(options.timeout)})
})()`;
}
