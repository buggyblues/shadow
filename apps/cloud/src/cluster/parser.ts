/**
 * Cluster config parser — read, validate, and resolve cluster.json.
 *
 * Supports ${env:VAR} template syntax in password fields.
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import {
  AGENT_SANDBOX_DEFAULT_RUNTIME_CLASS,
  AGENT_SANDBOX_DEFAULT_RUNTIME_HANDLER,
  AGENT_SANDBOX_DEFAULT_VERSION,
  type ClusterConfig,
  ClusterConfigSchema,
  type ClusterInstallConfig,
  type ClusterSandboxFeatureConfig,
  type NodeConfig,
} from './schema.js'

// ─── Template resolution ──────────────────────────────────────────────────────

const ENV_TEMPLATE_RE = /\$\{env:([^}]+)\}/g

function resolveEnvTemplate(value: string): string {
  return value.replace(ENV_TEMPLATE_RE, (match, envKey: string) => {
    const envVal = process.env[envKey]
    if (envVal === undefined) {
      throw new Error(`Environment variable "${envKey}" is not set (required by cluster.json)`)
    }
    return envVal
  })
}

function expandHome(p: string): string {
  return p.startsWith('~') ? resolve(homedir(), p.slice(2)) : p
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Read and validate cluster.json from the given path.
 * Performs schema validation but does NOT resolve env vars yet
 * (credentials are resolved lazily at connection time via resolveNodeCredentials).
 */
export async function readClusterConfig(filePath: string): Promise<ClusterConfig> {
  const abs = resolve(filePath)
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(abs, 'utf8'))
  } catch (err) {
    throw new Error(`Failed to read cluster config at ${abs}: ${(err as Error).message}`)
  }

  const result = ClusterConfigSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid cluster.json:\n${issues.join('\n')}`)
  }

  return result.data
}

/**
 * Resolve credentials for a single node at connection time.
 * Expands ${env:VAR} in password/passphrase/agent and ~ in sshKeyPath.
 */
export function resolveNodeCredentials(node: NodeConfig): {
  host: string
  port: number
  user: string
  sshKeyPath?: string
  sshKeyPassphrase?: string
  sshAgent?: string
  password?: string
} {
  let sshAgent: string | undefined
  if (node.sshAgent === true) {
    sshAgent = process.env.SSH_AUTH_SOCK
    if (!sshAgent) {
      throw new Error('SSH_AUTH_SOCK is not set (required by cluster.json sshAgent=true)')
    }
  } else if (typeof node.sshAgent === 'string') {
    sshAgent = resolveEnvTemplate(node.sshAgent)
  }

  return {
    host: node.host,
    port: node.port,
    user: node.user,
    sshKeyPath: node.sshKeyPath ? expandHome(node.sshKeyPath) : undefined,
    sshKeyPassphrase: node.sshKeyPassphrase ? resolveEnvTemplate(node.sshKeyPassphrase) : undefined,
    sshAgent,
    password: node.password ? resolveEnvTemplate(node.password) : undefined,
  }
}

/**
 * Resolve installer settings for a node.
 * Node-level settings override cluster defaults so mixed-region clusters can
 * choose different mirrors or registries per machine.
 */
export function resolveNodeInstallConfig(
  clusterInstall: ClusterInstallConfig | undefined,
  node: NodeConfig,
): ClusterInstallConfig | undefined {
  const merged = { ...clusterInstall, ...node.install }
  return Object.keys(merged).length > 0 ? merged : undefined
}

export interface ResolvedClusterSandboxConfig extends ClusterSandboxFeatureConfig {
  manifestUrls: string[]
}

export function defaultAgentSandboxManifestUrls(version = AGENT_SANDBOX_DEFAULT_VERSION): string[] {
  return [
    `https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${version}/manifest.yaml`,
    `https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${version}/extensions.yaml`,
  ]
}

/**
 * Normalize features.sandbox. Boolean true is intentionally enough for a fully
 * managed install path, while omitted/false means Deployment fallback.
 */
export function resolveClusterSandboxConfig(
  config: ClusterConfig,
): ResolvedClusterSandboxConfig | null {
  const sandbox = config.features?.sandbox
  if (sandbox === undefined || sandbox === false) return null

  const normalized =
    sandbox === true
      ? {
          enabled: true,
          install: true,
          version: AGENT_SANDBOX_DEFAULT_VERSION,
          runtimeClassName: AGENT_SANDBOX_DEFAULT_RUNTIME_CLASS,
          createRuntimeClass: true,
          runtimeClassHandler: AGENT_SANDBOX_DEFAULT_RUNTIME_HANDLER,
          waitTimeoutSeconds: 300,
          required: true,
          nodeSelector: { 'shadowob.com/sandbox-ready': 'true' },
          smokeTest: false,
          smokeImage: 'busybox:1.36',
        }
      : sandbox

  if (!normalized.enabled) return null

  return {
    ...normalized,
    manifestUrls:
      normalized.manifestUrls && normalized.manifestUrls.length > 0
        ? normalized.manifestUrls
        : defaultAgentSandboxManifestUrls(normalized.version),
  }
}

/**
 * Get the master node from a cluster config (always exactly one).
 */
export function getMasterNode(config: ClusterConfig): NodeConfig {
  const master = config.nodes.find((n) => n.role === 'master')
  if (!master) throw new Error('No master node found in cluster config')
  return master
}

/**
 * Get all worker nodes from a cluster config.
 */
export function getWorkerNodes(config: ClusterConfig): NodeConfig[] {
  return config.nodes.filter((n) => n.role === 'worker')
}
