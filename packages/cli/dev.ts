import { createServer } from 'vite';
import { createMikoViteConfig, resolveMikoProject } from '@minar-kotonoha/vite-plugin-miko';
import type { CommandContext } from './context';

export async function runDev(context: CommandContext): Promise<void> {
  const { mode, root } = context;
  const project = await resolveMikoProject({ command: 'dev', mode, root });
  const config = await createMikoViteConfig(project);
  const server = await createServer({ ...config, configFile: false, mode });
  await server.listen();
  server.printUrls();
}
