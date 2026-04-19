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
  PluginSkillsConfig,
  PluginValidationResult,
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
    buildEnv: [],
    buildResources: [],
    validate: [],
    provision: [],
    healthCheck: [],
  }
}

function makeAPI(
  hooks: PluginHooks,
  collected: { skills?: PluginSkillsConfig; cli?: PluginCLITool[]; mcp?: PluginMCPServer },
): PluginAPI {
  return {
    addSkills: (s) => {
      collected.skills = s
    },
    addCLI: (tools) => {
      collected.cli = [...(collected.cli ?? []), ...tools]
    },
    setMCP: (server) => {
      collected.mcp = server
    },
    onResolveAgent: (fn) => hooks.resolveAgent.push(fn),
    onBuildConfig: (fn) => hooks.buildConfig.push(fn),
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
  const collected: { skills?: PluginSkillsConfig; cli?: PluginCLITool[]; mcp?: PluginMCPServer } =
    {}
  const api = makeAPI(hooks, collected)
  setup(api)
  return {
    manifest,
    skills: collected.skills,
    cli: collected.cli,
    mcp: collected.mcp,
    _hooks: hooks,
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
  options: { skills?: PluginSkillsConfig; cli?: PluginCLITool[]; mcp?: PluginMCPServer },
  extraSetup?: (api: PluginAPI) => void,
): PluginDefinition {
  return definePlugin(manifest, (api) => {
    if (options.skills) api.addSkills(options.skills)
    if (options.cli?.length) api.addCLI(options.cli)
    if (options.mcp) api.setMCP(options.mcp)

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
        if (options.skills.install) sc.install = options.skills.install
        fragment.skills = sc
      }

      if (options.cli?.length) {
        fragment.tools = { allow: options.cli.map((t) => t.name) }
      }

      if (options.mcp) {
        const s = options.mcp
        fragment.plugins = {
          entries: {
            [manifest.id]: {
              enabled: true,
              transport: s.transport,
              command: s.command,
              ...(s.args ? { args: s.args } : {}),
              ...(s.env ? { env: s.env } : {}),
            },
          },
        }
      }

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
  options: { provider: { id: string; api: string; baseUrl?: string } },
  extraSetup?: (api: PluginAPI) => void,
): PluginDefinition {
  return definePlugin(manifest, (api) => {
    api.onBuildConfig((ctx): PluginConfigFragment => {
      const { agentConfig } = ctx
      const apiKeyField = manifest.auth.fields.find((f) => f.required && f.sensitive)
      const providerEntry: Record<string, unknown> = {
        ...(apiKeyField ? { apiKey: `\${env:${apiKeyField.key}}` } : {}),
        models: [],
        request: { allowPrivateNetwork: true },
      }
      if (agentConfig.baseUrl || options.provider.baseUrl) {
        providerEntry.baseUrl = agentConfig.baseUrl ?? options.provider.baseUrl
      }
      if (agentConfig.models) providerEntry.models = agentConfig.models
      if (options.provider.api) {
        const MAP: Record<string, string> = {
          anthropic: 'anthropic-messages',
          openai: 'openai-completions',
          google: 'google-generative-ai',
          gemini: 'google-generative-ai',
        }
        providerEntry.api = MAP[options.provider.api] ?? options.provider.api
      }
      return { models: { mode: 'merge', providers: { [options.provider.id]: providerEntry } } }
    })

    api.onBuildEnv((ctx) => defaultEnvVars(manifest, ctx))
    api.onValidate((ctx) => defaultValidation(manifest, ctx))
    extraSetup?.(api)
  })
}
