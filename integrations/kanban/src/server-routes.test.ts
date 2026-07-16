import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './server.js'

afterEach(() => vi.unstubAllGlobals())

function launchToken(serverId: string, appKey: string) {
  const payload = Buffer.from(
    JSON.stringify({ serverId, appKey, exp: Math.floor(Date.now() / 1_000) + 600 }),
  ).toString('base64url')
  return `sat_v1.${payload}.signature`
}

describe('Kanban App routes', () => {
  it('does not expose legacy local command routes', async () => {
    const response = await app.request('/api/local/commands/boards.get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    })

    expect(response.status).toBe(404)
  })

  it('does not expose the legacy board REST route', async () => {
    const response = await app.request('/api/board')

    expect(response.status).toBe(404)
  })

  it('blocks runtime inbox lookup without a Space App session', async () => {
    const response = await app.request('/api/inboxes')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'launch_required',
    })
  })

  it('exchanges launch once and serves commands through the opaque Space App session', async () => {
    const platformFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (input.toString().endsWith('/events')) {
        return new Response('event: ready\ndata: {}\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      return new Response(
        JSON.stringify({
          active: true,
          exp: Math.floor(Date.now() / 1_000) + 600,
          shadow: {
            serverId: 'space-1',
            spaceAppId: 'kanban-installation',
            appKey: 'kanban',
            actor: {
              kind: 'user',
              userId: 'user-1',
              ownerId: 'user-1',
              profile: { id: 'user-1', displayName: 'Alice' },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', platformFetch)
    const token = launchToken('space-1', 'kanban')
    const exchange = await app.request('/api/shadow/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(exchange.status).toBe(200)
    const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
    const exchangeBody = (await exchange.json()) as { csrfToken: string }
    expect(cookie).toBeTruthy()
    expect(exchange.headers.get('set-cookie')).not.toContain(token)

    const command = await app.request('/api/commands/boards.list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie!,
        'X-Shadow-Space-App-CSRF': exchangeBody.csrfToken,
      },
      body: JSON.stringify({ input: {} }),
    })
    expect(command.status).toBe(200)
    await expect(command.json()).resolves.toMatchObject({ ok: true })
    expect(platformFetch).toHaveBeenCalledTimes(1)

    const events = await app.request('/api/shadow/events', {
      headers: { Cookie: cookie!, 'Last-Event-ID': 'event-42' },
    })
    expect(events.status).toBe(200)
    expect(events.headers.get('content-type')).toContain('text/event-stream')
    expect(await events.text()).toContain('event: ready')
    expect(platformFetch).toHaveBeenCalledTimes(2)
    const [eventUrl, eventInit] = platformFetch.mock.calls[1] ?? []
    expect(eventUrl?.toString()).toBe(
      'http://localhost:3002/api/servers/space-1/space-apps/kanban/events',
    )
    expect(eventUrl?.toString()).not.toContain(token)
    expect(eventInit).toMatchObject({
      headers: {
        Authorization: `Bearer ${token}`,
        'Last-Event-ID': 'event-42',
      },
    })
  })
})
