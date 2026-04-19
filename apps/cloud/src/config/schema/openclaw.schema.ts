/**
 * OpenClaw official config types.
 * Based on https://docs.openclaw.ai/gateway/configuration-reference
 */

import type { tags } from 'typia'

/**
 * OpenClaw model configuration.
 * Accepts "provider/model" string form or object with primary + fallbacks.
 */
export interface OpenClawModelConfig {
  /** Primary model in "provider/model" format */
  primary: string
  /** Ordered fallback models */
  fallbacks?: string[]
}

/**
 * OpenClaw model catalog entry with alias and params.
 */
export interface OpenClawModelEntry {
  /** Shortcut alias for /model command */
  alias?: string
  /** Provider-specific params (temperature, maxTokens, etc.) */
  params?: Record<string, unknown>
}

/**
 * OpenClaw agent defaults configuration.
 */
export interface OpenClawAgentDefaults {
  /** Default workspace path */
  workspace?: string
  /** Repository root for system prompt */
  repoRoot?: string
  /** Skip bootstrap file creation */
  skipBootstrap?: boolean
  /** Max chars per bootstrap file */
  bootstrapMaxChars?: number & tags.Type<'uint32'>
  /** Max total bootstrap chars */
  bootstrapTotalMaxChars?: number & tags.Type<'uint32'>
  /** Model config — string or { primary, fallbacks } */
  model?: string | OpenClawModelConfig
  /** Image model config */
  imageModel?: string | OpenClawModelConfig
  /** PDF model config */
  pdfModel?: string | OpenClawModelConfig
  /** Image generation model config */
  imageGenerationModel?: string | OpenClawModelConfig
  /** Model catalog keyed by "provider/model" */
  models?: Record<string, OpenClawModelEntry>
  /** Default thinking level */
  thinkingDefault?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive'
  /** Default verbose level */
  verboseDefault?: 'off' | 'on' | 'full'
  /** Default elevated-output level */
  elevatedDefault?: 'off' | 'on' | 'ask' | 'full'
  /** Timeout in seconds */
  timeoutSeconds?: number & tags.Type<'uint32'>
  /** Media max size in MB */
  mediaMaxMb?: number & tags.Type<'uint32'>
  /** Context token limit */
  contextTokens?: number & tags.Type<'uint32'>
  /** Max concurrent agent runs */
  maxConcurrent?: number & tags.Type<'uint32'>
  /** User timezone */
  userTimezone?: string
  /** Time format */
  timeFormat?: 'auto' | '12' | '24'
  /** Heartbeat config */
  heartbeat?: OpenClawHeartbeatConfig
  /** Compaction config */
  compaction?: OpenClawCompactionConfig
  /** Sandbox config */
  sandbox?: Record<string, unknown>
  /** Subagent defaults */
  subagents?: OpenClawSubagentDefaults
}

export interface OpenClawHeartbeatConfig {
  /** Interval duration string (e.g. "30m") */
  every?: string
  /** Model for heartbeat runs */
  model?: string
  /** Heartbeat prompt */
  prompt?: string
  /** Session key */
  session?: string
  /** Delivery target */
  to?: string
  /** Target channel */
  target?: string
}

export interface OpenClawCompactionConfig {
  /** Compaction mode */
  mode?: 'default' | 'safeguard'
  /** Timeout in seconds */
  timeoutSeconds?: number & tags.Type<'uint32'>
  /** Identifier policy */
  identifierPolicy?: 'strict' | 'off' | 'custom'
  /** Custom instructions for identifier preservation */
  identifierInstructions?: string
  /** Model for compaction summarization */
  model?: string
}

export interface OpenClawSubagentDefaults {
  /** Default model for sub-agents */
  model?: string
  /** Max concurrent sub-agents */
  maxConcurrent?: number & tags.Type<'uint32'>
  /** Run timeout in seconds */
  runTimeoutSeconds?: number & tags.Type<'uint32'>
}

/**
 * OpenClaw ACP runtime config for an agent.
 */
export interface OpenClawAcpRuntime {
  /** ACP harness agent id (e.g. "claude", "codex") */
  agent: string
  /** ACP backend id */
  backend?: string
  /** Session mode */
  mode?: 'persistent' | 'ephemeral'
  /** Working directory inside the harness */
  cwd?: string
}

/**
 * OpenClaw agent identity config.
 */
