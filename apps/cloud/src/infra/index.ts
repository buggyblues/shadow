/**
 * Pulumi program — deploys K8s resources from resolved cloud config.
 */

import type * as pulumi from '@pulumi/pulumi'
import type { CloudConfig } from '../config/schema.js'
import { createAgentDeployment } from './agent-deployment.js'
import { createConfigResources } from './config-resources.js'
import {
  baseEnvVars,
  baseVolumeMounts,
  baseVolumes,
  DEFAULT_IMAGES,
  DEFAULT_OPENCLAW_RUNNER_IMAGE,
  DEFAULT_RESOURCES,
  HEALTH_PORT,
  healthPortForRuntime,
  PULUMI_MANAGED_ANNOTATIONS,
  PULUMI_SKIP_AWAIT_ANNOTATIONS,
  probesForRuntime,
} from './constants.js'
import { stableHash } from './hash.js'
import { createNetworking } from './networking.js'
import { collectPluginK8sArtifacts } from './plugin-k8s.js'
import { buildAgentRuntimePackage } from './runtime-package.js'
import {
  buildContainerSecurityContext,
  buildNetworkPolicy,
  buildSecurityContext,
} from './security.js'
import { createSharedResources } from './shared.js'

export interface InfraOptions {
  config: CloudConfig
  namespace: string
  shadowServerUrl?: string
  /** kubectl context for K8s provider — defaults to KUBECONFIG_CONTEXT or 'rancher-desktop' */
  kubeContext?: string
  /** Path to a kubeconfig YAML file — takes precedence over kubeContext when set */
  kubeConfigPath?: string
  /**
   * Image pull policy for all agent containers.
   * Default: 'IfNotPresent' — works for local Docker builds (Rancher Desktop).
   */
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
}

/**
 * Pulumi program function that creates all K8s resources.
 * Used with Pulumi automation API for programmatic deployments.
 */
export function createInfraProgram(options: InfraOptions) {
  return async () => {
    const { config, namespace, shadowServerUrl, imagePullPolicy } = options
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
      const env = { ...(agent.env ?? {}) }

      // The k8s shadow URL (pod-shadow-url) must override the provision URL
      // that onProvision wrote into agent.env.SHADOW_SERVER_URL.
      if (shadowServerUrl) {
        env.SHADOW_SERVER_URL = shadowServerUrl
      }

      const runtimePackage = buildAgentRuntimePackage({
        agent,
        config,
        extraEnv: env,
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

      // Deployment — must wait for namespace to exist
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
        imagePullPolicy: imagePullPolicy ?? 'IfNotPresent',
        sharedWorkspacePvcName,
        sharedWorkspaceMountPath,
        skillsInstallDir,
        podTemplateAnnotations: {
          'shadowob.cloud/runtime-package-hash': runtimePackageHash,
          'shadowob.cloud/runner-image': image,
        },
        resourceOptions: {
          dependsOn: [
            shared.namespace,
            ...(shared.workspacePvc ? [shared.workspacePvc] : []),
            configRes.configMap,
            configRes.secret,
          ],
        },
      })

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
      outputs[`${agentName}-deployment-name`] = deployment.deployment.metadata.name
    }

    return outputs
  }
}

/**
 * Build K8s resource definitions for manifest generation (non-Pulumi mode).
 * Returns plain objects that can be serialized to YAML/JSON.
 */
export function buildManifests(options: InfraOptions) {
  const {
    config,
    namespace,

    shadowServerUrl,
    imagePullPolicy = 'IfNotPresent',
  } = options
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
    const env = { ...(agent.env ?? {}) }

    // The k8s shadow URL (pod-shadow-url) must override the provision URL
    // that onProvision wrote into agent.env.SHADOW_SERVER_URL.
    if (shadowServerUrl) {
      env.SHADOW_SERVER_URL = shadowServerUrl
    }

    const runtimePackage = buildAgentRuntimePackage({
      agent,
      config,
      extraEnv: env,
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

    // Deployment
    const image = agent.image ?? DEFAULT_IMAGES[agent.runtime] ?? DEFAULT_OPENCLAW_RUNNER_IMAGE
    const runtimePackageHash = stableHash({
      configData: runtimePackage.configData,
      secretData: runtimePackage.secretData,
      image,
    })
    const healthPort = healthPortForRuntime(agent.runtime)
    const { livenessProbe, readinessProbe, startupProbe } = probesForRuntime(agent.runtime)

    // Build volume mounts and volumes from shared constants
    const volumeMounts: Array<Record<string, unknown>> = baseVolumeMounts()
    const volumes: Array<Record<string, unknown>> = baseVolumes(`${agentName}-config`)
    let initContainers: Array<Record<string, unknown>> = []

    // Shared workspace PVC
    if (hasSharedWorkspace) {
      volumeMounts.push({ name: 'shared-workspace', mountPath: sharedMountPath })
      volumes.push({
        name: 'shared-workspace',
        persistentVolumeClaim: { claimName: 'shared-workspace' },
      })
    }

    // Skills directory
    if (skillsInstallDir) {
      volumeMounts.push({ name: 'skills', mountPath: skillsInstallDir })
      volumes.push({ name: 'skills', emptyDir: {} })
    }

    // Collect K8s artifacts from all plugins (init containers, volumes, env vars, labels)
    const pluginK8s = collectPluginK8sArtifacts(agent, config, namespace)
    for (const configMap of pluginK8s.configMaps) {
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
    for (const vol of pluginK8s.volumes) {
      volumes.push({ name: vol.name, ...vol.spec })
    }
    for (const vm of pluginK8s.volumeMounts) {
      volumeMounts.push(vm as unknown as Record<string, unknown>)
    }
    initContainers = pluginK8s.initContainers as unknown as Array<Record<string, unknown>>

    const envList = [
      ...baseEnvVars(agentName, agent.runtime),
      ...Object.entries(runtimePackage.plainEnv).map(([name, value]) => ({ name, value })),
      ...pluginK8s.envVars,
    ]
    if (hasSharedWorkspace) {
      envList.push({ name: 'SHARED_WORKSPACE_PATH', value: sharedMountPath })
    }
    if (skillsInstallDir) {
      envList.push({ name: 'SKILLS_DIR', value: skillsInstallDir })
    }

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
            annotations: {
              'shadowob.cloud/runtime-package-hash': runtimePackageHash,
              'shadowob.cloud/runner-image': image,
              ...pluginK8s.annotations,
            },
          },
          spec: {
            securityContext: buildSecurityContext(),
            containers: [
              {
                name: agent.runtime,
                image,
                imagePullPolicy,
                ports: [{ containerPort: healthPort, name: 'health' }],
                env: envList,
                envFrom: [{ secretRef: { name: `${agentName}-secrets` } }],
                volumeMounts,
                resources: agent.resources ?? DEFAULT_RESOURCES,
                securityContext: buildContainerSecurityContext(),
                livenessProbe,
                readinessProbe,
                startupProbe,
              },
              // Plugin-contributed helper containers (e.g. gitagent git-pull loop)
              ...pluginK8s.sidecars.map((sc) => ({
                name: sc.name,
                image: sc.image,
                imagePullPolicy: sc.imagePullPolicy,
                command: sc.command,
                args: sc.args,
                env: sc.env,
                volumeMounts: sc.volumeMounts,
                resources: sc.resources,
                securityContext: sc.securityContext,
              })),
            ],
            volumes,
            ...(initContainers.length > 0 ? { initContainers } : {}),
            restartPolicy: 'Always',
          },
        },
      },
    })

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
