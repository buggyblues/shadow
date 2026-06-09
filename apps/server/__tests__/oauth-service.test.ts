import { describe, expect, it, vi } from 'vitest'
import { OAuthService, VALID_OAUTH_SCOPES } from '../src/services/oauth.service'

/* ─── Mock factories ─────────────────────────────────── */

function createMockOAuthAppDao(overrides = {}) {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByClientId: vi.fn(),
    findByUserId: vi.fn(),
    update: vi.fn(),
    updateSecret: vi.fn(),
    delete: vi.fn(),
    createAuthorizationCode: vi.fn(),
    findAuthorizationCode: vi.fn(),
    markAuthorizationCodeUsed: vi.fn(),
    createAccessToken: vi.fn(),
    findAccessTokenByHash: vi.fn(),
    deleteAccessTokensByAppAndUser: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshTokenByHash: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeRefreshTokensByAppAndUser: vi.fn(),
    findConsent: vi.fn(),
    upsertConsent: vi.fn(),
    findConsentsByUserId: vi.fn(),
    deleteConsent: vi.fn(),
    updateBuddyUser: vi.fn(),
    updateBuddyAgent: vi.fn(),
    getBuddyUserId: vi.fn(),
    ...overrides,
  }
}

function createMockUserDao(overrides = {}) {
  return {
    findById: vi.fn(),
    create: vi.fn(),
    ...overrides,
  }
}

function createMockServerService(overrides = {}) {
  return {
    getUserServers: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    getById: vi.fn(),
    join: vi.fn(),
    ...overrides,
  }
}

function createMockChannelService(overrides = {}) {
  return {
    getByServerId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    addMember: vi.fn(),
    ...overrides,
  }
}

function createMockMessageService(overrides = {}) {
  return {
    getByChannelId: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
    send: vi.fn(),
    ...overrides,
  }
}

function createMockWorkspaceService(overrides = {}) {
  return {
    getById: vi.fn(),
    ...overrides,
  }
}

function createMockAgentService(overrides = {}) {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    ...overrides,
  }
}

