/**
 * Runtime kubectl helper set used by SaaS orchestration and APIs.
 *
 * This module supports both explicit kubeconfig content and ambient kubeconfig
 * discovery from process env / local defaults. It also rewrites localhost
 * kubeconfig endpoints for containerized runtime access where needed.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { rewriteLoopbackKubeconfig } from '../services/deployment-runtime.service.js'

export interface K8sPodSummary {
  name: string
  ready: string
  status: string
  restarts: number
  age: string
}

export interface K8sExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

function isContainerizedRuntime(): boolean {
  return process.env.SHADOW_CONTAINERIZED === '1' || existsSync('/.dockerenv')
}

function getHostLocalKubeconfigPaths(): string[] {
  const candidates = [process.env.KUBECONFIG_HOST_PATH?.trim()]

  if (!isContainerizedRuntime()) {
    candidates.push(
      ...(process.env.KUBECONFIG?.split(delimiter)
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length > 0) ?? []),
      join(homedir(), '.kube', 'config'),
    )
  }

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))]
}

function isHostLocalKubeconfigPath(candidate: string | undefined): boolean {
  if (!candidate) return false
  return getHostLocalKubeconfigPaths().includes(candidate)
}

function resolveAmbientKubeconfig():
  | {
      kubeconfig: string
      shouldRewriteLoopback: boolean
    }
  | undefined {
  const envCandidates =
    process.env.KUBECONFIG?.split(delimiter)
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0) ?? []

  const kubeconfigPath = [
    ...envCandidates,
    process.env.KUBECONFIG_HOST_PATH?.trim(),
    join(homedir(), '.kube', 'config'),
  ]
    .filter((candidate): candidate is string => Boolean(candidate))
    .find((candidate) => existsSync(candidate))

  if (!kubeconfigPath) {
    return undefined
  }

  return {
    kubeconfig: readFileSync(kubeconfigPath, 'utf-8'),
    shouldRewriteLoopback: !isHostLocalKubeconfigPath(kubeconfigPath),
  }
}

function createTempKubeconfig(
  kubeconfig: string,
  includeAmbientContext = false,
  rewriteLoopback = true,
): {
  args: string[]
  cleanup: () => void
} {
  const dir = mkdtempSync(join(tmpdir(), 'sc-saas-kube-'))
  const path = join(dir, 'kubeconfig')
  const rewritten = rewriteLoopback
    ? rewriteLoopbackKubeconfig(kubeconfig, process.env.KUBECONFIG_LOOPBACK_HOST)
    : kubeconfig
  writeFileSync(path, rewritten, { mode: 0o600 })

  const args = ['--kubeconfig', path]
  if (includeAmbientContext && process.env.KUBECONFIG_CONTEXT?.trim()) {
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

function withKubeconfig<T>(kubeconfig: string | undefined, fn: (kubeArgs: string[]) => T): T {
  const explicitKubeconfig = kubeconfig?.trim() ? kubeconfig : undefined
  const ambientKubeconfig = explicitKubeconfig ? undefined : resolveAmbientKubeconfig()
  const effectiveKubeconfig = explicitKubeconfig ?? ambientKubeconfig?.kubeconfig
  if (!effectiveKubeconfig) {
    return fn([])
  }

  const { args, cleanup } = createTempKubeconfig(
    effectiveKubeconfig,
    !explicitKubeconfig,
    explicitKubeconfig ? true : (ambientKubeconfig?.shouldRewriteLoopback ?? true),
  )
  try {
    return fn(args)
  } finally {
    cleanup()
  }
}

function execKubectl(args: string[], kubeconfig?: string, timeout = 15_000): string {
  return withKubeconfig(kubeconfig, (kubeArgs) =>
    execFileSync('kubectl', [...kubeArgs, ...args], {
      encoding: 'utf-8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
}

function isNamespaceNotFound(error: unknown): boolean {
  return error instanceof Error && /not found/i.test(error.message)
}

export function listPods(namespace: string, kubeconfig?: string): K8sPodSummary[] {
  try {
    const out = execKubectl(['-n', namespace, 'get', 'pods', '-o', 'json'], kubeconfig)
    const data = JSON.parse(out) as { items?: Array<Record<string, unknown>> }
    return (data.items ?? []).map((item) => {
      const meta = (item.metadata ?? {}) as Record<string, unknown>
      const status = (item.status ?? {}) as Record<string, unknown>
      const containers = (status.containerStatuses ?? []) as Array<Record<string, unknown>>
      const restarts = containers.reduce((s, c) => s + ((c.restartCount as number) ?? 0), 0)
      const ready = containers.filter((c) => c.ready).length
      return {
        name: meta.name as string,
        ready: `${ready}/${containers.length}`,
        status: (status.phase as string) ?? 'Unknown',
        restarts,
        age: (meta.creationTimestamp as string) ?? '',
      }
    })
  } catch {
    return []
  }
}

export function spawnPodLogStream(opts: {
  namespace: string
  pod: string
  container?: string
  follow?: boolean
  tail?: number
  kubeconfig?: string
}): { proc: ReturnType<typeof spawn>; cleanup: () => void } {
  const args: string[] = []
  let cleanup = () => {}

  const explicitKubeconfig = opts.kubeconfig?.trim() ? opts.kubeconfig : undefined
  const ambientKubeconfig = explicitKubeconfig ? undefined : resolveAmbientKubeconfig()
  const effectiveKubeconfig = explicitKubeconfig ?? ambientKubeconfig?.kubeconfig
  if (effectiveKubeconfig) {
    const tempKubeconfig = createTempKubeconfig(
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
}): string {
  const args = ['logs', '-n', opts.namespace, opts.pod]
  if (opts.container) args.push('-c', opts.container)
  if (opts.tail !== undefined) args.push(`--tail=${opts.tail}`)
  if (opts.timestamps) args.push('--timestamps')
  return execKubectl(args, opts.kubeconfig)
}

export function execInPod(opts: {
  namespace: string
  pod: string
  command: string[]
  container?: string
  kubeconfig?: string
  timeout?: number
}): K8sExecResult {
  return withKubeconfig(opts.kubeconfig, (kubeArgs) => {
    const args = [...kubeArgs, '-n', opts.namespace, 'exec', opts.pod]
    if (opts.container) args.push('-c', opts.container)
    args.push('--', ...opts.command)

    const result = spawnSync('kubectl', args, {
      encoding: 'utf-8',
      timeout: opts.timeout ?? 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    }
  })
}

export function listManagedNamespaces(kubeconfig?: string): string[] | null {
  try {
    const out = execKubectl(['get', 'ns', '-o', 'json'], kubeconfig, 10_000)
    const data = JSON.parse(out) as {
      items?: Array<{
        metadata?: {
          name?: string
          labels?: Record<string, string | undefined>
        }
      }>
    }

    return (data.items ?? [])
      .filter((item) => {
        const labels = item.metadata?.labels ?? {}
        return (
          labels['shadowob-cloud/managed'] === 'true' ||
          labels['managed-by'] === 'shadowob-cloud-cli'
        )
      })
      .map((item) => item.metadata?.name)
      .filter((name): name is string => Boolean(name))
  } catch {
    return null
  }
}

export function namespaceExists(namespace: string, kubeconfig?: string): boolean | null {
  try {
    const out = execKubectl(
      ['get', 'ns', namespace, '--ignore-not-found', '-o', 'name'],
      kubeconfig,
      10_000,
    ).trim()
    return out.length > 0
  } catch (error) {
    if (isNamespaceNotFound(error)) {
      return false
    }
    return null
  }
}

export function deleteNamespace(namespace: string, kubeconfig?: string): void {
  execKubectl(['delete', 'namespace', namespace, '--wait=false'], kubeconfig)
}
