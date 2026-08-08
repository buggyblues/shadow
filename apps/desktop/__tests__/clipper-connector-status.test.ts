import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bridgeMocks = vi.hoisted(() => ({
  readClipperConnectorToken: vi.fn(async () => 'admin-token'),
}))
const communityMocks = vi.hoisted(() => ({
  storedTokens: {} as { accessToken?: string; refreshToken?: string },
}))

vi.mock('@shadowob/connector/clipper', () => ({
  createClipperConnector: vi.fn(),
  readClipperConnectorToken: bridgeMocks.readClipperConnectorToken,
  resolveClipperConnectorRoot: () => '/tmp/shadow-clipper-library',
}))
vi.mock('../src/main/services/community-session.service', () => ({
  communitySessionService: {
    onAuthChanged: vi.fn(),
    readBridgeSession: vi.fn(async () => ({ accessToken: 'community-token', refreshToken: '' })),
    readStoredAuthTokens: () => communityMocks.storedTokens,
  },
}))
vi.mock('../src/main/services/logger.service', () => ({
  loggerService: { write: vi.fn() },
}))

describe('Clipper Connector status', () => {
  beforeEach(() => {
    bridgeMocks.readClipperConnectorToken.mockClear()
    communityMocks.storedTokens = {}
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a connected development extension without a desktop-prepared copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/v1/health')) {
          return Response.json({ ok: true, service: 'shadow-clipper-connector' })
        }
        if (url.endsWith('/v1/library/status')) {
          return Response.json({
            clients: [
              {
                buildRevision: 'a'.repeat(40),
                clientId: 'development-extension',
                extensionVersion: '0.2.0-dev',
                protocolVersion: 3,
                seenAt: '2026-08-08T12:00:00.000Z',
              },
            ],
            latestSync: '2026-08-08T11:59:00.000Z',
            ok: true,
          })
        }
        return Response.json({ ok: true })
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )

    const status = await new ClipperConnectorService().getStatus()

    expect(status).toMatchObject({
      browserClients: 1,
      communitySyncState: 'signed-out',
      connectionState: 'connected',
      extensionUrl: 'https://clipper.shadowob.com/',
      extensionVersion: '0.2.0-dev',
      lastSyncedAt: '2026-08-08T11:59:00.000Z',
      running: true,
    })
  })

  it('waits for any installed extension when the local connection is running', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/v1/health')) {
          return Response.json({ ok: true, service: 'shadow-clipper-connector' })
        }
        return Response.json({ clients: [], ok: true })
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )

    const status = await new ClipperConnectorService().getStatus()

    expect(status.connectionState).toBe('waiting')
    expect(status.communitySyncState).toBe('signed-out')
    expect(status.extensionUrl).toBe('https://clipper.shadowob.com/')
  })

  it('refreshes an older local connection before syncing the signed-in account', async () => {
    let authorizationRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/v1/health')) {
          return Response.json({ ok: true, service: 'shadow-clipper-connector' })
        }
        if (url.endsWith('/v1/library/status')) {
          return Response.json({
            clients: [
              {
                clientId: 'development-extension',
                extensionVersion: '0.2.0-dev',
                protocolVersion: 3,
                seenAt: '2026-08-08T12:00:00.000Z',
              },
            ],
            ok: true,
          })
        }
        if (url.endsWith('/v1/community/session/authorize')) {
          authorizationRequests += 1
          if (authorizationRequests === 1) {
            return Response.json({ error: 'Not found', ok: false }, { status: 404 })
          }
          return Response.json(
            {
              authorization: {
                expiresAt: '2026-08-08T12:10:00.000Z',
                taskId: 'community-session-task',
              },
              ok: true,
            },
            { status: 201 },
          )
        }
        return Response.json({ ok: true })
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )
    const service = new ClipperConnectorService()
    const status = {
      browserClients: 1,
      clients: [],
      communitySignedIn: true,
      communitySyncState: 'syncing' as const,
      connectionState: 'connected' as const,
      connectionToken: 'admin-token',
      extensionUrl: 'https://clipper.shadowob.com/',
      extensionVersion: '0.2.0-dev',
      files: 0,
      lastSyncedAt: null,
      libraryRoot: '/tmp/shadow-clipper-library',
      ownedByDesktop: true,
      running: true,
      tokenAvailable: true,
      url: 'http://127.0.0.1:32145',
    }
    const start = vi.spyOn(service, 'start').mockResolvedValue(status)
    const stop = vi.spyOn(service, 'stop').mockResolvedValue(status)

    await expect(service.syncCommunitySession(true)).resolves.toEqual({
      expiresAt: '2026-08-08T12:10:00.000Z',
      taskId: 'community-session-task',
    })
    expect(stop).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledOnce()
    expect(authorizationRequests).toBe(2)
  })

  it('reports account synchronization after the connected extension accepts the session', async () => {
    communityMocks.storedTokens = {
      accessToken: 'community-token',
      refreshToken: '',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/v1/health')) {
          return Response.json({ ok: true, service: 'shadow-clipper-connector' })
        }
        if (url.endsWith('/v1/library/status')) {
          return Response.json({
            clients: [
              {
                clientId: 'development-extension',
                extensionVersion: '0.2.0-dev',
                protocolVersion: 3,
                seenAt: '2026-08-08T12:00:00.000Z',
              },
            ],
            ok: true,
          })
        }
        if (url.endsWith('/v1/community/session/authorize')) {
          return Response.json(
            {
              authorization: {
                expiresAt: '2026-08-08T12:10:00.000Z',
                taskId: 'community-session-task',
              },
              ok: true,
            },
            { status: 201 },
          )
        }
        return Response.json({ ok: true })
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )
    const service = new ClipperConnectorService()

    expect((await service.getStatus()).communitySyncState).toBe('syncing')
    await service.syncCommunitySession(false)
    expect((await service.getStatus()).communitySyncState).toBe('synced')
  })

  it('surfaces an account synchronization failure for a useful retry', async () => {
    communityMocks.storedTokens = {
      accessToken: 'community-token',
      refreshToken: '',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/v1/health')) {
          return Response.json({ ok: true, service: 'shadow-clipper-connector' })
        }
        if (url.endsWith('/v1/library/status')) {
          return Response.json({
            clients: [
              {
                clientId: 'development-extension',
                extensionVersion: '0.2.0-dev',
                protocolVersion: 3,
                seenAt: '2026-08-08T12:00:00.000Z',
              },
            ],
            ok: true,
          })
        }
        if (url.endsWith('/v1/community/session/authorize')) {
          return Response.json({ error: 'Authorization failed', ok: false }, { status: 500 })
        }
        return Response.json({ ok: true })
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )
    const service = new ClipperConnectorService()

    await expect(service.syncCommunitySession(true)).rejects.toThrow('Authorization failed')
    expect((await service.getStatus()).communitySyncState).toBe('error')
  })
})
