import { BUDDY_INBOX_DELIVERY_PERMISSION } from '@shadowob/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpaceAppService } from '../src/services/space-app.service'
import type { SpaceAppManifestInput } from '../src/validators/space-app.schema'

const manifest: SpaceAppManifestInput = {
  schemaVersion: 'shadow.space-app/1',
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
  mobile: {
    navigation: {
      mode: 'immersive',
      capsule: {
        backgroundColor: '#111827',
        foregroundColor: '#ffffff',
        borderColor: 'rgba(255, 255, 255, 0.16)',
      },
    },
  },
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
    {
      name: 'tickets.create',
      ingress: {
        path: '/.shadow/commands/tickets.create',
        auth: 'shadow-command-jwt',
      },
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
    spaceAppDao: {
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
      updateAccessPolicy: vi.fn().mockImplementation(async (_spaceAppId, data) => ({
        ...appRow,
        defaultPermissions: data.defaultPermissions,
        defaultApprovalMode: data.defaultApprovalMode ?? 'none',
      })),
      updateManifest: vi.fn().mockImplementation(async (_spaceAppId, data) => ({
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
            consent.spaceAppId === data.spaceAppId &&
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
                consent.spaceAppId === input.spaceAppId &&
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
        manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
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
      enqueueTask: vi.fn().mockResolvedValue({
        id: 'message-1',
        channelId: 'channel-1',
        metadata: { cards: [{ kind: 'task', id: 'task-card-1' }] },
      }),
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
    channelService: {
      create: vi.fn().mockResolvedValue({
        id: 'app-channel-1',
        serverId: 'srv-1',
        name: 'trip-demo',
        kind: 'server',
        isPrivate: true,
      }),
      getChannelMembers: vi.fn().mockResolvedValue([{ userId: 'user-1' }]),
      addMember: vi.fn().mockResolvedValue(undefined),
      removeMember: vi.fn().mockResolvedValue(undefined),
      getByServerIdForUser: vi.fn().mockResolvedValue([
        {
          id: 'app-channel-1',
          name: 'trip-demo',
          type: 'text',
          topic: 'space-app:demo-desk:trip:demo',
          isPrivate: true,
          isArchived: false,
        },
      ]),
    },
    messageService: {
      send: vi.fn().mockResolvedValue({
        id: 'posted-message-1',
        channelId: 'channel-1',
        content: 'Posted',
        metadata: null,
      }),
      getById: vi.fn().mockResolvedValue({
        id: 'message-1',
        channelId: 'app-channel-1',
        content: 'Task status',
      }),
    },
    mediaService: {
      resolveAvatarUrl: vi.fn().mockReturnValue('/api/media/avatar/shadow/uploads/avatar.png'),
      resolveMediaUrl: vi.fn().mockReturnValue('/api/media/avatar/shadow/uploads/avatar.png'),
    },
    spaceAppEventBus: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
    serverDao: {
      findById: vi.fn().mockResolvedValue({
        id: 'srv-1',
        slug: 'shadow-plays',
        name: 'Shadow Plays',
      }),
      findBySlug: vi.fn().mockResolvedValue({ id: 'srv-1' }),
      getMembers: vi.fn().mockResolvedValue([
        { userId: 'user-1', user: { id: 'user-1', isBot: false } },
        { userId: 'bot-1', user: { id: 'bot-1', isBot: true } },
      ]),
    },
    notificationTriggerService: {
      dispatchMany: vi.fn().mockResolvedValue([]),
    },
    spaceAppNotificationService: {
      syncManifest: vi.fn().mockResolvedValue(undefined),
    },
    policyService: {
      requireServerRole: vi.fn().mockResolvedValue({ role: 'admin' }),
      requireServerMember: vi.fn().mockResolvedValue({ role: 'member' }),
      requireChannelRead: vi.fn().mockResolvedValue({
        channel: { id: 'app-channel-1', serverId: 'srv-1' },
        serverMember: { role: 'member' },
      }),
      requireChannelManage: vi.fn().mockResolvedValue({ id: 'app-channel-1', serverId: 'srv-1' }),
    },
    pollService: {
      create: vi.fn().mockResolvedValue({ id: 'poll-message-1', channelId: 'app-channel-1' }),
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
  return { service: new SpaceAppService(deps as never), deps, appRow }
}

describe('SpaceAppService', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete process.env.SHADOWOB_SPACE_APP_AUTHORIZATION_WAIT_MS
    delete process.env.SHADOWOB_SPACE_APP_AUTHORIZATION_MAX_WAIT_MS
    delete process.env.SHADOWOB_SPACE_APP_MANIFEST_REFRESH_TTL_MS
    delete process.env.SHADOWOB_SPACE_APP_CATALOG_REFRESH_TTL_MS
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
    expect(deps.spaceAppDao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: 'srv-1',
        appKey: 'demo-desk',
        apiBaseUrl: 'http://localhost:4199',
        defaultPermissions: ['demo.tickets:read'],
        defaultApprovalMode: 'none',
      }),
    )
  })

  it('accepts bounded widgets backed by a declared read command', async () => {
    const { service, deps } = createService()
    const widgetManifest: SpaceAppManifestInput = {
      ...manifest,
      widgets: [
        {
          key: 'ticket-count',
          title: 'Open tickets',
          category: 'productivity',
          size: { default: { widthCells: 4, heightCells: 3 } },
          options: [
            {
              key: 'scope',
              type: 'select',
              label: 'Scope',
              defaultValue: 'open',
              choices: [{ value: 'open', label: 'Open' }],
            },
          ],
          data: { command: 'tickets.list' },
          view: { type: 'metric', label: { literal: 'Open' }, value: { path: 'openCount' } },
        },
      ],
    }

    await service.install(
      'srv-1',
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      { manifest: widgetManifest },
    )

    expect(deps.spaceAppDao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({ widgets: widgetManifest.widgets }),
      }),
    )
  })

  it('rejects widgets backed by a write command', async () => {
    const { service } = createService()
    const widgetManifest: SpaceAppManifestInput = {
      ...manifest,
      widgets: [
        {
          key: 'unsafe',
          title: 'Unsafe widget',
          size: { default: { widthCells: 4, heightCells: 3 } },
          data: { command: 'tickets.create' },
          view: { type: 'text', value: { literal: 'Unsafe' } },
        },
      ],
    }

    await expect(
      service.install(
        'srv-1',
        { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
        { manifest: widgetManifest },
      ),
    ).rejects.toThrow('Widget data command must be read-only')
  })

  it('notifies members when a Space App is installed or updated', async () => {
    const { service, deps } = createService({
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
        findByServerAndKey: vi.fn().mockResolvedValue(null),
      },
    })

    await service.install(
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

    expect(deps.io.to).toHaveBeenCalledWith('user:user-1')
    const socketTarget = deps.io.to.mock.results[0]?.value as { emit: ReturnType<typeof vi.fn> }
    expect(socketTarget.emit).toHaveBeenCalledWith(
      'space-app:list-changed',
      expect.objectContaining({
        type: 'space_app.installed',
        serverId: 'srv-1',
        serverSlug: 'shadow-plays',
        appKey: 'demo-desk',
        appName: 'Demo Desk',
        installedByKind: 'user',
        installedByUserId: 'user-1',
      }),
    )
    expect(deps.io.to).not.toHaveBeenCalledWith('user:bot-1')
    expect(deps.notificationTriggerService.dispatchMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'user-1',
        kind: 'space_app.installed',
        referenceId: 'app-1',
        referenceType: 'space_app',
        scopeServerId: 'srv-1',
        bypassPreferences: true,
      }),
    ])
  })

  it('keeps Space App install successful when notification delivery fails', async () => {
    const base = createService()
    const { service, deps } = createService({
      spaceAppDao: {
        ...base.deps.spaceAppDao,
        findByServerAndKey: vi.fn().mockResolvedValue(null),
      },
      notificationTriggerService: {
        dispatchMany: vi.fn().mockRejectedValue(new Error('notification down')),
      },
    })

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
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ appKey: 'demo-desk' }),
      'Space App install notification failed',
    )
  })

  it('lists official Space App directory entries with marketplace metadata', async () => {
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

  it('refreshes official Space App directory entries from manifest URLs before listing', async () => {
    const staleManifest: SpaceAppManifestInput = {
      ...manifest,
      marketplace: {
        ...manifest.marketplace,
        tagline: 'Legacy listing',
        categories: ['Legacy'],
        coverImageUrl: 'http://localhost:4199/assets/old-cover.png',
      },
    }
    const freshManifest: SpaceAppManifestInput = {
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
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
        listCatalogEntries: vi.fn().mockResolvedValue([
          {
            id: 'catalog-1',
            appKey: 'demo-desk',
            name: 'Demo Desk',
            description: null,
            iconUrl: staleManifest.iconUrl,
            manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
            manifest: staleManifest,
            status: 'active',
            createdByUserId: null,
            createdAt: new Date('2026-05-20T00:00:00.000Z'),
            updatedAt: new Date('2026-05-20T00:00:00.000Z'),
          },
        ]),
      },
    })

    const result = await service.listDiscoverCatalog({ q: 'fresh' })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/space-app.json', {
      redirect: 'manual',
    })
    expect(deps.spaceAppDao.updateCatalogEntryManifest).toHaveBeenCalledWith(
      'catalog-1',
      expect.objectContaining({
        manifest: freshManifest,
        manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
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

  it('uses recent catalog manifests without refreshing them on read paths', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { service, deps } = createService({
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
        listCatalogEntries: vi.fn().mockResolvedValue([
          {
            id: 'catalog-1',
            appKey: 'demo-desk',
            name: 'Demo Desk',
            description: null,
            iconUrl: manifest.iconUrl,
            manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
            manifest,
            status: 'active',
            createdByUserId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    })

    const result = await service.listDiscoverCatalog({ q: 'support' })

    expect(result.total).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deps.spaceAppDao.updateCatalogEntryManifest).not.toHaveBeenCalled()
  })

  it('publishes an installed Space App into the official catalog', async () => {
    const freshManifest: SpaceAppManifestInput = {
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
      { sourceSpaceAppId: 'app-1', status: 'active' },
    )

    expect(deps.spaceAppDao.findById).toHaveBeenCalledWith('app-1')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/space-app.json', {
      redirect: 'manual',
    })
    expect(deps.spaceAppDao.updateManifest).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
        manifest: freshManifest,
      }),
    )
    expect(deps.spaceAppDao.upsertCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        appKey: 'demo-desk',
        manifest: freshManifest,
        manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
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

    expect(deps.spaceAppDao.upsertBuddyGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceAppId: 'app-1',
        buddyAgentId: 'agent-1',
        permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
      }),
    )
  })

  it('merges Buddy grant permissions without dropping existing app permissions', async () => {
    const expiresAt = new Date(Date.now() + 60_000)
    const base = createService()
    const { service, deps } = createService({
      spaceAppDao: {
        ...base.deps.spaceAppDao,
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

    expect(deps.spaceAppDao.upsertBuddyGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceAppId: 'app-1',
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
    expect(deps.spaceAppDao.findBuddyGrant).not.toHaveBeenCalled()
  })

  it('falls back to per-call approval for Buddy grants with resource policy rules', async () => {
    const base = createService()
    const { service } = createService({
      spaceAppDao: {
        ...base.deps.spaceAppDao,
        findBuddyGrant: vi.fn().mockResolvedValue({
          id: 'grant-1',
          permissions: ['demo.tickets:read'],
          resourceRules: { projects: ['project-1'] },
          approvalMode: 'none',
          expiresAt: null,
        }),
      },
    })

    await expect(
      service.callCommand({
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
        authorization: { waitMs: 0 },
      }),
    ).rejects.toMatchObject({
      code: 'SPACE_APP_COMMAND_APPROVAL_REQUIRED',
      params: {
        approval: expect.objectContaining({
          approvalMode: 'every_time',
          reason: 'policy',
        }),
      },
    })
  })

  it('keeps a path-mounted API base URL when calling command paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { tickets: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const pathMountedApp = {
      ...createService().appRow,
      apiBaseUrl: 'http://localhost:4199/demo-desk',
    }
    const { service } = createService({
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
        findByServerAndKey: vi.fn().mockResolvedValue(pathMountedApp),
      },
    })

    await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
    })

    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe(
      'http://localhost:4199/demo-desk/.shadow/commands/tickets.list',
    )
  })

  it('refreshes an installed manifest before calling a command whose stored ingress is missing', async () => {
    const legacyManifest = {
      ...manifest,
      commands: manifest.commands.map((command) => {
        if (command.name !== 'tickets.list') return command
        const { ingress: _ingress, ...legacyCommand } = command
        return {
          ...legacyCommand,
          path: '/.shadow/commands/tickets.list',
        }
      }),
    } as unknown as SpaceAppManifestInput
    const freshManifest: SpaceAppManifestInput = {
      ...manifest,
      version: '1.1.0',
      updatedAt: '2026-05-21T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockImplementation(async (url: URL | string) => {
      const value = url.toString()
      if (value === 'http://localhost:4199/.well-known/space-app.json') {
        return new Response(JSON.stringify(freshManifest), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, result: { tickets: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const staleApp = {
      ...createService().appRow,
      manifest: legacyManifest,
      manifestUrl: null,
      manifestFetchedAt: new Date(),
      manifestHash: 'legacy',
    }
    const spaceAppDao = {
      ...createService().deps.spaceAppDao,
      findByServerAndKey: vi.fn().mockResolvedValue(staleApp),
      updateManifest: vi.fn().mockImplementation(async (_spaceAppId, data) => ({
        ...staleApp,
        ...data,
        defaultPermissions: staleApp.defaultPermissions,
        defaultApprovalMode: staleApp.defaultApprovalMode,
      })),
    }
    const { service } = createService({ spaceAppDao })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
    })

    expect(result).toEqual({ ok: true, result: { tickets: [] } })
    expect(spaceAppDao.updateManifest).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
        manifest: expect.objectContaining({ version: '1.1.0' }),
      }),
    )
    expect(fetchMock.mock.calls[1]?.[0]?.toString()).toBe(
      'http://localhost:4199/.shadow/commands/tickets.list',
    )
  })

  it('forwards multipart files without enforcing manifest file type or size hints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { uploaded: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const restrictedManifest: SpaceAppManifestInput = {
      ...manifest,
      binary: {
        supported: true,
        maxBytes: 1,
        contentTypes: ['image/png'],
      },
      commands: manifest.commands.map((command) =>
        command.name === 'tickets.list'
          ? {
              ...command,
              input: 'multipart',
              binary: {
                supported: true,
                maxBytes: 1,
                contentTypes: ['image/png'],
              },
            }
          : command,
      ),
    }
    const { service } = createService({
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
        findByServerAndKey: vi
          .fn()
          .mockResolvedValue({ ...createService().appRow, manifest: restrictedManifest }),
      },
    })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
      multipart: {
        fields: {},
        files: [
          {
            field: 'file',
            name: 'demo.html',
            type: 'text/html',
            value: new Blob(['<html><body>demo</body></html>'], { type: 'text/html' }),
          },
        ],
      },
    })

    expect(result).toEqual({ ok: true, result: { uploaded: true } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const form = init.body as FormData
    expect(form.get('input')).toBe('{}')
    const uploaded = form.get('file') as File
    expect(uploaded.name).toBe('demo.html')
    expect(uploaded.type).toBe('text/html')
  })

  it('refreshes an installed manifest URL before command lookup', async () => {
    const freshManifest: SpaceAppManifestInput = {
      ...manifest,
      version: '1.1.0',
      updatedAt: '2026-05-21T00:00:00.000Z',
      commands: [
        ...manifest.commands,
        {
          name: 'tickets.stats',
          ingress: {
            path: '/.shadow/commands/tickets.stats',
            auth: 'shadow-command-jwt',
          },
          permission: 'demo.tickets:read',
          action: 'read',
          dataClass: 'server-private',
        },
      ],
    }
    const fetchMock = vi.fn().mockImplementation(async (url: URL | string) => {
      const value = url.toString()
      if (value === 'http://localhost:4199/.well-known/space-app.json') {
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
      manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
      manifest,
      manifestVersion: '1.0.0',
      manifestUpdatedAt: new Date('2026-05-20T00:00:00.000Z'),
      manifestFetchedAt: new Date('2026-05-20T00:00:00.000Z'),
      manifestHash: 'stale',
    }
    const spaceAppDao = {
      ...createService().deps.spaceAppDao,
      findByServerAndKey: vi.fn().mockResolvedValue(staleApp),
      updateManifest: vi.fn().mockImplementation(async (_spaceAppId, data) => ({
        ...staleApp,
        ...data,
        manifestUrl: staleApp.manifestUrl,
        defaultPermissions: staleApp.defaultPermissions,
        defaultApprovalMode: staleApp.defaultApprovalMode,
      })),
    }
    const { service } = createService({ spaceAppDao })

    const result = await service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.stats',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
    })

    expect(result).toEqual({ ok: true, result: { open: 2, closed: 1 } })
    expect(spaceAppDao.updateManifest).toHaveBeenCalledWith(
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
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
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
      code: 'SPACE_APP_COMMAND_APPROVAL_REQUIRED',
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
    expect(deps.spaceAppDao.upsertCommandConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tickets.create',
        subjectKind: 'user',
        subjectKey: 'user-1',
      }),
    )
  })

  it('waits for command approval and retries on a 5s polling cadence', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { ticket: { id: 'ticket-1' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { service } = createService({
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
        findBuddyGrant: vi.fn().mockResolvedValue(null),
      },
    })
    const actor = {
      kind: 'user' as const,
      userId: 'user-1',
      authMethod: 'jwt' as const,
      scopes: [],
    }
    const onCommandApprovalRequired = vi.fn(async () => {
      setTimeout(() => {
        void service.approveCommandAccess('srv-1', 'demo-desk', actor, {
          commandName: 'tickets.create',
          remember: true,
        })
      }, 10)
    })

    const pending = service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.create',
      actor,
      body: { input: { title: 'Need help' }, channelId: 'channel-1' },
      authorization: {
        waitMs: 60_000,
        pollMs: 5_000,
        onCommandApprovalRequired,
      },
    })

    await vi.advanceTimersByTimeAsync(5_000)

    await expect(pending).resolves.toEqual({ ok: true, result: { ticket: { id: 'ticket-1' } } })
    expect(onCommandApprovalRequired).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
    expect(deps.spaceAppEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'space_app.command.completed',
        appKey: 'demo-desk',
        command: 'tickets.list',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:4199/.shadow/commands/tickets.list'),
      expect.objectContaining({ method: 'POST' }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Bearer /)

    expect(Object.keys(headers).some((name) => name.startsWith('X-Shadow-'))).toBe(false)
    const introspection = await service.introspectCommandToken(
      headers.Authorization.replace(/^Bearer /, ''),
    )
    expect(introspection).toMatchObject({
      active: true,
      token_type: 'Bearer',
      client_id: 'demo-desk',
      shadow: {
        serverId: 'srv-1',
        spaceAppId: 'app-1',
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
            avatarUrl: 'http://localhost:3000/api/media/avatar/shadow/uploads/avatar.png',
          },
        },
        permission: 'demo.tickets:read',
      },
    })
  })

  it('injects server Buddy directory into Space App command context', async () => {
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
    expect(body).toEqual({ input: {} })

    const headers = init.headers as Record<string, string>
    const introspection = await service.introspectCommandToken(
      headers.Authorization.replace(/^Bearer /, ''),
    )
    expect(introspection.shadow.resources.buddies).toEqual([
      {
        agentId: 'agent-brandscout',
        userId: 'buddy-user-1',
        username: 'brandscout',
        displayName: 'BrandScout',
        description: 'Researches source material and uploads workspace files.',
        avatarUrl: 'http://localhost:3000/api/media/avatar/shadow/uploads/avatar.png',
        ownerId: 'owner-1',
        status: 'online',
        agentStatus: 'running',
      },
    ])
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
    const manifestWithCommandApproval: SpaceAppManifestInput = {
      ...manifest,
      commands: manifest.commands.map((command) =>
        command.name === 'tickets.create'
          ? { ...command, approvalMode: 'first_time' as const }
          : command,
      ),
    }
    const { service, deps } = createService({
      spaceAppDao: {
        ...base.deps.spaceAppDao,
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
    expect(deps.spaceAppDao.findCommandConsent).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:4199/.shadow/commands/tickets.create'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('delivers Space App channel message outbox cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ticket: { id: 'ticket-1' },
            shadow: {
              protocol: 'shadow.space-app/1',
              outbox: {
                channelMessages: [
                  {
                    channelName: 'general',
                    content: 'Next card is ready.',
                    idempotencyKey: 'demo:next-card',
                    metadata: {
                      cards: [
                        {
                          kind: 'space_app',
                          appKey: 'demo-desk',
                          title: 'Open ticket',
                          action: { mode: 'open_space_app', path: '/tickets/ticket-1' },
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
            kind: 'space_app',
            appKey: 'demo-desk',
            title: 'Open ticket',
            action: { mode: 'open_space_app', path: '/tickets/ticket-1' },
          },
        ],
        custom: {
          spaceAppChannelMessage: {
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

  it('delivers Space App Inbox task outbox cards with an active Buddy grant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ticket: { id: 'ticket-1' },
            shadow: {
              protocol: 'shadow.space-app/1',
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
                      tools: [{ kind: 'space-app-command', name: 'tickets.create' }],
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

    expect(deps.spaceAppDao.findBuddyGrant).toHaveBeenCalledWith('app-1', 'agent-1')
    expect(deps.buddyInboxService.enqueueTaskForAgent).toHaveBeenCalledWith(
      'srv-1',
      'agent-1',
      expect.objectContaining({
        title: 'Review launch ticket',
        idempotencyKey: 'demo:ticket-1:review',
        tags: ['review', { label: 'Launch', color: '#60a5fa' }],
        requirements: {
          capabilities: ['workspace.write'],
          tools: [{ kind: 'space-app-command', name: 'tickets.create' }],
        },
        outputContract: {
          expectedArtifacts: [{ kind: 'workspace.reference', required: false }],
          submitCommand: { appKey: 'demo-desk', command: 'tickets.create' },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
        source: expect.objectContaining({
          kind: 'space_app',
          appKey: 'demo-desk',
          command: 'tickets.list',
          resource: { kind: 'ticket', id: 'ticket-1', label: 'Launch ticket' },
        }),
        data: expect.objectContaining({
          ticketId: 'ticket-1',
          spaceApp: expect.objectContaining({ appKey: 'demo-desk' }),
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

  it('delivers Space App Inbox task outbox cards to an explicit Inbox channel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ticket: { id: 'ticket-1' },
            shadow: {
              protocol: 'shadow.space-app/1',
              outbox: {
                inboxTasks: [
                  {
                    channelId: 'channel-1',
                    agentId: 'agent-1',
                    title: 'Review launch ticket',
                    body: 'Inspect the generated launch ticket.',
                    idempotencyKey: 'demo:ticket-1:review',
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

    expect(deps.spaceAppDao.findBuddyGrant).toHaveBeenCalledWith('app-1', 'agent-1')
    expect(deps.buddyInboxService.enqueueTask).toHaveBeenCalledWith(
      'channel-1',
      expect.objectContaining({
        title: 'Review launch ticket',
        idempotencyKey: 'demo:ticket-1:review',
        source: expect.objectContaining({
          kind: 'space_app',
          appKey: 'demo-desk',
          command: 'tickets.list',
        }),
      }),
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
    expect(deps.buddyInboxService.enqueueTaskForAgent).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      result: {
        shadow: {
          outbox: {
            deliveries: [
              {
                agentId: 'agent-1',
                channelId: 'channel-1',
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
              protocol: 'shadow.space-app/1',
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
      spaceAppDao: {
        ...base.deps.spaceAppDao,
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
                error: 'Space App is not authorized to deliver Inbox tasks to this Buddy',
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
              protocol: 'shadow.space-app/1',
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
      spaceAppDao: {
        ...base.deps.spaceAppDao,
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
      code: 'SPACE_APP_BUDDY_GRANT_PERMISSION_REQUIRED',
      params: {
        grant: {
          serverId: 'srv-1',
          spaceAppId: 'app-1',
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

  it('waits for the Buddy delivery grant before enqueueing required outbox tasks', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            shadow: {
              protocol: 'shadow.space-app/1',
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
    let grant: { id: string; permissions: string[]; approvalMode: string; expiresAt: null } | null =
      {
        id: 'grant-1',
        permissions: ['demo.tickets:read'],
        approvalMode: 'none',
        expiresAt: null,
      }
    const { service, deps } = createService({
      spaceAppDao: {
        ...base.deps.spaceAppDao,
        findBuddyGrant: vi.fn().mockImplementation(async () => grant),
      },
      serverDao: {
        ...base.deps.serverDao,
        getMember: vi.fn().mockResolvedValue({ role: 'member' }),
      },
    })
    setTimeout(() => {
      grant = {
        id: 'grant-1',
        permissions: ['demo.tickets:read', BUDDY_INBOX_DELIVERY_PERMISSION],
        approvalMode: 'none',
        expiresAt: null,
      }
    }, 10)

    const pending = service.callCommand({
      serverIdOrSlug: 'srv-1',
      appKey: 'demo-desk',
      commandName: 'tickets.list',
      actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      body: { input: {} },
      authorization: { waitMs: 60_000, pollMs: 5_000 },
    })

    await vi.advanceTimersByTimeAsync(5_000)

    await expect(pending).resolves.toMatchObject({
      result: {
        shadow: {
          outbox: {
            deliveries: [
              {
                agentId: 'agent-1',
                messageId: 'message-1',
                cardId: 'task-card-1',
              },
            ],
          },
        },
      },
    })
    expect(deps.buddyInboxService.enqueueTaskForAgent).toHaveBeenCalledTimes(1)
  })

  it('deduplicates Space App channel messages by idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            ticket: { id: 'ticket-1' },
            shadow: {
              protocol: 'shadow.space-app/1',
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
                  spaceAppChannelMessage: {
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
    expect(result.markdown).toContain('Do not call this Space App through curl')
    expect(result.markdown).toContain('demo-desk tickets.create')
    expect(result.markdown).not.toContain('"required":["title"]')
  })

  it('creates a scoped launch token without embedding it in the event stream URL', async () => {
    const { service } = createService()

    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })
    const context = await service.getEventStreamContext('srv-1', 'demo-desk', launch.launchToken)

    expect(launch.eventStreamPath).toBe('/api/servers/srv-1/space-apps/demo-desk/events')
    expect(launch.eventStreamPath).not.toContain(launch.launchToken)
    expect(launch.mobile?.navigation?.mode).toBe('immersive')
    expect(context.app.id).toBe('app-1')
  })

  it('lists Space members through the verified launch scope', async () => {
    const { service, deps } = createService()
    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    await expect(
      service.listLaunchSpaceMembers('srv-1', 'demo-desk', launch.launchToken),
    ).resolves.toMatchObject([
      { userId: 'user-1', kind: 'user', isBot: false },
      { userId: 'bot-1', kind: 'bot', isBot: true },
    ])
    expect(deps.policyService.requireServerMember).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      'srv-1',
    )
  })

  it('lists only actor-visible channels through the verified launch scope', async () => {
    const { service, deps } = createService()
    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    await expect(
      service.listLaunchChannels('srv-1', 'demo-desk', launch.launchToken),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'app-channel-1', name: 'trip-demo', isPrivate: true }),
    ])
    expect(deps.channelService.getByServerIdForUser).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
  })

  it('reads launch messages only after channel and Space authorization', async () => {
    const base = createService()
    const { service, deps } = createService({
      messageDao: {
        ...base.deps.messageDao,
        findById: vi.fn().mockResolvedValue({
          id: 'message-1',
          channelId: 'app-channel-1',
        }),
      },
    })
    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    await expect(
      service.getLaunchMessage('srv-1', 'demo-desk', launch.launchToken, 'message-1'),
    ).resolves.toMatchObject({ id: 'message-1', channelId: 'app-channel-1' })
    expect(deps.policyService.requireChannelRead).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      'app-channel-1',
    )
    expect(deps.messageService.getById).toHaveBeenCalledWith('message-1', 'user-1')
  })

  it('ensures launch-scoped channels with app namespacing and Space member isolation', async () => {
    const { service, deps } = createService()
    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    await expect(
      service.ensureLaunchChannel('srv-1', 'demo-desk', launch.launchToken, {
        dedupeKey: 'trip:demo',
        name: 'trip-demo',
        memberUserIds: ['user-1'],
        syncMembers: true,
      }),
    ).resolves.toEqual({ channelId: 'app-channel-1', created: true, name: 'trip-demo' })
    expect(deps.channelService.create).toHaveBeenCalledWith(
      'srv-1',
      expect.objectContaining({ topic: 'space-app:demo-desk:trip:demo', isPrivate: true }),
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )

    await expect(
      service.ensureLaunchChannel('srv-1', 'demo-desk', launch.launchToken, {
        dedupeKey: 'trip:demo',
        name: 'trip-demo',
        memberUserIds: ['00000000-0000-4000-8000-000000000099'],
        syncMembers: true,
      }),
    ).rejects.toMatchObject({ status: 422, reason: 'cross_space_channel_member' })
  })

  it('requires channel visibility or management when a launch channel already exists', async () => {
    const base = createService()
    const { service, deps } = createService({
      channelDao: {
        ...base.deps.channelDao,
        findByServerId: vi.fn().mockResolvedValue([
          {
            id: 'existing-private-channel',
            serverId: 'srv-1',
            name: 'trip-demo',
            topic: 'space-app:demo-desk:trip:demo',
            isPrivate: true,
          },
        ]),
      },
    })
    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    await service.ensureLaunchChannel('srv-1', 'demo-desk', launch.launchToken, {
      dedupeKey: 'trip:demo',
      name: 'trip-demo',
    })
    expect(deps.policyService.requireChannelRead).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'existing-private-channel',
    )

    await service.ensureLaunchChannel('srv-1', 'demo-desk', launch.launchToken, {
      dedupeKey: 'trip:demo',
      name: 'trip-demo',
      memberUserIds: ['user-1'],
      syncMembers: true,
    })
    expect(deps.policyService.requireChannelManage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'existing-private-channel',
    )
  })

  it('creates polls only in channels from the launch Space', async () => {
    const { service, deps } = createService()
    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    await expect(
      service.createLaunchPoll('srv-1', 'demo-desk', launch.launchToken, {
        channelId: 'app-channel-1',
        question: 'Where next?',
        answers: [{ text: 'Paris' }, { text: 'Kyoto' }],
        allowMultiselect: false,
        durationHours: 24,
        layoutType: 1,
      }),
    ).resolves.toEqual({ channelId: 'app-channel-1', messageId: 'poll-message-1' })
    expect(deps.pollService.create).toHaveBeenCalledWith(
      'app-channel-1',
      'user-1',
      expect.objectContaining({ question: 'Where next?' }),
    )
  })

  it('returns launch introspection reasons for inactive tokens', async () => {
    const { service } = createService()

    const launch = await service.createLaunch('srv-1', 'demo-desk', {
      kind: 'user',
      userId: 'user-1',
      authMethod: 'jwt',
      scopes: [],
    })

    await expect(
      service.introspectLaunchToken('srv-1', 'other-app', launch.launchToken),
    ).resolves.toMatchObject({
      active: false,
      error: 'launch_token_app_mismatch',
    })
    await expect(
      service.introspectLaunchToken('srv-1', 'demo-desk', 'not-a-launch-token'),
    ).resolves.toMatchObject({
      active: false,
      error: 'invalid_launch_token',
    })
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

  it('uses manifest display names for Space App summaries', async () => {
    const { service, deps } = createService()
    deps.spaceAppDao.listSummariesByServer.mockResolvedValueOnce([
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
    const skillsManifest: SpaceAppManifestInput = {
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
    deps.spaceAppDao.listCatalogEntries.mockResolvedValueOnce([row])

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

    deps.spaceAppDao.listCatalogEntries.mockResolvedValueOnce([row])
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

    expect(deps.spaceAppDao.findCatalogEntryById).toHaveBeenCalledWith('catalog-1')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/space-app.json', {
      redirect: 'manual',
    })
    expect(deps.spaceAppDao.upsert).toHaveBeenCalledWith(
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
      spaceAppDao: {
        ...createService().deps.spaceAppDao,
        findCatalogEntryById: vi.fn().mockResolvedValue({
          id: 'catalog-1',
          appKey: 'demo-desk',
          name: 'Demo Desk',
          description: null,
          iconUrl: manifest.iconUrl,
          manifestUrl: 'http://localhost:4199/.well-known/space-app.json',
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

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4199/.well-known/space-app.json', {
      redirect: 'manual',
    })
    expect(deps.spaceAppDao.upsert).toHaveBeenCalledWith(
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
