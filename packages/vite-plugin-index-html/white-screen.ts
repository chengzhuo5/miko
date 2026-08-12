export interface WhiteScreenMonitorOptions {
  enabled: boolean;
  timeout: number;
  development: boolean;
  /** 失败面板是否渲染（仅测试环境开启；生产环境只记录告警，不弹失败页） */
  showFailure: boolean;
}

export function createWhiteScreenMonitorModule(options: WhiteScreenMonitorOptions): string {
  if (!options.enabled) return '';

  return `(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.__MIKO_BOOT__) return

  const development = ${JSON.stringify(options.development)}
  const showFailure = ${JSON.stringify(options.showFailure)}
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

  // 页面是否已有可见内容（Vue 已接管渲染 / 自定义 HTML 未用 v-cloak 隐藏）。
  // 白屏保护只对"页面仍为空白"负责：已渲染的页面不是白屏，不能弹失败面板。
  const hasVisibleContent = () => {
    const root = document.getElementById('app')
    if (!root) return false
    if (root.hasAttribute('v-cloak')) return false
    return root.childElementCount > 0 || (root.textContent ?? '').trim() !== ''
  }

  const renderFailure = (code, detail) => {
    const root = document.getElementById('app')
    if (!root) return

    root.removeAttribute('v-cloak')
    root.removeAttribute('data-miko-ready')
    root.setAttribute('data-miko-failed', code)

    // 失败面板样式：证券终端"信号中断"质感 —— 暖纸底 + 墨黑细线 + 警戒红点缀。
    // 独立内联样式（监控脚本无应用依赖），兼容 chrome 64 / iOS 12（无 clamp/dvh/web font）。
    const styles = [
      '.miko-fail{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;display:flex;flex-direction:column;background:#f6f4ef;color:#191918;font-family:-apple-system,"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif;padding:28px 28px 22px;-webkit-font-smoothing:antialiased;animation:miko-fade .45s ease both}',
      '@keyframes miko-fade{from{opacity:0}to{opacity:1}}',
      '.miko-fail__top{display:flex;align-items:center;justify-content:space-between;font-size:12px;letter-spacing:.18em;opacity:.55}',
      '.miko-fail__tag{display:flex;align-items:center;gap:8px}',
      '.miko-fail__dot{width:7px;height:7px;border-radius:50%;background:#c93a2e;animation:miko-pulse 1.6s ease-in-out infinite}',
      '@keyframes miko-pulse{0%,100%{opacity:.25}50%{opacity:1}}',
      '.miko-fail__code{font-family:"SF Mono",Consolas,"Courier New",monospace;font-variant-numeric:tabular-nums;letter-spacing:.08em}',
      '.miko-fail__body{flex:1;display:flex;flex-direction:column;justify-content:center;max-width:520px}',
      '.miko-fail__rule{width:34px;height:3px;background:#c93a2e;margin-bottom:22px}',
      '.miko-fail__title{margin:0;font-size:32px;line-height:1.28;font-weight:600;letter-spacing:.01em}',
      '.miko-fail__desc{margin:12px 0 0;font-size:15px;line-height:1.7;opacity:.62}',
      '.miko-fail__detail{margin:18px 0 0;padding:10px 12px;background:#efece5;border-left:2px solid #c93a2e;font-family:"SF Mono",Consolas,"Courier New",monospace;font-size:12px;line-height:1.55;opacity:.8;word-break:break-all;white-space:pre-wrap;max-height:96px;overflow:auto}',
      '.miko-fail__bottom{display:flex;align-items:center;justify-content:space-between;gap:16px}',
      '.miko-fail__signal{display:flex;align-items:flex-end;gap:5px;height:22px}',
      '.miko-fail__signal i{width:4px;background:#191918;animation:miko-wave 1.2s ease-in-out infinite}',
      '.miko-fail__signal i:nth-child(1){height:8px}',
      '.miko-fail__signal i:nth-child(2){height:14px;animation-delay:.1s}',
      '.miko-fail__signal i:nth-child(3){height:20px;animation-delay:.2s}',
      '.miko-fail__signal i:nth-child(4){height:14px;animation-delay:.3s}',
      '.miko-fail__signal i:nth-child(5){height:8px;animation-delay:.4s}',
      '@keyframes miko-wave{0%,100%{transform:scaleY(.5);opacity:.18}50%{transform:scaleY(1);opacity:.7}}',
      '.miko-fail__btn{margin:0;padding:11px 26px;background:transparent;border:1px solid #191918;color:#191918;font-size:14px;letter-spacing:.12em;cursor:pointer;transition:background .18s ease,color .18s ease;appearance:none;-webkit-tap-highlight-color:transparent}',
      '.miko-fail__btn:hover{background:#191918;color:#f6f4ef}',
      '.miko-fail__btn:active{transform:translateY(1px)}',
      '@media (min-width:420px){.miko-fail__title{font-size:40px}}',
    ].join('')

    const styleEl = document.createElement('style')
    styleEl.textContent = styles
    styleEl.setAttribute('data-miko-fail-style', '')

    const panel = document.createElement('section')
    panel.setAttribute('data-miko-failure', '')
    panel.setAttribute('role', 'alert')
    panel.className = 'miko-fail'

    const top = document.createElement('header')
    top.className = 'miko-fail__top'
    const tag = document.createElement('span')
    tag.className = 'miko-fail__tag'
    const dot = document.createElement('span')
    dot.className = 'miko-fail__dot'
    const tagLabel = document.createElement('span')
    tagLabel.textContent = development ? 'SIGNAL LOST' : '信号中断'
    tag.append(dot, tagLabel)
    const codeLabel = document.createElement('span')
    codeLabel.className = 'miko-fail__code'
    codeLabel.textContent = code
    top.append(tag, codeLabel)

    const body = document.createElement('div')
    body.className = 'miko-fail__body'
    const rule = document.createElement('div')
    rule.className = 'miko-fail__rule'
    const title = document.createElement('h1')
    title.className = 'miko-fail__title'
    title.textContent = development ? 'The page failed to start' : '页面加载失败'
    const desc = document.createElement('p')
    desc.className = 'miko-fail__desc'
    desc.textContent = development
      ? 'Check the console and reload to continue development.'
      : '网络似乎不太稳定，行情与交易服务暂时中断。请检查网络后重新加载。'
    body.append(rule, title, desc)
    if (detail) {
      const description = document.createElement('pre')
      description.className = 'miko-fail__detail'
      description.textContent = detail
      body.append(description)
    }

    const bottom = document.createElement('footer')
    bottom.className = 'miko-fail__bottom'
    const signal = document.createElement('span')
    signal.className = 'miko-fail__signal'
    signal.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < 5; i += 1) signal.append(document.createElement('i'))
    const reload = document.createElement('button')
    reload.type = 'button'
    reload.className = 'miko-fail__btn'
    reload.setAttribute('data-miko-reload', '')
    reload.textContent = development ? 'RELOAD' : '重新加载'
    reload.addEventListener('click', () => window.location.reload())
    bottom.append(signal, reload)

    panel.append(top, body, bottom)
    root.replaceChildren(styleEl, panel)
  }

  const fail = (code, value) => {
    if (status !== 'pending') return
    const detail = detailOf(value)
    if (development || !showFailure) {
      // dev 模式：Vite error overlay 已覆盖排查；生产环境（失败页未开启）：
      // 只记录并保持 pending，不弹失败面板；应用随后 ready() 仍可正常生效。
      console.warn(
        '[miko] boot issue (' + (development ? 'dev' : 'suppressed') + '):',
        code,
        detail ?? '',
      )
      errors.push(detail ? { code, detail } : { code })
      return
    }
    if (hasVisibleContent()) {
      // 页面已有可见内容：不是白屏，不能判定启动失败。启动噪音/单资源失败
      // 只记录告警并保持 pending，应用随后 ready() 仍可正常生效——
      // 避免"页面正常加载后却被失败面板覆盖"的误报。
      const warning = 'boot issue after render: ' + code
      if (!warnings.includes(warning)) {
        console.warn('[miko] boot issue ignored (page already rendered):', code, detail ?? '')
        warnings.push(warning)
      }
      errors.push(detail ? { code, detail } : { code })
      return
    }
    status = 'failed'
    errors.push(detail ? { code, detail } : { code })
    cleanup()
    renderFailure(code, detail)
  }

  const ready = () => {
    if (status === 'ready') return
    const root = document.getElementById('app')
    if (status === 'failed') {
      // 弱网/瞬时故障已渲染失败面板，但应用随后启动成功（Suspense resolve /
      // 路由就绪晚于超时）：撤销面板恢复页面；错误记录保留供诊断。
      status = 'ready'
      if (root) {
        root.removeAttribute('v-cloak')
        root.removeAttribute('data-miko-failed')
        root.setAttribute('data-miko-ready', 'true')
      }
      document
        .querySelectorAll('.miko-fail, [data-miko-fail-style]')
        .forEach((element) => element.remove())
      return
    }
    status = 'ready'
    cleanup()
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
  // 启动预算：以应用入口脚本执行完成为起点计 timeout —— 弱网下 JS 下载耗时不计入，
  // 避免"页面仍在正常加载却被判定超时"。入口缺失/永不执行时退化为立即计时（原行为）。
  const startTimer = (ms) => {
    clearTimeout(timer)
    timer = setTimeout(() => fail('MIKO_BOOT_TIMEOUT'), ms)
  }
  const entryScript = document.querySelector('script[type="module"][src]')
  if (entryScript) {
    // 入口存在时：初始计时只作下载宽限（页面在 bundle 到达前必然是空白），
    // 入口脚本执行完成（下载+模块图执行结束）后再按 timeout 计启动预算。
    entryScript.addEventListener(
      'load',
      () => {
        if (status !== 'pending') return
        startTimer(${JSON.stringify(options.timeout)})
      },
      { once: true },
    )
    startTimer(Math.max(${JSON.stringify(options.timeout)}, 30000))
  } else {
    // 无 module 入口（legacy 纯脚本等）：维持原行为，直接按 timeout 计时。
    startTimer(${JSON.stringify(options.timeout)})
  }
})()`;
}
