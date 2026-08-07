import { resolve } from 'node:path';
import type { MikoConfigEnv } from '@minar-kotonoha/vite-plugin-miko';
import type { CliOptions } from './args';

export interface CommandContext extends Omit<MikoConfigEnv, 'command'> {
  command: CliOptions['command'];
  lib: boolean;
}

export function createCommandContext(options: CliOptions, cwd: string): CommandContext {
  return {
    command: options.command,
    root: resolve(cwd, options.rootArg ?? '.'),
    mode: options.modeArg ?? (options.command === 'dev' ? 'development' : 'production'),
    lib: options.lib,
  };
}
