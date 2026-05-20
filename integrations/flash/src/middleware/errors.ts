import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { FlashValidationError } from '../validators/input.js'

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next()
  } catch (error) {
    if (error instanceof HTTPException) throw error
    if (error instanceof FlashValidationError) {
      return c.json({ ok: false, error: error.message, issues: error.issues }, 422)
    }
    if (error instanceof ZodError) {
      return c.json({ ok: false, error: error.issues[0]?.message ?? 'Invalid input' }, 422)
    }
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500
    const message = error instanceof Error ? error.message : 'Internal error'
    return c.json({ ok: false, error: message }, status)
  }
}
