/**
 * Core plugin system types — ModernJS-style setup(api) pattern.
 *
 * Every plugin calls definePlugin(manifest, setup) and exports the result.
 *
 * The setup function receives a PluginAPI object and registers hooks + capabilities
 * imperatively. This keeps all plugin logic in a single closure, enables conditional
 * hook registration, and makes plugin options natural via closure capture.
 *
 * @example
 * // Skill plugin with custom health check
 * export default definePlugin(manifest, (api) => {
 *   api.addSkills({ bundled: ['github'] })
 *   api.addCLI([{ name: 'gh', command: 'gh', description: 'GitHub CLI' }])
 *   api.onBuildEnv((ctx) => ({ GITHUB_TOKEN: ctx.secrets.GITHUB_TOKEN }))
 *   api.onHealthCheck(async (ctx) => ({ healthy: true, message: 'OK' }))
 * })
 *
 * @example
 * // Channel plugin with provision lifecycle
 * export default definePlugin(manifest, (api) => {
 *   api.onBuildConfig(buildSlackConfig)
 *   api.onProvision(async (ctx) => { ... })
 *   api.onHealthCheck(async (ctx) => { ... })
 * })
 *
 * @example
 * // Use factory shorthand for standard patterns
 * export default defineSkillPlugin(manifest, {
 *   skills: { bundled: ['github'], entries: [...] },
 *   cli: [{ name: 'gh', command: 'gh', description: 'GitHub CLI' }],
 * })
 */

import type { AgentDeployment, CloudConfig } from '../config/schema.js'

// ─── Plugin Manifest ────────────────────────────────────────────────────────

export type PluginCategory =
  | 'communication'
  | 'project-management'
  | 'ai-provider'
  | 'devops'
  | 'database'
  | 'productivity'
  | 'automation'
  | 'crm'
  | 'finance'
  | 'analytics'
  | 'media'
  | 'email'
  | 'calendar'
  | 'search'
  | 'code'
  | 'other'

export type PluginCapability =
  | 'channel'
  | 'tool'
  | 'notification'
  | 'webhook'
  | 'data-source'
  | 'action'
  | 'auth-provider'
  | 'skill'
  | 'cli'
  | 'config-builder'
  | 'config-resolver'

export type PluginAuthType = 'oauth2' | 'api-key' | 'token' | 'basic' | 'none'

export interface PluginAuthField {
  key: string
  label: string
  description?: string
  required: boolean
  sensitive: boolean
  placeholder?: string
  validation?: string
}

export interface PluginOAuthConfig {
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  pkce?: boolean
}

export interface PluginAuth {
  type: PluginAuthType
  fields: PluginAuthField[]
  oauth?: PluginOAuthConfig
}

export interface PluginManifest {
  id: string
  name: string
  description: string
  version: string
  category: PluginCategory
  icon: string
  website?: string
  docs?: string
  auth: PluginAuth
  config?: Record<string, unknown>
  capabilities: PluginCapability[]
  tags: string[]
  popularity?: number
}

// ─── Context Types ──────────────────────────────────────────────────────────

/** Base context shared across all plugin hooks */
export interface PluginBaseContext {
  /** The agent being deployed */
  agent: AgentDeployment
  /** Full cloud config */
  config: CloudConfig
  /** Resolved secrets for this plugin (from config refs + environment) */
  secrets: Record<string, string>
  /** K8s namespace being deployed to */
  namespace: string
  /** Resolved plugin options for this specific agent */
  agentConfig: Record<string, unknown>
}

/** Context passed to build-time hooks (synchronous) */
export interface PluginBuildContext extends PluginBaseContext {
  pluginRegistry: PluginRegistry
  /** Absolute directory to resolve relative paths against (replaces process.chdir). */
  cwd: string
}

/** Context passed to the provision hook (async, has logger + previous state) */
export interface PluginProvisionContext extends PluginBaseContext {
  logger: { info: (msg: string) => void; dim: (msg: string) => void }
  dryRun: boolean
  /** Persisted state from the previous provision run for this plugin */
  previousState: Record<string, unknown> | null
}

// ─── Hook Return Types ───────────────────────────────────────────────────────

export interface PluginProvisionResult {
  /** State to persist (stored under plugins[pluginId] in ProvisionState) */
  state?: Record<string, unknown>
  /** Secrets to inject into the agent container as env vars */
  secrets?: Record<string, string>
}

