import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { CloudConfig } from '../config/schema.js'
import type { ProvisionState } from '../utils/state.js'
import type { DeployOptions, DeployResult } from './deploy.service.js'
import { DeployService } from './deploy.service.js'

export interface DeploymentRuntimeCluster {
  id?: string | null
  name?: string | null
  kubeconfig?: string | null
}

export interface DeployFromSnapshotOptions
  extends Omit<
    DeployOptions,
    'filePath' | 'k8sContext' | 'shadowUrl' | 'shadowToken' | 'cluster' | 'kubeConfigPath'
  > {
  configSnapshot: unknown
  runtimeEnvVars?: Record<string, string>
  shadowUrl?: string
  shadowToken?: string
  cluster?: DeploymentRuntimeCluster | null
  provisionState?: ProvisionState | null
  onProvisionState?: (state: ProvisionState) => void | Promise<void>
}

export interface DestroyRuntimeOptions {
  namespace: string
  stack?: string
  cluster?: DeploymentRuntimeCluster | null
  configSnapshot?: unknown
}

interface ResolvedRuntimeContext {
  k8sContext?: string
  kubeConfigPath?: string
  runtimeEnvVars: Record<string, string>
}

function extractKubeContext(kubeconfigYaml: string): string | undefined {
  const match = kubeconfigYaml.match(/current-context:\s*(\S+)/)
  return match?.[1]
}

export function rewriteLoopbackKubeconfig(
  kubeconfigYaml: string,
  loopbackHost = process.env.KUBECONFIG_LOOPBACK_HOST,
): string {
  const normalizedHost = loopbackHost?.trim()
  if (!normalizedHost) return kubeconfigYaml

  const lines = kubeconfigYaml.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line?.match(/^([ \t]*server:\s*https?:\/\/)(127\.0\.0\.1|localhost)([:/].*)$/)
    if (!match) continue

    const serverPrefix = match[1] ?? ''
    const serverSuffix = match[3] ?? ''
    const indent = serverPrefix.match(/^[ \t]*/)?.[0] ?? ''
    lines[index] = `${serverPrefix}${normalizedHost}${serverSuffix}`

    const tlsServerNameLine = `${indent}tls-server-name: localhost`
    const nextLine = lines[index + 1]
    if (!nextLine?.trim().startsWith('tls-server-name:')) {
      lines.splice(index + 1, 0, tlsServerNameLine)
      index += 1
    }
  }

  return lines.join('\n')
}

function normalizeRuntimeEnvVars(envVars?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!envVars) return normalized

  for (const [key, value] of Object.entries(envVars)) {
    if (typeof value !== 'string') continue
    if (value === '__SAVED__' || value.trim() === '') continue
    normalized[key] = value
  }

  return normalized
}

function getStableRuntimeKubeconfigPath(kubeconfigYaml: string): string {
  const runtimeDir = join(homedir(), '.shadowob', 'kubeconfigs')
  mkdirSync(runtimeDir, { recursive: true })

  const hash = createHash('sha256').update(kubeconfigYaml).digest('hex')
  const kubeconfigPath = join(runtimeDir, `${hash}.yaml`)

  if (!existsSync(kubeconfigPath)) {
    writeFileSync(kubeconfigPath, kubeconfigYaml, { mode: 0o600 })
  }

  return kubeconfigPath
}

function isContainerizedRuntime(): boolean {
  return process.env.SHADOW_CONTAINERIZED === '1' || existsSync('/.dockerenv')
}

function getHostLocalRuntimeKubeconfigPaths(): string[] {
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

function isHostLocalRuntimeKubeconfigPath(candidate: string | undefined): boolean {
  if (!candidate) return false
  return getHostLocalRuntimeKubeconfigPaths().includes(candidate)
}

function resolveAmbientRuntimeKubeconfigPath(): string | undefined {
  const candidates = [
    ...(process.env.KUBECONFIG?.split(delimiter)
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0) ?? []),
    process.env.KUBECONFIG_HOST_PATH?.trim(),
    join(homedir(), '.kube', 'config'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  return candidates.find((candidate) => existsSync(candidate))
}

export class DeploymentRuntimeService {
  constructor(private readonly deployService: DeployService) {}

  async deployFromSnapshot(options: DeployFromSnapshotOptions): Promise<DeployResult> {
    const configDir = mkdtempSync(join(tmpdir(), 'sc-cfg-'))
    const configPath = join(configDir, 'shadowob-cloud.json')
    writeFileSync(configPath, JSON.stringify(options.configSnapshot, null, 2), 'utf-8')
    const {
      configSnapshot: _configSnapshot,
      runtimeEnvVars: _runtimeEnvVars,
      cluster: _cluster,
      provisionState: _provisionState,
      shadowUrl,
      shadowToken,
      ...deployOptions
    } = options

    try {
      return await this.withResolvedContext(options.cluster, options.runtimeEnvVars, (context) =>
        this.deployService.up({
          ...deployOptions,
          filePath: configPath,
          cluster: options.cluster?.name ?? undefined,
          k8sContext: context.k8sContext,
          kubeConfigPath: context.kubeConfigPath,
          runtimeEnvVars: context.runtimeEnvVars,
          initialProvisionState: options.provisionState ?? null,
          shadowUrl,
          shadowToken,
        }),
      )
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  }

  async destroy(options: DestroyRuntimeOptions): Promise<void> {
    const configSnapshot =
      options.configSnapshot &&
      typeof options.configSnapshot === 'object' &&
      !Array.isArray(options.configSnapshot)
        ? (options.configSnapshot as CloudConfig)
        : undefined

    await this.withResolvedContext(options.cluster, undefined, (context) =>
      this.deployService.destroy({
        namespace: options.namespace,
        stack: options.stack,
        k8sContext: context.k8sContext,
        kubeConfigPath: context.kubeConfigPath,
        config: configSnapshot,
      }),
    )
  }

  private async withResolvedContext<T>(
    cluster: DeploymentRuntimeCluster | null | undefined,
    runtimeEnvVars: Record<string, string> | undefined,
    run: (context: ResolvedRuntimeContext) => Promise<T>,
  ): Promise<T> {
    let k8sContext: string | undefined
    let kubeConfigPath: string | undefined

    const activeKubeconfigPath = resolveAmbientRuntimeKubeconfigPath()
    const activeKubeconfig = cluster?.kubeconfig
      ? cluster.kubeconfig
      : activeKubeconfigPath
        ? readFileSync(activeKubeconfigPath, 'utf8')
        : undefined

    if (activeKubeconfig) {
      const shouldRewriteLoopback = Boolean(
        cluster?.kubeconfig ||
          (activeKubeconfigPath && !isHostLocalRuntimeKubeconfigPath(activeKubeconfigPath)),
      )
      const rewrittenKubeconfig = shouldRewriteLoopback
        ? rewriteLoopbackKubeconfig(activeKubeconfig)
        : activeKubeconfig
      const shouldReuseMountedPath =
        !cluster?.kubeconfig && activeKubeconfigPath && rewrittenKubeconfig === activeKubeconfig

      kubeConfigPath = shouldReuseMountedPath
        ? activeKubeconfigPath
        : getStableRuntimeKubeconfigPath(rewrittenKubeconfig)
      k8sContext = extractKubeContext(rewrittenKubeconfig) ?? process.env.KUBECONFIG_CONTEXT
    }

    return run({
      k8sContext,
      kubeConfigPath,
      runtimeEnvVars: normalizeRuntimeEnvVars(runtimeEnvVars),
    })
  }
}
