import { type ChildProcess, spawn as spawnProcess } from 'node:child_process'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  applyKubernetesManifestAsync,
  execInPodAsync,
  execInPodWithInputAsync,
  listManagedNamespaces,
  readPodLogsAsync,
  restorePvcFromVolumeSnapshot,
  rewriteLoopbackKubeconfig,
} from '@shadowob/cloud'
import { type IPty, spawn as spawnPty } from 'node-pty'
import type { Logger } from 'pino'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { AccessService } from '../security/access.service'
import type { ActorInput } from '../security/actor'
import { notFoundForScope, scopeMismatch } from '../security/errors'

const K8S_NAME_RE = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/
const TERMINAL_SHELLS = new Set(['/bin/sh', '/bin/bash', '/usr/bin/bash', '/usr/bin/zsh'])
const PORT_FORWARD_READY_MS = Number(process.env.CLOUD_COMPUTER_PORT_FORWARD_READY_MS ?? 10_000)
const K8S_SLOW_OPERATION_MS = readBoundedEnvInt('SHADOWOB_K8S_SLOW_OPERATION_MS', 5_000)
const K8S_OPERATION_QUEUE_TIMEOUT_MS = readBoundedEnvInt('SHADOWOB_K8S_QUEUE_TIMEOUT_MS', 5_000)
const K8S_MAX_CONCURRENT_OPERATIONS = readBoundedEnvInt('SHADOWOB_K8S_MAX_CONCURRENT_OPERATIONS', 8)
const K8S_LIST_PODS_TIMEOUT_MS = readBoundedEnvInt('SHADOWOB_K8S_LIST_PODS_TIMEOUT_MS', 10_000)
const K8S_READ_LOGS_TIMEOUT_MS = readBoundedEnvInt('SHADOWOB_K8S_READ_LOGS_TIMEOUT_MS', 10_000)
const K8S_EXEC_TIMEOUT_MS = readBoundedEnvInt('SHADOWOB_K8S_EXEC_TIMEOUT_MS', 30_000)
const K8S_EXEC_INPUT_TIMEOUT_MS = readBoundedEnvInt('SHADOWOB_K8S_EXEC_INPUT_TIMEOUT_MS', 60_000)
const K8S_APPLY_TIMEOUT_MS = readBoundedEnvInt('SHADOWOB_K8S_APPLY_TIMEOUT_MS', 30_000)
const K8S_RESTORE_PVC_TIMEOUT_MS = readBoundedEnvInt('SHADOWOB_K8S_RESTORE_PVC_TIMEOUT_MS', 180_000)
const K8S_DELETE_NAMESPACE_TIMEOUT_MS = readBoundedEnvInt(
  'SHADOWOB_K8S_DELETE_NAMESPACE_TIMEOUT_MS',
  30_000,
)
const K8S_DELETE_DEPLOYMENT_TIMEOUT_MS = readBoundedEnvInt(
  'SHADOWOB_K8S_DELETE_DEPLOYMENT_TIMEOUT_MS',
  30_000,
)
const K8S_MAX_LOG_STREAMS = readBoundedEnvInt('SHADOWOB_K8S_MAX_LOG_STREAMS', 24)
const K8S_LOG_STREAM_MAX_MS = readBoundedEnvInt('SHADOWOB_K8S_LOG_STREAM_MAX_MS', 30 * 60_000)
const K8S_MAX_PORT_FORWARDS = readBoundedEnvInt('SHADOWOB_K8S_MAX_PORT_FORWARDS', 16)
const K8S_PORT_FORWARD_MAX_MS = readBoundedEnvInt(
  'SHADOWOB_K8S_PORT_FORWARD_MAX_MS',
  2 * 60 * 60_000,
)
const K8S_MAX_TERMINALS = readBoundedEnvInt('SHADOWOB_K8S_MAX_TERMINALS', 16)
const K8S_TERMINAL_IDLE_MS = readBoundedEnvInt('SHADOWOB_K8S_TERMINAL_IDLE_MS', 30 * 60_000)

export type KubernetesInteractiveTerminalSession = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (listener: (data: string) => void) => void
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => void
}

export type KubernetesPortForwardSession = {
  localPort: number
  proc: ChildProcess
  cleanup: () => void
}