export interface PluginConfigFragment {
  channels?: Record<string, unknown>
  bindings?: Array<Record<string, unknown>>
  plugins?: Record<string, unknown>
  skills?: Record<string, unknown>
  tools?: Record<string, unknown>
  models?: Record<string, unknown>
  /** Agent defaults (repoRoot, heartbeat, workspace) — merged by mergePluginFragments.
   *  Never includes `list` — that must not be overwritten by plugins. */
  agents?: { defaults?: Record<string, unknown>; [key: string]: unknown }
  [key: string]: unknown
}

export interface PluginValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface PluginValidationResult {
  valid: boolean
  errors: PluginValidationError[]
}

// ─── Static Capability Types ─────────────────────────────────────────────────

/** A bundled or custom skill that an agent can execute. */
export interface PluginSkillEntry {
  id: string
  name: string
  description: string
  env?: Record<string, string>
  apiKey?: string
}

/** Install configuration for skill dependencies. */
export interface PluginInstallConfig {
  npmPackages?: string[]
  preferBrew?: boolean
  nodeManager?: 'npm' | 'pnpm' | 'yarn'
}

/** Static skills config — bundled skill IDs + custom entries. */
export interface PluginSkillsConfig {
  bundled?: string[]
  entries?: PluginSkillEntry[]
  install?: PluginInstallConfig
}

/** A CLI tool exposed to agents. */
export interface PluginCLITool {
  name: string
  command: string
  description: string
  npmPackage?: string
  env?: Record<string, string>
}

/** MCP server config (prefer skills+cli for most integrations). */
export interface PluginMCPServer {
  transport: 'stdio' | 'sse'
  command: string
  args?: string[]
  env?: Record<string, string>
}

// ─── Provider / Secret Capability Types ─────────────────────────────────────

export type ModelTag = 'default' | 'fast' | 'flash' | 'reasoning' | 'vision' | 'tools'

export interface ProviderModelEntry {
  /** Model ID within the provider. */
  id: string
  /** Display name. Defaults to id. */
  name?: string
  /** Capability tags used by selector plugins such as model-provider. */
  tags?: ModelTag[]
  contextWindow?: number
  maxTokens?: number
  cost?: {
    inputPerMillion?: number
    outputPerMillion?: number
    currency?: string
  }
  capabilities?: {
    vision?: boolean
    tools?: boolean
    reasoning?: boolean
  }
}

export interface ProviderCatalog {
  /** OpenClaw provider ID used in model refs, e.g. anthropic/claude-sonnet-4-5. */
  id: string
  /** OpenClaw API adapter. */
  api: string
  baseUrl?: string
  /** Primary env var used to authenticate this provider. */
  envKey: string
  /** Compatible aliases to sniff before falling back to envKey. */
  envKeyAliases?: string[]
  /** Optional base URL override env var. */
  baseUrlEnvKey?: string
  /** Optional default model override env var. */
  modelEnvKey?: string
  /** Lower number means higher selector priority. */
  priority?: number
  /** Enables local env sniffing when no community profile is connected. Defaults to true. */
  allowEnvDetection?: boolean
  models: ProviderModelEntry[]
}

export interface PluginSecretField {
  key: string
  label?: string
  description?: string
  required?: boolean
  sensitive?: boolean
  aliases?: string[]
  /** Whether this value must be present in the runtime container env. Defaults to true. */
  runtime?: boolean
}

// ─── Runtime Extension Types ────────────────────────────────────────────────

export interface PluginSlashCommandInteractionField {
  id: string
  kind?: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
  label: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  maxLength?: number
}

export interface PluginSlashCommandInteraction {
  kind: 'buttons' | 'select' | 'form' | 'approval'
  id?: string
  prompt?: string
  submitLabel?: string
  responsePrompt?: string
  approvalCommentLabel?: string
  oneShot?: boolean
  fields?: PluginSlashCommandInteractionField[]
}

export interface PluginSlashCommandRule {
  match?: {
    packId?: string
    name?: string
    names?: string[]
    /** JavaScript regexp source matched against the discovered command name. */
    namePattern?: string
    sourcePathIncludes?: string | string[]
  }
  aliases?: string[]
  interaction?: PluginSlashCommandInteraction
}

