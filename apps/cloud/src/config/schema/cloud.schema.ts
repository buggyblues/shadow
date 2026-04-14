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
 * Top-level shadowob-cloud.json config.
 *
 * @title Shadow Cloud Configuration
 * @description Configuration file for deploying OpenClaw AI agents to Kubernetes.
 */
export interface CloudConfig {
  /** Config version */
  version: string
  /** Human-readable name for this deployment config (shown in console) */
  name?: string
  /** Description of what this agent team does */
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
   *   "en": { "team.name": "Research Team", "team.desc": "AI research agents" },
   *   "zh-CN": { "team.name": "研究团队", "team.desc": "AI 研究 Agent 集群" }
   * }
   */
  i18n?: Record<string, Record<string, string>>
  /**
   * Team / agent pack definition.
   * Groups agents with shared defaults.
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
