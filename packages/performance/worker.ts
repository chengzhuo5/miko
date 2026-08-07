import { runCli, legacyCommandRunners } from '../cli/run.ts';
import { fileURLToPath } from 'node:url';

const root = process.env.MIKO_PERF_ROOT;
if (!root) throw new Error('MIKO_PERF_ROOT is required');

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
await runCli(['build', '--root', root], {
  cwd: () => workspaceRoot,
  runners: legacyCommandRunners,
});

const maxRss = process.resourceUsage().maxRSS;
process.stdout.write(
  `${JSON.stringify({
    marker: 'MIKO_PERF_RESULT',
    peakRssBytes: maxRss * (process.platform === 'darwin' ? 1 : 1024),
    workerRuntime: process.execPath,
  })}\n`,
);
