export class MikoConfigError extends Error {
  readonly code: string
  readonly file?: string
  readonly field?: string

  constructor(options: {
    code: string
    message: string
    file?: string
    field?: string
    cause?: unknown
  }) {
    super(options.message, { cause: options.cause })
    this.name = 'MikoConfigError'
    this.code = options.code
    this.file = options.file
    this.field = options.field
  }
}
