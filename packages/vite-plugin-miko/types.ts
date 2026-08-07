/**
 * # @minar-kotonoha/vite-plugin-miko 类型定义
 *
 * `MikoUserConfig` 为 `miko.config.ts` 的完整配置类型。
 * 配置分为 `miko`（框架能力）和 `vite`（Vite 原生配置）两个命名空间。
 *
 * 插件子类型直接引用底层插件的 Options 类型，保证类型始终准确。
 */

import type { Options as VueOptions } from '@vitejs/plugin-vue';
import type { Options as VueJsxOptions } from '@vitejs/plugin-vue-jsx';
import type { Options as LegacyOptions } from '@vitejs/plugin-legacy';
import type { UserOptions as LayoutsUserOptions } from 'vite-plugin-vue-layouts-next';
import type { VitePluginConfig as UnoCSSVitePluginConfig } from '@unocss/vite';
import type { VitePluginVueDevToolsOptions as DevToolsOptions } from 'vite-plugin-vue-devtools';

export type MikoUserConfig = import('./config/types').MikoConfig;

export type {
  VueOptions,
  VueJsxOptions,
  LegacyOptions,
  LayoutsUserOptions,
  UnoCSSVitePluginConfig,
  DevToolsOptions,
};

/** 开发服务器代理规则（旧项目迁移辅助；新配置优先使用 `vite.server.proxy`） */
export interface ProxyConfig {
  /** 要代理的路径模式，如 `['/api/**']` */
  context: string[];
  /** 代理目标地址 */
  target: string;
  /** 是否修改请求头 origin */
  changeOrigin?: boolean;
  /** 代理日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /** 自定义代理事件 */
  configure?: (proxy: unknown) => void;
}

export interface LibConfig {
  /** 库入口文件 */
  entry?: string;
  /** 输出格式 */
  formats?: ('es' | 'cjs' | 'umd')[];
  /** 全局变量名（UMD 模式） */
  name?: string;
  /** 输出文件名 */
  fileName?: string;
}

export interface VueRouterOptions {
  /**
   * 路由文件扩展名
   * @default ['.vue', '.setup.tsx']
   */
  extensions?: string[];
  /**
   * 页面文件目录（文件系统路由扫描根目录）
   * @default '<root>/pages'
   */
  routesFolder?: string;
  /**
   * 路由类型声明输出路径
   * @default '<root>/types/routes.d.ts'
   */
  dts?: string;
}

export interface ComponentsOptions {
  /**
   * 组件文件目录
   * @default ['<root>/components']
   */
  dirs?: string | string[];
  /**
   * 组件文件扩展名
   * @default ['vue', 'tsx', 'ts']
   */
  extensions?: string[];
  /**
   * 类型声明输出路径，false 表示不生成
   * @default '<root>/types/components.d.ts'
   */
  dts?: string | boolean;
  /** 额外自定义 resolvers（会替换 uiLibrary 的默认 resolver） */
  resolvers?: unknown[];
}

export interface SSGConfig {
  /** Beasties 配置（控制资源内联与压缩） */
  beastiesOptions?: {
    /** 是否外部化资源，默认 false */
    external?: boolean;
    /** 压缩配置 */
    compress?: boolean | Record<string, unknown>;
    [key: string]: unknown;
  };
  /**
   * 输出目录结构
   * - `'flat'`：/about.html
   * - `'nested'`：/about/index.html
   * @default 'flat'
   */
  dirStyle?: 'flat' | 'nested';
  /**
   * HTML 格式化
   * @default 'none'
   */
  formatting?: 'none' | 'prettier';
  /** 需要被包含的路由过滤函数 */
  includedRoutes?: (paths: string[]) => string[];
  /** 页面渲染完成钩子 */
  onPageRendered?: (route: string, renderedHTML: string) => string;
  /** SSG 构建完成钩子 */
  onFinished?: () => Promise<void>;
}

export interface LinterOptions {
  /** 是否启用 Oxlint */
  oxlint?: boolean;
  /** 是否启用 ESLint */
  eslint?: boolean;
}

export interface BootstrapOptions {
  /**
   * 项目入口文件路径（相对于 root）
   * @default 'index.ts'
   */
  entryFile?: string;
}

export interface ExternalOptions {
  /** Framework CDN 地址；提供后才启用 CDN 外部化 */
  frameworkCDN?: string;
  /** 额外映射到 `framework` 全局对象的包名 */
  additionalExternals?: string[];
  /** 从 Vite dep optimizer 排除的包名 */
  optimizeDepsExclude?: string[];
  /** SSR 时强制内联打包的包名 */
  ssrNoExternal?: string[];
}

export interface DevOptions {
  /**
   * 是否启用 Rolldown 原生 bundled dev 模式
   * @default false
   */
  bundledDev?: boolean;
}

export interface JanusOptions {
  /** Janus schema 目录 */
  schemasDir?: string;
}