export type KubernetesPodSummary = {
  name: string
  ready: string
  status: string
  restarts: number
  age: string
  containers: string[]
  deploymentId?: string
}

function readBoundedEnvInt(name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.floor(value), min), max)
}

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function timeoutError(label: string, timeoutMs: number) {
  return statusError(`Kubernetes operation timed out: ${label} (${timeoutMs}ms)`, 504)
}

function queueFullError(label: string) {
  return statusError(`Kubernetes operation queue is full: ${label}`, 429)
}

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') {
    timer.unref()
  }
}

class AsyncOperationGate {
  private active = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly maxActive: number) {}

  async acquire(label: string): Promise<() => void> {
    if (this.active < this.maxActive) {
      this.active += 1
      return () => this.release()
    }

    let waiter: (() => void) | undefined
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        if (waiter) this.remove(waiter)
        reject(queueFullError(label))
      }, K8S_OPERATION_QUEUE_TIMEOUT_MS)
      unrefTimer(timer)

      waiter = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.active += 1
        resolve(() => this.release())
      }
      this.queue.push(waiter)
    })
  }

  private release() {
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next) next()
  }

  private remove(waiter: () => void) {
    const index = this.queue.indexOf(waiter)
    if (index >= 0) this.queue.splice(index, 1)
  }
}

function assertKubernetesName(value: string, label: string) {
  if (!K8S_NAME_RE.test(value)) {
    throw Object.assign(new Error(`Invalid Kubernetes ${label}`), { status: 422 })
  }
}

function sanitizeShell(shell: string | undefined) {
  if (!shell) return '/bin/bash'
  return TERMINAL_SHELLS.has(shell) ? shell : '/bin/bash'
}

function clampTerminalSize(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.floor(value as number), min), max)
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

function defaultKubeconfigPath(): string {
  return join(homedir(), '.kube', 'config')
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
  return Boolean(candidate && (await getHostLocalKubeconfigPaths()).includes(candidate))
}

function extractCurrentContext(kubeconfigYaml: string): string | undefined {
  return kubeconfigYaml.match(/current-context:\s*(\S+)/)?.[1]
}

async function readKubeconfigIfReadable(candidate: string | undefined): Promise<string | null> {
  if (!candidate || !(await pathExists(candidate))) return null
  try {
    const candidateStat = await stat(candidate)
    if (!candidateStat.isFile() || candidateStat.size === 0) return null
    return await readFile(candidate, 'utf8')
  } catch {
    return null
  }
}

async function resolveAmbientKubeconfig(): Promise<{
  kubeconfig: string
  shouldRewriteLoopback: boolean
} | null> {
  const envCandidates =
    process.env.KUBECONFIG?.split(delimiter)
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0) ?? []

  const candidates = [
    ...envCandidates,
    process.env.KUBECONFIG_HOST_PATH?.trim(),
    defaultKubeconfigPath(),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of [...new Set(candidates)]) {
    const kubeconfig = await readKubeconfigIfReadable(candidate)
    if (!kubeconfig) continue
    return {
      kubeconfig,
      shouldRewriteLoopback: !(await isHostLocalKubeconfigPath(candidate)),
    }
  }
  return null
}

async function createTempKubeconfig(
  kubeconfig: string,
  includeAmbientContext: boolean,
  rewriteLoopback: boolean,
): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'sc-terminal-kube-'))
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

async function createKubectlRuntimeArgs(
  kubeconfig?: string,
): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
  const explicitKubeconfig = kubeconfig?.trim() ? kubeconfig : undefined
  const ambientKubeconfig = explicitKubeconfig ? null : await resolveAmbientKubeconfig()
  const effectiveKubeconfig = explicitKubeconfig ?? ambientKubeconfig?.kubeconfig
  if (!effectiveKubeconfig) return { args: [], cleanup: async () => {} }

  return await createTempKubeconfig(
    effectiveKubeconfig,
    !explicitKubeconfig,
    explicitKubeconfig ? true : (ambientKubeconfig?.shouldRewriteLoopback ?? true),
  )
}

