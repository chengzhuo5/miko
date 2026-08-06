import { mergeConfig } from 'vite'
import type { Alias, AliasOptions, PluginOption, UserConfig } from 'vite'
import { MikoConfigError } from './errors'

function unique(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined
  return [...new Set(values)]
}

function normalizeAlias(alias: AliasOptions | undefined): Alias[] {
  if (!alias) return []
  if (Array.isArray(alias)) return [...alias]
  return Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))
}

function aliasKey(alias: Alias): string {
  return typeof alias.find === 'string'
    ? `string:${alias.find}`
    : `regexp:${alias.find.toString()}`
}

function mergeAlias(
  base: AliasOptions | undefined,
  user: AliasOptions | undefined,
): Alias[] | undefined {
  const result = new Map<string, Alias>()
  for (const alias of normalizeAlias(user)) result.set(aliasKey(alias), alias)
  for (const alias of normalizeAlias(base)) {
    const key = aliasKey(alias)
    if (!result.has(key)) result.set(key, alias)
  }
  return result.size > 0 ? [...result.values()] : undefined
}

function flattenPlugins(options: PluginOption[] | undefined): PluginOption[] {
  const result: PluginOption[] = []
  const visit = (option: unknown): void => {
    if (Array.isArray(option)) {
      for (const nested of option) visit(nested)
      return
    }
    if (option) result.push(option as PluginOption)
  }

  for (const option of options ?? []) visit(option)
  return result
}

export function mergeViteConfig(base: UserConfig, user: UserConfig): UserConfig {
  const merged = mergeConfig(base, user)
  const include = unique([
    ...(base.optimizeDeps?.include ?? []),
    ...(user.optimizeDeps?.include ?? []),
  ])
  const exclude = unique([
    ...(base.optimizeDeps?.exclude ?? []),
    ...(user.optimizeDeps?.exclude ?? []),
  ])
  const conflicts = include?.filter(id => exclude?.includes(id)) ?? []

  if (conflicts.length > 0) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_CONFLICT',
      field: 'vite.optimizeDeps',
      message: `optimizeDeps 同时 include/exclude: ${conflicts.join(', ')}`,
    })
  }

  return {
    ...merged,
    plugins: [...flattenPlugins(base.plugins), ...flattenPlugins(user.plugins)],
    resolve: {
      ...merged.resolve,
      alias: mergeAlias(base.resolve?.alias, user.resolve?.alias),
    },
    optimizeDeps: {
      ...merged.optimizeDeps,
      include,
      exclude,
    },
  }
}
