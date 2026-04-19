/**
 * Core plugin system types.
 *
 * Every plugin exports a PluginDefinition from its index.ts.
 *
 * Design principles:
 * - Flat hooks: no wrapper objects — if a plugin does something, it's a method
 * - Declarative data for static capabilities (skills, cli, mcp)
 * - Single context object carries everything a hook needs
 *
 * @example
 * // Skill plugin
 * const plugin: PluginDefinition = {
 *   manifest,
 *   skills: { bundled: ['github'] },
 *   cli: [{ name: 'gh', command: 'gh', description: 'GitHub CLI' }],
 *   buildEnv: (ctx) => ({ GITHUB_TOKEN: ctx.secrets.GITHUB_TOKEN }),
 * }
 *
 * @example
 * // Channel plugin
 * const plugin: PluginDefinition = {
 *   manifest,
 *   buildConfig: (ctx) => ({ channels: { slack: { ... } } }),
 *   buildEnv: (ctx) => ({ SLACK_BOT_TOKEN: ctx.secrets.SLACK_BOT_TOKEN }),
 *   provision: async (ctx) => { ... },
 *   healthCheck: async (ctx) => ({ healthy: true, message: 'OK' }),
 * }
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

/** Context passed to build-time hooks: buildConfig, buildEnv, buildResources, validate, healthCheck */
export interface PluginBuildContext extends PluginBaseContext {
  pluginRegistry: PluginRegistry
}

/** Context passed to the provision hook (async, has logger and previous state) */
export interface PluginProvisionContext extends PluginBaseContext {
  logger: { info: (msg: string) => void; dim: (msg: string) => void }
  dryRun: boolean
  /** This plugin's persisted state from the previous provision run */
  previousState: Record<string, unknown> | null
}

// ─── Hook Return Types ───────────────────────────────────────────────────────

export interface PluginProvisionResult {
  /** State to persist (stored as plugins[pluginId]) */
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

/** Static skills configuration — bundled skill IDs + custom entries. */
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

/** MCP server configuration (prefer skills+cli for most integrations). */
export interface PluginMCPServer {
  transport: 'stdio' | 'sse'
  command: string
  args?: string[]
  env?: Record<string, string>
}

// ─── Plugin Definition ───────────────────────────────────────────────────────

/**
 * Plugin definition — flat interface of what a plugin IS and DOES.
 *
 * Static capabilities (data):
 *   skills    — bundled skill IDs and custom entries
 *   cli       — CLI tools exposed to agents
 *   mcp       — MCP server config (use sparingly)
 *
 * Build hooks (synchronous, called during config generation):
 *   resolveAgent   — pre-process AgentDeployment before build
 *   buildConfig    — emit OpenClaw config fragment
 *   buildEnv       — emit environment variables for the agent container
 *   buildResources — emit extra Kubernetes resources
 *   validate       — validate plugin config and secrets
 *
 * Lifecycle hooks (async, called during deploy):
 *   provision    — create/update external resources (webhooks, accounts, etc.)
 *   healthCheck  — check plugin dependencies are reachable
 */
export interface PluginDefinition {
  manifest: PluginManifest

  // ── Static capabilities (declarative data) ──

  /** Skills this plugin provides (bundled IDs + custom entries) */
  skills?: PluginSkillsConfig
  /** CLI tools this plugin exposes to agents */
  cli?: PluginCLITool[]
  /** MCP server (for real-time connections only — prefer skills+cli) */
  mcp?: PluginMCPServer

  // ── Build hooks ──

  /** Pre-process an AgentDeployment before config building (e.g. resolve `use` entries) */
  resolveAgent?(agent: AgentDeployment, config: CloudConfig): AgentDeployment

  /** Emit an OpenClaw config fragment */
  buildConfig?(ctx: PluginBuildContext): PluginConfigFragment

  /** Emit environment variables to inject into the agent container */
  buildEnv?(ctx: PluginBuildContext): Record<string, string>

  /** Emit extra Kubernetes resource manifests */
  buildResources?(ctx: PluginBuildContext): Record<string, unknown>[]

  /** Validate plugin configuration and required secrets */
  validate?(ctx: PluginBuildContext): PluginValidationResult

  // ── Lifecycle hooks ──

  /** Provision external resources (runs during deploy) */
  provision?(ctx: PluginProvisionContext): Promise<PluginProvisionResult>

  /** Check plugin dependencies are reachable */
  healthCheck?(ctx: PluginBuildContext): Promise<{ healthy: boolean; message: string }>
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

// ─── Legacy aliases (for helpers.ts factory backward compat) ─────────────────

/** @deprecated Use PluginSkillsConfig */
export type PluginSkillsProvider = PluginSkillsConfig
/** @deprecated Use PluginCLITool[] directly on PluginDefinition */
export interface PluginCLIProvider {
  tools: PluginCLITool[]
}
/** @deprecated Use PluginMCPServer directly on PluginDefinition */
export interface PluginMCPProvider {
  server: PluginMCPServer
}
