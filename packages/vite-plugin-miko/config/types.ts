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
  routerPluginOptions: VueRouterOptions;
  layoutsPluginOptions: LayoutsUserOptions | false;
  componentsPluginOptions: ComponentsOptions | false;
  unoCSSPluginOptions: UnoCSSVitePluginConfig | false;
  legacyPluginOptions: LegacyOptions | false;
  ssgOptions: SSGConfig;
  linterOptions: LinterOptions | false;
  bootstrapOptions: BootstrapOptions;
  externalOptions: ExternalOptions | false;
  devOptions: DevOptions;
  janusOptions: JanusOptions | false;
}

export interface ResolvedMikoConfig {
  env: MikoConfigEnv;
  configFile: string | null;
  viteRoot: string;
  miko: ResolvedMikoOptions;
  vite: UserConfig;
  outDir: string;
}
