import type { ErrorHandler } from 'hono'

export const globalErrorHandler: ErrorHandler = (err, c) => {
  console.error('🔴 [Global Error]', err.message, err.stack?.split('\n').slice(0, 5).join('\n'))

  return c.json(
    {
      ok: false,
      error: `Internal server error: ${err.message}`,
    },
    500,
  )
}
