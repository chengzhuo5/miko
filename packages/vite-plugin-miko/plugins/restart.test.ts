import { describe, expect, it, vi } from 'vitest';
import type { Plugin, ViteDevServer } from 'vite';
import { capabilityRestartPlugin } from './restart';

type WatchEvent = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir';

function setup(plugin: Plugin) {
  const handlers = new Map<WatchEvent, (file: string) => void>();
  const server = {
    watcher: {
      add: vi.fn<(paths: string[]) => void>(),
      on: vi.fn<(event: WatchEvent, handler: (file: string) => void) => void>(
        (event, handler) => {
          handlers.set(event, handler);
        },
      ),
    },
    restart: vi.fn<() => Promise<void>>(async () => {}),
    config: {
      logger: {
        error: vi.fn<(message: string) => void>(),
      },
    },
  } as unknown as ViteDevServer;
  const configureServer = plugin.configureServer;
  if (typeof configureServer !== 'function') throw new Error('configureServer hook missing');
  configureServer(server);

  return {
    handlers,
    server,
    emit(event: WatchEvent, file: string) {
      handlers.get(event)?.(file);
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('capabilityRestartPlugin', () => {
  it('watches files and directories that affect the capability graph', () => {
    const files = [
      'D:/project/package.json',
      'D:/project/miko.config.ts',
      'D:/project/.browserslistrc',
      'D:/project/uno.config.ts',
    ];
    const directories = ['D:/project/schemas'];
    const { server } = setup(capabilityRestartPlugin(files, directories));

    expect(server.watcher.add).toHaveBeenCalledWith([...files, ...directories]);
  });

  it.each(['change', 'add', 'unlink'] as const)(
    'coalesces repeated watched-file %s events into one restart',
    async event => {
      const { emit, server } = setup(
        capabilityRestartPlugin(['D:/project/miko.config.ts'], []),
      );

      emit(event, 'D:\\project\\miko.config.ts');
      emit(event, 'D:/project/miko.config.ts');
      await flushMicrotasks();

      expect(server.restart).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['change', 'add', 'unlink'] as const)(
    'restarts for a %s inside a watched convention directory',
    async event => {
      const { emit, server } = setup(
        capabilityRestartPlugin([], ['D:/project/schemas']),
      );

      emit(event, 'D:/project/schemas/health/status.json');
      await flushMicrotasks();

      expect(server.restart).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores ordinary page and component source changes', async () => {
    const { emit, server } = setup(
      capabilityRestartPlugin(
        ['D:/project/package.json'],
        ['D:/project/schemas'],
      ),
    );

    emit('change', 'D:/project/pages/index.vue');
    emit('add', 'D:/project/components/NewCard.vue');
    await flushMicrotasks();

    expect(server.restart).not.toHaveBeenCalled();
  });
});
