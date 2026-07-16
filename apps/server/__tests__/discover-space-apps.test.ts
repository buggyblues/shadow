import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET ??= 'discover-space-apps-test-secret'

const { createDiscoverHandler } = await import('../src/handlers/discover.handler')
const { signAccessToken } = await import('../src/lib/jwt')

function createTestApp(spaceAppService: Record<string, unknown>) {
  const app = new Hono()
  app.route(
    '/api/discover',
    createDiscoverHandler({
      resolve(name: string) {
        if (name === 'spaceAppService') return spaceAppService
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as never),
  )
  return app
}

function authHeaders() {
  return {
    Authorization: `Bearer ${signAccessToken({ userId: 'user-1', username: 'alice' })}`,
  }
}

describe('discover Space Apps handler', () => {
  it('serves the canonical directory routes', async () => {
    const listDiscoverCatalog = vi.fn().mockResolvedValue({ apps: [], total: 0 })
    const getDiscoverCatalogEntry = vi.fn().mockResolvedValue({
      appKey: 'travel',
      name: 'Travel',
    })
    const app = createTestApp({ listDiscoverCatalog, getDiscoverCatalogEntry })

    const listResponse = await app.request('/api/discover/space-apps?q=trip&limit=12&offset=3', {
      headers: authHeaders(),
    })
    const detailResponse = await app.request('/api/discover/space-apps/travel', {
      headers: authHeaders(),
    })

    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({ apps: [], total: 0 })
    expect(listDiscoverCatalog).toHaveBeenCalledWith({
      q: 'trip',
      limit: 12,
      offset: 3,
      locale: undefined,
    })
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual({ appKey: 'travel', name: 'Travel' })
    expect(getDiscoverCatalogEntry).toHaveBeenCalledWith('travel', { locale: undefined })
  })
})
