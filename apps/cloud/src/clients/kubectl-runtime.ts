/**
 * Runtime kubectl helper set used by SaaS orchestration and APIs.
 *
 * This module supports both explicit kubeconfig content and ambient kubeconfig
 * discovery from process env / local defaults. It also rewrites localhost
 * kubeconfig endpoints for containerized runtime access where needed.
 */
import { spawn } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { rewriteLoopbackKubeconfig } from '../services/deployment-runtime.service.js'
import {
  defaultKubeconfigPath,
  findReadableKubeconfigPath,
  readKubeconfigFile,
} from '../utils/kubeconfig-file.js'

export interface K8sPodSummary {
  name: string
  ready: string
  status: string
  restarts: number
  age: string
  containers: string[]
  deploymentId?: string
}

export interface ManagedNamespaceSummary {
  name: string
  labels: Record<string, string>
  annotations: Record<string, string>
}

export interface K8sExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export type AgentSandboxRuntimeState = 'running' | 'paused' | 'resuming' | 'failed' | 'unknown'

export interface AgentSandboxStatus {
  name: string
  sandboxName: string
  replicas: number
  ready: boolean
  runtimeState: AgentSandboxRuntimeState
  workloadKind?: 'Sandbox' | 'Deployment'
}

export interface VolumeSnapshotReadyStatus {
  ready: boolean
  error?: string
}

export interface AgentSandboxPreflightResult {
  ok: boolean
  missing: string[]
  warnings: string[]
  runtimeClassName?: string
  runtimeClassNames?: string[]
}

type PodReadyState = 'absent' | 'terminating' | 'ready' | 'not-ready'

function volumeSnapshotApiAvailableFromOutput(output: string): boolean {
  return output
    .split(/\s+/)
    .map((item) => item.trim())
    .some(
      (resource) =>
        resource === 'volumesnapshots' || resource === 'volumesnapshots.snapshot.storage.k8s.io',
    )
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function isContainerizedRuntime(): Promise<boolean> {
  return process.env.SHADOWOB_CONTAINERIZED === '1' || (await pathExists('/.dockerenv'))
}

async function getHostLocalKubeconfigPaths(): Promise<string[]> {
  const candidates = [process.env.KUBECONFIG_HOST_PATH?.trim()]

  if (!(await isContainerizedRuntime())) {
    candidates.push(
      ...(process.env.KUBECONFIG?.split(delimiter)
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length > 0) ?? []),
      defaultKubeconfigPath(),
    )
  }

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

async function isHostLocalKubeconfigPath(candidate: string | undefined): Promise<boolean> {
  if (!candidate) return false
  return (await getHostLocalKubeconfigPaths()).includes(candidate)
}

function extractCurrentContext(kubeconfigYaml: string): string | undefined {
  return kubeconfigYaml.match(/current-context:\s*(\S+)/)?.[1]
}

async function resolveAmbientKubeconfig(): Promise<
  | {
      kubeconfig: string
      shouldRewriteLoopback: boolean
    }
  | undefined
> {
  const envCandidates =
    process.env.KUBECONFIG?.split(delimiter)
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0) ?? []

  const candidates = [
    ...envCandidates,
    process.env.KUBECONFIG_HOST_PATH?.trim(),
    defaultKubeconfigPath(),
  ].filter((candidate): candidate is string => Boolean(candidate))

  const kubeconfigPath = await findReadableKubeconfigPath(
    candidates,
    'Kubernetes kubectl kubeconfig',
  )
  if (!kubeconfigPath) {
    return undefined
  }

  return {
    kubeconfig: await readKubeconfigFile(kubeconfigPath, 'Kubernetes kubectl kubeconfig'),
    shouldRewriteLoopback: !(await isHostLocalKubeconfigPath(kubeconfigPath)),
  }
}

