/**
 * Plugin Config Merger — merges plugin config fragments into OpenClaw config.
 */

import type { UseEntry } from '../config/schema/shadow.schema.js'
import type {
  CloudConfig,
  CloudPluginInstanceConfig,
  OpenClawBinding,
  OpenClawConfig,
} from '../config/schema.js'
import { deepMerge } from '../utils/deep-merge.js'
import type { PluginConfigFragment } from './types.js'

function pluginLoadPaths(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const load = (value as { load?: unknown }).load
  if (!load || typeof load !== 'object' || Array.isArray(load)) return []
  const paths = (load as { paths?: unknown }).paths
  return Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === 'string' && path.length > 0)
    : []
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
      const existingLoadPaths = pluginLoadPaths(result.plugins)
      const fragmentLoadPaths = pluginLoadPaths(fragment.plugins)
      result.plugins = deepMerge(
        result.plugins as Record<string, unknown>,
        fragment.plugins as Record<string, unknown>,
      ) as OpenClawConfig['plugins']
      const mergedLoadPaths = [...existingLoadPaths, ...fragmentLoadPaths]
      if (mergedLoadPaths.length > 0) {
        const plugins = result.plugins as Record<string, Record<string, unknown>>
        plugins.load = {
          ...(plugins.load ?? {}),
          paths: [...new Set(mergedLoadPaths)],
        }
      }
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

    // Agents defaults: deep merge (only defaults — never overwrite agents.list)
    // Used by plugins like gitagent to inject repoRoot, heartbeat, workspace config.
    if (fragment.agents) {
      const fragmentAgents = fragment.agents as Record<string, unknown>
      const existingAgents = (result.agents ?? {}) as Record<string, unknown>
      if (fragmentAgents.defaults) {
        result.agents = {
          ...existingAgents,
          defaults: deepMerge(
            (existingAgents.defaults ?? {}) as Record<string, unknown>,
            fragmentAgents.defaults as Record<string, unknown>,
          ),
        } as OpenClawConfig['agents']
      }
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
  // New-style: use array
  if (config.use?.length) {
    // Check agent-level use override
    const agent = config.deployments?.agents?.find((a) => a.id === agentId)
    const agentUse = (agent as unknown as { use?: UseEntry[] } | undefined)?.use
    const agentEntry = agentUse?.find((e) => e.plugin === pluginId)
    if (agentEntry) return agentEntry.options ?? {}

    // Fall back to global use
    const globalEntry = config.use.find((e) => e.plugin === pluginId)
    if (globalEntry) return globalEntry.options ?? {}

    return null
  }

  // Legacy: plugins map
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
  // Legacy plugins map: explicit secrets map with ${env:VAR} support
  const pluginInstanceConfig = (
    config.plugins as Record<string, CloudPluginInstanceConfig> | undefined
  )?.[pluginId]

  const secretsMap: Record<string, string> = pluginInstanceConfig?.secrets ?? {}

  // New `use` array: plugins may declare required env vars in options
  // Resolve any ${env:VAR} references found in use entry options
  if (!pluginInstanceConfig) {
    const useEntry = config.use?.find((e) => e.plugin === pluginId)
    if (useEntry?.options) {
      for (const [key, val] of Object.entries(useEntry.options)) {
        if (typeof val === 'string') {
          const envMatch = val.match(/^\$\{env:(\w+)\}$/)
          if (envMatch?.[1]) {
            const envKey = envMatch[1]
            const envVal = processEnv[envKey]
            if (envVal !== undefined) secretsMap[key] = envVal
          } else if (/^[A-Z0-9_]+$/.test(key)) {
            secretsMap[key] = val
          }
        }
      }
    }
  }

  return resolveSecretRefs(secretsMap, processEnv)
}

function resolveSecretRefs(
  secrets: Record<string, string>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [key, ref] of Object.entries(secrets)) {
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
