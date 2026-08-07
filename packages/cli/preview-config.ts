import { createMikoViteConfig } from '@minar-kotonoha/vite-plugin-miko';
import type { ResolvedMikoConfig } from '@minar-kotonoha/vite-plugin-miko';
import type { InlineConfig, ProxyOptions } from 'vite';

type ProxyConfig = Record<string, string | ProxyOptions>;

function cloneProxyConfig(proxy: ProxyConfig | undefined): ProxyConfig | undefined {
  if (!proxy) return undefined;

  return Object.fromEntries(
    Object.entries(proxy).map(([context, rule]) => [
      context,
      typeof rule === 'string' ? rule : { ...rule },
    ]),
  );
}

export async function createPreviewConfig(project: ResolvedMikoConfig): Promise<InlineConfig> {
  const config = await createMikoViteConfig(project);
  const proxy = config.preview?.proxy ?? config.server?.proxy;

  return {
    ...config,
    configFile: false,
    mode: project.env.mode,
    root: project.outDir,
    preview: {
      ...config.preview,
      proxy: cloneProxyConfig(proxy),
    },
  };
}
