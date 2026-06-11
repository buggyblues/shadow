/**
 * Pulumi program — deploys K8s resources from resolved cloud config.
 */

import * as pulumi from '@pulumi/pulumi'
import { type CloudExecutionUnit, planRuntimeTopology } from '../application/runtime-topology.js'
import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import '../runtimes/loader.js'
import { runtimeStatePvcName } from '../runtimes/container.js'
import { getRuntime } from '../runtimes/index.js'
import {
  type DeploymentRuntimeContext,
  normalizeDeploymentRuntimeContext,
  runtimeContextEnv,
} from '../utils/runtime-context.js'
import { createAgentDeployment } from './agent-deployment.js'
import { buildAgentPodSpec } from './agent-pod.js'
import {
  assertAgentSandboxCompatible,
  buildAgentSandboxClaimManifest,
  buildAgentSandboxTemplateManifest,
  createAgentSandbox,
  resolveAgentSandboxConfig,
} from './agent-sandbox.js'
import { createConfigResources } from './config-resources.js'
import {
  HEALTH_PORT,
  PULUMI_MANAGED_ANNOTATIONS,
  PULUMI_SKIP_AWAIT_ANNOTATIONS,
} from './constants.js'
import { stableHash } from './hash.js'
import { serviceNameForAgent } from './k8s-names.js'
import { createNetworking } from './networking.js'
import { buildExecutionUnitRuntimePackage } from './runtime-package.js'
import { buildNetworkPolicy, buildSecurityContext } from './security.js'
import { createSharedResources } from './shared.js'

export interface InfraOptions {
  config: CloudConfig
  namespace: string
  shadowServerUrl?: string
  /** Per-deployment runtime env resolved from SaaS/user input. */
  runtimeEnvVars?: Record<string, string>
  /** Browser/deployment locale and timezone context. */
  runtimeContext?: DeploymentRuntimeContext
  /** kubectl context for K8s provider — defaults to KUBECONFIG_CONTEXT or 'rancher-desktop' */
  kubeContext?: string
  /** Path to a kubeconfig YAML file — takes precedence over kubeContext when set */
  kubeConfigPath?: string
  /**
   * Image pull policy for all agent containers.
   * Default: 'IfNotPresent' for the official OpenClaw runner and immutable/local tags,
   * and 'Always' for other mutable registry tags.
   */
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
}

function workloadBackend(config: CloudConfig): 'agent-sandbox' | 'deployment' {
  return config.deployments?.backend ?? 'agent-sandbox'
}

function agentsById(config: CloudConfig): Map<string, AgentDeployment> {
  return new Map((config.deployments?.agents ?? []).map((agent) => [agent.id, agent]))
}

function agentForUnit(
  byId: Map<string, AgentDeployment>,
  unit: CloudExecutionUnit,
): AgentDeployment {
  const agent = byId.get(unit.primaryAgentId)
  if (!agent) {
    throw new Error(
      `Execution unit "${unit.id}" references unknown primary agent "${unit.primaryAgentId}"`,
    )
  }
  return agent
}

function runtimeEnvForAgents(options: {
  agents: AgentDeployment[]
  runtimeContext: DeploymentRuntimeContext
  runtimeEnvVars?: Record<string, string>
  shadowServerUrl?: string
}): Record<string, Record<string, string>> {
  const envByAgentId: Record<string, Record<string, string>> = {}
  for (const agent of options.agents) {
    const env = {
      ...runtimeContextEnv(options.runtimeContext),
      ...(agent.env ?? {}),
      ...(options.runtimeEnvVars ?? {}),
    }
    if (options.shadowServerUrl) {
      env.SHADOW_SERVER_URL = options.shadowServerUrl
    }
    envByAgentId[agent.id] = env
  }
  return envByAgentId
}

function executionUnitLabels(unit: CloudExecutionUnit): Record<string, string> {
  return {
    'shadowob.cloud/execution-unit': 'true',
    'shadowob.cloud/runtime-kind': unit.runtimeKind,
    'shadowob.cloud/package-mode': unit.packageMode,
    'shadowob.cloud/shared-runner': String(unit.shared),
  }
}

function executionUnitAnnotations(unit: CloudExecutionUnit): Record<string, string> {
  return {
    'shadowob.cloud/execution-unit-id': unit.id,
    'shadowob.cloud/primary-agent-id': unit.primaryAgentId,
    'shadowob.cloud/agent-ids': unit.agentIds.join(','),
  }
}

