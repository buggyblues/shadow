/**
 * Plugin factory helpers — create plugins with minimal boilerplate.
 *
 * Three primary patterns:
 * 1. createSkillPlugin  — skill-based plugin (most common, skills+CLI first)
 * 2. createChannelPlugin — communication channel plugins
 * 3. createProviderPlugin — AI model provider plugins
 */

import { validateManifest } from './loader.js'
import type {
  PluginBuildContext,
  PluginCLIProvider,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
  PluginMCPProvider,
  PluginSkillsProvider,
  PluginValidationResult,
} from './types.js'

// ─── Manifest Loader ────────────────────────────────────────────────────────

/** Validates and returns the manifest. Throws if required fields are missing. */
export function loadManifest(raw: Record<string, unknown>): PluginManifest {
  if (!validateManifest(raw)) {
    const id = typeof raw.id === 'string' ? raw.id : 'unknown'
    throw new Error(`Invalid plugin manifest for "${id}": missing required fields`)
  }
  return raw as unknown as PluginManifest
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function buildDefaultEnvVars(
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

function buildDefaultValidation(
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

// ─── Skill Plugin Factory ───────────────────────────────────────────────────

/**
 * Create a skill-based plugin (the industry-standard pattern).
 *
 * Skills are bundled agent procedures + CLI tools that agents can invoke.
 * This is preferred over MCP for most integrations.
 *
 * @example
 * createSkillPlugin(manifest, {
 *   skills: { bundled: ['github'], entries: [{ id: 'github', name: 'GitHub', ... }] },
 *   cli: { tools: [{ name: 'gh', command: 'gh', description: 'GitHub CLI' }] },
 * })
 */
export function createSkillPlugin(
  manifest: PluginManifest,
  options: {
    skills?: PluginSkillsProvider
    cli?: PluginCLIProvider
    mcp?: PluginMCPProvider
  },
): PluginDefinition {
  return {
    manifest,

    // ── Capability Providers ──
    skills: options.skills,
    cli: options.cli,
    mcp: options.mcp,

    // ── Config Builder (auto-derived from skills+CLI+MCP) ──
    configBuilder: {
      build(
        _agentConfig: Record<string, unknown>,
        _context: PluginBuildContext,
      ): PluginConfigFragment {
        const fragment: PluginConfigFragment = {}

        // Skills → skills.allowBundled + skills.entries
        if (options.skills) {
          const skillsConfig: Record<string, unknown> = {}
          if (options.skills.bundled?.length) {
            skillsConfig.allowBundled = options.skills.bundled
          }
          if (options.skills.entries?.length) {
            const entries: Record<string, unknown> = {}
            for (const skill of options.skills.entries) {
              entries[skill.id] = {
                enabled: true,
                ...(skill.apiKey ? { apiKey: skill.apiKey } : {}),
                ...(skill.env ? { env: skill.env } : {}),
              }
            }
            skillsConfig.entries = entries
          }
          if (options.skills.install) {
            skillsConfig.install = options.skills.install
          }
          fragment.skills = skillsConfig
        }

        // CLI tools → tools.allow
        if (options.cli?.tools.length) {
          fragment.tools = {
            allow: options.cli.tools.map((t) => t.name),
          }
        }

        // MCP server (fallback for plugins that genuinely need it)
        if (options.mcp?.server) {
          const { server } = options.mcp
          fragment.plugins = {
            entries: {
              [manifest.id]: {
                enabled: true,
                transport: server.transport,
                command: server.command,
                ...(server.args ? { args: server.args } : {}),
                ...(server.env ? { env: server.env } : {}),
              },
            },
          }
        }

        return fragment
      },
    },

    // ── Env Provider ──
    env: {
      build: (_agentConfig, context) => buildDefaultEnvVars(manifest, context),
    },

    // ── Validation Provider ──
    validation: {
      validate: (_agentConfig, context) => buildDefaultValidation(manifest, context),
    },
  }
}

// ─── Channel Plugin Factory ─────────────────────────────────────────────────

/**
 * Create a channel plugin for communication integrations.
 *
 * Channel plugins configure OpenClaw channels (Slack, Discord, Telegram, etc.)
 * and create agent routing bindings.
 */
export function createChannelPlugin(
  manifest: PluginManifest,
  channelBuilder: (
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ) => PluginConfigFragment,
): PluginDefinition {
  return {
    manifest,

    // ── Config Builder (delegates to channel builder) ──
    configBuilder: {
      build: channelBuilder,
    },

    // ── Env Provider ──
    env: {
      build: (_agentConfig, context) => buildDefaultEnvVars(manifest, context),
    },

    // ── Validation Provider ──
    validation: {
      validate: (_agentConfig, context) => buildDefaultValidation(manifest, context),
    },
  }
}

// ─── Provider Plugin Factory ────────────────────────────────────────────────

/**
 * Create an AI model provider plugin.
 *
 * Provider plugins configure model providers (OpenAI, Anthropic, etc.)
 * in the OpenClaw config.
 */
export function createProviderPlugin(
  manifest: PluginManifest,
  options: {
    provider: { id: string; api: string; baseUrl?: string }
    /** @deprecated defaultModel is not written to models.providers; configure it at the agent level instead */
    defaultModel?: string
  },
): PluginDefinition {
  return {
    manifest,

    // ── Config Builder ──
    configBuilder: {
      build(
        agentConfig: Record<string, unknown>,
        _context: PluginBuildContext,
      ): PluginConfigFragment {
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
          const API_TYPE_MAP: Record<string, string> = {
            anthropic: 'anthropic-messages',
            openai: 'openai-completions',
            google: 'google-generative-ai',
            gemini: 'google-generative-ai',
          }
          providerEntry.api = API_TYPE_MAP[options.provider.api] ?? options.provider.api
        }

        return {
          models: {
            mode: 'merge',
            providers: {
              [options.provider.id]: providerEntry,
            },
          },
        }
      },
    },

    // ── Env Provider ──
    env: {
      build: (_agentConfig, context) => buildDefaultEnvVars(manifest, context),
    },

    // ── Validation Provider ──
    validation: {
      validate: (_agentConfig, context) => buildDefaultValidation(manifest, context),
    },
  }
}