async function kubectlResourceExists(opts: {
  namespace: string
  kind: 'secret'
  name: string
  kubeconfig?: string
  timeout?: number
}) {
  assertKubernetesName(opts.namespace, 'namespace')
  assertKubernetesName(opts.name, opts.kind)
  const runtimeArgs = await createKubectlRuntimeArgs(opts.kubeconfig)
  const args = [
    ...runtimeArgs.args,
    '-n',
    opts.namespace,
    'get',
    opts.kind,
    opts.name,
    '--ignore-not-found',
    '-o',
    'name',
  ]

  return new Promise<boolean>((resolve, reject) => {
    const proc = spawnProcess('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      void runtimeArgs.cleanup()
      proc.kill('SIGTERM')
      reject(new Error(`kubectl get ${opts.kind} timed out`))
    }, opts.timeout ?? 10_000)

    proc.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    proc.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    proc.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void runtimeArgs.cleanup()
      reject(error)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void runtimeArgs.cleanup()
      if (code === 0) {
        resolve(stdout.trim().length > 0)
        return
      }
      reject(new Error(stderr.trim() || `kubectl get ${opts.kind} exited with code ${code ?? 1}`))
    })
  })
}

async function runKubectlProcess(opts: {
  args: string[]
  kubeconfig?: string
  timeoutMs: number
  description: string
}) {
  const runtimeArgs = await createKubectlRuntimeArgs(opts.kubeconfig)
  const args = [...runtimeArgs.args, ...opts.args]

  return new Promise<string>((resolve, reject) => {
    const proc = spawnProcess('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (error?: Error, output?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void runtimeArgs.cleanup()
      if (error) reject(error)
      else resolve(output ?? '')
    }

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      finish(timeoutError(opts.description, opts.timeoutMs))
    }, opts.timeoutMs)

    proc.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    proc.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    proc.on('error', (error) => {
      finish(error)
    })
    proc.on('close', (code) => {
      if (code === 0) {
        finish(undefined, stdout)
        return
      }
      finish(new Error(stderr.trim() || `${opts.description} exited with code ${code ?? 1}`))
    })
  })
}

async function listPodsWithKubectl(
  namespace: string,
  kubeconfig: string | undefined,
  timeoutMs: number,
): Promise<KubernetesPodSummary[]> {
  assertKubernetesName(namespace, 'namespace')
  const out = await runKubectlProcess({
    args: ['-n', namespace, 'get', 'pods', '-o', 'json'],
    kubeconfig,
    timeoutMs,
    description: `kubectl list pods in ${namespace}`,
  })
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
    const restarts = containers.reduce((sum, container) => {
      return sum + ((container.restartCount as number | undefined) ?? 0)
    }, 0)
    const ready = containers.filter((container) => container.ready).length
    return {
      name: meta.name as string,
      ready: `${ready}/${containers.length}`,
      status: (status.phase as string | undefined) ?? 'Unknown',
      restarts,
      age: (meta.creationTimestamp as string | undefined) ?? '',
      containers: containers.map((container) => String(container.name ?? '')).filter(Boolean),
      ...(typeof deploymentId === 'string' && deploymentId ? { deploymentId } : {}),
    }
  })
}

function reserveLocalPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => {
        if (error) reject(error)
        else if (port) resolve(port)
        else reject(new Error('Failed to reserve a local port'))
      })
    })
  })
}

export class KubernetesOpsGateway {
  private readonly operationGate = new AsyncOperationGate(K8S_MAX_CONCURRENT_OPERATIONS)
  private readonly logStreamSessions = new Set<object>()
  private readonly portForwardSessions = new Set<object>()
  private readonly terminalSessions = new Set<object>()

  constructor(
    private deps: {
      accessService: AccessService
      cloudDeploymentDao: CloudDeploymentDao
      logger: Logger
    },
  ) {}

  private reserveSession(label: string, sessions: Set<object>, limit: number) {
    if (sessions.size >= limit) {
      throw queueFullError(label)
    }
    const token = {}
    sessions.add(token)
    return () => {
      sessions.delete(token)
    }
  }

  private async runKubernetesOperation<T>(
    label: string,
    timeoutMs: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const release = await this.operationGate.acquire(label)
    const startedAt = Date.now()
    let slowTimer: ReturnType<typeof setTimeout> | undefined

    try {
      slowTimer = setTimeout(() => {
        this.deps.logger.warn(
          {
            label,
            durationMs: Date.now() - startedAt,
            activeLimit: K8S_MAX_CONCURRENT_OPERATIONS,
          },
          '[k8s-gateway] slow kubernetes operation',
        )
      }, K8S_SLOW_OPERATION_MS)
      unrefTimer(slowTimer)

      return await new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(timeoutError(label, timeoutMs))
        }, timeoutMs)
        unrefTimer(timer)

