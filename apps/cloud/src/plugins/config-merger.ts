/**
 * Plugin Config Merger — merges plugin config fragments into OpenClaw config.
 */

import type {
  CloudConfig,
  CloudPluginInstanceConfig,
  OpenClawBinding,
  OpenClawConfig,
} from '../config/schema.js'
import { deepMerge } from '../utils/deep-merge.js'
import type { PluginConfigFragment } from './types.js'

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
      result.channels = deepMerge(
        (result.channels ?? {}) as Record<string, unknown>,
        fragment.channels as Record<string, unknown>,
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
      result.plugins = deepMerge(
        result.plugins as Record<string, unknown>,
        fragment.plugins as Record<string, unknown>,
      ) as OpenClawConfig['plugins']
    }

    // Skills: deep merge
    if (fragment.skills) {
      if (!result.skills) result.skills = {} as Record<string, unknown>
      result.skills = deepMerge(
        result.skills as Record<string, unknown>,
        fragment.skills as Record<string, unknown>,
      ) as OpenClawConfig['skills']
    }

    // Tools: deep merge
    if (fragment.tools) {
      if (!result.tools) result.tools = {} as Record<string, unknown>
      result.tools = deepMerge(
        result.tools as Record<string, unknown>,
        fragment.tools as Record<string, unknown>,
      ) as OpenClawConfig['tools']
    }

    // Models: deep merge (provider plugins contribute to models.providers)
    if (fragment.models) {
      if (!result.models) result.models = {} as Record<string, unknown>
      result.models = deepMerge(
        result.models as Record<string, unknown>,
        fragment.models as Record<string, unknown>,
      ) as OpenClawConfig['models']
    }
  }

  return result
}

/**
 * Resolve the effective plugin config for a specific agent.
 * Merges: plugin defaults → global config → per-agent override.
 * Returns null if the plugin is disabled for this agent.
 *
 * Checks both the legacy `plugins` map and the new `use` array.
 */
export function resolveAgentPluginConfig(
  pluginId: string,
  agentId: string,
  config: CloudConfig,
): Record<string, unknown> | null {
  // Legacy plugins map path
  const pluginInstanceConfig = (
    config.plugins as Record<string, CloudPluginInstanceConfig> | undefined
  )?.[pluginId]
  if (pluginInstanceConfig) {
    if (pluginInstanceConfig.enabled === false) return null

    const globalConfig = pluginInstanceConfig.config ?? {}
    const agentOverride = pluginInstanceConfig.agents?.[agentId]
    if (agentOverride?.enabled === false) return null

    const agentConfig = agentOverride?.config ?? {}
    return { ...globalConfig, ...agentConfig }
  }

  // New `use` array path
  const useEntry = config.use?.find((e) => e.plugin === pluginId)
  if (useEntry) {
    return useEntry.options ?? {}
  }

  return null
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
  // Only the legacy plugins map carries secrets; use-array plugins resolve at build time via env refs.
  const pluginInstanceConfig = (
    config.plugins as Record<string, CloudPluginInstanceConfig> | undefined
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
