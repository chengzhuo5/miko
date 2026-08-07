import parser from 'yargs-parser';
import { MikoCliError } from './errors';
import { normalizeEnvArg } from './env';

export type ImplementedCommand = 'dev' | 'build' | 'preview';

export interface CliOptions {
  command?: ImplementedCommand;
  rootArg?: string;
  modeArg?: string;
  lib: boolean;
  help?: boolean;
}

const COMMANDS = new Set<ImplementedCommand>(['dev', 'build', 'preview']);
const PARSED_KEYS = new Set(['_', 'env', 'h', 'help', 'lib', 'mode', 'root']);

function invalidArgs(message: string): never {
  throw new MikoCliError('MIKO_CLI_ARGS', message, 2);
}

function readRootArg(value: unknown): string | undefined {
  if (Array.isArray(value)) invalidArgs('--root 只能指定一次');
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) invalidArgs('--root 需要一个目录参数');
  return value;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const parsed = parser(argv, {
    boolean: ['help', 'lib'],
    string: ['root', 'env', 'mode'],
    alias: { h: 'help' },
    configuration: {
      'camel-case-expansion': false,
      'duplicate-arguments-array': true,
      'greedy-arrays': false,
    },
  });
  const unknownOption = Object.keys(parsed).find((key) => !PARSED_KEYS.has(key));
  if (unknownOption) invalidArgs(`未知选项: --${unknownOption}`);
  if (parsed._.length > 1) invalidArgs(`多余参数: ${parsed._.slice(1).join(' ')}`);

  const command = parsed._[0] === undefined ? undefined : String(parsed._[0]);
  const help = parsed.help === true || parsed.h === true;

  if (command !== undefined && !COMMANDS.has(command as ImplementedCommand)) {
    throw new MikoCliError('MIKO_CLI_COMMAND', `未知命令: ${command || '(空)'}`, 2);
  }
  if (command === undefined && !help) {
    throw new MikoCliError('MIKO_CLI_COMMAND', '未知命令: (空)', 2);
  }

  let modeArg: string | undefined;
  try {
    modeArg = normalizeEnvArg(parsed.env ?? parsed.mode);
  } catch (error) {
    throw new MikoCliError('MIKO_CLI_ENV', (error as Error)?.message ?? String(error), 2, error);
  }

  return {
    command: command as ImplementedCommand | undefined,
    rootArg: readRootArg(parsed.root),
    modeArg,
    lib: parsed.lib === true,
    help,
  };
}
