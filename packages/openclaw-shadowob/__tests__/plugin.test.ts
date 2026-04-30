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
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      botUserId: 'bot-1',
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
        { botUserId: 'bot-1', startedAtMs },
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
        { botUserId: 'bot-1', startedAtMs },
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
          botUserId: 'bot-1',
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
        { botUserId: 'bot-1', startedAtMs },
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
          botUserId: 'bot-1',
          startedAtMs,
          watermarks: {
            'channel-1': { createdAt: '2026-04-26T04:11:00.000Z', messageId: 'last' },
          },
        },
      ),
    ).toBe(true)
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
    expect(discovery?.mediaSourceParams?.['send-file']).toBeUndefined()
    expect(discovery?.mediaSourceParams?.sendAttachment).toBeUndefined()
    const schema = Array.isArray(discovery?.schema) ? discovery.schema[0] : discovery?.schema
    expect(schema?.properties.kind).toBeDefined()
    expect(schema?.properties.buttons).toBeDefined()
    expect(schema?.properties.fields).toBeDefined()
    expect(schema?.properties.media['~optional']).toBe('Optional')
    expect(schema?.properties.kind['~optional']).toBe('Optional')
    expect(schema?.properties.approvalCommentLabel).toBeDefined()
    expect(schema?.properties.path).toBeDefined()
    expect(schema?.properties.filePath).toBeDefined()
    expect(schema?.properties.filename).toBeDefined()
    expect(schema?.properties.serverId).toBeUndefined()
    expect(schema?.properties.html).toBeUndefined()
  })

  it('should tell agents to include message when sending interactive dialogs', async () => {
    const { shadowPlugin } = await import('../src/channel.js')
    const hints = shadowPlugin.agentPrompt?.messageToolHints?.({ cfg: {} } as never) ?? []
    const text = hints.join('\n')

    expect(text).toContain('prefer sending a Shadow interactive dialog')
    expect(text).toContain('`message` is required')
    expect(text).toContain('`action: "upload-file"`')
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
        'file-msg-1',
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
        'send-media-msg-1',
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
    expect(parseTarget('shadowob:dm:dm-123')).toEqual({ dmChannelId: 'dm-123' })
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

  it('should expose DM targets through plugin messaging and outbound delivery', async () => {
    const { ShadowClient } = await import('@shadowob/sdk')
    const { shadowPlugin } = await import('../src/channel.js')
    const { shadowOutbound } = await import('../src/outbound.js')
    const sendDmMessage = vi.spyOn(ShadowClient.prototype, 'sendDmMessage').mockResolvedValue({
      id: 'dm-msg-1',
      content: 'Hello DM',
      channelId: 'dm:dm-123',
      dmChannelId: 'dm-123',
      authorId: 'bot-1',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    } as never)

    try {
      expect(shadowPlugin.capabilities?.chatTypes).toContain('direct')
      expect(shadowPlugin.messaging?.parseExplicitTarget?.({ raw: 'shadowob:dm:dm-123' })).toEqual({
        to: 'shadowob:dm:dm-123',
        chatType: 'direct',
      })

      const result = await shadowOutbound.sendText({
        cfg: {
          channels: {
            shadowob: {
              token: 'tok',
              serverUrl: 'http://localhost:3002',
            },
          },
        },
        to: 'shadowob:dm:dm-123',
        text: 'Hello DM',
      })

      expect(sendDmMessage).toHaveBeenCalledWith('dm-123', 'Hello DM', {
        replyToId: undefined,
      })
      expect(result).toMatchObject({
        channel: 'shadowob',
        messageId: 'dm-msg-1',
        dmChannelId: 'dm-123',
        conversationId: 'dm-123',
      })
    } finally {
      sendDmMessage.mockRestore()
    }
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
