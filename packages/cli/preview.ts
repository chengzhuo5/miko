import { preview } from 'vite';
import { createMikoViteConfig, resolveMikoProject } from '@minar-kotonoha/vite-plugin-miko';
import type { CommandContext } from './context';

export async function runPreview(context: CommandContext): Promise<void> {
  const { mode, root } = context;
  const project = await resolveMikoProject({ command: 'preview', mode, root });
  const config = await createMikoViteConfig(project);
  const server = await preview({
    ...config,
    configFile: false,
    mode,
    root: project.outDir,
  });

  server.printUrls();
}
