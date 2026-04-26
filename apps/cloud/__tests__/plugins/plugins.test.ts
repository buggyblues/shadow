/**
 * Plugin system tests — registry, loader, helpers, config-merger.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { collectRuntimeEnvRequirements } from '../../src/application/runtime-env-requirements.js'
import {
  mergePluginFragments,
  resolveAgentPluginConfig,
  resolvePluginSecrets,
} from '../../src/plugins/config-merger.js'
import {
  defineChannelPlugin,
  defineProviderPlugin,
  defineSkillPlugin,
} from '../../src/plugins/helpers.js'
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

function makePlugin(manifest: PluginManifest): PluginDefinition {
  return defineSkillPlugin(manifest, { skills: { bundled: [manifest.id] } })
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
    agentConfig: {},
    pluginRegistry: createPluginRegistry(),
    cwd: process.cwd(),
    ...overrides,
  }
}

// ─── Registry ──────────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  beforeEach(() => resetPluginRegistry())

  it('should register and retrieve plugins', () => {
    const registry = createPluginRegistry()
    const plugin = makePlugin(makeManifest())
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
    registry.register(makePlugin(makeManifest({ id: 'p1', category: 'ai-provider' })))
    registry.register(makePlugin(makeManifest({ id: 'p2', category: 'devops' })))
    registry.register(makePlugin(makeManifest({ id: 'p3', category: 'ai-provider' })))

    expect(registry.getByCategory('ai-provider')).toHaveLength(2)
    expect(registry.getByCategory('devops')).toHaveLength(1)
    expect(registry.getByCategory('finance')).toHaveLength(0)
  })

  it('should filter by capability', () => {
    const registry = createPluginRegistry()
    registry.register(makePlugin(makeManifest({ id: 'p1', capabilities: ['channel', 'tool'] })))
    registry.register(makePlugin(makeManifest({ id: 'p2', capabilities: ['webhook'] })))

    expect(registry.getByCapability('channel')).toHaveLength(1)
    expect(registry.getByCapability('tool')).toHaveLength(1)
    expect(registry.getByCapability('webhook')).toHaveLength(1)
  })

  it('should search by name and description', () => {
    const registry = createPluginRegistry()
    registry.register(
      makePlugin(makeManifest({ id: 'slack', name: 'Slack', description: 'Messaging' })),
    )
    registry.register(
      makePlugin(makeManifest({ id: 'discord', name: 'Discord', description: 'Gaming chat' })),
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
    expect(registry.get('deepseek')).toBeDefined()
    expect(registry.get('stripe')).toBeDefined()
    expect(registry.get('notion')).toBeDefined()
    expect(registry.get('discord')).toBeDefined()
    expect(registry.get('anthropic')).toBeDefined()
  }, 30_000)

  it('should expose provider catalogs for selector plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    const catalogs = registry.getAll().flatMap((plugin) => plugin.providerCatalogs ?? [])
    expect(catalogs.map((catalog) => catalog.id)).toEqual(
      expect.arrayContaining(['anthropic', 'openai', 'gemini', 'deepseek', 'openrouter']),
    )
    expect(catalogs.find((catalog) => catalog.id === 'anthropic')?.envKeyAliases).toContain(
      'ANTHROPIC_AUTH_TOKEN',
    )
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
  }, 30_000)
})

// ─── defineSkillPlugin ─────────────────────────────────────────────────────

describe('defineSkillPlugin', () => {
  it('should create a valid plugin definition', () => {
    const plugin = makePlugin(makeManifest())
    expect(plugin.manifest.id).toBe('test-plugin')
    expect(plugin._hooks.buildConfig.length).toBeGreaterThan(0)
    expect(plugin._hooks.buildEnv.length).toBeGreaterThan(0)
    expect(plugin._hooks.validate.length).toBeGreaterThan(0)
  })

  it('should generate OpenClaw config with skills', () => {
    const plugin = makePlugin(makeManifest())
    const ctx = makeBuildContext()
    const fragment = plugin._hooks.buildConfig[0]!(ctx)

    expect(fragment?.skills).toBeDefined()
    const skills = fragment?.skills as Record<string, unknown>
    expect(skills.allowBundled).toEqual(['test-plugin'])
  })

  it('should build env vars from secrets', () => {
    const plugin = makePlugin(makeManifest())
    const ctx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-123', TEST_ORG: 'org-1' } })
    const envVars = plugin._hooks.buildEnv[0]!(ctx)

    expect(envVars?.TEST_API_KEY).toBe('sk-123')
  })

  it('should validate required secrets', () => {
    const plugin = makePlugin(makeManifest())

    const validCtx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-123' } })
    expect(plugin._hooks.validate[0]!(validCtx)?.valid).toBe(true)

    const invalidCtx = makeBuildContext({ secrets: {} })
    const result = plugin._hooks.validate[0]!(invalidCtx)!
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].path).toBe('secrets.TEST_API_KEY')
  })
})

// ─── defineChannelPlugin ───────────────────────────────────────────────────

describe('defineChannelPlugin', () => {
  it('should use custom channel builder for config', () => {
    const channelBuilder = (ctx: PluginBuildContext): PluginConfigFragment => ({
      channels: {
        'test-channel': { enabled: true, accounts: { [ctx.agent.id]: { token: 'tok' } } },
      },
      bindings: [{ agentId: ctx.agent.id, type: 'route', match: { channel: 'test-channel' } }],
    })

    const plugin = defineChannelPlugin(makeManifest({ capabilities: ['channel'] }), channelBuilder)
    const ctx = makeBuildContext()
    const fragment = plugin._hooks.buildConfig[0]!(ctx)

    expect(fragment?.channels).toBeDefined()
    expect(fragment?.bindings).toHaveLength(1)
  })

  it('should still provide env vars and validation', () => {
    const channelBuilder = () => ({})
    const plugin = defineChannelPlugin(makeManifest(), channelBuilder)
    const ctx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-x' } })

    expect(plugin._hooks.buildEnv[0]!(ctx)).toEqual({ TEST_API_KEY: 'sk-x' })
    expect(plugin._hooks.validate[0]!(ctx)?.valid).toBe(true)
  })
})

// ─── defineProviderPlugin ──────────────────────────────────────────────────

describe('defineProviderPlugin', () => {
  it('declares provider catalogs and secret fields through PluginAPI', () => {
    const plugin = defineProviderPlugin(makeManifest({ id: 'provider-x' }), {
      provider: {
        id: 'provider-x',
        api: 'openai',
        baseUrl: 'https://provider.example/v1',
        envKeyAliases: ['PROVIDER_X_TOKEN'],
        models: [{ id: 'model-a', tags: ['default'] }],
      },
    })

    expect(plugin.providerCatalogs?.[0]).toMatchObject({
      id: 'provider-x',
      api: 'openai-completions',
      envKey: 'TEST_API_KEY',
      envKeyAliases: ['PROVIDER_X_TOKEN'],
    })
    expect(plugin.secretFields?.map((field) => field.key)).toContain('TEST_API_KEY')
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

  it('should merge plugin load paths without overwriting earlier plugins', () => {
    const base: PluginConfigFragment = {
      plugins: { load: { paths: ['/app/extensions/a'] } },
    }
    const fragment: PluginConfigFragment = {
      plugins: { load: { paths: ['/app/extensions/b', '/app/extensions/a'] } },
    }
    const result = mergePluginFragments(base as any, fragment)

    expect(result.plugins?.load?.paths).toEqual(['/app/extensions/a', '/app/extensions/b'])
  })
})

describe('resolveAgentPluginConfig', () => {
  it('should return null for unconfigured plugins', () => {
    const config = { version: '1' } as unknown as PluginBuildContext['config']
    expect(resolveAgentPluginConfig('test-plugin', 'agent-1', config)).toBeNull()
  })

  it('should return null when plugin not configured', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'other-plugin', options: { x: 1 } }],
    } as unknown as PluginBuildContext['config']
    expect(resolveAgentPluginConfig('test-plugin', 'agent-1', config)).toBeNull()
  })

  it('should resolve from global plugin config', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin', options: { globalOpt: 'a' } }],
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toEqual({ globalOpt: 'a' })
  })

  it('should prefer agent-level config over global config', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin', options: { globalOpt: 'a', sharedOpt: 'global' } }],
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toBeDefined()
    expect(resolved).toEqual({ globalOpt: 'a', sharedOpt: 'global' })
  })

  it('should return empty config when plugin has no options', () => {
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
      use: [
        {
          plugin: 'test-plugin',
          options: { TEST_API_KEY: '${env:MY_KEY}' },
        },
      ],
    } as unknown as PluginBuildContext['config']

    const secrets = resolvePluginSecrets('test-plugin', config, { MY_KEY: 'resolved-value' })
    expect(secrets.TEST_API_KEY).toBe('resolved-value')
  })

  it('should pass through literal values', () => {
    const config = {
      version: '1',
      use: [
        {
          plugin: 'test-plugin',
          options: { TEST_API_KEY: 'literal-key' },
        },
      ],
    } as unknown as PluginBuildContext['config']

    const secrets = resolvePluginSecrets('test-plugin', config, {})
    expect(secrets.TEST_API_KEY).toBe('literal-key')
  })

  it('should return empty for missing plugin config', () => {
    const config = { version: '1' } as unknown as PluginBuildContext['config']
    expect(resolvePluginSecrets('test-plugin', config, {})).toEqual({})
  })
})

describe('collectRuntimeEnvRequirements', () => {
  beforeEach(() => resetPluginRegistry())

  it('collects model-provider env keys from provider plugin catalogs', async () => {
    const keys = await collectRuntimeEnvRequirements({
      version: '1',
      use: [{ plugin: 'model-provider' }],
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    })

    expect(keys).toEqual(
      expect.arrayContaining([
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'OPENAI_API_KEY',
        'DEEPSEEK_API_KEY',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'GOOGLE_AI_API_KEY',
        'XAI_API_KEY',
        'GROK_API_KEY',
        'OPENAI_COMPATIBLE_BASE_URL',
        'OPENAI_COMPATIBLE_API_KEY',
        'OPENAI_COMPATIBLE_MODEL_ID',
      ]),
    )
  })
})

describe('model-provider plugin', () => {
  it('builds OpenClaw model providers from provider catalogs', async () => {
    const registry = createPluginRegistry()
    const provider = defineProviderPlugin(makeManifest({ id: 'provider-x' }), {
      provider: {
        id: 'provider-x',
        api: 'openai',
        envKey: 'TEST_PROVIDER_API_KEY',
        baseUrl: 'https://provider.example/v1',
        priority: 1,
        models: [
          { id: 'model-fast', tags: ['default', 'flash'] },
          { id: 'model-reasoning', tags: ['reasoning'] },
        ],
      },
    })
    const modelProvider = (await import('../../src/plugins/model-provider/index.js')).default
    registry.register(provider)
    registry.register(modelProvider)

    const fragment = modelProvider._hooks.buildConfig[0]!(
      makeBuildContext({
        pluginRegistry: registry,
        secrets: { TEST_PROVIDER_API_KEY: 'sk-provider' },
        config: {
          namespace: 'test-ns',
          agents: [],
          use: [{ plugin: 'model-provider' }],
        } as unknown as PluginBuildContext['config'],
        agent: {
          id: 'agent-1',
          name: 'Test Agent',
          runtime: 'openclaw',
          use: [{ plugin: 'model-provider' }],
        } as PluginBuildContext['agent'],
      }),
    )

    expect(fragment?.models).toMatchObject({
      mode: 'merge',
      providers: {
        'provider-x': {
          api: 'openai-completions',
          apiKey: '${env:TEST_PROVIDER_API_KEY}',
          baseUrl: 'https://provider.example/v1',
          models: [
            { id: 'model-fast', name: 'model-fast' },
            { id: 'model-reasoning', name: 'model-reasoning' },
          ],
        },
      },
    })
    expect(fragment?.agents?.defaults).toMatchObject({
      model: { primary: 'provider-x/model-fast' },
    })
  })

  it('selects saved provider profile models by tag', async () => {
    const registry = createPluginRegistry()
    const provider = defineProviderPlugin(makeManifest({ id: 'provider-profile-x' }), {
      provider: {
        id: 'provider-profile-x',
        api: 'openai',
        envKey: 'PROFILE_PROVIDER_API_KEY',
        baseUrl: 'https://provider.example/v1',
        priority: 1,
        models: [{ id: 'catalog-default', tags: ['default'] }],
      },
    })
    const modelProvider = (await import('../../src/plugins/model-provider/index.js')).default
    registry.register(provider)
    registry.register(modelProvider)

    const fragment = modelProvider._hooks.buildConfig[0]!(
      makeBuildContext({
        pluginRegistry: registry,
        secrets: {
          PROFILE_PROVIDER_API_KEY: 'sk-provider',
          SHADOW_PROVIDER_PROFILE_MODELS_JSON: JSON.stringify([
            {
              providerId: 'provider-profile-x',
              profileId: 'profile-a',
              models: [{ id: 'profile-reasoner', tags: ['reasoning'], contextWindow: 128000 }],
            },
          ]),
        },
        config: {
          namespace: 'test-ns',
          agents: [],
          use: [{ plugin: 'model-provider', options: { tag: 'reasoning' } }],
        } as unknown as PluginBuildContext['config'],
        agent: {
          id: 'agent-1',
          name: 'Test Agent',
          runtime: 'openclaw',
          use: [{ plugin: 'model-provider', options: { tag: 'reasoning' } }],
        } as PluginBuildContext['agent'],
      }),
    )

    const providerModels = fragment?.models?.providers?.['provider-profile-x']?.models
    expect(providerModels?.[0]).toMatchObject({ id: 'profile-reasoner', contextWindow: 128000 })
    expect(providerModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'profile-reasoner' }),
        expect.objectContaining({ id: 'catalog-default' }),
      ]),
    )
    expect(fragment?.agents?.defaults).toMatchObject({
      model: { primary: 'provider-profile-x/profile-reasoner' },
    })
  })
})

// ─── Channel plugin implementations ───────────────────────────────────────

describe('Channel plugins', () => {
  it('discord plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/discord/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('discord')
    expect(plugin.manifest.capabilities).toContain('channel')

    const ctx = makeBuildContext({
      secrets: { DISCORD_BOT_TOKEN: 'tok' },
      agentConfig: { channels: ['123'], guildId: 'guild-1' },
    })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.channels).toHaveProperty('discord')
    expect(fragment?.bindings).toHaveLength(1)
  })

  it('telegram plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/telegram/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({ secrets: { TELEGRAM_BOT_TOKEN: 'tok' }, agentConfig: {} })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.channels).toHaveProperty('telegram')
  })

  it('slack plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/slack/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({
      secrets: { SLACK_BOT_TOKEN: 'tok' },
      agentConfig: { channels: ['general'] },
    })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.channels).toHaveProperty('slack')
  })

  it('line plugin should produce channel config', async () => {
    const mod = await import('../../src/plugins/line/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({
      secrets: { LINE_CHANNEL_ACCESS_TOKEN: 'tok', LINE_CHANNEL_SECRET: 'sec' },
      agentConfig: {},
    })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.channels).toHaveProperty('line')
  })
})

// ─── Tool plugin implementations ──────────────────────────────────────────

describe('Tool plugins', () => {
  it('github plugin should produce skill and tool config', async () => {
    const mod = await import('../../src/plugins/github/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('github')

    const ctx = makeBuildContext({ secrets: { GITHUB_TOKEN: 'ghp_xxx' }, agentConfig: {} })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.skills).toBeDefined()
    expect(fragment?.tools).toEqual({ allow: ['gh'] })
  })

  it('stripe plugin should produce plugin entry', async () => {
    const mod = await import('../../src/plugins/stripe/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('stripe')

    const ctx = makeBuildContext({ secrets: { STRIPE_SECRET_KEY: 'sk_test' }, agentConfig: {} })
    const result = plugin._hooks.validate[0]!(ctx)
    expect(result?.valid).toBe(true)
  })

  it('openai plugin should validate missing API key', async () => {
    const mod = await import('../../src/plugins/openai/index.js')
    const plugin = mod.default as PluginDefinition
    const ctx = makeBuildContext({ secrets: {}, agentConfig: {} })
    const result = plugin._hooks.validate[0]!(ctx)!
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('API Key')
  })
})