export interface PluginOpenClawManifestPatch {
  /** Extension folder under /app/extensions, e.g. "shadowob". */
  extensionId?: string
  /** Absolute manifest path, or path relative to /app. Prefer extensionId. */
  manifestPath?: string
  /** Generic deep-merge patch for manifest fields. */
  merge?: Record<string, unknown>
  channelEnvVars?: Record<string, string[]>
  channelConfigs?: Record<string, unknown>
}

export type PluginRuntimeArtifactKind = 'shadow.slashCommands' | (string & {})

export interface PluginRuntimeArtifact {
  /** Stable consumer-facing artifact kind, e.g. "shadow.slashCommands". */
  kind: PluginRuntimeArtifactKind
  /** Runtime-readable absolute path produced by the plugin. */
  path: string
  /** Optional media type or format hint for future consumers. */
  mediaType?: string
}

export interface PluginRuntimeExtension {
  openclaw?: {
    manifestPatches?: PluginOpenClawManifestPatch[]
  }
  artifacts?: PluginRuntimeArtifact[]
}

// ─── K8s Artifact Types ──────────────────────────────────────────────────────

export interface PluginK8sInitContainer {
  name: string
  image: string
  imagePullPolicy?: string
  command: string[]
  env?: Array<{ name: string; value?: string; valueFrom?: Record<string, unknown> }>
  volumeMounts: Array<{ name: string; mountPath: string; readOnly?: boolean }>
  resources?: Record<string, unknown>
  securityContext?: Record<string, unknown>
}

/**
 * Long-running helper container that runs alongside the main agent container.
 * Used e.g. by gitagent for periodic `git pull` loops (live refresh without
 * restarting the pod). Shape is a subset of k8s.types.input.core.v1.Container
 * to keep the plugin API independent of Pulumi types.
 */
export interface PluginK8sSidecar {
  name: string
  image: string
  imagePullPolicy?: string
  command?: string[]
  args?: string[]
  env?: Array<{ name: string; value?: string; valueFrom?: Record<string, unknown> }>
  volumeMounts: Array<{ name: string; mountPath: string; readOnly?: boolean }>
  resources?: Record<string, unknown>
  securityContext?: Record<string, unknown>
}

export interface PluginK8sVolume {
  name: string
  spec: Record<string, unknown>
}

export interface PluginK8sVolumeMount {
  name: string
  mountPath: string
  readOnly?: boolean
}

export interface PluginK8sConfigMap {
  name: string
  data: Record<string, string>
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PluginK8sEnvVar {
  name: string
  value?: string
  valueFrom?: Record<string, unknown>
}

export interface PluginK8sResult {
  initContainers?: PluginK8sInitContainer[]
  /** Helper containers that run for the lifetime of the pod. */
  sidecars?: PluginK8sSidecar[]
  /** Plugin-owned ConfigMaps that pod volumes may reference. */
  configMaps?: PluginK8sConfigMap[]
  volumes?: PluginK8sVolume[]
  volumeMounts?: PluginK8sVolumeMount[]
  envVars?: PluginK8sEnvVar[]
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PluginK8sContext {
  agent: AgentDeployment
  config: CloudConfig
  namespace: string
}

export interface PluginK8sProvider {
  buildK8s(agent: AgentDeployment, ctx: PluginK8sContext): PluginK8sResult | undefined
  buildDockerfileStages?(agent: AgentDeployment, ctx: PluginK8sContext): string | undefined
}

// ─── Plugin API (passed to setup()) ─────────────────────────────────────────

/**
 * The api object passed to a plugin's setup function.
 *
 * Plugins call api methods to declare static capabilities and register hooks.
 * Multiple calls to the same hook register multiple handlers — all are run
 * in registration order, results merged where applicable.
 */
export interface PluginAPI {
  // ── Static capability declarations ──

  /** Declare skills this plugin provides to agents */
  addSkills(skills: PluginSkillsConfig): void

  /** Declare CLI tools this plugin exposes to agents */
  addCLI(tools: PluginCLITool[]): void

  /** Declare an MCP server (use sparingly — prefer skills+cli) */
  addMCP(server: PluginMCPServer): void

  /** Declare model/provider presets that selector plugins can discover. */
  addProviderCatalog(catalog: ProviderCatalog): void

  /** Declare env/secret fields that Cloud can store and inject at runtime. */
  addSecretFields(fields: PluginSecretField[]): void

  // ── Build hooks (synchronous) ──

