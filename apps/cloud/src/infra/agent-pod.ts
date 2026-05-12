import type * as k8s from '@pulumi/kubernetes'
import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import '../runtimes/loader.js'
import { getRuntime } from '../runtimes/index.js'
import {
  baseEnvVars,
  baseVolumeMounts,
  baseVolumes,
  DEFAULT_RESOURCES,
  healthPortForRuntime,
  probesForRuntime,
} from './constants.js'
import { assertNoReservedEnvOverrides, dedupeEnvVars } from './env-vars.js'
import { resolveImagePullPolicy } from './image-pull-policy.js'
import { type CollectedK8sArtifacts, collectPluginK8sArtifacts } from './plugin-k8s.js'
import { buildContainerSecurityContext } from './security.js'

export interface AgentPodSpecOptions {
  agentName: string
  agent: AgentDeployment
  namespace: string
  config: CloudConfig
  configMapName: string
  secretName: string
  extraEnv?: Record<string, string>
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
  sharedWorkspacePvcName?: string
  sharedWorkspaceMountPath?: string
  skillsInstallDir?: string
  podTemplateAnnotations?: Record<string, string>
  /**
   * In Sandbox pod templates, openclaw-data is provided by volumeClaimTemplates
   * and must not be declared as an emptyDir volume.
   */
  openclawDataVolume?: 'emptyDir' | 'volumeClaimTemplate'
}

export interface BuiltAgentPodSpec {
  image: string
  healthPort: number
  labels: Record<string, string>
  annotations: Record<string, string>
  initContainers: k8s.types.input.core.v1.Container[]
  containers: k8s.types.input.core.v1.Container[]
  volumes: k8s.types.input.core.v1.Volume[]
  pluginArtifacts: CollectedK8sArtifacts
}

export function validatePluginK8sArtifacts(pluginArtifacts: CollectedK8sArtifacts): void {
  for (const volume of pluginArtifacts.volumes) {
    if ('hostPath' in (volume.spec as Record<string, unknown>)) {
      throw new Error(`Plugin volume ${volume.name} uses forbidden hostPath`)
    }
  }
  for (const container of [...pluginArtifacts.initContainers, ...pluginArtifacts.sidecars]) {
    const securityContext = (container.securityContext ?? {}) as Record<string, unknown>
    if (securityContext.privileged === true || securityContext.allowPrivilegeEscalation === true) {
      throw new Error(`Plugin container ${container.name} requests privileged security context`)
    }
  }
}

export function buildAgentPodSpec(options: AgentPodSpecOptions): BuiltAgentPodSpec {
  const image = options.agent.image ?? getRuntime(options.agent.runtime).defaultImage
  const healthPort = healthPortForRuntime(options.agent.runtime)
  const { livenessProbe, readinessProbe, startupProbe } = probesForRuntime(options.agent.runtime)
  const imagePullPolicy = resolveImagePullPolicy(options.imagePullPolicy, image)

  const runtimeEnv = getRuntime(options.agent.runtime).extraEnv(options.agent)
  const mergedExtraEnv = { ...runtimeEnv, ...options.extraEnv }

  const envVars: k8s.types.input.core.v1.EnvVar[] = [
    ...baseEnvVars(options.agentName, options.agent.runtime),
    ...Object.entries(mergedExtraEnv).map(([name, value]) => ({ name, value })),
  ]

  const volumeMounts: k8s.types.input.core.v1.VolumeMount[] = baseVolumeMounts()
  const volumes: k8s.types.input.core.v1.Volume[] = baseVolumes(options.configMapName).filter(
    (volume) =>
      options.openclawDataVolume === 'volumeClaimTemplate' ? volume.name !== 'openclaw-data' : true,
  )
  const initContainers: k8s.types.input.core.v1.Container[] = []

  const pluginArtifacts = collectPluginK8sArtifacts(
    options.agent,
    options.config,
    options.namespace,
  )
  assertNoReservedEnvOverrides(envVars, pluginArtifacts.envVars, 'Plugin env')
  validatePluginK8sArtifacts(pluginArtifacts)

  for (const ic of pluginArtifacts.initContainers) {
    initContainers.push(ic as unknown as k8s.types.input.core.v1.Container)
  }
  for (const vol of pluginArtifacts.volumes) {
    volumes.push({ name: vol.name, ...vol.spec } as k8s.types.input.core.v1.Volume)
  }
  for (const vm of pluginArtifacts.volumeMounts) {
    volumeMounts.push(vm as unknown as k8s.types.input.core.v1.VolumeMount)
  }
  for (const ev of pluginArtifacts.envVars) {
    envVars.push(ev as unknown as k8s.types.input.core.v1.EnvVar)
  }

  if (options.sharedWorkspacePvcName) {
    const mountPath = options.sharedWorkspaceMountPath ?? '/workspace/shared'
    volumeMounts.push({ name: 'shared-workspace', mountPath })
    volumes.push({
      name: 'shared-workspace',
      persistentVolumeClaim: { claimName: options.sharedWorkspacePvcName },
    })
    envVars.push({ name: 'SHARED_WORKSPACE_PATH', value: mountPath })
  }

  if (options.skillsInstallDir) {
    volumeMounts.push({ name: 'skills', mountPath: options.skillsInstallDir })
    volumes.push({ name: 'skills', emptyDir: {} })
    envVars.push({ name: 'SKILLS_DIR', value: options.skillsInstallDir })
  }

  const containers: k8s.types.input.core.v1.Container[] = [
    {
      name: options.agent.runtime,
      image,
      imagePullPolicy,
      ports: [{ containerPort: healthPort, name: 'health' }],
      env: dedupeEnvVars(envVars),
      envFrom: [{ secretRef: { name: options.secretName } }],
      volumeMounts,
      resources: (options.agent.resources ?? DEFAULT_RESOURCES) as Record<string, unknown>,
      securityContext: buildContainerSecurityContext(),
      livenessProbe,
      readinessProbe,
      startupProbe,
    },
    ...pluginArtifacts.sidecars.map(
      (sc) =>
        ({
          name: sc.name,
          image: sc.image,
          imagePullPolicy: sc.imagePullPolicy,
          command: sc.command,
          args: sc.args,
          env: sc.env ? dedupeEnvVars(sc.env) : undefined,
          volumeMounts: sc.volumeMounts,
          resources: sc.resources,
          securityContext: sc.securityContext,
        }) as unknown as k8s.types.input.core.v1.Container,
    ),
  ]

  return {
    image,
    healthPort,
    labels: {
      app: 'shadowob-cloud',
      agent: options.agentName,
      runtime: options.agent.runtime,
      ...pluginArtifacts.labels,
    },
    annotations: {
      ...options.podTemplateAnnotations,
      ...pluginArtifacts.annotations,
    },
    initContainers,
    containers,
    volumes,
    pluginArtifacts,
  }
}
