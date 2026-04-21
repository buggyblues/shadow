/**
 * DeployService — deployment orchestration.
 *
 * Contains the core deploy/destroy workflow extracted from CLI commands.
 * This is the primary service for deploying agents to Kubernetes.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadKubeconfigPath } from '../cluster/kubeconfig.js'
import type { CloudConfig } from '../config/schema.js'
import type { Logger } from '../utils/logger.js'
import { loadProvisionState } from '../utils/state.js'
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
}

export interface DeployResult {
  namespace: string
  agentCount: number
  config: CloudConfig
  manifests?: Array<Record<string, unknown>>
  outputs?: Record<string, unknown>
}

export interface DestroyOptions {
  filePath?: string
  namespace?: string
  stack?: string
  k8sContext?: string
  config?: CloudConfig
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

    if (!existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`)
    }

    // Resolve kubeconfig path: explicit > cluster name > none (use kubeContext / default)
    const kubeConfigPath =
      options.kubeConfigPath ?? (options.cluster ? loadKubeconfigPath(options.cluster) : undefined)

    if (!existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`)
    }

    // The directory containing the config file is used as the working directory
    // for resolving relative paths (e.g. gitagent path) throughout the pipeline.
    // We pass it explicitly rather than mutating process.cwd() so concurrent
    // invocations don't interfere with each other.
    const configCwd = dirname(filePath)

    // 1. Parse config
    this.logger.step('Parsing config...')
    emit('Parsing config...\n')
    const config = await this.configService.parseFile(filePath)

    const namespace = options.namespace ?? config.deployments?.namespace ?? 'shadowob-cloud'
    const agents = config.deployments?.agents ?? []

    if (agents.length === 0) {
      this.logger.warn('No agents defined in deployments.agents')
      return { namespace, agentCount: 0, config }
    }

    this.logger.info(`Deploying ${agents.length} agent(s) to namespace "${namespace}"`)
    emit(`Deploying ${agents.length} agent(s) to namespace "${namespace}"\n`)
    for (const agent of agents) {
      this.logger.dim(`  - ${agent.id} (${agent.runtime})`)
    }

    // 1b. Auto-create local kind cluster if --local
    if (options.local) {
      if (!this.k8s.isToolInstalled('kind')) {
        throw new Error(
          'kind is not installed. Install it: https://kind.sigs.k8s.io/docs/user/quick-start/',
        )
      }
      if (!this.k8s.kindClusterExists()) {
        this.logger.step('Creating local kind cluster...')
        this.k8s.createKindCluster()
        this.logger.success('Kind cluster created')
      } else {
        this.logger.dim('Kind cluster already exists')
      }
    } else if (!kubeConfigPath && !this.k8s.isKubeReachable()) {
      this.logger.warn('kubectl cannot reach a cluster. Use --local to auto-create a kind cluster.')
    }

    // 2. Build extra secrets from CLI-provided credentials (passed directly to plugin lifecycle)
    const extraSecrets: Record<string, string> = {}
    if (options.shadowUrl) extraSecrets.SHADOW_SERVER_URL = options.shadowUrl
    if (options.shadowToken) extraSecrets.SHADOW_USER_TOKEN = options.shadowToken

    // 3. Resolve config (expand extends + templates)
    this.logger.step('Resolving config...')
    emit('Resolving config...\n')
    const resolved = await this.configService.resolve(config, configCwd)

    // Always load plugins so the build pipeline (applyPluginPipeline) works regardless
    // of whether provisioning is skipped.
    try {
      const { loadAllPlugins, getPluginRegistry } = await import('../plugins/index.js')
      try {
        await loadAllPlugins(getPluginRegistry())
      } catch {
        /* already loaded */
      }
    } catch {
      // Plugin system unavailable — continue without plugins
    }

    // 3b. Execute plugin lifecycle provisions (async hooks — runs for all plugins)
    if (!options.skipProvision) {
      try {
        const { executePluginProvisions, getPluginRegistry } = await import('../plugins/index.js')
        for (const agent of agents) {
          const existingState = loadProvisionState(filePath, options.stateDir)
          const provisionResults = await executePluginProvisions(
            agent,
            resolved,
            namespace,
            this.logger,
            options.dryRun,
            extraSecrets,
            existingState,
          )
          if (provisionResults.errors.length > 0) {
            for (const e of provisionResults.errors) {
              this.logger.warn(`Plugin provision error (${e.pluginId}): ${e.error}`)
            }
          }
          // Merge provisioned secrets into agent env
          if (Object.keys(provisionResults.secrets).length > 0) {
            agent.env = { ...(agent.env ?? {}), ...provisionResults.secrets }
            // Also update the resolved config so Pulumi picks up the secrets
            const resolvedAgent = resolved.deployments?.agents?.find((a) => a.id === agent.id)
            if (resolvedAgent) {
              resolvedAgent.env = { ...(resolvedAgent.env ?? {}), ...provisionResults.secrets }
            }

            // Persist provision state for future dedup
            if (!options.dryRun && Object.keys(provisionResults.states).length > 0) {
              const { mergeProvisionState, saveProvisionState } = await import('../utils/state.js')
              const newState: import('../utils/state.js').ProvisionState = {
                provisionedAt: new Date().toISOString(),
                stackName: options.stack ?? 'dev',
                namespace,
                plugins: provisionResults.states,
              }
              const merged = mergeProvisionState(existingState, newState)
              const statePath = saveProvisionState(filePath, merged, options.stateDir)
              this.logger.dim(`  State saved: ${statePath}`)
            }
          }
        }
      } catch {
        // Plugin provisioning is optional — continue if plugin system unavailable
      }
    }

    // 4. Output manifests to directory if requested
    if (options.outputDir) {
      this.logger.step('Generating manifests...')
      const manifests = this.manifestService.build({
        config: resolved,
        namespace,
        shadowServerUrl: options.shadowUrl ?? process.env.SHADOW_SERVER_URL,
      })

      const outDir = resolve(options.outputDir)
      mkdirSync(outDir, { recursive: true })

      for (let i = 0; i < manifests.length; i++) {
        const m = manifests[i]!
        const kind = ((m.kind as string) ?? 'resource').toLowerCase()
        const name = ((m.metadata as Record<string, unknown>)?.name as string) ?? `resource-${i}`
        writeFileSync(
          resolve(outDir, `${name}-${kind}.json`),
          `${JSON.stringify(m, null, 2)}\n`,
          'utf-8',
        )
      }

      this.logger.success(`Manifests written to: ${outDir}`)
      return { namespace, agentCount: agents.length, config: resolved, manifests }
    }

    // 5. Deploy via Pulumi automation API
    const k8sShadowUrl =
      options.k8sShadowUrl ??
      options.shadowUrl ??
      process.env.K8S_SHADOW_URL ??
      process.env.SHADOW_SERVER_URL

    this.logger.step('Initializing Pulumi stack...')
    emit('Initializing Pulumi stack...\n')

    let stack: Awaited<ReturnType<typeof this.k8s.getOrCreateStack>>
    try {
      stack = await this.k8s.getOrCreateStack({
        stackName: options.stack ?? 'dev',
        config: resolved,
        namespace,
        shadowServerUrl: k8sShadowUrl,
        kubeContext: options.k8sContext,
        kubeConfigPath,
        imagePullPolicy: options.imagePullPolicy ?? 'IfNotPresent',
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
              stackName: options.stack ?? 'dev',
              config: resolved,
              namespace,
              shadowServerUrl: k8sShadowUrl,
              kubeContext: options.k8sContext,
              kubeConfigPath,
              imagePullPolicy: options.imagePullPolicy ?? 'IfNotPresent',
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
          const { rmSync, existsSync } = await import('node:fs')
          const lockDir = join(homedir(), '.shadowob', 'pulumi', '.pulumi', 'locks')
          if (existsSync(lockDir)) {
            try {
              rmSync(lockDir, { recursive: true })
              this.logger.info('Lock files removed, retrying...')
              emit('Lock files removed, retrying...\n')
            } catch {
              /* ignore */
            }
          }
        }
        // Retry
        stack = await this.k8s.getOrCreateStack({
          stackName: options.stack ?? 'dev',
          config: resolved,
          namespace,
          shadowServerUrl: k8sShadowUrl,
          kubeContext: options.k8sContext,
          kubeConfigPath,
          imagePullPolicy: options.imagePullPolicy ?? 'IfNotPresent',
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
    })

    if (options.dryRun) {
      this.logger.success('Preview complete')
      emit('Preview complete\n')
      return { namespace, agentCount: agents.length, config: resolved }
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
    }
  }

  /**
   * Destroy agent cluster from Kubernetes.
   * Throws on errors instead of calling process.exit().
   */
  async destroy(options: DestroyOptions): Promise<void> {
    const namespace = options.namespace ?? 'shadowob-cloud'

    this.logger.step(`Destroying resources in namespace "${namespace}"...`)

    if (options.config) {
      const stack = await this.k8s.getOrCreateStack({
        stackName: options.stack ?? 'dev',
        config: options.config,
        namespace,
        kubeContext: options.k8sContext,
      })
      await this.k8s.destroyStack(stack, {
        onOutput: (out) => process.stdout.write(out),
      })
      this.logger.success('Destroy complete!')
    } else {
      // No Pulumi config — fallback to direct kubectl namespace deletion
      this.logger.info(`No stack config; deleting namespace "${namespace}" directly...`)
      this.k8s.deleteNamespace(namespace)
      this.logger.success(`Namespace "${namespace}" deleted.`)
    }
  }
}
