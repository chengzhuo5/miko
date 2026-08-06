import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizePath } from 'vite';
import type { PluginOption } from 'vite';
import { createMikoEntryTags } from './html';

const virtualModuleId = 'virtual:index';
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

export interface IndexHTMLOptions {
  entry: string;
  root: string;
  template: string;
}

export async function indexHTMLPlugin(options: IndexHTMLOptions) {
  const htmlPath = normalizePath(resolve(options.root, 'index.html'));
  const fallbackHtml = await readFile(resolve(options.template, 'index.html'), 'utf8');
  const hasUserHtml = () => existsSync(htmlPath);
  const isHtmlId = (id: string) => normalizePath(id.split('?', 1)[0]) === htmlPath;

  const pluginName = '@minar-kotonoha/vite-plugin-index-html';

  return [
    {
      name: pluginName,
      enforce: 'pre',

      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (hasUserHtml()) return next();
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          if (!req.headers.accept?.includes('text/html')) return next();

          const url = req.url?.split('?')[0] || '/';
          try {
            const transformed = await server.transformIndexHtml(url, fallbackHtml, req.originalUrl);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(req.method === 'HEAD' ? undefined : transformed);
          } catch (error) {
            next(error as Error);
          }
        });
      },

      resolveId(id) {
        if (!hasUserHtml() && isHtmlId(id)) return htmlPath;
        if (id === virtualModuleId) return resolvedVirtualModuleId;
      },

      load(id) {
        if (!hasUserHtml() && isHtmlId(id)) return fallbackHtml;
        if (id === resolvedVirtualModuleId) {
          return `import ${JSON.stringify(normalizePath(options.entry))}`;
        }
      },
    },
    {
      name: `${pluginName}:entry`,
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return createMikoEntryTags(html);
        },
      },
    },
  ] satisfies PluginOption;
}
