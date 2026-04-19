import type { MiddlewareHandler } from 'hono'

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  const status = c.res.status
  const icon = status >= 500 ? '🔴' : status >= 400 ? '🟡' : '🟢'
  console.log(`${icon} ${c.req.method} ${c.req.path} → ${status} (${ms}ms)`)
}
