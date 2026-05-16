/**
 * Cluster destroy — uninstall k3s from all nodes via SSH.
 */

import { removeClusterFiles } from './kubeconfig.js'
import { resolveNodeCredentials } from './parser.js'
import type { ClusterConfig, NodeConfig } from './schema.js'
import { SSHClient } from './ssh.js'

export interface DestroyClusterOptions {
  config: ClusterConfig
  onLog?: (msg: string) => void
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function asRoot(shellCommand: string): string {
  const quoted = shellQuote(shellCommand)
  return `if [ "$(id -u)" -eq 0 ]; then sh -c ${quoted}; else sudo -n sh -c ${quoted}; fi`
}

async function uninstallNode(node: NodeConfig, onLog?: (m: string) => void): Promise<void> {
  const creds = resolveNodeCredentials(node)
  const client = new SSHClient()
  onLog?.(`[${node.role} ${creds.host}] Connecting...`)

  try {
    await client.connect(creds)

    const script =
      node.role === 'master'
        ? asRoot(
            'if [ -f /usr/local/bin/k3s-uninstall.sh ]; then /usr/local/bin/k3s-uninstall.sh; fi',
          )
        : asRoot(
            'if [ -f /usr/local/bin/k3s-agent-uninstall.sh ]; then /usr/local/bin/k3s-agent-uninstall.sh; fi',
          )

    onLog?.(`[${node.role} ${creds.host}] Uninstalling k3s...`)
    const result = await client.exec(script, {
      onStdout: (c) => onLog?.(`[${node.role} ${creds.host}] ${c.trimEnd()}`),
      onStderr: (c) => onLog?.(`[${node.role} ${creds.host}] ${c.trimEnd()}`),
    })

    if (result.code !== 0) {
      onLog?.(`[${node.role} ${creds.host}] Warning: uninstall script exited ${result.code}`)
    } else {
      onLog?.(`[${node.role} ${creds.host}] k3s uninstalled \u2713`)
    }
  } catch (err) {
    onLog?.(`[${node.role} ${creds.host}] Error: ${(err as Error).message}`)
  } finally {
    await client.dispose()
  }
}

/**
 * Uninstall k3s from all nodes and remove local kubeconfig/metadata.
 */
export async function destroyCluster(options: DestroyClusterOptions): Promise<void> {
  const { config, onLog } = options

  onLog?.(`Destroying cluster "${config.name}"...`)

  await Promise.all(config.nodes.map((node) => uninstallNode(node, onLog)))

  removeClusterFiles(config.name)
  onLog?.(`Cluster "${config.name}" destroyed and local files removed.`)
}
