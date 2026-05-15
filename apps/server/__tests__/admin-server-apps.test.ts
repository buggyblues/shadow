import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createAdminHandler } from '../src/handlers/admin.handler'

vi.mock('../src/lib/jwt', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'admin-user-1',
    username: 'admin',
    typ: 'access',
    aud: 'shadow:access',
    iss: 'shadow',
    jti: 'jwt-admin-1',
  }),
}))

function createTestApp(deps: Record<string, unknown>) {
  const app = new Hono()
  app.route(
    '/api/admin',
    createAdminHandler({
      resolve: (name: string) => {
        const value = deps[name]
        if (value) return value
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as never),
  )
  return app
}

describe('admin server apps handler', () => {
  it('lets a global admin add a server app catalog entry', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const appIntegrationService = {
      upsertCatalogEntry: vi.fn().mockResolvedValue({
        id: 'catalog-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
      }),
    }
    const app = createTestApp({ adminUseCase, appIntegrationService })

    const response = await app.request('/api/admin/server-app-catalog', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        manifest: {
          schemaVersion: 'shadow.app/1',
          appKey: 'demo-desk',
          name: 'Demo Desk',
          iconUrl: 'http://localhost:4199/assets/icon.svg',
          api: { baseUrl: 'http://localhost:4199', auth: { type: 'oauth2-bearer' } },
          commands: [
            {
              name: 'tickets.list',
              path: '/api/shadow/commands/tickets.list',
              permission: 'demo.tickets:read',
              action: 'read',
              dataClass: 'server-private',
            },
          ],
        },
      }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: 'catalog-1',
      appKey: 'demo-desk',
      name: 'Demo Desk',
    })
    expect(appIntegrationService.upsertCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 'admin-user-1' }),
      expect.objectContaining({ manifest: expect.objectContaining({ appKey: 'demo-desk' }) }),
    )
  })

  it('allows a global admin to uninstall a server app integration', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const appIntegrationDao = {
      deleteById: vi.fn().mockResolvedValue(undefined),
    }
    const app = createTestApp({ adminUseCase, appIntegrationDao })

    const response = await app.request('/api/admin/server-apps/server-app-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(appIntegrationDao.deleteById).toHaveBeenCalledWith('server-app-1')
  })
})
