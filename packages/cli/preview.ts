import { preview } from 'vite';
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import { resolve } from 'node:path';

const miko = await defineMikoConfig();
const config = miko({ command: 'build', mode: 'production', isPreview: true, isSsrBuild: false });
const server = await preview({ configFile: false, ...config, root: resolve(process.cwd(), 'dist') });
server.printUrls();
