/**
 * Config parser — reads shadowob-cloud.json, validates with typia,
 * expands 'extends' references, resolves template variables,
 * and builds official OpenClaw config format.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getPluginRegistry } from '../plugins/registry.js'
import { parseJsonc } from '../utils/jsonc.js'
import type { AgentConfiguration, AgentDeployment, CloudConfig, Configuration } from './schema.js'
import { validateCloudConfig } from './schema.js'
import { resolveTemplates, type TemplateContext } from './template.js'

// Re-export buildOpenClawConfig from its dedicated module
export { buildOpenClawConfig } from './openclaw-builder.js'

/**
 * Deep merge two objects. Arrays are replaced, not merged.
 */
export function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(override) as Array<keyof T>) {
    const baseVal = result[key]
    const overVal = override[key]
    if (
      overVal !== undefined &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overVal === 'object' &&
      overVal !== null &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      ) as T[keyof T]
    } else if (overVal !== undefined) {
      result[key] = overVal as T[keyof T]
    }
  }
  return result
}

/**
 * Recursively resolve a Configuration from the registry, following the
 * `extends` chain. Child fields override parent fields (deep merge).
 */
function resolveConfigurationChain(
  id: string,
  configurations: Configuration[],
  visited: Set<string> = new Set(),
): Omit<Configuration, 'id'> {
  if (visited.has(id)) {
    throw new Error(`Circular extends detected in registry.configurations: ${id}`)
  }
  visited.add(id)

  const config = configurations.find((c) => c.id === id)
  if (!config) {
    throw new Error(
      `Configuration "${id}" not found in registry.configurations. ` +
        `Available: ${configurations.map((c) => c.id).join(', ')}`,
    )
  }

  const { id: _id, extends: parentId, ...fields } = config
  if (!parentId) return fields

  const parentFields = resolveConfigurationChain(parentId, configurations, visited)
  return deepMerge(parentFields as Record<string, unknown>, fields) as Omit<Configuration, 'id'>
}

/**
 * Expand the 'extends' field in an agent configuration by merging
 * with the referenced base configuration from registry.configurations.
 * Supports chained Configuration extends (Configuration → Configuration).
 */
export function expandExtends(
  agentConfig: AgentConfiguration,
  configurations: Configuration[],
): AgentConfiguration {
  if (!agentConfig.extends) return agentConfig

  const resolvedBase = resolveConfigurationChain(agentConfig.extends, configurations)
  const { extends: _extends, ...agentFields } = agentConfig

  return deepMerge(resolvedBase as Record<string, unknown>, agentFields) as AgentConfiguration
}

/**
 * Parse and validate a cloud config file using typia.
 */
export async function parseConfigFile(filePath: string): Promise<CloudConfig> {
  const absPath = resolve(filePath)
  const raw = await readFile(absPath, 'utf-8')

  let parsed: unknown
  try {
    parsed = parseJsonc(raw, absPath)
  } catch (err) {
    throw new Error(`Invalid JSON/JSONC in ${absPath}: ${(err as Error).message}`)
  }

  const result = validateCloudConfig(parsed)
  if (!result.success) {
    const issues = result.errors
      .map((e) => `  - ${e.path}: ${e.expected} (got ${typeof e.value})`)
      .join('\n')
    throw new Error(`Config validation failed:\n${issues}`)
  }

  return result.data
}

/**
 * Run all plugin configResolvers for an agent deployment.
 * Iterates plugins referenced in the agent's `use` array and calls
 * their `configResolver.resolveAgent()` to pre-process the agent.
 */
async function runPluginConfigResolvers(
  agent: AgentDeployment,
  config: CloudConfig,
  cwd?: string,
): Promise<AgentDeployment> {
  const useEntries = [...(config.use ?? []), ...(agent.use ?? [])]
  if (useEntries.length === 0) return agent

  const registry = getPluginRegistry()
  if (registry.size === 0) return agent

  // Deduplicate by plugin id (agent-level overrides global)
  const seen = new Set<string>()
  const uniquePlugins: string[] = []
  for (const entry of [...(agent.use ?? []), ...(config.use ?? [])]) {
    if (!seen.has(entry.plugin)) {
      seen.add(entry.plugin)
      uniquePlugins.push(entry.plugin)
    }
  }

  let resolved = agent
  for (const pluginId of uniquePlugins) {
    const pluginDef = registry.get(pluginId)
    if (!pluginDef?.configResolver) continue
    resolved = await pluginDef.configResolver.resolveAgent(resolved, config, cwd)
  }

  return resolved
}

/**
 * Fully resolve a cloud config:
 * 1. Expand all 'extends' references
 * 2. Run plugin configResolvers (e.g., gitagent use → agent.source + enrichment)
 * 3. Resolve template variables
 * Returns a new config with all agents having their final configuration.
 */
export async function resolveConfig(
  config: CloudConfig,
  templateCtx?: TemplateContext,
  cwd?: string,
): Promise<CloudConfig> {
  const configurations = config.registry?.configurations ?? []
  const resolved = { ...config }

  // Expand extends for each agent, then run plugin config resolvers
  if (resolved.deployments?.agents) {
    const agents = await Promise.all(
      resolved.deployments.agents.map(async (agent) => {
        let a = {
          ...agent,
          configuration: expandExtends(agent.configuration, configurations),
        }

        // Run plugin configResolvers for any use entries on this agent
        a = await runPluginConfigResolvers(a, resolved, cwd)

        return a
      }),
    )
    resolved.deployments = {
      ...resolved.deployments,
      agents,
    }
  }

  // Resolve template variables (with i18n context and vault secrets from config)
  const locale = resolved.locale ?? 'en'
  const i18nDict = resolved.i18n?.[locale] ?? resolved.i18n?.en
  const effectiveCtx: TemplateContext = { ...templateCtx }
  if (i18nDict) {
    effectiveCtx.i18nDict = i18nDict
  }

  // Build vault secrets from registry.vaults into the template context
  if (resolved.registry?.vaults) {
    const vaultSecrets: Record<string, string> = {}
    for (const vault of Object.values(resolved.registry.vaults)) {
      if (vault.secrets) {
        for (const [key, value] of Object.entries(vault.secrets)) {
          vaultSecrets[key] = value
        }
      }
      if (vault.providers) {
        for (const [providerId, source] of Object.entries(vault.providers)) {
          if (source.apiKey) {
            vaultSecrets[`${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`] = source.apiKey
          }
        }
      }
    }
    effectiveCtx.vaultSecrets = { ...vaultSecrets, ...effectiveCtx.vaultSecrets }
  }

  return resolveTemplates(resolved, effectiveCtx)
}
