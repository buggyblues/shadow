import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppIntegrationService } from '../src/services/app-integration.service'
import type { ServerAppManifestInput } from '../src/validators/app-integration.schema'

const manifest: ServerAppManifestInput = {
  schemaVersion: 'shadow.app/1',
  appKey: 'demo-desk',
  name: 'Demo Desk',
  iconUrl: 'http://localhost:4199/assets/icon.svg',
  api: {
    baseUrl: 'http://localhost:4199',
    auth: { type: 'oauth2-bearer' },
  },
  iframe: {
    entry: 'http://localhost:4199/shadow/server',
    allowedOrigins: ['http://localhost:4199'],
  },
  commands: [
    {
      name: 'tickets.list',
      path: '/api/shadow/commands/tickets.list',
      permission: 'demo.tickets:read',
      action: 'read',
      dataClass: 'server-private',
    },
    {
      name: 'tickets.create',
      path: '/api/shadow/commands/tickets.create',
      permission: 'demo.tickets:write',
      action: 'write',
      dataClass: 'server-private',
      inputSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          priority: { enum: ['low', 'normal', 'high'] },
        },
      },
    },
  ],
  skills: [
    {
      name: 'demo-desk-ticket-ops',
      description: 'Use when working with tickets.',
    },
  ],
}

