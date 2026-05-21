/**
 * Kubeconfig management — store and retrieve kubeconfigs for registered clusters.
 *
 * Kubeconfigs are stored at ~/.shadow-cloud/clusters/<name>.yaml
 * Metadata is stored at ~/.shadow-cloud/clusters/<name>.json
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ClusterMeta } from './schema.js'

// ─── Paths ────────────────────────────────────────────────────────────────────

export function getClustersDir(): string {
  return resolve(homedir(), '.shadow-cloud', 'clusters')
}

export function getKubeconfigPath(clusterName: string): string {
  return join(getClustersDir(), `${clusterName}.yaml`)
}

export function getMetaPath(clusterName: string): string {
  return join(getClustersDir(), `${clusterName}.json`)
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Persist a kubeconfig YAML and cluster metadata to disk.
 * Rewrites the server endpoint from 127.0.0.1 to the master's public IP.
 */
export function storeKubeconfig(
  clusterName: string,
  rawKubeconfig: string,
  masterPublicIp: string,
  nodeCount: number,
  options?: { features?: ClusterMeta['features']; configHash?: string },
): ClusterMeta {
  const dir = getClustersDir()
  mkdirSync(dir, { recursive: true })

  // Rewrite local loopback to public IP so the kubeconfig works from the outside
  const kubeconfig = rawKubeconfig.replace(/https?:\/\/127\.0\.0\.1/g, `https://${masterPublicIp}`)

  const kubeconfigPath = getKubeconfigPath(clusterName)
  writeFileSync(kubeconfigPath, kubeconfig, { mode: 0o600 })

  const meta: ClusterMeta = {
    name: clusterName,
    masterHost: masterPublicIp,
    nodeCount,
    createdAt: new Date().toISOString(),
    kubeconfigPath,
    ...(options?.configHash ? { configHash: options.configHash } : {}),
    ...(options?.features ? { features: options.features } : {}),
  }
  writeFileSync(getMetaPath(clusterName), JSON.stringify(meta, null, 2), { mode: 0o600 })

  return meta
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load the kubeconfig path for a named cluster.
 * Throws if the cluster is not registered.
 */
export function loadKubeconfigPath(clusterName: string): string {
  const path = getKubeconfigPath(clusterName)
  if (!existsSync(path)) {
    throw new Error(
      `Cluster "${clusterName}" not found.\n` +
        `Run: shadowob-cloud cluster init --config cluster.json`,
    )
  }
  return path
}

/**
 * Load metadata for a named cluster. Returns null if not found.
 */
export function loadClusterMeta(clusterName: string): ClusterMeta | null {
  const path = getMetaPath(clusterName)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ClusterMeta
  } catch {
    return null
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List all registered clusters (those with a stored kubeconfig).
 */
export function listRegisteredClusters(): ClusterMeta[] {
  const dir = getClustersDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf8')) as ClusterMeta
      } catch {
        return null
      }
    })
    .filter((m): m is ClusterMeta => m !== null)
}

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Import a kubeconfig file from a given path and register it as a named cluster.
 * Used when another machine has already bootstrapped the cluster and you want to
 * register its kubeconfig locally (e.g. `cluster import --name prod --file ./prod.yaml`).
 */
export function importKubeconfig(clusterName: string, kubeconfigFilePath: string): ClusterMeta {
  const dir = getClustersDir()
  mkdirSync(dir, { recursive: true })

  const raw = readFileSync(kubeconfigFilePath, 'utf8')

  // Extract master host from server: entry in the kubeconfig YAML
  // Handles IPv4, hostnames; strips port if present
  const serverMatch = raw.match(/server:\s*https?:\/\/([^/\s]+)/)
  const rawHost = serverMatch?.[1] ?? 'unknown'
  // Remove port if present (e.g. "1.2.3.4:6443" → "1.2.3.4")
  const masterHost = rawHost.replace(/:\d+$/, '')

  const dest = getKubeconfigPath(clusterName)
  writeFileSync(dest, raw, { mode: 0o600 })

  const meta: ClusterMeta = {
    name: clusterName,
    masterHost,
    nodeCount: 0, // unknown when importing
    createdAt: new Date().toISOString(),
    kubeconfigPath: dest,
  }
  writeFileSync(getMetaPath(clusterName), JSON.stringify(meta, null, 2), { mode: 0o600 })

  return meta
}

// ─── Remove ───────────────────────────────────────────────────────────────────

/**
 * Remove stored kubeconfig and metadata for a cluster.
 */
export function removeClusterFiles(clusterName: string): void {
  const kubeconfig = getKubeconfigPath(clusterName)
  const meta = getMetaPath(clusterName)
  if (existsSync(kubeconfig)) unlinkSync(kubeconfig)
  if (existsSync(meta)) unlinkSync(meta)
}
