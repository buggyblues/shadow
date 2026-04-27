/**
 * Agent Deployment — Kubernetes Deployment resource via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import type { AgentDeployment } from '../config/schema.js'
import '../runtimes/loader.js'
import { getRuntime } from '../runtimes/index.js'
import {
  baseEnvVars,
  baseVolumeMounts,
  baseVolumes,
  DEFAULT_RESOURCES,
  HEALTH_PORT,
  LIVENESS_PROBE,
  READINESS_PROBE,
  STARTUP_PROBE,
} from './constants.js'
import { collectPluginK8sArtifacts } from './plugin-k8s.js'
import { buildContainerSecurityContext, buildSecurityContext } from './security.js'

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
   * Defaults to 'IfNotPresent' when image tag is 'latest' or contains 'local',
   * otherwise 'IfNotPresent'.
   */
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
  /** Shared workspace PVC name (when enabled) */
  sharedWorkspacePvcName?: string
  /** Mount path for shared workspace inside the container */
  sharedWorkspaceMountPath?: string
  /** Skills install directory inside the container */
  skillsInstallDir?: string
  resourceOptions?: pulumi.CustomResourceOptions
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

  const image = agent.image ?? getRuntime(agent.runtime).defaultImage
  const replicas = agent.replicas ?? 1

  // Default to IfNotPresent — works for local builds (Rancher Desktop) and cached registry images
  const imagePullPolicy = options.imagePullPolicy ?? 'IfNotPresent'

  // Merge user-provided env with runtime adapter env
  const runtimeEnv = getRuntime(agent.runtime).extraEnv(agent)
  const mergedExtraEnv = { ...runtimeEnv, ...extraEnv }

  const envVars: k8s.types.input.core.v1.EnvVar[] = [
    ...baseEnvVars(agentName, agent.runtime),
    ...Object.entries(mergedExtraEnv).map(([name, value]) => ({ name, value })),
  ]

  // Build volume mounts from shared constants
  const volumeMounts: k8s.types.input.core.v1.VolumeMount[] = baseVolumeMounts()
  const volumes: k8s.types.input.core.v1.Volume[] = baseVolumes(configMapName)
  const initContainers: k8s.types.input.core.v1.Container[] = []

  // Collect K8s artifacts from all plugins (init containers, volumes, env vars, labels)
  const ns = namespaceName ?? (typeof namespace === 'string' ? namespace : 'default')
  const pluginArtifacts = collectPluginK8sArtifacts(agent, config, ns)

  for (const ic of pluginArtifacts.initContainers) {
    initContainers.push(ic as unknown as k8s.types.input.core.v1.Container)
  }
  for (const vol of pluginArtifacts.volumes) {
    volumes.push({ name: vol.name, ...vol.spec } as k8s.types.input.core.v1.Volume)
  }
  for (const vm of pluginArtifacts.volumeMounts) {
    volumeMounts.push(vm as k8s.types.input.core.v1.VolumeMount)
  }
  for (const ev of pluginArtifacts.envVars) {
    envVars.push(ev as k8s.types.input.core.v1.EnvVar)
  }

  // Shared workspace PVC mount
  if (options.sharedWorkspacePvcName) {
    const mountPath = options.sharedWorkspaceMountPath ?? '/workspace/shared'
    volumeMounts.push({ name: 'shared-workspace', mountPath })
    volumes.push({
      name: 'shared-workspace',
      persistentVolumeClaim: { claimName: options.sharedWorkspacePvcName },
    })
    envVars.push({ name: 'SHARED_WORKSPACE_PATH', value: mountPath })
  }

  // Skills directory volume
  if (options.skillsInstallDir) {
    volumeMounts.push({ name: 'skills', mountPath: options.skillsInstallDir })
    volumes.push({ name: 'skills', emptyDir: {} })
    envVars.push({ name: 'SKILLS_DIR', value: options.skillsInstallDir })
  }

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
          ...pluginArtifacts.labels,
        },
        annotations: pluginArtifacts.annotations,
      },
      spec: {
        replicas,
        selector: {
          matchLabels: {
            app: 'shadowob-cloud',
            agent: agentName,
          },
        },
        template: {
          metadata: {
            labels: {
              app: 'shadowob-cloud',
              agent: agentName,
              runtime: agent.runtime,
            },
          },
          spec: {
            initContainers: initContainers.length > 0 ? initContainers : undefined,
            securityContext: buildSecurityContext(),
            containers: [
              {
                name: agent.runtime,
                image,
                imagePullPolicy,
                ports: [{ containerPort: HEALTH_PORT, name: 'health' }],
                env: envVars,
                envFrom: [{ secretRef: { name: secretName } }],
                volumeMounts,
                resources: (agent.resources ?? DEFAULT_RESOURCES) as Record<string, unknown>,
                securityContext: buildContainerSecurityContext(),
                livenessProbe: LIVENESS_PROBE,
                readinessProbe: READINESS_PROBE,
                startupProbe: STARTUP_PROBE,
              },
              // Plugin-contributed helper containers (e.g. gitagent git-pull loop)
              ...pluginArtifacts.sidecars.map(
                (sc) =>
                  ({
                    name: sc.name,
                    image: sc.image,
                    imagePullPolicy: sc.imagePullPolicy,
                    command: sc.command,
                    args: sc.args,
                    env: sc.env,
                    volumeMounts: sc.volumeMounts,
                    resources: sc.resources,
                    securityContext: sc.securityContext,
                  }) as unknown as k8s.types.input.core.v1.Container,
              ),
            ],
            volumes,
            restartPolicy: 'Always',
          },
        },
      },
    },
    { provider, ...resourceOptions },
  )

  return { deployment }
}