export interface OpenClawAgentIdentity {
  /** Agent display name */
  name?: string
  /** Theme description */
  theme?: string
  /** Emoji identifier */
  emoji?: string
  /** Avatar path or URL */
  avatar?: string
}

/**
 * OpenClaw per-agent configuration (agents.list[] entry).
 */
export interface OpenClawAgentConfig {
  /** Stable agent id (required) */
  id: string
  /** Whether this is the default agent */
  default?: boolean
  /** Agent display name */
  name?: string
  /** Workspace path */
  workspace?: string
  /** Agent dir override */
  agentDir?: string
  /** Model override */
  model?: string | OpenClawModelConfig
  /** Per-agent thinking level */
  thinkingDefault?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive'
  /** Per-agent params merged over model catalog */
  params?: Record<string, unknown>
  /** Agent identity */
  identity?: OpenClawAgentIdentity
  /** Group chat mention patterns */
  groupChat?: { mentionPatterns?: string[] }
  /** Runtime descriptor */
  runtime?: {
    type: 'acp' | 'subagent'
    acp?: OpenClawAcpRuntime
  }
  /** Subagent allow rules */
  subagents?: { allowAgents?: string[] }
  /** Tool restrictions */
  tools?: {
    profile?:
      | 'minimal'
      | 'coding'
      | 'messaging'
      | 'full'
      | 'dangerously-skip-permissions'
      | 'approve-reads'
      | 'approve-all'
      | 'deny-all'
    allow?: string[]
    deny?: string[]
    elevated?: { enabled?: boolean }
  }
  /** Sandbox config override */
  sandbox?: Record<string, unknown>
  /** System prompt (convenience, non-standard) */
  systemPrompt?: string
  /** Final instructions text (mapped from personality + systemPrompt) */
  instructions?: string
}

/**
 * OpenClaw agents section.
 */
export interface OpenClawAgentsConfig {
  /** Agent defaults */
  defaults?: OpenClawAgentDefaults
  /** Per-agent list */
  list?: OpenClawAgentConfig[]
}

/**
 * OpenClaw ACP global config.
 */
export interface OpenClawAcpConfig {
  /** Enable ACP feature */
  enabled?: boolean
  /** Dispatch toggle */
  dispatch?: { enabled?: boolean }
  /** Default ACP runtime backend id */
  backend?: string
  /** Default ACP target agent id */
  defaultAgent?: string
  /** Allowed agent ids for ACP sessions */
  allowedAgents?: string[]
  /** Max concurrent ACP sessions */
  maxConcurrentSessions?: number & tags.Type<'uint32'>
  /** Stream config */
  stream?: {
    coalesceIdleMs?: number
    maxChunkChars?: number
    repeatSuppression?: boolean
    deliveryMode?: 'live' | 'final_only'
    maxOutputChars?: number
    maxSessionUpdateChars?: number
  }
  /** Runtime TTL */
  runtime?: {
    ttlMinutes?: number
  }
}

/**
 * OpenClaw binding entry for multi-agent routing.
 */
export interface OpenClawBinding {
  /** Agent to route to */
  agentId: string
  /** Binding type */
  type?: 'route' | 'acp'
  /** Match criteria */
  match: {
    /** Channel name (e.g. "telegram", "discord", "shadowob") */
    channel: string
    /** Account id or "*" for any */
    accountId?: string
    /** Peer matching */
    peer?: {
      kind?: 'direct' | 'group' | 'channel'
      id?: string
    }
    /** Guild ID (Discord) */
    guildId?: string
    /** Team ID (Teams) */
    teamId?: string
  }
  /** ACP binding config (only for type: "acp") */
  acp?: {
    mode?: string
    label?: string
    cwd?: string
    backend?: string
  }
}

/**
 * OpenClaw channel-level DM/group policies.
 */
export interface OpenClawChannelBase {
  /** Whether channel is enabled */
  enabled?: boolean
  /** DM policy */
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled'
  /** Allowed senders */
  allowFrom?: string[]
  /** Group policy */
  groupPolicy?: 'allowlist' | 'open' | 'disabled'
  /** History limit */
  historyLimit?: number & tags.Type<'uint32'>
  /** Media max size in MB */
  mediaMaxMb?: number & tags.Type<'uint32'>
  /** Streaming mode */
  streaming?: 'off' | 'partial' | 'block' | 'progress'
  /** Config writes toggle */
  configWrites?: boolean
}

/**
 * OpenClaw channels section — each channel key matches official docs.
 */
