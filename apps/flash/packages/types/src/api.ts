// ═══════════════════════════════════════════════════════════════
// @shadowob/flash-types — API Response & Stream Types
// ═══════════════════════════════════════════════════════════════

/** Unified API success response */
export interface ApiOk<T = unknown> {
  ok: true
  data?: T
  [key: string]: unknown
}

/** Unified API error response */
export interface ApiErr {
  ok: false
  error: string
}

export type ApiResult<T = unknown> = ApiOk<T> | ApiErr

/** SSE stream event */
export interface StreamEvent {
  type: string
  data: string
}

/** Helper: construct a success response */
export function ok<T>(data?: T, extra?: Record<string, unknown>): ApiOk<T> {
  return { ok: true, data, ...extra }
}

/** Helper: construct an error response */
export function err(message: string): ApiErr {
  return { ok: false, error: message }
}