  /**
   * Pre-process an AgentDeployment before config building.
   * Use to convert plugin `use` entries into agent fields.
   */
  onResolveAgent(fn: (agent: AgentDeployment, config: CloudConfig) => AgentDeployment): void

  /** Emit an OpenClaw config fragment (merged with other plugin fragments) */
  onBuildConfig(fn: (ctx: PluginBuildContext) => PluginConfigFragment | void): void

  /** Emit additional standing instructions to append to the agent prompt */
  onBuildPrompt(fn: (ctx: PluginBuildContext) => string | void): void

  /** Emit environment variables to inject into the agent container */
  onBuildEnv(fn: (ctx: PluginBuildContext) => Record<string, string> | void): void

  /** Emit runner-consumed extension metadata, written outside openclaw.json. */
  onBuildRuntime(fn: (ctx: PluginBuildContext) => PluginRuntimeExtension | void): void

  /** Emit extra Kubernetes resource manifests */
  onBuildResources(fn: (ctx: PluginBuildContext) => Record<string, unknown>[]): void

  /** Validate plugin configuration and required secrets */
  onValidate(fn: (ctx: PluginBuildContext) => PluginValidationResult | void): void

  // ── Lifecycle hooks (async) ──

  /** Provision external resources (runs during deploy, before agent start) */
  onProvision(fn: (ctx: PluginProvisionContext) => Promise<PluginProvisionResult>): void

  /** Check that plugin dependencies are reachable */
  onHealthCheck(
    fn: (ctx: PluginBuildContext) => Promise<{ healthy: boolean; message: string }>,
  ): void
}

// ─── Internal Hook Collections ───────────────────────────────────────────────

/** All hooks collected from a plugin's setup() call. Internal use only. */
export interface PluginHooks {
  resolveAgent: Array<(agent: AgentDeployment, config: CloudConfig) => AgentDeployment>
  buildConfig: Array<(ctx: PluginBuildContext) => PluginConfigFragment | void>
  buildPrompt: Array<(ctx: PluginBuildContext) => string | void>
  buildEnv: Array<(ctx: PluginBuildContext) => Record<string, string> | void>
  buildRuntime: Array<(ctx: PluginBuildContext) => PluginRuntimeExtension | void>
  buildResources: Array<(ctx: PluginBuildContext) => Record<string, unknown>[]>
  validate: Array<(ctx: PluginBuildContext) => PluginValidationResult | void>
  provision: Array<(ctx: PluginProvisionContext) => Promise<PluginProvisionResult>>
  healthCheck: Array<(ctx: PluginBuildContext) => Promise<{ healthy: boolean; message: string }>>
}

// ─── Plugin Definition ───────────────────────────────────────────────────────

/**
 * A fully registered plugin — static capabilities + collected hooks.
 *
 * Created by definePlugin() or factory helpers (defineSkillPlugin, etc.).
 * Stored in the PluginRegistry and iterated by engines.
 */
export interface PluginDefinition {
  manifest: PluginManifest

  /** Declared skills (from api.addSkills) */
  skills?: PluginSkillsConfig
  /** Declared CLI tools (from api.addCLI) */
  cli?: PluginCLITool[]
  /** Declared MCP servers (from api.addMCP) */
  mcp?: PluginMCPServer[]
  /** Declared model provider catalogs (from api.addProviderCatalog) */
  providerCatalogs?: ProviderCatalog[]
  /** Declared env/secret fields (from api.addSecretFields) */
  secretFields?: PluginSecretField[]
  /** K8s provider — generates pod-level K8s artifacts (init containers, volumes) */
  k8s?: PluginK8sProvider

  /** All registered hooks, collected during setup() */
  _hooks: PluginHooks

  /** Legacy hook aliases kept for older callers/tests while runtime uses _hooks. */
  _buildConfig: PluginHooks['buildConfig']
  _buildEnv: PluginHooks['buildEnv']
  _validate: PluginHooks['validate']
}

// ─── Plugin Registry ─────────────────────────────────────────────────────────

export interface PluginRegistry {
  readonly size: number
  register(plugin: PluginDefinition): void
  get(id: string): PluginDefinition | undefined
  getAll(): PluginDefinition[]
  getByCategory(category: PluginCategory): PluginDefinition[]
  getByCapability(cap: PluginCapability): PluginDefinition[]
  search(query: string): PluginDefinition[]
}

// ─── Legacy type aliases (for backward compat during any leftover references) ─
export type PluginSkillsProvider = PluginSkillsConfig
