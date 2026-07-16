import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ShadowSpaceAppCommandContext } from '../src/space-app'
import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  buildShadowSpaceAppInboxDelivery,
  buildShadowSpaceAppInboxTaskRequest,
  createShadowSpaceAppCollaborationEvent,
  createShadowSpaceAppCollaborationResource,
  createShadowSpaceAppLaunchPoll,
  createShadowSpaceAppManifest,
  defineShadowSpaceApp,
  ensureShadowSpaceAppLaunchChannel,
  extractShadowSpaceAppBearerToken,
  fetchShadowSpaceAppLaunchChannels,
  fetchShadowSpaceAppLaunchMembers,
  fetchShadowSpaceAppLaunchMessage,
  getShadowSpaceAppChannelMessageDeliveries,
  getShadowSpaceAppChannelMessageErrors,
  getShadowSpaceAppInboxDeliveries,
  getShadowSpaceAppInboxErrors,
  getShadowSpaceAppPendingInboxTasks,
  getShadowSpaceAppTaskCardId,
  hasShadowSpaceAppPendingOutbox,
  introspectShadowSpaceAppLaunchToken,
  normalizeShadowSpaceAppAvatarUrl,
  normalizeShadowSpaceAppCommandInput,
  parseShadowSpaceAppCommandRequest,
  publishShadowSpaceAppNotification,
  resolveShadowSpaceAppLaunchCommandContext,
  resolveShadowSpaceAppLaunchCommandContextResolution,
  ShadowSpaceAppOutbox,
  shadowSpaceAppActorDisplayName,
  shadowSpaceAppActorRef,
  shadowSpaceAppApiBaseUrl,
  shadowSpaceAppIdentityKey,
  shadowSpaceAppIdentitySnapshot,
  shadowSpaceAppLaunchIntrospectionError,
  shadowSpaceAppPublicBaseUrl,
  unwrapShadowSpaceAppCommandPayload,
  validateShadowSpaceAppJsonSchema,
} from '../src/space-app'
import {
  createShadowSpaceAppJsonStore,
  createShadowSpaceAppSessionManager,
} from '../src/space-app-node'
import type { ShadowSpaceAppManifest } from '../src/types'

const manifest: ShadowSpaceAppManifest = {
  schemaVersion: 'shadow.space-app/1',
  appKey: 'demo',
  name: 'Demo',
  iconUrl: 'http://localhost:4201/assets/icon.svg',
  iframe: {
    entry: 'http://localhost:4201/shadow/server',
    allowedOrigins: ['http://localhost:4201'],
  },
  api: {
    baseUrl: 'http://localhost:4201',
    auth: { type: 'oauth2-bearer' },
  },
  commands: [
    {
      name: 'items.list',
      ingress: {
        path: '/.shadow/commands/items.list',
        auth: 'shadow-command-jwt',
      },
      permission: 'demo.items:read',
      action: 'read',
      dataClass: 'server-private',
    },
  ],
}

const typedManifest = {
  ...manifest,
  commands: [
    {
      name: 'items.create',
      ingress: {
        path: '/.shadow/commands/items.create',
        auth: 'shadow-command-jwt',
      },
      permission: 'demo.items:write',
      action: 'write',
      dataClass: 'server-private',
      inputSchema: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          priority: { enum: ['low', 'normal', 'high'] },
        },
      },
    },
  ],
} as const satisfies ShadowSpaceAppManifest

const commandContext: ShadowSpaceAppCommandContext = {
  protocol: 'shadow.space-app/1',
  serverId: 'server-1',
  spaceAppId: 'app-1',
  appKey: 'demo',
  command: 'items.create',
  actor: {
    kind: 'user',
    userId: 'user-1',
    profile: {
      id: 'user-1',
      displayName: 'Alice',
      avatarUrl: null,
    },
  },
  permission: 'demo.items:write',
  action: 'write',
  dataClass: 'server-private',
}

function launchToken(serverId: string, appKey: string, exp?: number) {
  const payload = Buffer.from(JSON.stringify({ serverId, appKey, ...(exp ? { exp } : {}) }), 'utf8')
    .toString('base64url')
    .replace(/=+$/u, '')
  return `sat_v1.${payload}.signature`
}

