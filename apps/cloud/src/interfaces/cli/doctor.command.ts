/**
 * CLI: shadowob-cloud doctor — check all prerequisites and system health.
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { platform } from 'node:os'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  hint?: string
  fixCmd?: string
}

type KindContainerHealth = {
  cluster: string
  containerName: string
  status: string
  restartCount: number
  restartPolicy: string
  ageDays: number | null
}

type KubernetesPodIssue = {
  namespace: string
  name: string
  reason: string
  restarts: number
}

function getVersion(cmd: string, versionFlag = '--version'): string | null {
  try {
    return execSync(`${cmd} ${versionFlag}`, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

function hasBrew(): boolean {
  try {
    execSync('which brew', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

function runFile(cmd: string, args: string[], timeout = 10_000): string {
  return execFileSync(cmd, args, {
    encoding: 'utf-8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function summarize(items: string[], limit = 5): string {
  if (items.length <= limit) return items.join('; ')
  return `${items.slice(0, limit).join('; ')}; +${items.length - limit} more`
}

function daysSince(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000))
}

function getKindClusters(): string[] {
  try {
    return runFile('kind', ['get', 'clusters'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function inspectKindControlPlane(cluster: string): KindContainerHealth | null {
  const containerName = `${cluster}-control-plane`
  try {
    const inspected = JSON.parse(runFile('docker', ['inspect', containerName], 5000)) as Array<{
      State?: { Status?: string; StartedAt?: string }
      RestartCount?: number
      HostConfig?: { RestartPolicy?: { Name?: string } }
    }>
    const item = inspected[0]
    if (!item) return null
    return {
      cluster,
      containerName,
      status: item.State?.Status ?? 'unknown',
      restartCount: item.RestartCount ?? 0,
      restartPolicy: item.HostConfig?.RestartPolicy?.Name ?? 'unknown',
      ageDays: daysSince(item.State?.StartedAt),
    }
  } catch {
    return null
  }
}

function runtimeKindChecks(): CheckResult[] {
  const clusters = getKindClusters()
  if (clusters.length === 0) {
    return [{ name: 'kind runtime', status: 'pass', message: 'no local kind clusters' }]
  }

  const containers = clusters
    .map(inspectKindControlPlane)
    .filter((item): item is KindContainerHealth => Boolean(item))
  if (containers.length === 0) {
    return [
      { name: 'kind runtime', status: 'warn', message: 'clusters exist but Docker inspect failed' },
    ]
  }

  const stale = containers.filter((item) => (item.ageDays ?? 0) >= 7)
  const veryStale = containers.filter((item) => (item.ageDays ?? 0) >= 30)
  const unhealthy = containers.filter((item) => item.status !== 'running' || item.restartCount > 0)
  const status: CheckResult['status'] =
    veryStale.length > 0 || unhealthy.some((item) => item.status !== 'running')
      ? 'fail'
      : stale.length > 0 || unhealthy.length > 0
        ? 'warn'
        : 'pass'

  const details = containers.map((item) => {
    const age = item.ageDays === null ? 'unknown age' : `${item.ageDays}d`
    return `${item.cluster}:${item.status},${age},restarts=${item.restartCount},policy=${item.restartPolicy}`
  })
  return [
    {
      name: 'kind runtime',
      status,
      message: summarize(details, 4),
      hint:
        stale.length > 0
          ? `Long-running local clusters should be restarted or deleted before they accumulate orphaned pods/events. Stop only: ${summarize(
              stale.map((item) => `docker stop ${item.containerName}`),
              3,
            )}`
          : undefined,
    },
  ]
}

function podIssuesFromKubernetes(): KubernetesPodIssue[] {
  try {
    const output = runFile('kubectl', ['get', 'pods', '-A', '-o', 'json'], 15_000)
    const data = JSON.parse(output) as { items?: Array<Record<string, unknown>> }
    const issues: KubernetesPodIssue[] = []
    for (const pod of data.items ?? []) {
      const metadata = (pod.metadata ?? {}) as Record<string, unknown>
      const status = (pod.status ?? {}) as Record<string, unknown>
      const namespace = String(metadata.namespace ?? 'default')
      const name = String(metadata.name ?? 'unknown')
      const phase = String(status.phase ?? 'Unknown')
      const containerStatuses = (status.containerStatuses ?? []) as Array<Record<string, unknown>>
      const initContainerStatuses = (status.initContainerStatuses ?? []) as Array<
        Record<string, unknown>
      >
      const allStatuses = [...containerStatuses, ...initContainerStatuses]
      const restarts = allStatuses.reduce((sum, item) => sum + (Number(item.restartCount) || 0), 0)
      const waitingReasons = allStatuses
        .map(
          (item) =>
            ((item.state as Record<string, unknown> | undefined)?.waiting ?? {}) as Record<
              string,
              unknown
            >,
        )
        .map((waiting) => String(waiting.reason ?? ''))
        .filter(Boolean)
      const terminatedReasons = allStatuses
        .map(
          (item) =>
            ((item.lastState as Record<string, unknown> | undefined)?.terminated ?? {}) as Record<
              string,
              unknown
            >,
        )
        .map((terminated) => String(terminated.reason ?? ''))
        .filter(Boolean)
      const reason =
        waitingReasons.find((item) =>
          /CrashLoopBackOff|ImagePullBackOff|ErrImagePull/i.test(item),
        ) ??
        terminatedReasons.find((item) => /OOMKilled|Error/i.test(item)) ??
        (phase === 'Failed' || phase === 'Unknown'
          ? phase
          : restarts >= 5
            ? 'HighRestartCount'
            : '')
      if (reason) issues.push({ namespace, name, reason, restarts })
    }
    return issues
  } catch {
    return []
  }
}

function countSystemOomEvents(): number {
  try {
    const output = runFile(
      'kubectl',
      ['get', 'events', '-A', '--field-selector', 'reason=SystemOOM', '-o', 'json'],
      10_000,
    )
    const data = JSON.parse(output) as { items?: unknown[] }
    return data.items?.length ?? 0
  } catch {
    return 0
  }
}

function runtimeKubernetesChecks(container: ServiceContainer): CheckResult[] {
  if (!container.k8s.isToolInstalled('kubectl')) return []
  if (!container.k8s.isKubeReachable()) {
    return [{ name: 'K8s runtime health', status: 'warn', message: 'cluster unreachable' }]
  }

  const podIssues = podIssuesFromKubernetes()
  const systemOoms = countSystemOomEvents()
  const results: CheckResult[] = []

  results.push({
    name: 'K8s pod health',
    status: podIssues.length > 0 ? 'fail' : 'pass',
    message:
      podIssues.length > 0
        ? summarize(
            podIssues.map(
              (pod) => `${pod.namespace}/${pod.name}:${pod.reason},restarts=${pod.restarts}`,
            ),
            5,
          )
        : 'no CrashLoop/OOM/high-restart pods',
    hint:
      podIssues.length > 0
        ? 'Inspect affected pods with kubectl describe pod and bounded logs; fix resource budgets or delete orphaned workloads.'
        : undefined,
  })

  results.push({
    name: 'K8s SystemOOM events',
    status: systemOoms > 0 ? 'fail' : 'pass',
    message: systemOoms > 0 ? `${systemOoms} SystemOOM event(s)` : 'none',
    hint:
      systemOoms > 0
        ? 'Treat this as node-level pressure: stop stale kind control planes, reduce browser/agent limits, and clean orphaned workloads before retrying.'
        : undefined,
  })

  return results
}

function runRuntimeHealthChecks(container: ServiceContainer): CheckResult[] {
  const results: CheckResult[] = []
  if (container.k8s.isToolInstalled('kind') && container.k8s.isToolInstalled('docker')) {
    results.push(...runtimeKindChecks())
  }
  results.push(...runtimeKubernetesChecks(container))
  return results
}

function tryFix(logger: ServiceContainer['logger'], name: string, cmd: string): boolean {
  logger.step(`Attempting to install ${name}...`)
  logger.dim(`  $ ${cmd}`)
  try {
    execSync(cmd, { encoding: 'utf-8', timeout: 120_000, stdio: 'inherit' })
    logger.success(`${name} installed successfully`)
    return true
  } catch {
    logger.error(`Failed to install ${name}. Please install manually.`)
    return false
  }
}

export function createDoctorCommand(container: ServiceContainer) {
  return new Command('doctor')
    .description('Check prerequisites and system health')
    .option('--security', 'Run security configuration checks')
    .option('--runtime', 'Run local kind/Kubernetes runtime health checks')
    .option('--fix', 'Attempt to auto-install missing dependencies')
    .action((options: { security?: boolean; runtime?: boolean; fix?: boolean }) => {
      const results: CheckResult[] = []
      const isMac = platform() === 'darwin'
      const brew = isMac && hasBrew()

      container.logger.step('Checking dependencies...')

      // Node.js
      const nodeVersion = process.version
      const major = Number.parseInt(nodeVersion.slice(1), 10)
      results.push(
        major >= 22
          ? { name: 'Node.js', status: 'pass', message: nodeVersion }
          : {
              name: 'Node.js',
              status: major >= 20 ? 'warn' : 'fail',
              message: `${nodeVersion} (22+ recommended)`,
              hint: 'Install Node.js 22: https://nodejs.org/',
            },
      )

      // Docker
      if (container.k8s.isToolInstalled('docker')) {
        const ver = getVersion('docker')
        results.push({ name: 'Docker', status: 'pass', message: ver ?? 'installed' })
      } else {
        results.push({
          name: 'Docker',
          status: 'fail',
          message: 'not found',
          hint: 'Install Docker: https://docs.docker.com/get-docker/',
          fixCmd: brew ? 'brew install --cask docker' : undefined,
        })
      }

      // kubectl
      if (container.k8s.isToolInstalled('kubectl')) {
        const reachable = container.k8s.isKubeReachable()
        results.push({
          name: 'kubectl',
          status: reachable ? 'pass' : 'warn',
          message: reachable ? 'connected' : 'installed but cluster unreachable',
          hint: reachable
            ? undefined
            : 'Use --local to create a kind cluster, or configure KUBECONFIG',
        })
      } else {
        results.push({
          name: 'kubectl',
          status: 'fail',
          message: 'not found',
          hint: 'Install kubectl: https://kubernetes.io/docs/tasks/tools/',
          fixCmd: brew ? 'brew install kubectl' : undefined,
        })
      }

      // Pulumi (uses `pulumi version` subcommand, not `--version` flag)
      if (container.k8s.isToolInstalled('pulumi')) {
        const ver = getVersion('pulumi', 'version')
        results.push({ name: 'Pulumi', status: 'pass', message: ver ?? 'installed' })
      } else {
        results.push({
          name: 'Pulumi',
          status: 'fail',
          message: 'not found',
          hint: 'Install Pulumi: https://www.pulumi.com/docs/install/',
          fixCmd: brew ? 'brew install pulumi' : 'curl -fsSL https://get.pulumi.com | sh',
        })
      }

      // kind
      if (container.k8s.isToolInstalled('kind')) {
        const hasCluster = container.k8s.kindClusterExists()
        results.push({
          name: 'kind',
          status: 'pass',
          message: hasCluster ? 'installed + shadowob-cloud cluster exists' : 'installed',
        })
      } else {
        results.push({
          name: 'kind',
          status: 'warn',
          message: 'not found (optional, for local development)',
          hint: 'Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/',
          fixCmd: brew ? 'brew install kind' : undefined,
        })
      }

      // Print results
      for (const r of results) {
        const icon = r.status === 'pass' ? '✓' : r.status === 'warn' ? '⚠' : '✗'
        const color = r.status === 'pass' ? 'success' : r.status === 'warn' ? 'warn' : 'error'
        container.logger[color](`${icon} ${r.name}: ${r.message}`)
        if (r.hint) container.logger.dim(`    → ${r.hint}`)
      }

      // Security checks
      if (options.security) {
        console.log()
        container.logger.step('Checking security configuration...')
        const secResults: CheckResult[] = []

        if (container.k8s.isToolInstalled('kubectl') && container.k8s.isKubeReachable()) {
          try {
            execSync('kubectl auth can-i create deployments', {
              encoding: 'utf-8',
              timeout: 10_000,
            })
            secResults.push({
              name: 'K8s RBAC',
              status: 'pass',
              message: 'can create deployments',
            })
          } catch {
            secResults.push({
              name: 'K8s RBAC',
              status: 'warn',
              message: 'cannot create deployments in current context',
            })
          }

          try {
            const apiResources = execSync('kubectl api-resources --no-headers', {
              encoding: 'utf-8',
              timeout: 10_000,
            })
            const hasNetworkPolicy = apiResources
              .split('\n')
              .some((line) => line.trim().startsWith('networkpolicies'))
            secResults.push({
              name: 'NetworkPolicy',
              status: hasNetworkPolicy ? 'pass' : 'warn',
              message: hasNetworkPolicy ? 'API available' : 'NetworkPolicy API not available',
            })
          } catch {
            secResults.push({
              name: 'NetworkPolicy',
              status: 'warn',
              message: 'NetworkPolicy API not available',
            })
          }
        }

        if (existsSync('.env')) {
          // Check if .env is in .gitignore
          let inGitignore = false
          if (existsSync('.gitignore')) {
            const gitignore = readFileSync('.gitignore', 'utf-8')
            inGitignore = gitignore.split('\n').some((line) => line.trim() === '.env')
          }
          secResults.push({
            name: '.env file',
            status: inGitignore ? 'pass' : 'warn',
            message: inGitignore
              ? 'found, excluded by .gitignore'
              : 'found but NOT in .gitignore — risk of committing secrets',
            hint: inGitignore ? undefined : 'Add .env to your .gitignore file',
          })
        } else {
          secResults.push({
            name: '.env file',
            status: 'warn',
            message: 'not found — API keys should be in .env',
          })
        }

        for (const r of secResults) {
          const icon = r.status === 'pass' ? '✓' : r.status === 'warn' ? '⚠' : '✗'
          const color = r.status === 'pass' ? 'success' : r.status === 'warn' ? 'warn' : 'error'
          container.logger[color](`${icon} ${r.name}: ${r.message}`)
          if (r.hint) container.logger.dim(`    → ${r.hint}`)
        }
      }

      if (options.runtime) {
        console.log()
        container.logger.step('Checking runtime health...')
        const runtimeResults = runRuntimeHealthChecks(container)
        for (const r of runtimeResults) {
          results.push(r)
          const icon = r.status === 'pass' ? '✓' : r.status === 'warn' ? '⚠' : '✗'
          const color = r.status === 'pass' ? 'success' : r.status === 'warn' ? 'warn' : 'error'
          container.logger[color](`${icon} ${r.name}: ${r.message}`)
          if (r.hint) container.logger.dim(`    → ${r.hint}`)
        }
      }

      // Summary
      const fails = results.filter((r) => r.status === 'fail')
      const warns = results.filter((r) => r.status === 'warn')
      console.log()

      // Attempt auto-fix for failed/warned items
      if (options.fix && (fails.length > 0 || warns.length > 0)) {
        const fixable = [...fails, ...warns].filter((r) => r.fixCmd)
        if (fixable.length > 0) {
          container.logger.step(`Attempting to fix ${fixable.length} issue(s)...`)
          console.log()
          let fixed = 0
          for (const r of fixable) {
            if (r.fixCmd && tryFix(container.logger, r.name, r.fixCmd)) {
              fixed++
            }
          }
          console.log()
          if (fixed > 0) {
            container.logger.success(`Fixed ${fixed} issue(s). Run 'doctor' again to verify.`)
          }
        } else {
          container.logger.warn('No auto-fixable issues found. Please install manually.')
        }
      } else if (fails.length === 0) {
        container.logger.success('All checks passed')
      } else {
        container.logger.error(`${fails.length} check(s) failed`)
        container.logger.dim('  Run with --fix to attempt auto-installation')
        process.exit(1)
      }
    })
}
