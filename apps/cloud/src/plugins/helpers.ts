/**
 * Plugin factory helpers — create plugins with minimal boilerplate.
 *
 * Core primitive:
 *   definePlugin(manifest, setup)   — registers hooks via setup(api)
 *
 * Convenience factories for common patterns:
 *   defineSkillPlugin    — skills + CLI + MCP config, auto env + validation
 *   defineChannelPlugin  — channel config builder, auto env + validation
 *   defineProviderPlugin — AI model provider config, auto env + validation
 */

import { validateManifest } from './loader.js'
import type {
  PluginAPI,
  PluginBuildContext,
  PluginCLITool,
  PluginConfigFragment,
  PluginDefinition,
  PluginHooks,
  PluginManifest,
  PluginMCPServer,
  PluginSecretField,
  PluginSkillsConfig,
  PluginValidationResult,
  ProviderCatalog,
  ProviderModelEntry,
} from './types.js'

export function loadManifest(raw: Record<string, unknown>): PluginManifest {
  if (!validateManifest(raw)) {
    const id = typeof raw.id === 'string' ? raw.id : 'unknown'
    throw new Error(`Invalid plugin manifest for "${id}": missing required fields`)
  }
  return raw as unknown as PluginManifest
}

function makeHooks(): PluginHooks {
  return {
    resolveAgent: [],
    buildConfig: [],
    buildPrompt: [],
    buildEnv: [],
    buildResources: [],
    validate: [],
    provision: [],
    healthCheck: [],
  }
}

function makeAPI(
  hooks: PluginHooks,
  collected: {
    skills?: PluginSkillsConfig
    cli?: PluginCLITool[]
    mcp?: PluginMCPServer[]
    providerCatalogs?: ProviderCatalog[]
    secretFields?: PluginSecretField[]
  },
): PluginAPI {
  return {
    addSkills: (s) => {
      collected.skills = s
    },
    addCLI: (tools) => {
      collected.cli = [...(collected.cli ?? []), ...tools]
    },
    addMCP: (server) => {
      collected.mcp = [...(collected.mcp ?? []), server]
    },
    addProviderCatalog: (catalog) => {
      collected.providerCatalogs = [...(collected.providerCatalogs ?? []), catalog]
    },
    addSecretFields: (fields) => {
      collected.secretFields = [...(collected.secretFields ?? []), ...fields]
    },
    onResolveAgent: (fn) => hooks.resolveAgent.push(fn),
    onBuildConfig: (fn) => hooks.buildConfig.push(fn),
    onBuildPrompt: (fn) => hooks.buildPrompt.push(fn),
    onBuildEnv: (fn) => hooks.buildEnv.push(fn),
    onBuildResources: (fn) => hooks.buildResources.push(fn),
    onValidate: (fn) => hooks.validate.push(fn),
    onProvision: (fn) => hooks.provision.push(fn),
    onHealthCheck: (fn) => hooks.healthCheck.push(fn),
  }
}

// ─── Core primitive ──────────────────────────────────────────────────────────

/**
 * Define a plugin by registering hooks via a setup(api) function.
 *
 * This is the lowest-level primitive. Use factory helpers for common patterns.
 */
export function definePlugin(
  manifest: PluginManifest,
  setup: (api: PluginAPI) => void,
): PluginDefinition {
  const hooks = makeHooks()
  const collected: {
    skills?: PluginSkillsConfig
    cli?: PluginCLITool[]
    mcp?: PluginMCPServer[]
    providerCatalogs?: ProviderCatalog[]
    secretFields?: PluginSecretField[]
  } = {}
  const api = makeAPI(hooks, collected)
  setup(api)
  return {
    manifest,
    skills: collected.skills,
    cli: collected.cli,
    mcp: collected.mcp,
    providerCatalogs: collected.providerCatalogs,
    secretFields: collected.secretFields,
    _hooks: hooks,
    _buildConfig: hooks.buildConfig,
    _buildEnv: hooks.buildEnv,
    _validate: hooks.validate,
  }
}

// ─── Shared defaults ─────────────────────────────────────────────────────────

function defaultEnvVars(
  manifest: PluginManifest,
  context: PluginBuildContext,
): Record<string, string> {
  const envVars: Record<string, string> = {}
  for (const field of manifest.auth.fields) {
    const value = context.secrets[field.key]
    if (value) envVars[field.key] = value
  }
  return envVars
}

