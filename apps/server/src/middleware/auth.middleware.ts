import type { Context, Next } from 'hono'
import { type JwtPayload, verifyToken } from '../lib/jwt'

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ ok: false, error: 'Unauthorized: Missing or invalid token' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyToken(token)
    c.set('user', payload)
    await next()
  } catch {
    return c.json({ ok: false, error: 'Unauthorized: Invalid or expired token' }, 401)
  }
}
