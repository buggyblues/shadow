import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { createRateLimitMiddleware } from '../src/middleware/rate-limit.middleware'

const previousDisableRateLimits = process.env.SHADOWOB_DISABLE_RATE_LIMITS

afterEach(() => {
  if (previousDisableRateLimits === undefined) {
    delete process.env.SHADOWOB_DISABLE_RATE_LIMITS
  } else {
    process.env.SHADOWOB_DISABLE_RATE_LIMITS = previousDisableRateLimits
  }
})

describe('createRateLimitMiddleware', () => {
  it('returns 429 after the configured request limit', async () => {
    process.env.SHADOWOB_DISABLE_RATE_LIMITS = 'false'
    const app = new Hono()
    app.get(
      '/limited',
      createRateLimitMiddleware({
        namespace: `test-${Date.now()}`,
        windowMs: 60_000,
        limit: 2,
        keyGenerator: () => 'same-client',
      }),
      (c) => c.json({ ok: true }),
    )

    expect((await app.request('/limited')).status).toBe(200)
    expect((await app.request('/limited')).status).toBe(200)

    const limited = await app.request('/limited')
    expect(limited.status).toBe(429)
    expect(await limited.json()).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
    })
    expect(limited.headers.get('Retry-After')).toBeTruthy()
  })

  it('can be disabled globally from env', async () => {
    process.env.SHADOWOB_DISABLE_RATE_LIMITS = 'true'
    const app = new Hono()
    app.get(
      '/limited',
      createRateLimitMiddleware({
        namespace: `disabled-test-${Date.now()}`,
        windowMs: 60_000,
        limit: 1,
        keyGenerator: () => 'same-client',
      }),
      (c) => c.json({ ok: true }),
    )

    expect((await app.request('/limited')).status).toBe(200)
    expect((await app.request('/limited')).status).toBe(200)
    expect((await app.request('/limited')).status).toBe(200)
  })
})
