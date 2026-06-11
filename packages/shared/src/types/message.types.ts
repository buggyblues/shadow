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

export const MESSAGE_COPILOT_CONTEXT_METADATA_KEY = 'copilotContext' as const
export const MESSAGE_AGENT_CHAIN_METADATA_KEY = 'agentChain' as const

export interface MessageCopilotContext {
  kind: 'server_app_copilot'
  /** Server app install id when the current surface is an installed server app. */
  serverAppId?: string | null
  /** Catalog app id when available. */
  appId?: string | null
  /** Stable app key from the app route, e.g. kanban. */
  appKey: string
  appName?: string | null
  serverId?: string | null
  serverSlug?: string | null
  /** Channel or Inbox currently opened in the Copilot panel. */
  channelId?: string | null
  channelKind?: string | null
}

function isBoundedMetadataString(value: unknown, maxLength: number, required = false) {
  if (typeof value !== 'string') return !required && value == null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength
}

export function isMessageCopilotContext(value: unknown): value is MessageCopilotContext {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.kind === 'server_app_copilot' &&
    isBoundedMetadataString(record.appKey, 120, true) &&
    isBoundedMetadataString(record.serverAppId, 160) &&
    isBoundedMetadataString(record.appId, 160) &&
    isBoundedMetadataString(record.appName, 160) &&
    isBoundedMetadataString(record.serverId, 160) &&
    isBoundedMetadataString(record.serverSlug, 160) &&
    isBoundedMetadataString(record.channelId, 160) &&
    isBoundedMetadataString(record.channelKind, 40)
  )
}

export function buildMessageCopilotContextMetadata(
  context: MessageCopilotContext | null | undefined,
): { copilotContext: MessageCopilotContext } | undefined {
  return context && isMessageCopilotContext(context) ? { copilotContext: context } : undefined
}

export interface MessageAgentChainMetadata {
  /** Logical runtime agent id that produced the current message. */
  agentId: string
  /** Number of runtime hops from the original trigger to this message. */
  depth: number
  /** Bot/user ids that have participated in the chain so far. */
  participants: string[]
  /** Runtime start timestamp, usually Date.now(), or an ISO timestamp. */
  startedAt?: number | string
  /** Message id that started the chain. */
  rootMessageId?: string
}

export function isMessageAgentChainMetadata(value: unknown): value is MessageAgentChainMetadata {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const startedAt = record.startedAt
  return (
    isBoundedMetadataString(record.agentId, 160, true) &&
    typeof record.depth === 'number' &&
    Number.isInteger(record.depth) &&
    record.depth >= 0 &&
    record.depth <= 100 &&
    Array.isArray(record.participants) &&
    record.participants.length <= 100 &&
    record.participants.every((participant) => isBoundedMetadataString(participant, 160, true)) &&
    (startedAt == null ||
      (typeof startedAt === 'number' && Number.isInteger(startedAt) && startedAt >= 0) ||
      isBoundedMetadataString(startedAt, 64, true)) &&
    isBoundedMetadataString(record.rootMessageId, 160)
  )
}

export function buildMessageAgentChainMetadata(
  agentChain: MessageAgentChainMetadata | null | undefined,
): { agentChain: MessageAgentChainMetadata } | undefined {
  return agentChain && isMessageAgentChainMetadata(agentChain) ? { agentChain } : undefined
}

