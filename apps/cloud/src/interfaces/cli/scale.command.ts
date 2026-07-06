/**
 * CLI: shadowob-cloud scale — adjust agent replicas.
 */

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export function createScaleCommand(container: ServiceContainer) {
  return new Command('scale')
    .description('Scale agent deployment replicas')
    .argument('<agent>', 'Agent ID to scale')
    .option('-r, --replicas <count>', 'Number of replicas', '1')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .action(
      async (agent: string, options: { replicas: string; file: string; namespace?: string }) => {
        let namespace = options.namespace

        if (!namespace) {
          const filePath = resolve(options.file)
          if (await pathExists(filePath)) {
            try {
              const config = await container.config.parseFile(filePath)
              namespace = config.deployments?.namespace
            } catch {
              // Ignore
            }
          }
        }

        namespace = namespace ?? 'shadowob-cloud'
        const replicas = Number.parseInt(options.replicas, 10)

        if (Number.isNaN(replicas) || replicas < 0) {
          container.logger.error('Invalid replicas count')
          process.exit(1)
        }

        container.logger.step(`Scaling "${agent}" to ${replicas} replica(s)...`)

        try {
          await container.k8s.scaleDeployment(namespace, agent, replicas)
          container.logger.success(`Scaled "${agent}" to ${replicas} replica(s)`)
        } catch (err) {
          container.logger.error(`Failed to scale: ${(err as Error).message}`)
          process.exit(1)
        }
      },
    )
}
