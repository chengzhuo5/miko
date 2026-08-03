/**
 * `--env` / `--mode` 参数解析与 `.env.<env>` 加载。
 * 纯函数（normalizeEnvArg / pickEnvArg / resolveMode）可单测；loadEnvFiles 负责 dotenv 接线。
 */
import dotenv from 'dotenv';

const ENV_NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 归一化 yargs 解析出的环境值。
 * 未传/空值返回 undefined；重复传值取最后一个；非法字符抛错（防路径穿越）。
 */
export function normalizeEnvArg(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value[value.length - 1] : String(value);
  if (!ENV_NAME_RE.test(raw)) {
    throw new Error(`非法 --env 值: "${raw}"（仅允许字母/数字/-/_）`);
  }
  return raw;
}

/**
 * 从 CLI 参数中选取环境名：--env 优先，其次 --mode（Vite 语义别名），都没有则 undefined。
 */
export function pickEnvArg(env: unknown, mode: unknown): string | undefined {
  return normalizeEnvArg(env ?? mode);
}

/**
 * 根据命令与所选环境解析最终 vite mode。
 * build 缺省 production，serve 缺省 development。
 */
export function resolveMode(envArg: string | undefined, command: 'build' | 'serve'): string {
  return envArg ?? (command === 'build' ? 'production' : 'development');
}

/**
 * 加载环境变量文件：先 .env.<env>（override: true，优先级高），再 .env 兜底（不覆盖已有变量）。
 * 无 --env 时仅加载 .env，与现状一致。.env.<env> 不存在时仅提示，不报错。
 */
export function loadEnvFiles(
  envArg: string | undefined,
  log: (msg: string) => void = console.log,
): void {
  if (envArg) {
    const envPath = `.env.${envArg}`;
    const result = dotenv.config({ path: envPath, override: true });
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        log(`[miko] 提示: 未找到 ${envPath}，仅使用 .env 中的变量`);
      } else {
        throw result.error;
      }
    }
  }
  dotenv.config();
}