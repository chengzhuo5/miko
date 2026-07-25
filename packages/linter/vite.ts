import oxlintPlugin from 'vite-plugin-oxlint';
// @ts-expect-error 'vite-plugin-eslint'的导出定义有问题
import eslintPlugin from 'vite-plugin-eslint';
import { fileURLToPath } from 'node:url';
import type { PluginOption } from 'vite';

export default [
  {
    ...oxlintPlugin({
      configFile: fileURLToPath(new URL('.oxlintrc.json', import.meta.url)),
    }),
    apply() {
      return process.env.VITE_SSG !== 'true';
    },
  },
  {
    ...eslintPlugin({
      overrideConfigFile: fileURLToPath(new URL('eslint.config.ts', import.meta.url)),
    }),
    apply() {
      return process.env.VITE_SSG !== 'true';
    },
  },
] satisfies PluginOption[];
