import parser from 'yargs-parser';
import { MikoCliError } from './errors';
import { normalizeEnvArg } from './env';

export type ImplementedCommand = 'dev' | 'build' | 'preview';

export interface CliOptions {
  command: ImplementedCommand;
  rootArg?: string;
  modeArg?: string;
  lib: boolean;
}

const COMMANDS = new Set<ImplementedCommand>(['dev', 'build', 'preview']);

export function parseCliArgs(argv: string[]): CliOptions {
  const parsed = parser(argv, {
    boolean: ['lib'],
    string: ['root', 'env', 'mode'],
    alias: { h: 'help' },
  });
  const command = String(parsed._[0] ?? '');

  if (!COMMANDS.has(command as ImplementedCommand)) {
    throw new MikoCliError('MIKO_CLI_COMMAND', `未知命令: ${command || '(空)'}`, 2);
  }

  let modeArg: string | undefined;
  try {
    modeArg = normalizeEnvArg(parsed.env ?? parsed.mode);
  } catch (error) {
    throw new MikoCliError('MIKO_CLI_ENV', (error as Error)?.message ?? String(error), 2, error);
  }

  return {
    command: command as ImplementedCommand,
    rootArg: parsed.root,
    modeArg,
    lib: parsed.lib === true,
  };
}
