import { describe, expect, it, vi } from 'vitest'
import {
  createShadowServerAppClient,
  createShadowServerAppRuntimeClient,
  ShadowBridge,
  shadowServerAppMountedPath,
} from '../src/bridge'

type PostedMessage = {
  message: Record<string, unknown>
  targetOrigin: string
}

function launchToken(serverId: string, appKey: string) {
  const payload = Buffer.from(JSON.stringify({ serverId, appKey }), 'utf8')
    .toString('base64url')
    .replace(/=+$/u, '')
  return `sat_v1.${payload}.signature`
}

function createBridgeWindow(search = '?shadow_launch=test-launch', pathname = '/shadow/server') {
  const listeners = new Set<(event: MessageEvent) => void>()
  const posted: PostedMessage[] = []
  const storage = new Map<string, string>()
  const sessionStorage = {
    get length() {
      return storage.size
    },
    clear() {
      storage.clear()
    },
    getItem(key: string) {
      return storage.get(key) ?? null
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
  } as Storage
  const parent = {
    postMessage(message: unknown, targetOrigin: string) {
      posted.push({ message: message as Record<string, unknown>, targetOrigin })
    },
  }
  const win = {
    location: { search, pathname },
    parent,
    sessionStorage,
    addEventListener(type: string, callback: (event: MessageEvent) => void) {
      if (type === 'message') listeners.add(callback)
    },
    removeEventListener(type: string, callback: (event: MessageEvent) => void) {
      if (type === 'message') listeners.delete(callback)
    },
    setTimeout() {
      return 0
    },
  } as unknown as Window

  return {
    posted,
    win,
    respond(message: Record<string, unknown>) {
      for (const listener of listeners) listener({ data: message } as MessageEvent)
    },
  }
}

describe('ShadowBridge', () => {
  it('derives appKey from the launch token when embedded', async () => {
    const fixture = createBridgeWindow(`?shadow_launch=${launchToken('server-1', 'kanban')}`)
    const bridge = new ShadowBridge({ windowRef: fixture.win })

    const capabilitiesPromise = bridge.capabilities()
    expect(fixture.posted[0]?.message).toMatchObject({
      appKey: 'kanban',
      type: ShadowBridge.capabilitiesRequestType,
    })
    fixture.respond({
      type: ShadowBridge.capabilitiesResponseType,
      requestId: fixture.posted[0]?.message.requestId,
      ok: true,
      result: { capabilities: ['buddy.inboxes.list'] },
    })

    await expect(capabilitiesPromise).resolves.toEqual({
      capabilities: ['buddy.inboxes.list'],
    })
  })

  it('sends browser commands with launch headers without direct browser outbox delivery', async () => {
    const token = launchToken('server-1', 'kanban')
    const fixture = createBridgeWindow(`?shadow_launch=${token}`)
    const localResult = {
      card: { id: 'card-1' },
      shadow: {
        protocol: 'shadow.app/1',
        outbox: {
          inboxTasks: [{ title: 'Deliver card', agentId: 'agent-2' }],
        },
      },
    }
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: localResult }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createShadowServerAppClient({
      commandBasePath: '/api/runtime/commands',
      shadowApiBaseUrl: 'http://shadow.test',
      fetch: fetchImpl as unknown as typeof fetch,
      windowRef: fixture.win,
    })

    await expect(
      client.command('cards.create', { title: 'Plan migration', optional: undefined }),
    ).resolves.toEqual(localResult)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/runtime/commands/cards.create',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shadow-Launch-Token': token,
        },
        body: JSON.stringify({ input: { title: 'Plan migration' } }),
      }),
    )
  })

  it('uses path-mounted local routes by default when embedded under the shared runtime', async () => {
    const token = launchToken('server-1', 'skills')
    const fixture = createBridgeWindow(`?shadow_launch=${token}`, '/skills/shadow/server')
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { skills: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createShadowServerAppClient({
      fetch: fetchImpl as unknown as typeof fetch,
      windowRef: fixture.win,
    })

    await expect(client.command('skills.search')).resolves.toEqual({ skills: [] })

    expect(shadowServerAppMountedPath('/api/local/inboxes', fixture.win)).toBe(
      '/skills/api/local/inboxes',
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      '/skills/api/local/commands/skills.search',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shadow-Launch-Token': token,
        },
      }),
    )
  })

  it('uses path-mounted runtime routes without browser outbox delivery', async () => {
    const token = launchToken('server-1', 'skills')
    const fixture = createBridgeWindow(`?shadow_launch=${token}`, '/skills/shadow/server')
    const result = {
      skill: { id: 'skill-1' },
      shadow: {
        protocol: 'shadow.app/1',
        outbox: {
          inboxTasks: [{ title: 'Install skill', agentId: 'agent-1' }],
        },
      },
    }
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createShadowServerAppRuntimeClient({
      fetch: fetchImpl as unknown as typeof fetch,
      shadowApiBaseUrl: 'http://shadow.test',
      windowRef: fixture.win,
    })

    await expect(client.command('skills.install', { skillId: 'skill-1' })).resolves.toEqual(result)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      '/skills/api/runtime/commands/skills.install',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shadow-Launch-Token': token,
        },
        body: JSON.stringify({ input: { skillId: 'skill-1' } }),
      }),
    )
  })

  it('supports explicit browser outbox delivery only for pending outbox payloads', async () => {
    const token = launchToken('server-1', 'kanban')
    const fixture = createBridgeWindow(`?shadow_launch=${token}`)
    const localResult = {
      card: { id: 'card-1' },
      shadow: {
        protocol: 'shadow.app/1',
        outbox: {
          inboxTasks: [{ title: 'Deliver card', agentId: 'agent-2' }],
        },
      },
    }
    const delivered = {
      card: { id: 'card-1' },
      shadow: {
        inboxDeliveries: [{ agentId: 'agent-2', channelId: 'channel-2', messageId: 'message-2' }],
      },
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: localResult }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(delivered), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const client = createShadowServerAppClient({
      commandBasePath: '/api/runtime/commands',
      shadowApiBaseUrl: 'http://shadow.test',
      deliverLaunchOutboxFromBrowser: true,
      fetch: fetchImpl as unknown as typeof fetch,
      windowRef: fixture.win,
    })

    await expect(
      client.command('cards.create', { title: 'Plan migration', optional: undefined }),
    ).resolves.toEqual(delivered)

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/runtime/commands/cards.create',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shadow-Launch-Token': token,
        },
        body: JSON.stringify({ input: { title: 'Plan migration' } }),
      }),
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://shadow.test/api/servers/server-1/apps/kanban/launch/outbox',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commandName: 'cards.create',
          result: localResult,
        }),
      }),
    )
  })

  it('does not post browser outbox for pure read command results', async () => {
    const token = launchToken('server-1', 'kanban')
    const fixture = createBridgeWindow(`?shadow_launch=${token}`)
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { board: { id: 'kanban' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createShadowServerAppClient({
      commandBasePath: '/api/runtime/commands',
      deliverLaunchOutboxFromBrowser: true,
      fetch: fetchImpl as unknown as typeof fetch,
      windowRef: fixture.win,
    })

    await expect(client.command('boards.get')).resolves.toEqual({ board: { id: 'kanban' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps the default fetch call bound to the browser global', async () => {
    const fixture = createBridgeWindow('?')
    const originalFetch = globalThis.fetch
    const fetchImpl = vi.fn(function (
      this: typeof globalThis,
      input: RequestInfo | URL,
      _init?: RequestInit,
    ) {
      expect(this).toBe(globalThis)
      expect(input).toBe('/api/runtime/commands/cards.create')
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: { card: { id: 'card-1' } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchImpl,
      writable: true,
    })
    try {
      const client = createShadowServerAppClient({
        commandBasePath: '/api/runtime/commands',
        windowRef: fixture.win,
      })

      await expect(client.command('cards.create', { title: 'Plan migration' })).resolves.toEqual({
        card: { id: 'card-1' },
      })
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
        writable: true,
      })
    }
  })

  it('uses bridge Buddy inbox lookup before falling back to local launch routes', async () => {
    const token = launchToken('server-1', 'kanban')
    const fixture = createBridgeWindow(`?shadow_launch=${token}`)
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          inboxes: [{ agent: { id: 'agent-local', ownerId: 'user-local' }, channel: null }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const client = createShadowServerAppClient({
      inboxesPath: '/api/runtime/inboxes',
      fetch: fetchImpl as unknown as typeof fetch,
      windowRef: fixture.win,
    })

    const inboxesPromise = client.listBuddyInboxes()
    expect(fixture.posted[0]?.message).toMatchObject({
      appKey: 'kanban',
      type: ShadowBridge.listBuddyInboxesRequestType,
    })
    fixture.respond({
      type: ShadowBridge.listBuddyInboxesResponseType,
      requestId: fixture.posted[0]?.message.requestId,
      ok: false,
      error: 'bridge unavailable',
    })

    await expect(inboxesPromise).resolves.toEqual({
      inboxes: [{ agent: { id: 'agent-local', ownerId: 'user-local' }, channel: null }],
    })
    expect(fetchImpl).toHaveBeenCalledWith('/api/runtime/inboxes', {
      headers: { 'X-Shadow-Launch-Token': token },
    })
  })

  it('discovers host UX capabilities and opens Shadow surfaces', async () => {
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge({ appKey: 'skills', windowRef: fixture.win })

    const capabilitiesPromise = bridge.capabilities()
    expect(fixture.posted[0]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.capabilitiesRequestType,
    })
    fixture.respond({
      type: ShadowBridge.capabilitiesResponseType,
      requestId: fixture.posted[0]?.message.requestId,
      ok: true,
      result: {
        capabilities: [
          'copilot.open',
          'workspace.open',
          'buddy.create.open',
          'buddy.inboxes.list',
          'buddy.grant.ensure',
          'route.navigate',
        ],
      },
    })
    await expect(capabilitiesPromise).resolves.toEqual({
      capabilities: [
        'copilot.open',
        'workspace.open',
        'buddy.create.open',
        'buddy.inboxes.list',
        'buddy.grant.ensure',
        'route.navigate',
      ],
    })

    const openPromise = bridge.openCopilot({
      channelId: 'channel-1',
      messageId: 'message-2',
      cardId: 'task-card-1',
    })
    expect(fixture.posted[1]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.openCopilotRequestType,
      delivery: {
        channelId: 'channel-1',
        messageId: 'message-2',
        cardId: 'task-card-1',
      },
    })
    fixture.respond({
      type: ShadowBridge.openCopilotResponseType,
      requestId: fixture.posted[1]?.message.requestId,
      ok: true,
      result: { opened: true },
    })

    await expect(openPromise).resolves.toEqual({ opened: true })

    const workspaceOpenPromise = bridge.openWorkspaceResource({
      resource: {
        uri: 'workspace://renders/final.mp4',
        workspaceNodeId: 'workspace-node-1',
        title: 'Final render',
      },
    })
    expect(fixture.posted[2]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.openWorkspaceResourceRequestType,
      resource: {
        uri: 'workspace://renders/final.mp4',
        workspaceNodeId: 'workspace-node-1',
        title: 'Final render',
      },
    })
    fixture.respond({
      type: ShadowBridge.openWorkspaceResourceResponseType,
      requestId: fixture.posted[2]?.message.requestId,
      ok: true,
      result: { opened: true },
    })

    await expect(workspaceOpenPromise).resolves.toEqual({ opened: true })

    const inboxesPromise = bridge.listBuddyInboxes()
    expect(fixture.posted[3]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.listBuddyInboxesRequestType,
    })
    fixture.respond({
      type: ShadowBridge.listBuddyInboxesResponseType,
      requestId: fixture.posted[3]?.message.requestId,
      ok: true,
      result: { inboxes: [{ agent: { id: 'agent-1', ownerId: 'user-1' }, channel: null }] },
    })
    await expect(inboxesPromise).resolves.toEqual({
      inboxes: [{ agent: { id: 'agent-1', ownerId: 'user-1' }, channel: null }],
    })

    const grantPromise = bridge.ensureBuddyGrant({
      buddyAgentId: 'agent-1',
      permissions: ['buddy_inbox:deliver'],
    })
    expect(fixture.posted[4]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.ensureBuddyGrantRequestType,
      buddyAgentId: 'agent-1',
      permissions: ['buddy_inbox:deliver'],
    })
    fixture.respond({
      type: ShadowBridge.ensureBuddyGrantResponseType,
      requestId: fixture.posted[4]?.message.requestId,
      ok: true,
      result: { granted: true },
    })
    await expect(grantPromise).resolves.toEqual({ granted: true })

    const authorizeOAuthPromise = bridge.authorizeOAuth(
      'https://shadow.test/app/oauth/authorize?response_type=code&client_id=app&redirect_uri=https%3A%2F%2Fapp.test%2Fcallback',
    )
    expect(fixture.posted[5]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.authorizeOAuthRequestType,
      authorizeUrl:
        'https://shadow.test/app/oauth/authorize?response_type=code&client_id=app&redirect_uri=https%3A%2F%2Fapp.test%2Fcallback',
    })
    fixture.respond({
      type: ShadowBridge.authorizeOAuthResponseType,
      requestId: fixture.posted[5]?.message.requestId,
      ok: true,
      result: { opened: true, redirectUrl: 'https://app.test/callback?code=oauth-code' },
    })
    await expect(authorizeOAuthPromise).resolves.toEqual({
      opened: true,
      redirectUrl: 'https://app.test/callback?code=oauth-code',
    })
  })

  it('keeps bridge context after app-side routing removes launch query', async () => {
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge({ appKey: 'warbuddy', windowRef: fixture.win })
    expect(bridge.isAvailable()).toBe(true)

    ;(fixture.win.location as unknown as { search: string }).search = ''
    expect(bridge.isAvailable()).toBe(true)

    const routedBridge = new ShadowBridge({ appKey: 'warbuddy', windowRef: fixture.win })
    expect(routedBridge.isAvailable()).toBe(true)

    const createPromise = routedBridge.openBuddyCreator({
      landing: { title: 'WarBuddy tactics', source: 'warbuddy' },
    })
    expect(fixture.posted[0]?.message).toMatchObject({
      appKey: 'warbuddy',
      type: ShadowBridge.openBuddyCreatorRequestType,
      landing: { title: 'WarBuddy tactics', source: 'warbuddy' },
    })

    fixture.respond({
      type: ShadowBridge.openBuddyCreatorResponseType,
      requestId: fixture.posted[0]?.message.requestId,
      ok: true,
      result: { opened: true, agent: { id: 'agent-1' } },
    })

    await expect(createPromise).resolves.toEqual({
      opened: true,
      agent: { id: 'agent-1' },
    })
  })
})
