import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createSpaceAppHandler } from '../src/handlers/space-app.handler'

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

function createTestApp(
  service: Record<string, unknown>,
  extra: Record<string, Record<string, unknown>> = {},
) {
  const app = new Hono()
  app.route(
    '/api',
    createSpaceAppHandler({
      resolve: (name: string) => {
        if (name === 'spaceAppService') return service
        if (extra[name]) return extra[name]
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as never),
  )
  return app
}

describe('Space App installation handler', () => {
  it('publishes a declared Space App notification with a user-bound launch token', async () => {
    const installedSpaceApp = {
      id: '11111111-1111-4111-8111-111111111111',
      serverId: '22222222-2222-4222-8222-222222222222',
      appKey: 'demo-desk',
      name: 'Demo Desk',
      manifest: { notifications: [{ key: 'ticket.changed', title: 'Ticket changes' }] },
    }
    const service = {
      getEventStreamContext: vi.fn().mockResolvedValue({
        app: installedSpaceApp,
        payload: {
          actorKind: 'user',
          userId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    }
    const publish = vi.fn().mockResolvedValue({ ok: true, results: [] })
    const app = createTestApp(service, { spaceAppNotificationService: { publish } })
    const response = await app.request(
      '/api/servers/22222222-2222-4222-8222-222222222222/space-apps/demo-desk/notifications',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer launch-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicKey: 'ticket.changed',
          recipientUserIds: ['44444444-4444-4444-8444-444444444444'],
          title: 'Ticket changed',
          idempotencyKey: 'ticket-42-version-3',
          actionPath: '/tickets/42',
        }),
      },
    )
    expect(response.status).toBe(202)
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        app: installedSpaceApp,
        topicKey: 'ticket.changed',
        actor: expect.objectContaining({ kind: 'user' }),
      }),
    )
  })

  it('accepts a command token for notifications emitted during Buddy work', async () => {
    const installedSpaceApp = {
      id: '11111111-1111-4111-8111-111111111111',
      serverId: '22222222-2222-4222-8222-222222222222',
      appKey: 'demo-desk',
      name: 'Demo Desk',
      manifest: { notifications: [{ key: 'ticket.changed', title: 'Ticket changes' }] },
    }
    const service = {
      getEventStreamContext: vi.fn().mockRejectedValue(new Error('not a launch token')),
      introspectCommandToken: vi.fn().mockResolvedValue({
        active: true,
        shadow: {
          spaceAppId: installedSpaceApp.id,
          serverId: installedSpaceApp.serverId,
          appKey: installedSpaceApp.appKey,
          actor: { kind: 'agent', userId: '33333333-3333-4333-8333-333333333333' },
        },
      }),
    }
    const publish = vi.fn().mockResolvedValue({ ok: true, results: [] })
    const app = createTestApp(service, {
      spaceAppNotificationService: { publish },
      spaceAppDao: { findById: vi.fn().mockResolvedValue(installedSpaceApp) },
    })
    const response = await app.request(
      '/api/servers/22222222-2222-4222-8222-222222222222/space-apps/demo-desk/notifications',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer command-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicKey: 'ticket.changed',
          recipientUserIds: ['44444444-4444-4444-8444-444444444444'],
          title: 'Ticket changed',
          idempotencyKey: 'ticket-42-version-4',
        }),
      },
    )
    expect(response.status).toBe(202)
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ kind: 'agent' }) }),
    )
  })

  it('introspects Space App command tokens without user auth or routing headers', async () => {
    const service = {
      introspectCommandToken: vi.fn().mockResolvedValue({
        active: true,
        token_type: 'Bearer',
        sub: 'agent:agent-1',
      }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/space-apps/commands/introspect', {
      method: 'POST',
      headers: { Authorization: 'Bearer command-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      active: true,
      token_type: 'Bearer',
      sub: 'agent:agent-1',
    })
    expect(service.introspectCommandToken).toHaveBeenCalledWith('command-token')

    const bodyOnlyResponse = await app.request('/api/space-apps/commands/introspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'command-token' }),
    })
    expect(await bodyOnlyResponse.json()).toEqual({
      active: false,
      error: 'missing_command_token',
    })
    expect(service.introspectCommandToken).toHaveBeenCalledTimes(1)

    const removedResponse = await app.request(
      '/api/servers/srv-1/space-apps/demo-desk/oauth/introspect',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer command-token' },
      },
    )
    expect(removedResponse.status).toBe(404)
  })

  it('lists Space Apps through an authenticated route', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([{ id: 'app-1', appKey: 'demo-desk' }]),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/space-apps', {
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 'app-1', appKey: 'demo-desk' }])
    expect(service.list).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      expect.objectContaining({ locale: undefined }),
    )
  })

  it('lists lightweight Space App summaries when requested', async () => {
    const service = {
      listSummaries: vi
        .fn()
        .mockResolvedValue([
          { id: 'app-1', appKey: 'demo-desk', name: 'Demo Desk', iconUrl: null },
        ]),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/space-apps?summary=1', {
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: 'app-1', appKey: 'demo-desk', name: 'Demo Desk', iconUrl: null },
    ])
    expect(service.listSummaries).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      expect.objectContaining({ locale: undefined }),
    )
  })

  it('lists localized host-rendered widgets without exposing app routing details', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([
        {
          id: 'app-1',
          appKey: 'travel',
          name: 'Travel',
          iconUrl: 'https://travel.example/icon.svg',
          manifest: {
            widgets: [
              {
                key: 'currency',
                title: 'Currency rate',
                category: 'finance',
                i18n: { 'zh-CN': { $title: '实时汇率' } },
                size: { default: { widthCells: 6, heightCells: 4 } },
                data: { command: 'travel.currencyWidget' },
                view: { type: 'text', value: { path: 'summary' } },
              },
            ],
          },
        },
      ]),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/widgets', {
      headers: { Authorization: 'Bearer access-token', 'Accept-Language': 'zh-CN' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        sourceId: 'travel:currency',
        provider: { id: 'travel', name: 'Travel', iconUrl: 'https://travel.example/icon.svg' },
        definition: expect.objectContaining({ title: '实时汇率', category: 'finance' }),
      }),
    ])
  })

  it('validates widget options and forwards only the declared read command', async () => {
    const definition = {
      key: 'currency',
      title: 'Currency rate',
      size: { default: { widthCells: 6, heightCells: 4 } },
      options: [
        {
          key: 'base',
          type: 'select',
          label: 'Base',
          defaultValue: 'USD',
          choices: [
            { value: 'USD', label: 'USD' },
            { value: 'EUR', label: 'EUR' },
          ],
        },
      ],
      data: { command: 'travel.currencyWidget' },
      view: { type: 'text', value: { path: 'summary' } },
    }
    const service = {
      get: vi.fn().mockResolvedValue({
        appKey: 'travel',
        manifest: { widgets: [definition] },
      }),
      callCommand: vi.fn().mockResolvedValue({
        ok: true,
        data: { summary: '1 EUR = 1.17 USD' },
      }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/widgets/travel%3Acurrency/data', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: { base: 'EUR' } }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        sourceId: 'travel:currency',
        data: { summary: '1 EUR = 1.17 USD' },
      }),
    )
    expect(service.callCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        appKey: 'travel',
        commandName: 'travel.currencyWidget',
        body: { input: { base: 'EUR' } },
      }),
    )
  })

  it('discovers a Space App manifest through an authenticated admin route', async () => {
    const service = {
      discover: vi.fn().mockResolvedValue({
        manifest: { appKey: 'demo-desk', name: 'Demo Desk' },
        installed: null,
        permissions: [],
      }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/space-apps/discover', {
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

    expect(response.status).toBe(200)
    expect(service.discover).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      expect.objectContaining({ manifest: expect.objectContaining({ appKey: 'demo-desk' }) }),
    )
  })

  it('rejects command manifests without gateway ingress', async () => {
    const service = {
      discover: vi.fn(),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/space-apps/discover', {
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
              path: '/.shadow/commands/tickets.list',
              permission: 'demo.tickets:read',
              action: 'read',
              dataClass: 'server-private',
            },
          ],
        },
      }),
    })

    expect(response.status).toBe(400)
    expect(service.discover).not.toHaveBeenCalled()
  })

  it('returns launch metadata from the service', async () => {
    const service = {
      createLaunch: vi.fn().mockResolvedValue({
        serverId: 'srv-1',
        spaceAppId: 'app-1',
        appKey: 'demo-desk',
        iframeEntry: 'http://localhost:4199/shadow/server',
        allowedOrigins: ['http://localhost:4199'],
        launchToken: 'sat_v1.body.sig',
        eventStreamPath: '/api/servers/srv-1/space-apps/demo-desk/events',
        expiresIn: 600,
      }),
    }
    const app = createTestApp(service)

    const response = await app.request('/api/servers/srv-1/space-apps/demo-desk/launch', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      appKey: 'demo-desk',
      eventStreamPath: '/api/servers/srv-1/space-apps/demo-desk/events',
    })
  })

  it('authenticates event streams with a bearer credential instead of a query token', async () => {
    const unsubscribe = vi.fn()
    const service = {
      getEventStreamContext: vi.fn().mockResolvedValue({
        app: {
          id: 'app-1',
          serverId: 'srv-1',
          appKey: 'demo-desk',
          allowedOrigins: ['https://demo.example.com'],
        },
      }),
    }
    const app = createTestApp(service, {
      spaceAppEventBus: { subscribe: vi.fn().mockReturnValue(unsubscribe) },
    })
    const controller = new AbortController()
    const response = await app.request(
      '/api/servers/srv-1/space-apps/demo-desk/events?token=query-token-must-be-ignored',
      {
        headers: { Authorization: 'Bearer launch-token' },
        signal: controller.signal,
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(service.getEventStreamContext).toHaveBeenCalledWith('srv-1', 'demo-desk', 'launch-token')
    const reader = response.body?.getReader()
    const firstChunk = await reader?.read()
    expect(new TextDecoder().decode(firstChunk?.value)).toContain('space_app.events.ready')
    await reader?.cancel()
    controller.abort()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('serves launch-scoped channels and messages with bearer authentication', async () => {
    const service = {
      listLaunchChannels: vi
        .fn()
        .mockResolvedValue([{ id: 'channel-1', name: 'Trip', isPrivate: true }]),
      getLaunchMessage: vi.fn().mockResolvedValue({
        id: 'message-1',
        channelId: 'channel-1',
        content: 'Task status',
      }),
    }
    const app = createTestApp(service)

    const channelsResponse = await app.request(
      '/api/servers/srv-1/space-apps/demo-desk/launch/channels',
      { headers: { Authorization: 'Bearer launch-token' } },
    )
    expect(channelsResponse.status).toBe(200)
    expect(await channelsResponse.json()).toEqual({
      channels: [{ id: 'channel-1', name: 'Trip', isPrivate: true }],
    })
    expect(service.listLaunchChannels).toHaveBeenCalledWith('srv-1', 'demo-desk', 'launch-token')

    const messageResponse = await app.request(
      '/api/servers/srv-1/space-apps/demo-desk/launch/messages/message-1',
      { headers: { Authorization: 'Bearer launch-token' } },
    )
    expect(messageResponse.status).toBe(200)
    expect(await messageResponse.json()).toMatchObject({ id: 'message-1' })
    expect(service.getLaunchMessage).toHaveBeenCalledWith(
      'srv-1',
      'demo-desk',
      'launch-token',
      'message-1',
    )
  })

  it('validates launch channel and poll mutations before reaching the service', async () => {
    const service = {
      ensureLaunchChannel: vi
        .fn()
        .mockResolvedValue({ channelId: 'channel-1', created: true, name: 'Trip' }),
      createLaunchPoll: vi
        .fn()
        .mockResolvedValue({ channelId: 'channel-1', messageId: 'message-1' }),
    }
    const app = createTestApp(service)
    const headers = {
      Authorization: 'Bearer launch-token',
      'Content-Type': 'application/json',
    }

    const channelResponse = await app.request(
      '/api/servers/srv-1/space-apps/demo-desk/launch/channels/ensure',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ dedupeKey: 'trip:1', name: 'Trip' }),
      },
    )
    expect(channelResponse.status).toBe(200)
    expect(service.ensureLaunchChannel).toHaveBeenCalledWith(
      'srv-1',
      'demo-desk',
      'launch-token',
      expect.objectContaining({ dedupeKey: 'trip:1', isPrivate: true }),
    )

    const pollResponse = await app.request('/api/servers/srv-1/space-apps/demo-desk/launch/polls', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channelId: '11111111-1111-4111-8111-111111111111',
        question: 'Where next?',
        answers: [{ text: 'Paris' }, { text: 'Kyoto' }],
      }),
    })
    expect(pollResponse.status).toBe(201)
    expect(service.createLaunchPoll).toHaveBeenCalledWith(
      'srv-1',
      'demo-desk',
      'launch-token',
      expect.objectContaining({ allowMultiselect: false, durationHours: 24 }),
    )
  })

  it('lists catalog apps and installs one through authenticated routes', async () => {
    const service = {
      listCatalog: vi.fn().mockResolvedValue([{ id: 'catalog-1', appKey: 'demo-desk' }]),
      installFromCatalog: vi.fn().mockResolvedValue({ id: 'app-1', appKey: 'demo-desk' }),
    }
    const app = createTestApp(service)

    const listResponse = await app.request('/api/servers/srv-1/space-apps/catalog', {
      headers: { Authorization: 'Bearer access-token' },
    })
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual([{ id: 'catalog-1', appKey: 'demo-desk' }])

    const installResponse = await app.request(
      '/api/servers/srv-1/space-apps/catalog/catalog-1/install',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    )
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

    const response = await app.request(
      '/api/servers/srv-1/space-apps/demo-desk/commands/tickets.list',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: { limit: 5 } }),
      },
    )

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

    const response = await app.request(
      '/api/servers/srv-1/space-apps/demo-desk/commands/tickets.list',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: { limit: 5 }, channelId: null, task: null }),
      },
    )

    expect(response.status).toBe(200)
    const call = service.callCommand.mock.calls[0]?.[0] as {
      body: { input?: unknown; channelId?: string; task?: unknown }
    }
    expect(call.body.input).toEqual({ limit: 5 })
    expect(call.body.channelId).toBeUndefined()
    expect(call.body.task).toBeUndefined()
  })
})
