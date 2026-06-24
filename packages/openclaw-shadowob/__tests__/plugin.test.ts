/**
 * OpenClaw Shadow Plugin Tests (openclaw-shadowob)
 *
 * Tests for the @shadowob/openclaw-shadowob plugin:
 * 1. Plugin registration and metadata
 * 2. Config resolution (single + multi-account)
 * 3. Outbound adapter (sendText, sendMedia)
 * 4. Target normalization
 * 5. Monitor/gateway inbound flow
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config resolution ──────────────────────────────────────────

describe('Shadow Config', () => {
  let getAccountConfig: typeof import('../src/config.js').getAccountConfig
  let listAccountIds: typeof import('../src/config.js').listAccountIds

  beforeEach(async () => {
    const mod = await import('../src/config.js')
    getAccountConfig = mod.getAccountConfig
    listAccountIds = mod.listAccountIds
  })

  describe('listAccountIds', () => {
    it('should return empty for unconfigured', () => {
      const ids = listAccountIds({})
      expect(ids).toEqual([])
    })

    it('should list accounts from multi-account config (shadowob key)', () => {
      const cfg = {
        channels: {
          shadowob: {
            accounts: {
              prod: { token: 'tok1', serverUrl: 'http://x:3002' },
              staging: { token: 'tok2', serverUrl: 'http://y:3002' },
            },
          },
        },
      }
      const ids = listAccountIds(cfg)
      expect(ids).toContain('prod')
      expect(ids).toContain('staging')
      expect(ids).toHaveLength(2)
    })

    it('should list accounts from the official shadowob key', () => {
      const cfg = {
        channels: {
          shadowob: {
            accounts: {
              prod: { token: 'tok1', serverUrl: 'http://x:3002' },
            },
          },
        },
      }
      const ids = listAccountIds(cfg)
      expect(ids).toContain('prod')
    })

    it('should add default account when base-level token is set', () => {
      const cfg = {
        channels: {
          shadowob: {
            token: 'my-token',
            serverUrl: 'http://localhost:3000',
          },
        },
      }
      const ids = listAccountIds(cfg)
      expect(ids).toContain('default')
    })
  })

  describe('getAccountConfig', () => {
    it('should return null for unconfigured account', () => {
      const account = getAccountConfig({}, 'default')
      expect(account).toBeNull()
    })

    it('should resolve base-level config as default account', () => {
      const cfg = {
        channels: {
          shadowob: {
            token: 'my-token',
            serverUrl: 'http://localhost:3000',
          },
        },
      }
      const account = getAccountConfig(cfg, 'default')
      expect(account).not.toBeNull()
      expect(account!.token).toBe('my-token')
      expect(account!.serverUrl).toBe('http://localhost:3000')
    })

    it('should resolve named account from multi-account config', () => {
      const cfg = {
        channels: {
          shadowob: {
            accounts: {
              mybot: {
                token: 'bot-token',
                serverUrl: 'http://shadow:3002',
              },
            },
          },
        },
      }
      const account = getAccountConfig(cfg, 'mybot')
      expect(account).not.toBeNull()
      expect(account!.token).toBe('bot-token')
    })

    it('should return null for non-existent named account', () => {
      const cfg = {
        channels: {
          shadowob: {
            accounts: {
              mybot: { token: 'tok', serverUrl: 'url' },
            },
          },
        },
      }
      const account = getAccountConfig(cfg, 'nonexistent')
      expect(account).toBeNull()
    })

    it('should default serverUrl to shadowob.com', () => {
      const cfg = {
        channels: {
          shadowob: {
            token: 'tok',
          },
        },
      }
      const account = getAccountConfig(cfg, 'default')
      expect(account!.serverUrl).toBe('https://shadowob.com')
    })

    it('should resolve the official shadowob config key', () => {
      const cfg = {
        channels: {
          shadowob: {
            token: 'legacy-token',
            serverUrl: 'http://legacy:3000',
          },
        },
      }
      const account = getAccountConfig(cfg, 'default')
      expect(account).not.toBeNull()
      expect(account!.token).toBe('legacy-token')
    })
  })
})

// ── Setup entry point ──────────────────────────────────────────

describe('Setup Entry Point', () => {
  it('should export a lightweight setup entry', async () => {
    const mod = await import('../setup-entry.js')
    const entry = mod.default
    expect(entry.plugin).toBeDefined()
    expect(entry.plugin.id).toBe('shadowob')
  })
})

// ── Slash commands ─────────────────────────────────────────────

describe('Slash Commands', () => {
  it('should resolve agent id from Shadow channel bindings', async () => {
    const { resolveShadowAgentIdFromConfig } = await import('../src/monitor.js')

    expect(
      resolveShadowAgentIdFromConfig(
        {
          agents: { list: [{ id: 'default-agent', default: true }] },
          bindings: [
            {
              agentId: 'seo-buddy',
              match: { channel: 'shadowob', accountId: 'seo-bot' },
            },
          ],
        },
        'seo-bot',
      ),
    ).toBe('seo-buddy')
    expect(
      resolveShadowAgentIdFromConfig({ agents: { list: [{ id: 'fallback-agent' }] } }, 'missing'),
    ).toBe('fallback-agent')
  })

  it('should normalize and match commands with aliases', async () => {
    const { matchShadowSlashCommand, normalizeShadowSlashCommands } = await import(
      '../src/monitor.js'
    )

    const commands = normalizeShadowSlashCommands([
      {
        name: '/audit',
        description: 'Audit a page',
        aliases: ['/a', 'bad alias!'],
        interaction: {
          kind: 'form',
          prompt: 'Fill this in',
          fields: [{ id: 'url', label: 'URL', kind: 'text', required: true }],
          responsePrompt: 'Run the audit with the submitted fields.',
        },
        body: '# Audit\nRun the SEO audit.',
      },
      { name: 'audit' },
      { name: '1bad' },
    ])

    expect(commands).toEqual([
      {
        name: 'audit',
        description: 'Audit a page',
        aliases: ['a'],
        interaction: {
          kind: 'form',
          prompt: 'Fill this in',
          fields: [{ id: 'url', label: 'URL', kind: 'text', required: true }],
          responsePrompt: 'Run the audit with the submitted fields.',
        },
        body: '# Audit\nRun the SEO audit.',
      },
    ])
    expect(matchShadowSlashCommand('/a https://example.com', commands)).toEqual({
      command: commands[0],
      invokedName: 'a',
      args: 'https://example.com',
    })
    expect(matchShadowSlashCommand('/unknown hi', commands)).toBeNull()
  })

  it('should format slash command prompts with definition and args', async () => {
    const { formatSlashCommandPrompt } = await import('../src/monitor.js')
    const prompt = formatSlashCommandPrompt('/audit /pricing', {
      command: {
        name: 'audit',
        description: 'Audit a page',
        packId: 'seomachine',
        sourcePath: '/agent-packs/seomachine/commands/audit/SKILL.md',
        body: '# Audit\nRun the SEO audit.',
      },
      invokedName: 'audit',
      args: '/pricing',
    })

    expect(prompt).toContain('Slash command /audit was invoked.')
    expect(prompt).toContain('Arguments:\n/pricing')
    expect(prompt).toContain('Command definition:\n# Audit')
  })

  it('should send slash-command interactive prompts back into the source thread', async () => {
    const { sendSlashCommandInteractivePrompt } = await import('../src/monitor/slash-commands.js')
    const sendMessage = vi.fn().mockResolvedValue({ id: 'prompt-1' })

    await sendSlashCommandInteractivePrompt({
      match: {
        command: {
          name: 'office-hour',
          interaction: {
            id: 'office-hour',
            kind: 'form',
            fields: [{ id: 'problem', label: 'Problem', kind: 'textarea' }],
          },
        },
        invokedName: 'office-hour',
        args: '',
      },
      messageId: 'source-message',
      channelId: 'channel-1',
      threadId: 'thread-1',
      client: { sendMessage } as never,
      runtime: {},
      agentId: 'agent-1',
      buddyUserId: 'bot-1',
    })

    expect(sendMessage).toHaveBeenCalledWith(
      'channel-1',
      expect.stringContaining('/office-hour needs input'),
      expect.objectContaining({
        replyToId: 'source-message',
        threadId: 'thread-1',
        metadata: expect.objectContaining({
          interactive: expect.objectContaining({ id: 'office-hour:source-message' }),
        }),
      }),
    )
  })

  it('should catch up missed user messages without replaying processed or old messages', async () => {
    const { shouldCatchUpShadowMessage } = await import('../src/monitor.js')
    const startedAtMs = Date.parse('2026-04-26T04:10:00.000Z')

    expect(
      shouldCatchUpShadowMessage(
        {
          id: 'missed',
          authorId: 'user-1',
          channelId: 'channel-1',
          createdAt: '2026-04-26T04:08:00.000Z',
        },
        { buddyUserId: 'bot-1', startedAtMs },
      ),
    ).toBe(true)

    expect(
      shouldCatchUpShadowMessage(
        {
          id: 'own',
          authorId: 'bot-1',
          channelId: 'channel-1',
          createdAt: '2026-04-26T04:08:00.000Z',
        },
        { buddyUserId: 'bot-1', startedAtMs },
      ),
    ).toBe(false)

    expect(
      shouldCatchUpShadowMessage(
        {
          id: 'processed',
          authorId: 'user-1',
          channelId: 'channel-1',
          createdAt: '2026-04-26T04:08:00.000Z',
        },
        {
          buddyUserId: 'bot-1',
          startedAtMs,
          processedMessageIds: new Set(['processed']),
        },
      ),
    ).toBe(false)

    expect(
      shouldCatchUpShadowMessage(
        {
          id: 'old',
          authorId: 'user-1',
          channelId: 'channel-1',
          createdAt: '2026-04-26T03:39:00.000Z',
        },
        { buddyUserId: 'bot-1', startedAtMs },
      ),
    ).toBe(false)

    expect(
      shouldCatchUpShadowMessage(
        {
          id: 'after-watermark',
          authorId: 'user-1',
          channelId: 'channel-1',
          createdAt: '2026-04-26T04:12:00.000Z',
        },
        {
          buddyUserId: 'bot-1',
          startedAtMs,
          watermarks: {
            'channel-1': { createdAt: '2026-04-26T04:11:00.000Z', messageId: 'last' },
          },
        },
      ),
    ).toBe(true)
  })

  it('should require the message tool for visible monitored channel replies', async () => {
    vi.useFakeTimers()
    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const dispatch = vi.fn(async () => undefined)
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: null,
            sessionKey: null,
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      await processShadowMessage({
        message: {
          id: 'msg-1',
          content: '你是谁？',
          channelId: 'ch-1',
          authorId: 'user-1',
          createdAt: '2026-05-08T09:07:40.000Z',
          updatedAt: '2026-05-08T09:07:40.000Z',
          author: {
            id: 'user-1',
            username: 'volthesitan_971163',
            displayName: 'Vol',
            isBot: false,
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'gstack-bot',
        agentId: 'strategy-buddy',
        channelPolicies: new Map(),
        channelServerMap: new Map(),
        slashCommands: [],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          replyOptions: {
            sourceReplyDeliveryMode: 'automatic',
          },
          ctx: expect.objectContaining({
            ChatType: 'channel',
            MessageSid: 'msg-1',
          }),
        }),
      )
      vi.runOnlyPendingTimers()
    } finally {
      vi.useRealTimers()
    }
  })

  it('should keep runtime task cards running after a successful reply dispatch', async () => {
    const { openClawRuntimeReplyProgressUpdate } = await import('../src/monitor/channel-message.js')

    expect(openClawRuntimeReplyProgressUpdate()).toEqual({
      status: 'running',
      note: 'OpenClaw runtime delivered a reply; awaiting explicit task completion',
    })
  })

  it('should bind runtime task cards to their task thread id', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { ShadowClient } = await import('@shadowob/sdk')
    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const { loadShadowThreadBindings } = await import('../src/monitor/thread-bindings.js')
    const dataDir = await mkdtemp(join(tmpdir(), 'shadow-openclaw-task-binding-'))
    const updateTaskCard = vi
      .spyOn(ShadowClient.prototype, 'updateTaskCard')
      .mockResolvedValue({ metadata: { cards: [] } } as never)
    const dispatch = vi.fn(async () => undefined)
    const runtime = { log: vi.fn(), error: vi.fn() }
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: 'agent-1',
            sessionKey: 'shadowob:channel:ch-1',
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      vi.stubEnv('OPENCLAW_DATA_DIR', dataDir)
      await processShadowMessage({
        message: {
          id: 'task-msg-1',
          content: 'Render this task',
          channelId: 'ch-1',
          authorId: 'user-1',
          threadId: null,
          createdAt: '2026-05-08T09:07:40.000Z',
          updatedAt: '2026-05-08T09:07:40.000Z',
          author: {
            id: 'user-1',
            username: 'admin',
            displayName: 'Admin',
            isBot: false,
          },
          metadata: {
            cards: [
              {
                id: 'card-1',
                kind: 'task',
                title: 'Render task',
                status: 'running',
                assignee: { userId: 'bot-1' },
                claim: { expiresAt: '2099-01-01T00:00:00.000Z' },
                data: { task: { threadId: 'thread-1' } },
              },
            ],
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime,
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'task-bot',
        agentId: null,
        channelPolicies: new Map(),
        channelServerMap: new Map(),
        slashCommands: [],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      expect(dispatch).toHaveBeenCalled()
      expect(updateTaskCard).toHaveBeenCalled()
      const bindings = await loadShadowThreadBindings('default')
      expect(bindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agentId: 'agent-1',
            sessionKey: 'shadowob:channel:ch-1:task:card-1',
            channelId: 'ch-1',
            threadId: 'thread-1',
            messageId: 'task-msg-1',
          }),
        ]),
      )
    } finally {
      updateTaskCard.mockRestore()
      vi.unstubAllEnvs()
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('should route bound task thread follow-ups through the existing task session', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { ShadowClient } = await import('@shadowob/sdk')
    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const { upsertShadowThreadBinding } = await import('../src/monitor/thread-bindings.js')
    const dataDir = await mkdtemp(join(tmpdir(), 'shadow-openclaw-task-followup-'))
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'wrong-target',
    } as never)
    const sendToThread = vi.spyOn(ShadowClient.prototype, 'sendToThread').mockResolvedValue({
      id: 'thread-reply-1',
      content: 'Bound thread reply',
      channelId: 'ch-1',
      threadId: 'thread-1',
      authorId: 'bot-1',
      createdAt: '2026-05-08T09:08:40.000Z',
      updatedAt: '2026-05-08T09:08:40.000Z',
    } as never)
    const dispatch = vi.fn(
      async (input: {
        ctx: Record<string, unknown>
        dispatcherOptions: { deliver: (payload: { text: string }) => Promise<void> }
      }) => {
        await input.dispatcherOptions.deliver({ text: 'Bound thread reply' })
      },
    )
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: 'agent-1',
            sessionKey: 'shadowob:channel:ch-1',
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      vi.stubEnv('OPENCLAW_DATA_DIR', dataDir)
      await upsertShadowThreadBinding({
        accountId: 'default',
        agentId: 'agent-1',
        sessionKey: 'shadowob:channel:ch-1:task:card-1',
        channelId: 'ch-1',
        threadId: 'thread-1',
        messageId: 'task-msg-1',
      })

      await processShadowMessage({
        message: {
          id: 'followup-msg-1',
          content: '你的设定是什么？',
          channelId: 'ch-1',
          authorId: 'user-1',
          threadId: 'thread-1',
          replyToId: 'task-msg-1',
          createdAt: '2026-05-08T09:08:40.000Z',
          updatedAt: '2026-05-08T09:08:40.000Z',
          author: {
            id: 'user-1',
            username: 'admin',
            displayName: 'Admin',
            isBot: false,
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'task-bot',
        agentId: null,
        channelPolicies: new Map([
          ['ch-1', { listen: true, reply: true, mentionOnly: true }],
        ]) as never,
        channelServerMap: new Map(),
        slashCommands: [],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx: expect.objectContaining({
            ChatType: 'thread',
            SessionKey: 'shadowob:channel:ch-1:task:card-1',
            ThreadId: 'thread-1',
            WasMentioned: true,
          }),
        }),
      )
      expect(sendMessage).not.toHaveBeenCalled()
      expect(sendToThread).toHaveBeenCalledWith(
        'thread-1',
        'Bound thread reply',
        expect.objectContaining({
          replyToId: 'followup-msg-1',
        }),
      )
    } finally {
      sendMessage.mockRestore()
      sendToThread.mockRestore()
      vi.unstubAllEnvs()
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('should recover unbound task thread follow-ups from the parent task card', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { ShadowClient } = await import('@shadowob/sdk')
    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const { loadShadowThreadBindings } = await import('../src/monitor/thread-bindings.js')
    const dataDir = await mkdtemp(join(tmpdir(), 'shadow-openclaw-task-recover-'))
    const getThread = vi.spyOn(ShadowClient.prototype, 'getThread').mockResolvedValue({
      id: 'thread-1',
      name: 'Recovered task thread',
      channelId: 'ch-1',
      parentMessageId: 'task-msg-1',
      createdAt: '2026-05-08T09:07:40.000Z',
    } as never)
    const getMessage = vi.spyOn(ShadowClient.prototype, 'getMessage').mockResolvedValue({
      id: 'task-msg-1',
      content: 'Original task',
      channelId: 'ch-1',
      authorId: 'user-1',
      threadId: null,
      createdAt: '2026-05-08T09:07:40.000Z',
      updatedAt: '2026-05-08T09:07:40.000Z',
      metadata: {
        cards: [
          {
            id: 'card-1',
            kind: 'task',
            title: 'Recovered task',
            status: 'running',
            assignee: { userId: 'bot-1' },
            claim: { expiresAt: '2099-01-01T00:00:00.000Z' },
            data: { task: { threadId: 'thread-1' } },
          },
        ],
      },
    } as never)
    const sendToThread = vi.spyOn(ShadowClient.prototype, 'sendToThread').mockResolvedValue({
      id: 'thread-reply-1',
      content: 'Recovered thread reply',
      channelId: 'ch-1',
      threadId: 'thread-1',
      authorId: 'bot-1',
      createdAt: '2026-05-08T09:08:40.000Z',
      updatedAt: '2026-05-08T09:08:40.000Z',
    } as never)
    const dispatch = vi.fn(
      async (input: {
        ctx: Record<string, unknown>
        dispatcherOptions: { deliver: (payload: { text: string }) => Promise<void> }
      }) => {
        await input.dispatcherOptions.deliver({ text: 'Recovered thread reply' })
      },
    )
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: 'agent-1',
            sessionKey: 'shadowob:channel:ch-1',
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      vi.stubEnv('OPENCLAW_DATA_DIR', dataDir)
      await processShadowMessage({
        message: {
          id: 'followup-msg-2',
          content: '继续解释一下',
          channelId: 'ch-1',
          authorId: 'user-1',
          threadId: 'thread-1',
          replyToId: 'task-msg-1',
          createdAt: '2026-05-08T09:08:40.000Z',
          updatedAt: '2026-05-08T09:08:40.000Z',
          author: {
            id: 'user-1',
            username: 'admin',
            displayName: 'Admin',
            isBot: false,
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'task-bot',
        agentId: null,
        channelPolicies: new Map([
          ['ch-1', { listen: true, reply: true, mentionOnly: true }],
        ]) as never,
        channelServerMap: new Map(),
        slashCommands: [],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      expect(getThread).toHaveBeenCalledWith('thread-1')
      expect(getMessage).toHaveBeenCalledWith('task-msg-1')
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx: expect.objectContaining({
            SessionKey: 'shadowob:channel:ch-1:task:card-1',
            ThreadId: 'thread-1',
            WasMentioned: true,
          }),
        }),
      )
      expect(sendToThread).toHaveBeenCalledWith(
        'thread-1',
        'Recovered thread reply',
        expect.objectContaining({
          replyToId: 'followup-msg-2',
        }),
      )
      expect(await loadShadowThreadBindings('default')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sessionKey: 'shadowob:channel:ch-1:task:card-1',
            threadId: 'thread-1',
            messageId: 'followup-msg-2',
          }),
        ]),
      )
    } finally {
      getThread.mockRestore()
      getMessage.mockRestore()
      sendToThread.mockRestore()
      vi.unstubAllEnvs()
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('should inject installed server app context for natural-language channel tasks', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/api/servers/server-1/apps')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'server-app-1',
              serverId: 'server-1',
              appKey: 'kanban',
              name: 'Kanban',
              description: 'Trello-style task board for server collaboration.',
              iconUrl: null,
              manifestUrl: null,
              manifest: {
                schemaVersion: 'shadow.app/1',
                appKey: 'kanban',
                name: 'Kanban',
                version: '0.1.0',
                entry: '/app',
                permissions: [],
                commands: [
                  {
                    name: 'list-cards',
                    title: 'List Cards',
                    description: 'List board cards by column.',
                    path: '/api/commands/list-cards',
                    method: 'POST',
                    input: 'json',
                    permission: 'kanban.cards:read',
                    action: 'read',
                    dataClass: 'server-private',
                  },
                ],
              },
              iframeEntry: '/app',
              allowedOrigins: ['http://localhost:4201'],
              apiBaseUrl: 'http://host.lima.internal:4201',
              defaultPermissions: ['kanban.cards:read'],
              defaultApprovalMode: 'first_time',
              status: 'active',
              installedByUserId: 'user-1',
              createdAt: '2026-05-19T00:00:00.000Z',
              updatedAt: '2026-05-19T00:00:00.000Z',
            },
          ],
          text: async () => '',
        }
      }
      if (href.endsWith('/api/servers/shadow-plays/apps/kanban/skills')) {
        return {
          ok: true,
          json: async () => ({
            markdown:
              '# Kanban\nUse `shadowob app call "kanban" list-cards --json` to inspect the board.',
          }),
          text: async () => '',
        }
      }
      return { ok: true, json: async () => ({}), text: async () => '' }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const dispatch = vi.fn(async () => undefined)
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: null,
            sessionKey: null,
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      await processShadowMessage({
        message: {
          id: 'msg-kanban',
          content: '当前 kanban 看板里有什么？按列总结一下。',
          channelId: 'ch-1',
          authorId: 'user-1',
          createdAt: '2026-05-19T09:07:40.000Z',
          updatedAt: '2026-05-19T09:07:40.000Z',
          author: {
            id: 'user-1',
            username: 'alice',
            displayName: 'Alice',
            isBot: false,
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'strategy-buddy',
        agentId: 'strategy-buddy',
        channelPolicies: new Map(),
        channelServerMap: new Map([
          [
            'ch-1',
            {
              serverId: 'server-1',
              serverSlug: 'shadow-plays',
              serverName: 'Shadow Plays',
              channelName: 'general',
            },
          ],
        ]),
        slashCommands: [],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      const ctx = dispatch.mock.calls[0]?.[0]?.ctx as {
        BodyForAgent?: string
        ServerApps?: Array<{ appKey: string }>
        ServerAppSummary?: string
      }
      expect(ctx.BodyForAgent).toContain('Shadow Apps available in this server')
      expect(ctx.BodyForAgent).toContain('Kanban')
      expect(ctx.BodyForAgent).toContain('Do not wait for the user to say a CLI command')
      expect(ctx.BodyForAgent).toContain('shadowob app call')
      expect(ctx.BodyForAgent).toContain('--channel-id "<current-channel-id>"')
      expect(ctx.BodyForAgent).toContain('not chat interactive dialogs')
      expect(ctx.ServerApps?.[0]?.appKey).toBe('kanban')
      expect(ctx.ServerAppSummary).toContain('Kanban (kanban)')
      vi.runOnlyPendingTimers()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('should inject Copilot app metadata into inbound context', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/api/servers/server-1/apps')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'server-app-1',
              serverId: 'server-1',
              appKey: 'kanban',
              name: 'Kanban',
              description: 'Trello-style task board for server collaboration.',
              manifest: {
                commands: [
                  {
                    name: 'cards.create',
                    title: 'Create Card',
                    description: 'Create a Kanban card.',
                    permission: 'kanban.cards:write',
                    action: 'write',
                    dataClass: 'server-private',
                  },
                ],
              },
              defaultPermissions: ['kanban.cards:write'],
              defaultApprovalMode: 'first_time',
              status: 'active',
            },
          ],
          text: async () => '',
        }
      }
      if (href.endsWith('/api/servers/shadow-plays/apps/kanban/skills')) {
        return {
          ok: true,
          json: async () => ({
            markdown: '# Kanban\nUse Kanban app commands for cards.',
          }),
          text: async () => '',
        }
      }
      return { ok: true, json: async () => ({}), text: async () => '' }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const dispatch = vi.fn(async () => undefined)
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: null,
            sessionKey: null,
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      await processShadowMessage({
        message: {
          id: 'msg-copilot',
          content: '把这个输入创建成一张卡片。',
          channelId: 'ch-1',
          authorId: 'user-1',
          createdAt: '2026-06-06T09:07:40.000Z',
          updatedAt: '2026-06-06T09:07:40.000Z',
          metadata: {
            copilotContext: {
              kind: 'server_app_copilot',
              appKey: 'kanban',
              serverAppId: 'server-app-1',
              appName: 'Kanban',
              serverId: 'server-1',
              serverSlug: 'shadow-plays',
              channelId: 'inbox-1',
              channelKind: 'inbox',
            },
          },
          author: {
            id: 'user-1',
            username: 'alice',
            displayName: 'Alice',
            isBot: false,
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'strategy-buddy',
        agentId: 'strategy-buddy',
        channelPolicies: new Map(),
        channelServerMap: new Map([
          [
            'ch-1',
            {
              serverId: 'server-1',
              serverSlug: 'shadow-plays',
              serverName: 'Shadow Plays',
              channelName: 'general',
            },
          ],
        ]),
        slashCommands: [],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      const ctx = dispatch.mock.calls[0]?.[0]?.ctx as {
        BodyForAgent?: string
        CopilotAppKey?: string
        CopilotChannelKind?: string
        CopilotServerAppId?: string
      }
      expect(ctx.CopilotAppKey).toBe('kanban')
      expect(ctx.CopilotChannelKind).toBe('inbox')
      expect(ctx.CopilotServerAppId).toBe('server-app-1')
      expect(ctx.BodyForAgent).toContain('Shadow Copilot app context')
      expect(ctx.BodyForAgent).toContain('Copilot channel kind: inbox')
      expect(ctx.BodyForAgent).toContain('copilot=true')
      vi.runOnlyPendingTimers()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('should inject descriptor-only server Buddy Inbox directory context', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/api/servers/shadow-plays/inboxes')) {
        return {
          ok: true,
          json: async () => [
            {
              agent: {
                id: 'coordinator-agent',
                ownerId: 'coordinator-user',
                status: 'busy',
                user: {
                  id: 'coordinator-user',
                  username: 'coordinator',
                  displayName: 'Coordinator Buddy',
                  avatarUrl: null,
                  isBot: true,
                },
              },
              channel: {
                id: 'inbox-coordinator',
                name: 'inbox-coordinator',
                type: 'text',
                serverId: 'server-1',
                topic: 'shadow:buddy-inbox:coordinator-agent',
                position: 0,
                isPrivate: true,
                createdAt: '2026-06-05T00:00:00.000Z',
                updatedAt: '2026-06-05T00:00:00.000Z',
              },
              canManage: false,
              server: { id: 'server-1', name: 'Shadow Plays', slug: 'shadow-plays' },
              messages: [{ content: 'private peer thread should not leak' }],
            },
            {
              agent: {
                id: 'brandscout-agent',
                ownerId: 'brandscout-user',
                status: 'idle',
                user: {
                  id: 'brandscout-user',
                  username: 'brandscout',
                  displayName: 'BrandScout',
                  avatarUrl: null,
                  isBot: true,
                },
              },
              channel: {
                id: 'inbox-brandscout',
                name: 'inbox-brandscout',
                type: 'text',
                serverId: 'server-1',
                topic: 'shadow:buddy-inbox:brandscout-agent',
                position: 1,
                isPrivate: true,
                createdAt: '2026-06-05T00:00:00.000Z',
                updatedAt: '2026-06-05T00:00:00.000Z',
              },
              canManage: false,
              server: { id: 'server-1', name: 'Shadow Plays', slug: 'shadow-plays' },
              messages: [{ content: 'private brand notes should not leak' }],
            },
          ],
          text: async () => '',
        }
      }
      if (href.endsWith('/api/servers/server-1/apps')) {
        return { ok: true, json: async () => [], text: async () => '' }
      }
      return { ok: true, json: async () => ({}), text: async () => '' }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const dispatch = vi.fn(async () => undefined)
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: null,
            sessionKey: null,
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      await processShadowMessage({
        message: {
          id: 'msg-buddy-directory',
          content: '请协调同服 Buddy 完成这个任务。',
          channelId: 'ch-1',
          authorId: 'user-1',
          createdAt: '2026-06-05T09:07:40.000Z',
          updatedAt: '2026-06-05T09:07:40.000Z',
          author: {
            id: 'user-1',
            username: 'alice',
            displayName: 'Alice',
            isBot: false,
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'coordinator',
        agentId: 'coordinator-agent',
        channelPolicies: new Map(),
        channelServerMap: new Map([
          [
            'ch-1',
            {
              serverId: 'server-1',
              serverSlug: 'shadow-plays',
              serverName: 'Shadow Plays',
              channelName: 'general',
            },
          ],
        ]),
        slashCommands: [],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      const ctx = dispatch.mock.calls[0]?.[0]?.ctx as {
        BodyForAgent?: string
        ServerBuddyInboxCount?: number
        ServerBuddyInboxes?: Array<{ agentId: string; current: boolean; channelId: string | null }>
        ServerBuddyInboxSummary?: string
      }
      expect(ctx.BodyForAgent).toContain('Shadow server Buddy Inbox directory')
      expect(ctx.BodyForAgent).toContain('BrandScout')
      expect(ctx.BodyForAgent).toContain('agentId=brandscout-agent')
      expect(ctx.BodyForAgent).toContain('shadowob inbox enqueue --server')
      expect(ctx.BodyForAgent).toContain('Remote config monitored channels')
      expect(ctx.BodyForAgent).toContain('canManage')
      expect(ctx.BodyForAgent).not.toContain('private peer thread should not leak')
      expect(ctx.BodyForAgent).not.toContain('private brand notes should not leak')
      expect(ctx.ServerBuddyInboxCount).toBe(2)
      expect(ctx.ServerBuddyInboxSummary).toContain('BrandScout(brandscout-agent')
      expect(ctx.ServerBuddyInboxes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agentId: 'coordinator-agent',
            current: true,
            channelId: 'inbox-coordinator',
          }),
          expect.objectContaining({
            agentId: 'brandscout-agent',
            current: false,
            channelId: 'inbox-brandscout',
          }),
        ]),
      )
      vi.runOnlyPendingTimers()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('should pass OpenClaw-native slash commands through without prompt rewriting', async () => {
    vi.useFakeTimers()
    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const dispatch = vi.fn(async () => undefined)
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: null,
            sessionKey: null,
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      await processShadowMessage({
        message: {
          id: 'msg-slash',
          content: '/model status',
          channelId: 'ch-1',
          authorId: 'user-1',
          createdAt: '2026-05-08T09:07:40.000Z',
          updatedAt: '2026-05-08T09:07:40.000Z',
          author: {
            id: 'user-1',
            username: 'alice',
            displayName: 'Alice',
            isBot: false,
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'gstack-bot',
        agentId: 'strategy-buddy',
        channelPolicies: new Map([
          [
            'ch-1',
            {
              listen: true,
              reply: true,
              mentionOnly: false,
              config: {
                ownerId: 'user-1',
                allowedTriggerUserIds: ['user-1', 'tenant-1'],
              },
            },
          ],
        ]),
        channelServerMap: new Map(),
        slashCommands: [
          {
            name: 'model',
            description: 'OpenClaw model command',
            dispatch: 'passthrough',
          },
        ],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx: expect.objectContaining({
            CommandBody: '/model status',
            BodyForCommands: '/model status',
            CommandAuthorized: true,
            CommandSource: 'text',
            OwnerAllowFrom: ['user-1'],
            NativeChannelId: 'ch-1',
            BodyForAgent: expect.not.stringContaining('Slash command /model was invoked.'),
            SlashCommand: '/model',
            SlashCommandArgs: 'status',
            WasMentioned: true,
          }),
        }),
      )
      vi.runOnlyPendingTimers()
    } finally {
      vi.useRealTimers()
    }
  })

  it('should not duplicate visible form echo in interactive response context', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/api/messages/source-form')) {
        return {
          ok: true,
          json: async () => ({
            id: 'source-form',
            content: 'What are you building?',
            channelId: 'ch-1',
            authorId: 'bot-1',
            createdAt: '2026-05-08T09:07:00.000Z',
            updatedAt: '2026-05-08T09:07:00.000Z',
            metadata: {
              interactive: {
                kind: 'form',
                prompt: 'Describe the idea.',
                responsePrompt: 'Use the submitted values to continue the office-hours command.',
              },
              slashCommand: {
                name: 'office-hours',
              },
            },
          }),
          text: async () => '',
        }
      }
      return { ok: true, json: async () => ({}), text: async () => '' }
    })
    vi.stubGlobal('fetch', fetchMock)

    const { processShadowMessage } = await import('../src/monitor/channel-message.js')
    const dispatch = vi.fn(async () => undefined)
    const core = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: null,
            sessionKey: null,
            accountId: 'default',
          })),
        },
        reply: {
          formatAgentEnvelope: vi.fn((params: { body: string }) => params.body),
          resolveEnvelopeFormatOptions: vi.fn(() => ({})),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: dispatch,
        },
        session: {
          resolveStorePath: vi.fn(() => '/tmp/openclaw-shadowob-test-store'),
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
    } as never

    try {
      await processShadowMessage({
        message: {
          id: 'response-msg',
          content: [
            'Use the submitted values as answers to this slash command.',
            '- Q1: Demand Reality: 1',
          ].join('\n'),
          channelId: 'ch-1',
          authorId: 'user-1',
          createdAt: '2026-05-08T09:08:00.000Z',
          updatedAt: '2026-05-08T09:08:00.000Z',
          author: {
            id: 'user-1',
            username: 'alice',
            displayName: 'Alice',
            isBot: false,
          },
          metadata: {
            interactiveResponse: {
              sourceMessageId: 'source-form',
              blockId: 'office-hours',
              actionId: 'submit',
              values: {
                demand: '1',
              },
            },
          },
        } as never,
        account: { token: 'tok', serverUrl: 'http://localhost:3002' },
        accountId: 'default',
        config: {},
        runtime: {},
        core,
        buddyUserId: 'bot-1',
        buddyUsername: 'gstack-bot',
        agentId: 'strategy-buddy',
        channelPolicies: new Map(),
        channelServerMap: new Map(),
        slashCommands: [
          {
            name: 'office-hours',
            body: '# Office hours\nAsk the next question only when more input is needed.',
          },
        ],
        socket: {
          sendTyping: vi.fn(),
          updateActivity: vi.fn(),
        } as never,
      })

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx: expect.objectContaining({
            BodyForAgent: expect.stringContaining('Submitted values'),
            InteractiveSourceMessage: 'What are you building?',
          }),
        }),
      )
      const ctx = dispatch.mock.calls[0]?.[0]?.ctx as { BodyForAgent?: string }
      expect(ctx.BodyForAgent).toContain('Use the submitted values once.')
      expect(ctx.BodyForAgent).not.toContain('User message:')
      expect(ctx.BodyForAgent).not.toContain('- Q1: Demand Reality: 1')
      vi.runOnlyPendingTimers()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})

// ── Plugin entry point ─────────────────────────────────────────

describe('Plugin Entry Point', () => {
  it('declares shadowob channel config metadata in the manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '..', 'openclaw.plugin.json'), 'utf-8'),
    )
    expect(manifest.channels).toContain('shadowob')
    expect(manifest.channelConfigs?.shadowob?.schema?.type).toBe('object')
    expect(manifest.channelConfigs.shadowob.schema.properties.accounts).toBeDefined()
    expect(
      manifest.channelConfigs.shadowob.schema.properties.capabilities.properties.inlineButtons,
    ).toBeDefined()
    expect(manifest.channelEnvVars?.shadowob).toContain('SHADOW_SERVER_URL')
  })

  it('should export a valid channel plugin entry via defineChannelPluginEntry', async () => {
    const mod = await import('../index.js')
    const plugin = mod.default
    expect(plugin.id).toBe('openclaw-shadowob')
    expect(plugin.name).toBe('ShadowOwnBuddy')
    expect(typeof plugin.register).toBe('function')
  })

  it('should register channel when register is called', async () => {
    const mod = await import('../index.js')
    const plugin = mod.default
    const mockApi = {
      runtime: { channel: {} },
      registrationMode: 'full',
      registerChannel: vi.fn(),
    }
    plugin.register(mockApi)
    expect(mockApi.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ plugin: expect.objectContaining({ id: 'shadowob' }) }),
    )
  })

  it('should export ShadowClient', async () => {
    const mod = await import('../index.js')
    expect(mod.ShadowClient).toBeDefined()
  })

  it('should export shadowPlugin', async () => {
    const mod = await import('../index.js')
    expect(mod.shadowPlugin).toBeDefined()
    expect(mod.shadowPlugin.id).toBe('shadowob')
  })

  it('should export runtime accessors', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.getShadowRuntime).toBe('function')
    expect(typeof mod.tryGetShadowRuntime).toBe('function')
  })

  it('should describe usable Shadow message actions and interactive schema', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    const discovery = shadowPlugin.actions?.describeMessageTool({ cfg: {} } as never)
    expect(discovery?.actions).toContain('send')
    expect(discovery?.actions).toContain('upload-file')
    expect(discovery?.actions).not.toContain('send-file')
    expect(discovery?.actions).not.toContain('send-interactive')
    expect(discovery?.actions).not.toContain('sendAttachment')
    expect(discovery?.actions).not.toContain('get-server')
    expect(discovery?.actions).not.toContain('update-homepage')
    expect(discovery?.capabilities).toContain('interactive')
    expect(discovery?.mediaSourceParams?.['upload-file']).toContain('path')
    expect(discovery?.mediaSourceParams?.['upload-file']).toContain('filePath')
    expect(discovery?.mediaSourceParams?.['upload-file']).toContain('buffer')
    expect(discovery?.mediaSourceParams?.['send-file']).toBeUndefined()
    expect(discovery?.mediaSourceParams?.sendAttachment).toBeUndefined()
    const schema = Array.isArray(discovery?.schema) ? discovery.schema[0] : discovery?.schema
    expect(schema?.properties.kind).toBeDefined()
    expect(schema?.properties.buttons).toBeDefined()
    expect(schema?.properties.fields).toBeDefined()
    expect(schema?.properties.media['~optional']).toBe('Optional')
    expect(schema?.properties.kind['~optional']).toBe('Optional')
    expect(schema?.properties.approvalCommentLabel).toBeDefined()
    expect(schema?.properties.commerceOfferId).toBeDefined()
    expect(schema?.properties.path).toBeDefined()
    expect(schema?.properties.filePath).toBeDefined()
    expect(schema?.properties.filename).toBeDefined()
    expect(schema?.properties.serverId).toBeUndefined()
    expect(schema?.properties.html).toBeUndefined()
  })

  it('should expose configured commerce offers in the message tool schema', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    const discovery = shadowPlugin.actions?.describeMessageTool({
      cfg: {
        channels: {
          shadowob: {
            token: 'tok',
            serverUrl: 'http://localhost:3002',
            accounts: {
              default: {
                token: 'tok',
                serverUrl: 'http://localhost:3002',
                commerceOffers: [
                  {
                    offerId: 'offer-match',
                    name: '一盒会发光的火柴',
                    summary: '购买后解锁一段火柴点亮的 HTML 动画。',
                  },
                ],
              },
            },
          },
        },
      },
      accountId: 'default',
    } as never)
    const schema = Array.isArray(discovery?.schema) ? discovery.schema[0] : discovery?.schema

    expect(schema?.properties.commerceOfferId.description).toContain('offer-match')
    expect(schema?.properties.commerceOfferId.description).toContain('一盒会发光的火柴')
  })

  it('should not expose unresolved commerce offer placeholders in the message tool schema', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    const discovery = shadowPlugin.actions?.describeMessageTool({
      cfg: {
        channels: {
          shadowob: {
            accounts: {
              default: {
                token: 'tok',
                serverUrl: 'http://localhost:3002',
                commerceOffers: [
                  {
                    offerId: '${env:SHADOW_COMMERCE_OFFER_MATCH}',
                    name: '一盒会发光的火柴',
                  },
                ],
              },
            },
          },
        },
      },
      accountId: 'default',
    } as never)
    const schema = Array.isArray(discovery?.schema) ? discovery.schema[0] : discovery?.schema

    expect(schema?.properties.commerceOfferId.description).not.toContain(
      'SHADOW_COMMERCE_OFFER_MATCH',
    )
  })

  it('should tell agents to include message when sending interactive dialogs', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    const hints = shadowPlugin.agentPrompt?.messageToolHints?.({ cfg: {} } as never) ?? []
    const text = hints.join('\n')

    expect(text).toContain('prefer sending a Shadow interactive dialog')
    expect(text).toContain('`message` is required')
    expect(text).toContain('`action: "upload-file"`')
    expect(text).toContain('Use `path`/`filePath`/`media`')
    expect(text).toContain('base64 `buffer`')
    expect(text).toContain('`contentType`')
    expect(text).toContain('including HTML, source code')
    expect(text).toContain('commerceOfferId')
    expect(text).not.toContain('send-file')
    expect(text).not.toContain('sendAttachment')
    expect(text).not.toContain('get-server')
    expect(text).not.toContain('update-homepage')
    expect(text).not.toContain('homepage')
  })

  it('should support only the current Shadow message actions', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'send' })).toBe(true)
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'send-interactive' as never })).toBe(
      false,
    )
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'send-file' as never })).toBe(false)
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'upload-file' as never })).toBe(true)
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'sendFile' as never })).toBe(false)
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'sendAttachment' as never })).toBe(
      false,
    )
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'get-server' as never })).toBe(false)
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'update-homepage' as never })).toBe(
      false,
    )
    expect(shadowPlugin.actions?.supportsAction?.({ action: 'pin' })).toBe(false)
  })

  it('should handle canonical upload-file actions as Shadow attachments', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowPlugin } = await import('../src/channel.js')
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'file-msg-1',
      content: 'Report',
      channelId: 'ch-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)
    const uploadMediaFromUrl = vi
      .spyOn(ShadowClient.prototype, 'uploadMediaFromUrl')
      .mockResolvedValue({ url: '/media/report.txt', key: 'report.txt', size: 12 })

    try {
      const result = await shadowPlugin.actions?.handleAction?.({
        action: 'upload-file',
        accountId: 'default',
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        params: {
          target: 'shadowob:channel:ch-123',
          path: '/home/openclaw/.openclaw/workspace/demo/report.txt',
          caption: 'Report',
        },
      } as never)

      expect(sendMessage).toHaveBeenCalledWith('ch-123', 'Report', {
        replyToId: undefined,
        metadata: undefined,
      })
      expect(uploadMediaFromUrl).toHaveBeenCalledWith(
        '/home/openclaw/.openclaw/workspace/demo/report.txt',
        { messageId: 'file-msg-1' },
      )
      expect(result?.details).toMatchObject({
        ok: true,
        action: 'upload-file',
        canonicalAction: 'upload-file',
        messageId: 'file-msg-1',
      })
    } finally {
      sendMessage.mockRestore()
      uploadMediaFromUrl.mockRestore()
    }
  })

  it('should upload arbitrary HTML files from base64 buffers', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowPlugin } = await import('../src/channel.js')
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'file-msg-1',
      content: 'HTML demo',
      channelId: 'ch-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)
    const uploadMedia = vi
      .spyOn(ShadowClient.prototype, 'uploadMedia')
      .mockResolvedValue({ url: '/media/demo.html', key: 'demo.html', size: 31 })

    try {
      const result = await shadowPlugin.actions?.handleAction?.({
        action: 'upload-file',
        accountId: 'default',
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        params: {
          target: 'shadowob:channel:ch-123',
          buffer: Buffer.from('<!doctype html><h1>Demo</h1>').toString('base64'),
          filename: 'demo.html',
          contentType: 'text/html',
          caption: 'HTML demo',
        },
      } as never)

      expect(sendMessage).toHaveBeenCalledWith('ch-123', 'HTML demo', {
        replyToId: undefined,
        metadata: undefined,
      })
      expect(uploadMedia).toHaveBeenCalledWith(expect.any(Blob), 'demo.html', 'text/html', {
        messageId: 'file-msg-1',
      })
      expect(result?.details).toMatchObject({
        ok: true,
        action: 'upload-file',
        canonicalAction: 'upload-file',
        messageId: 'file-msg-1',
        filename: 'demo.html',
      })
    } finally {
      sendMessage.mockRestore()
      uploadMedia.mockRestore()
    }
  })

  it('should attach media when the shared send action includes a file path', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowPlugin } = await import('../src/channel.js')
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'send-media-msg-1',
      content: 'Report',
      channelId: 'ch-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)
    const uploadMediaFromUrl = vi
      .spyOn(ShadowClient.prototype, 'uploadMediaFromUrl')
      .mockResolvedValue({ url: '/media/report.md', key: 'report.md', size: 12 })

    try {
      const result = await shadowPlugin.actions?.handleAction?.({
        action: 'send',
        accountId: 'default',
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        params: {
          target: 'shadowob:channel:ch-123',
          message: 'Report',
          path: '/home/openclaw/.openclaw/workspace/demo/report.md',
        },
      } as never)

      expect(sendMessage).toHaveBeenCalledWith('ch-123', 'Report', {
        replyToId: undefined,
        metadata: undefined,
      })
      expect(uploadMediaFromUrl).toHaveBeenCalledWith(
        '/home/openclaw/.openclaw/workspace/demo/report.md',
        { messageId: 'send-media-msg-1' },
      )
      expect(result?.details).toMatchObject({
        ok: true,
        action: 'send',
        messageId: 'send-media-msg-1',
        attachment: true,
      })
    } finally {
      sendMessage.mockRestore()
      uploadMediaFromUrl.mockRestore()
    }
  })

  it('should preserve metadata when sending to a thread-only target', async () => {
    const { sendShadowMessage } = await import('../src/channel/send.js')
    const sendToThread = vi.fn().mockResolvedValue({ id: 'msg-1' })

    await sendShadowMessage({
      client: { sendToThread } as never,
      to: 'shadowob:thread:thread-1',
      content: 'Fill this in',
      metadata: { interactive: { id: 'form-1', kind: 'form' } },
    })

    expect(sendToThread).toHaveBeenCalledWith('thread-1', 'Fill this in', {
      metadata: { interactive: { id: 'form-1', kind: 'form' } },
    })
  })

  it('should deliver monitored agent replies as channel replies even when the source has a threadId', async () => {
    const { deliverShadowReply } = await import('../src/monitor/reply-delivery.js')
    const sendMessage = vi.fn().mockResolvedValue({
      id: 'reply-msg-1',
      content: 'Hello from Buddy',
      channelId: 'ch-1',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    })
    const sendToThread = vi.fn()

    await deliverShadowReply({
      payload: { text: 'Hello from Buddy' },
      channelId: 'ch-1',
      threadId: 'thread-1',
      replyToId: 'source-message-1',
      client: { sendMessage, sendToThread } as never,
      runtime: {},
      agentId: null,
      buddyUserId: 'bot-1',
    })

    expect(sendToThread).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith(
      'ch-1',
      'Hello from Buddy',
      expect.objectContaining({
        replyToId: 'source-message-1',
        metadata: expect.objectContaining({
          shadowDelivery: expect.objectContaining({
            source: 'openclaw-shadowob',
            replyToId: 'source-message-1',
          }),
        }),
      }),
    )
  })

  it('should deliver explicit thread targets through the thread route', async () => {
    const { deliverShadowReply } = await import('../src/monitor/reply-delivery.js')
    const sendMessage = vi.fn()
    const sendToThread = vi.fn().mockResolvedValue({
      id: 'thread-reply-1',
      content: '补一个不同角度',
      channelId: 'ch-1',
      threadId: 'thread-1',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    })

    await deliverShadowReply({
      payload: { text: '补一个不同角度' },
      channelId: 'ch-1',
      threadId: 'thread-1',
      replyToId: 'source-message-1',
      target: 'thread',
      client: { sendMessage, sendToThread } as never,
      runtime: {},
      agentId: null,
      buddyUserId: 'bot-1',
    })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(sendToThread).toHaveBeenCalledWith(
      'thread-1',
      '补一个不同角度',
      expect.objectContaining({
        replyToId: 'source-message-1',
        metadata: expect.objectContaining({
          shadowDelivery: expect.objectContaining({
            replyToId: 'source-message-1',
          }),
        }),
      }),
    )
  })

  it('should not infer reactions from text-only replies', async () => {
    const { deliverShadowReply } = await import('../src/monitor/reply-delivery.js')
    const sendMessage = vi.fn().mockResolvedValue({
      id: 'reply-msg-1',
      content: '+1',
      channelId: 'ch-1',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    })
    const sendToThread = vi.fn()
    const addReaction = vi.fn().mockResolvedValue(undefined)

    await deliverShadowReply({
      payload: { text: '+1' },
      channelId: 'ch-1',
      replyToId: 'source-message-1',
      client: { sendMessage, sendToThread, addReaction } as never,
      runtime: {},
      agentId: null,
      buddyUserId: 'bot-1',
    })

    expect(addReaction).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith(
      'ch-1',
      '+1',
      expect.objectContaining({
        replyToId: 'source-message-1',
      }),
    )
    expect(sendToThread).not.toHaveBeenCalled()
  })

  it('should keep interactive dialogs on the shared send action', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowPlugin } = await import('../src/channel.js')
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'form-msg-1',
      content: 'Fill this in',
      channelId: 'ch-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)

    try {
      const result = await shadowPlugin.actions?.handleAction?.({
        action: 'send',
        accountId: 'default',
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        params: {
          target: 'shadowob:channel:ch-123',
          message: 'Fill this in',
          prompt: 'Fill this in',
          kind: 'form',
          fields: [{ id: 'decision', label: 'Decision', kind: 'textarea', required: true }],
        },
      } as never)

      expect(sendMessage).toHaveBeenCalledWith('ch-123', 'Fill this in', {
        replyToId: undefined,
        metadata: {
          interactive: expect.objectContaining({
            kind: 'form',
            prompt: 'Fill this in',
            fields: [expect.objectContaining({ id: 'decision', required: true })],
          }),
        },
      })
      expect(result?.details).toMatchObject({
        ok: true,
        action: 'send',
        messageId: 'form-msg-1',
        interactive: true,
        kind: 'form',
      })
    } finally {
      sendMessage.mockRestore()
    }
  })

  it('should attach commerce offer cards on the shared send action', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowPlugin } = await import('../src/channel.js')
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'commerce-msg-1',
      content: 'Would you like a match?',
      channelId: 'ch-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)

    try {
      const result = await shadowPlugin.actions?.handleAction?.({
        action: 'send',
        accountId: 'default',
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        params: {
          target: 'shadowob:channel:ch-123',
          message: 'Would you like a match?',
          commerceOfferId: 'offer-123',
        },
      } as never)

      expect(sendMessage).toHaveBeenCalledWith('ch-123', 'Would you like a match?', {
        replyToId: undefined,
        metadata: {
          cards: [{ kind: 'offer', offerId: 'offer-123' }],
        },
      })
      expect(result?.details).toMatchObject({
        ok: true,
        action: 'send',
        messageId: 'commerce-msg-1',
        commerceCard: true,
        offerId: 'offer-123',
      })
    } finally {
      sendMessage.mockRestore()
    }
  })

  it('should reject approval dialogs that do not include the visible proposal', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    const result = await shadowPlugin.actions?.handleAction?.({
      action: 'send',
      accountId: 'default',
      cfg: {
        channels: {
          shadowob: {
            token: 'tok',
            serverUrl: 'http://localhost:9',
          },
        },
      },
      params: {
        target: 'shadowob:channel:channel-id',
        message: 'CEO Review 完成。认可这个 90 天路线图和 MVP 范围吗?',
        kind: 'approval',
        prompt: 'CEO Review 完成。认可这个 90 天路线图和 MVP 范围吗?',
      },
    } as never)

    expect(result?.details).toMatchObject({
      ok: false,
      error: expect.stringContaining('visible proposal'),
    })
  })
})

// ── Shadow Client ──────────────────────────────────────────────

describe('ShadowClient', () => {
  let ShadowClient: typeof import('@shadowob/sdk').ShadowClient

  beforeEach(async () => {
    const mod = await import('@shadowob/sdk')
    ShadowClient = mod.ShadowClient
  })

  it('should construct with baseUrl and token', () => {
    const client = new ShadowClient('http://localhost:3000', 'my-token')
    expect(client).toBeDefined()
  })

  it('should normalize baseUrl by stripping trailing /api', () => {
    const client1 = new ShadowClient('http://localhost:3000/api', 'tok')
    const client2 = new ShadowClient('http://localhost:3000/api/', 'tok')
    const client3 = new ShadowClient('http://localhost:3000', 'tok')
    expect(client1).toBeDefined()
    expect(client2).toBeDefined()
    expect(client3).toBeDefined()
  })

  it('should have all API methods', () => {
    const client = new ShadowClient('http://localhost:3000', 'tok')
    expect(typeof client.sendMessage).toBe('function')
    expect(typeof client.getMessages).toBe('function')
    expect(typeof client.editMessage).toBe('function')
    expect(typeof client.deleteMessage).toBe('function')
    expect(typeof client.addReaction).toBe('function')
    expect(typeof client.removeReaction).toBe('function')
    expect(typeof client.createThread).toBe('function')
    expect(typeof client.getThreadMessages).toBe('function')
    expect(typeof client.sendToThread).toBe('function')
    expect(typeof client.getServerChannels).toBe('function')
    expect(typeof client.getMe).toBe('function')
  })
})

// ── Outbound adapter ──────────────────────────────────────────

describe('Shadow Outbound', () => {
  it('should throw when account not configured (sendText)', async () => {
    const { shadowOutbound } = await import('../src/outbound.js')
    await expect(
      shadowOutbound.sendText({
        cfg: {},
        to: 'shadowob:channel:ch-123',
        text: 'Hello',
      }),
    ).rejects.toThrow('not configured')
  })

  it('should throw when account not configured (sendMedia)', async () => {
    const { shadowOutbound } = await import('../src/outbound.js')
    await expect(
      shadowOutbound.sendMedia({
        cfg: {},
        to: 'shadowob:channel:ch-123',
        mediaUrl: 'http://example.com/img.png',
      }),
    ).rejects.toThrow('not configured')
  })

  it('should parse target with shadowob prefix', async () => {
    const { parseTarget } = await import('../src/outbound.js')
    expect(parseTarget('shadowob:channel:abc')).toEqual({ channelId: 'abc' })
    expect(parseTarget('shadowob:channel:abc:thread:xyz')).toEqual({
      channelId: 'abc',
      threadId: 'xyz',
    })
    expect(parseTarget('shadowob:thread:xyz')).toEqual({ threadId: 'xyz' })
  })

  it('should parse target with openclaw-shadowob prefix', async () => {
    const { parseTarget } = await import('../src/outbound.js')
    expect(parseTarget('shadowob:channel:abc')).toEqual({ channelId: 'abc' })
    expect(parseTarget('openclaw-shadowob:channel:abc')).toEqual({ channelId: 'abc' })
  })

  it('should fallback to raw string as channel ID', async () => {
    const { parseTarget } = await import('../src/outbound.js')
    expect(parseTarget('some-uuid')).toEqual({ channelId: 'some-uuid' })
  })

  it('should expose the official OpenClaw sendText adapter', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowOutbound } = await import('../src/outbound.js')
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'msg-1',
      content: 'Hello',
      channelId: 'ch-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)

    try {
      const result = await shadowOutbound.sendText({
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        to: 'shadowob:channel:ch-123',
        text: 'Hello',
      })

      expect(sendMessage).toHaveBeenCalledWith('ch-123', 'Hello', { replyToId: undefined })
      expect(result).toMatchObject({
        channel: 'shadowob',
        messageId: 'msg-1',
        channelId: 'ch-123',
      })
    } finally {
      sendMessage.mockRestore()
    }
  })

  it('should resolve outbound Shadow mentions before sending channel text', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowOutbound } = await import('../src/outbound.js')
    const resolvedMention = {
      kind: 'user',
      targetId: 'user-admin',
      userId: 'user-admin',
      token: '@admin',
      label: '@Admin',
      range: { start: 3, end: 9 },
    }
    const resolveMentions = vi
      .spyOn(ShadowClient.prototype, 'resolveMentions')
      .mockResolvedValue({ mentions: [resolvedMention] } as never)
    const sendMessage = vi.spyOn(ShadowClient.prototype, 'sendMessage').mockResolvedValue({
      id: 'msg-mention',
      content: 'hi @admin',
      channelId: 'ch-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)

    try {
      await shadowOutbound.sendText({
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        to: 'shadowob:channel:ch-123',
        text: 'hi @admin',
      })

      expect(resolveMentions).toHaveBeenCalledWith({
        channelId: 'ch-123',
        content: 'hi @admin',
      })
      expect(sendMessage).toHaveBeenCalledWith('ch-123', 'hi @admin', {
        replyToId: undefined,
        mentions: [resolvedMention],
      })
    } finally {
      resolveMentions.mockRestore()
      sendMessage.mockRestore()
    }
  })

  it('should not expose removed DM targets through plugin messaging', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    expect(shadowPlugin.messaging?.parseExplicitTarget?.({ raw: 'shadowob:direct:123' })).toBeNull()
    expect(shadowPlugin.messaging?.inferTargetChatType?.({ to: 'shadowob:direct:123' })).toBe(
      'channel',
    )
  })

  it('should send official OpenClaw text deliveries into thread-only targets', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowOutbound } = await import('../src/outbound.js')
    const sendToThread = vi.spyOn(ShadowClient.prototype, 'sendToThread').mockResolvedValue({
      id: 'thread-msg-1',
      content: 'Hello thread',
      channelId: 'ch-123',
      threadId: 'thread-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)

    try {
      const result = await shadowOutbound.sendText({
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        to: 'shadowob:thread:thread-123',
        text: 'Hello thread',
      })

      expect(sendToThread).toHaveBeenCalledWith('thread-123', 'Hello thread')
      expect(result).toMatchObject({
        channel: 'shadowob',
        messageId: 'thread-msg-1',
        conversationId: 'thread-123',
        meta: { threadId: 'thread-123' },
      })
    } finally {
      sendToThread.mockRestore()
    }
  })

  it('should expose the official OpenClaw sendMedia adapter and continue after upload fallback', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowOutbound } = await import('../src/outbound.js')
    const sendMessage = vi
      .spyOn(ShadowClient.prototype, 'sendMessage')
      .mockResolvedValueOnce({
        id: 'caption-msg',
        content: 'Files',
        channelId: 'ch-123',
        authorId: 'bot-1',
        createdAt: '2026-04-27T00:00:00.000Z',
        updatedAt: '2026-04-27T00:00:00.000Z',
      } as never)
      .mockResolvedValueOnce({
        id: 'fallback-msg',
        content: 'file:///missing.png',
        channelId: 'ch-123',
        authorId: 'bot-1',
        createdAt: '2026-04-27T00:00:01.000Z',
        updatedAt: '2026-04-27T00:00:01.000Z',
      } as never)
    const uploadMediaFromUrl = vi
      .spyOn(ShadowClient.prototype, 'uploadMediaFromUrl')
      .mockRejectedValueOnce(new Error('missing file'))
      .mockResolvedValueOnce({ url: '/media/ok.png', key: 'ok.png', size: 42 })

    try {
      const result = await shadowOutbound.sendMedia({
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        to: 'shadowob:channel:ch-123',
        text: 'Files',
        mediaUrls: ['file:///missing.png', 'file:///ok.png'],
      })

      expect(uploadMediaFromUrl).toHaveBeenCalledTimes(2)
      expect(sendMessage).toHaveBeenNthCalledWith(1, 'ch-123', 'Files', {
        replyToId: undefined,
      })
      expect(sendMessage).toHaveBeenNthCalledWith(2, 'ch-123', 'file:///missing.png', {
        replyToId: 'caption-msg',
      })
      expect(result).toMatchObject({
        channel: 'shadowob',
        messageId: 'fallback-msg',
        meta: {
          mediaUploadFallback: true,
          mediaUploadErrors: ['missing file'],
        },
      })
    } finally {
      sendMessage.mockRestore()
      uploadMediaFromUrl.mockRestore()
    }
  })
})

// ── Inbound media ─────────────────────────────────────────────

describe('Shadow inbound media', () => {
  it('downloads relative signed media URLs from markdown bodies', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { ShadowClient } = await import('@shadowob/sdk')
    const { resolveShadowInboundMediaContext } = await import('../src/monitor/media.js')
    const dataDir = await mkdtemp(join(tmpdir(), 'shadow-openclaw-media-'))
    const downloadFile = vi.spyOn(ShadowClient.prototype, 'downloadFile').mockResolvedValue({
      buffer: new TextEncoder().encode('PNG').buffer,
      contentType: 'image/png',
      filename: 'signed.png',
    })

    try {
      vi.stubEnv('OPENCLAW_DATA_DIR', dataDir)
      const result = await resolveShadowInboundMediaContext({
        account: { serverUrl: 'http://localhost:3000', token: 'tok' },
        message: { attachments: [] } as never,
        rawBody: 'look\n![signed](/api/media/signed/token_123)\nnext',
        runtime: { log: vi.fn(), error: vi.fn() },
      })

      expect(downloadFile).toHaveBeenCalledWith('/api/media/signed/token_123')
      expect(result.cleanBody).toBe('look\nnext')
      expect(result.fields.MediaUrl).toBe('http://localhost:3000/api/media/signed/token_123')
      expect(result.fields.MediaType).toBe('image/png')
      expect(result.fields.MediaPaths).toEqual([expect.stringContaining('signed.png')])
    } finally {
      downloadFile.mockRestore()
      vi.unstubAllEnvs()
      await rm(dataDir, { recursive: true, force: true })
    }
  })
})

// ── Config Schema ──────────────────────────────────────────────

describe('Shadow Config Schema', () => {
  it('should validate simplified config', async () => {
    const { ShadowConfigSchema } = await import('../src/config-schema.js')
    const result = ShadowConfigSchema.safeParse({
      token: 'test-token',
      serverUrl: 'http://localhost:3000',
    })
    expect(result.success).toBe(true)
  })

  it('should validate multi-account config', async () => {
    const { ShadowConfigSchema } = await import('../src/config-schema.js')
    const result = ShadowConfigSchema.safeParse({
      capabilities: { inlineButtons: 'all', interactive: true, forms: true },
      accounts: {
        bot1: {
          token: 'token-1',
          serverUrl: 'http://localhost:3000',
          capabilities: { inlineButtons: 'all' },
        },
        bot2: { token: 'token-2', serverUrl: 'http://localhost:3000', enabled: true },
      },
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty token', async () => {
    const { ShadowConfigSchema } = await import('../src/config-schema.js')
    const result = ShadowConfigSchema.safeParse({
      token: '',
      serverUrl: 'http://localhost:3000',
    })
    expect(result.success).toBe(false)
  })
})
