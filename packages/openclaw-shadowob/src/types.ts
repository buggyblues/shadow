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