async function createTempKubeconfig(
  kubeconfig: string,
  includeAmbientContext = false,
  rewriteLoopback = true,
): Promise<{
  args: string[]
  cleanup: () => Promise<void>
}> {
  const dir = await mkdtemp(join(tmpdir(), 'sc-saas-kube-'))
  const path = join(dir, 'kubeconfig')
  const rewritten = rewriteLoopback
    ? rewriteLoopbackKubeconfig(kubeconfig, process.env.KUBECONFIG_LOOPBACK_HOST)
    : kubeconfig
  await writeFile(path, rewritten, { mode: 0o600 })

  const args = ['--kubeconfig', path]
  if (
    includeAmbientContext &&
    !extractCurrentContext(rewritten) &&
    process.env.KUBECONFIG_CONTEXT?.trim()
  ) {
    args.push('--context', process.env.KUBECONFIG_CONTEXT.trim())
  }

  return {
    args,
    cleanup: async () => {
      try {
        await rm(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    },
  }
}

async function withKubeconfigAsync<T>(
  kubeconfig: string | undefined,
  fn: (kubeArgs: string[]) => Promise<T>,
): Promise<T> {
  const explicitKubeconfig = kubeconfig?.trim() ? kubeconfig : undefined
  const ambientKubeconfig = explicitKubeconfig ? undefined : await resolveAmbientKubeconfig()
  const effectiveKubeconfig = explicitKubeconfig ?? ambientKubeconfig?.kubeconfig
  if (!effectiveKubeconfig) {
    return fn([])
  }

  const { args, cleanup } = await createTempKubeconfig(
    effectiveKubeconfig,
    !explicitKubeconfig,
    explicitKubeconfig ? true : (ambientKubeconfig?.shouldRewriteLoopback ?? true),
  )
  try {
    return await fn(args)
  } finally {
    await cleanup()
  }
}

async function tryExecKubectl(args: string[], kubeconfig?: string, timeout = 5_000) {
  try {
    return await execKubectlAsync(args, kubeconfig, timeout)
  } catch {
    return null
  }
}

function resourceOutputHas(output: string | null, resourceName: string): boolean {
  return Boolean(
    output
      ?.split(/\s+/)
      .map((item) => item.trim())
      .some((item) => item === resourceName || item.startsWith(`${resourceName}.`)),
  )
}

async function apiResourceOrCrdExists(
  output: string | null,
  resourceName: string,
  crdName: string,
  kubeconfig?: string,
): Promise<boolean> {
  return (
    resourceOutputHas(output, resourceName) ||
    Boolean(await tryExecKubectl(['get', 'crd', crdName], kubeconfig))
  )
}

export async function checkAgentSandboxPreflight(options?: {
  kubeconfig?: string
  runtimeClassName?: string
  runtimeClassNames?: string[]
}): Promise<AgentSandboxPreflightResult> {
  const missing: string[] = []
  const warnings: string[] = []
  const kubeconfig = options?.kubeconfig

  const extensionResources = await tryExecKubectl(
    ['api-resources', '--api-group', 'extensions.agents.x-k8s.io', '-o', 'name'],
    kubeconfig,
  )
  if (
    !(await apiResourceOrCrdExists(
      extensionResources,
      'sandboxtemplates',
      'sandboxtemplates.extensions.agents.x-k8s.io',
      kubeconfig,
    ))
  ) {
    missing.push('CRD sandboxtemplates.extensions.agents.x-k8s.io')
  }
  if (
    !(await apiResourceOrCrdExists(
      extensionResources,
      'sandboxclaims',
      'sandboxclaims.extensions.agents.x-k8s.io',
      kubeconfig,
    ))
  ) {
    missing.push('CRD sandboxclaims.extensions.agents.x-k8s.io')
  }

  const coreResources = await tryExecKubectl(
    ['api-resources', '--api-group', 'agents.x-k8s.io', '-o', 'name'],
    kubeconfig,
  )
  if (
    !(await apiResourceOrCrdExists(
      coreResources,
      'sandboxes',
      'sandboxes.agents.x-k8s.io',
      kubeconfig,
    ))
  ) {
    missing.push('CRD sandboxes.agents.x-k8s.io')
  }

  const controllerOutput = await tryExecKubectl(
    ['-n', 'agent-sandbox-system', 'get', 'deployment', 'agent-sandbox-controller', '-o', 'json'],
    kubeconfig,
    10_000,
  )
  if (!controllerOutput) {
    missing.push('deployment/agent-sandbox-controller in namespace agent-sandbox-system')
  } else {
    try {
      const controller = JSON.parse(controllerOutput) as Record<string, unknown>
      const status = (controller.status ?? {}) as Record<string, unknown>
      if (((status.availableReplicas as number | undefined) ?? 0) < 1) {
        missing.push('Ready agent-sandbox controller')
      }
    } catch {
      missing.push('Readable agent-sandbox controller status')
    }
  }

  const runtimeClassNames = [
    ...new Set(
      [options?.runtimeClassName, ...(options?.runtimeClassNames ?? [])]
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ]
  for (const runtimeClassName of runtimeClassNames) {
    const runtimeClass = await tryExecKubectl(['get', 'runtimeclass', runtimeClassName], kubeconfig)
    if (!runtimeClass) {
      missing.push(`RuntimeClass ${runtimeClassName}`)
    }
  }

  const sandboxNodes = await tryExecKubectl(
    ['get', 'nodes', '-l', 'shadowob.com/sandbox-ready=true', '-o', 'name'],
    kubeconfig,
  )
  if (!sandboxNodes?.trim()) {
    warnings.push('No nodes are labeled shadowob.com/sandbox-ready=true')
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
    runtimeClassName: runtimeClassNames[0],
    runtimeClassNames,
  }
}

function execKubectlAsync(args: string[], kubeconfig?: string, timeout = 3_000): Promise<string> {
  return withKubeconfigAsync(
    kubeconfig,
    (kubeArgs) =>
      new Promise<string>((resolve, reject) => {
        const proc = spawn('kubectl', [...kubeArgs, ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
        }, timeout)

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf-8')
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf-8')
        })
        proc.on('error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
        proc.on('close', (code) => {
          clearTimeout(timer)
          if (code === 0) {
            resolve(stdout)
            return
          }
          const reason = stderr.trim() || stdout.trim() || `kubectl exited with code ${code ?? 1}`
          reject(new Error(timedOut ? `kubectl timed out after ${timeout}ms: ${reason}` : reason))
        })
      }),
  )
}

async function applyManifest(
  manifest: Record<string, unknown>,
  kubeconfig?: string,
  timeout = 30_000,
): Promise<void> {
  await withKubeconfigAsync(
    kubeconfig,
    (kubeArgs) =>
      new Promise<void>((resolve, reject) => {
        const proc = spawn('kubectl', [...kubeArgs, 'apply', '-f', '-'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
        }, timeout)

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf-8')
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf-8')
        })
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
          const reason = stderr.trim() || stdout.trim() || 'kubectl apply failed'
          reject(
            new Error(timedOut ? `kubectl apply timed out after ${timeout}ms: ${reason}` : reason),
          )
        })
        proc.stdin?.end(JSON.stringify(manifest))
      }),
  )
}

