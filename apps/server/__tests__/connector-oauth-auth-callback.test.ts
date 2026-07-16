import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET ??= 'connector-oauth-auth-callback-test-secret'

const { createAuthHandler } = await import('../src/handlers/auth.handler')

describe('platform GitHub OAuth callback routing', () => {
  it('routes connector authorization back to the connector callback', async () => {
    const handleCallback = vi.fn()
    const hasOAuthAuthorizationState = vi.fn(async () => true)
    const container = {
      resolve(name: string) {
        if (name === 'externalOAuthService') return { handleCallback }
        if (name === 'cloudConnectorService') return { hasOAuthAuthorizationState }
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }
    const app = new Hono().route('/api/auth', createAuthHandler(container as never))

    const response = await app.request(
      '/api/auth/oauth/github/callback?state=connector-state&code=authorization-code',
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      '/api/cloud-computers/oauth/callback?state=connector-state&code=authorization-code',
    )
    expect(hasOAuthAuthorizationState).toHaveBeenCalledWith('connector-state')
    expect(handleCallback).not.toHaveBeenCalled()
  })
})
