/**
 * Top-level CloudConfig — the root shadowob-cloud.json schema.
 */

import typia from 'typia'
import type {
  CloudSkillsConfig,
  DeploymentsConfig,
  RegistryConfig,
  SharedWorkspaceConfig,
  TeamConfig,
} from './agent.schema.js'
import type { CloudRoutineConfig } from './routine.schema.js'
import type { UseEntry } from './shadow.schema.js'

/**
 * Plugin instance config (legacy map form).
 * Kept for backward compatibility with existing templates and builder logic.
 */
export interface CloudPluginInstanceConfig {
  enabled?: boolean
  config?: Record<string, unknown>
  agents?: Record<
    string,
    {
      enabled?: boolean
      config?: Record<string, unknown>
    }
  >
  secrets?: Record<string, string>
  [key: string]: unknown
}

/**
 * Cloud exposure runtime bridge.
 *
 * The agent container writes desired state under configPath; the sidecar reads
 * it and reconciles safe private/signed exposures with the Shadow control
 * plane. Installing Apps must still go through shadowob CLI/API authorization.
 */
export interface CloudExposureConfig {
  /**
   * Enable /run/shadow/exposure volume and sidecar injection. Defaults to false.
   * Set agentImage with a Shadow CLI version that supports `app watch-exposures`.
   */
  enabled?: boolean
  /**
   * Dedicated sidecar image. Required when enabled=true.
   * Cloud does not reuse runner images because runner CLI versions may not
   * include `shadowob space-app watch-exposures`.
   */
  agentImage?: string
  /** Control-plane API base URL. Defaults to SHADOWOB_SERVER_URL when available. */
  controlPlaneUrl?: string
  /** Desired-state JSON path inside the shared exposure volume. */
  configPath?: string
  /** Status JSON path written by the sidecar. */
  statusPath?: string
  /** K8s Secret key containing the sidecar-only reconcile token. */
  tokenSecretKey?: string
  /** Poll interval for desired.json changes. */
  pollIntervalSeconds?: number
  /**
   * File-requested install remains off by default; desired.json may expose
   * services, while Space App installation requires the CLI/API publish flow.
   */
  allowFileRequestedInstall?: boolean
}

/**
 * Product-level runtime overlays owned by Cloud Computer.
 *
 * These values are persisted with the deployment snapshot so optional
 * components can be reconciled after pause, repair, or redeploy. They are not
 * plugin declarations and must not contain credentials.
 */
export interface CloudComputerRuntimeConfig {
  /** Schema version for one-time Cloud Computer snapshot migrations. */
  schemaVersion?: 2
  /** Stable product identity. Display names and runtime namespaces are not identity. */
  instanceId?: string
  /** Stable execution-unit id reused by the first Buddy. */
  baseAgentId?: string
  appearance?: {
    shellColor?: 'aqua' | 'grape' | 'tangerine' | 'lime' | 'strawberry' | 'blueberry' | 'graphite'
  }
  components?: {
    browser?: boolean
    desktop?: boolean
  }
  workspaceMounts?: Array<{
    serverId: string
    rootId?: string | null
    mountPath: string
    readOnly?: boolean
  }>
  /** Resource and billing profile currently applied to the Cloud Computer. */
  resources?: {
    tier?: 'lightweight' | 'standard' | 'pro'
    cpu?: string
    memory?: string
    storageGi?: number
    pricingVersion?: string
    hourlyCredits?: number
    effectiveAt?: string
  }
  /** Installed Runtime plugins. Buddy assignment belongs to shadowob bindings. */
  runtimes?: Array<{
    id: string
    pluginId: string
    pluginVersion?: string
    runtimeVersion?: string
    status?: 'available' | 'installed'
    persistentState?: boolean
    installedAt?: string
  }>
  /**
   * Idempotent cleanup work left by a Buddy configuration change. The server
   * retries these entries after restarts until the old Shadow identity is gone.
   */
  buddyIdentityCleanup?: Array<{
    buddyId: string
    agentId: string
    userId?: string | null
    deploymentId?: string | null
    requestedAt: string
  }>
}

