/**
 * Kubeconfig management — store and retrieve kubeconfigs for registered clusters.
 *
 * Kubeconfigs are stored at ~/.shadow-cloud/clusters/<name>.yaml
 * Metadata is stored at ~/.shadow-cloud/clusters/<name>.json
 */

import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Persist a kubeconfig YAML and cluster metadata to disk.
 * Rewrites the server endpoint from 127.0.0.1 to the master's public IP.
 */
export async function storeKubeconfig(
  clusterName: string,
  rawKubeconfig: string,
  masterPublicIp: string,
  nodeCount: number,
  options?: { features?: ClusterMeta['features']; configHash?: string },
): Promise<ClusterMeta> {
  const dir = getClustersDir()
  await mkdir(dir, { recursive: true })

  // Rewrite local loopback to public IP so the kubeconfig works from the outside
  const kubeconfig = rawKubeconfig.replace(/https?:\/\/127\.0\.0\.1/g, `https://${masterPublicIp}`)

  const kubeconfigPath = getKubeconfigPath(clusterName)
  await writeFile(kubeconfigPath, kubeconfig, { mode: 0o600 })

  const meta: ClusterMeta = {
    name: clusterName,
    masterHost: masterPublicIp,
    nodeCount,
    createdAt: new Date().toISOString(),
    kubeconfigPath,
    ...(options?.configHash ? { configHash: options.configHash } : {}),
    ...(options?.features ? { features: options.features } : {}),
  }
  await writeFile(getMetaPath(clusterName), JSON.stringify(meta, null, 2), { mode: 0o600 })

  return meta
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load the kubeconfig path for a named cluster.
 * Throws if the cluster is not registered.
 */
export async function loadKubeconfigPath(clusterName: string): Promise<string> {
  const path = getKubeconfigPath(clusterName)
  if (!(await pathExists(path))) {
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
export async function loadClusterMeta(clusterName: string): Promise<ClusterMeta | null> {
  const path = getMetaPath(clusterName)
  if (!(await pathExists(path))) return null
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ClusterMeta
  } catch {
    return null
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List all registered clusters (those with a stored kubeconfig).
 */
export async function listRegisteredClusters(): Promise<ClusterMeta[]> {
  const dir = getClustersDir()
  if (!(await pathExists(dir))) return []

  const files = await readdir(dir)
  const metas = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        try {
          return JSON.parse(await readFile(join(dir, f), 'utf8')) as ClusterMeta
        } catch {
          return null
        }
      }),
  )
  return metas.filter((m): m is ClusterMeta => m !== null)
}

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Import a kubeconfig file from a given path and register it as a named cluster.
 * Used when another machine has already bootstrapped the cluster and you want to
 * register its kubeconfig locally (e.g. `cluster import --name prod --file ./prod.yaml`).
 */
export async function importKubeconfig(
  clusterName: string,
  kubeconfigFilePath: string,
): Promise<ClusterMeta> {
  const dir = getClustersDir()
  await mkdir(dir, { recursive: true })

  const raw = await readFile(kubeconfigFilePath, 'utf8')

  // Extract master host from server: entry in the kubeconfig YAML
  // Handles IPv4, hostnames; strips port if present
  const serverMatch = raw.match(/server:\s*https?:\/\/([^/\s]+)/)
  const rawHost = serverMatch?.[1] ?? 'unknown'
  // Remove port if present (e.g. "1.2.3.4:6443" → "1.2.3.4")
  const masterHost = rawHost.replace(/:\d+$/, '')

  const dest = getKubeconfigPath(clusterName)
  await writeFile(dest, raw, { mode: 0o600 })

  const meta: ClusterMeta = {
    name: clusterName,
    masterHost,
    nodeCount: 0, // unknown when importing
    createdAt: new Date().toISOString(),
    kubeconfigPath: dest,
  }
  await writeFile(getMetaPath(clusterName), JSON.stringify(meta, null, 2), { mode: 0o600 })

  return meta
}

// ─── Remove ───────────────────────────────────────────────────────────────────

/**
 * Remove stored kubeconfig and metadata for a cluster.
 */
export async function removeClusterFiles(clusterName: string): Promise<void> {
  const kubeconfig = getKubeconfigPath(clusterName)
  const meta = getMetaPath(clusterName)
  await Promise.all([rm(kubeconfig, { force: true }), rm(meta, { force: true })])
}
