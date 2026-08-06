import { preview } from 'vite';
import { createMikoViteConfig, resolveMikoProject } from '@minar-kotonoha/vite-plugin-miko';
import { cwd } from 'node:process';

const mode = 'production';
const project = await resolveMikoProject({ command: 'preview', mode, root: cwd() });
const config = await createMikoViteConfig(project);
const server = await preview({
  ...config,
  configFile: false,
  mode,
  root: project.outDir,
});

server.printUrls();
