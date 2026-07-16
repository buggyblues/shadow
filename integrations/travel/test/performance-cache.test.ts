import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/src/app.js'
import { createAppContainer } from '../server/src/container.js'
import { ShadowGateway } from '../server/src/gateways/shadow.gateway.js'
import { IdentityService } from '../server/src/services/identity.service.js'
import type { RequestContext } from '../server/src/types.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  delete process.env.TRAVEL_DATA_FILE
  delete process.env.TRAVEL_REQUIRE_OAUTH
  delete process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN
  vi.unstubAllGlobals()
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('travel request performance', () => {
  it('reuses an active OAuth session lookup and invalidates it on revoke', async () => {
    const findSessionByTokenHash = vi.fn(async () => ({
      account: {
        id: 'account-1',
        primaryShadowUserId: 'user-1',
        username: 'traveler',
      },
      session: {
        id: 'session-1',
        accountId: 'account-1',
        scope: 'user:read',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        tokenHash: 'opaque',
      },
    }))
    const service = new IdentityService({
      findSessionByTokenHash,
      revokeSession: vi.fn(async () => true),
    } as never)

    await service.readSession('session-token')
    await service.readSession('session-token')
    expect(findSessionByTokenHash).toHaveBeenCalledTimes(1)

    await service.revokeSession('session-token')
    await service.readSession('session-token')
    expect(findSessionByTokenHash).toHaveBeenCalledTimes(2)
  })

  it('coalesces and caches the Space member directory', async () => {
    process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN = 'installation-token'
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'membership-1',
              userId: 'user-1',
              nickname: 'Traveler',
              user: { id: 'user-1', username: 'traveler' },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchImpl)
    const gateway = new ShadowGateway()
    const context = { serverId: 'server-1' } as RequestContext

    const [first, second] = await Promise.all([
      gateway.listHumanMembers(context),
      gateway.listHumanMembers(context),
    ])
    const third = await gateway.listHumanMembers(context)

    expect(first).toEqual(second)
    expect(third).toEqual(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('uses the launch-scoped member endpoint when no installation credential exists', async () => {
    const payload = Buffer.from(
      JSON.stringify({ serverId: 'server-launch', appKey: 'travel' }),
    ).toString('base64url')
    const launchToken = `sat_v1.${payload}.signature`
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            members: [{ userId: 'user-1', displayName: 'Traveler', kind: 'user' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchImpl)
    const gateway = new ShadowGateway()

    await expect(
      gateway.listHumanMembers({
        serverId: 'server-launch',
        launch: { token: launchToken },
      } as RequestContext),
    ).resolves.toMatchObject({
      connected: true,
      members: [{ userId: 'user-1', displayName: 'Traveler' }],
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3002/api/servers/server-launch/space-apps/travel/launch/members',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${launchToken}` }),
      }),
    )
  })

  it('exchanges a launch token once and reuses the Space App session across an API burst', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-performance-'))
    temporaryDirectories.push(directory)
    process.env.TRAVEL_DATA_FILE = join(directory, 'state.json')
    process.env.TRAVEL_REQUIRE_OAUTH = 'false'
    const payload = Buffer.from(
      JSON.stringify({
        serverId: 'server-performance',
        appKey: 'travel',
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    ).toString('base64url')
    const launchToken = `sat_v1.${payload}.signature`
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            active: true,
            shadow: {
              protocol: 'shadow.space-app/1',
              serverId: 'server-performance',
              spaceAppId: 'app-performance',
              appKey: 'travel',
              actor: {
                kind: 'user',
                userId: 'user-performance',
                ownerId: 'user-performance',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetchImpl)
    const app = createApp(await createAppContainer())
    const legacyExchange = await app.request('/api/shadow/session', {
      method: 'POST',
      headers: { 'x-shadow-launch-token': launchToken },
    })
    expect(legacyExchange.status).toBe(401)
    expect(fetchImpl).not.toHaveBeenCalled()
    const exchange = await app.request('/api/shadow/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${launchToken}` },
    })
    expect(exchange.status).toBe(200)
    const cookie = exchange.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toContain('space_app_session_travel=')
    const headers = { cookie: cookie ?? '' }

    const [bootstrap, trips] = await Promise.all([
      app.request('/api/bootstrap', { headers }),
      app.request('/api/trips', { headers }),
    ])

    expect(bootstrap.status).toBe(200)
    expect(trips.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(bootstrap.headers.get('server-timing')).toMatch(
      /^auth;dur=\d+\.\d, handler;dur=\d+\.\d, total;dur=\d+\.\d$/,
    )
    expect(bootstrap.headers.get('x-request-id')).toMatch(/^req_/)

    const removedRoute = await app.request('/shadow/session/launch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${launchToken}` },
    })
    expect(removedRoute.status).toBe(404)
  })
})
