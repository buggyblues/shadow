import { BUDDY_INBOX_DELIVERY_PERMISSION } from '@shadowob/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppIntegrationService } from '../src/services/app-integration.service'
import type { ServerAppManifestInput } from '../src/validators/app-integration.schema'

const manifest: ServerAppManifestInput = {
  schemaVersion: 'shadow.app/1',
  appKey: 'demo-desk',
  name: 'Demo Desk',
  iconUrl: 'http://localhost:4199/assets/icon.svg',
  marketplace: {
    tagline: 'Tickets for every server.',
    categories: ['Productivity', 'Support'],
    supportedLanguages: ['English (US)', '简体中文'],
    coverImageUrl: 'http://localhost:4199/assets/cover.png',
    links: [{ label: 'Privacy', url: 'http://localhost:4199/privacy', type: 'privacy' }],
  },
  version: '1.0.0',
  updatedAt: '2026-05-20T00:00:00.000Z',
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
    manifestVersion: manifest.version,
    manifestUpdatedAt: new Date(manifest.updatedAt!),
    manifestFetchedAt: new Date(),
    manifestHash: null,
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
      listSummariesByServer: vi.fn().mockResolvedValue([
        {
          id: 'app-1',
          serverId: 'srv-1',
          appKey: 'demo-desk',
          name: 'Demo Desk',
          iconUrl: manifest.iconUrl,
          manifest,
          status: 'active',
        },
      ]),
      findById: vi.fn().mockResolvedValue(appRow),
      findByServerAndKey: vi.fn().mockResolvedValue(appRow),
      countInstallationsByAppKeys: vi.fn().mockResolvedValue([{ appKey: 'demo-desk', count: 3 }]),
      listBuddyGrants: vi.fn().mockResolvedValue([]),
      findBuddyGrant: vi.fn().mockResolvedValue({
        id: 'grant-1',
        permissions: ['demo.tickets:read', BUDDY_INBOX_DELIVERY_PERMISSION],
        approvalMode: 'none',
        expiresAt: null,
      }),
      upsertBuddyGrant: vi.fn().mockResolvedValue({ id: 'grant-1' }),
      updateAccessPolicy: vi.fn().mockImplementation(async (_serverAppId, data) => ({
        ...appRow,
        defaultPermissions: data.defaultPermissions,
        defaultApprovalMode: data.defaultApprovalMode ?? 'none',
      })),
      updateManifest: vi.fn().mockImplementation(async (_serverAppId, data) => ({
        ...appRow,
        ...data,
        manifestUrl: data.manifestUrl ?? appRow.manifestUrl,
        defaultPermissions: appRow.defaultPermissions,
        defaultApprovalMode: appRow.defaultApprovalMode,
        updatedAt: new Date(),
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
          manifestUrl: null,
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
      findLatestByAppKey: vi.fn().mockResolvedValue(appRow),
      upsertCatalogEntry: vi.fn().mockImplementation(async (data) => ({
        id: 'catalog-1',
        appKey: data.appKey,
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        manifestUrl: data.manifestUrl ?? null,
        manifest: data.manifest,
        status: data.status ?? 'active',
        createdByUserId: data.createdByUserId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updateCatalogEntryManifest: vi.fn().mockImplementation(async (_catalogEntryId, data) => ({
        id: 'catalog-1',
        appKey: data.manifest.appKey,
        name: data.name,
        description: data.description,
        iconUrl: data.iconUrl,
        manifestUrl: data.manifestUrl,
        manifest: data.manifest,
        status: 'active',
        createdByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      deleteCatalogEntryById: vi.fn(),
    },
    agentDao: {
      findById: vi.fn().mockResolvedValue({ id: 'agent-1', userId: 'bot-1', ownerId: 'user-1' }),
      findByUserId: vi.fn().mockResolvedValue({ id: 'agent-1', userId: 'bot-1' }),
    },
    channelDao: {
      findById: vi.fn().mockResolvedValue({
        id: 'channel-1',
        serverId: 'srv-1',
        name: 'general',
      }),
      findByServerId: vi.fn().mockResolvedValue([
        {
          id: 'channel-1',
          serverId: 'srv-1',
          name: 'general',
        },
      ]),
    },
    messageDao: {
      findByChannelId: vi.fn().mockResolvedValue({ messages: [] }),
    },
    userDao: {
      findById: vi.fn().mockResolvedValue({
        id: 'bot-1',
        username: 'demo-buddy',
        displayName: 'Demo Buddy',
        avatarUrl: '/shadow/uploads/buddy.png',
      }),
    },
    buddyInboxService: {
      enqueueTaskForAgent: vi.fn().mockResolvedValue({
        id: 'message-1',
        channelId: 'inbox-1',
        metadata: { cards: [{ kind: 'task', id: 'task-card-1' }] },
      }),
      assertTaskCommandAccess: vi.fn().mockResolvedValue({
        task: {
          messageId: 'message-1',
          cardId: 'task-card-1',
          channelId: 'inbox-1',
          scopes: ['task:read', 'task:write'],
        },
      }),
    },
    messageService: {
      send: vi.fn().mockResolvedValue({
        id: 'posted-message-1',
        channelId: 'channel-1',
        content: 'Posted',
        metadata: null,
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
      getMembers: vi.fn().mockResolvedValue([]),
    },
    policyService: {
      requireServerRole: vi.fn().mockResolvedValue({ role: 'admin' }),
      requireServerMember: vi.fn().mockResolvedValue({ role: 'member' }),
    },
    safeHttpClient: {
      fetch: vi.fn(),
    },
    io: {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
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

  it('lists official app directory entries with marketplace metadata', async () => {
    const { service } = createService()

    const result = await service.listDiscoverCatalog({ q: 'support' })

    expect(result).toMatchObject({
      total: 1,
      hasMore: false,
      apps: [
        expect.objectContaining({
          appKey: 'demo-desk',
          tagline: 'Tickets for every server.',
          categories: ['Productivity', 'Support'],
          supportedLanguages: ['English (US)', '简体中文'],
          coverImageUrl: 'http://localhost:4199/assets/cover.png',
          serverCount: 3,
          commandCount: 2,
          skillCount: 1,
        }),
      ],
    })
  })

  it('refreshes official app directory entries from manifest URLs before listing', async () => {
    const staleManifest: ServerAppManifestInput = {
      ...manifest,
      marketplace: {
        ...manifest.marketplace,
        tagline: 'Legacy listing',
        categories: ['Legacy'],
        coverImageUrl: 'http://localhost:4199/assets/old-cover.png',
      },
    }
    const freshManifest: ServerAppManifestInput = {
      ...manifest,
      updatedAt: '2026-05-21T00:00:00.000Z',
      marketplace: {
        ...manifest.marketplace,
        tagline: 'Fresh app listing',
        categories: ['Games'],
        coverImageUrl: 'http://localhost:4199/assets/fresh-cover.png',
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(freshManifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService({
      appIntegrationDao: {
        ...createService().deps.appIntegrationDao,
        listCatalogEntries: vi.fn().mockResolvedValue([
          {
            id: 'catalog-1',
            appKey: 'demo-desk',
            name: 'Demo Desk',
            description: null,
            iconUrl: staleManifest.iconUrl,
            manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
            manifest: staleManifest,
            status: 'active',
            createdByUserId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    })

    const result = await service.listDiscoverCatalog({ q: 'fresh' })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/shadow-app.json', {
      redirect: 'manual',
    })
    expect(deps.appIntegrationDao.updateCatalogEntryManifest).toHaveBeenCalledWith(
      'catalog-1',
      expect.objectContaining({
        manifest: freshManifest,
        manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
      }),
    )
    expect(result.apps).toEqual([
      expect.objectContaining({
        tagline: 'Fresh app listing',
        categories: ['Games'],
        coverImageUrl: 'http://localhost:4199/assets/fresh-cover.png',
      }),
    ])
  })

  it('publishes an installed app into the official catalog', async () => {
    const freshManifest: ServerAppManifestInput = {
      ...manifest,
      marketplace: {
        ...manifest.marketplace,
        categories: ['Games'],
        coverImageUrl: 'http://localhost:4199/assets/fresh-cover.png',
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(freshManifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService()

    const result = await service.upsertCatalogEntry(
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      { sourceServerAppId: 'app-1', status: 'active' },
    )

    expect(deps.appIntegrationDao.findById).toHaveBeenCalledWith('app-1')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/shadow-app.json', {
      redirect: 'manual',
    })
    expect(deps.appIntegrationDao.updateManifest).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
        manifest: freshManifest,
      }),
    )
    expect(deps.appIntegrationDao.upsertCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        appKey: 'demo-desk',
        manifest: freshManifest,
        manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
        status: 'active',
        createdByUserId: 'user-1',
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        appKey: 'demo-desk',
        categories: ['Games'],
        coverImageUrl: 'http://localhost:4199/assets/fresh-cover.png',
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

  it('allows grants for the platform Inbox delivery permission', async () => {
    const { service, deps } = createService()

    await service.grant(
      'srv-1',
      'demo-desk',
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      {
        buddyAgentId: 'agent-1',
        permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
        approvalMode: 'none',
      },
    )

    expect(deps.appIntegrationDao.upsertBuddyGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        serverAppId: 'app-1',
        buddyAgentId: 'agent-1',
        permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
      }),
    )
  })

  it('merges Buddy grant permissions without dropping existing app permissions', async () => {
    const expiresAt = new Date(Date.now() + 60_000)
    const base = createService()
    const { service, deps } = createService({
      appIntegrationDao: {
        ...base.deps.appIntegrationDao,
        findBuddyGrant: vi.fn().mockResolvedValue({
          id: 'grant-1',
          permissions: ['demo.tickets:read'],
          resourceRules: { scope: 'existing' },
          approvalMode: 'once',
          expiresAt,
        }),
      },
    })

    await service.grant(
      'srv-1',
      'demo-desk',
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      {
        buddyAgentId: 'agent-1',
        permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
        mergePermissions: true,
      },
    )

    expect(deps.appIntegrationDao.upsertBuddyGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        serverAppId: 'app-1',
        buddyAgentId: 'agent-1',
        permissions: ['demo.tickets:read', BUDDY_INBOX_DELIVERY_PERMISSION],
        resourceRules: { scope: 'existing' },
        approvalMode: 'once',
        expiresAt,
      }),
    )
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

  it('refreshes an installed manifest URL before command lookup', async () => {
    const freshManifest: ServerAppManifestInput = {
      ...manifest,
      version: '1.1.0',
      updatedAt: '2026-05-21T00:00:00.000Z',
      commands: [
        ...manifest.commands,
        {
          name: 'tickets.stats',
          path: '/api/shadow/commands/tickets.stats',
          permission: 'demo.tickets:read',
          action: 'read',
          dataClass: 'server-private',
        },
      ],
    }
    const fetchMock = vi.fn().mockImplementation(async (url: URL | string) => {
      const value = url.toString()
      if (value === 'http://localhost:4199/.well-known/shadow-app.json') {
        return new Response(JSON.stringify(freshManifest), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, result: { open: 2, closed: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const staleApp = {
      ...createService().appRow,
      manifestUrl: 'http://localhost:4199/.well-known/shadow-app.json',
      manifest,
      manifestVersion: '1.0.0',
      manifestUpdatedAt: new Date('2026-05-20T00:00:00.000Z'),
      manifestFetchedAt: new Date('2026-05-20T00:00:00.000Z'),
      manifestHash: 'stale',
    }
    const appIntegrationDao = {
      ...createService().deps.appIntegrationDao,
      findByServerAndKey: vi.fn().mockResolvedValue(staleApp),
      updateManifest: vi.fn().mockImplementation(async (_serverAppId, data) => ({
        ...staleApp,
        ...data,
        manifestUrl: staleApp.manifestUrl,
        defaultPermissions: staleApp.defaultPermissions,
        defaultApprovalMode: staleApp.defaultApprovalMode,
      })),
    }
    const { service } = createService({ appIntegrationDao })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.stats',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
    })

    expect(result).toEqual({ ok: true, result: { open: 2, closed: 1 } })
    expect(appIntegrationDao.updateManifest).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        manifest: expect.objectContaining({ version: '1.1.0' }),
        manifestVersion: '1.1.0',
        manifestUpdatedAt: new Date('2026-05-21T00:00:00.000Z'),
      }),
    )
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

  it('injects server Buddy directory into app command context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { tickets: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService()
    deps.serverDao.getMembers.mockResolvedValue([
      {
        id: 'member-1',
        userId: 'buddy-user-1',
        user: {
          id: 'buddy-user-1',
          username: 'brandscout',
          displayName: 'BrandScout',
          avatarUrl: '/shadow/uploads/brandscout.png',
          status: 'online',
        },
        agent: {
          id: 'agent-brandscout',
          ownerId: 'owner-1',
          status: 'running',
          config: { description: 'Researches source material and uploads workspace files.' },
          totalOnlineSeconds: 12,
        },
      },
      {
        id: 'member-2',
        userId: 'human-user-1',
        user: {
          id: 'human-user-1',
          username: 'human',
          displayName: 'Human Member',
          avatarUrl: null,
          status: 'online',
        },
        agent: null,
      },
    ])

    await service.callCommand({
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

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.context.resources.buddies).toEqual([
      {
        agentId: 'agent-brandscout',
        userId: 'buddy-user-1',
        username: 'brandscout',
        displayName: 'BrandScout',
        description: 'Researches source material and uploads workspace files.',
        avatarUrl: '/api/media/signed/avatar-token',
        ownerId: 'owner-1',
        status: 'online',
        agentStatus: 'running',
      },
    ])

    const headers = init.headers as Record<string, string>
    const introspection = await service.introspectCommandToken(
      'srv-1',
      'demo-desk',
      headers.Authorization.replace(/^Bearer /, ''),
    )
    expect(introspection.shadow.resources.buddies).toEqual(body.context.resources.buddies)
  })

  it('respects a Buddy grant approval override when the command defaults to approval', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { ticket: { id: 'ticket-1' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const base = createService()
    const manifestWithCommandApproval: ServerAppManifestInput = {
      ...manifest,
      commands: manifest.commands.map((command) =>
        command.name === 'tickets.create'
          ? { ...command, approvalMode: 'first_time' as const }
          : command,
      ),
    }
    const { service, deps } = createService({
      appIntegrationDao: {
        ...base.deps.appIntegrationDao,
        findByServerAndKey: vi.fn().mockResolvedValue({
          ...base.appRow,
          manifest: manifestWithCommandApproval,
        }),
        findBuddyGrant: vi.fn().mockResolvedValue({
          id: 'grant-1',
          permissions: ['demo.tickets:write'],
          approvalMode: 'none',
          expiresAt: null,
        }),
      },
    })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.create',
      actor: {
        kind: 'agent',
        userId: 'bot-1',
        agentId: 'agent-1',
        ownerId: 'user-1',
        scopes: [],
      },
      body: { input: { title: 'Need help' } },
    })

    expect(result).toEqual({ ok: true, result: { ticket: { id: 'ticket-1' } } })
    expect(deps.appIntegrationDao.findCommandConsent).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:4199/api/shadow/commands/tickets.create'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('delivers Server App channel message outbox cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ticket: { id: 'ticket-1' },
            shadow: {
              protocol: 'shadow.app/1',
              outbox: {
                channelMessages: [
                  {
                    channelName: 'general',
                    content: 'Next card is ready.',
                    idempotencyKey: 'demo:next-card',
                    metadata: {
                      cards: [
                        {
                          kind: 'server_app',
                          appKey: 'demo-desk',
                          title: 'Open ticket',
                          action: { mode: 'open_app', path: '/tickets/ticket-1' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
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

    expect(deps.messageService.send).toHaveBeenCalledWith('channel-1', 'bot-1', {
      content: 'Next card is ready.',
      metadata: {
        cards: [
          {
            kind: 'server_app',
            appKey: 'demo-desk',
            title: 'Open ticket',
            action: { mode: 'open_app', path: '/tickets/ticket-1' },
          },
        ],
        custom: {
          serverAppChannelMessage: {
            idempotencyKey: 'demo:next-card',
          },
        },
      },
    })
    expect(result).toMatchObject({
      result: {
        shadow: {
          outbox: {
            channelMessageDeliveries: [
              {
                channelId: 'channel-1',
                messageId: 'posted-message-1',
                idempotencyKey: 'demo:next-card',
              },
            ],
          },
        },
      },
    })
  })

  it('delivers Server App Inbox task outbox cards with an active Buddy grant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ticket: { id: 'ticket-1' },
            shadow: {
              protocol: 'shadow.app/1',
              outbox: {
                inboxTasks: [
                  {
                    agentId: 'agent-1',
                    title: 'Review launch ticket',
                    body: 'Inspect the generated launch ticket.',
                    idempotencyKey: 'demo:ticket-1:review',
                    tags: ['review', { label: 'Launch', color: '#60a5fa' }],
                    resource: { kind: 'ticket', id: 'ticket-1', label: 'Launch ticket' },
                    requirements: {
                      capabilities: ['workspace.write'],
                      tools: [{ kind: 'shadow-app-command', name: 'tickets.create' }],
                    },
                    outputContract: {
                      expectedArtifacts: [{ kind: 'workspace.reference', required: false }],
                      submitCommand: { appKey: 'demo-desk', command: 'tickets.create' },
                    },
                    privacy: { dataClass: 'server-private', redactionRequired: true },
                    data: { ticketId: 'ticket-1' },
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const base = createService()
    const { service, deps } = createService({
      serverDao: {
        ...base.deps.serverDao,
        getMember: vi.fn().mockResolvedValue({ role: 'member' }),
      },
    })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
    })

    expect(deps.appIntegrationDao.findBuddyGrant).toHaveBeenCalledWith('app-1', 'agent-1')
    expect(deps.buddyInboxService.enqueueTaskForAgent).toHaveBeenCalledWith(
      'srv-1',
      'agent-1',
      expect.objectContaining({
        title: 'Review launch ticket',
        idempotencyKey: 'demo:ticket-1:review',
        tags: ['review', { label: 'Launch', color: '#60a5fa' }],
        requirements: {
          capabilities: ['workspace.write'],
          tools: [{ kind: 'shadow-app-command', name: 'tickets.create' }],
        },
        outputContract: {
          expectedArtifacts: [{ kind: 'workspace.reference', required: false }],
          submitCommand: { appKey: 'demo-desk', command: 'tickets.create' },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
        source: expect.objectContaining({
          kind: 'server_app',
          appKey: 'demo-desk',
          command: 'tickets.list',
          resource: { kind: 'ticket', id: 'ticket-1', label: 'Launch ticket' },
        }),
        data: expect.objectContaining({
          ticketId: 'ticket-1',
          serverApp: expect.objectContaining({ appKey: 'demo-desk' }),
        }),
      }),
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
    expect(result).toMatchObject({
      result: {
        shadow: {
          outbox: {
            deliveries: [
              {
                agentId: 'agent-1',
                agentUserId: 'bot-1',
                channelId: 'inbox-1',
                messageId: 'message-1',
                cardId: 'task-card-1',
                idempotencyKey: 'demo:ticket-1:review',
              },
            ],
          },
        },
      },
    })
  })

  it('records optional Inbox task outbox errors when the Buddy grant is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            shadow: {
              protocol: 'shadow.app/1',
              outbox: {
                inboxTasks: [{ agentId: 'agent-1', title: 'Optional review' }],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const base = createService()
    const { service, deps } = createService({
      appIntegrationDao: {
        ...base.deps.appIntegrationDao,
        findBuddyGrant: vi.fn().mockResolvedValue(null),
      },
      serverDao: {
        ...base.deps.serverDao,
        getMember: vi.fn().mockResolvedValue({ role: 'member' }),
      },
    })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
    })

    expect(deps.buddyInboxService.enqueueTaskForAgent).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      result: {
        shadow: {
          outbox: {
            errors: [
              {
                title: 'Optional review',
                agentId: 'agent-1',
                error: 'Server App is not authorized to deliver Inbox tasks to this Buddy',
              },
            ],
          },
        },
      },
    })
  })

  it('rejects required Inbox task outbox delivery without the platform grant permission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            shadow: {
              protocol: 'shadow.app/1',
              outbox: {
                inboxTasks: [{ agentId: 'agent-1', title: 'Required review', required: true }],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const base = createService()
    const { service, deps } = createService({
      appIntegrationDao: {
        ...base.deps.appIntegrationDao,
        findBuddyGrant: vi.fn().mockResolvedValue({
          id: 'grant-1',
          permissions: ['demo.tickets:read'],
          approvalMode: 'none',
          expiresAt: null,
        }),
      },
      serverDao: {
        ...base.deps.serverDao,
        getMember: vi.fn().mockResolvedValue({ role: 'member' }),
      },
    })

    await expect(
      service.callCommand({
        serverIdOrSlug: 'srv-1',
        appKey: 'demo-desk',
        commandName: 'tickets.list',
        actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
        body: { input: {} },
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'SERVER_APP_BUDDY_GRANT_PERMISSION_REQUIRED',
      params: {
        grant: {
          serverId: 'srv-1',
          serverAppId: 'app-1',
          appKey: 'demo-desk',
          appName: 'Demo Desk',
          commandName: 'tickets.list',
          buddyAgentId: 'agent-1',
          permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
          reason: 'permission',
        },
      },
    })
    expect(deps.buddyInboxService.enqueueTaskForAgent).not.toHaveBeenCalled()
  })

  it('deduplicates Server App channel messages by idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ticket: { id: 'ticket-1' },
            shadow: {
              protocol: 'shadow.app/1',
              outbox: {
                channelMessages: [
                  {
                    channelName: 'general',
                    content: 'Next card is ready.',
                    idempotencyKey: 'demo:next-card',
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService({
      messageDao: {
        findByChannelId: vi.fn().mockResolvedValue({
          messages: [
            {
              id: 'existing-message-1',
              channelId: 'channel-1',
              metadata: {
                custom: {
                  serverAppChannelMessage: {
                    idempotencyKey: 'demo:next-card',
                  },
                },
              },
            },
          ],
        }),
      },
    })

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

    expect(deps.messageService.send).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      result: {
        shadow: {
          outbox: {
            channelMessageDeliveries: [
              {
                channelId: 'channel-1',
                messageId: 'existing-message-1',
                idempotencyKey: 'demo:next-card',
              },
            ],
          },
        },
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

  it('uses manifest display names for server app summaries', async () => {
    const { service, deps } = createService()
    deps.appIntegrationDao.listSummariesByServer.mockResolvedValueOnce([
      {
        id: 'app-skills',
        serverId: 'srv-1',
        appKey: 'skills',
        name: 'skills',
        iconUrl: manifest.iconUrl,
        manifest: { ...manifest, appKey: 'skills', name: 'Skills' },
        status: 'active',
      },
    ])

    const summaries = await service.listSummaries('srv-1', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    expect(summaries[0]).toMatchObject({
      appKey: 'skills',
      name: 'Skills',
    })
  })

  it('localizes catalog metadata from manifest i18n', async () => {
    const skillsManifest: ServerAppManifestInput = {
      ...manifest,
      appKey: 'skills',
      name: 'Skills',
      description: 'Skills default description.',
      marketplace: {
        ...manifest.marketplace,
        tagline: 'Skills default tagline.',
        summary: 'Skills default summary.',
        categories: ['Productivity'],
        gallery: [
          {
            url: 'http://localhost:4199/assets/cover.png',
            type: 'image',
            alt: 'skills cover',
          },
        ],
        links: [{ label: 'Home', url: 'http://localhost:4199/home', type: 'website' }],
        publisher: { name: 'Shadow' },
      },
      i18n: {
        'zh-CN': {
          name: '技能库',
          description: '服务器技能库。',
          marketplace: {
            tagline: '复用工作技能。',
            summary: '沉淀、发现和安装可复用技能。',
            categories: ['技能'],
            gallery: [{ alt: '技能封面' }],
            links: [{ label: '主页' }],
            publisher: { name: '技能团队' },
          },
        },
      },
    }
    const row = {
      id: 'catalog-skills',
      appKey: 'skills',
      name: 'skills',
      description: null,
      iconUrl: skillsManifest.iconUrl,
      manifestUrl: null,
      manifest: skillsManifest,
      status: 'active',
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { service, deps } = createService()
    deps.appIntegrationDao.listCatalogEntries.mockResolvedValueOnce([row])

    const localized = await service.listDiscoverCatalog({ locale: 'zh-CN' })

    expect(localized.apps[0]).toMatchObject({
      appKey: 'skills',
      name: '技能库',
      description: '服务器技能库。',
      tagline: '复用工作技能。',
      summary: '沉淀、发现和安装可复用技能。',
      categories: ['技能'],
      publisher: { name: '技能团队', websiteUrl: null },
    })
    expect(localized.apps[0]?.gallery[0]?.alt).toBe('技能封面')
    expect(localized.apps[0]?.links[0]?.label).toBe('主页')

    deps.appIntegrationDao.listCatalogEntries.mockResolvedValueOnce([row])
    const fallback = await service.listDiscoverCatalog()

    expect(fallback.apps[0]?.name).toBe('Skills')
    expect(fallback.apps[0]?.tagline).toBe('Skills default tagline.')
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
