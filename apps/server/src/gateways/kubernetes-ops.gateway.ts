import { type ChildProcess, spawn as spawnProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  applyKubernetesManifestAsync,
  deleteNamespace,
  execInPodAsync,
  execInPodWithInputAsync,
  listManagedNamespaces,
  listPodsAsync,
  readPodLogsAsync,
  restorePvcFromVolumeSnapshot,
  rewriteLoopbackKubeconfig,
  spawnPodLogStream,
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

function assertKubernetesName(value: string, label: string) {
  if (!K8S_NAME_RE.test(value)) {
    throw Object.assign(new Error(`Invalid Kubernetes ${label}`), { status: 422 })
  }
}

function sanitizeShell(shell: string | undefined) {
  if (!shell) return '/bin/sh'
  return TERMINAL_SHELLS.has(shell) ? shell : '/bin/sh'
}

function clampTerminalSize(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.floor(value as number), min), max)
}

function isContainerizedRuntime(): boolean {
  return process.env.SHADOWOB_CONTAINERIZED === '1' || existsSync('/.dockerenv')
}

function defaultKubeconfigPath(): string {
  return join(homedir(), '.kube', 'config')
}

function getHostLocalKubeconfigPaths(): string[] {
  const candidates = [process.env.KUBECONFIG_HOST_PATH?.trim()]
  if (!isContainerizedRuntime()) {
    candidates.push(
      ...(process.env.KUBECONFIG?.split(delimiter)
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length > 0) ?? []),
      defaultKubeconfigPath(),
    )
  }
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

function isHostLocalKubeconfigPath(candidate: string | undefined): boolean {
  return Boolean(candidate && getHostLocalKubeconfigPaths().includes(candidate))
}

function extractCurrentContext(kubeconfigYaml: string): string | undefined {
  return kubeconfigYaml.match(/current-context:\s*(\S+)/)?.[1]
}

function readKubeconfigIfReadable(candidate: string | undefined): string | null {
  if (!candidate || !existsSync(candidate)) return null
  try {
    const stat = statSync(candidate)
    if (!stat.isFile() || stat.size === 0) return null
    return readFileSync(candidate, 'utf8')
  } catch {
    return null
  }
}

function resolveAmbientKubeconfig(): {
  kubeconfig: string
  shouldRewriteLoopback: boolean
} | null {
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
    const kubeconfig = readKubeconfigIfReadable(candidate)
    if (!kubeconfig) continue
    return {
      kubeconfig,
      shouldRewriteLoopback: !isHostLocalKubeconfigPath(candidate),
    }
  }
  return null
}

function createTempKubeconfig(
  kubeconfig: string,
  includeAmbientContext: boolean,
  rewriteLoopback: boolean,
): { args: string[]; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'sc-terminal-kube-'))
  const path = join(dir, 'kubeconfig')
  const rewritten = rewriteLoopback
    ? rewriteLoopbackKubeconfig(kubeconfig, process.env.KUBECONFIG_LOOPBACK_HOST)
    : kubeconfig
  writeFileSync(path, rewritten, { mode: 0o600 })

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
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    },
  }
}

function createKubectlRuntimeArgs(kubeconfig?: string): { args: string[]; cleanup: () => void } {
  const explicitKubeconfig = kubeconfig?.trim() ? kubeconfig : undefined
  const ambientKubeconfig = explicitKubeconfig ? null : resolveAmbientKubeconfig()
  const effectiveKubeconfig = explicitKubeconfig ?? ambientKubeconfig?.kubeconfig
  if (!effectiveKubeconfig) return { args: [], cleanup: () => {} }

  return createTempKubeconfig(
    effectiveKubeconfig,
    !explicitKubeconfig,
    explicitKubeconfig ? true : (ambientKubeconfig?.shouldRewriteLoopback ?? true),
  )
}

