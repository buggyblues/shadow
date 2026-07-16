import { afterEach, describe, expect, it, vi } from 'vitest'
import { decrypt, encrypt } from '../src/lib/kms'
import {
  CloudConnectorService,
  connectorSecretRef,
  parseConnectorSecretRef,
} from '../src/services/cloud-connector.service'

const connectionId = '00000000-0000-4000-8000-000000000099'

describe('CloudConnectorService', () => {
  afterEach(() => {
    delete process.env.CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_ID
    delete process.env.CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_SECRET
    delete process.env.CLOUD_CONNECTOR_OAUTH_CANVA_CLIENT_ID
    delete process.env.CLOUD_CONNECTOR_OAUTH_CANVA_CLIENT_SECRET
    delete process.env.CLOUD_CONNECTOR_OAUTH_GOOGLE_WORKSPACE_CLIENT_ID
    delete process.env.CLOUD_CONNECTOR_OAUTH_GOOGLE_WORKSPACE_CLIENT_SECRET
    delete process.env.GITHUB_CLIENT_ID
    delete process.env.GITHUB_CLIENT_SECRET
  })

  it('keeps template-only plugin mechanisms out of the cloud computer connector catalog', () => {
    const service = new CloudConnectorService({
      cloudConnectorDao: {} as never,
      safeHttpClient: {} as never,
    })

    const ids = service.listCatalog().map((connector) => connector.id)
    expect(ids).not.toEqual(
      expect.arrayContaining([
        'agent-pack',
        'claude-plugin',
        'model-provider',
        'shadowob',
        'skills',
      ]),
    )
    expect(ids).toEqual(expect.arrayContaining(['opencli', 'playwright', 'github']))
  })

  it('localizes connector presentation without losing icon provenance', () => {
    const service = new CloudConnectorService({
      cloudConnectorDao: {} as never,
      safeHttpClient: {} as never,
    })

    const englishGithub = service.listCatalog('en').find((connector) => connector.id === 'github')
    const chineseGithub = service
      .listCatalog('zh-CN')
      .find((connector) => connector.id === 'github')
    const chineseLark = service.listCatalog('zh-CN').find((connector) => connector.id === 'lark')
    const japaneseGithub = service
      .listCatalog('ja-JP')
      .find((connector) => connector.id === 'github')

    expect(englishGithub?.description).toContain('Connect GitHub')
    expect(chineseGithub?.description).toContain('连接 GitHub')
    expect(chineseLark?.name).toBe('飞书 / Lark')
    expect(japaneseGithub?.description).toContain('GitHub と接続')
    expect(chineseGithub?.iconDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(chineseGithub?.iconSource).toMatchObject({
      website: 'https://github.com',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('resolves encrypted credential references only for the owning user at deployment time', async () => {
    const touchConnection = vi.fn(async () => undefined)
    const findConnectionByIdForUser = vi.fn(async () => ({
      id: connectionId,
      pluginId: 'github',
      authType: 'token',
      status: 'active',
      credentialsEncrypted: encrypt(
        JSON.stringify({ GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_runtime_secret' }),
      ),
    }))
    const service = new CloudConnectorService({
      cloudConnectorDao: { findConnectionByIdForUser, touchConnection } as never,
      safeHttpClient: {} as never,
    })

    const storedReference = connectorSecretRef(connectionId, 'GITHUB_PERSONAL_ACCESS_TOKEN')
    const resolved = await service.resolveRuntimeEnvVars('user-1', {
      GITHUB_PERSONAL_ACCESS_TOKEN: storedReference,
      PLAIN_SETTING: 'kept',
    })

    expect(resolved).toEqual({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_runtime_secret',
      PLAIN_SETTING: 'kept',
    })
    expect(findConnectionByIdForUser).toHaveBeenCalledWith(connectionId, 'user-1')
    expect(touchConnection).toHaveBeenCalledWith(connectionId)
    expect(storedReference).not.toContain('ghp_runtime_secret')
  })

  it('validates GitHub credentials before encrypting and storing the account summary', async () => {
    const upsertConnection = vi.fn(async (input: Record<string, unknown>) => ({
      id: connectionId,
      ...input,
    }))
    const service = new CloudConnectorService({
      cloudConnectorDao: {
        findConnection: vi.fn(async () => null),
        upsertConnection,
      } as never,
      safeHttpClient: {
        fetch: vi.fn(
          async () =>
            new Response(
              JSON.stringify({ id: 42, login: 'octocat', avatar_url: 'https://avatar' }),
              {
                status: 200,
                headers: { 'x-oauth-scopes': 'repo, read:user' },
              },
            ),
        ),
      } as never,
    })

    const result = await service.saveConnection('user-1', 'github', {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_valid',
    })

    expect(result.verification).toEqual({
      verified: true,
      profile: {
        accountId: '42',
        accountName: 'octocat',
        avatarUrl: 'https://avatar',
        scopes: ['repo', 'read:user'],
      },
    })
    const stored = upsertConnection.mock.calls[0]?.[0]
    expect(stored).toBeDefined()
    expect(stored?.credentialsEncrypted).not.toContain('ghp_valid')
    expect(JSON.parse(decrypt(String(stored?.credentialsEncrypted)))).toEqual({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_valid',
    })
  })

  it('rejects malformed secret references instead of treating them as credentials', () => {
    expect(parseConnectorSecretRef(connectorSecretRef(connectionId, 'NOTION_TOKEN'))).toEqual({
      connectionId,
      field: 'NOTION_TOKEN',
    })
    expect(parseConnectorSecretRef('__SHADOW_CLOUD_CONNECTOR__:bad:TOKEN')).toBeNull()
    expect(parseConnectorSecretRef('plain-value')).toBeNull()
  })

  it('uses state, PKCE and encrypted token storage for OAuth authorization', async () => {
    process.env.CLOUD_CONNECTOR_OAUTH_CANVA_CLIENT_ID = 'canva-client'
    process.env.CLOUD_CONNECTOR_OAUTH_CANVA_CLIENT_SECRET = 'canva-secret'
    let pending: Record<string, unknown> | null = null
    const upsertConnection = vi.fn(async (input: Record<string, unknown>) => ({
      id: connectionId,
      ...input,
    }))
    const finishOAuthState = vi.fn(async () => null)
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'oauth-access-token',
          refresh_token: 'oauth-refresh-token',
          expires_in: 3600,
          scope: 'design:meta:read profile:read',
        }),
        { status: 200 },
      ),
    )
    const service = new CloudConnectorService({
      cloudConnectorDao: {
        createOAuthState: vi.fn(async (data: Record<string, unknown>) => {
          pending = {
            id: '00000000-0000-4000-8000-000000000200',
            ...data,
            status: 'pending',
            error: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          return pending
        }),
        claimOAuthState: vi.fn(async () => pending),
        findConnection: vi.fn(async () => null),
        upsertConnection,
        finishOAuthState,
      } as never,
      safeHttpClient: { fetch } as never,
    })

    const started = await service.startOAuthAuthorization({
      userId: 'user-1',
      pluginId: 'canva',
      cloudComputerId: 'cc-test',
      redirectUri: 'https://shadow.example/api/cloud-computers/oauth/callback',
    })
    const authorizationUrl = new URL(started.authorizationUrl)
    const state = authorizationUrl.searchParams.get('state')
    expect(state).toBeTruthy()
    expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy()
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(String(pending?.codeVerifierEncrypted)).not.toContain('oauth-access-token')

    const completed = await service.completeOAuthAuthorization({
      state: state ?? '',
      code: 'authorization-code',
    })
    expect(completed).toMatchObject({ pluginId: 'canva', cloudComputerId: 'cc-test' })
    const tokenRequest = fetch.mock.calls[0]
    expect(String(tokenRequest?.[1]?.body)).toContain('code_verifier=')
    const stored = upsertConnection.mock.calls[0]?.[0]
    expect(stored?.authType).toBe('oauth2')
    expect(stored?.credentialFields).toEqual(['CANVA_ACCESS_TOKEN'])
    const savedCredentials = JSON.parse(decrypt(String(stored?.credentialsEncrypted)))
    expect(savedCredentials.CANVA_ACCESS_TOKEN).toBe('oauth-access-token')
    expect(savedCredentials.__SHADOW_OAUTH_REFRESH_TOKEN).toBe('oauth-refresh-token')
    expect(finishOAuthState).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000200', {
      status: 'completed',
    })
  })

  it('refreshes an expiring OAuth token before resolving a runtime secret reference', async () => {
    process.env.CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_ID = 'github-client'
    process.env.CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_SECRET = 'github-secret'
    const updateConnectionCredentials = vi.fn(async () => null)
    const fetch = vi.fn(async () =>
      Response.json({
        access_token: 'fresh-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
      }),
    )
    const service = new CloudConnectorService({
      cloudConnectorDao: {
        findConnectionByIdForUser: vi.fn(async () => ({
          id: connectionId,
          pluginId: 'github',
          authType: 'oauth2',
          status: 'active',
          credentialsEncrypted: encrypt(
            JSON.stringify({
              GITHUB_PERSONAL_ACCESS_TOKEN: 'expired-access-token',
              __SHADOW_OAUTH_REFRESH_TOKEN: 'refresh-token',
              __SHADOW_OAUTH_EXPIRES_AT: new Date(Date.now() - 1_000).toISOString(),
            }),
          ),
        })),
        updateConnectionCredentials,
        touchConnection: vi.fn(async () => undefined),
      } as never,
      safeHttpClient: { fetch } as never,
    })

    const resolved = await service.resolveRuntimeEnvVars('user-1', {
      GITHUB_PERSONAL_ACCESS_TOKEN: connectorSecretRef(
        connectionId,
        'GITHUB_PERSONAL_ACCESS_TOKEN',
      ),
    })

    expect(resolved.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('fresh-access-token')
    expect(String(fetch.mock.calls[0]?.[1]?.body)).toContain('grant_type=refresh_token')
    expect(String(fetch.mock.calls[0]?.[1]?.body)).toContain('refresh_token=refresh-token')
    const encrypted = updateConnectionCredentials.mock.calls[0]?.[2]
    const persisted = JSON.parse(decrypt(String(encrypted)))
    expect(persisted.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('fresh-access-token')
    expect(persisted.__SHADOW_OAUTH_REFRESH_TOKEN).toBe('rotated-refresh-token')
  })

  it('reuses the platform GitHub OAuth app and its registered callback', async () => {
    process.env.GITHUB_CLIENT_ID = 'platform-github-client'
    process.env.GITHUB_CLIENT_SECRET = 'platform-github-secret'
    const service = new CloudConnectorService({
      cloudConnectorDao: {
        findOAuthStateByHash: vi.fn(async () => ({ id: 'flow-1' })),
      } as never,
      safeHttpClient: {} as never,
    })

    const github = service.listCatalog().find((connector) => connector.id === 'github')
    expect(github?.oauth).toMatchObject({ available: true, configured: true })
    expect(service.getOAuthCallbackPath('github')).toBe('/api/auth/oauth/github/callback')
    expect(await service.hasOAuthAuthorizationState('opaque-state')).toBe(true)
  })

  it('exposes Google Workspace OAuth and validates its runtime access token', async () => {
    process.env.CLOUD_CONNECTOR_OAUTH_GOOGLE_WORKSPACE_CLIENT_ID = 'google-client'
    process.env.CLOUD_CONNECTOR_OAUTH_GOOGLE_WORKSPACE_CLIENT_SECRET = 'google-secret'
    const upsertConnection = vi.fn(async (input: Record<string, unknown>) => ({
      id: connectionId,
      ...input,
    }))
    const fetch = vi.fn(async () =>
      Response.json({
        sub: 'google-account-1',
        email: 'buddy@example.com',
        name: 'Buddy User',
        picture: 'https://example.com/avatar.png',
      }),
    )
    const service = new CloudConnectorService({
      cloudConnectorDao: {
        findConnection: vi.fn(async () => null),
        upsertConnection,
      } as never,
      safeHttpClient: { fetch } as never,
    })

    const google = service.listCatalog().find((connector) => connector.id === 'google-workspace')
    expect(google?.oauth).toMatchObject({ available: true, configured: true })
    expect(google?.authFields.map((field) => field.key)).toContain('GOOGLE_WORKSPACE_CLI_TOKEN')

    const result = await service.saveConnection('user-1', 'google-workspace', {
      GOOGLE_WORKSPACE_CLI_TOKEN: 'ya29.valid',
    })
    expect(fetch).toHaveBeenCalledWith('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ya29.valid' },
    })
    expect(result.verification).toEqual({
      verified: true,
      profile: {
        accountId: 'google-account-1',
        accountName: 'Buddy User',
        avatarUrl: 'https://example.com/avatar.png',
      },
    })
    expect(upsertConnection.mock.calls[0]?.[0]?.credentialFields).toEqual([
      'GOOGLE_WORKSPACE_CLI_TOKEN',
    ])
  })

  it('maps Google Workspace OAuth tokens into the gws runtime credential', async () => {
    process.env.CLOUD_CONNECTOR_OAUTH_GOOGLE_WORKSPACE_CLIENT_ID = 'google-client'
    process.env.CLOUD_CONNECTOR_OAUTH_GOOGLE_WORKSPACE_CLIENT_SECRET = 'google-secret'
    let pending: Record<string, unknown> | null = null
    const upsertConnection = vi.fn(async (input: Record<string, unknown>) => ({
      id: connectionId,
      ...input,
    }))
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'ya29.oauth-access',
          refresh_token: 'google-refresh-token',
          expires_in: 3600,
          scope: 'openid email',
        }),
      )
      .mockResolvedValueOnce(Response.json({ sub: 'google-account-1', email: 'buddy@example.com' }))
    const service = new CloudConnectorService({
      cloudConnectorDao: {
        createOAuthState: vi.fn(async (data: Record<string, unknown>) => {
          pending = {
            id: '00000000-0000-4000-8000-000000000201',
            ...data,
            status: 'pending',
            error: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          return pending
        }),
        claimOAuthState: vi.fn(async () => pending),
        findConnection: vi.fn(async () => null),
        upsertConnection,
        finishOAuthState: vi.fn(async () => null),
      } as never,
      safeHttpClient: { fetch } as never,
    })

    const started = await service.startOAuthAuthorization({
      userId: 'user-1',
      pluginId: 'google-workspace',
      cloudComputerId: 'cc-test',
      redirectUri: 'https://shadow.example/api/cloud-computers/oauth/callback',
    })
    const authorizationUrl = new URL(started.authorizationUrl)
    expect(authorizationUrl.searchParams.get('access_type')).toBe('offline')
    expect(authorizationUrl.searchParams.get('prompt')).toBe('consent')

    await service.completeOAuthAuthorization({
      state: authorizationUrl.searchParams.get('state') ?? '',
      code: 'google-authorization-code',
    })

    expect(fetch.mock.calls[1]?.[0]).toBe('https://openidconnect.googleapis.com/v1/userinfo')
    const stored = upsertConnection.mock.calls[0]?.[0]
    expect(stored?.authType).toBe('oauth2')
    expect(stored?.credentialFields).toEqual(['GOOGLE_WORKSPACE_CLI_TOKEN'])
    const credentials = JSON.parse(decrypt(String(stored?.credentialsEncrypted)))
    expect(credentials.GOOGLE_WORKSPACE_CLI_TOKEN).toBe('ya29.oauth-access')
    expect(credentials.__SHADOW_OAUTH_REFRESH_TOKEN).toBe('google-refresh-token')
  })
})
