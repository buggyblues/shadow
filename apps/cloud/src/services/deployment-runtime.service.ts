import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DeployOptions, DeployResult } from './deploy.service.js'
import { DeployService } from './deploy.service.js'

export interface DeploymentRuntimeCluster {
  name?: string | null
  kubeconfig?: string | null
}

export interface DeployFromSnapshotOptions
  extends Omit<DeployOptions, 'filePath' | 'k8sContext' | 'shadowUrl' | 'shadowToken'> {
  configSnapshot: unknown
  runtimeEnvVars?: Record<string, string>
  shadowUrl?: string
  shadowToken?: string
  cluster?: DeploymentRuntimeCluster | null
}

export interface DestroyRuntimeOptions {
  namespace: string
  stack?: string
  cluster?: DeploymentRuntimeCluster | null
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

    const indent = match[1].match(/^[ \t]*/)?.[0] ?? ''
    lines[index] = `${match[1]}${normalizedHost}${match[3]}`

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

export class DeploymentRuntimeService {
  constructor(private readonly deployService: DeployService) {}

  async deployFromSnapshot(options: DeployFromSnapshotOptions): Promise<DeployResult> {
    const configDir = mkdtempSync(join(tmpdir(), 'sc-cfg-'))
    const configPath = join(configDir, 'shadowob-cloud.json')
    writeFileSync(configPath, JSON.stringify(options.configSnapshot, null, 2), 'utf-8')

    try {
      return await this.withResolvedContext(options.cluster, options.runtimeEnvVars, (k8sContext) =>
        this.deployService.up({
          ...options,
          filePath: configPath,
          k8sContext,
          shadowUrl: options.shadowUrl,
          shadowToken: options.shadowToken,
        }),
      )
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  }

  async destroy(options: DestroyRuntimeOptions): Promise<void> {
    await this.withResolvedContext(options.cluster, undefined, (k8sContext) =>
      this.deployService.destroy({
        namespace: options.namespace,
        stack: options.stack,
        k8sContext,
      }),
    )
  }

  private async withResolvedContext<T>(
    cluster: DeploymentRuntimeCluster | null | undefined,
    runtimeEnvVars: Record<string, string> | undefined,
    run: (k8sContext: string | undefined) => Promise<T>,
  ): Promise<T> {
    const tempDirs: string[] = []
    const originalKubeconfig = process.env.KUBECONFIG
    const originalKubeContext = process.env.KUBECONFIG_CONTEXT
    const originalRuntimeEnv: Record<string, string | undefined> = {}

    let k8sContext: string | undefined

    try {
      const activeKubeconfigPath = process.env.KUBECONFIG
      const activeKubeconfig = cluster?.kubeconfig
        ? cluster.kubeconfig
        : activeKubeconfigPath && existsSync(activeKubeconfigPath)
          ? readFileSync(activeKubeconfigPath, 'utf8')
          : undefined

      if (activeKubeconfig) {
        const kubeDir = mkdtempSync(join(tmpdir(), 'sc-kube-'))
        const kubeconfigPath = join(kubeDir, 'kubeconfig')
        const rewrittenKubeconfig = rewriteLoopbackKubeconfig(activeKubeconfig)
        writeFileSync(kubeconfigPath, rewrittenKubeconfig, { mode: 0o600 })
        tempDirs.push(kubeDir)
        process.env.KUBECONFIG = kubeconfigPath
        k8sContext = extractKubeContext(rewrittenKubeconfig) ?? process.env.KUBECONFIG_CONTEXT
        if (k8sContext) {
          process.env.KUBECONFIG_CONTEXT = k8sContext
        }
      }

      const normalizedEnvVars = normalizeRuntimeEnvVars(runtimeEnvVars)
      for (const [key, value] of Object.entries(normalizedEnvVars)) {
        originalRuntimeEnv[key] = process.env[key]
        process.env[key] = value
      }

      return await run(k8sContext)
    } finally {
      if (originalKubeconfig !== undefined) {
        process.env.KUBECONFIG = originalKubeconfig
      } else {
        delete process.env.KUBECONFIG
      }

      if (originalKubeContext !== undefined) {
        process.env.KUBECONFIG_CONTEXT = originalKubeContext
      } else {
        delete process.env.KUBECONFIG_CONTEXT
      }

      for (const [key, value] of Object.entries(originalRuntimeEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }

      for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }
}
