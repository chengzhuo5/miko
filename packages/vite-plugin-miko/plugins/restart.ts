import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

const WATCH_EVENTS = ['add', 'addDir', 'change', 'unlink', 'unlinkDir'] as const;

export function capabilityRestartPlugin(
  watchedFiles: string[],
  watchedDirectories: string[],
): Plugin {
  return {
    name: 'miko:restart-on-capability-change',
    apply: 'serve',
    configureServer(server) {
      const files = new Set(watchedFiles.map(normalizePath));
      const directories = watchedDirectories.map(path =>
        normalizePath(path).replace(/\/$/u, ''),
      );
      server.watcher.add([...watchedFiles, ...watchedDirectories]);

      let pending = false;
      const scheduleRestart = (file: string) => {
        const normalized = normalizePath(file);
        const watched =
          files.has(normalized) ||
          directories.some(
            directory => normalized === directory || normalized.startsWith(`${directory}/`),
          );
        if (!watched || pending) return;

        pending = true;
        queueMicrotask(() => {
          pending = false;
          void server.restart().catch(error => {
            server.config.logger.error(`[miko] 自动重启失败: ${String(error)}`);
          });
        });
      };

      for (const event of WATCH_EVENTS) server.watcher.on(event, scheduleRestart);
    },
  };
}
