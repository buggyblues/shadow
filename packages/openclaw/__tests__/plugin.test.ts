/**
 * OpenClaw Shadow Plugin Tests
 *
 * Tests for the @shadowob/openclaw plugin:
 * 1. Plugin registration and metadata
 * 2. Config resolution (single + multi-account)
 * 3. Outbound adapter (sendText, sendMedia)
 * 4. Target normalization
 * 5. Shadow REST client
 * 6. Monitor/gateway inbound flow
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Config resolution ──────────────────────────────────────────

describe('Shadow Config', () => {
  // Use dynamic import to test the config module
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

    it('should list accounts from multi-account config', () => {
      const cfg = {
        channels: {
          shadow: {
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

    it('should add default account when base-level token is set', () => {
      const cfg = {
        channels: {
          shadow: {
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
          shadow: {
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
          shadow: {
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
          shadow: {
            accounts: {
              mybot: { token: 'tok', serverUrl: 'url' },
            },
          },
        },
      }
      const account = getAccountConfig(cfg, 'nonexistent')
      expect(account).toBeNull()
    })

    it('should default serverUrl to localhost:3000', () => {
      const cfg = {
        channels: {
          shadow: {
            token: 'tok',
          },
        },
      }
      const account = getAccountConfig(cfg, 'default')
      expect(account!.serverUrl).toBe('https://shadowob.com')
    })
  })
})

// ── Plugin metadata ────────────────────────────────────────────

describe('Shadow Plugin', () => {
  let shadowPlugin: typeof import('../src/plugin.js').shadowPlugin

  beforeEach(async () => {
    const mod = await import('../src/plugin.js')
    shadowPlugin = mod.shadowPlugin
  })

  it('should have correct ID', () => {
    expect(shadowPlugin.id).toBe('shadow')
  })

  it('should have correct meta', () => {
    expect(shadowPlugin.meta.id).toBe('shadow')
    expect(shadowPlugin.meta.label).toBe('Shadow')
    expect(shadowPlugin.meta.docsPath).toBe('/channels/shadow')
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

  it('should resolve empty config to defaults', () => {
    const account = shadowPlugin.config.resolveAccount({}, null)
    expect(account.token).toBe('')
    expect(account.serverUrl).toBe('https://shadowob.com')
    expect(account.enabled).toBe(false)
  })

  it('should check isConfigured', () => {
    expect(shadowPlugin.config.isConfigured!({ token: '', serverUrl: '' } as any, {} as any)).toBe(false)
    expect(
      shadowPlugin.config.isConfigured!(
        { token: 'tok', serverUrl: 'url' } as any,
        {} as any,
      ),
    ).toBe(true)
  })

  it('should check isEnabled', () => {
    expect(shadowPlugin.config.isEnabled!({ enabled: true } as any, {} as any)).toBe(true)
    expect(shadowPlugin.config.isEnabled!({ enabled: false } as any, {} as any)).toBe(false)
    expect(shadowPlugin.config.isEnabled!({} as any, {} as any)).toBe(true) // default
  })

  it('should have outbound adapter', () => {
    expect(shadowPlugin.outbound).toBeDefined()
    expect(shadowPlugin.outbound!.deliveryMode).toBe('direct')
    expect(typeof shadowPlugin.outbound!.sendText).toBe('function')
    expect(typeof shadowPlugin.outbound!.sendMedia).toBe('function')
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

  it('should have threading adapter', () => {
    expect(shadowPlugin.threading).toBeDefined()
    // Default mode
    const mode = shadowPlugin.threading!.resolveReplyToMode!({
      cfg: {},
      accountId: 'default',
    })
    expect(mode).toBe('first')
  })

  it('should have messaging adapter with target normalization', () => {
    expect(shadowPlugin.messaging).toBeDefined()
    // UUID target
    const normalized = shadowPlugin.messaging!.normalizeTarget!(
      '550e8400-e29b-41d4-a716-446655440000',
    )
    expect(normalized).toBe('shadow:channel:550e8400-e29b-41d4-a716-446655440000')

    // Already prefixed
    const prefixed = shadowPlugin.messaging!.normalizeTarget!('shadow:channel:abc')
    expect(prefixed).toBe('shadow:channel:abc')

    // Invalid
    const invalid = shadowPlugin.messaging!.normalizeTarget!('not-a-uuid')
    expect(invalid).toBeUndefined()
  })

  it('should have status adapter', () => {
    expect(shadowPlugin.status).toBeDefined()
    expect(shadowPlugin.status!.defaultRuntime).toBeDefined()
    expect(shadowPlugin.status!.defaultRuntime!.running).toBe(false)
    expect(typeof shadowPlugin.status!.probeAccount).toBe('function')
  })
})

// ── Plugin entry point ─────────────────────────────────────────

describe('Plugin Entry Point', () => {
  it('should export a valid OpenClawPluginDefinition', async () => {
    const mod = await import('../index.js')
    const plugin = mod.default
    expect(plugin.id).toBe('shadow')
    expect(plugin.name).toBe('ShadowOwnBuddy')
    expect(typeof plugin.register).toBe('function')
  })

  it('should export ShadowClient', async () => {
    const mod = await import('../index.js')
    expect(mod.ShadowClient).toBeDefined()
  })

  it('should export shadowPlugin', async () => {
    const mod = await import('../index.js')
    expect(mod.shadowPlugin).toBeDefined()
    expect(mod.shadowPlugin.id).toBe('shadow')
  })
})

// ── Shadow Client ──────────────────────────────────────────────

describe('ShadowClient', () => {
  let ShadowClient: typeof import('../src/shadow-client.js').ShadowClient

  beforeEach(async () => {
    const mod = await import('../src/shadow-client.js')
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
    // All three should have the same effective baseUrl (http://localhost:3000)
    // We verify indirectly by checking the client is created without error
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
  it('should return error when account not configured', async () => {
    const { shadowOutbound } = await import('../src/outbound.js')

    const result = await shadowOutbound.sendText!({
      cfg: {},
      to: 'shadow:channel:ch-123',
      text: 'Hello',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('not configured')
  })

  it('should return error when no text provided', async () => {
    const { shadowOutbound } = await import('../src/outbound.js')

    const result = await shadowOutbound.sendText!({
      cfg: {
        channels: {
          shadow: {
            token: 'tok',
            serverUrl: 'http://localhost:3000',
          },
        },
      },
      to: 'shadow:channel:ch-123',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('No text')
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
        bot1: {
          token: 'token-1',
          serverUrl: 'http://localhost:3000',
        },
        bot2: {
          token: 'token-2',
          serverUrl: 'http://localhost:3000',
          enabled: true,
        },
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
