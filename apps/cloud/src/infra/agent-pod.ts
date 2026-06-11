import type * as k8s from '@pulumi/kubernetes'
import type { AgentDeployment, AgentSchedulingConfig, CloudConfig } from '../config/schema.js'
import '../runtimes/loader.js'
import {
  RUNNER_AGENTS_VOLUME_NAME,
  RUNNER_CONFIG_MOUNT_PATH,
  RUNNER_CONFIG_VOLUME_NAME,
  RUNNER_LOG_VOLUME_NAME,
  RUNNER_STATE_VOLUME_NAME,
  RUNNER_TMP_VOLUME_NAME,
} from '../runtimes/container.js'
import { getRuntime, type RuntimeAdapter } from '../runtimes/index.js'
import { DEFAULT_RESOURCES, probesForPort } from './constants.js'
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
  podLabels?: Record<string, string>
  podTemplateAnnotations?: Record<string, string>
  /** In Sandbox pod templates, runtime state is provided by volumeClaimTemplates. */
  stateVolume?: 'emptyDir' | 'volumeClaimTemplate'
}

export interface BuiltAgentPodSpec {
  image: string
  healthPort: number
  labels: Record<string, string>
  annotations: Record<string, string>
  initContainers: k8s.types.input.core.v1.Container[]
  containers: k8s.types.input.core.v1.Container[]
  volumes: k8s.types.input.core.v1.Volume[]
  scheduling: {
    nodeSelector?: Record<string, string>
    affinity?: k8s.types.input.core.v1.Affinity
    tolerations?: k8s.types.input.core.v1.Toleration[]
  }
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

function baseEnvVars(agentName: string, runtime: RuntimeAdapter): k8s.types.input.core.v1.EnvVar[] {
  return [
    { name: 'AGENT_ID', value: agentName },
    { name: 'NODE_ENV', value: 'production' },
    { name: 'HOME', value: runtime.container.homeDir },
    ...runtime.container.env,
  ]
}

function baseVolumeMounts(runtime: RuntimeAdapter): k8s.types.input.core.v1.VolumeMount[] {
  return [
    { name: RUNNER_STATE_VOLUME_NAME, mountPath: runtime.container.statePath },
    { name: RUNNER_CONFIG_VOLUME_NAME, mountPath: RUNNER_CONFIG_MOUNT_PATH, readOnly: true },
    { name: RUNNER_LOG_VOLUME_NAME, mountPath: runtime.container.logPath },
    { name: RUNNER_TMP_VOLUME_NAME, mountPath: '/tmp' },
    { name: RUNNER_AGENTS_VOLUME_NAME, mountPath: '/workspace/.agents' },
  ]
}

function baseVolumes(configMapName: string): k8s.types.input.core.v1.Volume[] {
  return [
    { name: RUNNER_STATE_VOLUME_NAME, emptyDir: {} },
    { name: RUNNER_CONFIG_VOLUME_NAME, configMap: { name: configMapName } },
    { name: RUNNER_LOG_VOLUME_NAME, emptyDir: {} },
    { name: RUNNER_TMP_VOLUME_NAME, emptyDir: {} },
    { name: RUNNER_AGENTS_VOLUME_NAME, emptyDir: {} },
  ]
}

function isAgentSandboxBackend(config: CloudConfig): boolean {
  return (config.deployments?.backend ?? 'agent-sandbox') === 'agent-sandbox'
}

function hasKeys(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function resolveSchedulingConfig(
  config: CloudConfig,
  agent: AgentDeployment,
): BuiltAgentPodSpec['scheduling'] {
  const defaults: AgentSchedulingConfig = isAgentSandboxBackend(config)
    ? { nodeSelector: { 'shadowob.com/sandbox-ready': 'true' } }
    : {}
  const globalScheduling = config.deployments?.scheduling ?? {}
  const agentScheduling = agent.scheduling ?? {}
  const nodeSelector = {
    ...(defaults.nodeSelector ?? {}),
    ...(globalScheduling.nodeSelector ?? {}),
    ...(agentScheduling.nodeSelector ?? {}),
  }
  const affinity = agentScheduling.affinity ?? globalScheduling.affinity
  const tolerations = agentScheduling.tolerations ?? globalScheduling.tolerations

  return {
    ...(Object.keys(nodeSelector).length > 0 ? { nodeSelector } : {}),
    ...(hasKeys(affinity)
      ? { affinity: affinity as unknown as k8s.types.input.core.v1.Affinity }
      : {}),
    ...(tolerations && tolerations.length > 0
      ? { tolerations: tolerations as unknown as k8s.types.input.core.v1.Toleration[] }
      : {}),
  }
}

export function buildAgentPodSpec(options: AgentPodSpecOptions): BuiltAgentPodSpec {
  const runtime = getRuntime(options.agent.runtime)
  const image = options.agent.image ?? runtime.defaultImage
  const healthPort = runtime.container.healthPort
  const { livenessProbe, readinessProbe, startupProbe } = probesForPort(healthPort)
  const imagePullPolicy = resolveImagePullPolicy(options.imagePullPolicy, image)

  const mergedExtraEnv = { ...options.extraEnv }

  const envVars: k8s.types.input.core.v1.EnvVar[] = [
    ...baseEnvVars(options.agentName, runtime),
    ...Object.entries(mergedExtraEnv).map(([name, value]) => ({ name, value })),
  ]

  const volumeMounts: k8s.types.input.core.v1.VolumeMount[] = baseVolumeMounts(runtime)
  const volumes: k8s.types.input.core.v1.Volume[] = baseVolumes(options.configMapName).filter(
    (volume) =>
      options.stateVolume === 'volumeClaimTemplate'
        ? volume.name !== RUNNER_STATE_VOLUME_NAME
        : true,
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
      ...(options.podLabels ?? {}),
      ...pluginArtifacts.labels,
    },
    annotations: {
      ...options.podTemplateAnnotations,
      ...pluginArtifacts.annotations,
    },
    initContainers,
    containers,
    volumes,
    scheduling: resolveSchedulingConfig(options.config, options.agent),
    pluginArtifacts,
  }
}
