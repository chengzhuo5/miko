export class MikoCliError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode: number, cause?: unknown) {
    super(message, { cause });
    this.name = 'MikoCliError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function toMikoCliError(error: unknown): MikoCliError {
  if (error instanceof MikoCliError) return error;

  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('MIKO_')
  ) {
    const exitCode = error.code.startsWith('MIKO_CAPABILITY_') ? 3 : 2;
    return new MikoCliError(error.code, error.message, exitCode, error);
  }

  return new MikoCliError(
    'MIKO_UNEXPECTED',
    error instanceof Error ? error.message : String(error),
    1,
    error,
  );
}
