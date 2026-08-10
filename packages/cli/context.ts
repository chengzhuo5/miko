import { resolve } from 'node:path';
import type { MikoConfigEnv } from '@minar-kotonoha/vite-plugin-miko';
import type { CliOptions } from './args';

export interface CommandContext extends Omit<MikoConfigEnv, 'command'> {
  command: Exclude<CliOptions['command'], undefined>;
  allRoutes: boolean;
  lib: boolean;
  json: boolean;
  write?: boolean;
  checkAfterWrite?: boolean;
  modeArg?: string;
}

export function createCommandContext(options: CliOptions, cwd: string): CommandContext {
  if (!options.command) throw new TypeError('CLI help does not create a command context');

  return {
    command: options.command,
    allRoutes: options.allRoutes,
    root: resolve(cwd, options.rootArg ?? '.'),
    mode: options.modeArg ?? (options.command === 'dev' ? 'development' : 'production'),
    modeArg: options.modeArg,
    lib: options.lib,
    json: options.json,
    write: options.write ?? false,
    checkAfterWrite: options.checkAfterWrite ?? false,
  };
}
