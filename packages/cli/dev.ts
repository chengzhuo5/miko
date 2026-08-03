import { createServer } from 'vite';
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import { resolveMode } from './env.ts';

const miko = await defineMikoConfig();
const mode = resolveMode(process.env.MIKO_MODE, 'serve');
const config = miko({ command: 'serve', mode, isPreview: false, isSsrBuild: false });
const server = await createServer({ configFile: false, mode, ...config });
await server.listen();
server.printUrls();