export interface OpenClawChannelsConfig {
  /** Channel defaults */
  defaults?: {
    groupPolicy?: 'allowlist' | 'open' | 'disabled'
    heartbeat?: {
      showOk?: boolean
      showAlerts?: boolean
      useIndicator?: boolean
    }
  }
  /** Model overrides by channel ID */
  modelByChannel?: Record<string, Record<string, string>>
  /** Telegram config */
  telegram?: OpenClawChannelBase & {
    botToken?: string
    groups?: Record<string, unknown>
    customCommands?: Array<{ command: string; description: string }>
    replyToMode?: 'off' | 'first' | 'all'
    linkPreview?: boolean
  }
  /** Discord config */
  discord?: OpenClawChannelBase & {
    token?: string
    allowBots?: boolean | 'mentions'
    guilds?: Record<string, unknown>
    replyToMode?: 'off' | 'first' | 'all'
    textChunkLimit?: number
    chunkMode?: 'length' | 'newline'
  }
  /** Slack config */
  slack?: OpenClawChannelBase & {
    botToken?: string
    appToken?: string
    channels?: Record<string, unknown>
    allowBots?: boolean
  }
  /** WhatsApp config */
  whatsapp?: OpenClawChannelBase & {
    textChunkLimit?: number
    chunkMode?: 'length' | 'newline'
    sendReadReceipts?: boolean
    groups?: Record<string, unknown>
  }
  /** Shadow/ShadowOB channel config */
  shadowob?: {
    enabled?: boolean
    accounts?: Record<
      string,
      {
        token?: string
        serverUrl?: string
        enabled?: boolean
      }
    >
  }
  /** Additional channels (Google Chat, Signal, iMessage, etc.) */
  [key: string]: unknown
}

/**
 * OpenClaw tools section.
 */
export interface OpenClawToolsConfig {
  /** Tool profile */
  profile?:
    | 'minimal'
    | 'coding'
    | 'messaging'
    | 'full'
    | 'dangerously-skip-permissions'
    | 'approve-reads'
    | 'approve-all'
    | 'deny-all'
  /** Allow specific tools */
  allow?: string[]
  /** Deny specific tools */
  deny?: string[]
  /** Read-only tools (approve-reads level) */
  readOnly?: string[]
  /** Behavior when approval is needed but no human is present */
  nonInteractive?: 'deny' | 'fail'
  /** Elevated exec config */
  elevated?: {
    enabled?: boolean
    allowFrom?: Record<string, string[]>
  }
  /** Exec config */
  exec?: {
    backgroundMs?: number
    timeoutSec?: number
  }
  /** Web tools config */
  web?: {
    search?: { enabled?: boolean; apiKey?: string; maxResults?: number }
    fetch?: { enabled?: boolean; maxChars?: number }
  }
  /** Sandbox tools */
  sandbox?: Record<string, unknown>
}

/**
 * OpenClaw custom provider config.
 */
export interface OpenClawProviderConfig {
  /** Provider ID */
  id?: string
  /** API adapter type */
  api?: string
  /** API key or SecretRef */
  apiKey?: string
  /** Auth strategy */
  auth?: string
  /** Upstream base URL */
  baseUrl?: string
  /** Extra static headers */
  headers?: Record<string, string>
  /** Transport overrides (e.g. allowPrivateNetwork for proxy environments) */
  request?: { allowPrivateNetwork?: boolean }
  /** Provider model catalog */
  models?: Array<{
    id: string
    name?: string
    reasoning?: boolean
    input?: string[]
    contextWindow?: number
    maxTokens?: number
    cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
  }>
}

/**
 * OpenClaw models section.
 */
export interface OpenClawModelsConfig {
  /** Merge mode */
  mode?: 'merge' | 'replace'
  /** Custom providers */
  providers?: Record<string, OpenClawProviderConfig>
}

/**
 * OpenClaw plugins section.
 */
export interface OpenClawPluginsConfig {
  /** Global enable/disable */
  enabled?: boolean
  /** Plugin allowlist */
  allow?: string[]
  /** Plugin denylist */
  deny?: string[]
  /** Plugin load paths */
  load?: { paths?: string[] }
  /** Per-plugin config */
  entries?: Record<
    string,
    {
      enabled?: boolean
      config?: Record<string, unknown>
      hooks?: { allowPromptInjection?: boolean }
    }
  >
}

