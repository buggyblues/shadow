import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ShadowServerAppCommandContext } from '../src/server-app'
import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  buildShadowServerAppInboxDelivery,
  buildShadowServerAppInboxTaskRequest,
  createShadowServerAppManifest,
  defineShadowServerApp,
  extractShadowServerAppBearerToken,
  getShadowServerAppChannelMessageDeliveries,
  getShadowServerAppChannelMessageErrors,
  getShadowServerAppInboxDeliveries,
  getShadowServerAppInboxErrors,
  getShadowServerAppTaskCardId,
  normalizeShadowServerAppCommandInput,
  parseShadowServerAppCommandRequest,
  ShadowServerAppOutbox,
  shadowServerAppActorDisplayName,
  shadowServerAppActorRef,
  unwrapShadowServerAppCommandPayload,
  validateShadowServerAppJsonSchema,
} from '../src/server-app'
import { createShadowServerAppJsonStore } from '../src/server-app-node'
import type { ShadowServerAppManifest } from '../src/types'

const manifest: ShadowServerAppManifest = {
  schemaVersion: 'shadow.app/1',
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
      path: '/api/shadow/commands/items.list',
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
      path: '/api/shadow/commands/items.create',
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
} as const satisfies ShadowServerAppManifest

const commandContext: ShadowServerAppCommandContext = {
  protocol: 'shadow.app/1',
  serverId: 'server-1',
  serverAppId: 'app-1',
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

describe('server app helpers', () => {
  it('exports the platform permission for Buddy Inbox task delivery', () => {
    expect(BUDDY_INBOX_DELIVERY_PERMISSION).toBe('buddy_inbox:deliver')
  })

  it('extracts bearer tokens', () => {
    expect(extractShadowServerAppBearerToken('Bearer sat_123')).toBe('sat_123')
    expect(extractShadowServerAppBearerToken('basic nope')).toBeNull()
  })

  it('rewrites local manifest URLs from a public base URL', () => {
    expect(
      createShadowServerAppManifest(
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
            links: [{ label: 'Docs', url: 'https://docs.example.com/demo', type: 'docs' }],
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
        links: [{ url: 'https://docs.example.com/demo' }],
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

  it('unwraps bridge command envelopes', () => {
    expect(
      normalizeShadowServerAppCommandInput({ input: { title: 'A' }, channelId: 'c1' }),
    ).toEqual({
      title: 'A',
    })
    expect(normalizeShadowServerAppCommandInput({ title: 'A' })).toEqual({ title: 'A' })
  })

  it('keeps App outbox metadata in the shadow.app/1 namespace', () => {
    const appResult = {
      item: { id: 'card-1' },
    }
    const resultWithOutbox = new ShadowServerAppOutbox()
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
              kind: 'server_app',
              appKey: 'demo',
              title: 'Open demo',
              action: { mode: 'open_app', path: '/items/card-1' },
            },
          ],
        },
      })
      .attachTo(appResult)

    const payload = {
      ok: true,
      result: resultWithOutbox,
      shadow: {
        protocol: 'shadow.app/1',
        outbox: {
          deliveries: [{ agentId: 'agent-1', channelId: 'channel-1', messageId: 'message-1' }],
          errors: [{ title: 'Skipped optional task', error: 'not found' }],
          channelMessageDeliveries: [{ channelId: 'updates-1', messageId: 'message-2' }],
          channelMessageErrors: [{ channelName: 'alerts', error: 'not found' }],
        },
      },
    }

    const result = unwrapShadowServerAppCommandPayload<typeof resultWithOutbox>(payload)
    expect(result.shadow?.outbox?.inboxTasks).toHaveLength(1)
    expect(getShadowServerAppInboxDeliveries(result)).toEqual([
      { agentId: 'agent-1', channelId: 'channel-1', messageId: 'message-1' },
    ])
    expect(getShadowServerAppInboxDeliveries(result.shadow)).toEqual([
      { agentId: 'agent-1', channelId: 'channel-1', messageId: 'message-1' },
    ])
    expect(getShadowServerAppInboxErrors(result)).toEqual([
      { title: 'Skipped optional task', error: 'not found' },
    ])
    expect(getShadowServerAppInboxErrors(result.shadow)).toEqual([
      { title: 'Skipped optional task', error: 'not found' },
    ])
    expect(result.shadow?.outbox?.channelMessages).toHaveLength(1)
    expect(getShadowServerAppChannelMessageDeliveries(result)).toEqual([
      { channelId: 'updates-1', messageId: 'message-2' },
    ])
    expect(getShadowServerAppChannelMessageErrors(result)).toEqual([
      { channelName: 'alerts', error: 'not found' },
    ])
  })

  it('builds canonical host Inbox task requests and deliveries', () => {
    const request = buildShadowServerAppInboxTaskRequest({
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
        id: 'server-app-1',
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
        kind: 'server_app',
        id: 'server-app-1',
        appId: 'server-app-1',
        appKey: 'skills',
        serverId: 'server-1',
        label: 'Skills',
        resource: { kind: 'skill', id: 'grill-me' },
      },
      data: {
        skillId: 'grill-me',
        serverApp: { appKey: 'skills' },
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
    expect(getShadowServerAppTaskCardId(message)).toBe('task-card-1')
    expect(
      buildShadowServerAppInboxDelivery({
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
            protocol: 'shadow.app/1',
            serverId: 'srv-1',
            serverAppId: 'app-1',
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

    const result = await parseShadowServerAppCommandRequest({
      authorizationHeader: 'Bearer sat_123',
      serverIdHeader: 'srv-1',
      appKeyHeader: 'demo',
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
      expect(shadowServerAppActorDisplayName(result.envelope)).toBe('Alice')
      expect(shadowServerAppActorRef(result.envelope)).toMatchObject({
        id: 'user-1',
        displayName: 'Alice',
        avatarUrl: 'https://cdn.example.com/a.png',
      })
    }
  })

  it('executes typed runtime commands with JSON Schema validation', async () => {
    const runtime = defineShadowServerApp(typedManifest)
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
      validateShadowServerAppJsonSchema(
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
      const store = createShadowServerAppJsonStore({
        filePath,
        defaultValue: () => ({ items: [] as string[] }),
      })

      expect(store.read()).toEqual({ items: [] })
      expect(store.update((value) => ({ items: [...value.items, 'one'] }))).toEqual({
        items: ['one'],
      })
      expect(
        createShadowServerAppJsonStore({
          filePath,
          defaultValue: () => ({ items: [] as string[] }),
        }).read(),
      ).toEqual({ items: ['one'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
