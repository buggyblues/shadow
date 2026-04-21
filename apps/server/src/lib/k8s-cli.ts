/**
 * Lightweight kubectl wrapper used by the SaaS API to inspect K8s state for a
 * deployment without going through the cloud worker. Intentionally minimal:
 * `kubectl` must be installed in the server image, and a kubeconfig is either
 * provided per-call or read from the standard KUBECONFIG env var.
 *
 * SECURITY: kubeconfig content is written to a private temp file (mode 0600)
 * for the duration of each call and removed in the finally block. We never
 * log the content.
 */
import { execSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface K8sPodSummary {
  name: string
  ready: string
  status: string
  restarts: number
  age: string
}

function withKubeconfig<T>(kubeconfig: string | undefined, fn: (kArg: string) => T): T {
  if (!kubeconfig) {
    return fn('')
  }
  const dir = mkdtempSync(join(tmpdir(), 'sc-saas-kube-'))
  const path = join(dir, 'kubeconfig')
  writeFileSync(path, kubeconfig, { mode: 0o600 })
  try {
    return fn(`--kubeconfig=${path}`)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * List pods in a namespace.
 */
export function listPods(namespace: string, kubeconfig?: string): K8sPodSummary[] {
  return withKubeconfig(kubeconfig, (kArg) => {
    try {
      const cmd = `kubectl ${kArg} -n ${shellQuote(namespace)} get pods -o json`
      const out = execSync(cmd, { encoding: 'utf-8', timeout: 15_000 })
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
  })
}

/**
 * Spawn a `kubectl logs -f` process. Caller must `kill()` on stream abort.
 * Note: the temp kubeconfig file is intentionally NOT removed while the
 * spawned process is alive — the caller closes the stream and we clean up
 * via the returned `cleanup()` function.
 */
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

  if (opts.kubeconfig) {
    const dir = mkdtempSync(join(tmpdir(), 'sc-saas-kube-'))
    const path = join(dir, 'kubeconfig')
    writeFileSync(path, opts.kubeconfig, { mode: 0o600 })
    args.push(`--kubeconfig=${path}`)
    cleanup = () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
  args.push('logs', '-n', opts.namespace, opts.pod)
  if (opts.container) args.push('-c', opts.container)
  if (opts.follow !== false) args.push('-f')
  if (opts.tail !== undefined) args.push(`--tail=${opts.tail}`)
  args.push('--timestamps')

  const proc = spawn('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  return { proc, cleanup }
}

/**
 * List all namespaces tagged as managed by Shadow Cloud on the *default*
 * cluster (KUBECONFIG). Used for orphan reconcile in the SaaS API. Returns
 * `null` if kubectl is not installed (so callers can degrade gracefully).
 */
export function listManagedNamespaces(kubeconfig?: string): string[] | null {
  return withKubeconfig(kubeconfig, (kArg) => {
    try {
      const cmd = `kubectl ${kArg} get ns -l shadowob-cloud/managed=true -o jsonpath={.items[*].metadata.name}`
      const out = execSync(cmd, { encoding: 'utf-8', timeout: 10_000 }).trim()
      return out.length === 0 ? [] : out.split(/\s+/)
    } catch {
      return null
    }
  })
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
