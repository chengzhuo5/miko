import type { Plugin } from 'vite';
import type { ResolvedMikoConfig } from '../config/types';

const virtualId = 'virtual:miko-runtime';
const resolvedId = `\0${virtualId}`;

export interface RuntimeModuleOptions {
  pinia: boolean;
}

export function createRuntimeModule(options: RuntimeModuleOptions): string {
  if (!options.pinia) {
    return 'export function setupMikoRuntime() {}';
  }

  return [
    "import { createPinia } from 'pinia'",
    '',
    'export function setupMikoRuntime(app, initialState, onSSRAppRendered) {',
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
    '}',
  ].join('\n');
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
