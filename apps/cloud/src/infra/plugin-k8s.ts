/**
 * Plugin K8s helpers — collect K8s artifacts from all active plugins.
 *
 * Called by both the Pulumi infra layer (agent-deployment.ts) and the
 * raw-manifest infra layer (index.ts). Neither file imports any plugin
 * directly — all plugin-specific logic lives inside the plugin itself.
 */

import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import { getPluginRegistry } from '../plugins/registry.js'
import type {
  PluginK8sConfigMap,
  PluginK8sContext,
  PluginK8sEnvVar,
  PluginK8sInitContainer,
  PluginK8sResult,
  PluginK8sSidecar,
  PluginK8sVolume,
  PluginK8sVolumeMount,
} from '../plugins/types.js'

export interface CollectedK8sArtifacts {
  initContainers: PluginK8sInitContainer[]
  sidecars: PluginK8sSidecar[]
  configMaps: PluginK8sConfigMap[]
  volumes: PluginK8sVolume[]
  volumeMounts: PluginK8sVolumeMount[]
  envVars: PluginK8sEnvVar[]
  labels: Record<string, string>
  annotations: Record<string, string>
}

const COLON_SEPARATED_ENV_KEYS = new Set(['PATH', 'PYTHONPATH', 'NODE_PATH'])
const DEFAULT_CONTAINER_PATH_PARTS = [
  '/usr/local/sbin',
  '/usr/local/bin',
  '/usr/sbin',
  '/usr/bin',
  '/sbin',
  '/bin',
]

function uniquePathParts(parts: string[]): string[] {
  const out: string[] = []
  for (const part of parts) {
    if (!part || out.includes(part)) continue
    out.push(part)
  }
  return out
}

function mergeColonSeparatedEnvValue(key: string, current: string, next: string): string {
  const parts = [...current.split(':'), ...next.split(':')]
  if (key !== 'PATH') return uniquePathParts(parts).join(':')

  const defaults = new Set(DEFAULT_CONTAINER_PATH_PARTS)
  const pluginParts = parts.filter((part) => part && !defaults.has(part))
  const defaultParts = parts.filter((part) => defaults.has(part))
  return uniquePathParts([...pluginParts, ...defaultParts]).join(':')
}

function mergePluginEnvVars(target: PluginK8sEnvVar[], incoming: PluginK8sEnvVar[]): void {
  for (const envVar of incoming) {
    if (
      typeof envVar.name === 'string' &&
      typeof envVar.value === 'string' &&
      COLON_SEPARATED_ENV_KEYS.has(envVar.name)
    ) {
      const existing = target.find(
        (candidate) => candidate.name === envVar.name && typeof candidate.value === 'string',
      )
      if (existing && typeof existing.value === 'string') {
        existing.value = mergeColonSeparatedEnvValue(envVar.name, existing.value, envVar.value)
        continue
      }
    }
    target.push(envVar)
  }
}

/**
 * Iterate all registered plugins that implement `k8s.buildK8s` and merge
 * their results for a given agent. Returns a flat collection ready for
 * injection into the agent's K8s Deployment spec.
 */
export function collectPluginK8sArtifacts(
  agent: AgentDeployment,
  config: CloudConfig,
  namespace: string,
): CollectedK8sArtifacts {
  const result: CollectedK8sArtifacts = {
    initContainers: [],
    sidecars: [],
    configMaps: [],
    volumes: [],
    volumeMounts: [],
    envVars: [],
    labels: {},
    annotations: {},
  }

  const ctx: PluginK8sContext = { agent, config, namespace }
  const registry = getPluginRegistry()

  for (const pluginDef of registry.getAll()) {
    if (!pluginDef.k8s) continue

    let artifacts: PluginK8sResult | undefined
    try {
      artifacts = pluginDef.k8s.buildK8s(agent, ctx)
    } catch {
      // Plugin errors must not crash the infra layer
      continue
    }
    if (!artifacts) continue

    if (artifacts.initContainers?.length) {
      result.initContainers.push(...artifacts.initContainers)
    }
    if (artifacts.sidecars?.length) {
      result.sidecars.push(...artifacts.sidecars)
    }
    if (artifacts.configMaps?.length) {
      result.configMaps.push(...artifacts.configMaps)
    }
    if (artifacts.volumes?.length) {
      result.volumes.push(...artifacts.volumes)
    }
    if (artifacts.volumeMounts?.length) {
      result.volumeMounts.push(...artifacts.volumeMounts)
    }
    if (artifacts.envVars?.length) mergePluginEnvVars(result.envVars, artifacts.envVars)
    if (artifacts.labels) {
      Object.assign(result.labels, artifacts.labels)
    }
    if (artifacts.annotations) {
      Object.assign(result.annotations, artifacts.annotations)
    }
  }

  return result
}

/**
 * Collect Dockerfile fragments from all plugins that implement
 * `k8s.buildDockerfileStages` for a given agent (build-image strategy).
 */
export function collectPluginDockerfileStages(
  agent: AgentDeployment,
  config: CloudConfig,
  namespace: string,
): string[] {
  const stages: string[] = []
  const ctx: PluginK8sContext = { agent, config, namespace }
  const registry = getPluginRegistry()

  for (const pluginDef of registry.getAll()) {
    if (!pluginDef.k8s?.buildDockerfileStages) continue
    try {
      const stage = pluginDef.k8s.buildDockerfileStages(agent, ctx)
      if (stage) stages.push(stage)
    } catch {
      continue
    }
  }

  return stages
}
