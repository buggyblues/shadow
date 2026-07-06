/**
 * CLI: shadowob-cloud down — destroy agent cluster from Kubernetes.
 */

import { spawn } from 'node:child_process'
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

function runInheritedCommand(command: string, args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' })
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${timeout}ms`))
    }, timeout)
    proc.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 1}`))
    })
  })
}

export function createDownCommand(container: ServiceContainer) {
  return new Command('down')
    .description('Destroy agent cluster from Kubernetes')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('-n, --namespace <ns>', 'Kubernetes namespace')
    .option('-s, --stack <name>', 'Pulumi stack name', 'dev')
    .option('--k8s-context <ctx>', 'kubectl context')
    .option('--yes', 'Skip confirmation prompts')
    .action(
      async (options: {
        file: string
        namespace?: string
        stack: string
        k8sContext?: string
        yes?: boolean
      }) => {
        const filePath = resolve(options.file)
        let namespace = options.namespace
        let config: Awaited<ReturnType<typeof container.config.parseFile>> | undefined

        if (await pathExists(filePath)) {
          try {
            config = await container.config.parseFile(filePath)
            namespace = namespace ?? config.deployments?.namespace
          } catch {
            // Ignore
          }
        }

        namespace = namespace ?? 'shadowob-cloud'

        if (!options.yes) {
          container.logger.warn(
            `This will destroy all shadowob-cloud resources in namespace "${namespace}"`,
          )
          const readline = await import('node:readline')
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          })
          const answer = await new Promise<string>((r) =>
            rl.question('Continue? (y/N) ', (a) => {
              rl.close()
              r(a)
            }),
          )
          if (answer.toLowerCase() !== 'y') {
            container.logger.dim('Aborted')
            process.exit(0)
          }
        }

        try {
          await container.deploy.destroy({
            filePath,
            namespace,
            stack: options.stack,
            k8sContext: options.k8sContext,
            config,
          })
        } catch (err) {
          // Fall back to kubectl delete namespace
          const msg = (err as Error).message ?? ''
          if (
            msg.includes('no such file') ||
            msg.includes('no stack named') ||
            msg.includes('not found')
          ) {
            if (!namespace.startsWith('shadowob-')) {
              container.logger.error(
                `Refusing kubectl fallback: namespace "${namespace}" does not start with "shadowob-". ` +
                  'Delete it manually if intended.',
              )
              process.exit(1)
            }
            container.logger.dim(
              'No Pulumi state found, falling back to kubectl delete namespace...',
            )
            try {
              await runInheritedCommand(
                'kubectl',
                ['delete', 'namespace', namespace, '--ignore-not-found'],
                60_000,
              )
              container.logger.success(`Namespace "${namespace}" deleted`)
            } catch (kubectlErr) {
              container.logger.error(`Failed to delete namespace: ${(kubectlErr as Error).message}`)
              process.exit(1)
            }
          } else {
            container.logger.error(`Destroy failed: ${msg}`)
            process.exit(1)
          }
        }
      },
    )
}
