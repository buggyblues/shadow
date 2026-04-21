/**
 * CLI: shadowob-cloud provision — manually provision Shadow resources.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'
import { loadProvisionState, mergeProvisionState, saveProvisionState } from '../../utils/state.js'

export function createProvisionCommand(container: ServiceContainer) {
  return new Command('provision')
    .description('Provision Shadow resources (servers, channels, buddies) without deploying')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('--provision-url <url>', 'Shadow server URL')
    .option('--provision-token <token>', 'Shadow user token')
    .option('--dry-run', 'Preview what would be provisioned')
    .option('--output <path>', 'Write provisioned tokens to file')
    .option('--force', 'Force re-provisioning even if state shows resources exist')
    .option('--state-dir <dir>', 'Subdirectory for provision state (default: .shadowob)')
    .action(
      async (options: {
        file: string
        provisionUrl?: string
        provisionToken?: string
        dryRun?: boolean
        force?: boolean
        output?: string
        stateDir?: string
      }) => {
        const filePath = resolve(options.file)

        if (!existsSync(filePath)) {
          container.logger.error(`Config file not found: ${filePath}`)
          process.exit(1)
        }

        const config = await container.config.parseFile(filePath)
        const resolved = await container.config.resolve(config, filePath)
        const shadowUrl = options.provisionUrl ?? process.env.SHADOW_SERVER_URL
        const shadowToken = options.provisionToken ?? process.env.SHADOW_USER_TOKEN

        if (!shadowUrl) {
          container.logger.error(
            'Shadow server URL required (--provision-url or SHADOW_SERVER_URL)',
          )
          process.exit(1)
        }
        if (!shadowToken) {
          container.logger.error(
            'Shadow user token required (--provision-token or SHADOW_USER_TOKEN)',
          )
          process.exit(1)
        }

        try {
          const { executePluginProvisions, loadAllPlugins, getPluginRegistry } = await import(
            '../../plugins/index.js'
          )
          try {
            await loadAllPlugins(getPluginRegistry())
          } catch {
            /* already loaded */
          }

          const agents = resolved.deployments?.agents ?? []
          const namespace = resolved.deployments?.namespace ?? 'shadowob-cloud'
          const existing = loadProvisionState(filePath, options.stateDir)
          const extraSecrets: Record<string, string> = {
            SHADOW_SERVER_URL: shadowUrl,
            SHADOW_USER_TOKEN: shadowToken,
          }

          // Track merged states and last result for display
          const mergedStates: Record<string, Record<string, unknown>> = {}

          for (const agent of agents) {
            const provisionResults = await executePluginProvisions(
              agent,
              resolved,
              namespace,
              container.logger,
              options.dryRun,
              extraSecrets,
              existing,
            )
            for (const [pluginId, state] of Object.entries(provisionResults.states)) {
              mergedStates[pluginId] = { ...(mergedStates[pluginId] ?? {}), ...state }
            }
            if (provisionResults.errors.length > 0) {
              for (const e of provisionResults.errors) {
                container.logger.warn(`Plugin provision error (${e.pluginId}): ${e.error}`)
              }
            }
          }

          if (!options.dryRun) {
            const shadowobState = (mergedStates.shadowob ?? {}) as {
              servers?: Record<string, string>
              channels?: Record<string, string>
              buddies?: Record<string, { agentId: string; userId: string; token: string }>
              listings?: Record<string, string>
            }

            const serversCount = Object.keys(shadowobState.servers ?? {}).length
            const channelsCount = Object.keys(shadowobState.channels ?? {}).length
            const buddiesCount = Object.keys(shadowobState.buddies ?? {}).length
            container.logger.success(
              `Provisioned: ${serversCount} server(s), ${channelsCount} channel(s), ${buddiesCount} buddy/buddies`,
            )

            // Persist updated state
            if (Object.keys(mergedStates).length > 0) {
              const newState = {
                provisionedAt: new Date().toISOString(),
                namespace,
                plugins: mergedStates,
              }
              const merged = mergeProvisionState(existing, newState)
              const statePath = saveProvisionState(filePath, merged, options.stateDir)
              container.logger.success(`Provision state saved: ${statePath}`)
            }

            if (Object.keys(shadowobState.servers ?? {}).length > 0) {
              container.logger.info('Server IDs:')
              for (const [id, realId] of Object.entries(shadowobState.servers ?? {})) {
                container.logger.dim(`  ${id} → ${realId}`)
              }
            }
            if (Object.keys(shadowobState.channels ?? {}).length > 0) {
              container.logger.info('Channel IDs:')
              for (const [id, realId] of Object.entries(shadowobState.channels ?? {})) {
                container.logger.dim(`  ${id} → ${realId}`)
              }
            }
            if (Object.keys(shadowobState.buddies ?? {}).length > 0) {
              container.logger.info('Buddy agents:')
              for (const [id, info] of Object.entries(shadowobState.buddies ?? {})) {
                container.logger.dim(`  ${id} → agent: ${info.agentId}  user: ${info.userId}`)
              }
            }

            if (options.output) {
              const { writeFileSync } = await import('node:fs')
              const outData: Record<string, unknown> = {}
              for (const [id, info] of Object.entries(shadowobState.buddies ?? {})) {
                outData[id] = { agentId: info.agentId, token: info.token, userId: info.userId }
              }
              writeFileSync(
                resolve(options.output),
                `${JSON.stringify(outData, null, 2)}\n`,
                'utf-8',
              )
              container.logger.success(`Tokens also written to: ${options.output}`)
            }
          }
        } catch (err) {
          container.logger.error((err as Error).message)
          process.exit(1)
        }
      },
    )
}