function createMockPolicyService(overrides = {}) {
  return {
    requireServerMember: vi.fn(),
    requireServerRole: vi.fn(),
    requireChannelRead: vi.fn(),
    accessibleChannelIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function createMockMediaService(overrides = {}) {
  return {
    resolveMediaUrl: vi.fn((value: string | null | undefined) => value ?? null),
    ...overrides,
  }
}

function oauthActor(overrides = {}) {
  return {
    kind: 'oauth' as const,
    userId: 'user-1',
    appId: 'app-1',
    tokenId: 'token-1',
    scopes: ['*'],
    ...overrides,
  }
}

function createService(overrides: Record<string, unknown> = {}) {
  const deps = {
    oauthAppDao: createMockOAuthAppDao(overrides.oauthAppDao as Record<string, unknown>),
    userDao: createMockUserDao(overrides.userDao as Record<string, unknown>),
    serverService: createMockServerService(overrides.serverService as Record<string, unknown>),
    channelService: createMockChannelService(overrides.channelService as Record<string, unknown>),
    messageService: createMockMessageService(overrides.messageService as Record<string, unknown>),
    workspaceService: createMockWorkspaceService(
      overrides.workspaceService as Record<string, unknown>,
    ),
    agentService: createMockAgentService(overrides.agentService as Record<string, unknown>),
    policyService: createMockPolicyService(overrides.policyService as Record<string, unknown>),
    mediaService: createMockMediaService(overrides.mediaService as Record<string, unknown>),
  }
  return { service: new OAuthService(deps as any), ...deps }
}

/* ═══════════════════════════════════════════════════════
   App Management
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — App Management', () => {
  it('createApp returns clientId and clientSecret', async () => {
    const { service, oauthAppDao } = createService({
      oauthAppDao: {
        create: vi.fn().mockResolvedValue({
          id: 'app-1',
          name: 'Test App',
          description: null,
          redirectUris: ['https://example.com/cb'],
          homepageUrl: null,
          logoUrl: null,
          createdAt: new Date(),
        }),
      },
    })

    const result = await service.createApp('user-1', {
      name: 'Test App',
      redirectUris: ['https://example.com/cb'],
    })

    expect(result.clientId).toMatch(/^shadow_/)
    expect(result.clientSecret).toMatch(/^shsec_/)
    expect(result.name).toBe('Test App')
    expect(oauthAppDao.create).toHaveBeenCalledOnce()
  })

  it('listApps returns mapped apps', async () => {
    const apps = [
      {
        id: 'a1',
        clientId: 'shadow_abc',
        name: 'App 1',
        description: null,
        redirectUris: ['https://a.com/cb'],
        homepageUrl: null,
        logoUrl: null,
        isActive: true,
        createdAt: new Date(),
      },
    ]
    const { service } = createService({
      oauthAppDao: { findByUserId: vi.fn().mockResolvedValue(apps) },
    })

    const result = await service.listApps('user-1')
    expect(result).toHaveLength(1)
    expect(result[0].clientId).toBe('shadow_abc')
    // clientSecret should NOT be in list output
    expect((result[0] as Record<string, unknown>).clientSecret).toBeUndefined()
  })

  it('updateApp throws 404 if app not found', async () => {
    const { service } = createService({
      oauthAppDao: { findById: vi.fn().mockResolvedValue(null) },
    })
    await expect(service.updateApp('user-1', 'nonexistent', { name: 'New' })).rejects.toThrow(
      'App not found',
    )
  })

  it('updateApp throws 404 if userId does not match', async () => {
    const { service } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({ id: 'a1', userId: 'other-user' }),
      },
    })
    await expect(service.updateApp('user-1', 'a1', { name: 'New' })).rejects.toThrow(
      'App not found',
    )
  })

  it('updateApp succeeds for the owner', async () => {
    const updated = {
      id: 'a1',
      clientId: 'shadow_abc',
      name: 'Updated',
      description: null,
      redirectUris: ['https://a.com/cb'],
      homepageUrl: null,
      logoUrl: null,
      isActive: true,
      createdAt: new Date(),
    }
    const { service } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({ id: 'a1', userId: 'user-1' }),
        update: vi.fn().mockResolvedValue(updated),
      },
    })
    const result = await service.updateApp('user-1', 'a1', { name: 'Updated' })
    expect(result.name).toBe('Updated')
  })

  it('deleteApp throws 404 if not owner', async () => {
    const { service } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({ id: 'a1', userId: 'other-user' }),
      },
    })
    await expect(service.deleteApp('user-1', 'a1')).rejects.toThrow('App not found')
  })

  it('deleteApp succeeds for owner', async () => {
    const { service, oauthAppDao } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({ id: 'a1', userId: 'user-1' }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    })
    await service.deleteApp('user-1', 'a1')
    expect(oauthAppDao.delete).toHaveBeenCalledWith('a1')
  })

  it('resetSecret returns new secret and updates hash', async () => {
    const { service, oauthAppDao } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({ id: 'a1', userId: 'user-1' }),
        updateSecret: vi.fn().mockResolvedValue({}),
      },
    })
    const result = await service.resetSecret('user-1', 'a1')
    expect(result.clientSecret).toMatch(/^shsec_/)
    expect(oauthAppDao.updateSecret).toHaveBeenCalledOnce()
  })
})

/* ═══════════════════════════════════════════════════════
   Authorization Flow
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — Authorization Flow', () => {
  it('validateAuthorizeRequest succeeds with valid params', async () => {
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          name: 'Test App',
          isActive: true,
          redirectUris: ['https://example.com/cb'],
          logoUrl: null,
          homepageUrl: null,
        }),
      },
    })

    const result = await service.validateAuthorizeRequest(
      'shadow_abc',
      'https://example.com/cb',
      'user:read user:email',
    )
    expect(result.appId).toBe('app-1')
    expect(result.appName).toBe('Test App')
    expect(result.scope).toBe('user:read user:email')
  })

  it('validateAuthorizeRequest rejects inactive app', async () => {
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({ id: 'app-1', isActive: false }),
      },
    })
    await expect(
      service.validateAuthorizeRequest('shadow_abc', 'https://example.com/cb', 'user:read'),
    ).rejects.toThrow('Invalid client_id')
  })

  it('validateAuthorizeRequest rejects non-matching redirect_uri', async () => {
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          redirectUris: ['https://example.com/cb'],
        }),
      },
    })
    await expect(
      service.validateAuthorizeRequest('shadow_abc', 'https://evil.com/cb', 'user:read'),
    ).rejects.toThrow('Invalid redirect_uri')
  })

  it('validateAuthorizeRequest rejects invalid scope', async () => {
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          redirectUris: ['https://example.com/cb'],
        }),
      },
    })
    await expect(
      service.validateAuthorizeRequest('shadow_abc', 'https://example.com/cb', 'admin:delete'),
    ).rejects.toThrow('Invalid scope: admin:delete')
  })

  it('approveAuthorization creates code and consent', async () => {
    const { service, oauthAppDao } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          redirectUris: ['https://example.com/cb'],
        }),
        upsertConsent: vi.fn(),
        createAuthorizationCode: vi.fn().mockResolvedValue({ id: 'code-1' }),
      },
    })

    const result = await service.approveAuthorization('user-1', {
      clientId: 'shadow_abc',
      redirectUri: 'https://example.com/cb',
      scope: 'user:read',
      state: 'state-123',
    })
    expect(result.code).toBeDefined()
    expect(result.code.length).toBe(64) // 32 bytes hex
    expect(result.state).toBe('state-123')
    expect(oauthAppDao.upsertConsent).toHaveBeenCalledWith('user-1', 'app-1', 'user:read')
    expect(oauthAppDao.createAuthorizationCode).toHaveBeenCalledOnce()
  })

  it('approveAuthorization rejects invalid client', async () => {
    const { service } = createService({
      oauthAppDao: { findByClientId: vi.fn().mockResolvedValue(null) },
    })
    await expect(
      service.approveAuthorization('user-1', {
        clientId: 'bad',
        redirectUri: 'https://example.com/cb',
        scope: 'user:read',
      }),
    ).rejects.toThrow('Invalid client')
  })
})

/* ═══════════════════════════════════════════════════════
   Token Exchange
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — Token Exchange', () => {
  it('exchangeAuthorizationCode rejects invalid client', async () => {
    const { service } = createService({
      oauthAppDao: { findByClientId: vi.fn().mockResolvedValue(null) },
    })
    await expect(
      service.exchangeAuthorizationCode('code', 'shadow_bad', 'shsec_bad', 'https://cb.com'),
    ).rejects.toThrow('Invalid client')
  })

  it('exchangeAuthorizationCode rejects wrong secret', async () => {
    const bcryptjs = await import('bcryptjs')
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          clientSecretHash: await bcryptjs.hash('shsec_correct', 10),
        }),
      },
    })
    await expect(
      service.exchangeAuthorizationCode('code', 'shadow_ok', 'shsec_wrong', 'https://cb.com'),
    ).rejects.toThrow('Invalid client credentials')
  })

  it('exchangeAuthorizationCode rejects missing code', async () => {
    const bcryptjs = await import('bcryptjs')
    const secret = 'shsec_correct'
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          clientSecretHash: await bcryptjs.hash(secret, 10),
        }),
        findAuthorizationCode: vi.fn().mockResolvedValue(null),
      },
    })
    await expect(
      service.exchangeAuthorizationCode('bad-code', 'shadow_ok', secret, 'https://cb.com'),
    ).rejects.toThrow('Invalid authorization code')
  })

  it('exchangeAuthorizationCode rejects used code', async () => {
    const bcryptjs = await import('bcryptjs')
    const secret = 'shsec_correct'
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          clientSecretHash: await bcryptjs.hash(secret, 10),
        }),
        findAuthorizationCode: vi.fn().mockResolvedValue({
          id: 'c1',
          appId: 'app-1',
          used: true,
          redirectUri: 'https://cb.com',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    })
    await expect(
      service.exchangeAuthorizationCode('code-val', 'shadow_ok', secret, 'https://cb.com'),
    ).rejects.toThrow('Authorization code already used')
  })

  it('exchangeAuthorizationCode rejects expired code', async () => {
    const bcryptjs = await import('bcryptjs')
    const secret = 'shsec_correct'
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          clientSecretHash: await bcryptjs.hash(secret, 10),
        }),
        findAuthorizationCode: vi.fn().mockResolvedValue({
          id: 'c1',
          appId: 'app-1',
          used: false,
          redirectUri: 'https://cb.com',
          expiresAt: new Date(Date.now() - 60_000), // expired
        }),
      },
    })
    await expect(
      service.exchangeAuthorizationCode('code-val', 'shadow_ok', secret, 'https://cb.com'),
    ).rejects.toThrow('Authorization code expired')
  })

  it('exchangeAuthorizationCode issues tokens on success', async () => {
    const bcryptjs = await import('bcryptjs')
    const secret = 'shsec_correct'
    const { service } = createService({
      oauthAppDao: {
        findByClientId: vi.fn().mockResolvedValue({
          id: 'app-1',
          isActive: true,
          clientSecretHash: await bcryptjs.hash(secret, 10),
        }),
        findAuthorizationCode: vi.fn().mockResolvedValue({
          id: 'c1',
          appId: 'app-1',
          userId: 'user-1',
          used: false,
          redirectUri: 'https://cb.com',
          scope: 'user:read',
          expiresAt: new Date(Date.now() + 600_000),
        }),
        markAuthorizationCodeUsed: vi.fn(),
        createAccessToken: vi.fn().mockResolvedValue({ id: 'at-1' }),
        createRefreshToken: vi.fn().mockResolvedValue({ id: 'rt-1' }),
      },
    })

    const result = await service.exchangeAuthorizationCode(
      'valid-code',
      'shadow_ok',
      secret,
      'https://cb.com',
    )
    expect(result.access_token).toMatch(/^oat_/)
    expect(result.refresh_token).toMatch(/^ort_/)
    expect(result.token_type).toBe('Bearer')
    expect(result.expires_in).toBe(3600)
    expect(result.scope).toBe('user:read')
  })
})

/* ═══════════════════════════════════════════════════════
   getUserInfo
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — getUserInfo', () => {
  it('returns user info without email when scope lacks user:email', async () => {
    const { service } = createService({
      oauthAppDao: {
        findAccessTokenByHash: vi.fn().mockResolvedValue({
          userId: 'u1',
          scope: 'user:read',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      userDao: {
        findById: vi.fn().mockResolvedValue({
          id: 'u1',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
          email: 'alice@example.com',
        }),
      },
    })

    const result = await service.getUserInfo('oat_test')
    expect(result.id).toBe('u1')
    expect(result.username).toBe('alice')
    expect(result.email).toBeUndefined()
  })

  it('returns signed avatar URLs for private media refs', async () => {
    const { service, mediaService } = createService({
      oauthAppDao: {
        findAccessTokenByHash: vi.fn().mockResolvedValue({
          userId: 'u1',
          scope: 'user:read',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      userDao: {
        findById: vi.fn().mockResolvedValue({
          id: 'u1',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: '/shadow/uploads/avatar.png',
          email: 'alice@example.com',
        }),
      },
      mediaService: {
        resolveMediaUrl: vi.fn().mockReturnValue('/api/media/signed/avatar-token'),
      },
    })

    const result = await service.getUserInfo('oat_test')
    expect(result.avatarUrl).toBe('http://localhost:3000/api/media/signed/avatar-token')
    expect(mediaService.resolveMediaUrl).toHaveBeenCalledWith(
      '/shadow/uploads/avatar.png',
      'image/png',
      {
        variant: 'avatar',
      },
    )
  })

  it('returns user info with email when scope includes user:email', async () => {
    const { service } = createService({
      oauthAppDao: {
        findAccessTokenByHash: vi.fn().mockResolvedValue({
          userId: 'u1',
          scope: 'user:read user:email',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      userDao: {
        findById: vi.fn().mockResolvedValue({
          id: 'u1',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
          email: 'alice@example.com',
        }),
      },
    })

    const result = await service.getUserInfo('oat_test')
    expect(result.email).toBe('alice@example.com')
  })

  it('rejects invalid token', async () => {
    const { service } = createService({
      oauthAppDao: { findAccessTokenByHash: vi.fn().mockResolvedValue(null) },
    })
    await expect(service.getUserInfo('oat_bad')).rejects.toThrow('Invalid access token')
  })

  it('rejects expired token', async () => {
    const { service } = createService({
      oauthAppDao: {
        findAccessTokenByHash: vi.fn().mockResolvedValue({
          userId: 'u1',
          scope: 'user:read',
          expiresAt: new Date(Date.now() - 60_000),
        }),
      },
    })
    await expect(service.getUserInfo('oat_expired')).rejects.toThrow('Access token expired')
  })
})

/* ═══════════════════════════════════════════════════════
   Consent Management
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — Consent Management', () => {
  it('listUserConsents returns enriched consent list', async () => {
    const { service } = createService({
      oauthAppDao: {
        findConsentsByUserId: vi
          .fn()
          .mockResolvedValue([{ appId: 'app-1', scope: 'user:read', createdAt: new Date() }]),
        findById: vi.fn().mockResolvedValue({
          id: 'app-1',
          name: 'Demo App',
          logoUrl: null,
        }),
      },
    })

    const result = await service.listUserConsents('user-1')
    expect(result).toHaveLength(1)
    expect(result[0].appName).toBe('Demo App')
    expect(result[0].scope).toBe('user:read')
  })

  it('revokeConsent revokes tokens and deletes consent', async () => {
    const { service, oauthAppDao } = createService({
      oauthAppDao: {
        revokeRefreshTokensByAppAndUser: vi.fn(),
        deleteAccessTokensByAppAndUser: vi.fn(),
        deleteConsent: vi.fn(),
      },
    })

    await service.revokeConsent('user-1', 'app-1')
    expect(oauthAppDao.revokeRefreshTokensByAppAndUser).toHaveBeenCalledWith('app-1', 'user-1')
    expect(oauthAppDao.deleteAccessTokensByAppAndUser).toHaveBeenCalledWith('app-1', 'user-1')
    expect(oauthAppDao.deleteConsent).toHaveBeenCalledWith('user-1', 'app-1')
  })
})

/* ═══════════════════════════════════════════════════════
   OAuth API: Resource Endpoints
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — Resource API', () => {
  it('getServers delegates to serverService', async () => {
    const { service } = createService({
      serverService: {
        getUserServers: vi.fn().mockResolvedValue([
          {
            server: {
              id: 's1',
              name: 'Server 1',
              slug: 'server-1',
              iconUrl: null,
              isPublic: true,
            },
          },
        ]),
      },
    })

    const result = await service.getServers('user-1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Server 1')
  })

  it('createServer delegates to serverService', async () => {
    const { service } = createService({
      serverService: {
        create: vi.fn().mockResolvedValue({
          id: 's2',
          name: 'New Server',
          slug: 'new-server',
          iconUrl: null,
          isPublic: false,
        }),
      },
    })

    const result = await service.createServer('user-1', { name: 'New Server' })
    expect(result.id).toBe('s2')
    expect(result.name).toBe('New Server')
  })

  it('getChannels delegates to channelService', async () => {
    const { policyService, service } = createService({
      policyService: {
        requireServerMember: vi.fn(),
        accessibleChannelIds: vi.fn().mockResolvedValue(['ch1']),
      },
      channelService: {
        getByServerId: vi
          .fn()
          .mockResolvedValue([{ id: 'ch1', name: 'general', type: 'text', topic: null }]),
      },
    })

    const result = await service.getChannels('user-1', 's1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('general')
    expect(policyService.requireServerMember).toHaveBeenCalledWith('user-1', 's1')
  })

  it('getChannels filters channels outside the actor access set', async () => {
    const { service } = createService({
      policyService: {
        requireServerMember: vi.fn(),
        accessibleChannelIds: vi.fn().mockResolvedValue(['ch1']),
      },
      channelService: {
        getByServerId: vi.fn().mockResolvedValue([
          { id: 'ch1', name: 'general', type: 'text', topic: null },
          { id: 'ch2', name: 'private', type: 'text', topic: null },
        ]),
      },
    })

    const result = await service.getChannels('user-1', 's1')
    expect(result.map((channel) => channel.id)).toEqual(['ch1'])
  })

  it('createChannel delegates to channelService', async () => {
    const { service } = createService({
      channelService: {
        create: vi.fn().mockResolvedValue({
          id: 'ch2',
          name: 'api-channel',
          type: 'text',
          topic: null,
        }),
      },
    })

    const result = await service.createChannel('user-1', {
      serverId: 's1',
      name: 'api-channel',
    })
    expect(result.id).toBe('ch2')
    expect(result.name).toBe('api-channel')
  })

  it('getMessages delegates to messageService', async () => {
    const { policyService, service } = createService({
      messageService: {
        getByChannelId: vi.fn().mockResolvedValue({
          messages: [
            { id: 'm1', content: 'hi', channelId: 'ch1', authorId: 'u1', createdAt: new Date() },
          ],
          hasMore: false,
        }),
      },
    })

    const result = await service.getMessages('user-1', 'ch1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toBe('hi')
    expect(policyService.requireChannelRead).toHaveBeenCalledWith('user-1', 'ch1')
  })

  it('getMessages rejects when the actor cannot read the channel', async () => {
    const { messageService, service } = createService({
      policyService: {
        requireChannelRead: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('denied'), { status: 403 })),
      },
    })

    await expect(service.getMessages('user-1', 'ch1')).rejects.toThrow('denied')
    expect(messageService.getByChannelId).not.toHaveBeenCalled()
  })

  it('sendMessage delegates to messageService', async () => {
    const now = new Date()
    const { service } = createService({
      messageService: {
        send: vi.fn().mockResolvedValue({
          id: 'm2',
          content: 'hello',
          channelId: 'ch1',
          authorId: 'u1',
          createdAt: now,
        }),
      },
    })

    const result = await service.sendMessage('user-1', 'ch1', { content: 'hello' })
    expect(result.id).toBe('m2')
    expect(result.content).toBe('hello')
  })

  it('sendMessage normalizes OAuth link cards for the token app origin', async () => {
    const now = new Date()
    const appId = '11111111-1111-4111-8111-111111111111'
    const messageService = {
      send: vi.fn().mockImplementation((_channelId, _authorId, input) =>
        Promise.resolve({
          id: 'm3',
          content: input.content,
          channelId: 'ch1',
          authorId: 'user-1',
          createdAt: now,
          metadata: input.metadata,
        }),
      ),
    }
    const { service } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({
          id: appId,
          clientId: 'shadow_client',
          name: 'Card App',
          description: 'Embedded card app',
          homepageUrl: 'https://app.example.com',
          logoUrl: 'https://app.example.com/icon.png',
          redirectUris: ['https://app.example.com/callback'],
          isActive: true,
        }),
      },
      messageService,
    })

    const result = await service.sendMessage(oauthActor({ appId }), 'ch1', {
      content: 'open this',
      metadata: {
        oauthLinkCards: [
          {
            kind: 'oauth_link',
            appId,
            title: 'Example Card',
            url: 'https://app.example.com/card',
          },
        ],
      },
    })

    expect(messageService.send).toHaveBeenCalledWith(
      'ch1',
      'user-1',
      expect.objectContaining({
        metadata: {
          oauthLinkCards: [
            expect.objectContaining({
              appId,
              clientId: 'shadow_client',
              title: 'Example Card',
              description: 'Embedded card app',
              iconUrl: 'https://app.example.com/icon.png',
              meta: expect.objectContaining({
                appName: 'Card App',
                avatarUrl: 'https://app.example.com/icon.png',
                iconUrl: 'https://app.example.com/icon.png',
                homepageUrl: 'https://app.example.com/',
                origin: 'https://app.example.com',
              }),
              url: 'https://app.example.com/card',
              embedUrl: 'https://app.example.com/card',
              fallbackUrl: 'https://app.example.com/card',
              action: { mode: 'open_iframe' },
            }),
          ],
        },
      }),
    )
    expect(result.metadata?.oauthLinkCards).toHaveLength(1)
  })

  it('sendMessage reads OAuth link card meta from registered app origins', async () => {
    const appId = '11111111-1111-4111-8111-111111111111'
    const messageService = {
      send: vi.fn().mockResolvedValue({
        id: 'msg-1',
        content: 'open this',
        metadata: {
          oauthLinkCards: [],
        },
      }),
    }
    const { service } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({
          id: appId,
          clientId: 'shadow_client',
          name: 'Card App',
          description: null,
          homepageUrl: 'https://app.example.com',
          logoUrl: null,
          redirectUris: ['https://app.example.com/callback'],
          isActive: true,
        }),
      },
      messageService,
    })

    await service.sendMessage(oauthActor({ appId }), 'ch1', {
      content: 'open this',
      metadata: {
        oauthLinkCards: [
          {
            kind: 'oauth_link',
            appId,
            title: 'Example Card',
            url: 'https://app.example.com/card',
            meta: {
              appName: 'Meta App',
              avatarUrl: 'https://app.example.com/avatar.png',
              coverUrl: 'https://app.example.com/cover.png',
            },
          },
        ],
      },
    })

    expect(messageService.send).toHaveBeenCalledWith(
      'ch1',
      'user-1',
      expect.objectContaining({
        metadata: {
          oauthLinkCards: [
            expect.objectContaining({
              iconUrl: 'https://app.example.com/avatar.png',
              meta: expect.objectContaining({
                appName: 'Meta App',
                avatarUrl: 'https://app.example.com/avatar.png',
                iconUrl: 'https://app.example.com/avatar.png',
                coverUrl: 'https://app.example.com/cover.png',
                origin: 'https://app.example.com',
              }),
            }),
          ],
        },
      }),
    )
  })

  it('sendMessage rejects OAuth link cards from unregistered origins', async () => {
    const appId = '11111111-1111-4111-8111-111111111111'
    const messageService = { send: vi.fn() }
    const { service } = createService({
      oauthAppDao: {
        findById: vi.fn().mockResolvedValue({
          id: appId,
          clientId: 'shadow_client',
          name: 'Card App',
          homepageUrl: 'https://app.example.com',
          logoUrl: null,
          redirectUris: ['https://app.example.com/callback'],
          isActive: true,
        }),
      },
      messageService,
    })

    await expect(
      service.sendMessage(oauthActor({ appId }), 'ch1', {
        content: 'open this',
        metadata: {
          oauthLinkCards: [
            {
              kind: 'oauth_link',
              appId,
              title: 'Bad Card',
              url: 'https://evil.example.com/card',
            },
          ],
        },
      }),
    ).rejects.toThrow('origin is not registered')
    expect(messageService.send).not.toHaveBeenCalled()
  })

  it('getWorkspace delegates to workspaceService', async () => {
    const { service } = createService({
      workspaceService: {
        getById: vi.fn().mockResolvedValue({
          id: 'w1',
          name: 'Workspace 1',
          description: 'test',
          serverId: 's1',
        }),
      },
    })

    const result = await service.getWorkspace('user-1', 'w1')
    expect(result.id).toBe('w1')
    expect(result.name).toBe('Workspace 1')
  })

  it('getWorkspace throws 404 for missing workspace', async () => {
    const { service } = createService({
      workspaceService: { getById: vi.fn().mockResolvedValue(null) },
    })
    await expect(service.getWorkspace('user-1', 'missing')).rejects.toThrow('Workspace not found')
  })

  it('inviteToServer joins target user', async () => {
    const { service, serverService } = createService({
      serverService: {
        getById: vi.fn().mockResolvedValue({
          id: 's1',
          inviteCode: 'abc12345',
        }),
        join: vi.fn(),
      },
    })

    const result = await service.inviteToServer('user-1', 's1', 'target-user')
    expect(result.ok).toBe(true)
    expect(serverService.join).toHaveBeenCalledWith('abc12345', 'target-user')
  })

  it('inviteToServer throws 404 for missing server', async () => {
    const { service } = createService({
      serverService: { getById: vi.fn().mockResolvedValue(null) },
    })
    await expect(service.inviteToServer('user-1', 'missing', 'u1')).rejects.toThrow(
      'Server not found',
    )
  })
})

/* ═══════════════════════════════════════════════════════
   Buddies
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — Buddies', () => {
  it('createBuddy creates user + agent', async () => {
    const { service, userDao, agentService, oauthAppDao } = createService({
      userDao: {
        create: vi.fn().mockResolvedValue({ id: 'bot-user-1' }),
      },
      agentService: {
        create: vi.fn().mockResolvedValue({ id: 'agent-1' }),
      },
      oauthAppDao: {
        updateBuddyUser: vi.fn(),
        updateBuddyAgent: vi.fn(),
      },
    })

    const result = await service.createBuddy(oauthActor(), { name: 'My Buddy' })
    expect(result.userId).toBe('bot-user-1')
    expect(result.agentId).toBe('agent-1')
    expect(userDao.create).toHaveBeenCalledOnce()
    expect(agentService.create).toHaveBeenCalledOnce()
    expect(oauthAppDao.updateBuddyUser).toHaveBeenCalledWith('bot-user-1', {
      isBot: true,
      oauthAppId: 'app-1',
      parentUserId: 'user-1',
    })
    expect(oauthAppDao.updateBuddyAgent).toHaveBeenCalledWith('agent-1', {
      oauthAppId: 'app-1',
      buddyUserId: 'bot-user-1',
    })
  })

  it('sendBuddyMessage sends as the buddy user', async () => {
    const now = new Date()
    const { service } = createService({
      agentService: {
        getById: vi.fn().mockResolvedValue({ id: 'agent-1', oauthAppId: 'app-1' }),
      },
      oauthAppDao: {
        getBuddyUserId: vi.fn().mockResolvedValue('bot-user-1'),
      },
      messageService: {
        send: vi.fn().mockResolvedValue({
          id: 'm10',
          content: 'Hi from buddy',
          channelId: 'ch1',
          authorId: 'bot-user-1',
          createdAt: now,
        }),
      },
    })

    const result = await service.sendBuddyMessage(oauthActor(), 'agent-1', {
      channelId: 'ch1',
      content: 'Hi from buddy',
    })
    expect(result.id).toBe('m10')
    expect(result.authorId).toBe('bot-user-1')
  })

  it('sendBuddyMessage throws 404 if agent not found', async () => {
    const { service } = createService({
      agentService: { getById: vi.fn().mockResolvedValue(null) },
    })
    await expect(
      service.sendBuddyMessage(oauthActor(), 'missing', { channelId: 'ch1', content: 'hi' }),
    ).rejects.toThrow('Buddy not found')
  })

  it('sendBuddyMessage throws 404 if buddy user not found', async () => {
    const { service } = createService({
      agentService: { getById: vi.fn().mockResolvedValue({ id: 'agent-1', oauthAppId: 'app-1' }) },
      oauthAppDao: { getBuddyUserId: vi.fn().mockResolvedValue(null) },
    })
    await expect(
      service.sendBuddyMessage(oauthActor(), 'agent-1', { channelId: 'ch1', content: 'hi' }),
    ).rejects.toThrow('Buddy user not found')
  })

  it('sendBuddyMessage hides buddies owned by a different OAuth app', async () => {
    const { oauthAppDao, service } = createService({
      agentService: {
        getById: vi.fn().mockResolvedValue({ id: 'agent-1', oauthAppId: 'other-app' }),
      },
    })
    await expect(
      service.sendBuddyMessage(oauthActor(), 'agent-1', { channelId: 'ch1', content: 'hi' }),
    ).rejects.toThrow('Buddy not found')
    expect(oauthAppDao.getBuddyUserId).not.toHaveBeenCalled()
  })
})

/* ═══════════════════════════════════════════════════════
   VALID_OAUTH_SCOPES export
   ═══════════════════════════════════════════════════════ */

describe('OAuthService — Scopes', () => {
  it('exports 16 valid scopes', () => {
    expect(VALID_OAUTH_SCOPES).toHaveLength(16)
    expect(VALID_OAUTH_SCOPES).toContain('user:read')
    expect(VALID_OAUTH_SCOPES).toContain('buddies:manage')
    expect(VALID_OAUTH_SCOPES).toContain('commerce:read')
    expect(VALID_OAUTH_SCOPES).toContain('commerce:write')
  })
})
