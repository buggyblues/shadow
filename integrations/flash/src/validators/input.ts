import { ZodError, type ZodType } from 'zod'

export class FlashValidationError extends Error {
  readonly issues: unknown

  constructor(error: ZodError) {
    super(error.issues[0]?.message ?? 'Invalid input')
    this.name = 'FlashValidationError'
    this.issues = error.issues
  }
}

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new FlashValidationError(parsed.error)
  return parsed.data
}
