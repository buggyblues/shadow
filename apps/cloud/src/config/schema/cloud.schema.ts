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
  /** Enable /run/shadow/exposure volume and sidecar injection. Defaults to true. */
  enabled?: boolean
  /**
   * Optional sidecar image. When omitted, Cloud reuses the current runner image
   * and starts `shadowob app watch-exposures`.
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
   * services, while App installation requires the CLI/API publish flow.
   */
  allowFileRequestedInstall?: boolean
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
   * Template strings can reference translations via `${i18n:key}`.
   * The active locale is determined by `config.locale`.
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
