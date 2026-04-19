/**
 * CLI: shadowob-cloud provision — manually provision Shadow resources.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'
import {
  loadProvisionState,
  mergeProvisionState,
  provisionResultToState,
  saveProvisionState,
} from '../../utils/state.js'

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
          const existing = loadProvisionState(filePath, options.stateDir)

          const result = await container.provision.provision(config, {
            serverUrl: shadowUrl,
            userToken: shadowToken,
            dryRun: options.dryRun,
            force: options.force,
            existingState: existing?.plugins?.shadowob ?? null,
          })

          if (!options.dryRun) {
            container.logger.success(
              `Provisioned: ${result.servers.size} server(s), ` +
                `${result.channels.size} channel(s), ` +
                `${result.buddies.size} buddy/buddies`,
            )

            const newState = provisionResultToState(result, shadowUrl)
            const merged = mergeProvisionState(existing, newState)
            const statePath = saveProvisionState(filePath, merged, options.stateDir)
            container.logger.success(`Provision state saved: ${statePath}`)

            if (result.servers.size > 0) {
              container.logger.info('Server IDs:')
              for (const [id, realId] of result.servers) {
                container.logger.dim(`  ${id} → ${realId}`)
              }
            }
            if (result.channels.size > 0) {
              container.logger.info('Channel IDs:')
              for (const [id, realId] of result.channels) {
                container.logger.dim(`  ${id} → ${realId}`)
              }
            }
            if (result.buddies.size > 0) {
              container.logger.info('Buddy agents:')
              for (const [id, info] of result.buddies) {
                container.logger.dim(`  ${id} → agent: ${info.agentId}  user: ${info.userId}`)
              }
            }

            if (options.output) {
              const { writeFileSync } = await import('node:fs')
              const outData: Record<string, unknown> = {}
              for (const [id, info] of result.buddies) {
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