describe('Space App helpers', () => {
  it('exports the platform permission for Buddy Inbox task delivery', () => {
    expect(BUDDY_INBOX_DELIVERY_PERMISSION).toBe('buddy_inbox:deliver')
  })

  it('extracts bearer tokens', () => {
    expect(extractShadowSpaceAppBearerToken('Bearer sat_123')).toBe('sat_123')
    expect(extractShadowSpaceAppBearerToken('basic nope')).toBeNull()
  })

  it('exchanges a launch credential once for an opaque Space App session with CSRF protection', async () => {
    const token = launchToken('srv-session', 'demo', Math.floor(Date.now() / 1_000) + 600)
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/events')) {
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
            serverId: 'srv-session',
            spaceAppId: 'app-session',
            appKey: 'demo',
            actor: { kind: 'user', userId: 'user-1', profile: { id: 'user-1' } },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    const sessions = createShadowSpaceAppSessionManager({
      appKey: 'demo',
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as typeof fetch,
    })

    const exchange = await sessions.exchange({
      authorizationHeader: `Bearer ${token}`,
      requestUrl: 'https://demo.example.com/api/shadow/session',
    })
    expect(exchange.ok).toBe(true)
    if (!exchange.ok) throw new Error('expected session exchange to succeed')
    expect(exchange.setCookie).toContain('HttpOnly')
    expect(exchange.setCookie).toContain('SameSite=None')
    expect(exchange.setCookie).not.toContain(token)

    const cookie = exchange.setCookie.split(';', 1)[0]
    await expect(
      sessions.commandContext({
        cookieHeader: cookie,
        csrfToken: 'wrong',
        commandName: 'items.list',
        manifest,
      }),
    ).resolves.toMatchObject({ context: null, error: 'invalid_session' })
    await expect(
      sessions.commandContext({
        cookieHeader: cookie,
        csrfToken: exchange.body.csrfToken,
        commandName: 'items.list',
        manifest,
      }),
    ).resolves.toMatchObject({
      context: { serverId: 'srv-session', command: 'items.list' },
      session: { launchToken: token },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const events = await sessions.eventStream({ cookieHeader: cookie, lastEventId: 'event-42' })
    expect(events?.status).toBe(200)
    expect(await events?.text()).toContain('event: ready')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [eventUrl, eventInit] = fetchImpl.mock.calls[1] ?? []
    expect(eventUrl?.toString()).toBe(
      'https://shadow.example.com/api/servers/srv-session/space-apps/demo/events',
    )
    expect(eventUrl?.toString()).not.toContain(token)
    expect(eventInit).toMatchObject({
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
        'Last-Event-ID': 'event-42',
      },
    })
  })

  it('rewrites local manifest URLs from a public base URL', () => {
    expect(
      createShadowSpaceAppManifest(
        {
          ...manifest,
          marketplace: {
            tagline: 'Demo app',
            coverImageUrl: 'http://localhost:4201/assets/cover.png',
            gallery: [
              {
                url: 'http://localhost:4201/assets/gallery.png',
                type: 'image',
                alt: 'Gallery',
              },
              {
                url: 'https://cdn.example.com/demo.jpg',
                type: 'image',
                alt: 'External gallery',
              },
            ],
            links: [
              { label: 'Home', url: 'http://localhost:4201/shadow/server', type: 'website' },
              { label: 'Docs', url: 'https://docs.example.com/demo', type: 'docs' },
            ],
          },
        },
        {
          publicBaseUrl: 'https://app.example.com/',
          apiBaseUrl: 'https://api.example.com/',
          iframePath: '/server',
        },
      ),
    ).toMatchObject({
      iconUrl: 'https://app.example.com/assets/icon.svg',
      marketplace: {
        coverImageUrl: 'https://app.example.com/assets/cover.png',
        gallery: [
          { url: 'https://app.example.com/assets/gallery.png' },
          { url: 'https://cdn.example.com/demo.jpg' },
        ],
        links: [
          { url: 'https://app.example.com/shadow/server' },
          { url: 'https://docs.example.com/demo' },
        ],
      },
      iframe: {
        entry: 'https://app.example.com/server',
        allowedOrigins: ['https://app.example.com'],
      },
      api: {
        baseUrl: 'https://api.example.com',
      },
    })
  })

  it('normalizes path-based public base URLs to iframe origins', () => {
    expect(
      createShadowSpaceAppManifest(manifest, {
        publicBaseUrl: 'http://localhost:4200/kanban',
        apiBaseUrl: 'http://localhost:4200/kanban',
      }),
    ).toMatchObject({
      iconUrl: 'http://localhost:4200/kanban/assets/icon.svg',
      iframe: {
        entry: 'http://localhost:4200/kanban/shadow/server',
        allowedOrigins: ['http://localhost:4200'],
      },
      api: {
        baseUrl: 'http://localhost:4200/kanban',
      },
    })
  })

  it('unwraps bridge command envelopes', () => {
    expect(normalizeShadowSpaceAppCommandInput({ input: { title: 'A' }, channelId: 'c1' })).toEqual(
      {
        title: 'A',
      },
    )
    expect(normalizeShadowSpaceAppCommandInput({ title: 'A' })).toEqual({ title: 'A' })
  })

  it('keeps Space App outbox metadata in the shadow.space-app/1 namespace', () => {
    const appResult = {
      item: { id: 'card-1' },
    }
    const resultWithOutbox = new ShadowSpaceAppOutbox()
      .enqueueInboxTask({
        title: 'Review card',
        assigneeLabel: 'Strategy Buddy',
        resource: { kind: 'kanban.card', id: 'card-1' },
      })
      .sendChannelMessage({
        channelName: 'updates',
        content: 'Open the next card.',
        metadata: {
          cards: [
            {
              kind: 'space_app',
              appKey: 'demo',
              title: 'Open demo',
              action: { mode: 'open_space_app', path: '/items/card-1' },
            },
          ],
        },
      })
      .attachTo(appResult)

    const payload = {
      ok: true,
      result: resultWithOutbox,
      shadow: {
        protocol: 'shadow.space-app/1',
        outbox: {
          deliveries: [{ agentId: 'agent-1', channelId: 'channel-1', messageId: 'message-1' }],
          errors: [{ title: 'Skipped optional task', error: 'not found' }],
          channelMessageDeliveries: [{ channelId: 'updates-1', messageId: 'message-2' }],
          channelMessageErrors: [{ channelName: 'alerts', error: 'not found' }],
        },
      },
    }

    const result = unwrapShadowSpaceAppCommandPayload<typeof resultWithOutbox>(payload)
    expect(result.shadow?.outbox?.inboxTasks).toHaveLength(1)
    expect(getShadowSpaceAppInboxDeliveries(result)).toEqual([
      { agentId: 'agent-1', channelId: 'channel-1', messageId: 'message-1' },
    ])
    expect(getShadowSpaceAppInboxDeliveries(result.shadow)).toEqual([
      { agentId: 'agent-1', channelId: 'channel-1', messageId: 'message-1' },
    ])
    expect(getShadowSpaceAppInboxErrors(result)).toEqual([
      { title: 'Skipped optional task', error: 'not found' },
    ])
    expect(getShadowSpaceAppInboxErrors(result.shadow)).toEqual([
      { title: 'Skipped optional task', error: 'not found' },
    ])
    expect(result.shadow?.outbox?.channelMessages).toHaveLength(1)
    expect(getShadowSpaceAppChannelMessageDeliveries(result)).toEqual([
      { channelId: 'updates-1', messageId: 'message-2' },
    ])
    expect(getShadowSpaceAppChannelMessageErrors(result)).toEqual([
      { channelName: 'alerts', error: 'not found' },
    ])
  })

  it('detects pending outbox inside command result envelopes', () => {
    const payload = {
      ok: true,
      result: new ShadowSpaceAppOutbox()
        .enqueueInboxTask({
          title: 'Dispatch card',
          agentId: 'agent-2',
        })
        .attachTo({ card: { id: 'card-1' } }),
    }

    expect(hasShadowSpaceAppPendingOutbox(payload)).toBe(true)
    expect(getShadowSpaceAppPendingInboxTasks(payload)).toEqual([
      { title: 'Dispatch card', agentId: 'agent-2' },
    ])
  })

  it('builds canonical host Inbox task requests and deliveries', () => {
    const request = buildShadowSpaceAppInboxTaskRequest({
      serverIdOrSlug: 'shadow-plays',
      target: { agentId: 'agent-1' },
      task: {
        title: 'Install grill-me',
        body: 'Download the zip and install it.',
        idempotencyKey: 'skills:install:grill-me',
        resource: { kind: 'skill', id: 'grill-me' },
        requirements: {
          capabilities: ['workspace.write'],
          skills: [{ kind: 'runtime-skill', package: '@shadow/skills-grill-me' }],
        },
        outputContract: {
          expectedArtifacts: [{ kind: 'workspace.file', mimeTypes: ['application/zip'] }],
          submitCommand: { appKey: 'skills', command: 'cards.artifacts.add' },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
        data: { skillId: 'grill-me' },
      },
      app: {
        id: 'space-app-1',
        appKey: 'skills',
        serverId: 'server-1',
        name: 'Skills',
      },
    })

    expect(request.endpoint).toBe('/api/servers/shadow-plays/inboxes/agent-1/tasks')
    expect(request.body).toMatchObject({
      title: 'Install grill-me',
      body: 'Download the zip and install it.',
      idempotencyKey: 'skills:install:grill-me',
      requirements: {
        capabilities: ['workspace.write'],
        skills: [{ kind: 'runtime-skill', package: '@shadow/skills-grill-me' }],
      },
      outputContract: {
        expectedArtifacts: [{ kind: 'workspace.file', mimeTypes: ['application/zip'] }],
        submitCommand: { appKey: 'skills', command: 'cards.artifacts.add' },
      },
      privacy: { dataClass: 'server-private', redactionRequired: true },
      source: {
        kind: 'space_app',
        id: 'space-app-1',
        appId: 'space-app-1',
        appKey: 'skills',
        serverId: 'server-1',
        label: 'Skills',
        resource: { kind: 'skill', id: 'grill-me' },
      },
      data: {
        skillId: 'grill-me',
        spaceApp: { appKey: 'skills' },
      },
    })

    const channelRequest = buildShadowSpaceAppInboxTaskRequest({
      serverIdOrSlug: 'shadow-plays',
      target: { channelId: 'channel-1' },
      task: {
        title: 'Install grill-me',
        idempotencyKey: 'skills:install:grill-me',
      },
      app: {
        id: 'space-app-1',
        appKey: 'skills',
        serverId: 'server-1',
        name: 'Skills',
      },
    })
    expect(channelRequest.endpoint).toBe('/api/channels/channel-1/inbox/tasks')
    expect(channelRequest.body).toMatchObject({
      title: 'Install grill-me',
      idempotencyKey: 'skills:install:grill-me',
      source: {
        kind: 'space_app',
        id: 'space-app-1',
        appId: 'space-app-1',
        appKey: 'skills',
      },
      data: {
        spaceApp: { appKey: 'skills' },
      },
    })

    const message = {
      id: 'message-1',
      channelId: 'channel-1',
      metadata: {
        cards: [
          { kind: 'task', id: 'task-card-1' },
          { kind: 'notice', id: 'notice-card-1' },
        ],
      },
    }
    expect(getShadowSpaceAppTaskCardId(message)).toBe('task-card-1')
    expect(
      buildShadowSpaceAppInboxDelivery({
        target: { agentId: 'agent-1' },
        message,
        idempotencyKey: 'skills:install:grill-me',
      }),
    ).toEqual({
      agentId: 'agent-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      cardId: 'task-card-1',
      idempotencyKey: 'skills:install:grill-me',
    })
  })

  it('parses command requests through Shadow introspection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          active: true,
          shadow: {
            protocol: 'shadow.space-app/1',
            serverId: 'srv-1',
            spaceAppId: 'app-1',
            appKey: 'demo',
            command: 'items.list',
            actor: {
              kind: 'user',
              userId: 'user-1',
              profile: {
                username: 'alice',
                displayName: 'Alice',
                avatarUrl: 'https://cdn.example.com/a.png',
              },
            },
            permission: 'demo.items:read',
            action: 'read',
            dataClass: 'server-private',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await parseShadowSpaceAppCommandRequest({
      authorizationHeader: 'Bearer sat_123',
      expectedCommand: 'items.list',
      requestBody: JSON.stringify({ input: { limit: 10 } }),
      shadowBaseUrl: 'https://shadow.example.com',
      fetchImpl,
    })

    expect(result).toMatchObject({
      ok: true,
      envelope: {
        input: { limit: 10 },
        context: {
          actor: {
            profile: { displayName: 'Alice' },
          },
        },
      },
    })
    if (result.ok) {
      expect(shadowSpaceAppActorDisplayName(result.envelope)).toBe('Alice')
      expect(shadowSpaceAppActorRef(result.envelope)).toMatchObject({
        id: 'user-1',
        displayName: 'Alice',
        avatarUrl: 'https://cdn.example.com/a.png',
      })
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://shadow.example.com/api/space-apps/commands/introspect',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer sat_123' },
      }),
    )
  })

  it('resolves launch tokens into Space App command contexts', async () => {
    const token = launchToken('srv-1', 'demo')
    const launchPayload = {
      active: true,
      shadow: {
        protocol: 'shadow.space-app/1',
        serverId: 'srv-1',
        spaceAppId: 'app-1',
        appKey: 'demo',
        actor: {
          kind: 'agent',
          userId: 'buddy-user-1',
          ownerId: 'owner-1',
          buddyAgentId: 'agent-1',
          profile: {
            id: 'buddy-user-1',
            displayName: 'Planner Buddy',
            avatarUrl: 'https://cdn.example.com/buddy.png',
          },
        },
        resources: { serverId: 'srv-1' },
      },
    }
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(launchPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(
      introspectShadowSpaceAppLaunchToken({
        launchToken: token,
        shadowApiBaseUrl: 'https://shadow.example.com',
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      active: true,
      shadow: { actor: { buddyAgentId: 'agent-1' } },
    })

    const context = await resolveShadowSpaceAppLaunchCommandContext({
      launchToken: token,
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as unknown as typeof fetch,
      manifest,
      commandName: 'items.list',
    })

    expect(context).toMatchObject({
      protocol: 'shadow.space-app/1',
      serverId: 'srv-1',
      spaceAppId: 'app-1',
      appKey: 'demo',
      command: 'items.list',
      permission: 'demo.items:read',
      action: 'read',
      dataClass: 'server-private',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://shadow.example.com/api/servers/srv-1/space-apps/demo/launch/introspect',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
  })

  it('coalesces and briefly caches active launch-token introspection', async () => {
    const token = launchToken('srv-cache', 'demo', Math.floor(Date.now() / 1000) + 60)
    let resolveResponse: ((response: Response) => void) | undefined
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const options = {
      launchToken: token,
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as unknown as typeof fetch,
    }
    const first = introspectShadowSpaceAppLaunchToken(options)
    const second = introspectShadowSpaceAppLaunchToken(options)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    resolveResponse?.(
      new Response(
        JSON.stringify({
          active: true,
          shadow: {
            serverId: 'srv-cache',
            spaceAppId: 'app-cache',
            appKey: 'demo',
            actor: { kind: 'user', userId: 'user-1' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    await expect(introspectShadowSpaceAppLaunchToken(options)).resolves.toMatchObject({
      active: true,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reads the Space member directory through a launch-scoped endpoint', async () => {
    const token = launchToken('srv-members', 'demo')
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ members: [{ userId: 'user-1', displayName: 'Traveler' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )

    await expect(
      fetchShadowSpaceAppLaunchMembers({
        launchToken: token,
        shadowApiBaseUrl: 'https://shadow.example.com',
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ members: [{ userId: 'user-1', displayName: 'Traveler' }] })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://shadow.example.com/api/servers/srv-members/space-apps/demo/launch/members',
      expect.objectContaining({
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
  })

  it('reads visible channels and authorized messages through launch-scoped endpoints', async () => {
    const token = launchToken('srv-data', 'demo')
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ channels: [{ id: 'channel-1', name: 'Trip' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'message-1', channelId: 'channel-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const options = {
      launchToken: token,
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as unknown as typeof fetch,
    }

    await expect(fetchShadowSpaceAppLaunchChannels(options)).resolves.toEqual({
      channels: [{ id: 'channel-1', name: 'Trip' }],
    })
    await expect(
      fetchShadowSpaceAppLaunchMessage({ ...options, messageId: 'message-1' }),
    ).resolves.toEqual({ id: 'message-1', channelId: 'channel-1' })
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://shadow.example.com/api/servers/srv-data/space-apps/demo/launch/channels',
      expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } }),
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://shadow.example.com/api/servers/srv-data/space-apps/demo/launch/messages/message-1',
      expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } }),
    )
  })

  it('creates channels and polls through the launch-scoped data plane', async () => {
    const token = launchToken('srv-write', 'demo')
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ channelId: 'channel-1', created: true, name: 'Trip' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ channelId: 'channel-1', messageId: 'message-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const options = {
      launchToken: token,
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as unknown as typeof fetch,
    }

    await expect(
      ensureShadowSpaceAppLaunchChannel({
        ...options,
        input: { dedupeKey: 'trip:1', name: 'Trip', isPrivate: true },
      }),
    ).resolves.toMatchObject({ channelId: 'channel-1', created: true })
    await expect(
      createShadowSpaceAppLaunchPoll({
        ...options,
        input: {
          channelId: 'channel-1',
          question: 'Where next?',
          answers: ['Paris', { text: 'Kyoto', emoji: '🗼' }],
        },
      }),
    ).resolves.toEqual({ channelId: 'channel-1', messageId: 'message-1' })
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toMatchObject({
      answers: [{ text: 'Paris' }, { text: 'Kyoto', emoji: '🗼' }],
    })
  })

  it('does not cache an active response beyond the launch token expiry', async () => {
    const token = launchToken('srv-expired', 'demo', Math.floor(Date.now() / 1000) - 1)
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            active: true,
            shadow: {
              serverId: 'srv-expired',
              spaceAppId: 'app-expired',
              appKey: 'demo',
              actor: { kind: 'user', userId: 'user-1' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    const options = {
      launchToken: token,
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as unknown as typeof fetch,
    }
    await introspectShadowSpaceAppLaunchToken(options)
    await introspectShadowSpaceAppLaunchToken(options)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('keeps inactive launch introspection payloads with their reason', async () => {
    const token = launchToken('srv-1', 'demo')
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ active: false, error: 'launch_token_expired' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    const introspection = await introspectShadowSpaceAppLaunchToken({
      launchToken: token,
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    const resolution = await resolveShadowSpaceAppLaunchCommandContextResolution({
      launchToken: token,
      shadowApiBaseUrl: 'https://shadow.example.com',
      fetch: fetchImpl as unknown as typeof fetch,
      manifest,
      commandName: 'items.list',
    })

    expect(introspection).toMatchObject({ active: false, error: 'launch_token_expired' })
    expect(shadowSpaceAppLaunchIntrospectionError(introspection)).toBe('launch_token_expired')
    expect(resolution).toMatchObject({
      context: null,
      error: 'launch_token_expired',
    })
  })

  it('publishes Space App notifications through the token-bound installation endpoint', async () => {
    const token = launchToken('srv-1', 'demo')
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, results: [] }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(
      publishShadowSpaceAppNotification({
        launchToken: token,
        shadowApiBaseUrl: 'https://shadow.example.com',
        fetch: fetchImpl as unknown as typeof fetch,
        notification: {
          topicKey: 'task.changed',
          recipientUserIds: ['user-1'],
          title: 'Task changed',
          idempotencyKey: 'task-1-version-2',
          actionPath: '/tasks/1',
        },
      }),
    ).resolves.toEqual({ ok: true, results: [] })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://shadow.example.com/api/servers/srv-1/space-apps/demo/notifications',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    )
  })

  it('resolves explicit Space App runtime URLs without topology rewrites', () => {
    expect(
      shadowSpaceAppApiBaseUrl({
        SHADOWOB_SERVER_URL: 'https://shadow.example.com/',
      }),
    ).toBe('https://shadow.example.com')
    expect(
      shadowSpaceAppApiBaseUrl({
        SHADOWOB_INTERNAL_SERVER_URL: 'http://shadow-internal:3002',
        SHADOWOB_SERVER_URL: 'https://shadow.example.com',
      }),
    ).toBe('http://shadow-internal:3002')
    expect(
      shadowSpaceAppPublicBaseUrl({
        SHADOWOB_PUBLIC_BASE_URL: 'https://shadow.example.com/',
      }),
    ).toBe('https://shadow.example.com')
    expect(
      normalizeShadowSpaceAppAvatarUrl('/api/media/avatar/shadow/avatars/avatar.png', {
        SHADOWOB_PUBLIC_BASE_URL: 'https://shadow.example.com',
      }),
    ).toBe('https://shadow.example.com/api/media/avatar/shadow/avatars/avatar.png')
    expect(
      normalizeShadowSpaceAppAvatarUrl('/api/media/signed/token', {
        SHADOWOB_PUBLIC_BASE_URL: 'https://shadow.example.com',
      }),
    ).toBeNull()
  })

  it('creates stable identity snapshots and collaboration metadata', () => {
    const buddyContext: ShadowSpaceAppCommandContext = {
      ...commandContext,
      actor: {
        kind: 'agent',
        userId: 'buddy-user-1',
        ownerId: 'owner-1',
        buddyAgentId: 'agent-1',
        profile: {
          id: 'buddy-user-1',
          displayName: 'Planner Buddy',
          avatarUrl: 'https://cdn.example.com/buddy.png',
        },
      },
    }
    const identity = shadowSpaceAppIdentitySnapshot(buddyContext)
    expect(identity).toMatchObject({
      subjectKind: 'buddy',
      stableKey: 'buddy:agent-1',
      displayName: 'Planner Buddy',
    })
    expect(shadowSpaceAppIdentityKey(buddyContext)).toBe('buddy:agent-1')

    const resource = createShadowSpaceAppCollaborationResource(buddyContext, {
      kind: 'kanban.board',
      id: 'board-1',
      projectId: 'project-1',
    })
    const event = createShadowSpaceAppCollaborationEvent({
      type: 'board.updated',
      resource,
      actor: identity,
      payload: { cardId: 'card-1' },
      clientMutationId: ' mutation-1 ',
      baseCursor: ' cursor-0 ',
      occurredAt: '2026-06-22T00:00:00.000Z',
    })

    expect(event).toMatchObject({
      protocol: 'shadow.space-app/1',
      type: 'board.updated',
      resource: {
        appKey: 'demo',
        serverId: 'server-1',
        kind: 'kanban.board',
        id: 'board-1',
        projectId: 'project-1',
      },
      actor: {
        stableKey: 'buddy:agent-1',
      },
      payload: { cardId: 'card-1' },
      clientMutationId: 'mutation-1',
      baseCursor: 'cursor-0',
    })
  })

  it('executes typed Space App commands with JSON Schema validation', async () => {
    const runtime = defineShadowSpaceApp(typedManifest)
    const handlers = runtime.defineCommands({
      'items.create': (input, { actor }) => ({
        title: input.title,
        priority: input.priority ?? 'normal',
        actor: actor.displayName,
      }),
    })

    await expect(
      runtime.executeLocal(
        'items.create',
        { title: 'Ship SDK', priority: 'high' },
        commandContext,
        handlers,
      ),
    ).resolves.toMatchObject({
      ok: true,
      body: {
        result: {
          title: 'Ship SDK',
          priority: 'high',
          actor: 'Alice',
        },
      },
    })

    await expect(
      runtime.executeLocal('items.create', { title: '', extra: true }, commandContext, handlers),
    ).resolves.toMatchObject({
      ok: false,
      status: 422,
      body: {
        error: 'invalid_input',
        issues: expect.arrayContaining([
          expect.objectContaining({ path: 'title' }),
          expect.objectContaining({ path: 'extra', message: 'Unknown property' }),
        ]),
      },
    })
  })

  it('validates standalone JSON Schema objects', () => {
    expect(
      validateShadowSpaceAppJsonSchema(
        {
          type: 'object',
          required: ['value'],
          properties: { value: { type: 'integer' } },
          additionalProperties: false,
        },
        { value: 1 },
      ),
    ).toEqual({ ok: true })
  })

  it('persists JSON app data through the Node store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shadow-sdk-'))
    const filePath = join(dir, 'data.json')
    try {
      const store = createShadowSpaceAppJsonStore({
        filePath,
        defaultValue: () => ({ items: [] as string[] }),
      })

      expect(store.read()).toEqual({ items: [] })
      expect(store.update((value) => ({ items: [...value.items, 'one'] }))).toEqual({
        items: ['one'],
      })
      expect(
        createShadowSpaceAppJsonStore({
          filePath,
          defaultValue: () => ({ items: [] as string[] }),
        }).read(),
      ).toEqual({ items: ['one'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
