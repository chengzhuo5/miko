#!/usr/bin/env node
import { toMikoCliError } from './errors';
import { legacyCommandRunners, runCli } from './run';

const argv = process.argv.slice(2);

try {
  await runCli(argv, {
    cwd: () => process.cwd(),
    runners: legacyCommandRunners,
  });
} catch (error) {
  const cliError = toMikoCliError(error);

  console.error(`[miko:${cliError.code}] ${cliError.message}`);
  if (cliError.cause && process.env.MIKO_DEBUG === '1') console.error(cliError.cause);
  process.exitCode = cliError.exitCode;
}