function createService(overrides: Record<string, unknown> = {}) {
  const commandTokens: any[] = []
  const commandConsents: any[] = []
  const appRow = {
    id: 'app-1',
    serverId: 'srv-1',
    appKey: 'demo-desk',
    name: 'Demo Desk',
    description: null,
    iconUrl: manifest.iconUrl,
    manifestUrl: null,
    manifest,
    iframeEntry: manifest.iframe!.entry,
    allowedOrigins: manifest.iframe!.allowedOrigins,
    apiBaseUrl: manifest.api.baseUrl,
    defaultPermissions: ['demo.tickets:read'],
    defaultApprovalMode: 'none',
    status: 'active',
    installedByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const deps = {
    appIntegrationDao: {
      upsert: vi.fn().mockResolvedValue(appRow),
      listByServer: vi.fn().mockResolvedValue([appRow]),
      findById: vi.fn().mockResolvedValue(appRow),
      findByServerAndKey: vi.fn().mockResolvedValue(appRow),
      listBuddyGrants: vi.fn().mockResolvedValue([]),
      findBuddyGrant: vi.fn().mockResolvedValue({
        id: 'grant-1',
        permissions: ['demo.tickets:read'],
        approvalMode: 'none',
        expiresAt: null,
      }),
      upsertBuddyGrant: vi.fn().mockResolvedValue({ id: 'grant-1' }),
      updateAccessPolicy: vi.fn().mockImplementation(async (_serverAppId, data) => ({
        ...appRow,
        defaultPermissions: data.defaultPermissions,
        defaultApprovalMode: data.defaultApprovalMode ?? 'none',
      })),
      upsertCommandConsent: vi.fn().mockImplementation(async (data) => {
        const existingIndex = commandConsents.findIndex(
          (consent) =>
            consent.serverAppId === data.serverAppId &&
            consent.command === data.command &&
            consent.subjectKind === data.subjectKind &&
            consent.subjectKey === data.subjectKey,
        )
        const row = {
          id: commandConsents[existingIndex]?.id ?? `consent-${commandConsents.length + 1}`,
          ...data,
          createdAt: commandConsents[existingIndex]?.createdAt ?? new Date(),
          updatedAt: new Date(),
          consumedAt: null,
        }
        if (existingIndex >= 0) commandConsents[existingIndex] = row
        else commandConsents.push(row)
        return row
      }),
      findCommandConsent: vi
        .fn()
        .mockImplementation(
          async (input) =>
            commandConsents.find(
              (consent) =>
                consent.serverAppId === input.serverAppId &&
                consent.command === input.command &&
                consent.subjectKind === input.subjectKind &&
                consent.subjectKey === input.subjectKey,
            ) ?? null,
        ),
      markCommandConsentConsumed: vi.fn().mockImplementation(async (id) => {
        const consent = commandConsents.find((item) => item.id === id)
        if (consent) consent.consumedAt = new Date()
      }),
      createCommandToken: vi.fn().mockImplementation(async (data) => {
        const row = { id: 'token-1', ...data, createdAt: new Date() }
        commandTokens.push(row)
        return row
      }),
      findCommandTokenByHash: vi
        .fn()
        .mockImplementation(
          async (tokenHash) => commandTokens.find((token) => token.tokenHash === tokenHash) ?? null,
        ),
      deleteByServerAndKey: vi.fn(),
      listCatalogEntries: vi.fn().mockResolvedValue([
        {
          id: 'catalog-1',
          appKey: 'demo-desk',
          name: 'Demo Desk',
          description: null,
          iconUrl: manifest.iconUrl,
          manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
          manifest,
          status: 'active',
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      findCatalogEntryById: vi.fn().mockResolvedValue({
        id: 'catalog-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
        description: null,
        iconUrl: manifest.iconUrl,
        manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
        manifest,
        status: 'active',
        createdByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findCatalogEntryByAppKey: vi.fn().mockResolvedValue(null),
      upsertCatalogEntry: vi.fn().mockResolvedValue({
        id: 'catalog-1',
        appKey: 'demo-desk',
        name: 'Demo Desk',
        description: null,
        iconUrl: manifest.iconUrl,
        manifestUrl: null,
        manifest,
        status: 'active',
        createdByUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      deleteCatalogEntryById: vi.fn(),
    },
    agentDao: {
      findById: vi.fn().mockResolvedValue({ id: 'agent-1', userId: 'bot-1', ownerId: 'user-1' }),
      findByUserId: vi.fn().mockResolvedValue({ id: 'agent-1', userId: 'bot-1' }),
    },
    userDao: {
      findById: vi.fn().mockResolvedValue({
        id: 'bot-1',
        username: 'demo-buddy',
        displayName: 'Demo Buddy',
        avatarUrl: '/shadow/uploads/buddy.png',
      }),
    },
    mediaService: {
      resolveMediaUrl: vi.fn().mockReturnValue('/api/media/signed/avatar-token'),
    },
    appIntegrationEventBus: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
    serverDao: {
      findBySlug: vi.fn().mockResolvedValue({ id: 'srv-1' }),
    },
    policyService: {
      requireServerRole: vi.fn().mockResolvedValue({ role: 'admin' }),
      requireServerMember: vi.fn().mockResolvedValue({ role: 'member' }),
    },
    safeHttpClient: {
      fetch: vi.fn(),
    },
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  }
  return { service: new AppIntegrationService(deps as never), deps, appRow }
}

describe('AppIntegrationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('installs an OAuth manifest without storing a shared secret', async () => {
    const { service, deps } = createService()

    const result = await service.install(
      'srv-1',
      {
        kind: 'user',
        userId: 'user-1',
        authMethod: 'jwt',
        scopes: [],
      },
      {
        manifest,
      },
    )

    expect(result.appKey).toBe('demo-desk')
    expect(deps.policyService.requireServerRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'srv-1',
      'admin',
    )
    expect(deps.appIntegrationDao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: 'srv-1',
        appKey: 'demo-desk',
        apiBaseUrl: 'http://localhost:4199',
        defaultPermissions: ['demo.tickets:read'],
        defaultApprovalMode: 'none',
      }),
    )
  })

  it('rejects grants for permissions not declared by the manifest', async () => {
    const { service } = createService()

    await expect(
      service.grant(
        'srv-1',
        'demo-desk',
        { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
        {
          buddyAgentId: 'agent-1',
          permissions: ['demo.unknown:write'],
          approvalMode: 'none',
        },
      ),
    ).rejects.toThrow('Unknown app permission')
  })

  it('lets a default-allowed member call a read command without a Buddy grant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { tickets: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService()

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
    })

    expect(result).toEqual({ ok: true, result: { tickets: [] } })
    expect(deps.appIntegrationDao.findBuddyGrant).not.toHaveBeenCalled()
  })

  it('requires approval for a non-default command and allows the confirmed command', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { ticket: { id: 'ticket-1' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService({
      appIntegrationDao: {
        ...createService().deps.appIntegrationDao,
        findBuddyGrant: vi.fn().mockResolvedValue(null),
      },
    })
    const actor = {
      kind: 'user' as const,
      userId: 'user-1',
      authMethod: 'jwt' as const,
      scopes: [],
    }

    await expect(
      service.callCommand({
        serverIdOrSlug: 'srv-1',
        appKey: 'demo-desk',
        commandName: 'tickets.create',
        actor,
        body: { input: { title: 'Need help' }, channelId: 'channel-1' },
      }),
    ).rejects.toMatchObject({
      status: 428,
      code: 'SERVER_APP_COMMAND_APPROVAL_REQUIRED',
      params: {
        approval: expect.objectContaining({
          appKey: 'demo-desk',
          commandName: 'tickets.create',
          permission: 'demo.tickets:write',
          subjectKind: 'user',
          channelId: 'channel-1',
        }),
      },
    })

    await service.approveCommandAccess('srv-1', 'demo-desk', actor, {
      commandName: 'tickets.create',
      remember: true,
    })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.create',
      actor,
      body: { input: { title: 'Need help' } },
    })

    expect(result).toEqual({ ok: true, result: { ticket: { id: 'ticket-1' } } })
    expect(deps.appIntegrationDao.upsertCommandConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tickets.create',
        subjectKind: 'user',
        subjectKey: 'user-1',
      }),
    )
  })

  it('lets a granted Buddy call a command through the app proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { tickets: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService()

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: {
        kind: 'agent',
        userId: 'bot-1',
        agentId: 'agent-1',
        ownerId: 'user-1',
        scopes: [],
      },
      body: { input: {} },
    })

    expect(result).toEqual({ ok: true, result: { tickets: [] } })
    expect(deps.appIntegrationEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'server_app.command.completed',
        appKey: 'demo-desk',
        command: 'tickets.list',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:4199/api/shadow/commands/tickets.list'),
      expect.objectContaining({ method: 'POST' }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Bearer /)

    const introspection = await service.introspectCommandToken(
      'srv-1',
      'demo-desk',
      headers.Authorization.replace(/^Bearer /, ''),
    )
    expect(introspection).toMatchObject({
      active: true,
      token_type: 'Bearer',
      client_id: 'demo-desk',
      shadow: {
        serverId: 'srv-1',
        serverAppId: 'app-1',
        appKey: 'demo-desk',
        command: 'tickets.list',
        actor: {
          kind: 'agent',
          userId: 'bot-1',
          buddyAgentId: 'agent-1',
          ownerId: 'user-1',
          profile: {
            id: 'bot-1',
            username: 'demo-buddy',
            displayName: 'Demo Buddy',
            avatarUrl: '/api/media/signed/avatar-token',
          },
        },
        permission: 'demo.tickets:read',
      },
    })
  })

  it('emits raw json-input guidance and progressive help for app skills', async () => {
    const { service } = createService()

    const result = await service.skills('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    expect(result.markdown).toContain('raw command input object')
    expect(result.markdown).toContain('The CLI wraps the HTTP request for you')
    expect(result.markdown).toContain('--help')
    expect(result.markdown).toContain('Do not call this App through curl')
    expect(result.markdown).toContain('demo-desk tickets.create')
    expect(result.markdown).not.toContain('"required":["title"]')
  })

  it('creates a scoped launch token for iframe event streams', async () => {
    const { service } = createService()

    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })
    const context = await service.getEventStreamContext('srv-1', 'demo-desk', launch.launchToken)

    expect(launch.eventStreamPath).toContain('/api/servers/srv-1/apps/demo-desk/events?token=')
    expect(context.app.id).toBe('app-1')
  })

  it('lists catalog entries with installed state for a server', async () => {
    const { service } = createService()

    const catalog = await service.listCatalog('srv-1', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    expect(catalog[0]).toMatchObject({
      id: 'catalog-1',
      appKey: 'demo-desk',
      installed: expect.objectContaining({ id: 'app-1' }),
    })
  })

  it('installs an app from a catalog entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService()

    await service.installFromCatalog(
      'srv-1',
      'catalog-1',
      {
        kind: 'user',
        userId: 'user-1',
        authMethod: 'jwt',
        scopes: [],
      },
      {},
    )

    expect(deps.appIntegrationDao.findCatalogEntryById).toHaveBeenCalledWith('catalog-1')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/shadow-app.json', {
      redirect: 'manual',
    })
    expect(deps.appIntegrationDao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ appKey: 'demo-desk', serverId: 'srv-1' }),
    )
  })

  it('refreshes catalog manifests from URL during install', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const staleManifest = {
      ...manifest,
      api: { ...manifest.api, auth: { type: 'hmac-sha256' } },
    }
    const { service, deps } = createService({
      appIntegrationDao: {
        ...createService().deps.appIntegrationDao,
        findCatalogEntryById: vi.fn().mockResolvedValue({
          id: 'catalog-1',
          appKey: 'demo-desk',
          name: 'Demo Desk',
          description: null,
          iconUrl: manifest.iconUrl,
          manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
          manifest: staleManifest,
          status: 'active',
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    })

    await service.installFromCatalog(
      'srv-1',
      'catalog-1',
      {
        kind: 'user',
        userId: 'user-1',
        authMethod: 'jwt',
        scopes: [],
      },
      {},
    )

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/shadow-app.json', {
      redirect: 'manual',
    })
    expect(deps.appIntegrationDao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        appKey: 'demo-desk',
        apiBaseUrl: 'http://localhost:4199',
        manifest: expect.objectContaining({
          api: expect.objectContaining({ auth: { type: 'oauth2-bearer' } }),
        }),
      }),
    )
  })
})
