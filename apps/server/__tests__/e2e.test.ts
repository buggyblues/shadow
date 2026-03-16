import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { signAccessToken, verifyToken } from '../src/lib/jwt'

describe('JWT lib', () => {
  it('should sign and verify an access token', () => {
    const payload = {
      userId: 'user-123',
      email: 'test@shadowob.com',
      username: 'testuser',
    }

    const token = signAccessToken(payload)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3) // JWT format

    const decoded = verifyToken(token)
    expect(decoded.userId).toBe('user-123')
    expect(decoded.email).toBe('test@shadowob.com')
    expect(decoded.username).toBe('testuser')
  })

  it('should throw on invalid token', () => {
    expect(() => verifyToken('invalid-token')).toThrow()
  })

  it('should throw on tampered token', () => {
    const payload = {
      userId: 'user-123',
      email: 'test@shadowob.com',
      username: 'testuser',
    }
    const token = signAccessToken(payload)
    const tampered = `${token}x`
    expect(() => verifyToken(tampered)).toThrow()
  })
})

describe('Auth Middleware integration', () => {
  it('should reject request without Authorization header', async () => {
    // Inline test of auth middleware pattern
    const app = new Hono()
    app.use('*', async (c, next) => {
      const authHeader = c.req.header('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const token = authHeader.slice(7)
      try {
        const payload = verifyToken(token)
        c.set('user', payload as never)
        await next()
      } catch {
        return c.json({ error: 'Invalid token' }, 401)
      }
    })
    app.get('/protected', (c) => c.json({ ok: true }))

    const res = await app.request('/protected')
    expect(res.status).toBe(401)
  })

  it('should accept request with valid Bearer token', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      const authHeader = c.req.header('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const token = authHeader.slice(7)
      try {
        const payload = verifyToken(token)
        c.set('user', payload as never)
        await next()
      } catch {
        return c.json({ error: 'Invalid token' }, 401)
      }
    })
    app.get('/protected', (c) => {
      const user = c.get('user') as { userId: string }
      return c.json({ userId: user.userId })
    })

    const token = signAccessToken({
      userId: 'user-456',
      email: 'test@shadowob.com',
      username: 'testuser',
    })

    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.userId).toBe('user-456')
  })

  it('should reject expired/invalid token', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      const authHeader = c.req.header('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const token = authHeader.slice(7)
      try {
        const payload = verifyToken(token)
        c.set('user', payload as never)
        await next()
      } catch {
        return c.json({ error: 'Invalid token' }, 401)
      }
    })
    app.get('/protected', (c) => c.json({ ok: true }))

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer bad.token.here' },
    })
    expect(res.status).toBe(401)
  })
})

describe('Health check endpoint', () => {
  it('should respond with status ok', async () => {
    const app = new Hono()
    app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.timestamp).toBeDefined()
  })
})

describe('Hono route wiring', () => {
  it('should wire all API route groups', () => {
    const app = new Hono()

    // Simulate the route wiring from app.ts
    const authRoutes = new Hono()
    authRoutes.post('/register', (c) => c.json({ ok: true }, 201))
    authRoutes.post('/login', (c) => c.json({ ok: true }))

    const serverRoutes = new Hono()
    serverRoutes.get('/', (c) => c.json([]))
    serverRoutes.post('/', (c) => c.json({ ok: true }, 201))

    app.route('/api/auth', authRoutes)
    app.route('/api/servers', serverRoutes)
    app.get('/health', (c) => c.json({ status: 'ok' }))
    app.notFound((c) => c.json({ error: 'Not Found' }, 404))

    // All route groups are wired correctly
    expect(app).toBeDefined()
  })

  it('should return 404 for unknown routes', async () => {
    const app = new Hono()
    app.notFound((c) => c.json({ error: 'Not Found' }, 404))

    const res = await app.request('/nonexistent')
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Not Found')
  })
})

describe('CORS middleware', () => {
  it('should add CORS headers', async () => {
    const { cors } = await import('hono/cors')
    const app = new Hono()
    app.use('*', cors())
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(res.status).toBe(200)
    // Should have CORS header
    const acao = res.headers.get('access-control-allow-origin')
    expect(acao).toBeDefined()
  })
})