/**
 * Top-level shadowob-cloud.json config.
 *
 * @title Shadow Cloud Configuration
 * @description Configuration file for deploying OpenClaw AI agents to Kubernetes.
 */
export interface CloudConfig {
  /** Config version */
  version: string
  /** Stable kebab-case config/template slug */
  name?: string
  /** Human-readable title for this deployment config (shown in console) */
  title?: string
  /** Description of the customer value this agent team provides */
  description?: string
  /** Deployment environment */
  environment?: 'development' | 'staging' | 'production'
  /** Active locale for i18n resolution (e.g. "en", "zh-CN"). Defaults to "en". */
  locale?: string
  /**
   * Internationalization dictionary.
   * Keyed by locale → key → translated string.
   *
   * Display fields such as `title` and `description` contain default text.
   * The i18n dictionary provides locale-specific overrides.
   *
   * @example
   * {
   *   "en": { "title": "Research Team", "description": "AI research agents" },
   *   "zh-CN": { "title": "研究团队", "description": "AI 研究 Agent 集群" }
   * }
   */
  i18n?: Record<string, Record<string, string>>
  /**
   * Scheduled routines owned by template agents.
   * Delivery surfaces are contributed by plugins, so this section remains
   * independent from Shadow, Slack, webhooks, or other channel providers.
   */
  routines?: CloudRoutineConfig[]
  /**
   * Team / agent pack definition.
   * Groups agents with shared defaults.
   *
   * @deprecated Template metadata should use top-level `title` and `description`.
   */
  team?: TeamConfig
  /**
   * Global plugin declarations — webpack-style "use" pattern.
   * Each entry specifies a plugin id and optional configuration.
   *
   * @example
   * [
   *   { "plugin": "shadowob", "options": { "baseURL": "${env:SHADOWOB_BASE_URL}" } },
   *   { "plugin": "slack", "options": { "token": "${vault:SLACK_TOKEN}" } }
   * ]
   */
  use?: UseEntry[]
  /**
   * Legacy plugin declarations map.
   * Prefer `use`, but keep this field for compatibility during migration.
   */
  plugins?: Record<string, CloudPluginInstanceConfig>
  /**
   * Reusable provider/configuration registry.
   * Also contains vault definitions (registry.vaults) for secret isolation.
   */
  registry?: RegistryConfig
  /** K8s deployment definitions */
  deployments?: DeploymentsConfig
  /** Shared workspace (distributed filesystem across agents) */
  workspace?: SharedWorkspaceConfig
  /** Cloud-level skills registry */
  skills?: CloudSkillsConfig
  /** Dynamic service/App exposure bridge for agent runtimes. */
  exposure?: CloudExposureConfig
  /** Optional product overlays reconciled by the Cloud Computer control plane. */
  cloudComputer?: CloudComputerRuntimeConfig
}

// ─── Typia Validators ───────────────────────────────────────────────────────

/**
 * Validate a CloudConfig object.
 * Uses typia AOT compilation — zero runtime schema overhead.
 */
export const validateCloudConfig: (input: unknown) => typia.IValidation<CloudConfig> =
  typia.createValidate<CloudConfig>()

/**
 * Assert a CloudConfig object (throws on failure).
 */
export const assertCloudConfig: (input: unknown) => CloudConfig = typia.createAssert<CloudConfig>()

// ─── JSON Schema Export ─────────────────────────────────────────────────────

/**
 * Export JSON Schema for Monaco editor autocomplete.
 * Uses typia AOT compilation to generate a standard JSON Schema document.
 */
export const getCloudConfigJsonSchema: () => typia.IJsonSchemaCollection = typia.json.schemas<
  [CloudConfig]
>
