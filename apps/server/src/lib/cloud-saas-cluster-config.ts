import { createHash } from 'node:crypto'
import { access, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { logger } from './logger'

const CLUSTER_CONFIG_ENV = 'CLOUD_SAAS_CLUSTER_CONFIG'
const CLUSTER_KUBECONFIG_ENV = 'CLOUD_SAAS_CLUSTER_KUBECONFIG'
export const CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED_ENV = 'CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED'
export const CLOUD_SAAS_SANDBOX_RUNTIME_CLASS_ENV = 'CLOUD_SAAS_SANDBOX_RUNTIME_CLASS'
export const CLOUD_SAAS_SANDBOX_NODE_SELECTOR_ENV = 'CLOUD_SAAS_SANDBOX_NODE_SELECTOR'
const DEFAULT_SANDBOX_RUNTIME_CLASS = 'shadow-runc'

type MutableEnv = NodeJS.ProcessEnv

const ClusterConfigNameSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'Cluster name must be lowercase alphanumeric with dashes'),
    features: z
      .object({
        sandbox: z
          .union([
            z.boolean(),
            z
              .object({
                enabled: z.boolean().default(true),
                runtimeClassName: z.string().min(1).optional(),
                nodeSelector: z.record(z.string().min(1), z.string()).optional(),
              })
              .passthrough(),
          ])
          .optional(),
      })
      .optional(),
  })
  .passthrough()

interface ReadClusterConfigResult {
  name: string
  configHash: string
  sandbox: {
    enabled: boolean
    runtimeClassName?: string
    nodeSelector?: Record<string, string>
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function configHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

async function pathExists(candidate: string) {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function warnIfClusterConfigDrifted(clusterConfig: ReadClusterConfigResult) {
  const metaPath = join(homedir(), '.shadow-cloud', 'clusters', `${clusterConfig.name}.json`)
  if (!(await pathExists(metaPath))) {
    logger.warn(
      {
        clusterName: clusterConfig.name,
        metaPath,
      },
      'Cloud SaaS cluster metadata is not mounted; run cluster apply after changing cluster.json',
    )
    return
  }

  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { configHash?: unknown }
    if (typeof meta.configHash === 'string' && meta.configHash !== clusterConfig.configHash) {
      logger.warn(
        {
          clusterName: clusterConfig.name,
          metaPath,
        },
        'Mounted cluster.json differs from last applied cluster metadata; run shadowob-cloud cluster apply',
      )
    }
  } catch (err) {
    logger.warn(
      { clusterName: clusterConfig.name, metaPath, err },
      'Failed to inspect Cloud SaaS cluster metadata for drift',
    )
  }
}

export type CloudSaasClusterConfigResult =
  | {
      configured: false
    }
  | {
      configured: true
      clusterName: string
      clusterConfigPath: string
      kubeconfigPath: string
    }

export async function configureCloudSaasClusterFromEnv(
  env: MutableEnv = process.env,
): Promise<CloudSaasClusterConfigResult> {
  const configuredPath = env[CLUSTER_CONFIG_ENV]?.trim()
  if (!configuredPath) return { configured: false }

  const clusterConfigPath = resolve(configuredPath)
  const clusterConfig = await readClusterConfigName(clusterConfigPath)
  const explicitKubeconfig = env[CLUSTER_KUBECONFIG_ENV]?.trim()
  const kubeconfigPath = resolve(
    explicitKubeconfig ||
      join(homedir(), '.shadow-cloud', 'clusters', `${clusterConfig.name}.yaml`),
  )

  if (!(await pathExists(kubeconfigPath))) {
    throw new Error(
      `Cloud SaaS cluster "${clusterConfig.name}" kubeconfig not found at ${kubeconfigPath}. ` +
        `Run "shadowob-cloud cluster init --config ${clusterConfigPath}" first, ` +
        `or set ${CLUSTER_KUBECONFIG_ENV} to a mounted kubeconfig path.`,
    )
  }
  const kubeconfigStat = await stat(kubeconfigPath)
  if (!kubeconfigStat.isFile()) {
    throw new Error(
      `Cloud SaaS cluster "${clusterConfig.name}" kubeconfig path ${kubeconfigPath} ` +
        `is ${kubeconfigStat.isDirectory() ? 'a directory' : 'not a regular file'}. ` +
        `Run "shadowob-cloud cluster init --config ${clusterConfigPath}" first, ` +
        `or set ${CLUSTER_KUBECONFIG_ENV} to a mounted kubeconfig file.`,
    )
  }

  env.KUBECONFIG = kubeconfigPath
  await warnIfClusterConfigDrifted(clusterConfig)
  env[CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED_ENV] = clusterConfig.sandbox.enabled ? 'true' : 'false'
  if (clusterConfig.sandbox.runtimeClassName) {
    env[CLOUD_SAAS_SANDBOX_RUNTIME_CLASS_ENV] = clusterConfig.sandbox.runtimeClassName
  } else {
    delete env[CLOUD_SAAS_SANDBOX_RUNTIME_CLASS_ENV]
  }
  if (clusterConfig.sandbox.nodeSelector) {
    env[CLOUD_SAAS_SANDBOX_NODE_SELECTOR_ENV] = JSON.stringify(clusterConfig.sandbox.nodeSelector)
  } else {
    delete env[CLOUD_SAAS_SANDBOX_NODE_SELECTOR_ENV]
  }
  logger.info(
    {
      clusterName: clusterConfig.name,
      clusterConfigPath,
      kubeconfigPath,
      sandboxEnabled: clusterConfig.sandbox.enabled,
      sandboxRuntimeClassName: clusterConfig.sandbox.runtimeClassName,
      sandboxNodeSelector: clusterConfig.sandbox.nodeSelector,
    },
    'Cloud SaaS Kubernetes cluster configured from cluster.json',
  )

  return {
    configured: true,
    clusterName: clusterConfig.name,
    clusterConfigPath,
    kubeconfigPath,
  }
}

async function readClusterConfigName(filePath: string): Promise<ReadClusterConfigResult> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(filePath, 'utf8'))
  } catch (err) {
    throw new Error(`Failed to read cluster config at ${filePath}: ${(err as Error).message}`)
  }

  const result = ClusterConfigNameSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    )
    throw new Error(`Invalid cluster.json:\n${issues.join('\n')}`)
  }

  const sandbox = result.data.features?.sandbox
  if (sandbox === true) {
    return {
      name: result.data.name,
      configHash: configHash(result.data),
      sandbox: {
        enabled: true,
        runtimeClassName: DEFAULT_SANDBOX_RUNTIME_CLASS,
        nodeSelector: { 'shadowob.com/sandbox-ready': 'true' },
      },
    }
  }
  if (sandbox && typeof sandbox === 'object') {
    const runtimeClassName =
      typeof sandbox.runtimeClassName === 'string' && sandbox.runtimeClassName.trim()
        ? sandbox.runtimeClassName.trim()
        : DEFAULT_SANDBOX_RUNTIME_CLASS
    return {
      name: result.data.name,
      configHash: configHash(result.data),
      sandbox: {
        enabled: sandbox.enabled,
        runtimeClassName: sandbox.enabled ? runtimeClassName : undefined,
        nodeSelector: sandbox.enabled
          ? (sandbox.nodeSelector ?? { 'shadowob.com/sandbox-ready': 'true' })
          : undefined,
      },
    }
  }

  return {
    name: result.data.name,
    configHash: configHash(result.data),
    sandbox: { enabled: false },
  }
}
