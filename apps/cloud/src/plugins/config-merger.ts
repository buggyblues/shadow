/**
 * Plugin Config Merger — merges plugin config fragments into OpenClaw config.
 */

import type { CloudConfig, OpenClawBinding, OpenClawConfig } from '../config/schema.js'
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

/**
 * Resolve the effective plugin config for a specific agent.
 * Merges: plugin defaults → global config → per-agent override.
 * Returns null if the plugin is disabled for this agent.
 */
export function resolveAgentPluginConfig(
  pluginId: string,
  agentId: string,
  config: CloudConfig,
): Record<string, unknown> | null {
  const pluginInstanceConfig = (
    config.plugins as Record<string, PluginInstanceConfig> | undefined
  )?.[pluginId]
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
): Record<string, string> {
  const pluginInstanceConfig = (
    config.plugins as Record<string, PluginInstanceConfig> | undefined
  )?.[pluginId]
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
