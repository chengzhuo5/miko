import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizePath } from 'vite';
import type { PluginOption } from 'vite';
import {
  createMikoEntryTags,
  createMikoMonitorTags,
  rewriteMikoEntrySource,
} from './html';
import {
  createWhiteScreenMonitorModule,
  type WhiteScreenMonitorOptions,
} from './white-screen';

const virtualModuleId = 'virtual:index';
const resolvedVirtualModuleId = `\0${virtualModuleId}`;
const devVirtualModuleUrl = `/@id/__x00__${virtualModuleId}`;
const devMonitorUrl = '/@miko/white-screen.js';
const monitorAssetPlaceholder = '__MIKO_WHITE_SCREEN_ASSET__';

export interface IndexHTMLOptions {
  entry: string;
  root: string;
  template: string;
  whiteScreen?: WhiteScreenMonitorOptions;
}

export async function indexHTMLPlugin(options: IndexHTMLOptions) {
  const htmlPath = normalizePath(resolve(options.root, 'index.html'));
  const fallbackHtml = await readFile(resolve(options.template, 'index.html'), 'utf8');
  const hasUserHtml = () => existsSync(htmlPath);
  const isHtmlId = (id: string) => normalizePath(id.split('?', 1)[0]) === htmlPath;
  let base = '/';
  let monitorReferenceId: string | undefined;

  const pluginName = '@minar-kotonoha/vite-plugin-index-html';

  return [
    {
      name: pluginName,
      enforce: 'pre',

      configResolved(config) {
        base = config.base;
      },

      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (
            !options.whiteScreen?.enabled ||
            req.url?.split('?', 1)[0] !== devMonitorUrl ||
            (req.method !== 'GET' && req.method !== 'HEAD')
          ) {
            return next();
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.end(
            req.method === 'HEAD'
              ? undefined
              : createWhiteScreenMonitorModule(options.whiteScreen),
          );
        });
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

      async buildStart() {
        if (!options.whiteScreen?.enabled) return;
        const html = hasUserHtml() ? await readFile(htmlPath, 'utf8') : fallbackHtml;
        if (createMikoMonitorTags(html, monitorAssetPlaceholder).length === 0) return;
        monitorReferenceId = this.emitFile({
          type: 'asset',
          name: 'miko-white-screen.js',
          source: createWhiteScreenMonitorModule(options.whiteScreen),
        });
      },

      generateBundle: {
        order: 'post',
        handler(_outputOptions, bundle) {
          if (!monitorReferenceId) return;
          const fileName = this.getFileName(monitorReferenceId);
          const assetUrl = `${base.endsWith('/') ? base : `${base}/`}${fileName}`;
          for (const output of Object.values(bundle)) {
            if (output.type !== 'asset' || !output.fileName.endsWith('.html')) continue;
            const source =
              typeof output.source === 'string'
                ? output.source
                : new TextDecoder().decode(output.source);
            output.source = source.replaceAll(monitorAssetPlaceholder, assetUrl);
          }
        }
      },
    },
    {
      name: `${pluginName}:entry`,
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          const entrySource = context.server ? devVirtualModuleUrl : virtualModuleId;
          const monitorSource = context.server ? devMonitorUrl : monitorAssetPlaceholder;
          const entryTags = createMikoEntryTags(html, entrySource);
          const monitorTags = options.whiteScreen?.enabled
            ? createMikoMonitorTags(html, monitorSource)
            : [];
          const rewrittenHtml = rewriteMikoEntrySource(html, entrySource);
          return {
            html: rewrittenHtml,
            tags: [...monitorTags, ...(rewrittenHtml === html ? entryTags : [])],
          };
        },
      },
    },
  ] satisfies PluginOption;
}
