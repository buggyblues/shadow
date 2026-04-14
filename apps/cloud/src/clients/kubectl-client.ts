/**
 * kubectl operational commands — deployments, pods, logs, scaling.
 *
 * All functions shell out to `kubectl` for runtime cluster operations
 * (as opposed to Pulumi which handles declarative infrastructure).
 */

import { execSync, spawn, spawnSync } from 'node:child_process'

export interface PodStatus {
  name: string
  ready: string
  status: string
  restarts: string
  age: string
}

export interface DeploymentStatus {
  name: string
  ready: string
  upToDate: string
  available: string
  age: string
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

function runKubectl(args: string[], namespace?: string): string {
  const nsArgs = namespace ? ['--namespace', namespace] : []
  const cmd = ['kubectl', ...nsArgs, ...args].join(' ')
  return execSync(cmd, { encoding: 'utf-8', timeout: 30_000 }).trim()
}

export function getDeployments(namespace: string): DeploymentStatus[] {
  try {
    const output = runKubectl(['get', 'deployments', '-o', 'json'], namespace)
    const data = JSON.parse(output)
    return (data.items ?? []).map((item: Record<string, unknown>) => {
      const status = item.status as Record<string, unknown>
      const meta = item.metadata as Record<string, unknown>
      return {
        name: meta.name as string,
        ready: `${status.readyReplicas ?? 0}/${status.replicas ?? 0}`,
        upToDate: String(status.updatedReplicas ?? 0),
        available: String(status.availableReplicas ?? 0),
        age: meta.creationTimestamp as string,
      }
    })
  } catch {
    return []
  }
}

export function getPods(namespace: string): PodStatus[] {
  try {
    const output = runKubectl(['get', 'pods', '-o', 'json'], namespace)
    const data = JSON.parse(output)
    return (data.items ?? []).map((item: Record<string, unknown>) => {
      const status = item.status as Record<string, unknown>
      const meta = item.metadata as Record<string, unknown>
      const containers = (status.containerStatuses ?? []) as Array<Record<string, unknown>>
      const totalRestarts = containers.reduce(
        (sum: number, c: Record<string, unknown>) => sum + ((c.restartCount as number) ?? 0),
        0,
      )
      const readyCount = containers.filter((c: Record<string, unknown>) => c.ready).length
      return {
        name: meta.name as string,
        ready: `${readyCount}/${containers.length}`,
        status: status.phase as string,
        restarts: String(totalRestarts),
        age: meta.creationTimestamp as string,
      }
    })
  } catch {
    return []
  }
}

export function streamLogs(
  namespace: string,
  podName: string,
  options: { follow?: boolean; tail?: number } = {},
): ReturnType<typeof spawn> {
  const args = ['logs', podName, '--namespace', namespace]
  if (options.follow) args.push('--follow')
  if (options.tail !== undefined) args.push(`--tail=${options.tail}`)
  return spawn('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
}

export function readLogs(
  namespace: string,
  podName: string,
  options: { tail?: number; timestamps?: boolean } = {},
): string {
  const args = ['logs', podName]
  if (options.timestamps ?? true) args.push('--timestamps')
  if (options.tail !== undefined) args.push(`--tail=${options.tail}`)
  return runKubectl(args, namespace)
}

export function execInPod(
  namespace: string,
  podName: string,
  command: string[],
  options: { timeout?: number } = {},
): CommandResult {
  const args = ['exec', '--namespace', namespace, podName, '--', ...command]
  const result = spawnSync('kubectl', args, {
    encoding: 'utf-8',
    timeout: options.timeout ?? 30_000,
  })

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  }
}

export function scaleDeployment(namespace: string, deploymentName: string, replicas: number): void {
  runKubectl(['scale', 'deployment', deploymentName, `--replicas=${replicas}`], namespace)
}

/**
 * List all namespaces managed by shadowob-cloud (by label) plus any extra
 * namespaces that contain active deployments.
 */
export function getManagedNamespaces(): string[] {
  try {
    const output = runKubectl([
      'get',
      'namespaces',
      '-l',
      'managed-by=shadowob-cloud-cli',
      '-o',
      'jsonpath={.items[*].metadata.name}',
    ])
    return output
      .split(/\s+/)
      .map((ns) => ns.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Delete a namespace and all its resources.
 * Uses --ignore-not-found so it won't error if the namespace is already gone.
 */
export function deleteNamespace(namespace: string): void {
  runKubectl(['delete', 'namespace', namespace, '--ignore-not-found'])
}

/**
 * Rollout restart all deployments in a namespace.
 * This triggers a rolling update of all pods.
 */
export function rolloutRestartAll(namespace: string): void {
  runKubectl(['rollout', 'restart', 'deployment', '--all'], namespace)
}

/**
 * Rollout undo (rollback) all deployments in a namespace to the previous revision.
 */
export function rolloutUndoAll(namespace: string): void {
  const output = runKubectl(
    ['get', 'deployments', '-o', 'jsonpath={.items[*].metadata.name}'],
    namespace,
  )
  const names = output.split(/\s+/).filter(Boolean)
  for (const name of names) {
    runKubectl(['rollout', 'undo', `deployment/${name}`], namespace)
  }
}
