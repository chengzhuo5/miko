import { createServer } from 'vite';
import { defineMikoConfig } from '@minar-kotonoha/vite-plugin-miko';

const miko = await defineMikoConfig();
const config = miko({ command: 'serve', mode: 'development', isPreview: false, isSsrBuild: false });
const server = await createServer({ configFile: false, ...config });
await server.listen();
server.printUrls();
