import type { Context, Next } from 'hono'
import { logger } from '../lib/logger'

export async function loggerMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now()
  const { method, url } = c.req
  const parsedUrl = new URL(url)
  const path = parsedUrl.pathname
  const safePath = path.replace(/^\/api\/media\/signed\/[^/]+$/, '/api/media/signed/[redacted]')
  const safeUrl = `${parsedUrl.origin}${safePath}${parsedUrl.search}`
  const requestContentLength = parseContentLength(c.req.header('content-length'))
  const requestUserAgent = c.req.header('user-agent')
  const requestOrigin = c.req.header('origin')
  const requestRefererOrigin = parseUrlOrigin(c.req.header('referer'))

  await next()

  const duration = Date.now() - start
  const status = c.res.status
  const responseContentLength = parseContentLength(c.res.headers.get('content-length'))

  logger.info(
    {
      method,
      url: safeUrl,
      status,
      duration: `${duration}ms`,
      ...(requestContentLength === null ? {} : { requestContentLength }),
      ...(responseContentLength === null ? {} : { responseContentLength }),
      ...(requestUserAgent ? { requestUserAgent } : {}),
      ...(requestOrigin ? { requestOrigin } : {}),
      ...(requestRefererOrigin ? { requestRefererOrigin } : {}),
    },
    `${method} ${safePath} ${status} ${duration}ms`,
  )
}

function parseContentLength(value: string | null | undefined) {
  if (!value) return null
  const length = Number(value)
  return Number.isFinite(length) && length >= 0 ? length : null
}

function parseUrlOrigin(value: string | null | undefined) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}