function defaultValidation(
  manifest: PluginManifest,
  context: PluginBuildContext,
): PluginValidationResult {
  const errors = []
  for (const field of manifest.auth.fields) {
    if (field.required && !context.secrets[field.key]) {
      errors.push({
        path: `secrets.${field.key}`,
        message: `${field.label} is required`,
        severity: 'error' as const,
      })
    }
  }
  return { valid: errors.filter((e) => e.severity === 'error').length === 0, errors }
}

// ─── Factory helpers ─────────────────────────────────────────────────────────

/**
 * Create a skill-based plugin (the most common pattern).
 *
 * @example
 * defineSkillPlugin(manifest, {
 *   skills: { bundled: ['github'], entries: [...] },
 *   cli: [{ name: 'gh', command: 'gh', description: 'GitHub CLI' }],
 *   mcp: { transport: 'stdio', command: 'npx', args: [...] },
 * })
 */
export function defineSkillPlugin(
  manifest: PluginManifest,
  options: {
    skills?: PluginSkillsConfig
    cli?: PluginCLITool[]
    mcp?: PluginMCPServer | PluginMCPServer[]
  },
  extraSetup?: (api: PluginAPI) => void,
): PluginDefinition {
  return definePlugin(manifest, (api) => {
    if (options.skills) api.addSkills(options.skills)
    if (options.cli?.length) api.addCLI(options.cli)
    if (options.mcp) {
      const mcps = Array.isArray(options.mcp) ? options.mcp : [options.mcp]
      for (const s of mcps) api.addMCP(s)
    }

    api.onBuildConfig((_ctx): PluginConfigFragment => {
      const fragment: PluginConfigFragment = {}

      if (options.skills) {
        const sc: Record<string, unknown> = {}
        if (options.skills.bundled?.length) sc.allowBundled = options.skills.bundled
        if (options.skills.entries?.length) {
          const entries: Record<string, unknown> = {}
          for (const skill of options.skills.entries) {
            entries[skill.id] = {
              enabled: true,
              ...(skill.apiKey ? { apiKey: skill.apiKey } : {}),
              ...(skill.env ? { env: skill.env } : {}),
            }
          }
          sc.entries = entries
        }
        // Note: skills.install in the plugin definition is for internal tracking only.
        // OpenClaw's skills.install only accepts {preferBrew, nodeManager} — not npmPackages.
        // MCP package installation is handled automatically by the MCP plugin mechanism.
        fragment.skills = sc
      }

      if (options.cli?.length) {
        fragment.tools = { allow: options.cli.map((t) => t.name) }
      }

      // Note: MCP server config (options.mcp) is NOT written to plugins.entries.
      // plugins.entries is only for pre-installed OpenClaw extension plugins (e.g. voice-call,
      // firecrawl, memory-core). External MCP servers are not configurable via this path.
      // GitHub integration uses skills.allowBundled["github"] (bundled skill), which is sufficient.

      return fragment
    })

    api.onBuildEnv((ctx) => defaultEnvVars(manifest, ctx))
    api.onValidate((ctx) => defaultValidation(manifest, ctx))
    extraSetup?.(api)
  })
}

/**
 * Create a channel plugin for communication integrations.
 *
 * @example
 * defineChannelPlugin(manifest, buildSlackConfig)
 */
export function defineChannelPlugin(
  manifest: PluginManifest,
  channelBuilder: (ctx: PluginBuildContext) => PluginConfigFragment,
  extraSetup?: (api: PluginAPI) => void,
): PluginDefinition {
  return definePlugin(manifest, (api) => {
    api.onBuildConfig(channelBuilder)
    api.onBuildEnv((ctx) => defaultEnvVars(manifest, ctx))
    api.onValidate((ctx) => defaultValidation(manifest, ctx))
    extraSetup?.(api)
  })
}

/**
 * Create an AI model provider plugin.
 *
 * @example
 * defineProviderPlugin(manifest, { provider: { id: 'openai', api: 'openai' } })
 */
