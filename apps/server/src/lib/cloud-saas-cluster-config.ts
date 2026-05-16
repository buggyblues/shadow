import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { logger } from './logger'

const CLUSTER_CONFIG_ENV = 'CLOUD_SAAS_CLUSTER_CONFIG'
const CLUSTER_KUBECONFIG_ENV = 'CLOUD_SAAS_CLUSTER_KUBECONFIG'

type MutableEnv = NodeJS.ProcessEnv

const ClusterConfigNameSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'Cluster name must be lowercase alphanumeric with dashes'),
  })
  .passthrough()

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

export function configureCloudSaasClusterFromEnv(
  env: MutableEnv = process.env,
): CloudSaasClusterConfigResult {
  const configuredPath = env[CLUSTER_CONFIG_ENV]?.trim()
  if (!configuredPath) return { configured: false }

  const clusterConfigPath = resolve(configuredPath)
  const clusterConfig = readClusterConfigName(clusterConfigPath)
  const explicitKubeconfig = env[CLUSTER_KUBECONFIG_ENV]?.trim()
  const kubeconfigPath = resolve(
    explicitKubeconfig ||
      join(homedir(), '.shadow-cloud', 'clusters', `${clusterConfig.name}.yaml`),
  )

  if (!existsSync(kubeconfigPath)) {
    throw new Error(
      `Cloud SaaS cluster "${clusterConfig.name}" kubeconfig not found at ${kubeconfigPath}. ` +
        `Run "shadowob-cloud cluster init --config ${clusterConfigPath}" first, ` +
        `or set ${CLUSTER_KUBECONFIG_ENV} to a mounted kubeconfig path.`,
    )
  }

  env.KUBECONFIG = kubeconfigPath
  logger.info(
    {
      clusterName: clusterConfig.name,
      clusterConfigPath,
      kubeconfigPath,
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

function readClusterConfigName(filePath: string): { name: string } {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'))
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

  return { name: result.data.name }
}
