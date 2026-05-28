import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createAppIntegrationHandler } from '../src/handlers/app-integration.handler'

vi.mock('../src/lib/jwt', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-1',
    username: 'tester',
    typ: 'access',
    aud: 'shadow:access',
    iss: 'shadow',
    jti: 'jwt-1',
  }),
}))

function createTestApp(service: Record<string, unknown>) {
  const app = new Hono()
  app.route(
    '/api',
    createAppIntegrationHandler({
      resolve: (name: string) => {
        if (name === 'appIntegrationService') return service
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as never),
  )
  return app
}

describe('app integration handler', () => {
  it('introspects server app OAuth command tokens without user auth', async () => {
    const service = {
      introspectCommandToken: vi.fn().mockResolvedValue({
        active: true,
        token_type: 'Bearer',
        sub: 'agent:agent-1',
      }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/apps/demo-desk/oauth/introspect', {
      method: 'POST',
      headers: { Authorization: 'Bearer command-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      active: true,
      token_type: 'Bearer',
      sub: 'agent:agent-1',
    })
    expect(service.introspectCommandToken).toHaveBeenCalledWith(
      'srv-1',
      'demo-desk',
      'command-token',
    )
  })

  it('lists server apps through an authenticated route', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([{ id: 'app-1', appKey: 'demo-desk' }]),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/apps', {
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 'app-1', appKey: 'demo-desk' }])
    expect(service.list).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
  })

  it('discovers a server app manifest through an authenticated admin route', async () => {
    const service = {
      discover: vi.fn().mockResolvedValue({
        manifest: { appKey: 'demo-desk', name: 'Demo Desk' },
        installed: null,
        permissions: [],
      }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/apps/discover', {
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

    expect(response.status).toBe(200)
    expect(service.discover).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      expect.objectContaining({ manifest: expect.objectContaining({ appKey: 'demo-desk' }) }),
    )
  })

  it('returns launch metadata from the service', async () => {
    const service = {
      createLaunch: vi.fn().mockResolvedValue({
        serverId: 'srv-1',
        serverAppId: 'app-1',
        appKey: 'demo-desk',
        iframeEntry: 'http://localhost:4199/shadow/server',
        allowedOrigins: ['http://localhost:4199'],
        launchToken: 'sat_v1.body.sig',
        eventStreamPath: '/api/servers/srv-1/apps/demo-desk/events?token=sat_v1.body.sig',
        expiresIn: 600,
      }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/apps/demo-desk/launch', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      appKey: 'demo-desk',
      eventStreamPath: expect.stringContaining('/events?token='),
    })
  })

  it('lists catalog apps and installs one through authenticated routes', async () => {
    const service = {
      listCatalog: vi.fn().mockResolvedValue([{ id: 'catalog-1', appKey: 'demo-desk' }]),
      installFromCatalog: vi.fn().mockResolvedValue({ id: 'app-1', appKey: 'demo-desk' }),
    }
    const app = createTestApp(service)

    const listResponse = await app.request('/api/servers/srv-1/apps/catalog', {
      headers: { Authorization: 'Bearer access-token' },
    })
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual([{ id: 'catalog-1', appKey: 'demo-desk' }])

    const installResponse = await app.request('/api/servers/srv-1/apps/catalog/catalog-1/install', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(installResponse.status).toBe(201)
    expect(await installResponse.json()).toEqual({ id: 'app-1', appKey: 'demo-desk' })
    expect(service.installFromCatalog).toHaveBeenCalledWith(
      'srv-1',
      'catalog-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      {},
    )
  })

  it('passes command calls to the service with parsed JSON input', async () => {
    const service = {
      callCommand: vi.fn().mockResolvedValue({ ok: true, result: { tickets: [] } }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/apps/demo-desk/commands/tickets.list', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: { limit: 5 } }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, result: { tickets: [] } })
    expect(service.callCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        serverIdOrSlug: 'srv-1',
        appKey: 'demo-desk',
        commandName: 'tickets.list',
        body: { input: { limit: 5 } },
      }),
    )
  })

  it('accepts null optional command context from launch frames', async () => {
    const service = {
      callCommand: vi.fn().mockResolvedValue({ ok: true, result: { tickets: [] } }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/apps/demo-desk/commands/tickets.list', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: { limit: 5 }, channelId: null, task: null }),
    })

    expect(response.status).toBe(200)
    const call = service.callCommand.mock.calls[0]?.[0] as {
      body: { input?: unknown; channelId?: string; task?: unknown }
    }
    expect(call.body.input).toEqual({ limit: 5 })
    expect(call.body.channelId).toBeUndefined()
    expect(call.body.task).toBeUndefined()
  })
})
