/**
 * CLI: shadowob-cloud sandbox — manage agent-sandbox workloads.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

async function resolveNamespace(
  container: ServiceContainer,
  options: { file?: string; namespace?: string },
): Promise<string> {
  if (options.namespace) return options.namespace

  const filePath = resolve(options.file ?? 'shadowob-cloud.json')
  if (existsSync(filePath)) {
    try {
      const config = await container.config.parseFile(filePath)
      return config.deployments?.namespace ?? 'shadowob-cloud'
    } catch {
      // Ignore and fall back to the default namespace.
    }
  }

  return 'shadowob-cloud'
}

function statePvcFor(agent: string, pvcName?: string): string {
  return pvcName ?? `openclaw-data-${agent}`
}

export function createSandboxCommand(container: ServiceContainer) {
  const sandbox = new Command('sandbox').description(
    'Manage agent-sandbox workloads (pause, resume, backup, restore)',
  )

  sandbox
    .command('status')
    .description('Show agent-sandbox workload status')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .action(async (options: { file: string; namespace?: string }) => {
      const namespace = await resolveNamespace(container, options)
      const workloads = container.k8s
        .getDeployments(namespace)
        .filter((workload) => workload.workloadKind === 'agent-sandbox')

      if (workloads.length === 0) {
        container.logger.warn(`No agent-sandbox workloads found in namespace "${namespace}"`)
        return
      }

      container.logger.table(
        workloads.map((workload) => ({
          NAME: workload.name,
          STATE: workload.runtimeState ?? 'unknown',
          READY: String(workload.ready),
          SANDBOX: workload.sandboxName ?? '—',
          'STATE PVC': workload.statePvc ?? '—',
        })),
      )
    })

  sandbox
    .command('pause')
    .description('Pause an agent-sandbox workload by scaling its Sandbox to 0')
    .argument('<agent>', 'Agent ID')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .action(async (agent: string, options: { file: string; namespace?: string }) => {
      const namespace = await resolveNamespace(container, options)
      try {
        container.k8s.pauseAgentSandbox(namespace, agent)
        container.logger.success(`Paused "${agent}" in namespace "${namespace}"`)
      } catch (err) {
        container.logger.error(`Failed to pause: ${(err as Error).message}`)
        process.exit(1)
      }
    })

  sandbox
    .command('resume')
    .description('Resume an agent-sandbox workload by scaling its Sandbox to 1')
    .argument('<agent>', 'Agent ID')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .action(async (agent: string, options: { file: string; namespace?: string }) => {
      const namespace = await resolveNamespace(container, options)
      try {
        container.k8s.resumeAgentSandbox(namespace, agent)
        container.logger.success(`Resuming "${agent}" in namespace "${namespace}"`)
      } catch (err) {
        container.logger.error(`Failed to resume: ${(err as Error).message}`)
        process.exit(1)
      }
    })

  sandbox
    .command('backup')
    .description('Create a VolumeSnapshot backup for an agent-sandbox state PVC')
    .argument('<agent>', 'Agent ID')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .option('--driver <driver>', 'Backup driver: volumeSnapshot or restic', 'volumeSnapshot')
    .option('--pvc <name>', 'State PVC name (default: openclaw-data-<agent>)')
    .option('--snapshot <name>', 'VolumeSnapshot name')
    .option('--snapshot-class <name>', 'VolumeSnapshotClass name')
    .action(
      async (
        agent: string,
        options: {
          file: string
          namespace?: string
          driver?: string
          pvc?: string
          snapshot?: string
          snapshotClass?: string
        },
      ) => {
        const namespace = await resolveNamespace(container, options)
        if (options.driver && options.driver !== 'volumeSnapshot') {
          container.logger.error('Only the volumeSnapshot backup driver is wired in the CLI today')
          process.exit(1)
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const snapshotName = options.snapshot ?? `${agent}-${stamp}`
        try {
          container.k8s.createVolumeSnapshotBackup({
            namespace,
            snapshotName,
            pvcName: statePvcFor(agent, options.pvc),
            volumeSnapshotClassName: options.snapshotClass,
          })
          container.logger.success(
            `Created VolumeSnapshot "${snapshotName}" for "${agent}" in namespace "${namespace}"`,
          )
        } catch (err) {
          container.logger.error(`Failed to create backup: ${(err as Error).message}`)
          process.exit(1)
        }
      },
    )

  sandbox
    .command('restore')
    .description('Resume a sandbox after external PVC restore has completed')
    .argument('<agent>', 'Agent ID')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .option('--backup-id <id>', 'Backup record ID to restore from after PVC restore is prepared')
    .action(
      async (agent: string, options: { file: string; namespace?: string; backupId?: string }) => {
        const namespace = await resolveNamespace(container, options)
        try {
          if (options.backupId) {
            container.logger.info(
              `Using backup record "${options.backupId}" as the external restore handoff marker`,
            )
          }
          container.k8s.resumeAgentSandbox(namespace, agent)
          container.logger.success(
            `Restore handoff complete. Resuming "${agent}" in namespace "${namespace}"`,
          )
        } catch (err) {
          container.logger.error(`Failed to restore: ${(err as Error).message}`)
          process.exit(1)
        }
      },
    )

  return sandbox
}
