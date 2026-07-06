/**
 * DeployService — deployment orchestration.
 *
 * Contains the core deploy/destroy workflow extracted from CLI commands.
 * This is the primary service for deploying agents to Kubernetes.
 */

import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { loadClusterMeta, loadKubeconfigPath } from '../cluster/kubeconfig.js'
import type { AgentDeployment, CloudConfig, CloudWorkloadBackendPolicy } from '../config/schema.js'
import { assertReadableKubeconfigFile, readKubeconfigFile } from '../utils/kubeconfig-file.js'
import type { Logger } from '../utils/logger.js'
import {
  type DeploymentRuntimeContext,
  normalizeDeploymentRuntimeContext,
  runtimeContextEnv,
} from '../utils/runtime-context.js'
import { loadProvisionState, type ProvisionState } from '../utils/state.js'
import type { ConfigService } from './config.service.js'
import type { K8sService } from './k8s.service.js'
import type { ManifestService } from './manifest.service.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeployOptions {
  filePath: string
  namespace?: string
  stack?: string
  shadowUrl?: string
  shadowToken?: string
  dryRun?: boolean
  skipProvision?: boolean
  outputDir?: string
  k8sContext?: string
  stateDir?: string
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
  k8sShadowUrl?: string
  local?: boolean
  onOutput?: (out: string) => void
  /** Per-request env overrides used for template/plugin resolution. Never mutates process.env. */
  runtimeEnvVars?: Record<string, string>
  /** Browser/deployment locale and timezone context. */
  runtimeContext?: DeploymentRuntimeContext
  /** Named cluster — resolves to kubeconfig in ~/.shadow-cloud/clusters/<name>.yaml */
  cluster?: string
  /** Explicit path to a kubeconfig file (overrides cluster and k8sContext) */
  kubeConfigPath?: string
  /**
   * Optional callback invoked once the Pulumi Stack object exists.
   * Callers can store the reference and later invoke `stack.cancel()` to
   * abort an in-progress `up` operation cooperatively.
   */
  onStackReady?: (stack: { cancel: () => Promise<void> }) => void
  /**
   * Optional cooperative-cancel checker. Polled at safe boundaries; if it
   * returns `true`, the deploy aborts before performing further side-effects.
   */
  isCancelled?: () => boolean
  /**
   * Initial provision state supplied by SaaS/database callers. CLI callers
   * still use the on-disk state file next to the config.
   */
  initialProvisionState?: ProvisionState | null
  /**
   * Called whenever plugin provisioning produces a new durable state snapshot.
   * SaaS uses this to persist Shadow server/channel/buddy IDs before Pulumi
   * starts mutating Kubernetes.
   */
  onProvisionState?: (state: ProvisionState) => void | Promise<void>
}

export interface DeployResult {
  namespace: string
  agentCount: number
  config: CloudConfig
  manifests?: Array<Record<string, unknown>>
  outputs?: Record<string, unknown>
  provisionState?: ProvisionState
}

export interface DestroyOptions {
  filePath?: string
  namespace?: string
  stack?: string
  k8sContext?: string
  kubeConfigPath?: string
  config?: CloudConfig
  onStackReady?: (stack: { cancel: () => Promise<void> }) => void
  isCancelled?: () => boolean
}

