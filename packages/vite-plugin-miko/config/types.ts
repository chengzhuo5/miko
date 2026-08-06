import type { UserConfig } from 'vite'
import type {
  BootstrapOptions,
  ComponentsOptions,
  DevOptions,
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
} from '../types'

export type MikoCommand = 'dev' | 'build' | 'preview' | 'check' | 'doctor'
export type MikoRendering = 'ssg' | 'spa'
export type Awaitable<T> = T | Promise<T>

export interface MikoConfigEnv {
  command: MikoCommand
  mode: string
  root: string
}

export interface MikoOptions {
  rendering?: MikoRendering
  template?: string
  entry?: string
  pagesDir?: string
  uiLibrary?: 'vant' | 'element-plus'
  layout?: string
  lib?: LibConfig
  vuePluginOptions?: VueOptions
  vueJsxPluginOptions?: VueJsxOptions
  routerPluginOptions?: VueRouterOptions
  layoutsPluginOptions?: LayoutsUserOptions | false
  componentsPluginOptions?: ComponentsOptions | false
  unoCSSPluginOptions?: UnoCSSVitePluginConfig | false
  legacyPluginOptions?: LegacyOptions | false
  ssgOptions?: SSGConfig
  linterOptions?: LinterOptions | false
  bootstrapOptions?: BootstrapOptions
  externalOptions?: ExternalOptions | false
  devOptions?: DevOptions
  janusOptions?: JanusOptions | false
}

export interface MikoConfig {
  miko?: MikoOptions
  vite?: UserConfig
}

export type MikoConfigFactory = (env: MikoConfigEnv) => Awaitable<MikoConfig>
export type MikoConfigExport = MikoConfig | MikoConfigFactory

export interface LoadedMikoConfig {
  config: MikoConfig
  configFile: string | null
}

export interface ResolvedMikoOptions
  extends Required<Pick<MikoOptions, 'rendering' | 'template' | 'entry' | 'pagesDir' | 'uiLibrary' | 'layout'>> {
  lib?: LibConfig
  vuePluginOptions: VueOptions
  vueJsxPluginOptions: VueJsxOptions
  routerPluginOptions: VueRouterOptions
  layoutsPluginOptions: LayoutsUserOptions | false
  componentsPluginOptions: ComponentsOptions | false
  unoCSSPluginOptions: UnoCSSVitePluginConfig | false
  legacyPluginOptions: LegacyOptions | false
  ssgOptions: SSGConfig
  linterOptions: LinterOptions | false
  bootstrapOptions: BootstrapOptions
  externalOptions: ExternalOptions | false
  devOptions: DevOptions
  janusOptions: JanusOptions | false
}

export interface ResolvedMikoConfig {
  env: MikoConfigEnv
  configFile: string | null
  viteRoot: string
  miko: ResolvedMikoOptions
  vite: UserConfig
  outDir: string
}
