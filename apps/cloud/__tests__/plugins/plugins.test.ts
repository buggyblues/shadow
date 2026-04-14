/**
 * Plugin system tests — registry, loader, helpers, config-merger.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  mergePluginFragments,
  resolveAgentPluginConfig,
  resolvePluginSecrets,
} from '../../src/plugins/config-merger.js'
import { createChannelPlugin, createToolPlugin } from '../../src/plugins/helpers.js'
import { loadAllPlugins, registerPlugin, validateManifest } from '../../src/plugins/loader.js'
import {
  createPluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
} from '../../src/plugins/registry.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../../src/plugins/types.js'

// ─── Test fixtures ─────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    description: 'A test plugin',
    version: '1.0.0',
    category: 'other',
    icon: 'test',
    auth: {
      type: 'api-key',
      fields: [
        { key: 'TEST_API_KEY', label: 'API Key', required: true, sensitive: true },
        { key: 'TEST_ORG', label: 'Org ID', required: false, sensitive: false },
      ],
    },
    capabilities: ['tool'],
    tags: ['test'],
    ...overrides,
  }
}

function makeBuildContext(overrides: Partial<PluginBuildContext> = {}): PluginBuildContext {
  return {
    agent: {
      id: 'agent-1',
      name: 'Test Agent',
      runtime: 'openclaw',
    } as PluginBuildContext['agent'],
    config: {
      namespace: 'test-ns',
      agents: [],
      use: [],
    } as unknown as PluginBuildContext['config'],
    secrets: { TEST_API_KEY: 'sk-test-123' },
    namespace: 'test-ns',
    pluginRegistry: createPluginRegistry(),
    ...overrides,
  }
}

// ─── Registry ──────────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  beforeEach(() => resetPluginRegistry())

  it('should register and retrieve plugins', () => {
    const registry = createPluginRegistry()
    const plugin = createToolPlugin(makeManifest())
    registry.register(plugin)

    expect(registry.size).toBe(1)
    expect(registry.get('test-plugin')).toBe(plugin)
  })

  it('should return undefined for unknown plugins', () => {
    const registry = createPluginRegistry()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('should filter by category', () => {
    const registry = createPluginRegistry()
    registry.register(createToolPlugin(makeManifest({ id: 'p1', category: 'ai-provider' })))
    registry.register(createToolPlugin(makeManifest({ id: 'p2', category: 'devops' })))
    registry.register(createToolPlugin(makeManifest({ id: 'p3', category: 'ai-provider' })))

    expect(registry.getByCategory('ai-provider')).toHaveLength(2)
    expect(registry.getByCategory('devops')).toHaveLength(1)
    expect(registry.getByCategory('finance')).toHaveLength(0)
  })

  it('should filter by capability', () => {
    const registry = createPluginRegistry()
    registry.register(
      createToolPlugin(makeManifest({ id: 'p1', capabilities: ['channel', 'tool'] })),
    )
    registry.register(createToolPlugin(makeManifest({ id: 'p2', capabilities: ['webhook'] })))

    expect(registry.getByCapability('channel')).toHaveLength(1)
    expect(registry.getByCapability('tool')).toHaveLength(1)
    expect(registry.getByCapability('webhook')).toHaveLength(1)
  })

  it('should search by name and description', () => {
    const registry = createPluginRegistry()
    registry.register(
      createToolPlugin(makeManifest({ id: 'slack', name: 'Slack', description: 'Messaging' })),
    )
    registry.register(
      createToolPlugin(
        makeManifest({ id: 'discord', name: 'Discord', description: 'Gaming chat' }),
      ),
    )

    expect(registry.search('slack')).toHaveLength(1)
    expect(registry.search('chat')).toHaveLength(1)
    expect(registry.search('xyz')).toHaveLength(0)
  })

  it('should provide singleton via getPluginRegistry', () => {
    const r1 = getPluginRegistry()
    const r2 = getPluginRegistry()
    expect(r1).toBe(r2)
  })
})

// ─── Manifest Validation ───────────────────────────────────────────────────

describe('validateManifest', () => {
  it('should accept valid manifest', () => {
    expect(validateManifest(makeManifest())).toBe(true)
  })

  it('should reject null', () => {
    expect(validateManifest(null)).toBe(false)
  })

  it('should reject missing id', () => {
    const m = { ...makeManifest(), id: undefined }
    expect(validateManifest(m)).toBe(false)
  })

  it('should reject non-array capabilities', () => {
    const m = { ...makeManifest(), capabilities: 'tool' }
    expect(validateManifest(m)).toBe(false)
  })

  it('should reject missing auth', () => {
    const m = { ...makeManifest(), auth: undefined }
    expect(validateManifest(m)).toBe(false)
  })
})

// ─── Loader ────────────────────────────────────────────────────────────────

describe('loadAllPlugins', () => {
  beforeEach(() => resetPluginRegistry())

  it('should load all built-in plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    // Should have loaded 67 plugins (75 minus 8 removed placeholders)
    expect(registry.size).toBeGreaterThanOrEqual(67)

    // Spot-check some specific plugins
    expect(registry.get('shadowob')).toBeDefined()
    expect(registry.get('slack')).toBeDefined()
    expect(registry.get('github')).toBeDefined()
    expect(registry.get('openai')).toBeDefined()
    expect(registry.get('stripe')).toBeDefined()
    expect(registry.get('notion')).toBeDefined()
    expect(registry.get('discord')).toBeDefined()
    expect(registry.get('anthropic')).toBeDefined()
  })

  it('should have valid manifests for all plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    for (const plugin of registry.getAll()) {
      expect(plugin.manifest.id).toBeTruthy()
      expect(plugin.manifest.name).toBeTruthy()
      expect(plugin.manifest.version).toBe('1.0.0')
      expect(plugin.manifest.capabilities.length).toBeGreaterThan(0)
      expect(plugin.manifest.tags.length).toBeGreaterThan(0)
    }
  })
})

// ─── createToolPlugin ──────────────────────────────────────────────────────

describe('createToolPlugin', () => {
  it('should create a valid plugin definition', () => {
    const plugin = createToolPlugin(makeManifest())
    expect(plugin.manifest.id).toBe('test-plugin')
    expect(plugin.buildOpenClawConfig).toBeDefined()
    expect(plugin.buildEnvVars).toBeDefined()
    expect(plugin.validate).toBeDefined()
  })

  it('should generate OpenClaw config with plugin entry', () => {
    const plugin = createToolPlugin(makeManifest())
    const ctx = makeBuildContext()
    const fragment = plugin.buildOpenClawConfig!({ customOpt: true }, ctx)

    expect(fragment.plugins).toBeDefined()
    expect((fragment.plugins as Record<string, unknown>).entries).toBeDefined()
    const entries = (fragment.plugins as Record<string, Record<string, unknown>>).entries
    expect(entries['test-plugin']).toBeDefined()
    expect(entries['test-plugin'].enabled).toBe(true)
  })

  it('should inject API key reference from manifest', () => {
    const plugin = createToolPlugin(makeManifest())
    const ctx = makeBuildContext()
    const fragment = plugin.buildOpenClawConfig!({}, ctx)

    const entries = (fragment.plugins as Record<string, Record<string, Record<string, unknown>>>)
      .entries
    expect(entries['test-plugin'].config.apiKey).toBe('${env:TEST_API_KEY}')
  })

  it('should build env vars from secrets', () => {
    const plugin = createToolPlugin(makeManifest())
    const ctx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-123', TEST_ORG: 'org-1' } })
    const envVars = plugin.buildEnvVars!({}, ctx)

    expect(envVars.TEST_API_KEY).toBe('sk-123')
    expect(envVars.TEST_ORG).toBe('org-1')
  })

  it('should validate required secrets', () => {
    const plugin = createToolPlugin(makeManifest())

    const validCtx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-123' } })
    expect(plugin.validate!({}, validCtx).valid).toBe(true)

    const invalidCtx = makeBuildContext({ secrets: {} })
    const result = plugin.validate!({}, invalidCtx)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].path).toBe('secrets.TEST_API_KEY')
  })
})

// ─── createChannelPlugin ───────────────────────────────────────────────────

describe('createChannelPlugin', () => {
  it('should use custom channel builder for config', () => {
    const channelBuilder = (
      _config: Record<string, unknown>,
      ctx: PluginBuildContext,
    ): PluginConfigFragment => ({
      channels: {
        'test-channel': { enabled: true, accounts: { [ctx.agent.id]: { token: 'tok' } } },
      },
      bindings: [{ agentId: ctx.agent.id, type: 'route', match: { channel: 'test-channel' } }],
    })

    const plugin = createChannelPlugin(makeManifest({ capabilities: ['channel'] }), channelBuilder)
    const ctx = makeBuildContext()
    const fragment = plugin.buildOpenClawConfig!({}, ctx)

    expect(fragment.channels).toBeDefined()
    expect(fragment.bindings).toHaveLength(1)
  })

  it('should still use tool plugin for env vars and validation', () => {
    const channelBuilder = () => ({})
    const plugin = createChannelPlugin(makeManifest(), channelBuilder)
    const ctx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-x' } })

    expect(plugin.buildEnvVars!({}, ctx)).toEqual({ TEST_API_KEY: 'sk-x' })
    expect(plugin.validate!({}, ctx).valid).toBe(true)
  })
})

// ─── Config Merger ─────────────────────────────────────────────────────────

describe('mergePluginFragments', () => {
  it('should deep merge channels', () => {
    const base: PluginConfigFragment = {
      channels: { slack: { accounts: { a1: { token: 'tok1' } } } },
    }
    const fragment: PluginConfigFragment = {
      channels: { discord: { accounts: { a2: { token: 'tok2' } } } },
    }
    const result = mergePluginFragments(base as any, fragment)

    expect(result.channels).toHaveProperty('slack')
    expect(result.channels).toHaveProperty('discord')
  })

  it('should append bindings arrays', () => {
    const base: PluginConfigFragment = {
      bindings: [{ agentId: 'a1', type: 'route' }],
    }
    const fragment: PluginConfigFragment = {
      bindings: [{ agentId: 'a2', type: 'route' }],
    }
    const result = mergePluginFragments(base as any, fragment)

    expect(result.bindings).toHaveLength(2)
  })

  it('should deep merge plugins section', () => {
    const base: PluginConfigFragment = {
      plugins: { entries: { 'plugin-1': { enabled: true } } },
    }
    const fragment: PluginConfigFragment = {
      plugins: { entries: { 'plugin-2': { enabled: true } } },
    }
    const result = mergePluginFragments(base as any, fragment)

    const entries = (result.plugins as Record<string, Record<string, unknown>>).entries
    expect(entries['plugin-1']).toBeDefined()
    expect(entries['plugin-2']).toBeDefined()
  })
})

describe('resolveAgentPluginConfig', () => {
  it('should return null for unconfigured plugins', () => {
    const config = { version: '1' } as unknown as PluginBuildContext['config']
    expect(resolveAgentPluginConfig('test-plugin', 'agent-1', config)).toBeNull()
  })

  it('should return null when plugin not in any use array', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'other-plugin', options: { x: 1 } }],
    } as unknown as PluginBuildContext['config']
    expect(resolveAgentPluginConfig('test-plugin', 'agent-1', config)).toBeNull()
  })

  it('should resolve from global use array', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin', options: { globalOpt: 'a' } }],
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toEqual({ globalOpt: 'a' })
  })

  it('should prefer agent-level use over global use', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin', options: { globalOpt: 'a', sharedOpt: 'global' } }],
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            use: [{ plugin: 'test-plugin', options: { agentOpt: 'b', sharedOpt: 'agent' } }],
          },
        ],
      },
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toBeDefined()
    expect(resolved).toEqual({ agentOpt: 'b', sharedOpt: 'agent' })
  })

  it('should return empty options when plugin entry has no options', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin' }],
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toEqual({})
  })
})

describe('resolvePluginSecrets', () => {
  it('should resolve ${env:VAR} from process env', () => {
    const config = {
      version: '1',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      use: [{ plugin: 'test-plugin', options: { TEST_API_KEY: '${env:MY_KEY}' } }],
    } as unknown as PluginBuildContext['config']

    const secrets = resolvePluginSecrets('test-plugin', config, { MY_KEY: 'resolved-value' })
    expect(secrets.TEST_API_KEY).toBe('resolved-value')
  })

  it('should pass through literal values', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin', options: { TEST_API_KEY: 'literal-key' } }],
    } as unknown as PluginBuildContext['config']

    const secrets = resolvePluginSecrets('test-plugin', config, {})
    expect(secrets.TEST_API_KEY).toBe('literal-key')
  })

  it('should return empty for missing plugin config', () => {
    const config = { version: '1' } as unknown as PluginBuildContext['config']
    expect(resolvePluginSecrets('test-plugin', config, {})).toEqual({})
  })
})

// ─── Channel plugin implementations ───────────────────────────────────────

describe('Channel plugins', () => {
  it('discord plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/discord/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('discord')
    expect(plugin.manifest.capabilities).toContain('channel')

    const ctx = makeBuildContext({ secrets: { DISCORD_BOT_TOKEN: 'tok' } })
    const fragment = plugin.buildOpenClawConfig!({ channels: ['123'], guildId: 'guild-1' }, ctx)
    expect(fragment.channels).toHaveProperty('discord')
    expect(fragment.bindings).toHaveLength(1)
  })

  it('telegram plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/telegram/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({ secrets: { TELEGRAM_BOT_TOKEN: 'tok' } })
    const fragment = plugin.buildOpenClawConfig!({}, ctx)
    expect(fragment.channels).toHaveProperty('telegram')
  })

  it('slack plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/slack/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({ secrets: { SLACK_BOT_TOKEN: 'tok' } })
    const fragment = plugin.buildOpenClawConfig!({ channels: ['general'] }, ctx)
    expect(fragment.channels).toHaveProperty('slack')
  })

  it('line plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/line/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({
      secrets: { LINE_CHANNEL_ACCESS_TOKEN: 'tok', LINE_CHANNEL_SECRET: 'sec' },
    })
    const fragment = plugin.buildOpenClawConfig!({}, ctx)
    expect(fragment.channels).toHaveProperty('line')
  })
})

// ─── Tool plugin implementations ──────────────────────────────────────────

describe('Tool plugins', () => {
  it('github plugin should produce plugin entry', async () => {
    const mod = await import('../../src/plugins/github/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('github')

    const ctx = makeBuildContext({ secrets: { GITHUB_TOKEN: 'ghp_xxx' } })
    const fragment = plugin.buildOpenClawConfig!({}, ctx)
    expect(fragment.plugins).toBeDefined()
  })

  it('stripe plugin should produce plugin entry', async () => {
    const mod = await import('../../src/plugins/stripe/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('stripe')

    const ctx = makeBuildContext({ secrets: { STRIPE_SECRET_KEY: 'sk_test' } })
    const result = plugin.validate!({}, ctx)
    expect(result.valid).toBe(true)
  })

  it('openai plugin should validate missing API key', async () => {
    const mod = await import('../../src/plugins/openai/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({ secrets: {} })
    const result = plugin.validate!({}, ctx)
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('API Key')
  })
})