export function defineProviderPlugin(
  manifest: PluginManifest,
  options: {
    provider: {
      id: string
      api: string
      baseUrl?: string
      envKey?: string
      envKeyAliases?: string[]
      baseUrlEnvKey?: string
      modelEnvKey?: string
      priority?: number
      models?: ProviderModelEntry[]
    }
  },
  extraSetup?: (api: PluginAPI) => void,
): PluginDefinition {
  return definePlugin(manifest, (api) => {
    const apiKeyField =
      manifest.auth.fields.find((f) => f.required && f.sensitive) ??
      manifest.auth.fields.find((f) => f.sensitive)
    const envKey = options.provider.envKey ?? apiKeyField?.key
    if (envKey) {
      api.addProviderCatalog({
        id: options.provider.id,
        api: mapProviderApi(options.provider.api),
        baseUrl: options.provider.baseUrl,
        envKey,
        envKeyAliases: options.provider.envKeyAliases,
        baseUrlEnvKey: options.provider.baseUrlEnvKey,
        modelEnvKey: options.provider.modelEnvKey,
        priority: options.provider.priority,
        models: options.provider.models ?? [],
      })
    }
    api.addSecretFields(
      manifest.auth.fields.map((field) => ({
        key: field.key,
        label: field.label,
        description: field.description,
        required: field.required,
        sensitive: field.sensitive,
      })),
    )

    api.onBuildConfig((ctx): PluginConfigFragment => {
      const { agentConfig } = ctx
      const resolvedEnvKey = resolveProviderEnvKey(options.provider.envKey ?? apiKeyField?.key, {
        aliases: options.provider.envKeyAliases,
        secrets: ctx.secrets as Record<string, string | undefined>,
      })
      const providerEntry: Record<string, unknown> = {
        ...(resolvedEnvKey ? { apiKey: `\${env:${resolvedEnvKey}}` } : {}),
        models:
          options.provider.models?.map((m) => ({
            id: m.id,
            name: m.name ?? m.id,
            ...(m.contextWindow != null ? { contextWindow: m.contextWindow } : {}),
            ...(m.maxTokens != null ? { maxTokens: m.maxTokens } : {}),
          })) ?? [],
        request: { allowPrivateNetwork: true },
      }
      if (agentConfig.baseUrl || options.provider.baseUrl) {
        providerEntry.baseUrl = agentConfig.baseUrl ?? options.provider.baseUrl
      }
      if (agentConfig.models) providerEntry.models = agentConfig.models
      if (options.provider.api) {
        providerEntry.api = mapProviderApi(options.provider.api)
      }
      return { models: { mode: 'merge', providers: { [options.provider.id]: providerEntry } } }
    })

    api.onBuildEnv((ctx) => {
      const out = defaultEnvVars(manifest, ctx)
      for (const key of providerEnvKeys(options.provider)) {
        const value = (ctx.secrets as Record<string, string | undefined>)[key] ?? process.env[key]
        if (value) out[key] = value
      }
      return out
    })
    api.onValidate((ctx) => {
      const result = defaultValidation(manifest, ctx)
      if (
        apiKeyField &&
        hasProviderEnvValue(options.provider.envKey ?? apiKeyField.key, {
          aliases: options.provider.envKeyAliases,
          secrets: ctx.secrets as Record<string, string | undefined>,
        })
      ) {
        result.errors = result.errors.filter((error) => error.path !== `secrets.${apiKeyField.key}`)
        result.valid = result.errors.filter((error) => error.severity === 'error').length === 0
      }
      return result
    })
    extraSetup?.(api)
  })
}

function mapProviderApi(api: string): string {
  const MAP: Record<string, string> = {
    anthropic: 'anthropic-messages',
    openai: 'openai-completions',
    'openai-chat': 'openai-completions',
    google: 'google-generative-ai',
    gemini: 'google-generative-ai',
    bedrock: 'bedrock-converse-stream',
    azure: 'azure-openai-responses',
    'azure-openai': 'azure-openai-responses',
  }
  return MAP[api] ?? api
}

function resolveProviderEnvKey(
  envKey: string | undefined,
  options: { aliases?: string[]; secrets: Record<string, string | undefined> },
): string | undefined {
  if (!envKey) return undefined
  for (const key of [envKey, ...(options.aliases ?? [])]) {
    if (options.secrets[key] ?? process.env[key]) return key
  }
  return envKey
}

function hasProviderEnvValue(
  envKey: string | undefined,
  options: { aliases?: string[]; secrets: Record<string, string | undefined> },
): boolean {
  if (!envKey) return false
  return [envKey, ...(options.aliases ?? [])].some((key) =>
    Boolean(options.secrets[key] ?? process.env[key]),
  )
}

function providerEnvKeys(provider: {
  envKey?: string
  envKeyAliases?: string[]
  baseUrlEnvKey?: string
  modelEnvKey?: string
}): string[] {
  return [
    provider.envKey,
    ...(provider.envKeyAliases ?? []),
    provider.baseUrlEnvKey,
    provider.modelEnvKey,
  ].filter((key): key is string => Boolean(key))
}
