import { preview } from 'vite';
import { resolveMikoProject } from '@minar-kotonoha/vite-plugin-miko';
import type { CommandContext } from './context';
import { createPreviewConfig } from './preview-config';

export async function runPreview(context: CommandContext): Promise<void> {
  const { mode, root } = context;
  const project = await resolveMikoProject({ command: 'preview', mode, root });
  const config = await createPreviewConfig(project);
  const server = await preview(config);

  server.printUrls();
}
