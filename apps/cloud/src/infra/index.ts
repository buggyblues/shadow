/**
 * Pulumi program — deploys K8s resources from resolved cloud config.
 */

import type * as pulumi from '@pulumi/pulumi'
import { buildGitCloneCommand } from '../adapters/gitagent-k8s.js'
import { buildOpenClawConfig } from '../config/parser.js'
import type { CloudConfig } from '../config/schema.js'
import type { ProvisionResult } from '../provisioning/index.js'
import { buildProvisionedEnvVars } from '../provisioning/index.js'
import { createAgentDeployment } from './agent-deployment.js'
import { createConfigResources } from './config-resources.js'
import {
  baseEnvVars,
  baseVolumeMounts,
  baseVolumes,
  DEFAULT_IMAGES,
  DEFAULT_RESOURCES,
  GIT_INIT_IMAGE,
  HEALTH_PORT,
  LIVENESS_PROBE,
  READINESS_PROBE,
  STARTUP_PROBE,
} from './constants.js'
import { createNetworking } from './networking.js'
import {
  buildContainerSecurityContext,
  buildNetworkPolicy,
  buildSecurityContext,
} from './security.js'
import { createSharedResources } from './shared.js'

export interface InfraOptions {
  config: CloudConfig
  namespace: string
  provision?: ProvisionResult
  shadowServerUrl?: string
  /** kubectl context for K8s provider — defaults to KUBECONFIG_CONTEXT or 'rancher-desktop' */
  kubeContext?: string
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
    const { config, namespace, provision, shadowServerUrl, imagePullPolicy } = options
    const agents = config.deployments?.agents ?? []

    const outputs: Record<string, pulumi.Output<string>> = {}

