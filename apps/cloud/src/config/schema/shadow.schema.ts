/**
 * Shadow plugin config types — servers, channels, buddies, bindings.
 * Also defines the universal UseEntry type for the "use" pattern.
 */

import type { tags } from 'typia'

// ─── Use Pattern ────────────────────────────────────────────────────────────

/**
 * A single plugin declaration in the `use` array.
 *
 * @example
 * { "plugin": "shadowob", "options": { "baseURL": "${env:SHADOWOB_BASE_URL}" } }
 * { "plugin": "gitagent", "options": { "repo": "github.com/user/repo" } }
 */
export interface UseEntry {
  /** Plugin identifier (e.g. "shadowob", "gitagent", "slack") */
  plugin: string
  /** Plugin-specific options */
  options?: Record<string, unknown>
}

export interface ShadowServer {
  /** Unique identifier for this server in the config */
  id: string
  /** Display name for the server */
  name: string
  /** URL-friendly slug (auto-generated if omitted) */
  slug?: string
  /** Server description */
  description?: string
  /** Whether the server is publicly joinable */
  isPublic?: boolean
  /** Channels to create in this server */
  channels?: ShadowChannel[]
}

export interface ShadowChannel {
  /** Unique identifier for this channel in the config */
  id: string
  /** Channel display title */
  title: string
  /** Channel type (e.g. text, voice) */
  type?: string
  /** Channel description */
  description?: string
  /** Whether the channel should be private and invitation-only */
  isPrivate?: boolean
}

export interface ShadowBuddy {
  /** Unique identifier for this buddy in the config */
  id: string
  /** Display name */
  name: string
  /** Buddy description */
  description?: string
  /** Avatar image URL */
  avatarUrl?: string
}

/**
 * Reply policy mode — controls when a buddy replies to messages.
 *
 * - replyAll: reply to every message in bound channels
 * - mentionOnly: reply only when @mentioned
 * - custom: use keyword/user/buddy-based rules
 * - disabled: listen only, never reply (silent monitoring)
 */
export type ShadowReplyPolicyMode = 'replyAll' | 'mentionOnly' | 'custom' | 'disabled'

/**
 * Custom reply policy configuration.
 * Only used when mode is 'custom'.
 */
export interface ShadowCustomReplyPolicy {
  /** Reply only to messages from these usernames */
  replyToUsers?: string[]
  /** Reply only to messages containing these keywords (case-insensitive) */
  keywords?: string[]
  /** Smart reply: skip messages that @mention or reply-to someone else */
  smartReply?: boolean
  /** Allow replying to messages from other buddies/bots */
  replyToBuddy?: boolean
  /** Max depth of buddy-to-buddy conversation chain (prevents loops) */
  maxBuddyChainDepth?: number & tags.Type<'uint32'>
}

/**
 * Reply policy for a buddy binding.
 */
export interface ShadowReplyPolicy {
  /** Reply mode */
  mode: ShadowReplyPolicyMode
  /** Custom policy config (only used when mode is 'custom') */
  custom?: ShadowCustomReplyPolicy
}

export interface ShadowBinding {
  /** Target buddy/agent ID */
  targetId: string
  /** Type of target */
  targetType: 'buddy'
  /** Server config IDs this binding applies to */
  servers: string[]
  /** Channel config IDs this binding applies to */
  channels: string[]
  /** Agent deployment ID to bind */
  agentId: string
  /** Reply policy for this binding */
  replyPolicy?: ShadowReplyPolicy
}

/**
 * A rental listing for a buddy on the Shadow claw marketplace.
 *
 * When specified, the provisioner will create or update a public listing
 * so other Shadow users can discover and rent this buddy.
 */
export interface ShadowListing {
  /**
   * References the buddy id in the `buddies` array.
   * The buddy's agentId is resolved at provision time and used as the listing's agentId.
   */
  buddyId: string
  /** Listing title shown on the marketplace */
  title: string
  /** Listing description shown on the marketplace */
  description: string
  /** Hourly rental price in the platform's token currency */
  pricePerHour: number
  /** Tags for discoverability (e.g. ["coding", "research", "writing"]) */
  tags?: string[]
  /**
   * Whether the listing should be active (publicly visible) after provisioning.
   * Defaults to true. Set to false to create a draft listing.
   */
  active?: boolean
}

export interface ShadowCommercePaidFile {
  /** Unique id for this paid file commerce seed in the template. */
  id: string
  /** Server config id that owns the workspace file. */
  serverId: string
  /** Shop owner for the product. MVP templates usually use the selling Buddy's personal shop. */
  shop: {
    kind: 'server' | 'buddy'
    serverId?: string
    buddyId?: string
  }
  /** Buddy config id that should send fulfillment file cards. */
  sellerBuddyId?: string
  name: string
  slug: string
  summary?: string
  description?: string
  price: number
  durationSeconds?: number | null
  fileName: string
  html: string
  mime?: string
  offerSurfaces?: Array<'channel' | 'dm'>
  /** Optional message sent with the paid-file card after purchase. */
  fulfillmentMessage?: string
}

export interface ShadowCommerceConfig {
  paidFiles?: ShadowCommercePaidFile[]
}

export interface ShadowServerAppGrant {
  /** References the buddy id in the `buddies` array. */
  buddyId: string
  /** App permissions to grant. Use ["*"] to grant every command declared by the manifest. */
  permissions?: string[]
  approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
  resourceRules?: Record<string, unknown>
}

export interface ShadowServerApp {
  /** Unique id for this Server App integration in the template. */
  id: string
  /** Server config id that should own the app. */
  serverId: string
  /** Manifest URL reachable by the Shadow API server during provisioning. */
  manifestUrl?: string
  /** Inline manifest, useful for fully self-contained templates. */
  manifest?: Record<string, unknown>
  /** Buddy grants to apply after installation. */
  grants?: ShadowServerAppGrant[]
}

export interface ShadowobPluginConfig {
  /** Shadow servers to provision */
  servers?: ShadowServer[]
  /** Buddy agents to create */
  buddies?: ShadowBuddy[]
  /** Binding rules connecting buddies to agents */
  bindings?: ShadowBinding[]
  /**
   * Rental listings to publish on the Shadow claw marketplace.
   * Each entry creates or updates a public listing for the referenced buddy.
   */
  listings?: ShadowListing[]
  /** Commerce seed data for Offer-driven paid-file MVPs. */
  commerce?: ShadowCommerceConfig
  /** Server App integrations to install and grant to buddies. */
  serverApps?: ShadowServerApp[]
}
