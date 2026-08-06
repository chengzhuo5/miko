import type { MikoConfig, MikoConfigExport, MikoConfigFactory } from './types'

export function defineMikoConfig(): MikoConfig
export function defineMikoConfig(config: MikoConfig): MikoConfig
export function defineMikoConfig(config: MikoConfigFactory): MikoConfigFactory
export function defineMikoConfig(config: MikoConfigExport = {}): MikoConfigExport {
  return config
}
