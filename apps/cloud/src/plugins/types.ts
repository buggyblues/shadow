/**
 * Core plugin system types — OS-like structured API.
 *
 * Every plugin exports a PluginDefinition from its index.ts.
 * The interface is organized into structured "providers" — each representing
 * a category of capability (skills, CLI, channels, config, resources, etc.).
 *
 * Industry paradigm: skills + CLI first, MCP for real-time connections only.
 */

import type { AgentDeployment, CloudConfig, OpenClawConfig } from '../config/schema.js'

// ─── Plugin Manifest (metadata from manifest.json) ─────────────────────────

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

// ─── Plugin Instance Config (what goes in shadowob-cloud.json) ──────────────

export interface PluginInstanceConfig {
  enabled?: boolean
  config?: Record<string, unknown>
  secrets?: Record<string, string>
  agents?: Record<
    string,
    {
      enabled?: boolean
      config?: Record<string, unknown>
      role?: string
    }
  >
}

// ─── Build Context ──────────────────────────────────────────────────────────

export interface PluginBuildContext {
  agent: AgentDeployment
  config: CloudConfig
  secrets: Record<string, string>
  namespace: string
  pluginRegistry: PluginRegistry
  /** Absolute directory to resolve relative paths against (replaces process.chdir). */
  cwd?: string
}

export interface PluginProvisionContext {
  agent: AgentDeployment
  config: CloudConfig
  secrets: Record<string, string>
  logger: { info: (msg: string) => void; dim: (msg: string) => void }
  dryRun: boolean
  existingState: Record<string, unknown> | null
}

export interface PluginProvisionResult {
  state: Record<string, unknown>
  secrets?: Record<string, string>
}

