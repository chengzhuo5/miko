import { parseCliArgs, type ImplementedCommand } from './args';
import { createCommandContext, type CommandContext } from './context';
import { loadEnvFiles } from './env';

export interface CommandRunners {
  dev(context: CommandContext): Promise<void>;
  build(context: CommandContext): Promise<void>;
  preview(context: CommandContext): Promise<void>;
}

export interface RunCliDependencies {
  cwd: () => string;
  runners: CommandRunners;
}

type CommandLoader = () => Promise<unknown>;

const commandLoaders = {
  build: () => import('./build.ts'),
  dev: () => import('./dev.ts'),
  preview: () => import('./preview.ts'),
} satisfies Record<ImplementedCommand, CommandLoader>;

function restoreEnv(name: 'MIKO_MODE' | 'MIKO_LIB_MODE', value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

export async function runWithLegacyEnvironment(
  context: CommandContext,
  loader: CommandLoader,
): Promise<void> {
  const previousCwd = process.cwd();
  const previousMode = process.env.MIKO_MODE;
  const previousLibMode = process.env.MIKO_LIB_MODE;

  try {
    process.chdir(context.root);
    loadEnvFiles(context.mode);
    process.env.MIKO_MODE = context.mode;
    if (context.lib) process.env.MIKO_LIB_MODE = '1';
    else delete process.env.MIKO_LIB_MODE;
    await loader();
  } finally {
    restoreEnv('MIKO_MODE', previousMode);
    restoreEnv('MIKO_LIB_MODE', previousLibMode);
    process.chdir(previousCwd);
  }
}

async function runLegacyCommand(context: CommandContext): Promise<void> {
  await runWithLegacyEnvironment(context, commandLoaders[context.command]);
}

export const legacyCommandRunners: CommandRunners = {
  build: runLegacyCommand,
  dev: runLegacyCommand,
  preview: runLegacyCommand,
};

export async function runCli(argv: string[], dependencies: RunCliDependencies): Promise<void> {
  const options = parseCliArgs(argv);
  const context = createCommandContext(options, dependencies.cwd());
  await dependencies.runners[context.command](context);
}
