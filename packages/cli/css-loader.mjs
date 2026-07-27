// ESM loader hook — 拦截 .css/.less/.scss 文件，避免 SSG 预渲染时 Node.js ERR_UNKNOWN_FILE_EXTENSION

const STYLE_RE = /\.(css|less|scss|sass)$/

export function resolve(specifier, context, nextResolve) {
  if (STYLE_RE.test(specifier) || STYLE_RE.test(context.parentURL ?? '')) {
    return nextResolve(specifier, context)
  }
  return nextResolve(specifier, context)
}

export function load(url, context, nextLoad) {
  if (STYLE_RE.test(url)) {
    return { format: 'module', source: '', shortCircuit: true }
  }
  return nextLoad(url, context)
}
