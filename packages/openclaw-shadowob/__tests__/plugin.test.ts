/**
 * OpenClaw Shadow Plugin Tests (openclaw-shadowob)
 *
 * Tests for the @shadowob/openclaw-shadowob plugin:
 * 1. Plugin registration and metadata
 * 2. Config resolution (single + multi-account, with fallback keys)
 * 3. Outbound adapter (attachedResults.sendText, base.sendMedia)
 * 4. Target normalization
 * 5. Monitor/gateway inbound flow
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

    it('should list accounts from legacy shadowob key', () => {
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

    it('should fall back to legacy shadowob config key', () => {
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

// ── Plugin metadata ────────────────────────────────────────────

describe('Shadow Plugin', () => {
  let shadowPlugin: typeof import('../src/channel.js').shadowPlugin

  beforeEach(async () => {
    const mod = await import('../src/channel.js')
    shadowPlugin = mod.shadowPlugin
  })

  it('should have correct ID', () => {
    expect(shadowPlugin.id).toBe('shadowob')
  })

  it('should have correct meta', () => {
    expect(shadowPlugin.meta.id).toBe('shadowob')
    expect(shadowPlugin.meta.label).toBe('ShadowOwnBuddy')
    expect(shadowPlugin.meta.docsPath).toBe('/channels/shadowob')
  })

  it('should declare channel + thread capabilities', () => {
    expect(shadowPlugin.capabilities.chatTypes).toContain('channel')
    expect(shadowPlugin.capabilities.chatTypes).toContain('thread')
    expect(shadowPlugin.capabilities.reactions).toBe(true)
    expect(shadowPlugin.capabilities.threads).toBe(true)
    expect(shadowPlugin.capabilities.media).toBe(true)
    expect(shadowPlugin.capabilities.reply).toBe(true)
    expect(shadowPlugin.capabilities.edit).toBe(true)
  })

  it('should have outbound adapter with SDK pattern', () => {
    expect(shadowPlugin.outbound).toBeDefined()
    expect(shadowPlugin.outbound!.attachedResults).toBeDefined()
    expect(typeof shadowPlugin.outbound!.attachedResults.sendText).toBe('function')
    expect(shadowPlugin.outbound!.base).toBeDefined()
    expect(typeof shadowPlugin.outbound!.base.sendMedia).toBe('function')
  })

  it('should have gateway adapter', () => {
    expect(shadowPlugin.gateway).toBeDefined()
    expect(typeof shadowPlugin.gateway!.startAccount).toBe('function')
    expect(typeof shadowPlugin.gateway!.stopAccount).toBe('function')
  })

  it('should have mentions adapter with @username pattern', () => {
    expect(shadowPlugin.mentions).toBeDefined()
    const patterns = shadowPlugin.mentions!.stripPatterns!({} as any)
    expect(patterns).toContain('@[\\w-]+')
  })

  it('should have threading config', () => {
    expect(shadowPlugin.threading).toBeDefined()
    expect(shadowPlugin.threading!.topLevelReplyToMode).toBe('reply')
  })

  it('should have messaging adapter with target normalization', () => {
    expect(shadowPlugin.messaging).toBeDefined()
    const normalized = shadowPlugin.messaging!.normalizeTarget!(
      '550e8400-e29b-41d4-a716-446655440000',
    )
    expect(normalized).toBe('shadowob:channel:550e8400-e29b-41d4-a716-446655440000')
    const prefixed = shadowPlugin.messaging!.normalizeTarget!('shadowob:channel:abc')
    expect(prefixed).toBe('shadowob:channel:abc')
    const invalid = shadowPlugin.messaging!.normalizeTarget!('not-a-uuid')
    expect(invalid).toBeUndefined()
  })

  it('should have status adapter', () => {
    expect(shadowPlugin.status).toBeDefined()
    expect(shadowPlugin.status!.defaultRuntime).toBeDefined()
    expect(shadowPlugin.status!.defaultRuntime!.running).toBe(false)
    expect(typeof shadowPlugin.status!.probeAccount).toBe('function')
  })

  it('should have setup adapter (SDK pattern)', () => {
    expect(shadowPlugin.setup).toBeDefined()
    expect(typeof shadowPlugin.setup!.resolveAccount).toBe('function')
    expect(typeof shadowPlugin.setup!.inspectAccount).toBe('function')
  })

  it('should resolve account via setup adapter', () => {
    const cfg = {
      channels: { shadowob: { token: 'my-token', serverUrl: 'http://localhost:3000' } },
    }
    const account = shadowPlugin.setup!.resolveAccount(cfg, null)
    expect(account.token).toBe('my-token')
    expect(account.serverUrl).toBe('http://localhost:3000')
  })

  it('should resolve account via setup adapter with legacy key', () => {
    const cfg = {
      channels: { shadowob: { token: 'legacy-token', serverUrl: 'http://localhost:3000' } },
    }
    const account = shadowPlugin.setup!.resolveAccount(cfg, null)
    expect(account.token).toBe('legacy-token')
  })

  it('should return disabled account for empty config via setup adapter', () => {
    const account = shadowPlugin.setup!.resolveAccount({}, null)
    expect(account.token).toBe('')
    expect(account.serverUrl).toBe('https://shadowob.com')
    expect(account.enabled).toBe(false)
  })

  it('should inspect unconfigured account via setup adapter', () => {
    const result = shadowPlugin.setup!.inspectAccount({}, null)
    expect(result.configured).toBe(false)
    expect(result.tokenStatus).toBe('missing')
  })

  it('should inspect configured account via setup adapter', () => {
    const cfg = {
      channels: { shadowob: { token: 'my-token', serverUrl: 'http://localhost:3000' } },
    }
    const result = shadowPlugin.setup!.inspectAccount(cfg, null)
    expect(result.configured).toBe(true)
    expect(result.tokenStatus).toBe('available')
    expect(result.enabled).toBe(true)
  })

  it('should have security.dm configuration', () => {
    expect(shadowPlugin.security).toBeDefined()
    expect(shadowPlugin.security!.dm).toBeDefined()
    expect(shadowPlugin.security!.dm.channelKey).toBe('shadowob')
    expect(shadowPlugin.security!.dm.defaultPolicy).toBe('allowlist')
  })

  it('should have config adapter with listAccountIds', () => {
    expect(shadowPlugin.config).toBeDefined()
    expect(typeof shadowPlugin.config!.listAccountIds).toBe('function')
    expect(typeof shadowPlugin.config!.resolveAccount).toBe('function')
    expect(typeof shadowPlugin.config!.defaultAccountId).toBe('function')
    expect(typeof shadowPlugin.config!.isConfigured).toBe('function')
    expect(typeof shadowPlugin.config!.isEnabled).toBe('function')
    expect(typeof shadowPlugin.config!.describeAccount).toBe('function')
  })

  it('should list account IDs via config adapter', () => {
    const cfg = {
      channels: {
        shadowob: {
          accounts: {
            prod: { token: 't1', serverUrl: 'http://x:3002' },
          },
        },
      },
    }
    const ids = shadowPlugin.config!.listAccountIds(cfg)
    expect(ids).toContain('prod')
  })

  it('should have actions adapter with handleAction', () => {
    expect(shadowPlugin.actions).toBeDefined()
    expect(typeof shadowPlugin.actions!.listActions).toBe('function')
    expect(typeof shadowPlugin.actions!.supportsAction).toBe('function')
    expect(typeof shadowPlugin.actions!.handleAction).toBe('function')
    const actions = shadowPlugin.actions!.listActions()
    expect(actions).toContain('send')
    expect(actions).toContain('sendAttachment')
    expect(actions).toContain('react')
    expect(actions).toContain('get-server')
    expect(actions).toContain('get-connection-status')
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

// ── Plugin entry point ─────────────────────────────────────────

describe('Plugin Entry Point', () => {
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
      shadowOutbound.attachedResults.sendText({
        cfg: {},
        to: 'shadowob:channel:ch-123',
        text: 'Hello',
      }),
    ).rejects.toThrow('not configured')
  })

  it('should throw when account not configured (sendMedia)', async () => {
    const { shadowOutbound } = await import('../src/outbound.js')
    await expect(
      shadowOutbound.base.sendMedia({
        cfg: {},
        to: 'shadowob:channel:ch-123',
        mediaUrl: 'http://example.com/img.png',
      }),
    ).rejects.toThrow('not configured')
  })

  it('should parse target with shadowob prefix', async () => {
    const { parseTarget } = await import('../src/outbound.js')
    expect(parseTarget('shadowob:channel:abc')).toEqual({ channelId: 'abc' })
    expect(parseTarget('shadowob:thread:xyz')).toEqual({ threadId: 'xyz' })
  })

  it('should parse target with legacy shadowob prefix', async () => {
    const { parseTarget } = await import('../src/outbound.js')
    expect(parseTarget('shadowob:channel:abc')).toEqual({ channelId: 'abc' })
    expect(parseTarget('shadow:channel:abc')).toEqual({ channelId: 'abc' })
  })

  it('should fallback to raw string as channel ID', async () => {
    const { parseTarget } = await import('../src/outbound.js')
    expect(parseTarget('some-uuid')).toEqual({ channelId: 'some-uuid' })
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
      accounts: {
        bot1: { token: 'token-1', serverUrl: 'http://localhost:3000' },
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
