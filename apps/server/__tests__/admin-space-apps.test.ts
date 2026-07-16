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

describe('admin Space Apps handler', () => {
  it('lets a global admin add a Space App catalog entry', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const spaceAppService = {
      upsertCatalogEntry: vi.fn().mockResolvedValue({
        id: 'catalog-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
      }),
    }
    const app = createTestApp({ adminUseCase, spaceAppService })

    const response = await app.request('/api/admin/space-app-catalog', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        manifest: {
          schemaVersion: 'shadow.space-app/1',
          appKey: 'demo-desk',
          name: 'Demo Desk',
          iconUrl: 'http://localhost:4199/assets/icon.svg',
          api: { baseUrl: 'http://localhost:4199', auth: { type: 'oauth2-bearer' } },
          commands: [
            {
              name: 'tickets.list',
              ingress: {
                path: '/.shadow/commands/tickets.list',
                auth: 'shadow-command-jwt',
              },
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
    expect(spaceAppService.upsertCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 'admin-user-1' }),
      expect.objectContaining({ manifest: expect.objectContaining({ appKey: 'demo-desk' }) }),
    )
  })

  it('lets a global admin publish an installed Space App to the catalog', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const spaceAppService = {
      upsertCatalogEntry: vi.fn().mockResolvedValue({
        id: 'catalog-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
      }),
    }
    const app = createTestApp({ adminUseCase, spaceAppService })

    const response = await app.request('/api/admin/space-app-catalog', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceSpaceAppId: '9f938ca9-864a-42f9-bafb-88a36960730d',
        status: 'active',
      }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: 'catalog-1',
      appKey: 'demo-desk',
      name: 'Demo Desk',
    })
    expect(spaceAppService.upsertCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 'admin-user-1' }),
      expect.objectContaining({
        sourceSpaceAppId: '9f938ca9-864a-42f9-bafb-88a36960730d',
        status: 'active',
      }),
    )
  })

  it('lets a global admin publish an installed Space App through the install row action', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const spaceAppService = {
      upsertCatalogEntry: vi.fn().mockResolvedValue({
        id: 'catalog-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
      }),
    }
    const app = createTestApp({ adminUseCase, spaceAppService })

    const response = await app.request(
      '/api/admin/space-apps/9f938ca9-864a-42f9-bafb-88a36960730d/catalog',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer access-token' },
      },
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: 'catalog-1',
      appKey: 'demo-desk',
      name: 'Demo Desk',
    })
    expect(spaceAppService.upsertCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 'admin-user-1' }),
      {
        sourceSpaceAppId: '9f938ca9-864a-42f9-bafb-88a36960730d',
        status: 'active',
      },
    )
  })

  it('allows a global admin to uninstall a Space App installation', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const spaceAppDao = {
      deleteById: vi.fn().mockResolvedValue(undefined),
    }
    const app = createTestApp({ adminUseCase, spaceAppDao })

    const response = await app.request('/api/admin/space-apps/space-app-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(spaceAppDao.deleteById).toHaveBeenCalledWith('space-app-1')
  })

  it('lets a global admin refresh an installed Space App manifest', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const spaceAppService = {
      refreshInstalledSpaceAppForAdmin: vi.fn().mockResolvedValue({
        id: 'app-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
      }),
    }
    const app = createTestApp({ adminUseCase, spaceAppService })

    const response = await app.request('/api/admin/space-apps/app-1/refresh', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'app-1',
      appKey: 'demo-desk',
      name: 'Demo Desk',
    })
    expect(spaceAppService.refreshInstalledSpaceAppForAdmin).toHaveBeenCalledWith('app-1')
  })

  it('lets a global admin refresh a catalog entry manifest', async () => {
    const adminUseCase = {
      getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    }
    const spaceAppService = {
      refreshCatalogEntryForAdmin: vi.fn().mockResolvedValue({
        id: 'catalog-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
      }),
    }
    const app = createTestApp({ adminUseCase, spaceAppService })

    const response = await app.request('/api/admin/space-app-catalog/catalog-1/refresh', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'catalog-1',
      appKey: 'demo-desk',
      name: 'Demo Desk',
    })
    expect(spaceAppService.refreshCatalogEntryForAdmin).toHaveBeenCalledWith('catalog-1')
  })
})
