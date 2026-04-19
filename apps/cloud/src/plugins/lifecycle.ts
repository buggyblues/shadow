/**
 * Plugin lifecycle execution — provision and health check.
 *
 * Called during the async deploy phase, after config building but before
 * manifest generation.
 */

import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import type { ProvisionState } from '../utils/state.js'
import { resolveAgentPluginConfig, resolvePluginSecrets } from './config-merger.js'
import { getPluginRegistry } from './registry.js'
import type { PluginBuildContext, PluginProvisionContext } from './types.js'

export interface ProvisionResults {
  secrets: Record<string, string>
  states: Record<string, Record<string, unknown>>
  errors: Array<{ pluginId: string; error: string }>
}

/**
 * Execute plugin lifecycle provisioning for an agent deployment.
 * Call this during the deploy phase (async context).
 */
export async function executePluginProvisions(
  agent: AgentDeployment,
  config: CloudConfig,
  namespace: string,
  logger: { info: (msg: string) => void; dim: (msg: string) => void },
  dryRun = false,
  extraSecrets: Record<string, string> = {},
  persistedState: ProvisionState | null = null,
): Promise<ProvisionResults> {
  const registry = getPluginRegistry()
  const results: ProvisionResults = { secrets: {}, states: {}, errors: [] }

  if (registry.size === 0) return results

  for (const pluginDef of registry.getAll()) {
    const pluginId = pluginDef.manifest.id

    // Only provision plugins with a provision hook
    if (!pluginDef._hooks.provision.length) continue

    const resolved = resolveAgentPluginConfig(pluginId, agent.id, config)
    if (!resolved) continue

    const secrets = { ...resolvePluginSecrets(pluginId, config, process.env), ...extraSecrets }
    const context: PluginProvisionContext = {
      agent,
      config,
      agentConfig: resolved,
      secrets,
      namespace,
      logger,
      dryRun,
      previousState: persistedState?.plugins?.[pluginId] ?? null,
    }

    try {
      logger.dim(`  Provisioning plugin: ${pluginDef.manifest.name}`)
      for (const fn of pluginDef._hooks.provision) {
        const result = await fn(context)
        if (result.state) results.states[pluginId] = result.state
        if (result.secrets) Object.assign(results.secrets, result.secrets)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.errors.push({ pluginId, error: message })
      logger.info(`  ⚠ Plugin ${pluginId} provision failed: ${message}`)
    }
  }

  return results
}

/**
 * Run plugin health checks and return results.
 * Used by the doctor system to validate plugin dependencies.
 */
export async function checkPluginHealth(
  config: CloudConfig,
  agentId = '',
): Promise<Array<{ pluginId: string; name: string; healthy: boolean; message: string }>> {
  const registry = getPluginRegistry()
  const results: Array<{ pluginId: string; name: string; healthy: boolean; message: string }> = []

  if (registry.size === 0) return results

  for (const pluginDef of registry.getAll()) {
    const pluginId = pluginDef.manifest.id

    if (!pluginDef._hooks.healthCheck.length) continue

    const resolved = resolveAgentPluginConfig(pluginId, agentId, config)
    if (!resolved) continue

    const secrets = resolvePluginSecrets(pluginId, config, process.env)

    const context: PluginBuildContext = {
      agent: {
        id: agentId,
        runtime: 'openclaw',
        configuration: { openclaw: {} },
      } as AgentDeployment,
      config,
      agentConfig: resolved,
      secrets,
      namespace: config.deployments?.namespace ?? 'default',
      pluginRegistry: registry,
    }

    try {
      for (const fn of pluginDef._hooks.healthCheck) {
        const result = await fn(context)
        results.push({
          pluginId,
          name: pluginDef.manifest.name,
          healthy: result.healthy,
          message: result.message,
        })
      }
    } catch (err) {
      results.push({
        pluginId,
        name: pluginDef.manifest.name,
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
