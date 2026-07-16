import { describe, expect, it, vi } from 'vitest'
import { createShadowSpaceAppClient, ShadowBridge } from '../src/bridge'

type PostedMessage = {
  message: Record<string, unknown>
  targetOrigin: string
}

function launchToken(serverId: string, appKey: string) {
  const payload = Buffer.from(JSON.stringify({ serverId, appKey }), 'utf8').toString('base64url')
  return `sat_v1.${payload}.signature`
}

function createBridgeWindow() {
  const listeners = new Set<(event: MessageEvent) => void>()
  const posted: PostedMessage[] = []
  const parent = {
    postMessage(message: unknown, targetOrigin: string) {
      posted.push({ message: message as Record<string, unknown>, targetOrigin })
    },
  }
  const win = {
    document: { referrer: 'https://community.example/app/spaces/demo' },
    location: {
      assign: vi.fn(),
      pathname: '/shadow/server',
      search: `?shadow_launch=${launchToken('leaked-server', 'leaked-app')}`,
    },
    parent,
    addEventListener(type: string, callback: (event: MessageEvent) => void) {
      if (type === 'message') listeners.add(callback)
    },
    removeEventListener(type: string, callback: (event: MessageEvent) => void) {
      if (type === 'message') listeners.delete(callback)
    },
    clearTimeout,
    setTimeout,
  } as unknown as Window

  return {
    parent,
    posted,
    win,
    respond(message: Record<string, unknown>, options: { origin?: string; source?: unknown } = {}) {
      for (const listener of listeners) {
        listener({
          data: message,
          origin: options.origin ?? 'https://community.example',
          source: options.source ?? parent,
        } as MessageEvent)
      }
    },
  }
}

describe('ShadowBridge', () => {
  it('keeps launch credentials out of URL and session storage', () => {
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge({ appKey: 'travel', windowRef: fixture.win })

    expect(bridge.launchToken()).toBeNull()
    expect('sessionStorage' in fixture.win).toBe(false)
  })

  it('accepts host launch updates and rejects messages from other origins or windows', () => {
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge({ appKey: 'travel', windowRef: fixture.win })
    const token = launchToken('server-1', 'travel')

    fixture.respond(
      { type: ShadowBridge.launchUpdatedEventType, result: { launchToken: token } },
      { origin: 'https://attacker.example' },
    )
    fixture.respond(
      { type: ShadowBridge.launchUpdatedEventType, result: { launchToken: token } },
      { source: {} },
    )
    expect(bridge.launchToken()).toBeNull()

    fixture.respond({
      type: ShadowBridge.launchUpdatedEventType,
      appKey: 'travel',
      result: { launchToken: token, expiresIn: 600 },
    })
    expect(bridge.launchToken()).toBe(token)
  })

  it('exposes only host UI capabilities', async () => {
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge({ appKey: 'travel', windowRef: fixture.win })

    const request = bridge.capabilities()
    const posted = fixture.posted[0]
    expect(posted?.targetOrigin).toBe('https://community.example')
    fixture.respond({
      type: ShadowBridge.capabilitiesResponseType,
      requestId: posted?.message.requestId,
      ok: true,
      result: {
        capabilities: ['channel.open', 'workspace.open', 'oauth.authorize', 'route.navigate'],
      },
    })

    await expect(request).resolves.toEqual({
      capabilities: ['channel.open', 'workspace.open', 'oauth.authorize', 'route.navigate'],
    })
    expect(ShadowBridge).not.toHaveProperty('ensureChannelRequestType')
    expect(ShadowBridge).not.toHaveProperty('createPollRequestType')
  })

  it('coalesces launch refresh and sends commands only after host delivery', async () => {
    const fixture = createBridgeWindow()
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const payload = String(input).endsWith('/api/shadow/session')
        ? { ok: true, csrfToken: 'csrf-token' }
        : { ok: true, result: { trips: [] } }
      return new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = createShadowSpaceAppClient({
      appKey: 'travel',
      fetch: fetchMock as typeof fetch,
      windowRef: fixture.win,
    })

    const first = client.command('travel.listTrips')
    const second = client.command('travel.listTrips')
    expect(fixture.posted).toHaveLength(1)
    const refresh = fixture.posted[0]?.message
    const token = launchToken('server-1', 'travel')
    fixture.respond({
      type: ShadowBridge.refreshLaunchResponseType,
      requestId: refresh?.requestId,
      ok: true,
      result: { launchToken: token, expiresIn: 600 },
    })

    await expect(Promise.all([first, second])).resolves.toEqual([{ trips: [] }, { trips: [] }])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await expect(client.prepareEventStream()).resolves.toBe('/api/shadow/events')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      `Bearer ${token}`,
    )
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-shadow-space-app-csrf')).toBe(
      'csrf-token',
    )
  })
})