export interface PluginConfigFragment {
  channels?: Record<string, unknown>
  bindings?: Array<Record<string, unknown>>
  plugins?: Record<string, unknown>
  skills?: Record<string, unknown>
  tools?: Record<string, unknown>
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

// ─── Skills Provider ────────────────────────────────────────────────────────

/** A bundled or custom skill that an agent can execute. */
export interface PluginSkillEntry {
  /** Skill ID (e.g., 'github', 'web-search', 'code-review') */
  id: string
  /** Human-readable skill name */
  name: string
  /** What the skill does */
  description: string
  /** Environment variables required for this skill */
  env?: Record<string, string>
  /** API key reference (${env:VAR} format) */
  apiKey?: string
}

/** Install configuration for skill dependencies. */
export interface PluginInstallConfig {
  /** NPM packages to install (e.g., ['@modelcontextprotocol/server-github']) */
  npmPackages?: string[]
  /** Prefer Homebrew for CLI tools on macOS */
  preferBrew?: boolean
  /** Node package manager preference */
  nodeManager?: 'npm' | 'pnpm' | 'yarn'
}

/** Skills provider — declares bundled skills and custom skill entries. */
export interface PluginSkillsProvider {
  /** Bundled OpenClaw skill IDs to activate (maps to skills.allowBundled) */
  bundled?: string[]
  /** Custom skill entries with per-skill configuration */
  entries?: PluginSkillEntry[]
  /** Dependency installation preferences */
  install?: PluginInstallConfig
}

// ─── CLI Provider ───────────────────────────────────────────────────────────

/** A CLI tool exposed to agents via the tools system. */
export interface PluginCLITool {
  /** Tool command name (e.g., 'gh', 'stripe', 'vercel') */
  name: string
  /** Full command to execute */
  command: string
  /** Description shown to the agent */
  description: string
  /** NPM package for global install */
  npmPackage?: string
  /** Environment variables for this tool */
  env?: Record<string, string>
}

/** CLI provider — declares CLI tools available to agents. */
export interface PluginCLIProvider {
  /** CLI tools this plugin exposes */
  tools: PluginCLITool[]
}

// ─── MCP Provider ───────────────────────────────────────────────────────────

/** MCP server configuration (use sparingly — prefer skills+CLI). */
export interface PluginMCPServer {
  /** Transport type */
  transport: 'stdio' | 'sse'
  /** Command to run */
  command: string
  /** Command arguments */
  args?: string[]
  /** Environment variables */
  env?: Record<string, string>
}

/** MCP provider — for plugins that genuinely need a real-time MCP server. */
export interface PluginMCPProvider {
  /** MCP server configuration */
  server: PluginMCPServer
}

// ─── Channel Provider ───────────────────────────────────────────────────────

/** Channel provider — for communication plugins (Slack, Discord, Telegram, etc.). */
export interface PluginChannelProvider {
  /** Channel type (slack, discord, telegram, etc.) */
  type: string
  /** Build channel-specific OpenClaw configuration */
  buildChannel(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): PluginConfigFragment
}

// ─── Config Builder ─────────────────────────────────────────────────────────

/** Config builder — custom OpenClaw config generation beyond auto-derivation. */
export interface PluginConfigBuilder {
  /** Build the OpenClaw config fragment for this plugin */
  build(agentConfig: Record<string, unknown>, context: PluginBuildContext): PluginConfigFragment
}

// ─── Resource Provider ──────────────────────────────────────────────────────

/** Resource provider — generates Kubernetes resources (Ingress, CronJob, etc.). */
export interface PluginResourceProvider {
  /** Generate K8s resource manifests */
  build(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): Record<string, unknown>[]
}

// ─── K8s Provider ───────────────────────────────────────────────────────────

/**
 * K8s init container spec — minimal, platform-neutral representation.
 * Consumed by both the Pulumi infra layer and the raw-manifest infra layer.
 */
export interface PluginK8sInitContainer {
  name: string
  image: string
  imagePullPolicy?: string
  command: string[]
  env?: Array<{ name: string; value?: string; valueFrom?: Record<string, unknown> }>
  volumeMounts: Array<{ name: string; mountPath: string; readOnly?: boolean }>
  securityContext?: Record<string, unknown>
}

export interface PluginK8sVolume {
  name: string
  /** emptyDir, secret, persistentVolumeClaim, etc. */
  spec: Record<string, unknown>
}

export interface PluginK8sVolumeMount {
  name: string
  mountPath: string
  readOnly?: boolean
}

export interface PluginK8sEnvVar {
  name: string
  value?: string
  valueFrom?: Record<string, unknown>
}

export interface PluginK8sResult {
  /** Extra init containers to prepend to the agent pod */
  initContainers?: PluginK8sInitContainer[]
  /** Extra volumes to attach to the agent pod */
  volumes?: PluginK8sVolume[]
  /** Extra volume mounts for the main container */
  volumeMounts?: PluginK8sVolumeMount[]
  /** Extra env vars for the main container */
  envVars?: PluginK8sEnvVar[]
  /** Extra labels to merge into the Deployment metadata */
  labels?: Record<string, string>
  /** Extra annotations to merge into the Deployment metadata */
  annotations?: Record<string, string>
}

export interface PluginK8sContext {
  agent: AgentDeployment
  config: CloudConfig
  namespace: string
}

/**
 * K8s provider — generates pod-level Kubernetes artifacts for an agent.
 *
 * Plugins that need to inject init containers, volumes, or env vars into the
 * agent Deployment implement this provider. The infra layer iterates all active
 * plugins and merges the results — no plugin-specific code in infra/.
 */
export interface PluginK8sProvider {
  /**
   * Return K8s artifacts to inject into the agent Deployment.
   *
   * Called once per agent by the infra layer.
   * Return an empty object `{}` or `undefined` if nothing applies to this agent.
   */
  buildK8s(agent: AgentDeployment, ctx: PluginK8sContext): PluginK8sResult | undefined

  /**
   * Generate a multi-stage Dockerfile fragment for build-image strategy.
   * Return `undefined` if this plugin does not affect the Dockerfile.
   */
  buildDockerfileStages?(agent: AgentDeployment, ctx: PluginK8sContext): string | undefined
}

// ─── Env Provider ───────────────────────────────────────────────────────────

/** Env provider — generates environment variables and manages secrets. */
export interface PluginEnvProvider {
  /** Build environment variables map */
  build(agentConfig: Record<string, unknown>, context: PluginBuildContext): Record<string, string>
}

// ─── Lifecycle Provider ─────────────────────────────────────────────────────

/** Lifecycle provider — hooks for provisioning and health checking. */
export interface PluginLifecycleProvider {
  /** Provision external resources (webhooks, OAuth apps, etc.) */
  provision?(
    agentConfig: Record<string, unknown>,
    context: PluginProvisionContext,
  ): Promise<PluginProvisionResult>

