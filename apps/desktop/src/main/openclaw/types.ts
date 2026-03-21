/**
 * OpenClaw Desktop Integration — Type Definitions
 *
 * Types aligned with the real OpenClaw config schema (zod-validated).
 * See openclaw dist for the canonical schema definitions.
 */

// ─── Gateway State Machine ──────────────────────────────────────────────────

export type GatewayState =
  | 'offline'
  | 'installing'
  | 'starting'
  | 'bootstrapping'
  | 'running'
  | 'stopping'
  | 'error'

export interface GatewayStatus {
  state: GatewayState
  port: number | null
  pid: number | null
  uptime: number | null
  version: string | null
  gatewayToken: string | null
  error: string | null
  lastStartedAt: number | null
}

// ─── Configuration (matches OpenClaw schema) ────────────────────────────────

/**
 * Root config shape matching openclaw.json.
 * fields that are opaque to our UI are kept as Record<string, unknown>.
 */
export interface OpenClawConfig {
  gateway?: {
    mode?: 'local' | 'cloud' | 'custom'
    auth?: {
      token?: string
      password?: string
    }
    [key: string]: unknown
  }
  agents: {
    list: AgentConfig[]
    defaults: Record<string, unknown>
  }
  /** Deterministic routing: bindings map (channel, accountId, peer) → agentId */
  bindings?: AgentBinding[]
  channels: Record<string, unknown>
  plugins: {
    enabled?: boolean
    load?: {
      paths?: string[]
      [key: string]: unknown
    }
    allow?: string[]
    entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>
    installs?: Record<string, unknown>
  }
  skills: {
    allowBundled?: string[]
    entries?: Record<
      string,
      {
        enabled?: boolean
        apiKey?: string
        env?: Record<string, string>
        config?: Record<string, unknown>
      }
    >
    load?: Record<string, unknown>
    install?: Record<string, unknown>
    limits?: Record<string, unknown>
  }
  models: {
    mode?: 'merge' | 'replace'
    providers?: Record<string, ModelProviderEntry>
  }
  cron: {
    enabled?: boolean
    store?: string
    maxConcurrentRuns?: number
    retry?: Record<string, unknown>
    webhook?: string
    sessionRetention?: string | false
  }
  /** Pass-through for any other OpenClaw config properties */
  [key: string]: unknown
}

/** OpenClaw binding — routes inbound messages to a specific agent */
export interface AgentBinding {
  agentId: string
  match: {
    channel: string
    accountId?: string
    peer?: { kind: string; id: string }
    [key: string]: unknown
  }
}

/** OpenClaw agent entry — valid fields per AgentEntrySchema.strict() */
export interface AgentConfig {
  id: string
  name?: string
  default?: boolean
  workspace?: string
  agentDir?: string
  model?:
    | string
    | { primary?: string; fallbacks?: string[]; thinking?: string | Record<string, unknown> }
  skills?: string[]
  identity?: { name?: string; theme?: string; emoji?: string; avatar?: string }
  groupChat?: Record<string, unknown>
  subagents?: Record<string, unknown>
  sandbox?: Record<string, unknown>
  params?: Record<string, unknown>
  tools?: Record<string, unknown>
  runtime?: Record<string, unknown>
  memorySearch?: Record<string, unknown>
  humanDelay?: Record<string, unknown>
  heartbeat?: Record<string, unknown>
}

/** Valid API format identifiers from OpenClaw ModelApiSchema */
export type ModelApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'openai-codex-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'github-copilot'
  | 'bedrock-converse-stream'
  | 'ollama'

/** Model provider entry nested under models.providers.<id> */
export interface ModelProviderEntry {
  baseUrl: string
  apiKey?: string
  auth?: 'api-key' | 'aws-sdk' | 'oauth' | 'token'
  api?: ModelApi
  models: ModelDefinition[]
  headers?: Record<string, string>
}

export interface ModelDefinition {
  id: string
  name?: string
  api?: string
  reasoning?: boolean
  input?: Array<'text' | 'image'>
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
  contextWindow?: number
  maxTokens?: number
  headers?: Record<string, string>
  compat?: Record<string, unknown>
}

// ─── Desktop-Only Types (not in openclaw.json) ──────────────────────────────

/**
 * Desktop channel config — stored in channels.<type> in openclaw.json.
 * We overlay our own structure for multi-account management.
 */
export interface DesktopChannelConfig {
  channelId: string
  channelType: string
  accounts: ChannelAccountConfig[]
}

export interface ChannelAccountConfig {
  id: string
  label: string
  enabled: boolean
  config: Record<string, string | number | boolean>
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export interface SkillManifest {
  name: string
  displayName: string
  description: string
  version: string
  author: string
  icon?: string
  tags?: string[]
  source: 'local' | 'hub' | 'preinstalled'
  enabled: boolean
  configSchema?: Record<string, unknown>
  env?: Record<string, string>
  apiKey?: string
  path?: string
}

export interface SkillHubEntry {
  slug: string
  name: string
  displayName: string
  description: string
  author: string
  version: string
  icon?: string
  tags?: string[]
  downloads?: number
  rating?: number
  repository?: string
  readme?: string
  installed?: boolean
}

export interface SkillHubSearchResult {
  skills: SkillHubEntry[]
  total: number
  page: number
  pageSize: number
}

// ─── Channel Metadata ───────────────────────────────────────────────────────

export interface ChannelMeta {
  id: string
  label: string
  icon: string
  description: string
  configFields: ChannelConfigField[]
  category: 'messaging' | 'social' | 'enterprise' | 'custom'
}

export interface ChannelConfigField {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'number' | 'boolean' | 'select' | 'textarea'
  placeholder?: string
  required?: boolean
  description?: string
  defaultValue?: string | number | boolean
  options?: { label: string; value: string }[]
}

// ─── Buddy Connection ───────────────────────────────────────────────────────

export interface BuddyConnection {
  id: string
  label: string
  serverUrl: string
  apiToken?: string
  remoteAgentId?: string
  agentId: string
  autoConnect?: boolean
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  lastHeartbeat?: number | null
  connectedAt?: number | null
  error?: string | null
}

// ─── IPC Event Payloads ─────────────────────────────────────────────────────

export interface GatewayLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: 'gateway' | 'openclaw' | 'system'
}

// ─── Cron Tasks (stored in ~/.shadowob/cron/jobs.json) ──────────────────────

export type CronSchedule =
  | { kind: 'at'; at: string }
  | { kind: 'every'; everyMs: number }
  | { kind: 'cron'; expr: string; tz?: string }

export type CronPayload =
  | { kind: 'systemEvent'; text: string }
  | { kind: 'agentTurn'; message: string; model?: string }

export interface CronDelivery {
  mode: 'none' | 'announce' | 'webhook'
  channel?: string
  to?: string
}

export interface CronTaskState {
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastRunStatus?: 'success' | 'failed' | 'running'
  lastError?: string
  consecutiveErrors?: number
}

export interface CronTask {
  id: string
  name: string
  description?: string
  enabled: boolean
  agentId?: string
  schedule: CronSchedule
  payload: CronPayload
  delivery?: CronDelivery
  deleteAfterRun?: boolean
  createdAtMs: number
  updatedAtMs: number
  state?: CronTaskState
}