function kubectlResourceExists(opts: {
  namespace: string
  kind: 'secret'
  name: string
  kubeconfig?: string
  timeout?: number
}) {
  assertKubernetesName(opts.namespace, 'namespace')
  assertKubernetesName(opts.name, opts.kind)
  const runtimeArgs = createKubectlRuntimeArgs(opts.kubeconfig)
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
      runtimeArgs.cleanup()
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
      runtimeArgs.cleanup()
      reject(error)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      runtimeArgs.cleanup()
      if (code === 0) {
        resolve(stdout.trim().length > 0)
        return
      }
      reject(new Error(stderr.trim() || `kubectl get ${opts.kind} exited with code ${code ?? 1}`))
    })
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
  constructor(
    private deps: {
      accessService: AccessService
      cloudDeploymentDao: CloudDeploymentDao
      logger: Logger
    },
  ) {}

  listManagedNamespaces() {
    return listManagedNamespaces() ?? []
  }

  async assertManagedOrphanNamespace(namespace: string) {
    const managed = this.listManagedNamespaces()
    if (!managed.includes(namespace)) {
      throw Object.assign(new Error('Namespace is not managed by this platform'), { status: 422 })
    }

    const existing = await this.deps.cloudDeploymentDao.findByNamespaceGlobal(namespace)
    if (existing) {
      throw scopeMismatch('Namespace is already owned by a deployment')
    }
  }

  async cleanupManagedOrphanNamespace(input: { actor: ActorInput; namespace: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.actor)
    await this.assertManagedOrphanNamespace(input.namespace)
    this.deps.logger.warn({ namespace: input.namespace }, '[k8s-gateway] deleting orphan namespace')
    deleteNamespace(input.namespace)
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
    return listPodsAsync(namespace, kubeconfig)
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
    return readPodLogsAsync(opts)
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
    return restorePvcFromVolumeSnapshot(opts)
  }

  streamPodLogs(opts: {
    namespace: string
    pod: string
    container?: string
    follow?: boolean
    tail?: number
    kubeconfig?: string
  }): { proc: ChildProcess; cleanup: () => void } {
    return spawnPodLogStream(opts)
  }

  execInPod(opts: {
    namespace: string
    pod: string
    container?: string
    kubeconfig?: string
    timeout?: number
    command: string[]
  }) {
    return execInPodAsync(opts)
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
    return execInPodWithInputAsync(opts)
  }

  applyManifest(opts: {
    manifest: Record<string, unknown>
    kubeconfig?: string
    timeout?: number
  }) {
    return applyKubernetesManifestAsync(opts.manifest, opts.kubeconfig, opts.timeout)
  }

  hasSecret(opts: { namespace: string; name: string; kubeconfig?: string; timeout?: number }) {
    return kubectlResourceExists({ ...opts, kind: 'secret' })
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

    const localPort = await reserveLocalPort()
    const runtimeArgs = createKubectlRuntimeArgs(opts.kubeconfig)
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
    const proc = spawnProcess('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let settled = false
    let output = ''

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill('SIGTERM')
        reject(new Error(`Kubernetes port-forward timed out: ${output.trim()}`))
      }, PORT_FORWARD_READY_MS)

      const onChunk = (chunk: Buffer) => {
        output += chunk.toString('utf8')
        if (settled || !/Forwarding from/i.test(output)) return
        settled = true
        clearTimeout(timer)
        resolve()
      }

      proc.stdout?.on('data', onChunk)
      proc.stderr?.on('data', onChunk)
      proc.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      })
      proc.on('close', (code) => {
        runtimeArgs.cleanup()
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(output.trim() || `Kubernetes port-forward exited with code ${code ?? 1}`))
      })
    })

    return {
      localPort,
      proc,
      cleanup: () => {
        runtimeArgs.cleanup()
        if (!proc.killed) proc.kill('SIGTERM')
      },
    }
  }

  spawnInteractiveTerminal(opts: {
    namespace: string
    pod: string
    container?: string
    kubeconfig?: string
    shell?: string
    cols?: number
    rows?: number
  }): KubernetesInteractiveTerminalSession {
    assertKubernetesName(opts.namespace, 'namespace')
    assertKubernetesName(opts.pod, 'pod')
    if (opts.container) assertKubernetesName(opts.container, 'container')

    const runtimeArgs = createKubectlRuntimeArgs(opts.kubeconfig)
    const args = [...runtimeArgs.args, '-n', opts.namespace, 'exec', '-it', opts.pod]
    if (opts.container) args.push('-c', opts.container)
    args.push('--', sanitizeShell(opts.shell), '-l')

    const terminal: IPty = spawnPty('kubectl', args, {
      name: 'xterm-256color',
      cols: clampTerminalSize(opts.cols, 120, 20, 240),
      rows: clampTerminalSize(opts.rows, 32, 8, 80),
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    })

    let closed = false
    const cleanup = () => {
      if (closed) return
      closed = true
      runtimeArgs.cleanup()
    }
    terminal.onExit(cleanup)

    return {
      write(data: string) {
        if (!closed) terminal.write(data)
      },
      resize(cols: number, rows: number) {
        if (closed) return
        terminal.resize(clampTerminalSize(cols, 120, 20, 240), clampTerminalSize(rows, 32, 8, 80))
      },
      kill() {
        cleanup()
        terminal.kill()
      },
      onData(listener: (data: string) => void) {
        terminal.onData(listener)
      },
      onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
        terminal.onExit((event) => {
          cleanup()
          listener(event)
        })
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
    deleteNamespace(namespace, kubeconfig)
  }
}