    // Shared resources: namespace + explicit K8s provider + optional PVC
    const shared = createSharedResources({
      namespace,
      kubeContext: options.kubeContext,
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

    for (const agent of agents) {
      const agentName = agent.id

      // Build env vars from provisioned resources
      const provisionedEnv =
        provision && shadowServerUrl
          ? buildProvisionedEnvVars(agent.id, config, provision, shadowServerUrl)
          : {}

      // Merge with agent-level env
      const env = { ...provisionedEnv, ...(agent.env ?? {}) }

      // ConfigMap + Secret
      const configRes = createConfigResources({
        agentName,
        agent,
        config,
        namespace,
        extraEnv: env,
        provider,
      })

      // Deployment — must wait for namespace to exist
      const deployment = createAgentDeployment({
        agentName,
        agent,
        namespace,
        configMapName: configRes.configMapName,
        secretName: configRes.secretName,
        extraEnv: env,
        provider,
        imagePullPolicy: imagePullPolicy ?? 'IfNotPresent',
        sharedWorkspacePvcName,
        sharedWorkspaceMountPath,
        skillsInstallDir,
      })

      // Service (for health check endpoint)
      const networking = createNetworking({
        agentName,
        namespace,
        port: HEALTH_PORT,
        provider,
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
    provision,
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
    const provisionedEnv =
      provision && shadowServerUrl
        ? buildProvisionedEnvVars(agent.id, config, provision, shadowServerUrl)
        : {}
    const env = { ...provisionedEnv, ...(agent.env ?? {}) }

    const openclawConfig = buildOpenClawConfig(agent, config)

    // Extract workspace files (e.g. SOUL.md) before serializing config
    const workspaceFiles = (openclawConfig._workspaceFiles ?? {}) as Record<string, string>
    delete openclawConfig._workspaceFiles

    // Extract plugin environment variables and merge into Pod env
    const pluginEnvVars = (openclawConfig._pluginEnvVars ?? {}) as Record<string, string>
    delete openclawConfig._pluginEnvVars

    // Extract plugin-generated K8s resources (Ingress, CronJob, etc.)
    const pluginResources = (openclawConfig._pluginResources ?? []) as Record<string, unknown>[]
    delete openclawConfig._pluginResources

    // Extract deferred plugin provisions (async lifecycle hooks — executed by DeployService)
    const pluginProvisions = (openclawConfig._pluginProvisions ?? []) as Array<{
      pluginId: string
      secrets?: Record<string, string>
    }>
    delete openclawConfig._pluginProvisions

    // Merge any secrets produced by plugin provisioning into the env
    for (const prov of pluginProvisions) {
      if (prov.secrets) {
        Object.assign(env, prov.secrets)
      }
    }

    // ConfigMap
    const configData: Record<string, string> = {
      'config.json': JSON.stringify(openclawConfig, null, 2),
      ...workspaceFiles,
    }
    const secretData: Record<string, string> = {}

    // P0: Vault-based per-agent secret isolation
    const vaultName = agent.vault ?? 'default'
    const vault = config.registry?.vaults?.[vaultName]
    if (vault) {
      // Vault provider API keys
      if (vault.providers) {
        for (const [providerId, source] of Object.entries(vault.providers)) {
          if (source.apiKey) {
            const envKey = `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`
            secretData[envKey] = source.apiKey
          }
        }
      }
      // Vault named secrets
      if (vault.secrets) {
        for (const [key, value] of Object.entries(vault.secrets)) {
          secretData[key] = value
        }
      }
    }

    // Fallback: legacy registry.providers (when no vaults configured)
    if (!config.registry?.vaults && config.registry?.providers) {
      for (const p of config.registry.providers) {
        if (p.apiKey) {
          const envKey = `${(p.id ?? 'custom').toUpperCase().replace(/-/g, '_')}_API_KEY`
          secretData[envKey] = p.apiKey
        }
      }
    }

    // Merge plugin-contributed env vars (from PluginEnvProvider)
    for (const [key, value] of Object.entries(pluginEnvVars)) {
      // Resolve ${env:VAR} references to actual values from process.env
      const resolved = value.replace(/\$\{env:([^}]+)\}/g, (_, varName) => {
        return process.env[varName] ?? ''
      })
      if (resolved) {
        env[key] = resolved
      }
    }

    for (const [key, value] of Object.entries(env)) {
      if (key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET')) {
        secretData[key] = value
      } else {
        configData[key] = value
      }
    }

    manifests.push({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${agentName}-config`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName },
      },
      data: configData,
    })

    manifests.push({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${agentName}-secrets`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName },
      },
      type: 'Opaque',
      stringData: secretData,
    })

    // Deployment
    const image = agent.image ?? DEFAULT_IMAGES[agent.runtime] ?? DEFAULT_IMAGES.openclaw

    // Build volume mounts and volumes from shared constants
    const volumeMounts: Array<Record<string, unknown>> = baseVolumeMounts()
    const volumes: Array<Record<string, unknown>> = baseVolumes(`${agentName}-config`)

    // Init containers (populated below if git source is configured)
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

    // Git source overlay — init container clones repo at pod startup
    const source = agent.source
    const agentMountPath = source?.mountPath ?? '/agent'
    const hasGitSource = source?.git && (source.strategy ?? 'init-container') === 'init-container'

    if (hasGitSource && source?.git) {
      // Shared EmptyDir for cloned agent files
      volumes.push({ name: 'agent-source', emptyDir: {} })
      volumeMounts.push({
        name: 'agent-source',
        mountPath: agentMountPath,
        readOnly: true,
      })

      // SSH key volume if configured
      if (source.git.sshKeySecret) {
        volumes.push({
          name: 'git-ssh-key',
          secret: { secretName: source.git.sshKeySecret, defaultMode: 0o400 },
        })
      }

      const ref = source.git.ref ?? 'main'
      const depth = source.git.depth ?? 1
      const cmd = buildGitCloneCommand({
        url: source.git.url,
        ref,
        depth,
        agentDir: source.git.dir,
        mountPath: agentMountPath,
        include: source.include,
      })

      const initContainerEnv: Array<Record<string, unknown>> = []
      if (source.git.sshKeySecret) {
        initContainerEnv.push({
          name: 'GIT_SSH_COMMAND',
          value: 'ssh -i /root/.ssh/id_rsa -o StrictHostKeyChecking=no',
        })
      }
      if (source.git.tokenSecret && !source.git.tokenSecret.startsWith('${')) {
        initContainerEnv.push({
          name: 'GIT_TOKEN',
          valueFrom: {
            secretKeyRef: { name: source.git.tokenSecret, key: 'token', optional: true },
          },
        })
      }

      const initContainerMounts: Array<Record<string, unknown>> = [
        { name: 'agent-source', mountPath: agentMountPath },
      ]
      if (source.git.sshKeySecret) {
        initContainerMounts.push({ name: 'git-ssh-key', mountPath: '/root/.ssh', readOnly: true })
      }

      initContainers = [
        {
          name: 'git-clone',
          image: GIT_INIT_IMAGE,
          imagePullPolicy: 'IfNotPresent',
          command: cmd,
          env: initContainerEnv,
          volumeMounts: initContainerMounts,
          securityContext: {
            runAsNonRoot: false,
            allowPrivilegeEscalation: false,
          },
        },
      ]
    }

    const envList = [
      ...baseEnvVars(agentName),
      ...Object.entries(env).map(([name, value]) => ({ name, value })),
    ]
    if (hasGitSource || source?.path) {
      envList.push({ name: 'OPENCLAW_AGENT_DIR', value: agentMountPath })
      envList.push({ name: 'AGENT_REPO_PATH', value: agentMountPath })
    }
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
        // P1: Version annotations for rollback tracking
        ...(agent.version
          ? {
              annotations: {
                'shadowob-cloud/agent-version': agent.version,
                'shadowob-cloud/deployed-at': new Date().toISOString(),
                ...(agent.changelog ? { 'shadowob-cloud/changelog': agent.changelog } : {}),
              },
            }
          : {}),
      },
      spec: {
        replicas: agent.replicas ?? 1,
        selector: { matchLabels: { app: 'shadowob-cloud', agent: agentName } },
        template: {
          metadata: { labels: { app: 'shadowob-cloud', agent: agentName, runtime: agent.runtime } },
          spec: {
            securityContext: buildSecurityContext(),
            containers: [
              {
                name: agent.runtime,
                image,
                imagePullPolicy,
                ports: [{ containerPort: HEALTH_PORT, name: 'health' }],
                env: envList,
                envFrom: [{ secretRef: { name: `${agentName}-secrets` } }],
                volumeMounts,
                resources: agent.resources ?? DEFAULT_RESOURCES,
                securityContext: buildContainerSecurityContext(),
                livenessProbe: LIVENESS_PROBE,
                readinessProbe: READINESS_PROBE,
                startupProbe: STARTUP_PROBE,
              },
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
      },
      spec: {
        selector: { app: 'shadowob-cloud', agent: agentName },
        ports: [{ name: 'health', port: HEALTH_PORT, targetPort: HEALTH_PORT, protocol: 'TCP' }],
        type: 'ClusterIP',
      },
    })

    // NetworkPolicy — restrict traffic based on agent networking config
    manifests.push(
      buildNetworkPolicy(agentName, namespace, HEALTH_PORT, extraEgressPorts, agent.networking),
    )

    // Add plugin-generated K8s resources (Ingress, CronJob, etc.)
    for (const resource of pluginResources) {
      manifests.push(resource)
    }
  }

  return manifests
}
