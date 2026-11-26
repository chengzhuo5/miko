import type { UserConfig } from 'vite';
import type { ResolvedCapability } from '../capabilities/types';
import type {
  BootstrapOptions,
  ComponentsOptions,
  DevOptions,
  DevToolsOptions,
  ExternalOptions,
  JanusOptions,
  LayoutsUserOptions,
  LegacyOptions,
  LibConfig,
  LinterOptions,
  SSGConfig,
  UnoCSSVitePluginConfig,
  VueJsxOptions,
  VueOptions,
  VueRouterOptions,
  WhiteScreenOptions,
} from '../types';

export type MikoCommand = 'dev' | 'build' | 'preview' | 'check' | 'doctor';
export type MikoRendering = 'ssg' | 'spa';
export type Awaitable<T> = T | Promise<T>;
export type AutoOption<T extends object> = boolean | T;

export interface MikoConfigEnv {
  command: MikoCommand;
  mode: string;
  root: string;
}

export interface MikoOptions {
  rendering?: MikoRendering;
  template?: string;
  entry?: string;
  pagesDir?: string;
  uiLibrary?: false | 'vant' | 'element-plus';
  layout?: string;
  lib?: LibConfig;
  vuePluginOptions?: VueOptions;
  vueJsxPluginOptions?: VueJsxOptions;
  /**
   * 是否用 vue-macros 包裹 Vue 官方插件，默认 true（保持历史行为）。
   *
   * vue-macros 会为每个宏单独再挂一层全局 transform，对不依赖宏语法的项目是纯开销：
   * 1350 个模块的 app 构建里，setup-component-pre / reactivity-transform / better-define
   * 三个插件各跑 1350 次，关掉后同机构建 27.0s → 17.5s（-35%）。
   *
   * 设为 false 即直接使用 @vitejs/plugin-vue 与 @vitejs/plugin-vue-jsx，代价是不再支持
   * vue-macros 的 `$ref` 等响应式解构语法糖与 `.setup.tsx` 组件（`defineOptions` 等
   * Vue 3.3+ 原生宏不受影响）。
   */
  vueMacros?: boolean;
  routerPluginOptions?: VueRouterOptions;
  layoutsPluginOptions?: AutoOption<LayoutsUserOptions>;
  componentsPluginOptions?: AutoOption<ComponentsOptions>;
  unoCSSPluginOptions?: AutoOption<UnoCSSVitePluginConfig>;
  legacyPluginOptions?: AutoOption<LegacyOptions>;
  ssgOptions?: SSGConfig;
  linterOptions?: AutoOption<LinterOptions>;
  devToolsPluginOptions?: AutoOption<DevToolsOptions>;
  bootstrapOptions?: BootstrapOptions;
  externalOptions?: ExternalOptions | false;
  devOptions?: DevOptions;
  pinia?: boolean;
  unhead?: boolean;
  janusOptions?: AutoOption<JanusOptions>;
  whiteScreen?: AutoOption<WhiteScreenOptions>;
}

export interface ResolvedCapabilities {
  uiLibrary: ResolvedCapability<false | 'vant' | 'element-plus'>;
  legacy: ResolvedCapability<LegacyOptions>;
  cdn: ResolvedCapability<ExternalOptions>;
  devtools: ResolvedCapability<DevToolsOptions>;
  layouts: ResolvedCapability<LayoutsUserOptions>;
  components: ResolvedCapability<ComponentsOptions>;
  unoCSS: ResolvedCapability<UnoCSSVitePluginConfig>;
  linter: ResolvedCapability<LinterOptions>;
  pinia: ResolvedCapability<boolean>;
  unhead: ResolvedCapability<boolean>;
  janus: ResolvedCapability<JanusOptions>;
  whiteScreen: ResolvedCapability<WhiteScreenOptions>;
}

export interface MikoConfig {
  miko?: MikoOptions;
  vite?: UserConfig;
}

export type MikoConfigFactory = (env: MikoConfigEnv) => Awaitable<MikoConfig>;
export type MikoConfigExport = MikoConfig | MikoConfigFactory;

export interface LoadedMikoConfig {
  config: MikoConfig;
  configFile: string | null;
}

export interface ResolvedMikoOptions extends Required<
  Pick<MikoOptions, 'rendering' | 'template' | 'entry' | 'pagesDir' | 'uiLibrary' | 'layout'>
> {
  lib?: LibConfig;
  vuePluginOptions: VueOptions;
  vueJsxPluginOptions: VueJsxOptions;
  vueMacros: boolean;
  routerPluginOptions: VueRouterOptions;
  layoutsPluginOptions: LayoutsUserOptions | false;
  componentsPluginOptions: ComponentsOptions | false;
  unoCSSPluginOptions: UnoCSSVitePluginConfig | false;
  legacyPluginOptions: LegacyOptions | false;
  ssgOptions: SSGConfig;
  linterOptions: LinterOptions | false;
  devToolsPluginOptions: DevToolsOptions | false;
  bootstrapOptions: BootstrapOptions;
  externalOptions: ExternalOptions | false;
  devOptions: DevOptions;
  pinia: boolean;
  unhead: boolean;
  janusOptions: JanusOptions | false;
  whiteScreenOptions: WhiteScreenOptions | false;
}

export interface ResolvedMikoConfig {
  env: MikoConfigEnv;
  configFile: string | null;
  viteRoot: string;
  miko: ResolvedMikoOptions;
  vite: UserConfig;
  outDir: string;
  signals: import('../capabilities/types').ProjectSignals;
  capabilities: ResolvedCapabilities;
}
