import type { Context } from 'hono'
import type { z } from 'zod'
import { badRequest } from '../lib/errors.js'

export async function parseJsonBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.output<T>> {
  const raw = await c.req.json().catch(() => {
    throw badRequest('Request body must be valid JSON')
  })
  const result = schema.safeParse(raw)
  if (!result.success) throw badRequest('Request body validation failed', result.error.flatten())
  return result.data
}

export function parseBooleanQuery(value: string | undefined) {
  return value === 'true' || value === '1'
}