function executionUnitEnv(unit: CloudExecutionUnit): Record<string, string> {
  return {
    SHADOW_EXECUTION_UNIT_ID: unit.id,
    SHADOW_AGENT_IDS: unit.agentIds.join(','),
  }
}

function agentsForUnit(
  byId: Map<string, AgentDeployment>,
  unit: CloudExecutionUnit,
): AgentDeployment[] {
  return unit.agentIds.map((agentId) => {
    const agent = byId.get(agentId)
    if (!agent) {
      throw new Error(`Execution unit "${unit.id}" references unknown agent "${agentId}"`)
    }
    return agent
  })
}

/**
 * Pulumi program function that creates all K8s resources.
 * Used with Pulumi automation API for programmatic deployments.
 */
export function createInfraProgram(options: InfraOptions) {
  return async () => {
    const { config, namespace, shadowServerUrl, runtimeEnvVars, imagePullPolicy } = options
    const runtimeContext = normalizeDeploymentRuntimeContext(options.runtimeContext)
    const topology = planRuntimeTopology(config)
    const agentMap = agentsById(config)

    const outputs: Record<string, pulumi.Output<string>> = {}

    // Shared resources: namespace + explicit K8s provider + optional PVC
    const shared = createSharedResources({
      namespace,
      kubeContext: options.kubeContext,
      kubeConfigPath: options.kubeConfigPath,
      workspace: config.workspace,
    })
    const { provider } = shared
    outputs.namespace = shared.namespace.metadata.name

    // Determine shared workspace and skills settings
    const sharedWorkspacePvcName = config.workspace?.enabled ? 'shared-workspace' : undefined
    const sharedWorkspaceMountPath = config.workspace?.mountPath ?? '/workspace/shared'
    const skillsInstallDir = config.skills?.entries?.length
      ? (config.skills.installDir ?? '/app/skills')
      : undefined
    const namespaceResourceOptions = { dependsOn: [shared.namespace] }

    for (const unit of topology.executionUnits) {
      const agent = agentForUnit(agentMap, unit)
      const unitAgents = agentsForUnit(agentMap, unit)
      const agentName = unit.workloadName
      const runtime = getRuntime(agent.runtime)
      const healthPort = runtime.container.healthPort

      const runtimePackage = buildExecutionUnitRuntimePackage({
        unit,
        config,
        extraEnvByAgentId: runtimeEnvForAgents({
          agents: unitAgents,
          runtimeContext,
          runtimeEnvVars,
          shadowServerUrl,
        }),
        runtimeContext,
      })
      const image = agent.image ?? runtime.defaultImage
      const runtimePackageHash = stableHash({
        configData: runtimePackage.configData,
        secretData: runtimePackage.secretData,
        image,
      })
      const unitLabels = executionUnitLabels(unit)
      const unitAnnotations = executionUnitAnnotations(unit)
      const unitPlainEnv = { ...runtimePackage.plainEnv, ...executionUnitEnv(unit) }

      // ConfigMap + Secret
      const configRes = createConfigResources({
        agentName,
        namespace,
        runtimePackage,
        provider,
        labels: unitLabels,
        annotations: unitAnnotations,
        resourceOptions: namespaceResourceOptions,
      })

      const baseDependsOn = [
        shared.namespace,
        ...(shared.workspacePvc ? [shared.workspacePvc] : []),
        configRes.configMap,
        configRes.secret,
      ]
      const podTemplateAnnotations = {
        'shadowob.cloud/runtime-package-hash': runtimePackageHash,
        'shadowob.cloud/runner-image': image,
      }

      let workloadName: pulumi.Output<string>
      if (workloadBackend(config) === 'agent-sandbox') {
        const sandbox = createAgentSandbox({
          agentName,
          agent,
          namespace,
          namespaceName: namespace,
          config,
          configMapName: configRes.configMapName,
          secretName: configRes.secretName,
          extraEnv: unitPlainEnv,
          provider,
          imagePullPolicy,
          sharedWorkspacePvcName,
          sharedWorkspaceMountPath,
          skillsInstallDir,
          podTemplateAnnotations,
          metadataLabels: unitLabels,
          metadataAnnotations: unitAnnotations,
          resourceOptions: { dependsOn: baseDependsOn },
        })
        workloadName = sandbox.sandboxClaim.metadata.name
        outputs[`${agentName}-sandbox-claim-name`] = sandbox.sandboxClaim.metadata.name
        outputs[`${agentName}-sandbox-template-name`] = sandbox.sandboxTemplate.metadata.name
        outputs[`${agentName}-state-pvc`] = pulumi.output(runtimeStatePvcName(agentName))
      } else {
        const deployment = createAgentDeployment({
          agentName,
          agent,
          namespace,
          namespaceName: namespace,
          config,
          configMapName: configRes.configMapName,
          secretName: configRes.secretName,
          extraEnv: unitPlainEnv,
          provider,
          imagePullPolicy,
          sharedWorkspacePvcName,
          sharedWorkspaceMountPath,
          skillsInstallDir,
          podTemplateAnnotations,
          metadataLabels: unitLabels,
          metadataAnnotations: unitAnnotations,
          resourceOptions: { dependsOn: baseDependsOn },
        })
        workloadName = deployment.deployment.metadata.name
        outputs[`${agentName}-deployment-name`] = deployment.deployment.metadata.name
      }

      // Service (for health check endpoint)
      const networking = createNetworking({
        agentName,
        namespace,
        port: HEALTH_PORT,
        targetPort: healthPort,
        provider,
        labels: unitLabels,
        annotations: unitAnnotations,
        resourceOptions: namespaceResourceOptions,
      })

      // Export service cluster IP for resource retrieval
      outputs[`${agentName}-service-ip`] = networking.service.spec.clusterIP
      outputs[`${agentName}-workload-name`] = workloadName
      for (const logicalAgentId of unit.agentIds) {
        outputs[`${logicalAgentId}-execution-unit`] = pulumi.output(unit.id)
        outputs[`${logicalAgentId}-workload-name`] = workloadName
      }
    }

    return outputs
  }
}

