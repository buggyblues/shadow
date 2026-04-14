/**
 * Agent deployment types — runtime, identity, model, workflow, compliance, team.
 */

import type { tags } from 'typia'
import type { AgentSource } from './gitagent.schema.js'
import type { AgentNetworking, AgentPermissions, VaultConfig } from './managed-agents.schema.js'
import type { OpenClawProviderConfig } from './openclaw.schema.js'
import type { UseEntry } from './shadow.schema.js'

/**
 * Agent runtime types.
 */
export type AgentRuntime = 'openclaw' | 'claude-code' | 'codex' | 'gemini' | 'opencode'

/**
 * Agent model configuration — mirrors gitagent's model section.
 * Specifies primary model with ordered fallbacks and inference constraints.
 */
export interface AgentModel {
  /** Primary model in "provider/model" format (e.g. "anthropic/claude-sonnet-4-5") */
  preferred: string
  /** Ordered fallback models tried if primary is unavailable */
  fallbacks?: string[]
  /** Inference constraints */
  constraints?: {
    /** Sampling temperature 0.0–2.0 */
    temperature?: number & tags.Minimum<0> & tags.Maximum<2>
    /** Max output tokens */
    maxTokens?: number & tags.Type<'uint32'>
    /** Top-p sampling parameter */
    topP?: number & tags.Minimum<0> & tags.Maximum<1>
    /** Thinking depth level */
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive'
  }
}

/**
 * Agent identity / soul — who the agent is.
 * Mirrors gitagent's SOUL.md concept, expressed inline in the config.
 */
export interface AgentIdentity {
  /** Display name for the agent */
  name?: string
  /** One-line description of what this agent does */
  description?: string
  /**
   * Personality, communication style, values, domain expertise.
   * Free-form text injected before the main system prompt.
   * Equivalent to SOUL.md content.
   */
  personality?: string
  /**
   * Full system prompt override. When set, replaces any inherited prompt.
   * If `personality` is also set, it is prepended to this value.
   *
   * **Priority** (highest to lowest):
   * 1. `identity.systemPrompt` — overrides everything
   * 2. `configuration.openclaw.agents[].systemPrompt` — OpenClaw agent level
   * 3. `OpenClawAgentConfig.systemPrompt` — convenience field in config preset
   *
   * When `identity.personality` is also set, final prompt is:
   * `${personality}\n\n${systemPrompt}`
   */
  systemPrompt?: string
}

/**
 * A single step in an agent workflow (SkillsFlow-style).
 */
export interface AgentWorkflowStep {
  /** Skill name to invoke */
  skill?: string
  /** Sub-agent ID to delegate to */
  agent?: string
  /** Tool name to call */
  tool?: string
  /** Step IDs that must complete before this step runs */
  dependsOn?: string[]
  /** Input mappings — supports ${{ steps.X.outputs.Y }} template syntax */
  inputs?: Record<string, string>
  /** Per-step prompt injection — extra guidance appended to the step context */
  prompt?: string
  /** Conditions that must be true for this step to run */
  conditions?: string[]
}

/**
 * Deterministic multi-step workflow — mirrors gitagent's SkillsFlow / workflows/*.yaml.
 * Chains skills, agents, and tools with explicit dependencies and data flow.
 */
export interface AgentWorkflowDef {
  /** Workflow identifier */
  name: string
  /** Human-readable description */
  description?: string
  /** Events or cron expressions that trigger this workflow */
  triggers?: string[]
  /** Cron schedule (e.g. "0 9 * * *" for 9am daily) */
  schedule?: string
  /** Ordered/parallel steps keyed by step ID */
  steps: Record<string, AgentWorkflowStep>
  /** Error handling config */
  errorHandling?: {
    onFailure?: 'retry' | 'notify' | 'abort'
    notifyChannel?: string
    maxRetries?: number & tags.Type<'uint32'>
  }
}

/**
 * Agent compliance/risk policy.
 * Mirrors gitagent compliance fields in camelCase for internal usage.
 */
export interface AgentCompliance {
  /** Risk tier for this agent's tasks */
  riskTier?: 'low' | 'standard' | 'high' | 'critical'
  /** Regulatory / governance frameworks to align with */
  frameworks?: string[]
  /** Human supervision level */
  humanInTheLoop?: 'always' | 'conditional' | 'advisory' | 'none'
  /** Enable audit logging */
  auditLogging?: boolean
  /** Retention period for audit records (e.g. 90d) */
  retentionPeriod?: string
}

/**
 * Team / agent pack metadata — groups agents into a cohesive named team.
 * Inspired by CrewClaw's "Agent Packs" concept.
 */
export interface TeamConfig {
  /** Team display name */
  name: string
  /** What this team does — appears in console and CLI output */
  description?: string
  /** Default model applied to agents that don't set `agent.model` */
  defaultModel?: AgentModel
  /** Default compliance policy applied to agents that don't set `agent.compliance` */
  defaultCompliance?: AgentCompliance
}

/**
 * K8s resource requests/limits.
 */
export interface K8sResources {
  cpu?: string
  memory?: string
}

/**
 * Shared workspace configuration — creates a PersistentVolumeClaim
 * that is mounted into every agent container, so agents share a
 * distributed filesystem that OpenClaw can discover.
 */
export interface SharedWorkspaceConfig {
  /** Enable shared workspace across agents */
  enabled: boolean
  /** Storage size (e.g. "5Gi") */
  storageSize?: string
  /** Storage class name (empty for cluster default) */
  storageClassName?: string
  /** Mount path inside containers */
  mountPath?: string
  /** Access mode */
  accessMode?: 'ReadWriteOnce' | 'ReadWriteMany' | 'ReadOnlyMany'
}

