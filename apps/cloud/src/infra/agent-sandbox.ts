/**
 * Agent Sandbox — Kubernetes agent-sandbox resources via Pulumi/plain manifests.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import type { AgentDeployment, AgentSandboxConfig, CloudConfig } from '../config/schema.js'
import { RUNNER_STATE_VOLUME_NAME, runtimeStatePvcName } from '../runtimes/container.js'
import { buildAgentPodSpec } from './agent-pod.js'
import { PULUMI_MANAGED_ANNOTATIONS } from './constants.js'
import { buildSecurityContext } from './security.js'

export const AGENT_SANDBOX_API_VERSION = 'agents.x-k8s.io/v1alpha1'
export const AGENT_SANDBOX_EXTENSIONS_API_VERSION = 'extensions.agents.x-k8s.io/v1alpha1'

export interface ResolvedAgentSandboxConfig {
  runtimeClassName: string
  state: {
    enabled: boolean
    size: string
    storageClassName?: string
    accessMode: 'ReadWriteOnce' | 'ReadWriteMany' | 'ReadOnlyMany'
  }
  lifecycle: {
    autoPause: boolean
    idleSeconds: number
    backupBeforePause: boolean
    shutdownPolicy: 'Delete' | 'Retain'
  }
  backup: {
    enabled: boolean
    driver: 'volumeSnapshot' | 'restic'
    schedule?: string
    retention: number
  }
  warmPool: {
    enabled: boolean
    replicas: number
    updateStrategy: 'OnReplenish' | 'Recreate'
  }
}

export interface AgentSandboxOptions {
  agentName: string
  agent: AgentDeployment
  namespace: string | pulumi.Input<string>
  namespaceName?: string
  config: CloudConfig
  configMapName: string
  secretName: string
  extraEnv?: Record<string, string>
  provider: k8s.Provider
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
  sharedWorkspacePvcName?: string
  sharedWorkspaceMountPath?: string
  skillsInstallDir?: string
  podTemplateAnnotations?: Record<string, string>
  resourceOptions?: pulumi.CustomResourceOptions
}

function mergeSandboxConfig(
  defaults: AgentSandboxConfig | undefined,
  override: AgentSandboxConfig | undefined,
): AgentSandboxConfig {
  return {
    ...defaults,
    ...override,
    state: { ...(defaults?.state ?? {}), ...(override?.state ?? {}) },
    lifecycle: { ...(defaults?.lifecycle ?? {}), ...(override?.lifecycle ?? {}) },
    backup: { ...(defaults?.backup ?? {}), ...(override?.backup ?? {}) },
    warmPool: { ...(defaults?.warmPool ?? {}), ...(override?.warmPool ?? {}) },
  }
}

export function resolveAgentSandboxConfig(
  config: CloudConfig,
  agent: AgentDeployment,
): ResolvedAgentSandboxConfig {
  const merged = mergeSandboxConfig(config.deployments?.sandbox, agent.sandbox)
  return {
    runtimeClassName: merged.runtimeClassName ?? 'gvisor',
    state: {
      enabled: merged.state?.enabled ?? true,
      size: merged.state?.size ?? '5Gi',
      storageClassName: merged.state?.storageClassName,
      accessMode: merged.state?.accessMode ?? 'ReadWriteOnce',
    },
    lifecycle: {
      autoPause: merged.lifecycle?.autoPause ?? false,
      idleSeconds: merged.lifecycle?.idleSeconds ?? 3600,
      backupBeforePause: merged.lifecycle?.backupBeforePause ?? false,
      shutdownPolicy: merged.lifecycle?.shutdownPolicy ?? 'Retain',
    },
    backup: {
      enabled: merged.backup?.enabled ?? false,
      driver: merged.backup?.driver ?? 'volumeSnapshot',
      schedule: merged.backup?.schedule,
      retention: merged.backup?.retention ?? 7,
    },
    warmPool: {
      enabled: merged.warmPool?.enabled ?? false,
      replicas: merged.warmPool?.replicas ?? 0,
      updateStrategy: merged.warmPool?.updateStrategy ?? 'OnReplenish',
    },
  }
}

export function assertAgentSandboxCompatible(config: CloudConfig, agent: AgentDeployment): void {
  if ((agent.replicas ?? 1) > 1) {
    throw new Error(
      `Agent ${agent.id} sets replicas=${agent.replicas}; agent-sandbox supports only 0 or 1 replica per agent`,
    )
  }
  const sandbox = resolveAgentSandboxConfig(config, agent)
  if (sandbox.warmPool.enabled) {
    throw new Error(
      `Agent ${agent.id} enables SandboxWarmPool, but warm pools require the future bootstrap config-fetcher mode`,
    )
  }
}

export function buildSandboxVolumeClaimTemplates(sandbox: ResolvedAgentSandboxConfig) {
  if (!sandbox.state.enabled) return []
  return [
    {
      metadata: {
        name: RUNNER_STATE_VOLUME_NAME,
        labels: { app: 'shadowob-cloud' },
        annotations: PULUMI_MANAGED_ANNOTATIONS,
      },
      spec: {
        accessModes: [sandbox.state.accessMode],
        resources: { requests: { storage: sandbox.state.size } },
        ...(sandbox.state.storageClassName
          ? { storageClassName: sandbox.state.storageClassName }
          : {}),
      },
    },
  ]
}

export function createAgentSandbox(options: AgentSandboxOptions) {
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
  assertAgentSandboxCompatible(config, agent)
  const sandboxConfig = resolveAgentSandboxConfig(config, agent)
  const ns = namespaceName ?? (typeof namespace === 'string' ? namespace : 'default')
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
    podTemplateAnnotations: options.podTemplateAnnotations,
    stateVolume: sandboxConfig.state.enabled ? 'volumeClaimTemplate' : 'emptyDir',
  })
  const { pluginArtifacts } = pod
  const templateName = `${agentName}-template`

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

  const sandboxTemplate = new k8s.apiextensions.CustomResource(
    `${agentName}-sandbox-template`,
    buildAgentSandboxTemplateManifest({
      agentName,
      namespace: namespace as string,
      agent,
      sandbox: sandboxConfig,
      pod,
      templateName,
    }),
    {
      ...resourceOptions,
      provider,
      dependsOn: [...resourceDependsOn, ...pluginConfigMaps],
    },
  )

  const sandboxClaim = new k8s.apiextensions.CustomResource(
    `${agentName}-sandbox-claim`,
    buildAgentSandboxClaimManifest({
      agentName,
      namespace: namespace as string,
      agent,
      sandbox: sandboxConfig,
      templateName,
    }),
    {
      ...resourceOptions,
      provider,
      dependsOn: [...resourceDependsOn, sandboxTemplate],
    },
  )

  return { sandboxTemplate, sandboxClaim }
}

export function buildAgentSandboxTemplateManifest(options: {
  agentName: string
  namespace: string
  agent: AgentDeployment
  sandbox: ResolvedAgentSandboxConfig
  pod: ReturnType<typeof buildAgentPodSpec>
  templateName?: string
}) {
  const templateName = options.templateName ?? `${options.agentName}-template`
  return {
    apiVersion: AGENT_SANDBOX_EXTENSIONS_API_VERSION,
    kind: 'SandboxTemplate',
    metadata: {
      name: templateName,
      namespace: options.namespace,
      labels: {
        app: 'shadowob-cloud',
        agent: options.agentName,
        runtime: options.agent.runtime,
        'shadowob.cloud/workload-kind': 'agent-sandbox',
      },
      annotations: PULUMI_MANAGED_ANNOTATIONS,
    },
    spec: {
      networkPolicyManagement: 'Unmanaged',
      envVarsInjectionPolicy: 'Disallowed',
      podTemplate: {
        metadata: {
          labels: {
            ...options.pod.labels,
            'shadowob.cloud/workload-kind': 'agent-sandbox',
          },
          annotations: options.pod.annotations,
        },
        spec: {
          automountServiceAccountToken: false,
          runtimeClassName: options.sandbox.runtimeClassName,
          initContainers:
            options.pod.initContainers.length > 0 ? options.pod.initContainers : undefined,
          securityContext: buildSecurityContext(),
          containers: options.pod.containers,
          volumes: options.pod.volumes,
          nodeSelector: options.pod.scheduling.nodeSelector,
          affinity: options.pod.scheduling.affinity,
          tolerations: options.pod.scheduling.tolerations,
          restartPolicy: 'Always',
        },
      },
      volumeClaimTemplates: buildSandboxVolumeClaimTemplates(options.sandbox),
    },
  }
}

export function buildAgentSandboxClaimManifest(options: {
  agentName: string
  namespace: string
  agent: AgentDeployment
  sandbox: ResolvedAgentSandboxConfig
  templateName?: string
}) {
  const templateName = options.templateName ?? `${options.agentName}-template`
  return {
    apiVersion: AGENT_SANDBOX_EXTENSIONS_API_VERSION,
    kind: 'SandboxClaim',
    metadata: {
      name: options.agentName,
      namespace: options.namespace,
      labels: {
        app: 'shadowob-cloud',
        agent: options.agentName,
        runtime: options.agent.runtime,
        'shadowob.cloud/workload-kind': 'agent-sandbox',
      },
      annotations: {
        ...PULUMI_MANAGED_ANNOTATIONS,
        'shadowob.cloud/state-pvc': runtimeStatePvcName(options.agentName),
      },
    },
    spec: {
      sandboxTemplateRef: { name: templateName },
      warmpool: 'none',
      lifecycle: {
        shutdownPolicy: options.sandbox.lifecycle.shutdownPolicy,
      },
      additionalPodMetadata: {
        labels: {
          app: 'shadowob-cloud',
          agent: options.agentName,
          runtime: options.agent.runtime,
          'shadowob.cloud/workload-kind': 'agent-sandbox',
        },
      },
    },
  }
}
