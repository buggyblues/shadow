export interface Message {
  id: string
  content: string
  channelId: string
  authorId: string
  threadId: string | null
  replyToId: string | null
  isEdited: boolean
  isPinned: boolean
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
  }
  attachments?: Attachment[]
  reactions?: ReactionGroup[]
  metadata?: MessageMetadata | null
}

export type MessageMentionKind =
  | 'user'
  | 'buddy'
  | 'app'
  | 'channel'
  | 'server'
  | 'here'
  | 'everyone'

export interface MessageMentionRange {
  start: number
  end: number
}

export interface MessageMention {
  kind: MessageMentionKind
  /** Canonical target id. For users this is userId, for channels channelId, for servers serverId. */
  targetId: string
  /** Canonical text persisted in message content, e.g. <@userId>, <#channelId>. */
  token: string
  /** Optional display text selected or typed by the sender before canonicalization. */
  sourceToken?: string
  /** Human-readable label used by renderers. */
  label: string
  /** Optional source range in content. Clients may omit it; servers may recompute later. */
  range?: MessageMentionRange
  serverId?: string
  serverSlug?: string | null
  serverName?: string | null
  channelId?: string
  channelName?: string | null
  appId?: string
  appKey?: string
  appName?: string | null
  iconUrl?: string | null
  userId?: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  isBot?: boolean
  isPrivate?: boolean
}

export interface MessageMetadata {
  mentions?: MessageMention[]
  agentChain?: Record<string, unknown>
  interactive?: Record<string, unknown>
  interactiveResponse?: Record<string, unknown>
  interactiveState?: Record<string, unknown>
  cards?: MessageCard[]
  commerceCards?: CommerceMessageCard[]
  paidFileCards?: PaidFileCard[]
  oauthLinkCards?: OAuthLinkCard[]
  [key: string]: unknown
}

export type MessageCardStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'transferred'

export interface MessageCardSource {
  kind: 'user' | 'pat' | 'oauth' | 'agent' | 'system' | 'server_app' | 'buddy'
  id?: string
  label?: string
  userId?: string
  agentId?: string
  appId?: string
  serverId?: string
  channelId?: string
  command?: string
  resource?: {
    kind: string
    id: string
    label?: string
    url?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface MessageCardClaim {
  id: string
  actor: MessageCardSource
  claimedAt: string
  expiresAt: string
}

export interface MessageCardCapability {
  kind: 'task'
  scope: string[]
  issuedAt: string
  expiresAt: string
  claimId?: string
  binding?: {
    messageId?: string
    cardId: string
    workspaceId?: string
  }
}

export interface TaskMessageCard {
  id: string
  kind: 'task'
  version: number
  title: string
  body?: string
  status: MessageCardStatus
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  assignee?: {
    agentId?: string
    userId?: string
    label?: string
    [key: string]: unknown
  }
  source?: MessageCardSource
  claim?: MessageCardClaim
  capability?: MessageCardCapability
  progress?: Array<{
    at: string
    status: MessageCardStatus
    note?: string
    actor?: MessageCardSource
    [key: string]: unknown
  }>
  createdAt: string
  updatedAt?: string
  data?: Record<string, unknown> & {
    task?: {
      workspaceId?: string
      [key: string]: unknown
    }
  }
  [key: string]: unknown
}

export type GenericMessageCard = {
  id?: string
  kind: string
  version?: number
  title?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface ServerAppMessageCard {
  id?: string
  kind: 'server_app'
  version?: number
  appKey: string
  title: string
  description?: string
  label?: string
  action?: {
    mode: 'open_app'
    path?: string
  }
  data?: Record<string, unknown>
  [key: string]: unknown
}

export type MessageCard = TaskMessageCard | ServerAppMessageCard | GenericMessageCard

export interface CommerceOfferCardInput {
  id?: string
  kind: 'offer'
  offerId: string
}

export type CommerceMessageCard = CommerceProductCard | CommerceOfferCardInput

export interface CommerceProductCard {
  id: string
  kind: 'offer' | 'product'
  offerId?: string
  shopId: string
  shopScope: { kind: 'server' | 'user'; id: string }
  productId: string
  skuId?: string
  snapshot: {
    name: string
    summary?: string | null
    imageUrl?: string | null
    shopName?: string | null
    deliveryPromise?: string | null
    price: number
    currency: string
    productType: 'physical' | 'entitlement'
    billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
    durationSeconds?: number | null
    resourceType?: string
    resourceId?: string
    capability?: string
  }
  purchase: { mode: 'direct' | 'select_sku' | 'open_detail' }
}

export interface PaidFileCard {
  id: string
  kind: 'paid_file'
  fileId: string
  entitlementId?: string | null
  deliverableId?: string
  snapshot: {
    name: string
    summary?: string | null
    mime?: string | null
    sizeBytes?: number | null
    previewUrl?: string | null
  }
  action: { mode: 'open_paid_file' }
}

export interface OAuthLinkCard {
  id: string
  kind: 'oauth_link'
  appId: string
  clientId?: string | null
  title: string
  description?: string | null
  iconUrl?: string | null
  meta?: {
    appName?: string | null
    avatarUrl?: string | null
    iconUrl?: string | null
    coverUrl?: string | null
    homepageUrl?: string | null
    origin?: string | null
  }
  url: string
  embedUrl?: string | null
  fallbackUrl?: string | null
  scopes?: string[]
  action: { mode: 'open_iframe' | 'open_external' }
}

export type MentionSuggestionTrigger = '@' | '#'

export interface MentionSuggestion {
  id: string
  kind: MessageMentionKind
  targetId: string
  token: string
  label: string
  description?: string | null
  serverId?: string
  serverSlug?: string | null
  serverName?: string | null
  channelId?: string
  channelName?: string | null
  appId?: string
  appKey?: string
  appName?: string | null
  iconUrl?: string | null
  userId?: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  isBot?: boolean
  isPrivate?: boolean
}

export interface Attachment {
  id: string
  messageId: string
  filename: string
  url: string
  contentType: string
  size: number
  width: number | null
  height: number | null
  createdAt: string
}

export interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
}

export interface Thread {
  id: string
  name: string
  channelId: string
  parentMessageId: string
  creatorId: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface SendMessageRequest {
  content: string
  threadId?: string
  replyToId?: string
  mentions?: MessageMention[]
  metadata?: MessageMetadata
}

export interface UpdateMessageRequest {
  content: string
}

export type NotificationType = 'mention' | 'reply' | 'dm' | 'system'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
  isRead: boolean
  createdAt: string
}
