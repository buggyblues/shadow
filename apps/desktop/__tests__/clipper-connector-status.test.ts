import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bridgeMocks = vi.hoisted(() => ({
  readLocalBridgeToken: vi.fn(async () => 'admin-token'),
}))

vi.mock('@shadowob/connector/local-bridge', () => ({
  createLocalBridge: vi.fn(),
  readLocalBridgeToken: bridgeMocks.readLocalBridgeToken,
  resolveLocalBridgeRoot: () => '/tmp/shadow-clipper-library',
}))
vi.mock('../src/main/services/community-session.service', () => ({
  communitySessionService: {
    onAuthChanged: vi.fn(),
    readBridgeSession: vi.fn(async () => ({ accessToken: 'community-token', refreshToken: '' })),
    readStoredAuthTokens: () => ({}),
  },
}))
vi.mock('../src/main/services/logger.service', () => ({
  loggerService: { write: vi.fn() },
}))

describe('Clipper Connector status', () => {
  beforeEach(() => {
    bridgeMocks.readLocalBridgeToken.mockClear()
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
          return Response.json({ ok: true, service: 'shadow-local-bridge' })
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
          return Response.json({ ok: true, service: 'shadow-local-bridge' })
        }
        return Response.json({ clients: [], ok: true })
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )

    const status = await new ClipperConnectorService().getStatus()

    expect(status.connectionState).toBe('waiting')
    expect(status.extensionUrl).toBe('https://clipper.shadowob.com/')
  })

  it('refreshes an older local connection before syncing the signed-in account', async () => {
    let authorizationRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/v1/health')) {
          return Response.json({ ok: true, service: 'shadow-local-bridge' })
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
})