export interface MessageMetadata {
  /** Runtime trace metadata for agent-to-agent or task-triggered messages. */
  agentChain?: MessageAgentChainMetadata
  mentions?: MessageMention[]
  copilotContext?: MessageCopilotContext
  collaboration?: {
    id: string
    rootMessageId: string
    buddyId: string
    turn: number
    target?: 'main' | 'thread'
    threadId?: string
    suggestedTextLimit?: number
    replyDensity?: 'reaction' | 'short' | 'normal' | 'long'
  }
  interactive?: Record<string, unknown>
  interactiveResponse?: Record<string, unknown>
  interactiveState?: Record<string, unknown>
  ccConnectDelivery?: Record<string, unknown>
  shadowDelivery?: Record<string, unknown>
  /** Unified card protocol. New card-like message surfaces must use this field. */
  cards?: MessageCard[]
  /**
   * @deprecated Compatibility-only commerce card array.
   * New card-like protocols must use `cards`; do not use this field for new product decisions.
   */
  commerceCards?: CommerceMessageCard[]
  /**
   * @deprecated Compatibility-only paid-file delivery card array.
   * New card-like protocols must use `cards`; do not use this field for new product decisions.
   */
  paidFileCards?: PaidFileCard[]
  /**
   * @deprecated Compatibility-only OAuth link card array.
   * New card-like protocols must use `cards`; do not use this field for new product decisions.
   */
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
  appKey?: string
  appName?: string | null
  iconUrl?: string | null
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

export type TaskMessageCardTag =
  | string
  | {
      id?: string
      label: string
      color?: string
      [key: string]: unknown
    }

export interface MessageCardApp {
  id?: string
  appId?: string
  appKey?: string
  name?: string | null
  label?: string | null
  iconUrl?: string | null
  logoUrl?: string | null
  avatarUrl?: string | null
  imageUrl?: string | null
  url?: string | null
  [key: string]: unknown
}

export interface TaskMessageCardReply {
  id?: string
  messageId?: string
  cardId?: string
  authorId?: string
  authorLabel?: string
  authorAvatarUrl?: string | null
  content: string
  createdAt: string
  source?: MessageCardSource
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

export interface TaskMessageRequirementSkill {
  kind: 'runtime-skill'
  package: string
  version?: string
  required?: boolean
  [key: string]: unknown
}

export interface TaskMessageRequirementTool {
  kind: string
  name: string
  required?: boolean
  [key: string]: unknown
}

export interface TaskMessageRequirements {
  capabilities?: string[]
  skills?: TaskMessageRequirementSkill[]
  tools?: TaskMessageRequirementTool[]
  [key: string]: unknown
}

export interface TaskMessageExpectedArtifact {
  kind: string
  mimeTypes?: string[]
  maxBytes?: number
  required?: boolean
  [key: string]: unknown
}

export interface TaskMessageSubmitCommand {
  appKey: string
  command: string
  [key: string]: unknown
}

export interface TaskMessageOutputContract {
  expectedArtifacts?: TaskMessageExpectedArtifact[]
  submitCommand?: TaskMessageSubmitCommand
  [key: string]: unknown
}

export type TaskMessagePrivacyDataClass =
  | 'public'
  | 'server-private'
  | 'channel-private'
  | 'financial'
  | 'secret'
  | 'cloud-secret'

export interface TaskMessagePrivacy {
  dataClass: TaskMessagePrivacyDataClass
  redactionRequired?: boolean
  [key: string]: unknown
}

export interface TaskContextPack {
  snapshotAtMessageId: string | null
  sourceSurface: 'channel' | 'thread' | 'task-thread' | 'app'
  policy: 'auto_recent' | 'explicit_refs' | 'thread_context' | 'manual'
  summary: string | null
  items: Array<
    | {
        kind: 'message'
        messageId: string
        threadId?: string | null
        authorId: string
        createdAt: string
        text: string
      }
    | {
        kind: 'resource'
        resourceType: string
        resourceId: string
        title?: string
        summary?: string
      }
    | {
        kind: 'task_result'
        messageId: string
        cardId: string
        title: string
        summary: string
      }
  >
  omitted: Array<{
    messageCount: number
    reason: 'token_budget' | 'permission' | 'privacy' | 'not_relevant'
  }>
  tokenEstimate: number
}

export interface TaskMessageCard {
  id: string
  kind: 'task'
  version: number
  title: string
  body?: string
  status: MessageCardStatus
  priority?: 'low' | 'normal' | 'medium' | 'high'
  tags?: TaskMessageCardTag[]
  app?: MessageCardApp
  assignee?: {
    agentId?: string
    userId?: string
    label?: string
    [key: string]: unknown
  }
  source?: MessageCardSource
  requirements?: TaskMessageRequirements
  outputContract?: TaskMessageOutputContract
  privacy?: TaskMessagePrivacy
  claim?: MessageCardClaim
  capability?: MessageCardCapability
  progress?: Array<{
    at: string
    status: MessageCardStatus
    note?: string
    actor?: MessageCardSource
    [key: string]: unknown
  }>
  replies?: TaskMessageCardReply[]
  createdAt: string
  updatedAt?: string
  data?: Record<string, unknown> & {
    task?: {
      workspaceId?: string
      threadId?: string
      revision?: number
      contextPack?: TaskContextPack
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

export interface MessageReferenceCard {
  id?: string
  kind: 'message_reference'
  version?: number
  title: string
  description?: string
  label?: string
  target: {
    serverId?: string | null
    serverSlug?: string | null
    channelId: string
    messageId: string
    taskCardId?: string | null
    inboxAgentId?: string | null
    kind?: 'channel_message' | 'inbox_message'
  }
  source?: MessageCardSource
  data?: Record<string, unknown>
  [key: string]: unknown
}

export type MessageCard =
  | TaskMessageCard
  | ServerAppMessageCard
  | MessageReferenceCard
  | GenericMessageCard

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
  workspaceNodeId?: string | null
  kind?: 'file' | 'image' | 'voice'
  durationMs?: number | null
  audioCodec?: string | null
  audioContainer?: string | null
  waveformPeaks?: number[] | null
  waveformVersion?: number | null
  transcript?: {
    id: string
    status: 'pending' | 'processing' | 'ready' | 'failed'
    text: string | null
    language: string | null
    source: 'client' | 'server' | 'runtime'
    provider?: string | null
    confidence?: number | null
    errorCode?: string | null
    updatedAt?: string
  } | null
  playback?: {
    played: boolean
    completed: boolean
    lastPositionMs: number
    playedCount?: number
  } | null
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
