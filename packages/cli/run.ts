import { parseCliArgs, type ImplementedCommand } from './args';
import { createCommandContext, type CommandContext } from './context';
import { loadEnvFiles } from './env';

export interface CommandRunners {
  dev(context: CommandContext): Promise<void>;
  build(context: CommandContext): Promise<void>;
  check(context: CommandContext): Promise<void>;
  doctor(context: CommandContext): Promise<void>;
  preview(context: CommandContext): Promise<void>;
}

export interface RunCliDependencies {
  cwd: () => string;
  output?: (message: string) => void;
  runners: CommandRunners;
}

type CommandRunner = (context: CommandContext) => Promise<void>;
type CommandLoader = () => Promise<CommandRunner>;

const commandLoaders = {
  build: async () => (await import('./build.ts')).runBuild,
  check: async () => (await import('./check.ts')).runCheck,
  dev: async () => (await import('./dev.ts')).runDev,
  doctor: async () => (await import('./doctor.ts')).runDoctor,
  preview: async () => (await import('./preview.ts')).runPreview,
} satisfies Record<ImplementedCommand, CommandLoader>;

let environmentQueue = Promise.resolve();

function restoreProcessEnv(previousEnv: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(process.env)) {
    if (!Object.hasOwn(previousEnv, name)) delete process.env[name];
  }
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function executeWithLegacyEnvironment(
  context: CommandContext,
  loader: () => Promise<unknown>,
): Promise<void> {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };

  try {
    process.chdir(context.root);
    loadEnvFiles(context.modeArg);
    process.env.MIKO_MODE = context.mode;
    if (context.lib) process.env.MIKO_LIB_MODE = '1';
    else delete process.env.MIKO_LIB_MODE;
    await loader();
  } finally {
    try {
      restoreProcessEnv(previousEnv);
    } finally {
      process.chdir(previousCwd);
    }
  }
}

export function runWithLegacyEnvironment(
  context: CommandContext,
  loader: () => Promise<unknown>,
): Promise<void> {
  const execution = environmentQueue.then(() => executeWithLegacyEnvironment(context, loader));
  environmentQueue = execution.then(
    () => undefined,
    () => undefined,
  );
  return execution;
}

async function runLegacyCommand(context: CommandContext): Promise<void> {
  const runner = await commandLoaders[context.command]();
  await runWithLegacyEnvironment(context, () => runner(context));
}

export const legacyCommandRunners: CommandRunners = {
  build: runLegacyCommand,
  check: runLegacyCommand,
  dev: runLegacyCommand,
  doctor: runLegacyCommand,
  preview: runLegacyCommand,
};

export function createCliHelp(command?: ImplementedCommand): string {
  const usage = command
    ? `miko ${command} [options]`
    : 'miko <dev|build|check|preview|doctor> [options]';
  return [
    `Usage: ${usage}`,
    '',
    'Options:',
    '  --root <dir>     项目根目录',
    '  --env <name>     加载 .env.<name> 并作为 Vite mode',
    '  --mode <name>    --env 的别名',
    '  --lib            构建库（仅 build）',
    '  --all-routes     检查全部预渲染路由（仅 check）',
    '  --json           输出 JSON（仅 doctor）',
    '  -h, --help       显示帮助',
  ].join('\n');
}

export async function runCli(argv: string[], dependencies: RunCliDependencies): Promise<void> {
  const options = parseCliArgs(argv);
  if (options.help) {
    (dependencies.output ?? console.log)(createCliHelp(options.command));
    return;
  }
  const context = createCommandContext(options, dependencies.cwd());
  await dependencies.runners[context.command](context);
}
