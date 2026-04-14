/**
 * Plugin lifecycle execution — provision and health check.
 *
 * Called during the async deploy phase, after config building but before
 * manifest generation.
 */

import type { AgentDeployment, CloudConfig } from '../config/schema.js'
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
  logger: { info: (msg: string) => void; dim: (msg: string) => void },
  dryRun = false,
): Promise<ProvisionResults> {
  const registry = getPluginRegistry()
  const results: ProvisionResults = { secrets: {}, states: {}, errors: [] }

  if (registry.size === 0) return results

  for (const pluginDef of registry.getAll()) {
    const pluginId = pluginDef.manifest.id

    // Only provision plugins with lifecycle.provision
    if (!pluginDef.lifecycle?.provision) continue

    const resolved = resolveAgentPluginConfig(pluginId, agent.id, config)
    if (!resolved) continue

    const secrets = resolvePluginSecrets(pluginId, config, process.env, agent.id)
    const context: PluginProvisionContext = {
      agent,
      config,
      secrets,
      logger,
      dryRun,
      existingState: results.states[pluginId] ?? null,
    }

    const agentConfig = resolved as Record<string, unknown>

    try {
      logger.dim(`  Provisioning plugin: ${pluginDef.manifest.name}`)
      const result = await pluginDef.lifecycle.provision(agentConfig, context)

      if (result.state) {
        results.states[pluginId] = result.state
      }
      if (result.secrets) {
        Object.assign(results.secrets, result.secrets)
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
): Promise<Array<{ pluginId: string; name: string; healthy: boolean; message: string }>> {
  const registry = getPluginRegistry()
  const results: Array<{ pluginId: string; name: string; healthy: boolean; message: string }> = []

  if (registry.size === 0) return results

  for (const pluginDef of registry.getAll()) {
    const pluginId = pluginDef.manifest.id

    if (!pluginDef.lifecycle?.healthCheck) continue

    const resolved = resolveAgentPluginConfig(pluginId, '', config)
    if (!resolved) continue

    const secrets = resolvePluginSecrets(pluginId, config, process.env)

    const context: PluginBuildContext = {
      agent: { id: '', runtime: 'openclaw', configuration: { openclaw: {} } } as AgentDeployment,
      config,
      secrets,
      namespace: config.deployments?.namespace ?? 'default',
      pluginRegistry: registry,
    }

    const agentConfig = resolved as Record<string, unknown>

    try {
      const result = await pluginDef.lifecycle.healthCheck(agentConfig, context)
      results.push({
        pluginId,
        name: pluginDef.manifest.name,
        healthy: result.healthy,
        message: result.message,
      })
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