/**
 * Build K8s resource definitions for manifest generation (non-Pulumi mode).
 * Returns plain objects that can be serialized to YAML/JSON.
 */
export function buildManifests(options: InfraOptions) {
  const { config, namespace, shadowServerUrl, runtimeEnvVars, imagePullPolicy } = options
  const runtimeContext = normalizeDeploymentRuntimeContext(options.runtimeContext)
  const topology = planRuntimeTopology(config)
  const agentMap = agentsById(config)
  const manifests: Array<Record<string, unknown>> = []

  // Determine extra egress ports (e.g. Shadow server on non-standard port)
  const extraEgressPorts: number[] = []
  if (shadowServerUrl) {
    try {
      const u = new URL(shadowServerUrl)
      const port = u.port
        ? Number(u.port)
        : u.protocol === 'https:' || u.protocol === 'wss:'
          ? 443
          : 80
      if (port && !Number.isNaN(port)) extraEgressPorts.push(port)
    } catch {
      // ignore malformed URL
    }
  }

  // Namespace
  manifests.push({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
      labels: { app: 'shadowob-cloud', 'managed-by': 'shadowob-cloud-cli' },
      annotations: PULUMI_MANAGED_ANNOTATIONS,
    },
  })

  // Shared workspace PVC
  const hasSharedWorkspace = config.workspace?.enabled
  const sharedMountPath = config.workspace?.mountPath ?? '/workspace/shared'
  if (hasSharedWorkspace) {
    const ws = config.workspace!
    manifests.push({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: 'shared-workspace',
        namespace,
        labels: { app: 'shadowob-cloud', 'managed-by': 'shadowob-cloud-cli' },
        annotations: PULUMI_MANAGED_ANNOTATIONS,
      },
      spec: {
        accessModes: [ws.accessMode ?? 'ReadWriteOnce'],
        resources: { requests: { storage: ws.storageSize ?? '5Gi' } },
        ...(ws.storageClassName ? { storageClassName: ws.storageClassName } : {}),
      },
    })
  }

  const skillsInstallDir = config.skills?.entries?.length
    ? (config.skills.installDir ?? '/app/skills')
    : undefined

  for (const unit of topology.executionUnits) {
    const agent = agentForUnit(agentMap, unit)
    const unitAgents = agentsForUnit(agentMap, unit)
    const agentName = unit.workloadName
    const runtimePackage = buildExecutionUnitRuntimePackage({
      unit,
      config,
      extraEnvByAgentId: runtimeEnvForAgents({
        agents: unitAgents,
        runtimeContext,
        runtimeEnvVars,
        shadowServerUrl,
      }),
      runtimeContext,
    })
    const unitLabels = executionUnitLabels(unit)
    const unitAnnotations = executionUnitAnnotations(unit)
    const unitPlainEnv = { ...runtimePackage.plainEnv, ...executionUnitEnv(unit) }

    manifests.push({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${agentName}-config`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName, ...unitLabels },
        annotations: { ...PULUMI_MANAGED_ANNOTATIONS, ...unitAnnotations },
      },
      data: runtimePackage.configData,
    })

    manifests.push({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${agentName}-secrets`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName, ...unitLabels },
        annotations: { ...PULUMI_MANAGED_ANNOTATIONS, ...unitAnnotations },
      },
      type: 'Opaque',
      stringData: runtimePackage.secretData,
    })

    const runtime = getRuntime(agent.runtime)
    const image = agent.image ?? runtime.defaultImage
    const runtimePackageHash = stableHash({
      configData: runtimePackage.configData,
      secretData: runtimePackage.secretData,
      image,
    })
    const healthPort = runtime.container.healthPort
    const podTemplateAnnotations = {
      'shadowob.cloud/runtime-package-hash': runtimePackageHash,
      'shadowob.cloud/runner-image': image,
    }
    const sandboxConfig = resolveAgentSandboxConfig(config, agent)
    const pod = buildAgentPodSpec({
      agentName,
      agent,
      namespace,
      config,
      configMapName: `${agentName}-config`,
      secretName: `${agentName}-secrets`,
      extraEnv: unitPlainEnv,
      imagePullPolicy,
      sharedWorkspacePvcName: hasSharedWorkspace ? 'shared-workspace' : undefined,
      sharedWorkspaceMountPath: sharedMountPath,
      skillsInstallDir,
      podLabels: unitLabels,
      podTemplateAnnotations: { ...podTemplateAnnotations, ...unitAnnotations },
      stateVolume:
        workloadBackend(config) === 'agent-sandbox' && sandboxConfig.state.enabled
          ? 'volumeClaimTemplate'
          : 'emptyDir',
    })

    for (const configMap of pod.pluginArtifacts.configMaps) {
      manifests.push({
        apiVersion: 'v1',
        kind: 'ConfigMap',
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
      })
    }

    if (workloadBackend(config) === 'agent-sandbox') {
      assertAgentSandboxCompatible(config, agent)
      manifests.push(
        buildAgentSandboxTemplateManifest({
          agentName,
          namespace,
          agent,
          sandbox: sandboxConfig,
          pod,
          metadataLabels: unitLabels,
          metadataAnnotations: unitAnnotations,
        }),
      )
      manifests.push(
        buildAgentSandboxClaimManifest({
          agentName,
          namespace,
          agent,
          sandbox: sandboxConfig,
          metadataLabels: unitLabels,
          metadataAnnotations: unitAnnotations,
        }),
      )
    } else {
      manifests.push({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: agentName,
          namespace,
          labels: {
            app: 'shadowob-cloud',
            agent: agentName,
            runtime: agent.runtime,
            ...unitLabels,
          },
          annotations: {
            ...PULUMI_MANAGED_ANNOTATIONS,
            ...unitAnnotations,
            ...(agent.version
              ? {
                  'shadowob-cloud/agent-version': agent.version,
                  'shadowob-cloud/deployed-at': new Date().toISOString(),
                  ...(agent.changelog ? { 'shadowob-cloud/changelog': agent.changelog } : {}),
                }
              : {}),
          },
        },
        spec: {
          replicas: agent.replicas ?? 1,
          selector: { matchLabels: { app: 'shadowob-cloud', agent: agentName } },
          template: {
            metadata: {
              labels: pod.labels,
              annotations: pod.annotations,
            },
            spec: {
              securityContext: buildSecurityContext(),
              containers: pod.containers,
              volumes: pod.volumes,
              ...(pod.initContainers.length > 0 ? { initContainers: pod.initContainers } : {}),
              restartPolicy: 'Always',
            },
          },
        },
      })
    }

    // Service
    manifests.push({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: serviceNameForAgent(agentName),
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName, ...unitLabels },
        annotations: {
          ...PULUMI_MANAGED_ANNOTATIONS,
          ...PULUMI_SKIP_AWAIT_ANNOTATIONS,
          ...unitAnnotations,
        },
      },
      spec: {
        selector: { app: 'shadowob-cloud', agent: agentName },
        ports: [{ name: 'health', port: HEALTH_PORT, targetPort: healthPort, protocol: 'TCP' }],
        type: 'ClusterIP',
      },
    })

    // NetworkPolicy — restrict traffic based on agent networking config
    manifests.push(
      buildNetworkPolicy(agentName, namespace, healthPort, extraEgressPorts, agent.networking, {
        labels: unitLabels,
        annotations: unitAnnotations,
      }),
    )

    // Add plugin-generated K8s resources (Ingress, CronJob, etc.)
    for (const resource of runtimePackage.pluginResources) {
      manifests.push(resource)
    }
  }

  return manifests
}
