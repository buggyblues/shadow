/**
 * CLI: shadowob-cloud status — show agent cluster status.
 */

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'
import { formatProvisionState, loadProvisionState } from '../../utils/state.js'

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export function createStatusCommand(container: ServiceContainer) {
  return new Command('status')
    .description('Show agent cluster status')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .option('-s, --stack <name>', 'Pulumi stack name', 'dev')
    .option('--pods', 'Show pod-level details')
    .option('--outputs', 'Show Pulumi stack outputs (service IPs)')
    .option('--resources', 'Show provisioned Shadow resource IDs')
    .option('--state-dir <dir>', 'Subdirectory for provision state (default: .shadowob)')
    .action(
      async (options: {
        file: string
        namespace?: string
        stack: string
        pods?: boolean
        outputs?: boolean
        resources?: boolean
        stateDir?: string
      }) => {
        let namespace = options.namespace
        let config: Awaited<ReturnType<typeof container.config.parseFile>> | undefined
        const filePath = resolve(options.file)

        if (await pathExists(filePath)) {
          try {
            config = await container.config.parseFile(filePath)
            namespace = namespace ?? config.deployments?.namespace
          } catch {
            // Ignore
          }
        }

        namespace = namespace ?? 'shadowob-cloud'

        container.logger.info(`Agent cluster status (${namespace})`)

        const deployments = await container.k8s.getDeployments(namespace)
        if (deployments.length === 0) {
          container.logger.warn(
            'No deployments found in namespace — has `shadowob-cloud up` been run?',
          )
        } else {
          container.logger.table(
            deployments.map((d) => ({
              NAME: d.name,
              WORKLOAD: d.workloadKind ?? 'deployment',
              STATE: d.runtimeState ?? 'unknown',
              READY: d.ready,
              'UP-TO-DATE': d.upToDate,
              AVAILABLE: d.available,
              SANDBOX: d.sandboxName ?? '—',
              'STATE PVC': d.statePvc ?? '—',
            })),
          )
        }

        if (options.pods) {
          console.log()
          container.logger.info('Pods:')
          const pods = await container.k8s.getPods(namespace)
          if (pods.length === 0) {
            container.logger.warn('No pods found')
          } else {
            container.logger.table(
              pods.map((p) => ({
                NAME: p.name,
                READY: p.ready,
                STATUS: p.status,
                RESTARTS: p.restarts,
              })),
            )
          }
        }

        if (options.outputs && config) {
          console.log()
          container.logger.info('Stack outputs:')
          try {
            const stack = await container.k8s.getOrCreateStack({
              stackName: options.stack,
              config,
              namespace,
            })
            const outputs = await container.k8s.getStackOutputs(stack)
            if (Object.keys(outputs).length === 0) {
              container.logger.dim('  (no outputs)')
            }
            for (const [key, output] of Object.entries(outputs)) {
              container.logger.dim(`  ${key}: ${output.value}`)
            }
          } catch (err) {
            container.logger.error(`Failed to read stack outputs: ${(err as Error).message}`)
          }
        }

        if (options.resources) {
          console.log()
          container.logger.info('Provisioned resources:')
          const state = await loadProvisionState(filePath, options.stateDir)
          if (state) {
            console.log(formatProvisionState(state))
          } else {
            container.logger.dim('  No provision state found')
          }
        }
      },
    )
}
