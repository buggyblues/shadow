/**
 * Agent Deployment — Kubernetes Deployment resource via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import type { AgentDeployment } from '../config/schema.js'
import { runtimeStatePvcName } from '../runtimes/container.js'
import { buildAgentPodSpec } from './agent-pod.js'
import { resolveAgentSandboxConfig } from './agent-sandbox.js'
import { PULUMI_MANAGED_ANNOTATIONS } from './constants.js'
import { buildSecurityContext } from './security.js'

export interface AgentDeploymentOptions {
  agentName: string
  agent: AgentDeployment
  namespace: string | pulumi.Input<string>
  namespaceName?: string
  config: import('../config/schema.js').CloudConfig
  configMapName: string
  secretName: string
  extraEnv?: Record<string, string>
  provider: k8s.Provider
  /**
   * Image pull policy.
   * Use 'IfNotPresent' for locally built images (Rancher Desktop / local K8s).
   * Use 'Always' for registry images that may be updated.
   * Defaults to 'IfNotPresent' for the official OpenClaw runner and immutable/local tags,
   * and 'Always' for other mutable registry tags.
   */
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
  /** Shared workspace PVC name (when enabled) */
  sharedWorkspacePvcName?: string
  /** Mount path for shared workspace inside the container */
  sharedWorkspaceMountPath?: string
  /** Skills install directory inside the container */
  skillsInstallDir?: string
  /** Pod-template annotations that should trigger rollout when changed. */
  podTemplateAnnotations?: Record<string, string>
  metadataLabels?: Record<string, string>
  metadataAnnotations?: Record<string, string>
  resourceOptions?: pulumi.CustomResourceOptions
}

export function deploymentStrategyForRuntimeState(
  stateEnabled: boolean,
): k8s.types.input.apps.v1.DeploymentStrategy | undefined {
  if (!stateEnabled) return undefined
  return { type: 'Recreate' }
}

export function createAgentDeployment(options: AgentDeploymentOptions) {
  const {
    agentName,
    agent,
    namespace,
    namespaceName,
    config,
    configMapName,
    secretName,
    extraEnv,
    provider,
    resourceOptions,
  } = options

  const replicas = agent.replicas ?? 1
  const ns = namespaceName ?? (typeof namespace === 'string' ? namespace : 'default')
  const stateConfig = resolveAgentSandboxConfig(config, agent).state
  if (stateConfig.enabled && replicas > 1) {
    throw new Error(
      `Agent ${agent.id} sets replicas=${replicas}; persistent runtime state supports only 0 or 1 replica per agent`,
    )
  }
  const statePvcName = runtimeStatePvcName(agentName)
  const pod = buildAgentPodSpec({
    agentName,
    agent,
    namespace: ns,
    config,
    configMapName,
    secretName,
    extraEnv,
    imagePullPolicy: options.imagePullPolicy,
    sharedWorkspacePvcName: options.sharedWorkspacePvcName,
    sharedWorkspaceMountPath: options.sharedWorkspaceMountPath,
    skillsInstallDir: options.skillsInstallDir,
    podLabels: options.metadataLabels,
    podTemplateAnnotations: {
      ...(options.podTemplateAnnotations ?? {}),
      ...(options.metadataAnnotations ?? {}),
    },
    stateVolume: stateConfig.enabled
      ? { persistentVolumeClaim: { claimName: statePvcName } }
      : 'emptyDir',
  })
  const { pluginArtifacts } = pod
  const pluginConfigMaps = pluginArtifacts.configMaps.map(
    (configMap) =>
      new k8s.core.v1.ConfigMap(
        configMap.name,
        {
          metadata: {
            name: configMap.name,
            namespace,
            labels: configMap.labels,
            annotations: {
              ...PULUMI_MANAGED_ANNOTATIONS,
              ...configMap.annotations,
            },
          },
          data: configMap.data,
        },
        { provider, ...resourceOptions },
      ),
  )
  const resourceDependsOn = (
    Array.isArray(resourceOptions?.dependsOn)
      ? resourceOptions.dependsOn
      : resourceOptions?.dependsOn
        ? [resourceOptions.dependsOn]
        : []
  ) as pulumi.Input<pulumi.Resource>[]

  const statePvc = stateConfig.enabled
    ? new k8s.core.v1.PersistentVolumeClaim(
        `${agentName}-state`,
        {
          metadata: {
            name: statePvcName,
            namespace,
            labels: {
              app: 'shadowob-cloud',
              agent: agentName,
              runtime: agent.runtime,
              'shadowob.cloud/runtime-state': 'true',
              ...(options.metadataLabels ?? {}),
            },
            annotations: {
              ...PULUMI_MANAGED_ANNOTATIONS,
              'shadowob.cloud/state-pvc': statePvcName,
              ...(options.metadataAnnotations ?? {}),
            },
          },
          spec: {
            accessModes: [stateConfig.accessMode],
            resources: { requests: { storage: stateConfig.size } },
            ...(stateConfig.storageClassName
              ? { storageClassName: stateConfig.storageClassName }
              : {}),
          },
        },
        { ...resourceOptions, provider, dependsOn: resourceDependsOn },
      )
    : undefined

  const deployment = new k8s.apps.v1.Deployment(
    agentName,
    {
      metadata: {
        name: agentName,
        namespace,
        labels: {
          app: 'shadowob-cloud',
          agent: agentName,
          runtime: agent.runtime,
          ...(options.metadataLabels ?? {}),
          ...pluginArtifacts.labels,
        },
        annotations: {
          ...PULUMI_MANAGED_ANNOTATIONS,
          ...(options.metadataAnnotations ?? {}),
          ...pluginArtifacts.annotations,
        },
      },
      spec: {
        replicas,
        strategy: deploymentStrategyForRuntimeState(stateConfig.enabled),
        selector: {
          matchLabels: {
            app: 'shadowob-cloud',
            agent: agentName,
          },
        },
        template: {
          metadata: {
            labels: pod.labels,
            annotations: pod.annotations,
          },
          spec: {
            initContainers: pod.initContainers.length > 0 ? pod.initContainers : undefined,
            securityContext: buildSecurityContext(),
            containers: pod.containers,
            volumes: pod.volumes,
            nodeSelector: pod.scheduling.nodeSelector,
            affinity: pod.scheduling.affinity,
            tolerations: pod.scheduling.tolerations,
            restartPolicy: 'Always',
          },
        },
      },
    },
    {
      ...resourceOptions,
      provider,
      dependsOn: [...resourceDependsOn, ...pluginConfigMaps, ...(statePvc ? [statePvc] : [])],
    },
  )

  return { deployment, statePvc }
}
