import type { Plugin } from 'vite';
import type { ResolvedMikoConfig } from '../config/types';

const virtualId = 'virtual:miko-runtime';
const resolvedId = `\0${virtualId}`;

export interface RuntimeModuleOptions {
  pinia: boolean;
}

export function createRuntimeModule(options: RuntimeModuleOptions): string {
  const lines = [
    ...(options.pinia ? ["import { createPinia } from 'pinia'", ''] : []),
    'function getMikoBoot() {',
    "  return typeof window === 'undefined' ? undefined : window.__MIKO_BOOT__",
    '}',
    '',
    'function getPendingMikoBoot() {',
    '  const boot = getMikoBoot()',
    "  return boot?.status === 'pending' ? boot : undefined",
    '}',
    '',
    'function errorMessage(error) {',
    "  return error instanceof Error ? error.message : String(error)",
    '}',
    '',
    'function attachMikoBootHandlers(app) {',
    '  const previousErrorHandler = app.config.errorHandler',
    '  const previousWarnHandler = app.config.warnHandler',
    '  app.config.errorHandler = (error, instance, info) => {',
    "    getPendingMikoBoot()?.fail('MIKO_BOOT_VUE', errorMessage(error))",
    '    previousErrorHandler?.(error, instance, info)',
    '  }',
    '  app.config.warnHandler = (message, instance, trace) => {',
    "    if (/hydration|mismatch/i.test(message)) getPendingMikoBoot()?.warnings.push(message)",
    '    previousWarnHandler?.(message, instance, trace)',
    '  }',
    '}',
    '',
    'export function markMikoReady() {',
    '  getMikoBoot()?.ready()',
    '}',
    '',
    'export function setupMikoRuntime(app, initialState, onSSRAppRendered) {',
    '  attachMikoBootHandlers(app)',
    '  // 自动 ready：首个组件挂载后等待首次路由导航完成（无需业务显式调用 markMikoReady）。',
    '  // vite-ssg 在 setup 回调之后才 app.use(router)，此处通过生命周期 mixin 拿到 $router；',
    '  // mounted 仅在客户端执行，SSR 无 window 时 getMikoBoot 返回 undefined 即 no-op。',
    '  app.mixin({',
    '    mounted() {',
    '      if (getPendingMikoBoot()) {',
    "        const router = this.$router",
    "        if (router && typeof router.isReady === 'function') {",
    '          router',
    '            .isReady()',
    "            .then(() => getMikoBoot()?.ready())",
    '            .catch(() => {})',
    '        }',
    '      }',
    '    }',
    '  })',
    ...(options.pinia
      ? [
    '  const pinia = createPinia()',
    '  app.use(pinia)',
    '  if (import.meta.env.SSR) {',
    '    onSSRAppRendered(() => {',
    '      if (!initialState) return',
    '      const piniaState = pinia.state.value',
    '      if (Object.keys(piniaState).length > 0) initialState.pinia = piniaState',
    '      else delete initialState.pinia',
    '    })',
    '  } else if (initialState?.pinia) {',
    '    pinia.state.value = initialState.pinia',
    '  }',
        ]
      : []),
    '}',
  ];

  return lines.join('\n');
}

export function runtimePlugin(project: ResolvedMikoConfig): Plugin {
  return {
    name: 'miko:runtime',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      return createRuntimeModule({ pinia: project.miko.pinia });
    },
  };
}