function deploymentReadyTimeoutMs(): number {
  const raw = Number(process.env.CLOUD_DEPLOYMENT_READY_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 20 * 60_000
}

function isAgentSandboxBackend(config: CloudConfig): boolean {
  return (config.deployments?.backend ?? 'agent-sandbox') === 'agent-sandbox'
}

function workloadBackendPolicy(config: CloudConfig): CloudWorkloadBackendPolicy {
  if (config.deployments?.backendPolicy) return config.deployments.backendPolicy
  return isAgentSandboxBackend(config) ? 'sandbox-required' : 'deployment-only'
}

function sandboxRuntimeClassNames(config: CloudConfig): string[] {
  const deployments = config.deployments
  if (!deployments) return []

  const defaultRuntimeClassName = deployments.sandbox?.runtimeClassName ?? 'gvisor'
  const names = deployments.agents.map(
    (agent) => agent.sandbox?.runtimeClassName ?? defaultRuntimeClassName,
  )

  return [...new Set(names)]
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function readKubeconfigForRuntimeWait(kubeConfigPath?: string): Promise<string | undefined> {
  if (!kubeConfigPath) return undefined
  return await readKubeconfigFile(kubeConfigPath)
}

function resolveStackName(namespace: string, stack?: string): string {
  return stack ?? `dev-${namespace}`
}

function normalizeRuntimeEnvVars(envVars?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!envVars) return normalized

  for (const [key, value] of Object.entries(envVars)) {
    if (typeof value !== 'string') continue
    if (value === '__SAVED__' || value.trim() === '') continue
    normalized[key] = value
  }

  return normalized
}

function buildEffectiveEnv(
  envVars?: Record<string, string>,
  runtimeContext?: DeploymentRuntimeContext,
): Record<string, string | undefined> {
  const normalizedContext = normalizeDeploymentRuntimeContext(runtimeContext)
  return {
    ...process.env,
    ...runtimeContextEnv(normalizedContext),
    ...normalizeRuntimeEnvVars(envVars),
  }
}

function applyRuntimeContextToConfig(
  config: CloudConfig,
  runtimeContext?: DeploymentRuntimeContext,
): CloudConfig {
  const normalizedContext = normalizeDeploymentRuntimeContext(runtimeContext)
  if (!normalizedContext.locale) return config
  return {
    ...config,
    locale: normalizedContext.locale,
  }
}

function configUsesPlugins(value: unknown, depth = 0): boolean {
  if (depth > 32 || !value || typeof value !== 'object') return false

  if (Array.isArray(value)) {
    return value.some((item) => configUsesPlugins(item, depth + 1))
  }

  const record = value as Record<string, unknown>
  if (typeof record.plugin === 'string') return true
  return Object.values(record).some((child) => configUsesPlugins(child, depth + 1))
}

async function ensureBuiltInPluginsLoaded(): Promise<void> {
  try {
    const { loadAllPlugins, getPluginRegistry } = await import('../plugins/index.js')
    const registry = getPluginRegistry()
    if (registry.size === 0) await loadAllPlugins(registry)
  } catch {
    // Keep non-plugin deployments working in minimal/bundled environments.
  }
}

async function readKubeconfigCurrentContext(
  kubeConfigPath: string | undefined,
): Promise<string | undefined> {
  if (!kubeConfigPath) return undefined
  try {
    return (await readKubeconfigFile(kubeConfigPath)).match(/current-context:\s*(\S+)/)?.[1]
  } catch {
    return undefined
  }
}

async function summarizeK8sTarget(
  options: DeployOptions,
  kubeConfigPath: string | undefined,
): Promise<string> {
  const cluster = options.cluster ?? 'ambient'
  const envContext = process.env.KUBECONFIG_CONTEXT?.trim()
  const currentContext = await readKubeconfigCurrentContext(kubeConfigPath)
  const context =
    options.k8sContext ??
    (currentContext && envContext && envContext !== currentContext
      ? `${currentContext} (mounted current-context; env KUBECONFIG_CONTEXT=${envContext} ignored)`
      : currentContext) ??
    envContext ??
    'rancher-desktop'
  const kubeconfig = kubeConfigPath ?? process.env.KUBECONFIG ?? '~/.kube/config'
  return `Kubernetes target: cluster=${cluster} context=${context} kubeconfig=${kubeconfig}`
}

async function applyManagedClusterDefaults(
  config: CloudConfig,
  clusterName: string | undefined,
): Promise<void> {
  if (!clusterName || !config.deployments) return

  const sandbox = (await loadClusterMeta(clusterName))?.features?.sandbox
  if (!config.deployments.backendPolicy) {
    config.deployments.backendPolicy = sandbox?.enabled
      ? 'sandbox-preferred'
      : config.deployments.backend === 'agent-sandbox'
        ? 'sandbox-required'
        : 'deployment-only'
  }
  if (!config.deployments.backend) {
    config.deployments.backend =
      config.deployments.backendPolicy === 'deployment-only'
        ? 'deployment'
        : sandbox?.enabled
          ? 'agent-sandbox'
          : 'deployment'
  }

  if (
    config.deployments.backend === 'agent-sandbox' &&
    sandbox?.enabled &&
    sandbox.runtimeClassName
  ) {
    config.deployments.sandbox = {
      ...(config.deployments.sandbox ?? {}),
      runtimeClassName: config.deployments.sandbox?.runtimeClassName ?? sandbox.runtimeClassName,
    }
  }

  if (config.deployments.backend === 'agent-sandbox' && sandbox?.enabled && sandbox.nodeSelector) {
    config.deployments.scheduling = {
      ...(config.deployments.scheduling ?? {}),
      nodeSelector: {
        ...sandbox.nodeSelector,
        ...(config.deployments.scheduling?.nodeSelector ?? {}),
      },
    }
  }
}

function describeSandboxPreflightFailure(missing: string[], warnings: string[]): string {
  return [
    'agent-sandbox preflight failed.',
    missing.length > 0 ? `Missing: ${missing.join(', ')}.` : '',
    warnings.length > 0 ? `Warnings: ${warnings.join(', ')}.` : '',
    'Run "shadowob-cloud cluster apply --config cluster.json" to install/verify sandbox, or set deployments.backendPolicy="deployment-only" for fallback.',
  ]
    .filter(Boolean)
    .join(' ')
}

// ─── Service ────────────────────────────────────────────────────────────────

export class DeployService {
  constructor(
    private configService: ConfigService,
    private manifestService: ManifestService,
    private k8s: K8sService,
    private logger: Logger,
  ) {}

  /**
   * Deploy or update agents to Kubernetes.
   *
   * Orchestrates: parse → provision → resolve → manifest/deploy.
   * Throws on errors instead of calling process.exit().
   */
  async up(options: DeployOptions): Promise<DeployResult> {
    const filePath = resolve(options.filePath)
    const emit = options.onOutput ?? (() => {})
    const runtimeContext = normalizeDeploymentRuntimeContext(options.runtimeContext)
    const effectiveEnv = buildEffectiveEnv(options.runtimeEnvVars, runtimeContext)

    if (!(await pathExists(filePath))) {
      throw new Error(`Config file not found: ${filePath}`)
    }

    // Resolve kubeconfig path: explicit > cluster name > none (use kubeContext / default)
    const kubeConfigPath =
      options.kubeConfigPath ??
      (options.cluster ? await loadKubeconfigPath(options.cluster) : undefined)
    if (kubeConfigPath) {
      await assertReadableKubeconfigFile(kubeConfigPath)
    }

    const k8sTargetSummary = await summarizeK8sTarget(options, kubeConfigPath)
    this.logger.info(k8sTargetSummary)
    emit(`${k8sTargetSummary}\n`)

    // The directory containing the config file is used as the working directory
    // for resolving relative paths (e.g. gitagent path) throughout the pipeline.
    // We pass it explicitly rather than mutating process.cwd() so concurrent
    // invocations don't interfere with each other.
    const configCwd = dirname(filePath)
    let currentProvisionState: ProvisionState | null =
      options.initialProvisionState ?? (await loadProvisionState(filePath, options.stateDir))

    // 1. Parse config
    this.logger.step('Parsing config...')
    emit('Parsing config...\n')
    const config = applyRuntimeContextToConfig(
      await this.configService.parseFile(filePath),
      runtimeContext,
    )
    await applyManagedClusterDefaults(config, options.cluster)

    const namespace = options.namespace ?? config.deployments?.namespace ?? 'shadowob-cloud'
    const stackName = resolveStackName(namespace, options.stack)
    const agents = config.deployments?.agents ?? []

    if (agents.length === 0) {
      this.logger.warn('No agents defined in deployments.agents')
      return {
        namespace,
        agentCount: 0,
        config,
        provisionState: currentProvisionState ?? undefined,
      }
    }

    this.logger.info(`Deploying ${agents.length} agent(s) to namespace "${namespace}"`)
    emit(`Deploying ${agents.length} agent(s) to namespace "${namespace}"\n`)
    for (const agent of agents) {
      this.logger.dim(`  - ${agent.id} (${agent.runtime})`)
    }

    // 1b. Auto-create local kind cluster if --local
    if (options.local) {
      if (!(await this.k8s.isToolInstalled('kind'))) {
        throw new Error(
          'kind is not installed. Install it: https://kind.sigs.k8s.io/docs/user/quick-start/',
        )
      }
      if (!(await this.k8s.kindClusterExists())) {
        this.logger.step('Creating local kind cluster...')
        await this.k8s.createKindCluster()
        this.logger.success('Kind cluster created')
      } else {
        this.logger.dim('Kind cluster already exists')
      }
    } else if (!kubeConfigPath && !(await this.k8s.isKubeReachable())) {
      this.logger.warn('kubectl cannot reach a cluster. Use --local to auto-create a kind cluster.')
    }

    // 2. Build extra secrets from CLI-provided credentials (passed directly to plugin lifecycle)
    // The SHADOWOB_SERVER_URL injected into pod env must be reachable from inside the cluster.
    // Only override it from CLI input when the caller explicitly provides a pod-facing URL.
    const extraSecrets: Record<string, string> = {}
    const podFacingShadowUrl =
      options.k8sShadowUrl ??
      effectiveEnv.SHADOWOB_AGENT_SERVER_URL ??
      effectiveEnv.SHADOWOB_SERVER_URL
    if (podFacingShadowUrl) extraSecrets.SHADOWOB_SERVER_URL = podFacingShadowUrl
    // Host-reachable URL for the cloud backend's provisioning API calls.
    // When pod-facing URL differs (e.g. host.lima.internal vs localhost), the host
    // can't resolve the pod-facing one, so we pass the host-side URL separately.
    if (options.shadowUrl) extraSecrets.SHADOWOB_PROVISION_URL = options.shadowUrl
    if (options.shadowToken) extraSecrets.SHADOWOB_USER_TOKEN = options.shadowToken
    if (effectiveEnv.SHADOWOB_CLOUD_DEPLOYMENT_ID) {
      extraSecrets.SHADOWOB_CLOUD_DEPLOYMENT_ID = effectiveEnv.SHADOWOB_CLOUD_DEPLOYMENT_ID
    }
    extraSecrets.SHADOWOB_CLOUD_NAMESPACE = namespace

    // 3. Resolve config (expand extends + templates)
    this.logger.step('Resolving config...')
    emit('Resolving config...\n')
    const usesPlugins = configUsesPlugins(config)
    if (usesPlugins) await ensureBuiltInPluginsLoaded()
    const resolved = await this.configService.resolve(config, configCwd, { env: effectiveEnv })

    if (resolved.deployments && isAgentSandboxBackend(resolved)) {
      const policy = workloadBackendPolicy(resolved)
      const preflight = await this.k8s.checkAgentSandboxPreflight({
        kubeconfig: await readKubeconfigForRuntimeWait(kubeConfigPath),
        runtimeClassNames: sandboxRuntimeClassNames(resolved),
      })
      if (!preflight.ok) {
        const message = describeSandboxPreflightFailure(preflight.missing, preflight.warnings)
        if (policy === 'sandbox-preferred') {
          this.logger.warn(`${message} Falling back to Kubernetes Deployment.`)
          emit(`${message} Falling back to Kubernetes Deployment.\n`)
          resolved.deployments.backend = 'deployment'
          resolved.deployments.backendPolicy = 'deployment-only'
        } else {
          throw new Error(message)
        }
      } else if (preflight.warnings.length > 0) {
        this.logger.warn(`agent-sandbox preflight warnings: ${preflight.warnings.join(', ')}`)
      }
    }

    // Always load plugins so the build pipeline (applyPluginPipeline) works regardless
    // of whether provisioning is skipped.
    if (usesPlugins) await ensureBuiltInPluginsLoaded()

    // 3b. Execute plugin lifecycle provisions (async hooks — runs for all plugins)
    if (!options.skipProvision) {
      try {
        const { executePluginProvisions } = await import('../plugins/index.js')
        const resolvedAgents = resolved.deployments?.agents ?? agents
        const sourceAgentsById = new Map(agents.map((agent) => [agent.id, agent]))
        const resolvedAgentsById = new Map(resolvedAgents.map((agent) => [agent.id, agent]))
        const applySecretsToAgent = (agentId: string, secrets: Record<string, string>) => {
          if (Object.keys(secrets).length === 0) return
          for (const target of [sourceAgentsById.get(agentId), resolvedAgentsById.get(agentId)]) {
            if (!target) continue
            target.env = { ...(target.env ?? {}), ...secrets }
          }
        }
        const handleProvisionResults = async (
          provisionResults: Awaited<ReturnType<typeof executePluginProvisions>>,
          targets: AgentDeployment[],
        ) => {
          if (provisionResults.errors.length > 0) {
            for (const e of provisionResults.errors) {
              this.logger.warn(`Plugin provision error (${e.pluginId}): ${e.error}`)
            }
            throw new Error(
              `Plugin provisioning failed: ${provisionResults.errors
                .map((e) => `${e.pluginId}: ${e.error}`)
                .join('; ')}`,
            )
          }
          // Merge shared provisioned secrets into the selected agents.
          if (Object.keys(provisionResults.secrets).length > 0) {
            for (const target of targets ?? []) {
              applySecretsToAgent(target.id, provisionResults.secrets)
            }
          }
          for (const [agentId, secrets] of Object.entries(provisionResults.agentSecrets)) {
            applySecretsToAgent(agentId, secrets)
          }

          // Persist provision state for future dedup. This is deliberately
          // independent of secrets so plugins that provision IDs but no runtime
          // credentials are still durable.
          if (!options.dryRun && Object.keys(provisionResults.states).length > 0) {
            const { mergeProvisionState, saveProvisionState } = await import('../utils/state.js')
            const newState: import('../utils/state.js').ProvisionState = {
              provisionedAt: new Date().toISOString(),
              stackName,
              namespace,
              plugins: provisionResults.states,
            }
            const merged = mergeProvisionState(currentProvisionState, newState)
            currentProvisionState = merged
            const statePath = await saveProvisionState(filePath, merged, options.stateDir)
            this.logger.dim(`  State saved: ${statePath}`)
            await options.onProvisionState?.(merged)
          }
        }

        if (resolvedAgents[0]) {
          await handleProvisionResults(
            await executePluginProvisions(
              resolvedAgents[0],
              resolved,
              namespace,
              this.logger,
              options.dryRun,
              extraSecrets,
              currentProvisionState,
              'deployment',
            ),
            resolvedAgents,
          )
        }

        for (const agent of resolvedAgents) {
          await handleProvisionResults(
            await executePluginProvisions(
              agent,
              resolved,
              namespace,
              this.logger,
              options.dryRun,
              extraSecrets,
              currentProvisionState,
              'agent',
            ),
            [agent],
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.warn(`Plugin provisioning failed; aborting deploy: ${message}`)
        throw err
      }
    }

    const k8sShadowUrl =
      options.k8sShadowUrl ??
      effectiveEnv.SHADOWOB_AGENT_SERVER_URL ??
      effectiveEnv.SHADOWOB_SERVER_URL ??
      options.shadowUrl

    // 4. Output manifests to directory if requested
    if (options.outputDir) {
      this.logger.step('Generating manifests...')
      const manifests = this.manifestService.build({
        config: resolved,
        namespace,
        shadowServerUrl: k8sShadowUrl,
        runtimeEnvVars: normalizeRuntimeEnvVars(options.runtimeEnvVars),
        runtimeContext,
      })

      const outDir = resolve(options.outputDir)
      await mkdir(outDir, { recursive: true })

      for (let i = 0; i < manifests.length; i++) {
        const m = manifests[i]!
        const kind = ((m.kind as string) ?? 'resource').toLowerCase()
        const name = ((m.metadata as Record<string, unknown>)?.name as string) ?? `resource-${i}`
        await writeFile(
          resolve(outDir, `${name}-${kind}.json`),
          `${JSON.stringify(m, null, 2)}\n`,
          'utf-8',
        )
      }

      this.logger.success(`Manifests written to: ${outDir}`)
      return {
        namespace,
        agentCount: agents.length,
        config: resolved,
        manifests,
        provisionState: currentProvisionState ?? undefined,
      }
    }

    // 5. Deploy via Pulumi automation API
    this.logger.step('Initializing Pulumi stack...')
    emit('Initializing Pulumi stack...\n')

    let stack: Awaited<ReturnType<typeof this.k8s.getOrCreateStack>>
    try {
      stack = await this.k8s.getOrCreateStack({
        stackName,
        config: resolved,
        namespace,
        shadowServerUrl: k8sShadowUrl,
        runtimeEnvVars: normalizeRuntimeEnvVars(options.runtimeEnvVars),
        runtimeContext,
        kubeContext: options.k8sContext,
        kubeConfigPath,
        imagePullPolicy: options.imagePullPolicy,
      })
    } catch (err) {
      const msg = (err as Error).message ?? ''
      // If the stack is locked, try to cancel and retry once
      if (msg.includes('locked by')) {
        this.logger.warn('Stack is locked — attempting to cancel previous operation...')
        emit('Stack is locked — canceling stale lock...\n')
        try {
          const tmpStack = await this.k8s
            .getOrCreateStack({
              stackName,
              config: resolved,
              namespace,
              shadowServerUrl: k8sShadowUrl,
              runtimeEnvVars: normalizeRuntimeEnvVars(options.runtimeEnvVars),
              runtimeContext,
              kubeContext: options.k8sContext,
              kubeConfigPath,
              imagePullPolicy: options.imagePullPolicy,
            })
            .catch(() => null)
          if (tmpStack) {
            await tmpStack.cancel()
            this.logger.info('Lock canceled, retrying...')
            emit('Lock canceled, retrying...\n')
          }
        } catch {
          // Cancel failed — try to force-remove the lock file
          const { join } = await import('node:path')
          const { homedir } = await import('node:os')
          const lockDir = join(homedir(), '.shadowob', 'pulumi', '.pulumi', 'locks')
          if (await pathExists(lockDir)) {
            try {
              await rm(lockDir, { recursive: true })
              this.logger.info('Lock files removed, retrying...')
              emit('Lock files removed, retrying...\n')
            } catch {
              /* ignore */
            }
          }
        }
        // Retry
        stack = await this.k8s.getOrCreateStack({
          stackName,
          config: resolved,
          namespace,
          shadowServerUrl: k8sShadowUrl,
          runtimeEnvVars: normalizeRuntimeEnvVars(options.runtimeEnvVars),
          runtimeContext,
          kubeContext: options.k8sContext,
          kubeConfigPath,
          imagePullPolicy: options.imagePullPolicy,
        })
      } else {
        throw err
      }
    }

    // Expose the stack so the worker can call stack.cancel() if the user
    // requests cancellation while the up() operation is running.
    if (options.onStackReady) {
      try {
        options.onStackReady(stack as unknown as { cancel: () => Promise<void> })
      } catch {
        /* never let a callback throw kill the deploy */
      }
    }

    if (options.isCancelled?.()) {
      throw new Error('Deployment cancelled before stack apply')
    }

    await this.k8s.deployStack(stack, {
      dryRun: options.dryRun,
      onOutput: options.onOutput ?? ((out) => process.stdout.write(out)),
      ...(options.isCancelled ? { isCancelled: options.isCancelled } : {}),
    })

    if (options.dryRun) {
      this.logger.success('Preview complete')
      emit('Preview complete\n')
      return {
        namespace,
        agentCount: agents.length,
        config: resolved,
        provisionState: currentProvisionState ?? undefined,
      }
    }

    if (isAgentSandboxBackend(resolved)) {
      const readyTimeoutMs = deploymentReadyTimeoutMs()
      const waitKubeconfig = await readKubeconfigForRuntimeWait(kubeConfigPath)
      this.logger.step('Waiting for agent-sandbox workloads to become Ready...')
      emit('Waiting for agent-sandbox workloads to become Ready...\n')
      for (const agent of agents) {
        if (options.isCancelled?.()) {
          throw new Error('Deployment cancelled before workload readiness')
        }
        this.logger.info(`Waiting for Sandbox "${agent.id}" in namespace "${namespace}"`)
        emit(`Waiting for Sandbox "${agent.id}" in namespace "${namespace}"\n`)
        await this.k8s.waitForAgentSandboxReady({
          namespace,
          agentName: agent.id,
          kubeconfig: waitKubeconfig,
          timeoutMs: readyTimeoutMs,
          ...(options.isCancelled ? { isCancelled: options.isCancelled } : {}),
        })
        this.logger.info(`Sandbox "${agent.id}" is Ready`)
        emit(`Sandbox "${agent.id}" is Ready\n`)
      }
    }

    this.logger.success('Deployment complete!')
    emit('Deployment complete!\n')

    // Show resource outputs
    const outputs = await this.k8s.getStackOutputs(stack)
    if (Object.keys(outputs).length > 0) {
      this.logger.info('Stack outputs:')
      for (const [key, output] of Object.entries(outputs)) {
        this.logger.dim(`  ${key}: ${output.value}`)
      }
    }

    return {
      namespace,
      agentCount: agents.length,
      config: resolved,
      outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, v.value])),
      provisionState: currentProvisionState ?? undefined,
    }
  }

  /**
   * Destroy agent cluster from Kubernetes.
   * Throws on errors instead of calling process.exit().
   */
  async destroy(options: DestroyOptions): Promise<void> {
    const namespace = options.namespace ?? 'shadowob-cloud'
    const stackName = resolveStackName(namespace, options.stack)

    this.logger.step(`Destroying resources in namespace "${namespace}"...`)

    if (!options.config) {
      throw new Error(
        `Cannot destroy namespace "${namespace}" without a Pulumi config snapshot. ` +
          'Destroy must run through the deployment stack state.',
      )
    }
    if (options.kubeConfigPath) {
      await assertReadableKubeconfigFile(options.kubeConfigPath)
    }

    const stack = await this.k8s.getOrCreateStack({
      stackName,
      config: options.config,
      namespace,
      kubeContext: options.k8sContext,
      kubeConfigPath: options.kubeConfigPath,
    })

    if (options.onStackReady) {
      try {
        options.onStackReady(stack as unknown as { cancel: () => Promise<void> })
      } catch {
        /* never let a callback throw kill the destroy */
      }
    }

    if (options.isCancelled?.()) {
      throw new Error('Destroy cancelled before stack destroy')
    }

    await this.k8s.destroyStack(stack, {
      onOutput: (out) => process.stdout.write(out),
    })

    if (options.isCancelled?.()) {
      throw new Error('Destroy cancelled by user')
    }

    this.logger.success('Destroy complete!')
  }
}
