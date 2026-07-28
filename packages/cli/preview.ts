import { preview } from 'vite';
import { loadMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import { resolve } from 'node:path';

const raw = await loadMikoConfig();
const { defineMikoConfig } = await import('@minar-kotonoha/vite-plugin-miko');

const miko = await defineMikoConfig();
const config = miko({ command: 'build', mode: 'production', isPreview: true, isSsrBuild: false });
const server = await preview({ configFile: false, ...config, root: resolve(process.cwd(), 'dist') });

// 预览模式代理 — 读取 miko.config.ts proxy 配置，用 Node.js 原生 http/https 转发
if (raw.proxy?.length) {
  const http = await import('node:http');
  const https = await import('node:https');

  for (const rule of raw.proxy) {
    const context = Array.isArray(rule.context) ? rule.context : [rule.context as string];
    const target = rule.target as string;
    const changeOrigin = rule.changeOrigin !== false;

    server.middlewares.use((req, res, next) => {
      const url = req.url || '';
      const match = context.some((c: string) => {
        const pattern = c.replace(/\*\*/g, '<<STARSTAR>>').replace(/\*/g, '[^/]*').replace(/<<STARSTAR>>/g, '.*');
        return new RegExp('^' + pattern).test(url);
      });
      if (!match) { next(); return; }

      const opts = new URL(target);
      const transport = opts.protocol === 'https:' ? https : http;
      const headers: Record<string, string | string[] | undefined> = { ...req.headers };
      if (changeOrigin) {
        headers.host = opts.host;
        const ip = req.socket.remoteAddress;
        if (ip) { headers['x-forwarded-for'] = ip; headers['x-real-ip'] = ip; }
      }

      const proxyReq = transport.request({
        hostname: opts.hostname,
        port: opts.port || (opts.protocol === 'https:' ? 443 : 80),
        path: url,
        method: req.method,
        headers,
        rejectUnauthorized: false,
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => next());
      req.pipe(proxyReq);
    });
  }
  console.log('[miko] preview 已启用代理规则，转发目标：', raw.proxy.map((r: { target: string }) => r.target).join(', '));
}

server.printUrls();
