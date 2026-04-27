/**
 * Shadow OpenClaw Plugin — Type Definitions
 *
 * Project-specific types used by the Shadow channel plugin.
 * SDK types (ChannelPlugin, OpenClawConfig, etc.) are imported directly
 * from "openclaw/plugin-sdk/core".
 */

// ─── Shadow Account Config ─────────────────────────────────────────────────

export type ShadowAccountConfig = {
  accountId?: string | null
  token: string
  serverUrl: string
  enabled?: boolean
  agentId?: string
  /** Buddy display name — injected by cloud parser for AI context */
  buddyName?: string
  /** Buddy description — injected by cloud parser for AI context */
  buddyDescription?: string
  /** Buddy config ID — injected by cloud parser for AI context */
  buddyId?: string
}

// ─── Shadow Policy Config (per-channel, from remote config) ─────────────────

export type ShadowPolicyConfig = {
  replyToBuddy?: boolean
  maxBuddyChainDepth?: number
  buddyBlacklist?: string[]
  buddyWhitelist?: string[]
  replyToUsers?: string[]
  keywords?: string[]
  smartReply?: boolean
}

// ─── Slash Commands (discovered from agent packs) ───────────────────────────

export type ShadowSlashCommand = {
  name: string
  description?: string
  aliases?: string[]
  packId?: string
  sourcePath?: string
  body?: string
  interaction?: ShadowSlashCommandInteraction
}

export type ShadowSlashCommandInteraction = {
  id?: string
  kind: 'buttons' | 'select' | 'form' | 'approval'
  prompt?: string
  buttons?: Array<{
    id: string
    label: string
    value?: string
    style?: 'primary' | 'secondary' | 'destructive'
  }>
  options?: Array<{ id: string; label: string; value: string }>
  fields?: Array<{
    id: string
    kind: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
    label: string
    placeholder?: string
    defaultValue?: string
    required?: boolean
    options?: Array<{ id: string; label: string; value: string }>
    maxLength?: number
    min?: number
    max?: number
  }>
  submitLabel?: string
  responsePrompt?: string
  approvalCommentLabel?: string
  oneShot?: boolean
}

// ─── Agent Chain Metadata (anti-loop tracking) ──────────────────────────────

export type AgentChainMetadata = {
  agentId: string
  depth: number
  participants: string[]
  startedAt?: number
  rootMessageId?: string
}

// ─── Message Context ────────────────────────────────────────────────────────

export type MsgContext = Record<string, unknown>

// ─── Reply Payload ──────────────────────────────────────────────────────────

export type ReplyPayload = {
  text?: string
  mediaUrl?: string
  mediaUrls?: string[]
  [key: string]: unknown
}

export type ShadowRuntimeLogger = {
  log?: (msg: string) => void
  error?: (msg: string) => void
}
