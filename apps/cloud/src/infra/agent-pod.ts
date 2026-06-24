import type * as k8s from '@pulumi/kubernetes'
import type { AgentDeployment, AgentSchedulingConfig, CloudConfig } from '../config/schema.js'
import '../runtimes/loader.js'
import {
  RUNNER_AGENTS_VOLUME_NAME,
  RUNNER_CONFIG_MOUNT_PATH,
  RUNNER_CONFIG_VOLUME_NAME,
  RUNNER_GID,
  RUNNER_LOG_VOLUME_NAME,
  RUNNER_STATE_MODE,
  RUNNER_STATE_VOLUME_NAME,
  RUNNER_TMP_VOLUME_NAME,
  RUNNER_UID,
} from '../runtimes/container.js'
import { getRuntime, type RuntimeAdapter } from '../runtimes/index.js'
import {
  SHADOW_EXPOSURE_CONFIG_PATH,
  SHADOW_EXPOSURE_DIR,
  SHADOW_EXPOSURE_STATUS_PATH,
} from '../runtimes/package-common.js'
import { DEFAULT_RESOURCES, probesForPort } from './constants.js'
import { assertNoReservedEnvOverrides, dedupeEnvVars } from './env-vars.js'
import { resolveImagePullPolicy } from './image-pull-policy.js'
import { type CollectedK8sArtifacts, collectPluginK8sArtifacts } from './plugin-k8s.js'
import {
  buildContainerSecurityContext,
  buildStateVolumeInitContainerSecurityContext,
} from './security.js'

const STATE_VOLUME_INIT_MOUNT_PATH = '/state'
const SHADOW_EXPOSURE_VOLUME_NAME = 'shadow-exposure'
const DEFAULT_EXPOSURE_TOKEN_SECRET_KEY = 'SHADOW_CLOUD_EXPOSURE_TOKEN'

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
  /**
   * Runtime state volume source.
   * In Sandbox pod templates, runtime state can be provided by volumeClaimTemplates.
   * Deployment workloads should use a per-agent PVC so rollout/rescheduling does
   * not discard the runner state directory.
   */
  stateVolume?:
    | 'emptyDir'
    | 'volumeClaimTemplate'
    | { persistentVolumeClaim: { claimName: string } }
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
    { name: 'SHADOW_CLOUD_AGENT_ID', value: agentName },
    { name: 'NODE_ENV', value: 'production' },
    { name: 'HOME', value: runtime.container.homeDir },
    { name: 'SHADOW_WORKSPACE', value: '/workspace' },
    { name: 'SHADOW_EXPOSURE_CONFIG', value: SHADOW_EXPOSURE_CONFIG_PATH },
    { name: 'SHADOW_EXPOSURE_STATUS', value: SHADOW_EXPOSURE_STATUS_PATH },
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

function runtimeStateVolume(
  stateVolume: AgentPodSpecOptions['stateVolume'],
): k8s.types.input.core.v1.Volume | undefined {
  if (stateVolume === 'volumeClaimTemplate') return undefined
  if (stateVolume && typeof stateVolume === 'object') {
    return {
      name: RUNNER_STATE_VOLUME_NAME,
      persistentVolumeClaim: { claimName: stateVolume.persistentVolumeClaim.claimName },
    }
  }
  return { name: RUNNER_STATE_VOLUME_NAME, emptyDir: {} }
}

function baseVolumes(
  configMapName: string,
  stateVolume: AgentPodSpecOptions['stateVolume'],
): k8s.types.input.core.v1.Volume[] {
  const state = runtimeStateVolume(stateVolume)
  return [
    ...(state ? [state] : []),
    { name: RUNNER_CONFIG_VOLUME_NAME, configMap: { name: configMapName } },
    { name: RUNNER_LOG_VOLUME_NAME, emptyDir: {} },
    { name: RUNNER_TMP_VOLUME_NAME, emptyDir: {} },
    { name: RUNNER_AGENTS_VOLUME_NAME, emptyDir: {} },
  ]
}

function exposureEnabled(config: CloudConfig): boolean {
  return config.exposure?.enabled !== false
}

function exposureVolume(): k8s.types.input.core.v1.Volume {
  return { name: SHADOW_EXPOSURE_VOLUME_NAME, emptyDir: {} }
}

function exposureVolumeMount(): k8s.types.input.core.v1.VolumeMount {
  return { name: SHADOW_EXPOSURE_VOLUME_NAME, mountPath: SHADOW_EXPOSURE_DIR }
}

