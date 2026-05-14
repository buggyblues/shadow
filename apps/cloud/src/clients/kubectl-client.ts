/**
 * kubectl operational commands — deployments, pods, logs, scaling.
 *
 * All functions shell out to `kubectl` for runtime cluster operations
 * (as opposed to Pulumi which handles declarative infrastructure).
 */

import { execSync, spawn, spawnSync } from 'node:child_process'
import { runtimeStatePvcName } from '../runtimes/container.js'

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
  workloadKind?: 'deployment' | 'agent-sandbox'
  runtimeState?: 'running' | 'paused' | 'resuming' | 'failed' | 'unknown'
  sandboxName?: string
  serviceFQDN?: string
  statePvc?: string
  pausedAt?: string
  lastActiveAt?: string
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

function applyManifest(namespace: string, manifest: Record<string, unknown>): void {
  const result = spawnSync('kubectl', ['--namespace', namespace, 'apply', '-f', '-'], {
    input: JSON.stringify(manifest),
    encoding: 'utf-8',
    timeout: 30_000,
  })
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || result.stdout || 'kubectl apply failed')
  }
}

function volumeSnapshotApiAvailableFromOutput(output: string): boolean {
  return output
    .split(/\s+/)
    .map((item) => item.trim())
    .some(
      (resource) =>
        resource === 'volumesnapshots' || resource === 'volumesnapshots.snapshot.storage.k8s.io',
    )
}

export function isVolumeSnapshotApiAvailable(): boolean {
  const output = runKubectl([
    'api-resources',
    '--api-group',
    'snapshot.storage.k8s.io',
    '-o',
    'name',
  ])
  return volumeSnapshotApiAvailableFromOutput(output)
}

export function getDeployments(namespace: string): DeploymentStatus[] {
  const workloads: DeploymentStatus[] = []
  try {
    const output = runKubectl(['get', 'deployments', '-o', 'json'], namespace)
    const data = JSON.parse(output)
    workloads.push(
      ...(data.items ?? []).map((item: Record<string, unknown>) => {
        const status = item.status as Record<string, unknown>
        const meta = item.metadata as Record<string, unknown>
        return {
          name: meta.name as string,
          ready: `${status.readyReplicas ?? 0}/${status.replicas ?? 0}`,
          upToDate: String(status.updatedReplicas ?? 0),
          available: String(status.availableReplicas ?? 0),
          age: meta.creationTimestamp as string,
          workloadKind: 'deployment' as const,
          runtimeState: (status.availableReplicas as number | undefined) ? 'running' : 'unknown',
        }
      }),
    )
  } catch {
    // continue; the namespace may only contain agent-sandbox workloads
  }
  workloads.push(...getAgentSandboxDeployments(namespace))
  return workloads
}

function conditionStatus(
  conditions: Array<Record<string, unknown>> | undefined,
  type: string,
): string | undefined {
  return conditions?.find((condition) => condition.type === type)?.status as string | undefined
}

