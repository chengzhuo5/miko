import parser from 'yargs-parser';
import { MikoCliError } from './errors';
import { normalizeEnvArg } from './env';

export type ImplementedCommand = 'dev' | 'build' | 'check' | 'preview' | 'doctor';

export interface CliOptions {
  command?: ImplementedCommand;
  rootArg?: string;
  modeArg?: string;
  allRoutes: boolean;
  lib: boolean;
  json: boolean;
  help?: boolean;
}

const COMMANDS = new Set<ImplementedCommand>(['dev', 'build', 'check', 'preview', 'doctor']);
const PARSED_KEYS = new Set([
  '_',
  'all-routes',
  'env',
  'h',
  'help',
  'json',
  'lib',
  'mode',
  'root',
]);

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
    boolean: ['all-routes', 'help', 'json', 'lib'],
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
  if (parsed.json === true && command !== 'doctor') invalidArgs('--json 仅适用于 doctor 命令');
  if (parsed['all-routes'] === true && command !== 'check') {
    invalidArgs('--all-routes 仅适用于 check 命令');
  }
  if (parsed.lib === true && command !== 'build') invalidArgs('--lib 仅适用于 build 命令');

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
    allRoutes: parsed['all-routes'] === true,
    lib: parsed.lib === true,
    json: parsed.json === true,
    help,
  };
}
