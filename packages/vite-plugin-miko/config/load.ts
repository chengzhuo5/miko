import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { MikoConfigError } from './errors'
import type { LoadedMikoConfig, MikoConfig, MikoConfigEnv, MikoConfigExport } from './types'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validateConfig(value: unknown, file: string): MikoConfig {
  if (!isPlainRecord(value)) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      message: 'miko.config.ts 必须导出一个对象或返回对象的函数',
    })
  }

  const unknownFields = Object.keys(value).filter(key => key !== 'miko' && key !== 'vite')
  if (unknownFields.length > 0) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: unknownFields[0],
      message: `未知顶层字段 "${unknownFields[0]}"；请放入 miko 或 vite 命名空间`,
    })
  }

  if (value.miko !== undefined && !isPlainRecord(value.miko)) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: 'miko',
      message: 'miko 字段必须是对象',
    })
  }

  if (value.vite !== undefined && !isPlainRecord(value.vite)) {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: 'vite',
      message: 'vite 字段必须是对象',
    })
  }

  const rendering = (value.miko as { rendering?: unknown } | undefined)?.rendering
  if (rendering !== undefined && rendering !== 'spa' && rendering !== 'ssg') {
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_INVALID',
      file,
      field: 'miko.rendering',
      message: `miko.rendering 只能是 "spa" 或 "ssg"`,
    })
  }

  return value as MikoConfig
}

export async function loadMikoConfig(env: MikoConfigEnv): Promise<LoadedMikoConfig> {
  const configFile = resolve(env.root, 'miko.config.ts')
  if (!existsSync(configFile)) return { config: {}, configFile: null }

  try {
    const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false })
    const moduleValue = await jiti.import(configFile)
    const exported = (
      isPlainRecord(moduleValue) && 'default' in moduleValue ? moduleValue.default : moduleValue
    ) as MikoConfigExport
    const value = typeof exported === 'function' ? await exported(env) : exported

    return {
      config: validateConfig(value, configFile),
      configFile,
    }
  } catch (error) {
    if (error instanceof MikoConfigError) throw error
    throw new MikoConfigError({
      code: 'MIKO_CONFIG_LOAD',
      file: configFile,
      message: `无法加载 ${configFile}`,
      cause: error,
    })
  }
}