function isKubernetesNotFound(error: unknown): boolean {
  return error instanceof Error && /not found/i.test(error.message)
}

function isNamespaceNotFound(error: unknown): boolean {
  return isKubernetesNotFound(error)
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

export async function resolveSandboxNameAsync(
  namespace: string,
  agentName: string,
  kubeconfig?: string,
): Promise<string> {
  try {
    const output = await execKubectlAsync(
      ['-n', namespace, 'get', 'sandboxclaim', agentName, '-o', 'json'],
      kubeconfig,
      10_000,
    )
    const claim = JSON.parse(output) as Record<string, unknown>
    const status = (claim.status ?? {}) as Record<string, unknown>
    const metadata = (claim.metadata ?? {}) as Record<string, unknown>
    const annotations = (metadata.annotations ?? {}) as Record<string, string>
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

export async function getAgentSandboxStatusAsync(
  namespace: string,
  agentName: string,
  kubeconfig?: string,
): Promise<AgentSandboxStatus> {
  const sandboxName = await resolveSandboxNameAsync(namespace, agentName, kubeconfig)
  try {
    const output = await execKubectlAsync(
      ['-n', namespace, 'get', 'sandbox', sandboxName, '-o', 'json'],
      kubeconfig,
      10_000,
    )
    const sandbox = JSON.parse(output) as Record<string, unknown>
    const spec = (sandbox.spec ?? {}) as Record<string, unknown>
    const status = (sandbox.status ?? {}) as Record<string, unknown>
    const replicas = (spec.replicas as number | undefined) ?? 1
    const ready = conditionStatus(status.conditions as Array<Record<string, unknown>>, 'Ready')
    const runtimeState: AgentSandboxRuntimeState =
      replicas === 0
        ? 'paused'
        : ready === 'True'
          ? 'running'
          : ready === 'False'
            ? 'resuming'
            : 'unknown'

    return {
      name: agentName,
      sandboxName,
      replicas,
      ready: ready === 'True',
      runtimeState,
      workloadKind: 'Sandbox',
    }
  } catch (error) {
    if (!isKubernetesNotFound(error)) throw error
  }

  const output = await execKubectlAsync(
    ['-n', namespace, 'get', 'deployment', agentName, '-o', 'json'],
    kubeconfig,
    10_000,
  )
  const deployment = JSON.parse(output) as Record<string, unknown>
  const spec = (deployment.spec ?? {}) as Record<string, unknown>
  const status = (deployment.status ?? {}) as Record<string, unknown>
  const replicas = (spec.replicas as number | undefined) ?? 1
  const readyReplicas = (status.readyReplicas as number | undefined) ?? 0
  const ready = replicas > 0 && readyReplicas >= replicas
  return {
    name: agentName,
    sandboxName: agentName,
    replicas,
    ready,
    runtimeState: replicas === 0 ? 'paused' : ready ? 'running' : 'resuming',
    workloadKind: 'Deployment',
  }
}

async function getPodReadyState(
  namespace: string,
  podName: string,
  kubeconfig?: string,
): Promise<PodReadyState> {
  try {
    const output = await execKubectlAsync(
      ['-n', namespace, 'get', 'pod', podName, '-o', 'json'],
      kubeconfig,
      10_000,
    )
    const pod = JSON.parse(output) as Record<string, unknown>
    return podReadyStateFromObject(pod)
  } catch (error) {
    if (isKubernetesNotFound(error)) return 'absent'
    throw error
  }
}

function podReadyStateFromObject(pod: Record<string, unknown>): Exclude<PodReadyState, 'absent'> {
  const metadata = (pod.metadata ?? {}) as Record<string, unknown>
  if (metadata.deletionTimestamp) return 'terminating'

  const status = (pod.status ?? {}) as Record<string, unknown>
  const phase = status.phase
  const ready = conditionStatus(status.conditions as Array<Record<string, unknown>>, 'Ready')
  return phase === 'Running' && ready === 'True' ? 'ready' : 'not-ready'
}

function isOwnedBySandbox(pod: Record<string, unknown>, sandboxName: string): boolean {
  const metadata = (pod.metadata ?? {}) as Record<string, unknown>
  if (metadata.name === sandboxName) return true

  const ownerReferences = metadata.ownerReferences
  if (!Array.isArray(ownerReferences)) return false

  return ownerReferences.some((owner) => {
    if (!owner || typeof owner !== 'object') return false
    const record = owner as Record<string, unknown>
    return record.kind === 'Sandbox' && record.name === sandboxName
  })
}

async function getOwnedSandboxPodReadyState(
  namespace: string,
  sandboxName: string,
  kubeconfig?: string,
): Promise<PodReadyState> {
  try {
    const output = await execKubectlAsync(
      ['-n', namespace, 'get', 'pods', '-o', 'json'],
      kubeconfig,
      10_000,
    )
    const pods = JSON.parse(output) as { items?: Array<Record<string, unknown>> }
    const matchingPods = (pods.items ?? []).filter((pod) => isOwnedBySandbox(pod, sandboxName))
    if (matchingPods.length === 0) return 'absent'

    const states = matchingPods.map(podReadyStateFromObject)
    if (states.includes('ready')) return 'ready'
    if (states.includes('terminating')) return 'terminating'
    return 'not-ready'
  } catch (error) {
    if (isKubernetesNotFound(error)) return 'absent'
    throw error
  }
}

export async function scaleAgentSandboxAsync(
  namespace: string,
  agentName: string,
  replicas: 0 | 1,
  kubeconfig?: string,
): Promise<void> {
  const sandboxName = await resolveSandboxNameAsync(namespace, agentName, kubeconfig)
  try {
    await execKubectlAsync(
      [
        '-n',
        namespace,
        'patch',
        'sandbox',
        sandboxName,
        '--type=merge',
        '-p',
        JSON.stringify({ spec: { replicas } }),
      ],
      kubeconfig,
      30_000,
    )
    return
  } catch (error) {
    if (!isKubernetesNotFound(error)) throw error
  }

  try {
    await execKubectlAsync(
      ['-n', namespace, 'scale', 'deployment', agentName, `--replicas=${replicas}`],
      kubeconfig,
      30_000,
    )
  } catch (error) {
    // Scaling an already-absent runtime to zero is an idempotent pause. This
    // also lets lifecycle reconciliation finish after an external cleanup.
    if (replicas === 0 && isKubernetesNotFound(error)) return
    throw error
  }
}

export async function waitForAgentSandboxReady(options: {
  namespace: string
  agentName: string
  kubeconfig?: string
  timeoutMs?: number
  intervalMs?: number
  isCancelled?: () => boolean
}): Promise<AgentSandboxStatus> {
  const timeoutMs = options.timeoutMs ?? 180_000
  const intervalMs = options.intervalMs ?? 2_000
  const startedAt = Date.now()
  let lastStatus: AgentSandboxStatus | null = null

  while (Date.now() - startedAt < timeoutMs) {
    if (options.isCancelled?.()) {
      throw new Error('Deployment cancelled while waiting for sandbox readiness')
    }
    lastStatus = await getAgentSandboxStatusAsync(
      options.namespace,
      options.agentName,
      options.kubeconfig,
    )
    if (lastStatus.replicas > 0) {
      if (lastStatus.workloadKind === 'Deployment' && lastStatus.ready) {
        return { ...lastStatus, ready: true, runtimeState: 'running' }
      }
      const directPodState = await getPodReadyState(
        options.namespace,
        lastStatus.sandboxName,
        options.kubeconfig,
      )
      const podState =
        directPodState === 'absent'
          ? await getOwnedSandboxPodReadyState(
              options.namespace,
              lastStatus.sandboxName,
              options.kubeconfig,
            )
          : directPodState
      if (podState === 'ready') {
        return { ...lastStatus, ready: true, runtimeState: 'running' }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(
    `Timed out waiting for Sandbox "${lastStatus?.sandboxName ?? options.agentName}" to become Ready`,
  )
}

export async function waitForAgentSandboxPaused(options: {
  namespace: string
  agentName: string
  kubeconfig?: string
  timeoutMs?: number
  intervalMs?: number
}): Promise<AgentSandboxStatus> {
  const timeoutMs = options.timeoutMs ?? 120_000
  const intervalMs = options.intervalMs ?? 2_000
  const startedAt = Date.now()
  let lastStatus: AgentSandboxStatus | null = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastStatus = await getAgentSandboxStatusAsync(
        options.namespace,
        options.agentName,
        options.kubeconfig,
      )
    } catch (error) {
      if (isKubernetesNotFound(error)) {
        return {
          name: options.agentName,
          sandboxName: await resolveSandboxNameAsync(
            options.namespace,
            options.agentName,
            options.kubeconfig,
          ),
          replicas: 0,
          ready: false,
          runtimeState: 'paused',
        }
      }
      throw error
    }
    if (lastStatus.runtimeState === 'paused') {
      if (lastStatus.workloadKind === 'Deployment') return lastStatus
      const podState = await getPodReadyState(
        options.namespace,
        lastStatus.sandboxName,
        options.kubeconfig,
      )
      if (podState === 'absent') return lastStatus
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(
    `Timed out waiting for Sandbox "${lastStatus?.sandboxName ?? options.agentName}" to pause`,
  )
}

export async function createVolumeSnapshotBackupAsync(options: {
  namespace: string
  snapshotName: string
  pvcName: string
  volumeSnapshotClassName?: string
  kubeconfig?: string
}): Promise<void> {
  await assertVolumeSnapshotApiAvailable(options.kubeconfig)

  const spec: Record<string, unknown> = {
    source: { persistentVolumeClaimName: options.pvcName },
  }
  if (options.volumeSnapshotClassName) {
    spec.volumeSnapshotClassName = options.volumeSnapshotClassName
  }

  await applyManifest(
    {
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
      spec,
    },
    options.kubeconfig,
  )
}

export async function isVolumeSnapshotApiAvailable(options?: {
  kubeconfig?: string
}): Promise<boolean> {
  const output = await execKubectlAsync(
    ['api-resources', '--api-group', 'snapshot.storage.k8s.io', '-o', 'name'],
    options?.kubeconfig,
    10_000,
  )
  return volumeSnapshotApiAvailableFromOutput(output)
}

export type PvcVolumeSnapshotCapability = {
  storageClassName: string | null
  provisioner: string | null
  isCsi: boolean
  volumeSnapshotClassName: string | null
}

function isCsiProvisioner(provisioner: string): boolean {
  return /(^|[./-])csi([./-]|$)/i.test(provisioner)
}

async function getPvcStorageProvisioner(options: {
  namespace: string
  pvcName: string
  kubeconfig?: string
}): Promise<{
  storageClassName: string | null
  provisioner: string | null
  isCsi: boolean
}> {
  const pvcOutput = await execKubectlAsync(
    ['-n', options.namespace, 'get', 'pvc', options.pvcName, '-o', 'json'],
    options.kubeconfig,
    10_000,
  )
  const pvc = JSON.parse(pvcOutput) as Record<string, unknown>
  const spec = (pvc.spec ?? {}) as Record<string, unknown>
  const storageClassName =
    typeof spec.storageClassName === 'string' && spec.storageClassName.trim()
      ? spec.storageClassName.trim()
      : null
  if (!storageClassName) {
    return { storageClassName: null, provisioner: null, isCsi: false }
  }

  const storageClassOutput = await execKubectlAsync(
    ['get', 'storageclass', storageClassName, '-o', 'json'],
    options.kubeconfig,
    10_000,
  )
  const storageClass = JSON.parse(storageClassOutput) as Record<string, unknown>
  const provisioner = String(storageClass.provisioner ?? '')
  return { storageClassName, provisioner, isCsi: isCsiProvisioner(provisioner) }
}

export async function isPvcBackedByCsiProvisioner(options: {
  namespace: string
  pvcName: string
  kubeconfig?: string
}): Promise<boolean> {
  return (await getPvcStorageProvisioner(options)).isCsi
}

export async function getPvcVolumeSnapshotCapability(options: {
  namespace: string
  pvcName: string
  kubeconfig?: string
}): Promise<PvcVolumeSnapshotCapability> {
  const storage = await getPvcStorageProvisioner(options)
  if (!storage.isCsi || !storage.provisioner) {
    return { ...storage, volumeSnapshotClassName: null }
  }

  const snapshotClassesOutput = await execKubectlAsync(
    ['get', 'volumesnapshotclass', '-o', 'json'],
    options.kubeconfig,
    10_000,
  )
  const snapshotClasses = JSON.parse(snapshotClassesOutput) as {
    items?: Array<{
      driver?: unknown
      metadata?: { name?: unknown; annotations?: Record<string, unknown> }
    }>
  }
  const matchingClasses = (snapshotClasses.items ?? []).filter(
    (item) => item.driver === storage.provisioner && typeof item.metadata?.name === 'string',
  )
  const defaultClass = matchingClasses.find(
    (item) =>
      item.metadata?.annotations?.['snapshot.storage.kubernetes.io/is-default-class'] === 'true',
  )
  const singleMatchingClass = matchingClasses.length === 1 ? matchingClasses[0] : null
  const selectedClass = defaultClass ?? singleMatchingClass

  return {
    ...storage,
    volumeSnapshotClassName:
      typeof selectedClass?.metadata?.name === 'string' ? selectedClass.metadata.name : null,
  }
}

export async function resolveVolumeSnapshotClassForPvc(options: {
  namespace: string
  pvcName: string
  kubeconfig?: string
}): Promise<string | null> {
  return (await getPvcVolumeSnapshotCapability(options)).volumeSnapshotClassName
}

async function assertVolumeSnapshotApiAvailable(kubeconfig?: string): Promise<void> {
  if (await isVolumeSnapshotApiAvailable({ kubeconfig })) return
  throw new Error(
    'VolumeSnapshot API is not available on this cluster. Install the CSI snapshot CRDs/controller or use a restic/kopia backup driver.',
  )
}

export async function getVolumeSnapshotReadyStatus(options: {
  namespace: string
  snapshotName: string
  kubeconfig?: string
}): Promise<VolumeSnapshotReadyStatus> {
  const output = await execKubectlAsync(
    ['-n', options.namespace, 'get', 'volumesnapshot', options.snapshotName, '-o', 'json'],
    options.kubeconfig,
    10_000,
  )
  const snapshot = JSON.parse(output) as Record<string, unknown>
  const status = (snapshot.status ?? {}) as Record<string, unknown>
  return {
    ready: status.readyToUse === true,
    error:
      (status.error as { message?: string } | undefined)?.message ??
      (status.errorMessage as string | undefined),
  }
}

export async function waitForVolumeSnapshotReady(options: {
  namespace: string
  snapshotName: string
  kubeconfig?: string
  timeoutMs?: number
  intervalMs?: number
}): Promise<VolumeSnapshotReadyStatus> {
  const timeoutMs = options.timeoutMs ?? 180_000
  const intervalMs = options.intervalMs ?? 2_000
  const startedAt = Date.now()
  let lastStatus: VolumeSnapshotReadyStatus = { ready: false }

  while (Date.now() - startedAt < timeoutMs) {
    lastStatus = await getVolumeSnapshotReadyStatus(options)
    if (lastStatus.ready) return lastStatus
    if (lastStatus.error) throw new Error(lastStatus.error)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Timed out waiting for VolumeSnapshot "${options.snapshotName}" to be ready`)
}

async function readPvcRestoreSpec(options: {
  namespace: string
  pvcName: string
  kubeconfig?: string
}): Promise<{
  accessModes: string[]
  storage: string
  storageClassName?: string
}> {
  const output = await execKubectlAsync(
    ['-n', options.namespace, 'get', 'pvc', options.pvcName, '-o', 'json'],
    options.kubeconfig,
    10_000,
  )
  const pvc = JSON.parse(output) as Record<string, unknown>
  const spec = (pvc.spec ?? {}) as Record<string, unknown>
  const resources = (spec.resources ?? {}) as Record<string, unknown>
  const requests = (resources.requests ?? {}) as Record<string, unknown>
  return {
    accessModes: Array.isArray(spec.accessModes)
      ? spec.accessModes.map((mode) => String(mode))
      : ['ReadWriteOnce'],
    storage: typeof requests.storage === 'string' ? requests.storage : '5Gi',
    ...(typeof spec.storageClassName === 'string'
      ? { storageClassName: spec.storageClassName }
      : {}),
  }
}

async function waitForPvcBound(options: {
  namespace: string
  pvcName: string
  kubeconfig?: string
  timeoutMs?: number
  intervalMs?: number
}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 180_000
  const intervalMs = options.intervalMs ?? 2_000
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const output = await execKubectlAsync(
      ['-n', options.namespace, 'get', 'pvc', options.pvcName, '-o', 'json'],
      options.kubeconfig,
      10_000,
    )
    const pvc = JSON.parse(output) as Record<string, unknown>
    const status = (pvc.status ?? {}) as Record<string, unknown>
    if (status.phase === 'Bound') return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Timed out waiting for PVC "${options.pvcName}" to bind`)
}

export async function restorePvcFromVolumeSnapshot(options: {
  namespace: string
  pvcName: string
  snapshotName: string
  kubeconfig?: string
  accessModes?: string[]
  storage?: string
  storageClassName?: string
  timeoutMs?: number
}): Promise<void> {
  await assertVolumeSnapshotApiAvailable(options.kubeconfig)

  const existing = await readPvcRestoreSpec(options).catch(() => null)
  const accessModes = options.accessModes ?? existing?.accessModes ?? ['ReadWriteOnce']
  const storage = options.storage ?? existing?.storage ?? '5Gi'
  const storageClassName = options.storageClassName ?? existing?.storageClassName

  await execKubectlAsync(
    [
      '-n',
      options.namespace,
      'delete',
      'pvc',
      options.pvcName,
      '--ignore-not-found=true',
      '--wait=true',
      '--timeout=90s',
    ],
    options.kubeconfig,
    120_000,
  )

  const spec: Record<string, unknown> = {
    accessModes,
    resources: { requests: { storage } },
    dataSource: {
      name: options.snapshotName,
      kind: 'VolumeSnapshot',
      apiGroup: 'snapshot.storage.k8s.io',
    },
  }
  if (storageClassName) spec.storageClassName = storageClassName

  await applyManifest(
    {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: options.pvcName,
        namespace: options.namespace,
        labels: {
          app: 'shadowob-cloud',
          'shadowob.cloud/restored-from-snapshot': options.snapshotName,
        },
      },
      spec,
    },
    options.kubeconfig,
  )

  await waitForPvcBound({
    namespace: options.namespace,
    pvcName: options.pvcName,
    kubeconfig: options.kubeconfig,
    timeoutMs: options.timeoutMs,
  })
}

export async function listPods(
  namespace: string,
  kubeconfig?: string,
  timeout = 10_000,
): Promise<K8sPodSummary[]> {
  try {
    const out = await execKubectlAsync(
      ['-n', namespace, 'get', 'pods', '-o', 'json'],
      kubeconfig,
      timeout,
    )
    const data = JSON.parse(out) as { items?: Array<Record<string, unknown>> }
    return (data.items ?? []).map((item) => {
      const meta = (item.metadata ?? {}) as Record<string, unknown>
      const spec = (item.spec ?? {}) as Record<string, unknown>
      const status = (item.status ?? {}) as Record<string, unknown>
      const containers = (status.containerStatuses ?? []) as Array<Record<string, unknown>>
      const specContainers = (spec.containers ?? []) as Array<Record<string, unknown>>
      const deploymentId = specContainers
        .flatMap((container) =>
          Array.isArray(container.env) ? (container.env as Array<Record<string, unknown>>) : [],
        )
        .find((env) => env.name === 'SHADOWOB_CLOUD_DEPLOYMENT_ID')?.value
      const restarts = containers.reduce((s, c) => s + ((c.restartCount as number) ?? 0), 0)
      const ready = containers.filter((c) => c.ready).length
      return {
        name: meta.name as string,
        ready: `${ready}/${containers.length}`,
        status: (status.phase as string) ?? 'Unknown',
        restarts,
        age: (meta.creationTimestamp as string) ?? '',
        containers: containers.map((container) => String(container.name ?? '')).filter(Boolean),
        ...(typeof deploymentId === 'string' && deploymentId ? { deploymentId } : {}),
      }
    })
  } catch {
    return []
  }
}

export const listPodsAsync = listPods

export async function spawnPodLogStream(opts: {
  namespace: string
  pod: string
  container?: string
  follow?: boolean
  tail?: number
  kubeconfig?: string
}): Promise<{ proc: ReturnType<typeof spawn>; cleanup: () => Promise<void> }> {
  const args: string[] = []
  let cleanup = async () => {}

  const explicitKubeconfig = opts.kubeconfig?.trim() ? opts.kubeconfig : undefined
  const ambientKubeconfig = explicitKubeconfig ? undefined : await resolveAmbientKubeconfig()
  const effectiveKubeconfig = explicitKubeconfig ?? ambientKubeconfig?.kubeconfig
  if (effectiveKubeconfig) {
    const tempKubeconfig = await createTempKubeconfig(
      effectiveKubeconfig,
      !explicitKubeconfig,
      explicitKubeconfig ? true : (ambientKubeconfig?.shouldRewriteLoopback ?? true),
    )
    args.push(...tempKubeconfig.args)
    cleanup = tempKubeconfig.cleanup
  }

  args.push('logs', '-n', opts.namespace, opts.pod)
  if (opts.container) args.push('-c', opts.container)
  if (opts.follow !== false) args.push('-f')
  if (opts.tail !== undefined) args.push(`--tail=${opts.tail}`)
  args.push('--timestamps')

  const proc = spawn('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  return { proc, cleanup }
}

export function readPodLogs(opts: {
  namespace: string
  pod: string
  container?: string
  tail?: number
  timestamps?: boolean
  kubeconfig?: string
  timeout?: number
}): Promise<string> {
  const args = ['logs', '-n', opts.namespace, opts.pod]
  if (opts.container) args.push('-c', opts.container)
  if (opts.tail !== undefined) args.push(`--tail=${opts.tail}`)
  if (opts.timestamps) args.push('--timestamps')
  return execKubectlAsync(args, opts.kubeconfig, opts.timeout)
}

export async function readPodLogsAsync(opts: {
  namespace: string
  pod: string
  container?: string
  tail?: number
  timestamps?: boolean
  kubeconfig?: string
  timeout?: number
}): Promise<string> {
  const args = ['logs', '-n', opts.namespace, opts.pod]
  if (opts.container) args.push('-c', opts.container)
  if (opts.tail !== undefined) args.push(`--tail=${opts.tail}`)
  if (opts.timestamps) args.push('--timestamps')
  return execKubectlAsync(args, opts.kubeconfig, opts.timeout)
}

export function execInPod(opts: {
  namespace: string
  pod: string
  command: string[]
  container?: string
  kubeconfig?: string
  timeout?: number
}): Promise<K8sExecResult> {
  return execInPodAsync(opts)
}

export function execInPodAsync(opts: {
  namespace: string
  pod: string
  command: string[]
  container?: string
  kubeconfig?: string
  timeout?: number
}): Promise<K8sExecResult> {
  return withKubeconfigAsync(
    opts.kubeconfig,
    (kubeArgs) =>
      new Promise((resolve) => {
        const args = [...kubeArgs, '-n', opts.namespace, 'exec', opts.pod]
        if (opts.container) args.push('-c', opts.container)
        args.push('--', ...opts.command)

        const proc = spawn('kubectl', args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timeout = opts.timeout ?? 15_000
        const timer = setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
        }, timeout)

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf-8')
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf-8')
        })
        proc.on('error', (err) => {
          clearTimeout(timer)
          resolve({
            stdout,
            stderr: stderr || err.message,
            exitCode: 1,
          })
        })
        proc.on('close', (code) => {
          clearTimeout(timer)
          resolve({
            stdout,
            stderr,
            exitCode: timedOut ? 124 : (code ?? 1),
          })
        })
      }),
  )
}

export function execInPodWithInputAsync(opts: {
  namespace: string
  pod: string
  command: string[]
  input: Buffer | string
  container?: string
  kubeconfig?: string
  timeout?: number
}): Promise<K8sExecResult> {
  return withKubeconfigAsync(
    opts.kubeconfig,
    (kubeArgs) =>
      new Promise((resolve) => {
        const args = [...kubeArgs, '-n', opts.namespace, 'exec', '-i', opts.pod]
        if (opts.container) args.push('-c', opts.container)
        args.push('--', ...opts.command)

        const proc = spawn('kubectl', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timeout = opts.timeout ?? 60_000
        const timer = setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
        }, timeout)

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf-8')
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf-8')
        })
        proc.on('error', (err) => {
          clearTimeout(timer)
          resolve({
            stdout,
            stderr: stderr || err.message,
            exitCode: 1,
          })
        })
        proc.on('close', (code) => {
          clearTimeout(timer)
          resolve({
            stdout,
            stderr,
            exitCode: timedOut ? 124 : (code ?? 1),
          })
        })

        proc.stdin?.end(opts.input)
      }),
  )
}

