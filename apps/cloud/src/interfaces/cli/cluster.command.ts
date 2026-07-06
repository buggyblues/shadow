/**
 * CLI: shadowob-cloud cluster — manage bare-server k3s clusters.
 *
 * Sub-commands:
 *   cluster init     — bootstrap k3s on servers defined in cluster.json
 *   cluster apply    — apply cluster.json idempotently, adding newly listed nodes
 *   cluster status   — check SSH + k3s health on all nodes
 *   cluster list     — list all registered clusters
 *   cluster kubeconfig — print kubeconfig path for a cluster
 *   cluster destroy  — uninstall k3s and remove local files
 */

import chalk from 'chalk'
import { Command } from 'commander'
import { importKubeconfig } from '../../cluster/kubeconfig.js'
import { readClusterConfig } from '../../cluster/parser.js'
import type { ServiceContainer } from '../../services/container.js'

export function createClusterCommand(container: ServiceContainer) {
  const cluster = new Command('cluster').description(
    'Manage bare-server k3s clusters (init, apply, status, list, destroy)',
  )

  async function applyClusterConfig(options: { config: string; force?: boolean }) {
    const config = await readClusterConfig(options.config)
    container.logger.info(`Applying cluster "${config.name}" from ${options.config}...`)

    const meta = await container.cluster.init(
      config,
      (msg) => {
        container.logger.dim(msg)
      },
      options.force,
    )

    container.logger.success(`Cluster "${meta.name}" ready! Kubeconfig: ${meta.kubeconfigPath}`)
    container.logger.info(
      `Edit ${options.config} and run this command again to add newly listed nodes.`,
    )
    container.logger.info(`Deploy agents: shadowob-cloud up --cluster ${meta.name}`)
  }

  // ─── init ─────────────────────────────────────────────────────────────────
  cluster
    .command('init')
    .description('Bootstrap or update a k3s cluster on bare servers')
    .option('-c, --config <path>', 'Path to cluster.json', 'cluster.json')
    .option('--force', 'Reinstall k3s even if already installed on nodes')
    .action(async (options: { config: string; force?: boolean }) => {
      try {
        await applyClusterConfig(options)
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }
    })

  // ─── apply ────────────────────────────────────────────────────────────────
  cluster
    .command('apply')
    .description('Apply cluster.json idempotently and add newly listed nodes')
    .option('-c, --config <path>', 'Path to cluster.json', 'cluster.json')
    .option('--force', 'Reinstall k3s even if already installed on nodes')
    .action(async (options: { config: string; force?: boolean }) => {
      try {
        await applyClusterConfig(options)
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }
    })

  // ─── import ───────────────────────────────────────────────────────────────
  cluster
    .command('import')
    .description('Register an existing kubeconfig as a named cluster (for sharing across machines)')
    .requiredOption('-n, --name <name>', 'Cluster name to register as')
    .requiredOption('-f, --file <path>', 'Path to kubeconfig YAML file')
    .action(async (options: { name: string; file: string }) => {
      try {
        const meta = await importKubeconfig(options.name, options.file)
        container.logger.success(
          `Cluster "${meta.name}" registered. Kubeconfig: ${meta.kubeconfigPath}`,
        )
        container.logger.info(`Deploy agents: shadowob-cloud up --cluster ${meta.name}`)
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }
    })

  // ─── status ───────────────────────────────────────────────────────────────
  cluster
    .command('status')
    .description('Check SSH connectivity and k3s health on all nodes')
    .option('-c, --config <path>', 'Path to cluster.json', 'cluster.json')
    .action(async (options: { config: string }) => {
      try {
        const config = await readClusterConfig(options.config)
        const status = await container.cluster.status(config)

        console.log()
        console.log(chalk.bold(`Cluster: ${status.clusterName}`))
        console.log()

        for (const node of status.nodes) {
          const roleLabel = chalk.cyan(`[${node.role}]`.padEnd(10))
          const hostLabel = chalk.white(node.host.padEnd(20))

          if (!node.reachable) {
            console.log(
              `  ${roleLabel} ${hostLabel} ${chalk.red('✗ unreachable')}${node.error ? chalk.dim(` — ${node.error}`) : ''}`,
            )
          } else if (!node.k3sRunning) {
            console.log(
              `  ${roleLabel} ${hostLabel} ${chalk.yellow('⚠ reachable, k3s not running')}`,
            )
          } else {
            const version = node.k3sVersion ? chalk.dim(` (${node.k3sVersion})`) : ''
            console.log(`  ${roleLabel} ${hostLabel} ${chalk.green('✓ running')}${version}`)
          }
        }
        console.log()
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }
    })

  // ─── list ─────────────────────────────────────────────────────────────────
  cluster
    .command('list')
    .description('List all registered clusters')
    .action(async () => {
      try {
        const clusters = await container.cluster.listClusters()

        if (clusters.length === 0) {
          console.log(chalk.dim('No clusters registered yet.'))
          console.log(chalk.dim('Run: shadowob-cloud cluster init --config cluster.json'))
          return
        }

        console.log()
        console.log(chalk.bold('Registered clusters:'))
        console.log()
        for (const c of clusters) {
          console.log(
            `  ${chalk.cyan(c.name.padEnd(20))} ` +
              `master: ${chalk.white(c.masterHost.padEnd(18))} ` +
              `nodes: ${c.nodeCount}  ` +
              chalk.dim(`created: ${new Date(c.createdAt).toLocaleDateString()}`),
          )
          console.log(chalk.dim(`    kubeconfig: ${c.kubeconfigPath}`))
        }
        console.log()
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }
    })

  // ─── kubeconfig ───────────────────────────────────────────────────────────
  cluster
    .command('kubeconfig <name>')
    .description('Print the kubeconfig file path for a registered cluster')
    .action(async (name: string) => {
      try {
        const path = await container.cluster.resolveKubeconfig(name)
        console.log(path)
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }
    })

  // ─── destroy ──────────────────────────────────────────────────────────────
  cluster
    .command('destroy')
    .description('Uninstall k3s from all nodes and remove local cluster files')
    .option('-c, --config <path>', 'Path to cluster.json', 'cluster.json')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (options: { config: string; yes?: boolean }) => {
      try {
        const config = await readClusterConfig(options.config)

        if (!options.yes) {
          const readline = await import('node:readline')
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          })
          const confirmed = await new Promise<boolean>((resolve) => {
            rl.question(
              chalk.yellow(
                `Destroy cluster "${config.name}"? This uninstalls k3s from all ${config.nodes.length} nodes. [y/N] `,
              ),
              (answer) => {
                rl.close()
                resolve(answer.trim().toLowerCase() === 'y')
              },
            )
          })
          if (!confirmed) {
            console.log('Aborted.')
            return
          }
        }

        await container.cluster.destroy(config, (msg) => {
          container.logger.dim(msg)
        })

        container.logger.success(`Cluster "${config.name}" destroyed.`)
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }
    })

  return cluster
}