function sandboxNameFromStatusRef(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  if (!value || typeof value !== 'object') return undefined
  const name = (value as { name?: unknown }).name
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

export function getAgentSandboxDeployments(namespace: string): DeploymentStatus[] {
  try {
    const claimsOutput = runKubectl(['get', 'sandboxclaims', '-o', 'json'], namespace)
    const claims = JSON.parse(claimsOutput)
    const sandboxesByName = new Map<string, Record<string, unknown>>()
    try {
      const sandboxesOutput = runKubectl(['get', 'sandboxes', '-o', 'json'], namespace)
      const sandboxes = JSON.parse(sandboxesOutput)
      for (const sandbox of sandboxes.items ?? []) {
        const meta = sandbox.metadata as Record<string, unknown>
        sandboxesByName.set(meta.name as string, sandbox)
      }
    } catch {
      // The claim status still gives useful information when sandbox listing fails.
    }

    return (claims.items ?? []).map((claim: Record<string, unknown>) => {
      const meta = claim.metadata as Record<string, unknown>
      const annotations = (meta.annotations ?? {}) as Record<string, string>
      const status = (claim.status ?? {}) as Record<string, unknown>
      const spec = (claim.spec ?? {}) as Record<string, unknown>
      const sandboxName =
        sandboxNameFromStatusRef(status.sandboxName) ??
        sandboxNameFromStatusRef(status.sandbox) ??
        (annotations['agents.x-k8s.io/sandbox'] as string | undefined) ??
        (meta.name as string)
      const sandbox = sandboxesByName.get(sandboxName)
      const sandboxStatus = (sandbox?.status ?? {}) as Record<string, unknown>
      const sandboxSpec = (sandbox?.spec ?? {}) as Record<string, unknown>
      const desiredReplicas =
        (sandboxSpec.replicas as number | undefined) ?? (spec.replicas as number | undefined) ?? 1
      const observedReplicas =
        (sandboxStatus.replicas as number | undefined) ??
        (status.replicas as number | undefined) ??
        desiredReplicas
      const ready =
        conditionStatus(
          sandboxStatus.conditions as Array<Record<string, unknown>> | undefined,
          'Ready',
        ) ??
        conditionStatus(status.conditions as Array<Record<string, unknown>> | undefined, 'Ready')
      const runtimeState =
        desiredReplicas === 0 || observedReplicas === 0
          ? 'paused'
          : ready === 'True'
            ? 'running'
            : ready === 'False'
              ? 'resuming'
              : 'unknown'

      return {
        name: meta.name as string,
        ready: `${runtimeState === 'running' ? 1 : 0}/${desiredReplicas}`,
        upToDate: String(observedReplicas),
        available: runtimeState === 'running' ? '1' : '0',
        age: meta.creationTimestamp as string,
        workloadKind: 'agent-sandbox',
        runtimeState,
        sandboxName,
        serviceFQDN:
          (sandboxStatus.serviceFQDN as string | undefined) ??
          (status.serviceFQDN as string | undefined) ??
          `${sandboxName}.${namespace}.svc.cluster.local`,
        statePvc: annotations['shadowob.cloud/state-pvc'] ?? runtimeStatePvcName(sandboxName),
      } satisfies DeploymentStatus
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
  try {
    runKubectl(['get', 'deployment', deploymentName, '-o', 'name'], namespace)
    runKubectl(['scale', 'deployment', deploymentName, `--replicas=${replicas}`], namespace)
    return
  } catch {
    // fall through to agent-sandbox
  }
  scaleAgentSandbox(namespace, deploymentName, replicas)
}

export function resolveSandboxName(namespace: string, agentName: string): string {
  try {
    const output = runKubectl(['get', 'sandboxclaim', agentName, '-o', 'json'], namespace)
    const claim = JSON.parse(output)
    const status = (claim.status ?? {}) as Record<string, unknown>
    const annotations = ((claim.metadata as Record<string, unknown>).annotations ?? {}) as Record<
      string,
      string
    >
    return (
      sandboxNameFromStatusRef(status.sandboxName) ??
      sandboxNameFromStatusRef(status.sandbox) ??
      annotations['agents.x-k8s.io/sandbox'] ??
      agentName
    )
  } catch {
    return agentName
  }
}

export function scaleAgentSandbox(namespace: string, agentName: string, replicas: number): void {
  if (replicas !== 0 && replicas !== 1) {
    throw new Error('agent-sandbox workloads support only replicas=0 or replicas=1')
  }
  const sandboxName = resolveSandboxName(namespace, agentName)
  runKubectl(
    ['patch', 'sandbox', sandboxName, '--type=merge', '-p', JSON.stringify({ spec: { replicas } })],
    namespace,
  )
}

export function pauseAgentSandbox(namespace: string, agentName: string): void {
  scaleAgentSandbox(namespace, agentName, 0)
}

export function resumeAgentSandbox(namespace: string, agentName: string): void {
  scaleAgentSandbox(namespace, agentName, 1)
}

export function createVolumeSnapshotBackup(options: {
  namespace: string
  snapshotName: string
  pvcName: string
  volumeSnapshotClassName?: string
}): void {
  if (!isVolumeSnapshotApiAvailable()) {
    throw new Error(
      'VolumeSnapshot API is not available on this cluster. Install the CSI snapshot CRDs/controller or use a restic/kopia backup driver.',
    )
  }

  applyManifest(options.namespace, {
    apiVersion: 'snapshot.storage.k8s.io/v1',
    kind: 'VolumeSnapshot',
    metadata: {
      name: options.snapshotName,
      namespace: options.namespace,
      labels: {
        app: 'shadowob-cloud',
        'shadowob.cloud/backup-driver': 'volumeSnapshot',
      },
    },
    spec: {
      source: { persistentVolumeClaimName: options.pvcName },
      ...(options.volumeSnapshotClassName
        ? { volumeSnapshotClassName: options.volumeSnapshotClassName }
        : {}),
    },
  })
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