export async function applyKubernetesManifestAsync(
  manifest: Record<string, unknown>,
  kubeconfig?: string,
  timeout = 30_000,
): Promise<void> {
  await applyManifest(manifest, kubeconfig, timeout)
}

export async function deleteKubernetesResourceAsync(options: {
  namespace: string
  kind: string
  name: string
  kubeconfig?: string
  timeoutMs?: number
}): Promise<void> {
  await execKubectlAsync(
    [
      '-n',
      options.namespace,
      'delete',
      options.kind,
      options.name,
      '--ignore-not-found=true',
      '--wait=true',
      `--timeout=${Math.ceil((options.timeoutMs ?? 30_000) / 1000)}s`,
    ],
    options.kubeconfig,
    (options.timeoutMs ?? 30_000) + 5_000,
  )
}

export async function waitForPodReadyAsync(options: {
  namespace: string
  pod: string
  kubeconfig?: string
  timeoutMs?: number
}): Promise<void> {
  await execKubectlAsync(
    [
      '-n',
      options.namespace,
      'wait',
      `pod/${options.pod}`,
      '--for=condition=Ready',
      `--timeout=${Math.ceil((options.timeoutMs ?? 60_000) / 1000)}s`,
    ],
    options.kubeconfig,
    (options.timeoutMs ?? 60_000) + 5_000,
  )
}

