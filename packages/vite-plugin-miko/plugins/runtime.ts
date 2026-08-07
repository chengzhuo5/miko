import type { Plugin } from 'vite';

const virtualId = 'virtual:miko-runtime';
const resolvedId = `\0${virtualId}`;

export function runtimePlugin(): Plugin {
  return {
    name: 'miko:runtime',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      return ['export function setupMikoRuntime() {', '  return { afterBootstrap() {} }', '}'].join(
        '\n',
      );
    },
  };
}