/**
 * Agent-level configuration that can extend a base config.
 */
export interface AgentConfiguration {
  /** Base configuration ID to extend from registry.configurations */
  extends?: string
  /** OpenClaw config overrides (official format) */
  openclaw?: Partial<import('./openclaw.schema.js').OpenClawConfig>
  /** Additional pass-through fields */
  [key: string]: unknown
}

/**
 * Agent deployment definition.
 */
export interface AgentDeployment {
  /** Unique agent ID */
  id: string
  /** Runtime type */
  runtime: AgentRuntime
  /** Custom container image */
  image?: string
  /** Number of replicas */
  replicas?: number & tags.Minimum<0> & tags.Type<'uint32'>
  /** Agent configuration (can extend a base config) */
  configuration: AgentConfiguration
  /** K8s resource constraints */
  resources?: {
    requests?: K8sResources
    limits?: K8sResources
  }
  /** Extra environment variables */
  env?: Record<string, string>

  // ── GitAgent-inspired identity & behaviour fields ─────────────────────────

  /**
   * Agent identity / soul — who this agent is.
   * systemPrompt and personality are merged into the OpenClaw system prompt.
   * Equivalent to SOUL.md in the gitagent standard.
   */
  identity?: AgentIdentity

  /**
   * Model preferences — overrides registry and team defaults.
   * Mirrors gitagent's `model` section: preferred primary + ordered fallbacks.
   */
  model?: AgentModel

  /**
   * Compliance/risk policy for this agent.
   * Falls back to team.defaultCompliance when omitted.
   */
  compliance?: AgentCompliance

  /**
   * Deterministic multi-step workflows this agent can run.
   * Mirrors gitagent's SkillsFlow workflows/*.yaml.
   */
  workflows?: AgentWorkflowDef[]

  /**
   * Per-agent plugin declarations (webpack-style "use" pattern).
   * Each entry specifies a plugin and its options.
   *
   * @example
   * [
   *   { "plugin": "gitagent", "options": { "repo": "github.com/user/repo" } },
   *   { "plugin": "stripe", "options": { "apiKey": "${vault:STRIPE_KEY}" } }
   * ]
   */
  use?: UseEntry[]

  /** Short description shown in console and CLI output */
  description?: string

  /**
   * Agent source overlay — pulls files from a git repository or local path
   * into the container using the gitagent directory convention.
   *
   * When set, the agent container will have SOUL.md, RULES.md, skills/,
   * tools/, hooks/, etc. available at `source.mountPath` (default: /agent).
   * OpenClaw's agentDir is automatically configured to read from this path.
   *
   * Supports two strategies:
   * - "init-container": Runtime git clone via K8s init container (default)
   * - "build-image":    Bake files into Docker image layer at build time
   */
  source?: AgentSource

  // ── Managed Agents features (P0/P1) ───────────────────────────────────────

  /**
   * Vault reference — which vault to use for this agent's secrets.
   * Defaults to "default". Each vault generates an isolated K8s Secret.
   */
  vault?: string

  /**
   * Per-tool permission policy.
   * Controls which tools can auto-execute vs. require human approval.
   * Maps to ACPX permission modes in the generated OpenClaw config.
   */
  permissions?: AgentPermissions

  /**
   * Network egress policy for this agent's pods.
   * Generates a K8s NetworkPolicy resource.
   */
  networking?: AgentNetworking

  /**
   * Agent configuration version (semver).
   * Recorded in K8s Deployment annotations for rollback tracking.
   */
  version?: string

  /** Change description for this version (stored in K8s annotations) */
  changelog?: string
}

/**
 * Deployments section.
 */
export interface DeploymentsConfig {
  /** K8s namespace */
  namespace?: string
  /** Agent deployments */
  agents: AgentDeployment[]
}

/**
 * Registry configuration preset.
 */
export interface Configuration {
  /** Unique configuration ID */
  id: string
  /** OpenClaw config values */
  openclaw?: Partial<import('./openclaw.schema.js').OpenClawConfig>
  /** Additional pass-through fields */
  [key: string]: unknown
}

/**
 * Registry section — reusable model provider, configuration presets, and vault definitions.
 */
export interface RegistryConfig {
  /** Custom LLM provider configurations */
  providers?: OpenClawProviderConfig[]
  /** Reusable configuration presets */
  configurations?: Configuration[]
  /**
   * Vault definitions for secret isolation.
   * Each agent references a vault by name (default: "default").
   * Per-agent K8s Secrets are generated with only the relevant keys.
   */
  vaults?: Record<string, VaultConfig>
}

/**
 * Cloud-level skill entry — specifies a skill to load
 * from a registry or directory into the agent containers.
 */
export interface CloudSkillEntry {
  /** Skill identifier (npm package name or local directory name) */
  name: string
  /** Skill source: "bundled" (built-in), "npm" (install from registry), or "path" (local directory) */
  source?: 'bundled' | 'npm' | 'path'
  /** For npm: package version. For path: directory on the host. */
  version?: string
  /** For path source: the local directory path */
  path?: string
  /** Whether skill is enabled */
  enabled?: boolean
  /** Environment variables for this skill */
  env?: Record<string, string>
  /** API key for this skill */
  apiKey?: string
}

/**
 * Cloud-level skills configuration — manages skill installation
 * and distribution across agent containers.
 */
export interface CloudSkillsConfig {
  /** Directory inside the container where skills are installed */
  installDir?: string
  /** Skills to distribute to agents */
  entries?: CloudSkillEntry[]
}