export async function listManagedNamespaceSummaries(
  kubeconfig?: string,
): Promise<ManagedNamespaceSummary[] | null> {
  try {
    const out = await execKubectlAsync(['get', 'ns', '-o', 'json'], kubeconfig, 10_000)
    const data = JSON.parse(out) as {
      items?: Array<{
        metadata?: {
          name?: string
          labels?: Record<string, string | undefined>
          annotations?: Record<string, string | undefined>
        }
      }>
    }

    return (data.items ?? []).flatMap((item) => {
      const name = item.metadata?.name
      if (!name) return []
      const labels = item.metadata?.labels ?? {}
      const managed =
        labels['shadowob-cloud/managed'] === 'true' || labels['managed-by'] === 'shadowob-cloud-cli'
      if (!managed) return []
      const annotations = item.metadata?.annotations ?? {}
      return [
        {
          name,
          labels: Object.fromEntries(
            Object.entries(labels).filter((entry): entry is [string, string] => Boolean(entry[1])),
          ),
          annotations: Object.fromEntries(
            Object.entries(annotations).filter((entry): entry is [string, string] =>
              Boolean(entry[1]),
            ),
          ),
        },
      ]
    })
  } catch {
    return null
  }
}

export async function listManagedNamespaces(kubeconfig?: string): Promise<string[] | null> {
  const summaries = await listManagedNamespaceSummaries(kubeconfig)
  return summaries?.map((summary) => summary.name) ?? null
}

export async function namespaceExists(
  namespace: string,
  kubeconfig?: string,
): Promise<boolean | null> {
  try {
    const out = (
      await execKubectlAsync(
        ['get', 'ns', namespace, '--ignore-not-found', '-o', 'name'],
        kubeconfig,
        10_000,
      )
    ).trim()
    return out.length > 0
  } catch (error) {
    if (isNamespaceNotFound(error)) {
      return false
    }
    return null
  }
}

export async function deleteNamespace(namespace: string, kubeconfig?: string): Promise<void> {
  await execKubectlAsync(
    ['delete', 'namespace', namespace, '--ignore-not-found=true', '--wait=false'],
    kubeconfig,
    30_000,
  )
}
