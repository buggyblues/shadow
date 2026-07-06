/**
 * CLI: shadowob-cloud logs — view agent logs.
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

export function createLogsCommand(container: ServiceContainer) {
  return new Command('logs')
    .description('View agent logs')
    .argument('[agent]', 'Agent ID to view logs for')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .option('--follow', 'Follow log output')
    .option('--tail <lines>', 'Number of lines to show', '100')
    .action(
      async (
        agent: string | undefined,
        options: { file: string; namespace?: string; follow?: boolean; tail: string },
      ) => {
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

        const pods = await container.k8s.getPods(namespace)
        let targetPod: string | undefined

        if (agent) {
          const matching = pods.filter((p) => p.name.startsWith(agent))
          if (matching.length === 0) {
            container.logger.error(`No pods found for agent "${agent}"`)
            container.logger.dim(`Available pods: ${pods.map((p) => p.name).join(', ')}`)
            process.exit(1)
          }
          targetPod = matching[0]!.name
        } else if (pods.length === 1) {
          targetPod = pods[0]!.name
        } else if (pods.length > 1) {
          container.logger.error('Multiple pods found. Specify an agent:')
          for (const pod of pods) {
            container.logger.dim(`  - ${pod.name} (${pod.status})`)
          }
          process.exit(1)
        } else {
          container.logger.error('No pods found')
          process.exit(1)
        }

        container.logger.info(`Streaming logs from ${targetPod}...`)

        const child = container.k8s.streamLogs(namespace, targetPod, {
          follow: options.follow,
          tail: Number.parseInt(options.tail, 10),
        })

        process.on('SIGINT', () => {
          child.kill()
          process.exit(0)
        })
      },
    )
}
