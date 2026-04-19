/**
 * Config parser — reads shadowob-cloud.json, validates with typia,
 * expands 'extends' references, resolves template variables,
 * and builds official OpenClaw config format.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPluginRegistry } from '../plugins/registry.js'
import { deepMerge } from '../utils/deep-merge.js'
import { parseJsonc } from '../utils/jsonc.js'
import type { AgentConfiguration, AgentDeployment, CloudConfig, Configuration } from './schema.js'
import { validateCloudConfig } from './schema.js'
import { resolveTemplates, type TemplateContext } from './template.js'

export { deepMerge } from '../utils/deep-merge.js'
// Re-export buildOpenClawConfig from its dedicated module
export { buildOpenClawConfig } from './openclaw-builder.js'

/**
 * Expand the 'extends' field in an agent configuration by merging
 * with the referenced base configuration from registry.configurations.
 */
export function expandExtends(
  agentConfig: AgentConfiguration,
  configurations: Configuration[],
): AgentConfiguration {
  if (!agentConfig.extends) return agentConfig

  const baseId = agentConfig.extends
  const base = configurations.find((c) => c.id === baseId)
  if (!base) {
    throw new Error(
      `Configuration "${baseId}" not found in registry.configurations. ` +
        `Available: ${configurations.map((c) => c.id).join(', ')}`,
    )
  }

  // Remove the 'extends' and 'id' fields, merge remaining
  const { id: _id, ...baseFields } = base
  const { extends: _extends, ...agentFields } = agentConfig

  return deepMerge(baseFields, agentFields) as AgentConfiguration
}

/**
 * Parse and validate a cloud config file using typia.
 */
export function parseConfigFile(filePath: string): CloudConfig {
  const absPath = resolve(filePath)
  const raw = readFileSync(absPath, 'utf-8')

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
function runPluginConfigResolvers(agent: AgentDeployment, config: CloudConfig): AgentDeployment {
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
    resolved = pluginDef.configResolver.resolveAgent(resolved, config)
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
export function resolveConfig(config: CloudConfig, templateCtx?: TemplateContext): CloudConfig {
  const configurations = config.registry?.configurations ?? []
  const resolved = { ...config }

  // Expand extends for each agent, then run plugin config resolvers
  if (resolved.deployments?.agents) {
    resolved.deployments = {
      ...resolved.deployments,
      agents: resolved.deployments.agents.map((agent) => {
        let a = {
          ...agent,
          configuration: expandExtends(agent.configuration, configurations),
        }

        // Run plugin configResolvers for any use entries on this agent
        a = runPluginConfigResolvers(a, resolved)

        return a
      }),
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