function exposureSidecar(options: {
  agentName: string
  namespace: string
  config: CloudConfig
  secretName: string
  runtimeImage: string
  imagePullPolicy: 'Always' | 'IfNotPresent' | 'Never'
  extraEnv?: Record<string, string>
}): k8s.types.input.core.v1.Container {
  const exposure = options.config.exposure ?? {}
  return {
    name: 'shadow-exposure-agent',
    image: exposure.agentImage ?? options.runtimeImage,
    imagePullPolicy: options.imagePullPolicy,
    command: ['shadowob'],
    args: ['cloud', 'app', 'watch-exposures'],
    env: dedupeEnvVars([
      { name: 'AGENT_ID', value: options.agentName },
      { name: 'SHADOW_CLOUD_AGENT_ID', value: options.agentName },
      {
        name: 'SHADOW_CLOUD_DEPLOYMENT_ID',
        value: options.extraEnv?.SHADOW_CLOUD_DEPLOYMENT_ID ?? '',
      },
      { name: 'POD_NAMESPACE', value: options.namespace },
      {
        name: 'SHADOW_SERVER_URL',
        value: exposure.controlPlaneUrl ?? options.extraEnv?.SHADOW_SERVER_URL ?? '',
      },
      { name: 'SHADOW_EXPOSURE_CONFIG', value: exposure.configPath ?? SHADOW_EXPOSURE_CONFIG_PATH },
      { name: 'SHADOW_EXPOSURE_STATUS', value: exposure.statusPath ?? SHADOW_EXPOSURE_STATUS_PATH },
      {
        name: 'SHADOW_EXPOSURE_POLL_INTERVAL_SECONDS',
        value: String(exposure.pollIntervalSeconds ?? 2),
      },
      {
        name: 'SHADOW_EXPOSURE_ALLOW_FILE_INSTALL',
        value: String(exposure.allowFileRequestedInstall === true),
      },
      {
        name: 'SHADOW_CLOUD_EXPOSURE_TOKEN',
        valueFrom: {
          secretKeyRef: {
            name: options.secretName,
            key: exposure.tokenSecretKey ?? DEFAULT_EXPOSURE_TOKEN_SECRET_KEY,
            optional: true,
          },
        },
      },
    ]),
    volumeMounts: [exposureVolumeMount()],
    resources: {
      requests: { cpu: '10m', memory: '32Mi' },
      limits: { cpu: '100m', memory: '128Mi' },
    },
    securityContext: buildContainerSecurityContext(),
  }
}

function stateVolumePermissionsInitContainer(
  image: string,
  imagePullPolicy: 'Always' | 'IfNotPresent' | 'Never',
): k8s.types.input.core.v1.Container {
  return {
    name: 'state-permissions',
    image,
    imagePullPolicy,
    command: [
      'sh',
      '-c',
      [
        'set -eu',
        'state_dir="$1"',
        `chown -R ${RUNNER_UID}:${RUNNER_GID} "$state_dir"`,
        `chmod ${RUNNER_STATE_MODE} "$state_dir"`,
      ].join('\n'),
      'state-permissions',
      STATE_VOLUME_INIT_MOUNT_PATH,
    ],
    volumeMounts: [{ name: RUNNER_STATE_VOLUME_NAME, mountPath: STATE_VOLUME_INIT_MOUNT_PATH }],
    resources: {
      requests: { cpu: '5m', memory: '16Mi' },
      limits: { cpu: '50m', memory: '64Mi' },
    },
    securityContext: buildStateVolumeInitContainerSecurityContext(),
  }
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
  const volumes: k8s.types.input.core.v1.Volume[] = baseVolumes(
    options.configMapName,
    options.stateVolume,
  )
  const initContainers: k8s.types.input.core.v1.Container[] = [
    stateVolumePermissionsInitContainer(image, imagePullPolicy),
  ]

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

  if (exposureEnabled(options.config)) {
    volumeMounts.push(exposureVolumeMount())
    volumes.push(exposureVolume())
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
    ...(exposureEnabled(options.config)
      ? [
          exposureSidecar({
            agentName: options.agentName,
            namespace: options.namespace,
            config: options.config,
            secretName: options.secretName,
            runtimeImage: image,
            imagePullPolicy,
            extraEnv: options.extraEnv,
          }),
        ]
      : []),
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
