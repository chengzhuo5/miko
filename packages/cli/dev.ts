import { createServer } from 'vite';
import { createMikoViteConfig, resolveMikoProject } from '@minar-kotonoha/vite-plugin-miko';
import { cwd } from 'node:process';
import { resolveMode } from './env.ts';

const mode = resolveMode(process.env.MIKO_MODE, 'serve');
const project = await resolveMikoProject({ command: 'dev', mode, root: cwd() });
const config = await createMikoViteConfig(project);
const server = await createServer({ ...config, configFile: false, mode });
await server.listen();
server.printUrls();