  /** Health check for this plugin's dependencies */
  healthCheck?(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): Promise<{ healthy: boolean; message: string }>
}

// ─── Config Resolver ────────────────────────────────────────────────────────

/**
 * Config resolver — pre-processes agent deployments before OpenClaw build.
 *
 * Called during resolveConfig(), before any build step:
 * - Convert plugin `use` entries into agent fields (e.g., gitagent → agent.source)
 * - Enrich agent metadata from external sources (git repos, APIs)
 * - Validate and normalize plugin-specific options
 */
export interface PluginConfigResolver {
  /** Transform an agent deployment before OpenClaw config building.
   *  Must return the (potentially modified) agent.
   *  @param cwd  Absolute directory to resolve relative paths against (avoids process.chdir). */
  resolveAgent(agent: AgentDeployment, config: CloudConfig, cwd?: string): AgentDeployment
}

// ─── Validation Provider ────────────────────────────────────────────────────

/** Validation provider — validates plugin configuration. */
export interface PluginValidationProvider {
  /** Validate the plugin configuration and secrets */
  validate(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): PluginValidationResult
}

// ─── Plugin Definition (the core interface) ─────────────────────────────────

/**
 * The OS-like plugin interface.
 *
 * Each aspect of plugin capability is structured into its own provider.
 * Plugins implement only the providers they need.
 *
 * @example
 * // Skill-based plugin (most common pattern)
 * const plugin: PluginDefinition = {
 *   manifest,
 *   skills: { bundled: ['github'], entries: [{ id: 'github', ... }] },
 *   cli: { tools: [{ name: 'gh', command: 'gh', description: 'GitHub CLI' }] },
 *   env: { build: (_, ctx) => ({ GITHUB_TOKEN: ctx.secrets.GITHUB_TOKEN }) },
 * }
 *
 * @example
 * // Channel plugin (communication)
 * const plugin: PluginDefinition = {
 *   manifest,
 *   channel: { type: 'slack', buildChannel: (config, ctx) => ({...}) },
 *   env: { build: (_, ctx) => ({ SLACK_BOT_TOKEN: ctx.secrets.SLACK_BOT_TOKEN }) },
 * }
 *
 * @example
 * // AI provider plugin
 * const plugin: PluginDefinition = {
 *   manifest,
 *   configBuilder: { build: (config, ctx) => ({...}) },
 *   env: { build: (_, ctx) => ({ OPENAI_API_KEY: ctx.secrets.OPENAI_API_KEY }) },
 * }
 */
export interface PluginDefinition {
  /** Plugin manifest (metadata) */
  manifest: PluginManifest

  // ── Capability Providers ──

  /** Skills this plugin provides to agents */
  skills?: PluginSkillsProvider
  /** CLI tools this plugin exposes to agents */
  cli?: PluginCLIProvider
  /** MCP server (for real-time connections only — prefer skills+CLI) */
  mcp?: PluginMCPProvider
  /** Channel integration (Slack, Discord, Telegram, etc.) */
  channel?: PluginChannelProvider

  // ── Infrastructure ──

  /** Custom OpenClaw config generation */
  configBuilder?: PluginConfigBuilder
  /** Kubernetes resource generation (Ingress, CronJob, etc.) */
  resources?: PluginResourceProvider
  /**
   * Kubernetes pod-level artifacts (init containers, volumes, env vars).
   * Use this when a plugin needs to inject a sidecar, init container, or
   * extra volume into every agent Deployment.
   */
  k8s?: PluginK8sProvider
  /** Environment variables and secrets */
  env?: PluginEnvProvider

  // ── Lifecycle ──

  /** Pre-build agent transformation (resolves use entries into agent fields) */
  configResolver?: PluginConfigResolver
  /** Plugin lifecycle (provisioning, health) */
  lifecycle?: PluginLifecycleProvider
  /** Configuration validation */
  validation?: PluginValidationProvider

  // ── Legacy Hooks (backward compat, will be deprecated) ──

  /** @deprecated Use configBuilder.build */
  buildOpenClawConfig?(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): PluginConfigFragment

  /** @deprecated Use env.build */
  buildEnvVars?(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): Record<string, string>

  /** @deprecated Use resources.build */
  buildK8sResources?(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): Record<string, unknown>[]

  /** @deprecated Use lifecycle.provision */
  provision?(
    agentConfig: Record<string, unknown>,
    context: PluginProvisionContext,
  ): Promise<PluginProvisionResult>

  /** @deprecated Use validation.validate */
  validate?(
    agentConfig: Record<string, unknown>,
    context: PluginBuildContext,
  ): PluginValidationResult
}

// ─── Plugin Registry Interface ──────────────────────────────────────────────

export interface PluginRegistry {
  readonly size: number
  register(plugin: PluginDefinition): void
  get(id: string): PluginDefinition | undefined
  getAll(): PluginDefinition[]
  getByCategory(category: PluginCategory): PluginDefinition[]
  getByCapability(cap: PluginCapability): PluginDefinition[]
  search(query: string): PluginDefinition[]
}
