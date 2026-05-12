/**
 * Pulumi program — deploys K8s resources from resolved cloud config.
 */

import * as pulumi from '@pulumi/pulumi'
import type { CloudConfig } from '../config/schema.js'
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
  DEFAULT_IMAGES,
  DEFAULT_OPENCLAW_RUNNER_IMAGE,
  HEALTH_PORT,
  healthPortForRuntime,
  PULUMI_MANAGED_ANNOTATIONS,
  PULUMI_SKIP_AWAIT_ANNOTATIONS,
} from './constants.js'
import { stableHash } from './hash.js'
import { createNetworking } from './networking.js'
import { buildAgentRuntimePackage } from './runtime-package.js'
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

/**
 * Pulumi program function that creates all K8s resources.
 * Used with Pulumi automation API for programmatic deployments.
 */
export function createInfraProgram(options: InfraOptions) {
  return async () => {
    const { config, namespace, shadowServerUrl, runtimeEnvVars, imagePullPolicy } = options
    const runtimeContext = normalizeDeploymentRuntimeContext(options.runtimeContext)
    const agents = config.deployments?.agents ?? []

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

    for (const agent of agents) {
      const agentName = agent.id
      const healthPort = healthPortForRuntime(agent.runtime)

      // Build env vars from agent-level env (populated by plugin onProvision hooks)
      const env = {
        ...runtimeContextEnv(runtimeContext),
        ...(agent.env ?? {}),
        ...(runtimeEnvVars ?? {}),
      }

      // The k8s shadow URL (pod-shadow-url) must override the provision URL
      // that onProvision wrote into agent.env.SHADOW_SERVER_URL.
      if (shadowServerUrl) {
        env.SHADOW_SERVER_URL = shadowServerUrl
      }

      const runtimePackage = buildAgentRuntimePackage({
        agent,
        config,
        extraEnv: env,
        runtimeContext,
      })
      const image = agent.image ?? DEFAULT_IMAGES[agent.runtime] ?? DEFAULT_OPENCLAW_RUNNER_IMAGE
      const runtimePackageHash = stableHash({
        configData: runtimePackage.configData,
        secretData: runtimePackage.secretData,
        image,
      })

      // ConfigMap + Secret
      const configRes = createConfigResources({
        agentName,
        namespace,
        runtimePackage,
        provider,
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
          extraEnv: runtimePackage.plainEnv,
          provider,
          imagePullPolicy,
          sharedWorkspacePvcName,
          sharedWorkspaceMountPath,
          skillsInstallDir,
          podTemplateAnnotations,
          resourceOptions: { dependsOn: baseDependsOn },
        })
        workloadName = sandbox.sandboxClaim.metadata.name
        outputs[`${agentName}-sandbox-claim-name`] = sandbox.sandboxClaim.metadata.name
        outputs[`${agentName}-sandbox-template-name`] = sandbox.sandboxTemplate.metadata.name
        outputs[`${agentName}-state-pvc`] = pulumi.output(`openclaw-data-${agentName}`)
      } else {
        const deployment = createAgentDeployment({
          agentName,
          agent,
          namespace,
          namespaceName: namespace,
          config,
          configMapName: configRes.configMapName,
          secretName: configRes.secretName,
          extraEnv: runtimePackage.plainEnv,
          provider,
          imagePullPolicy,
          sharedWorkspacePvcName,
          sharedWorkspaceMountPath,
          skillsInstallDir,
          podTemplateAnnotations,
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
        resourceOptions: namespaceResourceOptions,
      })

      // Export service cluster IP for resource retrieval
      outputs[`${agentName}-service-ip`] = networking.service.spec.clusterIP
      outputs[`${agentName}-workload-name`] = workloadName
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
  const agents = config.deployments?.agents ?? []
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

  for (const agent of agents) {
    const agentName = agent.id
    const env = {
      ...runtimeContextEnv(runtimeContext),
      ...(agent.env ?? {}),
      ...(runtimeEnvVars ?? {}),
    }

    // The k8s shadow URL (pod-shadow-url) must override the provision URL
    // that onProvision wrote into agent.env.SHADOW_SERVER_URL.
    if (shadowServerUrl) {
      env.SHADOW_SERVER_URL = shadowServerUrl
    }

    const runtimePackage = buildAgentRuntimePackage({
      agent,
      config,
      extraEnv: env,
      runtimeContext,
    })

    manifests.push({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${agentName}-config`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName },
        annotations: PULUMI_MANAGED_ANNOTATIONS,
      },
      data: runtimePackage.configData,
    })

    manifests.push({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${agentName}-secrets`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName },
        annotations: PULUMI_MANAGED_ANNOTATIONS,
      },
      type: 'Opaque',
      stringData: runtimePackage.secretData,
    })

    const image = agent.image ?? DEFAULT_IMAGES[agent.runtime] ?? DEFAULT_OPENCLAW_RUNNER_IMAGE
    const runtimePackageHash = stableHash({
      configData: runtimePackage.configData,
      secretData: runtimePackage.secretData,
      image,
    })
    const healthPort = healthPortForRuntime(agent.runtime)
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
      extraEnv: runtimePackage.plainEnv,
      imagePullPolicy,
      sharedWorkspacePvcName: hasSharedWorkspace ? 'shared-workspace' : undefined,
      sharedWorkspaceMountPath: sharedMountPath,
      skillsInstallDir,
      podTemplateAnnotations,
      openclawDataVolume:
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
        }),
      )
      manifests.push(
        buildAgentSandboxClaimManifest({
          agentName,
          namespace,
          agent,
          sandbox: sandboxConfig,
        }),
      )
    } else {
      manifests.push({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: agentName,
          namespace,
          labels: { app: 'shadowob-cloud', agent: agentName, runtime: agent.runtime },
          annotations: {
            ...PULUMI_MANAGED_ANNOTATIONS,
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
              labels: { app: 'shadowob-cloud', agent: agentName, runtime: agent.runtime },
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
        name: `${agentName}-svc`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName },
        annotations: {
          ...PULUMI_MANAGED_ANNOTATIONS,
          ...PULUMI_SKIP_AWAIT_ANNOTATIONS,
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
      buildNetworkPolicy(agentName, namespace, healthPort, extraEgressPorts, agent.networking),
    )

    // Add plugin-generated K8s resources (Ingress, CronJob, etc.)
    for (const resource of runtimePackage.pluginResources) {
      manifests.push(resource)
    }
  }

  return manifests
}