/**
 * OpenClaw skills section.
 * Matches https://docs.openclaw.ai/gateway/configuration-reference#skills
 */
export interface OpenClawSkillsConfig {
  /** Allowed bundled skills */
  allowBundled?: string[]
  /** Extra skill directories */
  load?: { extraDirs?: string[] }
  /** Installation preferences */
  install?: {
    preferBrew?: boolean
    nodeManager?: 'npm' | 'pnpm' | 'yarn'
  }
  /** Per-skill config */
  entries?: Record<
    string,
    {
      enabled?: boolean
      apiKey?: string
      env?: Record<string, string>
    }
  >
}

/**
 * OpenClaw gateway section.
 */
export interface OpenClawGatewayConfig {
  /** Gateway mode */
  mode?: 'local' | 'remote'
  /** Gateway port */
  port?: number & tags.Type<'uint32'>
  /** Bind address */
  bind?: string
  /** Auth config */
  auth?: {
    mode?: 'none' | 'token' | 'password' | 'trusted-proxy'
    token?: string
    password?: string
    allowTailscale?: boolean
  }
  /** TLS config */
  tls?: {
    enabled?: boolean
    certPath?: string
    keyPath?: string
  }
  /** Reload behavior */
  reload?: {
    mode?: 'off' | 'restart' | 'hot' | 'hybrid'
    debounceMs?: number
  }
}

/**
 * OpenClaw session section.
 */
export interface OpenClawSessionConfig {
  /** Session scope */
  scope?: string
  /** DM session scope */
  dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer'
  /** Session reset config */
  reset?: {
    mode?: 'daily' | 'idle'
    atHour?: number
    idleMinutes?: number
  }
  /** Reset by chat type */
  resetByType?: Record<string, { mode?: 'daily' | 'idle'; atHour?: number; idleMinutes?: number }>
  /** Reset triggers */
  resetTriggers?: string[]
  /** Session store path */
  store?: string
  /** Thread bindings */
  threadBindings?: {
    enabled?: boolean
    idleHours?: number
    maxAgeHours?: number
  }
}

/**
 * OpenClaw logging section.
 * Matches https://docs.openclaw.ai/gateway/configuration-reference#logging
 */
export interface OpenClawLoggingConfig {
  /** Log level */
  level?: string
  /** Log file path */
  file?: string
  /** Console log level */
  consoleLevel?: string
  /** Console output style */
  consoleStyle?: 'pretty' | 'compact' | 'json'
  /** Redact sensitive data from tool output */
  redactSensitive?: 'off' | 'tools'
}

/**
 * OpenClaw messages section.
 * Matches https://docs.openclaw.ai/gateway/configuration-reference#messages
 */
export interface OpenClawMessagesConfig {
  /** Response prefix */
  responsePrefix?: string
  /** Ack reaction emoji */
  ackReaction?: string
  /** Ack reaction scope */
  ackReactionScope?: 'group-mentions' | 'group-all' | 'direct' | 'all'
  /** Remove ack after reply */
  removeAckAfterReply?: boolean
  /** Message queue config */
  queue?: {
    mode?: 'collect' | 'steer' | 'followup' | 'queue' | 'interrupt'
    debounceMs?: number
    cap?: number
  }
  /** Group chat config */
  groupChat?: {
    historyLimit?: number
  }
}

/**
 * Full OpenClaw config (openclaw.json format).
 * Matches https://docs.openclaw.ai/gateway/configuration-reference
 */
export interface OpenClawConfig {
  /** Agents section */
  agents?: OpenClawAgentsConfig
  /** Multi-agent routing bindings */
  bindings?: OpenClawBinding[]
  /** Channel configs */
  channels?: OpenClawChannelsConfig
  /** ACP config */
  acp?: OpenClawAcpConfig
  /** Session config */
  session?: OpenClawSessionConfig
  /** Messages config */
  messages?: OpenClawMessagesConfig
  /** Tools config */
  tools?: OpenClawToolsConfig
  /** Custom model providers */
  models?: OpenClawModelsConfig
  /** Plugin config */
  plugins?: OpenClawPluginsConfig
  /** Skill config */
  skills?: OpenClawSkillsConfig
  /** Gateway config */
  gateway?: OpenClawGatewayConfig
  /** Logging config */
  logging?: OpenClawLoggingConfig
  /** Environment variables */
  env?: Record<string, unknown>
  /** Additional top-level fields */
  [key: string]: unknown
}
