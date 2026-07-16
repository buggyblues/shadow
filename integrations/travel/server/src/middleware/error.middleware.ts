import type { ErrorHandler } from 'hono'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import type { TravelHonoEnv } from '../types.js'

export const errorHandler: ErrorHandler<TravelHonoEnv> = (error, c) => {
  const status = error instanceof AppError ? error.status : 500
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR'
  const message = error instanceof Error ? error.message : 'Internal error'

  logger.error(message, {
    path: c.req.path,
    method: c.req.method,
    status,
    code,
    stack: status >= 500 && error instanceof Error ? error.stack : undefined,
  })

  return c.json(
    {
      ok: false,
      error: code,
      message,
      ...(error instanceof AppError && error.details ? { details: error.details } : {}),
    },
    status as 400,
  )
}