        Promise.resolve()
          .then(operation)
          .then(resolve, reject)
          .finally(() => {
            clearTimeout(timer)
          })
      })
    } catch (err) {
      this.deps.logger.warn(
        {
          err,
          label,
          durationMs: Date.now() - startedAt,
          timeoutMs,
        },
        '[k8s-gateway] kubernetes operation failed',
      )
      throw err
    } finally {
      if (slowTimer) clearTimeout(slowTimer)
      release()
    }
  }

  async listManagedNamespaces() {
    return (await listManagedNamespaces()) ?? []
  }

  async assertManagedOrphanNamespace(namespace: string) {
    const managed = await this.listManagedNamespaces()
    if (!managed.includes(namespace)) {
      throw Object.assign(new Error('Namespace is not managed by this platform'), { status: 422 })
    }

    const existing = await this.deps.cloudDeploymentDao.findByNamespaceAnyCluster(namespace)
    if (existing) {
      throw scopeMismatch('Namespace is already owned by a deployment')
    }
  }

  async cleanupManagedOrphanNamespace(input: { actor: ActorInput; namespace: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.actor)
    await this.assertManagedOrphanNamespace(input.namespace)
    this.deps.logger.warn({ namespace: input.namespace }, '[k8s-gateway] deleting orphan namespace')
    await this.deleteNamespace(input.namespace)
  }

  async claimManagedOrphanNamespace(input: {
    actor: ActorInput
    ownerUserId: string
    namespace: string
  }) {
    await this.deps.accessService.requirePlatformAdmin(input.actor)
    await this.assertManagedOrphanNamespace(input.namespace)

    const created = await this.deps.cloudDeploymentDao.create({
      userId: input.ownerUserId,
      namespace: input.namespace,
      name: `orphan-${input.namespace}`,
      agentCount: 0,
      configSnapshot: null,
      status: 'deployed',
    })
    if (!created) throw notFoundForScope('Failed to create deployment row')
    await this.deps.cloudDeploymentDao.appendLog(
      created.id,
      '[reconcile] Adopted orphan namespace',
      'info',
    )
    return created
  }

  listPods(namespace: string, kubeconfig?: string) {
    return this.runKubernetesOperation('list pods', K8S_LIST_PODS_TIMEOUT_MS + 1_000, () =>
      listPodsWithKubectl(namespace, kubeconfig, K8S_LIST_PODS_TIMEOUT_MS),
    )
  }

  readPodLogs(opts: {
    namespace: string
    pod: string
    container?: string
    tail?: number
    timestamps?: boolean
    kubeconfig?: string
    timeout?: number
  }) {
    const timeout = opts.timeout ?? K8S_READ_LOGS_TIMEOUT_MS
    return this.runKubernetesOperation('read pod logs', timeout + 1_000, () =>
      readPodLogsAsync({ ...opts, timeout }),
    )
  }

  restorePvcFromSnapshot(opts: {
    namespace: string
    pvcName: string
    snapshotName: string
    kubeconfig?: string
    accessModes?: string[]
    storage?: string
    storageClassName?: string
    timeoutMs?: number
  }) {
    const timeoutMs = opts.timeoutMs ?? K8S_RESTORE_PVC_TIMEOUT_MS
    return this.runKubernetesOperation('restore pvc from snapshot', timeoutMs + 5_000, () =>
      restorePvcFromVolumeSnapshot({ ...opts, timeoutMs }),
    )
  }

  async streamPodLogs(opts: {
    namespace: string
    pod: string
    container?: string
    follow?: boolean
    tail?: number
    kubeconfig?: string
  }): Promise<{ proc: ChildProcess; cleanup: () => void }> {
    assertKubernetesName(opts.namespace, 'namespace')
    assertKubernetesName(opts.pod, 'pod')
    if (opts.container) assertKubernetesName(opts.container, 'container')

    const release = this.reserveSession(
      'pod log stream',
      this.logStreamSessions,
      K8S_MAX_LOG_STREAMS,
    )
    let runtimeArgs: { args: string[]; cleanup: () => Promise<void> } | undefined
    let proc: ChildProcess
    try {
      runtimeArgs = await createKubectlRuntimeArgs(opts.kubeconfig)
      const args = [...runtimeArgs.args, 'logs', '-n', opts.namespace, opts.pod]
      if (opts.container) args.push('-c', opts.container)
      if (opts.follow !== false) args.push('-f')
      if (opts.tail !== undefined) args.push(`--tail=${opts.tail}`)
      args.push('--timestamps')
      proc = spawnProcess('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      release()
      throw err
    }

    let closed = false
    const lifetimeTimer = setTimeout(() => {
      this.deps.logger.warn(
        { namespace: opts.namespace, pod: opts.pod },
        '[k8s-gateway] closing stale pod log stream',
      )
      cleanup()
    }, K8S_LOG_STREAM_MAX_MS)
    unrefTimer(lifetimeTimer)

    const cleanup = () => {
      if (closed) return
      closed = true
      clearTimeout(lifetimeTimer)
      release()
      void runtimeArgs?.cleanup()
      if (!proc.killed) proc.kill('SIGTERM')
    }

    proc.on('close', cleanup)
    proc.on('error', cleanup)

    return { proc, cleanup }
  }

  execInPod(opts: {
    namespace: string
    pod: string
    container?: string
    kubeconfig?: string
    timeout?: number
    command: string[]
  }) {
    const timeout = opts.timeout ?? K8S_EXEC_TIMEOUT_MS
    return this.runKubernetesOperation('exec in pod', timeout + 1_000, () =>
      execInPodAsync({ ...opts, timeout }),
    )
  }

  execInPodWithInput(opts: {
    namespace: string
    pod: string
    container?: string
    kubeconfig?: string
    timeout?: number
    input: string
    command: string[]
  }) {
    const timeout = opts.timeout ?? K8S_EXEC_INPUT_TIMEOUT_MS
    return this.runKubernetesOperation('exec in pod with input', timeout + 1_000, () =>
      execInPodWithInputAsync({ ...opts, timeout }),
    )
  }

  applyManifest(opts: {
    manifest: Record<string, unknown>
    kubeconfig?: string
    timeout?: number
  }) {
    const timeout = opts.timeout ?? K8S_APPLY_TIMEOUT_MS
    return this.runKubernetesOperation('apply manifest', timeout + 1_000, () =>
      applyKubernetesManifestAsync(opts.manifest, opts.kubeconfig, timeout),
    )
  }

  deleteDeployment(namespace: string, name: string, kubeconfig?: string) {
    assertKubernetesName(namespace, 'namespace')
    assertKubernetesName(name, 'deployment')
    return this.runKubernetesOperation(
      'delete deployment',
      K8S_DELETE_DEPLOYMENT_TIMEOUT_MS + 1_000,
      async () => {
        await runKubectlProcess({
          args: [
            '-n',
            namespace,
            'delete',
            'deployment',
            name,
            '--ignore-not-found=true',
            '--wait=true',
            `--timeout=${K8S_DELETE_DEPLOYMENT_TIMEOUT_MS}ms`,
          ],
          kubeconfig,
          timeoutMs: K8S_DELETE_DEPLOYMENT_TIMEOUT_MS,
          description: `kubectl delete deployment ${namespace}/${name}`,
        })
      },
    )
  }

  hasSecret(opts: { namespace: string; name: string; kubeconfig?: string; timeout?: number }) {
    const timeout = opts.timeout ?? K8S_READ_LOGS_TIMEOUT_MS
    return this.runKubernetesOperation('check secret', timeout + 1_000, () =>
      kubectlResourceExists({ ...opts, kind: 'secret', timeout }),
    )
  }

  async portForwardService(opts: {
    namespace: string
    serviceName: string
    targetPort: number
    kubeconfig?: string
  }): Promise<KubernetesPortForwardSession> {
    assertKubernetesName(opts.namespace, 'namespace')
    assertKubernetesName(opts.serviceName, 'service')
    if (!Number.isInteger(opts.targetPort) || opts.targetPort < 1 || opts.targetPort > 65535) {
      throw Object.assign(new Error('Invalid Kubernetes service port'), { status: 422 })
    }

    const release = this.reserveSession(
      'port-forward',
      this.portForwardSessions,
      K8S_MAX_PORT_FORWARDS,
    )
    let runtimeArgs: { args: string[]; cleanup: () => Promise<void> } | undefined
    let proc: ChildProcess | undefined
    let lifetimeTimer: ReturnType<typeof setTimeout> | undefined
    let closed = false
    const cleanup = () => {
      if (closed) return
      closed = true
      if (lifetimeTimer) clearTimeout(lifetimeTimer)
      release()
      void runtimeArgs?.cleanup()
      if (proc && !proc.killed) proc.kill('SIGTERM')
    }

    try {
      const localPort = await reserveLocalPort()
      runtimeArgs = await createKubectlRuntimeArgs(opts.kubeconfig)
      const args = [
        ...runtimeArgs.args,
        '-n',
        opts.namespace,
        'port-forward',
        '--address',
        '127.0.0.1',
        `svc/${opts.serviceName}`,
        `${localPort}:${opts.targetPort}`,
      ]
      proc = spawnProcess('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let settled = false
      let output = ''

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error(`Kubernetes port-forward timed out: ${output.trim()}`))
        }, PORT_FORWARD_READY_MS)

        const onChunk = (chunk: Buffer) => {
          output += chunk.toString('utf8')
          if (settled || !/Forwarding from/i.test(output)) return
          settled = true
          clearTimeout(timer)
          resolve()
        }

        proc?.stdout?.on('data', onChunk)
        proc?.stderr?.on('data', onChunk)
        proc?.on('error', (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          cleanup()
          reject(error)
        })
        proc?.on('close', (code) => {
          cleanup()
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(
            new Error(output.trim() || `Kubernetes port-forward exited with code ${code ?? 1}`),
          )
        })
      })

      lifetimeTimer = setTimeout(() => {
        this.deps.logger.warn(
          { namespace: opts.namespace, serviceName: opts.serviceName },
          '[k8s-gateway] closing stale port-forward',
        )
        cleanup()
      }, K8S_PORT_FORWARD_MAX_MS)
      unrefTimer(lifetimeTimer)

      return {
        localPort,
        proc,
        cleanup,
      }
    } catch (err) {
      cleanup()
      throw err
    }
  }

  async spawnInteractiveTerminal(opts: {
    namespace: string
    pod: string
    container?: string
    kubeconfig?: string
    shell?: string
    cols?: number
    rows?: number
  }): Promise<KubernetesInteractiveTerminalSession> {
    assertKubernetesName(opts.namespace, 'namespace')
    assertKubernetesName(opts.pod, 'pod')
    if (opts.container) assertKubernetesName(opts.container, 'container')

    const release = this.reserveSession(
      'interactive terminal',
      this.terminalSessions,
      K8S_MAX_TERMINALS,
    )
    const runtimeArgs = await createKubectlRuntimeArgs(opts.kubeconfig)
    let terminal: IPty | null = null
    let fallbackProcess: ChildProcess | null = null
    try {
      const args = [...runtimeArgs.args, '-n', opts.namespace, 'exec', '-it', opts.pod]
      if (opts.container) args.push('-c', opts.container)
      args.push('--', sanitizeShell(opts.shell), '-l')

      terminal = spawnPty('kubectl', args, {
        name: 'xterm-256color',
        cols: clampTerminalSize(opts.cols, 120, 20, 240),
        rows: clampTerminalSize(opts.rows, 32, 8, 80),
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
        },
      })
    } catch (err) {
      this.deps.logger.warn(
        { err, namespace: opts.namespace, pod: opts.pod },
        '[k8s-gateway] PTY unavailable; falling back to a pipe-backed terminal',
      )
      try {
        const args = [...runtimeArgs.args, '-n', opts.namespace, 'exec', '-i', opts.pod]
        if (opts.container) args.push('-c', opts.container)
        args.push('--', sanitizeShell(opts.shell), '-il')
        fallbackProcess = spawnProcess('kubectl', args, {
          cwd: process.cwd(),
          env: { ...process.env, TERM: 'xterm-256color' },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (fallbackError) {
        release()
        void runtimeArgs.cleanup()
        throw fallbackError
      }
    }

    let closed = false
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (closed) return
      closed = true
      if (idleTimer) clearTimeout(idleTimer)
      release()
      void runtimeArgs.cleanup()
    }
    const resetIdleTimer = () => {
      if (closed) return
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        this.deps.logger.warn(
          { namespace: opts.namespace, pod: opts.pod },
          '[k8s-gateway] closing idle interactive terminal',
        )
        cleanup()
        terminal?.kill()
        fallbackProcess?.kill('SIGTERM')
      }, K8S_TERMINAL_IDLE_MS)
      unrefTimer(idleTimer)
    }
    resetIdleTimer()
    if (terminal) {
      terminal.onExit(cleanup)

      return {
        write(data: string) {
          if (closed) return
          resetIdleTimer()
          terminal.write(data)
        },
        resize(cols: number, rows: number) {
          if (closed) return
          resetIdleTimer()
          terminal.resize(clampTerminalSize(cols, 120, 20, 240), clampTerminalSize(rows, 32, 8, 80))
        },
        kill() {
          cleanup()
          terminal.kill()
        },
        onData(listener: (data: string) => void) {
          terminal.onData((data) => {
            resetIdleTimer()
            listener(data)
          })
        },
        onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
          terminal.onExit((event) => {
            cleanup()
            listener(event)
          })
        },
      }
    }

    const child = fallbackProcess
    if (!child) {
      cleanup()
      throw new Error('Failed to start Kubernetes terminal')
    }
    const dataListeners = new Set<(data: string) => void>()
    const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
    let bufferedData = ''
    let pendingInput = ''
    let exitEvent: { exitCode: number; signal?: number } | null = null
    const emitData = (data: string) => {
      resetIdleTimer()
      if (dataListeners.size === 0) {
        bufferedData = `${bufferedData}${data}`.slice(-64 * 1024)
        return
      }
      for (const listener of dataListeners) listener(data)
    }
    const writePipeInput = (data: string) => {
      const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      for (const character of normalized) {
        if (character === '\n') {
          child.stdin?.write(`${pendingInput}\n`)
          pendingInput = ''
          emitData('\r\n')
          continue
        }
        if (character === '\u007f' || character === '\b') {
          const characters = Array.from(pendingInput)
          if (characters.length === 0) continue
          characters.pop()
          pendingInput = characters.join('')
          emitData('\b \b')
          continue
        }
        if (character === '\u0003') {
          pendingInput = ''
          emitData('^C\r\n')
          child.kill('SIGINT')
          continue
        }
        if (character >= ' ' || character === '\t') {
          pendingInput += character
          emitData(character)
        }
      }
    }
    const emitExit = (event: { exitCode: number; signal?: number }) => {
      if (exitEvent) return
      exitEvent = event
      cleanup()
      for (const listener of exitListeners) listener(event)
    }
    child.stdout?.on('data', (chunk) => emitData(String(chunk)))
    child.stderr?.on('data', (chunk) => emitData(String(chunk)))
    child.once('error', (error) => {
      emitData(`${error.message}\r\n`)
      emitExit({ exitCode: 1 })
    })
    child.once('exit', (code) => emitExit({ exitCode: code ?? 1 }))

    return {
      write(data: string) {
        if (closed || !child.stdin?.writable) return
        resetIdleTimer()
        writePipeInput(data)
      },
      resize() {
        if (!closed) resetIdleTimer()
      },
      kill() {
        cleanup()
        child.kill('SIGTERM')
      },
      onData(listener: (data: string) => void) {
        dataListeners.add(listener)
        if (bufferedData) {
          const data = bufferedData
          bufferedData = ''
          listener(data)
        }
      },
      onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
        exitListeners.add(listener)
        if (exitEvent) queueMicrotask(() => listener(exitEvent!))
      },
    }
  }

  /**
   * Delete a Kubernetes namespace.
   *
   * IMPORTANT: Callers are responsible for authorization checks before
   * invoking this method. This is a pass-through to the underlying
   * Kubernetes runtime — it does NOT perform access control on its own.
   */
  deleteNamespace(namespace: string, kubeconfig?: string) {
    assertKubernetesName(namespace, 'namespace')
    return this.runKubernetesOperation(
      'delete namespace',
      K8S_DELETE_NAMESPACE_TIMEOUT_MS + 1_000,
      async () => {
        await runKubectlProcess({
          args: ['delete', 'namespace', namespace, '--ignore-not-found=true', '--wait=false'],
          kubeconfig,
          timeoutMs: K8S_DELETE_NAMESPACE_TIMEOUT_MS,
          description: `kubectl delete namespace ${namespace}`,
        })
      },
    )
  }
}
