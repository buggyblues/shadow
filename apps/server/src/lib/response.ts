// ─── Unified API Response Helpers ─────────────────────────────────────────

import type { Context } from 'hono'

/** Standard error codes for structured API errors */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_INPUT: 'INVALID_INPUT',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/** Standard success response */
export interface ApiSuccess<T = unknown> {
  ok: true
  data: T
}

/** Standard error response */
export interface ApiError {
  ok: false
  error: string
  code?: ErrorCode
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

/**
 * Create a success response.
 * Usage: `return ok(c, { user: data })`
 */
export function ok<T>(c: Context, data: T, status = 200): Response {
  return c.json({ ok: true, data } satisfies ApiSuccess<T>, status)
}

/**
 * Create an error response.
 * Usage: `return err(c, 'User not found', ErrorCodes.NOT_FOUND, 404)`
 */
export function err(
  c: Context,
  error: string,
  code?: ErrorCode,
  status = 400,
): Response {
  const body: ApiError = { ok: false, error }
  if (code) body.code = code
  return c.json(body, status as Parameters<typeof c.json>[1])
}

/**
 * Wrap a value in the success response shape (for returning directly from handlers
 * that don't need the Context).
 */
export function okData<T>(data: T): ApiSuccess<T> {
  return { ok: true, data }
}
