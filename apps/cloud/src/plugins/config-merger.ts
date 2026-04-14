/**
 * Plugin Config Merger — merges plugin config fragments into OpenClaw config.
 */

import type { CloudConfig, OpenClawBinding, OpenClawConfig, UseEntry } from '../config/schema.js'
import type { PluginConfigFragment, PluginInstanceConfig } from './types.js'

/**
 * Deep merge helper for objects. Arrays are concatenated, objects are recursively merged.
 */
function deepMergeObj(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const targetVal = result[key]
    const sourceVal = source[key]
    if (
      targetVal &&
      sourceVal &&
      typeof targetVal === 'object' &&
      typeof sourceVal === 'object' &&
      !Array.isArray(targetVal) &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMergeObj(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    } else {
      result[key] = sourceVal
    }
  }
  return result
}

/**
 * Merge plugin config fragment(s) into a base OpenClaw config.
 * Accepts a single fragment or an array of fragments.
 */
export function mergePluginFragments(
  base: OpenClawConfig,
  fragmentOrFragments: PluginConfigFragment | PluginConfigFragment[],
): OpenClawConfig {
  const result = { ...base }
  const fragments = Array.isArray(fragmentOrFragments) ? fragmentOrFragments : [fragmentOrFragments]

  for (const fragment of fragments) {
    // Channels: deep merge (each plugin owns its channel namespace)
    if (fragment.channels) {
      result.channels = deepMergeObj(
        (result.channels ?? {}) as Record<string, unknown>,
        fragment.channels,
      ) as OpenClawConfig['channels']
    }

    // Bindings: append (array concat)
    if (fragment.bindings) {
      const existingBindings = (result.bindings ?? []) as OpenClawBinding[]
      result.bindings = [...existingBindings, ...fragment.bindings] as OpenClawConfig['bindings']
    }

    // Plugins/MCP: deep merge
    if (fragment.plugins) {
      if (!result.plugins) result.plugins = {} as Record<string, unknown>
      result.plugins = deepMergeObj(
        result.plugins as Record<string, unknown>,
        fragment.plugins,
      ) as OpenClawConfig['plugins']
    }

    // Skills: deep merge
    if (fragment.skills) {
      if (!result.skills) result.skills = {} as Record<string, unknown>
      result.skills = deepMergeObj(
        result.skills as Record<string, unknown>,
        fragment.skills,
      ) as OpenClawConfig['skills']
    }

    // Tools: deep merge
    if (fragment.tools) {
      if (!result.tools) result.tools = {} as Record<string, unknown>
      result.tools = deepMergeObj(
        result.tools as Record<string, unknown>,
        fragment.tools,
      ) as OpenClawConfig['tools']
    }
  }

  return result
}

function findUseEntry(useEntries: UseEntry[] | undefined, pluginId: string): UseEntry | undefined {
  return useEntries?.find((entry) => entry.plugin === pluginId)
}

function getAgentUseEntry(
  pluginId: string,
  agentId: string | undefined,
  config: CloudConfig,
): UseEntry | undefined {
  if (!agentId) return undefined
  const agent = config.deployments?.agents?.find((candidate) => candidate.id === agentId)
  return findUseEntry(agent?.use, pluginId)
}

function getLegacyPluginInstanceConfig(
  pluginId: string,
  config: CloudConfig,
): PluginInstanceConfig | undefined {
  return (config.plugins as Record<string, PluginInstanceConfig> | undefined)?.[pluginId]
}

function resolveUseEntrySecrets(
  options: Record<string, unknown> | undefined,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  if (!options) return {}

  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(options)) {
    if (typeof value !== 'string') continue

    const envMatch = value.match(/^\$\{env:(\w+)\}$/)
    if (envMatch) {
      const envKey = envMatch[1]
      if (!envKey) continue
      const envVal = processEnv[envKey]
      if (envVal !== undefined) {
        resolved[key] = envVal
      }
      continue
    }

    resolved[key] = value
  }

  return resolved
}

/**
 * Resolve the effective plugin config for a specific agent.
 * Prefer the modern webpack-style `use` entries, then fall back to the
 * legacy `plugins` map for compatibility.
 * Returns null if the plugin is disabled for this agent.
 */
export function resolveAgentPluginConfig(
  pluginId: string,
  agentId: string,
  config: CloudConfig,
): Record<string, unknown> | null {
  const agentUseEntry = getAgentUseEntry(pluginId, agentId, config)
  if (agentUseEntry) {
    return { ...(agentUseEntry.options ?? {}) }
  }

  const globalUseEntry = findUseEntry(config.use, pluginId)
  if (globalUseEntry) {
    return { ...(globalUseEntry.options ?? {}) }
  }

  const pluginInstanceConfig = getLegacyPluginInstanceConfig(pluginId, config)
  if (!pluginInstanceConfig) return null
  if (pluginInstanceConfig.enabled === false) return null

  // Start with global plugin config
  const globalConfig = pluginInstanceConfig.config ?? {}

  // Check per-agent override
  const agentOverride = pluginInstanceConfig.agents?.[agentId]
  if (agentOverride?.enabled === false) return null

  // Merge global + per-agent config
  const agentConfig = agentOverride?.config ?? {}
  return { ...globalConfig, ...agentConfig }
}

/**
 * Resolve secret values for a plugin from config refs and process.env.
 * Handles ${env:VAR} references.
 */
export function resolvePluginSecrets(
  pluginId: string,
  config: CloudConfig,
  processEnv: Record<string, string | undefined>,
  agentId?: string,
): Record<string, string> {
  const agentUseEntry = getAgentUseEntry(pluginId, agentId, config)
  if (agentUseEntry) {
    return resolveUseEntrySecrets(agentUseEntry.options, processEnv)
  }

  const globalUseEntry = findUseEntry(config.use, pluginId)
  if (globalUseEntry) {
    return resolveUseEntrySecrets(globalUseEntry.options, processEnv)
  }

  const pluginInstanceConfig = getLegacyPluginInstanceConfig(pluginId, config)
  if (!pluginInstanceConfig?.secrets) return {}

  const resolved: Record<string, string> = {}
  for (const [key, ref] of Object.entries(pluginInstanceConfig.secrets)) {
    // Resolve ${env:VAR_NAME} references
    const envMatch = ref.match(/^\$\{env:(\w+)\}$/)
    if (envMatch) {
      const envKey = envMatch[1]
      if (!envKey) continue
      const envVal = processEnv[envKey]
      if (envVal !== undefined) {
        resolved[key] = envVal
      }
    } else {
      // Literal value
      resolved[key] = ref
    }
  }

  return resolved
}
