// ─── Shadow SDK Types ───────────────────────────────────────────────────────

import type {
  MentionSuggestion as SharedMentionSuggestion,
  MentionSuggestionTrigger as SharedMentionSuggestionTrigger,
  MessageMention as SharedMessageMention,
} from '@shadowob/shared'

// ─── Unified API Response Types ────────────────────────────────────────────

/** Standard success response shape */
export interface ApiSuccess<T = unknown> {
  ok: true
  data: T
}

/** Structured error codes used across the Shadow API */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'MISSING_FIELD'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'EXTERNAL_SERVICE_ERROR'
  | string

/** Standard error response shape */
export interface ApiError {
  ok: false
  error: string | { code: ApiErrorCode; message: string }
  code?: ApiErrorCode
  requiredAmount?: number
  balance?: number
  shortfall?: number
  nextAction?: string
  params?: Record<string, unknown>
}

/** Union type for all API responses */
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ─── Domain Types ─────────────────────────────────────────────────────────

/** Message returned by the Shadow REST API and Socket.IO broadcasts */
export interface ShadowMessage {
  id: string
  content: string
  channelId: string
  authorId: string
  threadId?: string | null
  replyToId?: string | null
  isPinned?: boolean
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  }
  attachments?: ShadowAttachment[]
  metadata?: ShadowMessageMetadata | null
}

export interface ShadowInteractiveButtonItem {
  id: string
  label: string
  style?: 'primary' | 'secondary' | 'destructive'
  value?: string
}

export interface ShadowInteractiveSelectItem {
  id: string
  label: string
  value: string
}

export interface ShadowInteractiveFormField {
  id: string
  kind: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
  label: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  options?: ShadowInteractiveSelectItem[]
  maxLength?: number
  min?: number
  max?: number
}

export interface ShadowInteractiveBlock {
  id: string
  kind: 'buttons' | 'select' | 'form' | 'approval'
  prompt?: string
  buttons?: ShadowInteractiveButtonItem[]
  options?: ShadowInteractiveSelectItem[]
  fields?: ShadowInteractiveFormField[]
  submitLabel?: string
  responsePrompt?: string
  approvalCommentLabel?: string
  oneShot?: boolean
}

export interface ShadowInteractiveResponse {
  blockId: string
  sourceMessageId: string
  actionId: string
  value: string
  values?: Record<string, string>
  submissionId?: string
  responseMessageId?: string | null
  submittedAt?: string
}

export interface ShadowInteractiveState {
  sourceMessageId: string
  blockId: string
  submitted: boolean
  response?: ShadowInteractiveResponse
}

export interface ShadowInteractiveActionInput {
  blockId: string
  actionId: string
  value?: string
  label?: string
  values?: Record<string, string>
}

export interface ShadowInteractiveSubmissionPending {
  ok: true
  pending: true
  interactiveState?: ShadowInteractiveState
}

export type ShadowInteractiveActionResult = ShadowMessage | ShadowInteractiveSubmissionPending

export interface ShadowMessageMetadata {
  mentions?: ShadowMessageMention[]
  agentChain?: Record<string, unknown>
  interactive?: ShadowInteractiveBlock
  interactiveResponse?: ShadowInteractiveResponse
  interactiveState?: ShadowInteractiveState
  commerceCards?: Array<ShadowCommerceProductCard | ShadowCommerceOfferCardInput>
  [key: string]: unknown
}

export interface ShadowCommerceOfferCardInput {
  id?: string
  kind: 'offer'
  offerId: string
}

export type ShadowMessageMention = SharedMessageMention
export type ShadowMentionSuggestion = SharedMentionSuggestion
export type ShadowMentionSuggestionTrigger = SharedMentionSuggestionTrigger

export interface ShadowAttachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
  width?: number | null
  height?: number | null
  workspaceNodeId?: string | null
}

export interface ShadowSignedMediaUrl {
  url: string
  expiresAt: string
}

export interface ShadowChannel {
  id: string
  name: string
  type: string
  kind: 'server' | 'dm'
  serverId: string | null
  description?: string | null
  position?: number
  isPrivate?: boolean
  isMember?: boolean
  otherUser?: ShadowUser | null
}

export type ShadowChannelJoinRequestStatus = 'pending' | 'approved' | 'rejected'

export interface ShadowChannelAccess {
  channel: ShadowChannel
  isServerMember: boolean
  isChannelMember: boolean
  canManage: boolean
  canAccess: boolean
  requiresApproval: boolean
  joinRequestStatus: ShadowChannelJoinRequestStatus | null
  joinRequestId: string | null
}

export interface ShadowChannelJoinRequestResult {
  ok: boolean
  status: ShadowChannelJoinRequestStatus
  requestId?: string
}

export type ShadowServerJoinRequestStatus = 'pending' | 'approved' | 'rejected'

export interface ShadowServerAccess {
  server: ShadowServer
  isMember: boolean
  canManage: boolean
  canAccess: boolean
  requiresApproval: boolean
  joinRequestStatus: ShadowServerJoinRequestStatus | null
  joinRequestId: string | null
}

export interface ShadowServerJoinRequestResult {
  ok: boolean
  status: ShadowServerJoinRequestStatus
  requestId?: string
}

export interface ShadowThread {
  id: string
  name: string
  channelId: string
  parentMessageId: string
  createdAt: string
}

export interface ShadowMember {
  userId: string
  serverId: string
  role: string
  isBot?: boolean
  uid?: string
  nickname?: string
  avatar?: string | null
  status?: 'online' | 'idle' | 'dnd' | 'offline'
  membershipTier?: string
  membershipLevel?: number
  isMember?: boolean
  totalOnlineSeconds?: number
  buddyTag?: string | null
  creator?: {
    uid: string
    nickname: string
    username?: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  user?: ShadowUser
}

export interface ShadowAddAgentsToServerResult {
  added: string[]
  failed: Array<{ agentId: string; error: string }>
}

export interface ShadowInviteCode {
  id: string
  code: string
  createdBy: string
  usedBy?: string | null
  usedAt?: string | null
  isActive: boolean
  note?: string | null
  createdAt: string
}

export interface ShadowServer {
  id: string
  name: string
  slug: string
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  homepageHtml: string | null
  isPublic: boolean
}

export interface ShadowUser {
  id: string
  email?: string
  username: string
  displayName?: string
  avatarUrl?: string
  isBot?: boolean
  agentId?: string
  membership?: ShadowMembership
}

export interface ShadowMembership {
  status: string
  tier: {
    id: string
    level: number
    label: string
    capabilities: string[]
  }
  level: number
  isMember: boolean
  memberSince?: string | null
  inviteCodeId?: string | null
  capabilities: string[]
}

export interface ShadowAuthResponse {
  user: ShadowUser
  accessToken: string
  refreshToken: string
}

export type ShadowPlayAction =
  | {
      kind: 'public_channel'
      serverId?: string
      serverSlug?: string
      channelId?: string
      channelName?: string
      inviteCode?: string
      buddyUserIds?: string[]
      buddyTemplateSlug?: string
      greeting?: string
    }
  | {
      kind: 'private_room'
      serverId?: string
      serverSlug?: string
      namePrefix?: string
      buddyUserIds?: string[]
      buddyTemplateSlug?: string
      greeting?: string
    }
  | {
      kind: 'cloud_deploy'
      templateSlug: string
      buddyTemplateSlug?: string
      buddyUserIds?: string[]
      greeting?: string
      resourceTier?: 'lightweight' | 'standard' | 'pro'
      defaultChannelName?: string
    }
  | {
      kind: 'external_oauth_app'
      clientId: string
      redirectUri: string
      scopes?: string[]
      state?: string
    }
  | {
      kind: 'landing_page'
      url: string
    }

export type ShadowPlayAvailability = 'available' | 'gated' | 'coming_soon' | 'misconfigured'

export interface ShadowHomePlayCatalogItem {
  id: string
  image: string
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  starts: string
  accentColor: string
  hot?: boolean
  status: ShadowPlayAvailability
  action?: ShadowPlayAction
  gates?: {
    auth?: 'optional' | 'required'
    membership?: 'none' | 'required'
    profile?: 'optional' | 'required'
  }
  template?: {
    kind: 'cloud'
    slug: string
    path: string
  }
  materials?: {
    cover: string
  }
}

export interface ShadowPlayLaunchResult {
  ok: boolean
  status: string
  playId?: string | null
  redirectUrl?: string
  serverId?: string
  channelId?: string
  deploymentId?: string
  deploymentStatus?: string
  templateSlug?: string
}

export interface ShadowModelProxyModel {
  id: string
  object: 'model'
  created: number
  owned_by: string
}

export interface ShadowModelProxyModelsResponse {
  object: 'list'
  data: ShadowModelProxyModel[]
}

export interface ShadowModelProxyBilling {
  enabled: boolean
  currency: 'shrimp'
  model: string
  models: string[]
  shrimpMicrosPerCoin: number
  shrimpPerCny: number
  inputTokensPerShrimp: number | null
  outputTokensPerShrimp: number | null
  inputCacheHitCnyPerMillionTokens: number
  inputCacheMissCnyPerMillionTokens: number
  outputCnyPerMillionTokens: number
  inputCacheHitShrimpPerMillionTokens: number
  inputCacheMissShrimpPerMillionTokens: number
  outputShrimpPerMillionTokens: number
}

export type ShadowModelProxyChatCompletionRequest = Record<string, unknown> & {
  model?: string
  messages: unknown[]
  stream?: boolean
}

export type ShadowModelProxyChatCompletionResponse = Record<string, unknown>

export interface ShadowNotification {
  id: string
  userId: string
  type: string
  kind?: string | null
  title: string
  body: string | null
  referenceId?: string | null
  referenceType?: string | null
  senderId?: string | null
  senderAvatarUrl?: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  aggregationKey?: string | null
  aggregatedCount?: number | null
  lastAggregatedAt?: string | null
  metadata?: Record<string, unknown> | null
  isRead: boolean
  createdAt: string
  expiresAt?: string | null
}

export interface ShadowScopedUnread {
  channelUnread: Record<string, number>
  serverUnread: Record<string, number>
  dmUnread?: Record<string, number>
}

// ─── Channel Policy Types ───────────────────────────────────────────────────

export interface ShadowChannelPolicy {
  listen: boolean
  reply: boolean
  mentionOnly: boolean
  config: Record<string, unknown>
}

export interface ShadowSlashCommand {
  name: string
  description?: string
  aliases?: string[]
  packId?: string
  sourcePath?: string
  interaction?: ShadowInteractiveBlock
}

export interface ShadowChannelSlashCommand extends ShadowSlashCommand {
  agentId: string
  botUserId: string
  botUsername: string
  botDisplayName?: string | null
}

export interface ShadowRemoteChannel {
  id: string
  name: string
  type: string
  policy: ShadowChannelPolicy
}

export interface ShadowRemoteServer {
  id: string
  name: string
  slug?: string
  iconUrl?: string | null
  defaultPolicy: ShadowChannelPolicy
  channels: ShadowRemoteChannel[]
}

export interface ShadowRemoteConfig {
  agentId: string
  botUserId: string
  slashCommands?: ShadowSlashCommand[]
  servers: ShadowRemoteServer[]
}

export interface ShadowUsageProviderSnapshot {
  provider: string
  amountUsd?: number | null
  usageLabel?: string | null
  raw?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
}

export interface ShadowAgentUsageSnapshotInput {
  source?: string
  model?: string | null
  totalUsd?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  cacheReadTokens?: number | null
  cacheWriteTokens?: number | null
  totalTokens?: number | null
  providers?: ShadowUsageProviderSnapshot[]
  raw?: Record<string, unknown>
  generatedAt?: string
}

// ─── Socket Event Payloads ──────────────────────────────────────────────────

export interface TypingPayload {
  channelId: string
  userId: string
  username: string
  displayName?: string | null
  typing?: boolean
}

export interface PresenceChangePayload {
  userId: string
  status: 'online' | 'idle' | 'dnd' | 'offline'
}

export interface PresenceActivityPayload {
  userId: string
  activity: string | null
  channelId: string
  username?: string
  displayName?: string | null
}

export interface MemberJoinPayload {
  channelId: string
  userId: string
}

export interface MemberLeavePayload {
  channelId: string
  userId: string
}

export interface SlashCommandsUpdatedPayload {
  channelId: string
  serverId?: string
  agentId?: string
  botUserId?: string
  commandCount?: number
}

export interface ReactionPayload {
  messageId: string
  userId: string
  emoji: string
}

export interface MessageDeletedPayload {
  id: string
  channelId: string
}

export interface ChannelCreatedPayload {
  id: string
  name: string
  type: string
  serverId: string
}

export interface ChannelMemberAddedPayload {
  channelId: string
  serverId?: string
  userId?: string
}

export interface ChannelMemberRemovedPayload {
  channelId: string
  serverId?: string
  userId?: string
}

export interface ServerJoinedPayload {
  serverId: string
  serverName: string
}

export interface PolicyChangedPayload {
  agentId: string
  serverId: string
  channelId?: string | null
}

// ─── Friendship Types ───────────────────────────────────────────────────────

export interface ShadowFriendship {
  id: string
  userId: string
  friendId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  user?: ShadowUser
  friend?: ShadowUser
}

// ─── OAuth App Types ────────────────────────────────────────────────────────

export interface ShadowOAuthApp {
  id: string
  name: string
  clientId: string
  clientSecret?: string
  redirectUris: string[]
  scopes: string[]
  createdAt: string
}

export interface ShadowOAuthConsent {
  id: string
  appId: string
  appName: string
  scopes: string[]
  createdAt: string
}

export interface ShadowOAuthToken {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

// ─── Marketplace / Rental Types ─────────────────────────────────────────────

export interface ShadowListing {
  id: string
  agentId: string
  title: string
  description: string
  pricePerHour: number
  currency: string
  tags: string[]
  isActive: boolean
  createdAt: string
  agent?: { id: string; name: string; status: string }
}

export interface ShadowContract {
  id: string
  listingId: string
  tenantId: string
  ownerId: string
  status: string
  startedAt: string
  expiresAt: string
  totalCost: number
  createdAt: string
}

// ─── Shop Types ─────────────────────────────────────────────────────────────

export interface ShadowShop {
  id: string
  scopeKind?: 'server' | 'user'
  serverId?: string | null
  ownerUserId?: string | null
  visibility?: string
  name: string
  description?: string | null
  isEnabled: boolean
}

export type ShadowCommunityAssetType =
  | 'badge'
  | 'gift'
  | 'coupon'
  | 'service_ticket'
  | 'collectible'
  | 'content_pass'
  | 'reward'

export interface ShadowCommunityAssetDefinition {
  id: string
  issuerKind: 'platform' | 'server' | 'user' | 'shop'
  issuerId?: string | null
  shopId?: string | null
  assetType: ShadowCommunityAssetType
  name: string
  description?: string | null
  imageUrl?: string | null
  giftable: boolean
  transferable: boolean
  consumable: boolean
  revocable: boolean
  expiresAfterDays?: number | null
  status: 'draft' | 'active' | 'paused' | 'archived'
  metadata?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
}

export interface ShadowCommunityAssetGrant {
  id: string
  definitionId: string
  ownerUserId: string
  sourceKind: string
  sourceId?: string | null
  quantity: number
  remainingQuantity: number
  status: 'active' | 'locked' | 'consumed' | 'revoked' | 'expired'
  expiresAt?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
}

export interface ShadowCommunityAsset {
  grant: ShadowCommunityAssetGrant
  definition: ShadowCommunityAssetDefinition
}

export interface ShadowEconomyTip {
  id: string
  senderUserId: string
  recipientUserId: string
  amount: number
  sellerNet: number
  status: 'succeeded' | 'failed' | 'reversed' | 'held'
  contextKind?: string | null
  contextId?: string | null
  message?: string | null
  createdAt?: string
}

export interface ShadowEconomyGift {
  id: string
  senderUserId: string
  recipientUserId: string
  status: 'succeeded' | 'failed' | 'reversed' | 'held'
  message?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string
}

export interface ShadowSettlementLine {
  id: string
  sellerUserId: string
  shopId?: string | null
  sourceType: 'order' | 'tip' | 'gift' | 'adjustment'
  sourceId: string
  grossAmount: number
  platformFee: number
  netAmount: number
  status: 'pending' | 'available' | 'settled' | 'failed' | 'held' | 'reversed'
  availableAt?: string | null
  settledAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ShadowCommerceProductCard {
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

export interface ShadowCommerceProductPickerGroup {
  key: string
  labelKey: string
  shopId: string
  shopName: string
  shopScope: { kind: 'server' | 'user'; id: string }
  cards: ShadowCommerceProductCard[]
}

export interface ShadowCommerceProductPickerResponse {
  cards: ShadowCommerceProductCard[]
  groups?: ShadowCommerceProductPickerGroup[]
}

export interface ShadowEntitlementProvisioning {
  status: 'provisioned' | 'manual_pending' | 'failed' | string
  code: string
  provisionedAt?: string
  checkedAt?: string
  resourceType?: string | null
  resourceId?: string | null
  capability?: string | null
}

export interface ShadowEntitlement {
  id: string
  userId: string
  serverId?: string | null
  shopId?: string | null
  orderId?: string | null
  productId?: string | null
  offerId?: string | null
  scopeKind?: 'server' | 'user' | string
  resourceType: string
  resourceId: string
  capability: string
  status: string
  isActive: boolean
  startsAt?: string
  expiresAt?: string | null
  nextRenewalAt?: string | null
  cancelledAt?: string | null
  revokedAt?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
  shop?: {
    id: string
    scopeKind: 'server' | 'user' | string
    serverId?: string | null
    ownerUserId?: string | null
    name: string
    logoUrl?: string | null
  } | null
  product?: {
    id: string
    shopId: string
    name: string
    summary?: string | null
    type: 'physical' | 'entitlement' | string
    basePrice: number
    currency: string
    billingMode: 'one_time' | 'fixed_duration' | 'subscription' | string
    entitlementConfig?: Record<string, unknown> | Record<string, unknown>[] | null
  } | null
  offer?: {
    id: string
    shopId: string
    productId: string
    priceOverride?: number | null
    currency: string
    status: string
  } | null
  paidFile?: {
    id: string
    name: string
    mime?: string | null
    sizeBytes?: number | null
    previewUrl?: string | null
  } | null
}

export interface ShadowEntitlementPurchaseResult {
  order: { id: string; orderNo: string; status: string; totalAmount: number }
  entitlement: Record<string, unknown>
  provisioning?: ShadowEntitlementProvisioning
  fulfillmentJobs?: Record<string, unknown>[]
  nextAction?: 'open_paid_file' | 'view_entitlement' | string
}

export interface ShadowCommerceCheckoutPreview {
  offer: { id: string; status: string; available: boolean; allowedSurfaces?: string[] | null }
  shop: { id: string; name: string; scopeKind: 'server' | 'user' | string; logoUrl?: string | null }
  product: {
    id: string
    name: string
    summary?: string | null
    imageUrl?: string | null
    type: 'physical' | 'entitlement' | string
    billingMode?: 'one_time' | 'fixed_duration' | 'subscription' | string
    price: number
    currency: string
    durationSeconds?: number | null
  }
  entitlement?: {
    resourceType: string
    resourceId: string
    capability: string
    access: {
      allowed: boolean
      status: string
      reasonCode?: string | null
      entitlement?: Record<string, unknown> | null
    }
  } | null
  paidFile?: {
    id: string
    name: string
    mime?: string | null
    sizeBytes?: number | null
    previewUrl?: string | null
  } | null
  deliverables?: Record<string, unknown>[]
  viewerState: 'not_purchased' | 'active' | 'expired' | 'revoked' | 'cancelled' | 'unavailable'
  primaryAction?:
    | 'purchase'
    | 'open_content'
    | 'renew'
    | 'view_detail'
    | 'view_progress'
    | 'unavailable'
    | string
  displayState?: {
    viewerState: string
    primaryAction: string
    price: { amount: number; currency: string }
    balance?: { current: number; afterPurchase?: number; shortfall?: number } | null
    seller?: { shopId: string; shopName: string; buddyUserId?: string | null }
    entitlement?: Record<string, unknown> | null
    delivery?: Record<string, unknown> | null
    content?: Record<string, unknown> | null
  }
  nextAction: 'purchase' | 'open_paid_file' | 'view_entitlement' | string
}

export interface ShadowPaidFileOpenResult {
  grant: { id: string; fileId: string; status: string; expiresAt: string }
  viewerUrl: string
}

export interface ShadowCategory {
  id: string
  shopId: string
  name: string
  description?: string | null
  position: number
}

export interface ShadowProduct {
  id: string
  shopId: string
  categoryId?: string | null
  name: string
  description?: string | null
  price: number
  currency: string
  stock: number
  status: string
  billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
  images: string[]
  createdAt: string
}

export interface ShadowCartItem {
  id: string
  productId: string
  quantity: number
  product?: ShadowProduct
}

export interface ShadowOrder {
  id: string
  shopId: string
  buyerId: string
  status: string
  totalAmount: number
  currency: string
  items: { productId: string; skuId?: string | null; quantity: number; price: number }[]
  createdAt: string
}

export interface ShadowReview {
  id: string
  orderId: string
  productId: string
  userId: string
  rating: number
  content: string
  reply?: string | null
  createdAt: string
}

export interface ShadowWallet {
  id: string
  userId: string
  balance: number
  currency: string
}

export interface ShadowTransaction {
  id: string
  walletId: string
  type: string
  amount: number
  balanceAfter?: number
  currency?: string
  referenceId?: string | null
  referenceType?: string | null
  note?: string | null
  description?: string | null
  display?: { title?: string | null; subtitle?: string | null } | null
  order?: Record<string, unknown> | null
  counterparty?: Record<string, unknown> | null
  createdAt: string
}

// ─── Cloud SaaS DIY Generation Types ───────────────────────────────────────

export type ShadowDiyCloudStepId = 'think' | 'search' | 'generate' | 'validate' | 'review'

export interface ShadowDiyCloudGenerateInput {
  prompt: string
  feedback?: string
  previousConfig?: Record<string, unknown>
  locale?: string
  timezone?: string
}

export interface ShadowDiyCloudAgentStepOutput {
  type: 'agent_step_output'
  schemaVersion: 1
  step: ShadowDiyCloudStepId
  status: ShadowDiyCloudProgressStatus
  title: string
  locale: string
  timezone: string
  generatedAt: string
  result: Record<string, unknown>
  reasons: string[]
  confidence?: number
}

export interface ShadowDiyCloudDraft {
  slug: string
  title: string
  description: string
  score: number
  steps: Array<{
    id: ShadowDiyCloudStepId
    title: string
    detail: string
  }>
  matchedPlugins: Array<{
    id: string
    name: string
    description: string
    reason: string
    capabilities: string[]
    requiredKeys: string[]
    matchedTerms: string[]
  }>
  referenceTemplates: Array<{
    slug: string
    title: string
    description: string
    category: string
    plugins: string[]
    channels: string[]
    buddyNames: string[]
    reason: string
  }>
  suggestedSkills: string[]
  requiredKeys: Array<{
    key: string
    label: string
    description: string
    source: string
    sourcePluginId: string
    sensitive: boolean
    setupSteps: string[]
    skipImpact: string
  }>
  toolTrace: Array<{
    tool:
      | 'search_plugins'
      | 'inspect_plugin'
      | 'search_templates'
      | 'inspect_template'
      | 'compile_template_dsl'
      | 'validate_template_dsl'
      | 'collect_required_keys'
    query?: string
    resultIds: string[]
  }>
  agentOutputs: ShadowDiyCloudAgentStepOutput[]
  agentReport: {
    objective: string
    assumptions: string[]
    reasoning: Array<{
      step: ShadowDiyCloudStepId
      title: string
      detail: string
      evidence: string[]
    }>
    pluginDecisions: Array<{
      id: string
      name: string
      reason: string
      capabilities: string[]
      matchedTerms: string[]
      requiredKeys: string[]
    }>
    templateDecisions: Array<{
      slug: string
      title: string
      reason: string
      plugins: string[]
      channels: string[]
    }>
    validationChecks: Array<{
      name: string
      status: 'passed' | 'warning' | 'failed'
      detail: string
    }>
    repairNotes: string[]
  }
  guidebook: {
    summary: string
    beforeDeploy: string[]
    howToUse: string[]
    reviewNotes: string[]
  }
  template: Record<string, unknown>
  validation: {
    valid: boolean
    agents: number
    configurations: number
    violations: Array<{ path: string; prefix: string }>
    extendsErrors: string[]
    templateRefs: { env: number; secret: number; file: number }
  }
}

export type ShadowDiyCloudProgressStatus = 'running' | 'completed' | 'warning' | 'error'

export type ShadowDiyCloudRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ShadowDiyCloudRun {
  runId: string
  input: ShadowDiyCloudGenerateInput
  status: ShadowDiyCloudRunStatus
  createdAt: string
  updatedAt: string
  expiresAt: string
  draft?: ShadowDiyCloudDraft
  error?: string
}

export type ShadowDiyCloudRunEvent =
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'run.created' | 'run.started' | 'run.cancelled'
      status?: ShadowDiyCloudRunStatus
      input?: ShadowDiyCloudGenerateInput
      expiresAt?: string
    }
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'step.created'
      stepId: ShadowDiyCloudStepId
      title: string
      intent: string
      order: number
      iconHint?: string
    }
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'step.delta'
      stepId: ShadowDiyCloudStepId
      channel: 'summary' | 'rationale' | 'status'
      delta: string
      status?: ShadowDiyCloudProgressStatus
      title?: string
      meta?: Record<string, unknown>
    }
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'decision'
      stepId: ShadowDiyCloudStepId
      decisionId: string
      title: string
      selected: string
      basis: {
        observations: string[]
        constraints: string[]
        evidence: Array<{ source: string; ref: string; summary: string }>
        rejectedOptions: Array<{ option: string; reason: string }>
        confidence?: number | null
        needsUserReview: boolean
      }
      output?: ShadowDiyCloudAgentStepOutput
    }
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'artifact.patch'
      stepId: ShadowDiyCloudStepId
      artifact: 'templateDsl' | 'cloudConfig' | 'guidebook' | 'requiredKeys'
      patch: unknown
    }
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'guardrail.result'
      stepId: ShadowDiyCloudStepId
      name: string
      status: 'passed' | 'warning' | 'failed' | 'error'
      detail: string
      blocksRun: boolean
    }
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'draft.completed'
      draft: ShadowDiyCloudDraft
    }
  | {
      schemaVersion: 2
      seq: number
      runId: string
      eventId: string
      timestamp: string
      type: 'run.failed'
      error: string
      code?: string
      retryable: boolean
    }

// ─── Cloud SaaS Deployment Runtime Types ───────────────────────────────────

export type ShadowCloudDeploymentStatus =
  | 'pending'
  | 'deploying'
  | 'cancelling'
  | 'deployed'
  | 'paused'
  | 'resuming'
  | 'failed'
  | 'destroying'
  | 'destroyed'

export interface ShadowCloudDeploymentRuntimeResponse {
  ok: boolean
  status: ShadowCloudDeploymentStatus
  deployment?: Record<string, unknown>
}

export interface ShadowCloudDeploymentManifest {
  deploymentId: string
  namespace: string
  name: string
  templateSlug: string | null
  template: Record<string, unknown> | null
  manifest: Record<string, unknown> | null
  drift: {
    status: 'up-to-date' | 'template-updated' | 'missing-template' | 'unlinked' | 'unknown'
    templateAvailable: boolean
    templateChanged: boolean
    deployedTemplateHash: string | null
    currentTemplateHash: string | null
    configHash: string | null
  }
  configSnapshot: Record<string, unknown> | null
}

export interface ShadowCloudDeploymentTemplateSyncResult {
  ok: boolean
  action: 'updated' | 'forked'
  template: Record<string, unknown>
  manifest: ShadowCloudDeploymentManifest
}

export interface ShadowCloudDeploymentBackup {
  id: string
  deploymentId: string
  namespace: string
  agentId: string
  sandboxName: string | null
  pvcName: string
  driver: 'volumeSnapshot' | 'restic' | string
  snapshotName: string | null
  objectKey: string | null
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'expired' | string
  phase: string
  error: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

// ─── Cloud SaaS Provider Gateway Types ─────────────────────────────────────

export interface ShadowCloudProviderCatalog {
  pluginId: string
  pluginName: string
  provider: Record<string, unknown>
  secretFields?: Record<string, unknown>[]
}

export interface ShadowCloudProviderEnvVar {
  key: string
  maskedValue: string
  isSecret: boolean
}

export interface ShadowCloudProviderModel {
  id: string
  name?: string
  tags?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: {
    input?: number
    output?: number
  }
  capabilities?: {
    vision?: boolean
    tools?: boolean
    reasoning?: boolean
  }
}

export interface ShadowCloudProviderProfile {
  id: string
  providerId: string
  name: string
  scope: string
  enabled: boolean
  config: {
    baseUrl?: string
    apiFormat?: 'openai' | 'anthropic' | 'gemini'
    authType?: 'api_key'
    discoveredAt?: string
    models?: ShadowCloudProviderModel[]
    [key: string]: unknown
  }
  envVars: ShadowCloudProviderEnvVar[]
  updatedAt?: string
}

// ─── Task Center Types ──────────────────────────────────────────────────────

export interface ShadowTask {
  key: string
  title: string
  description: string
  reward: number
  status: string
  claimedAt?: string | null
}

// ─── Recharge Types ─────────────────────────────────────────────────────────

export interface ShadowRechargeTier {
  key: string
  shrimpCoins: number
  usdCents: number
  label: string
}

export interface ShadowRechargeConfig {
  tiers: ShadowRechargeTier[]
  customAmountMin: number
  customAmountMax: number
  exchangeRate: number
  stripePublishableKey: string
}

export interface ShadowRechargeIntent {
  clientSecret: string
  paymentIntentId: string
  orderNo: string
  amount: {
    shrimpCoins: number
    usdCents: number
  }
}

export interface ShadowPaymentOrder {
  id: string
  orderNo: string
  shrimpCoinAmount: number
  usdAmount: number
  status: string
  localCurrencyAmount?: number | null
  localCurrency?: string | null
  createdAt: string
  paidAt?: string | null
}

export interface ShadowRechargeHistory {
  items: ShadowPaymentOrder[]
  total: number
  limit: number
  offset: number
}

// ─── App Types ──────────────────────────────────────────────────────────────

export interface ShadowApp {
  id: string
  serverId: string
  name: string
  slug: string
  type: string
  url?: string | null
  status: string
  createdAt: string
}

// ─── Notification Preferences ───────────────────────────────────────────────

export interface ShadowNotificationPreferences {
  strategy: 'all' | 'mention_only' | 'none'
  mutedServerIds: string[]
  mutedChannelIds: string[]
}

// ─── Socket Event Map ───────────────────────────────────────────────────────

/** Events the server pushes to the client */
export interface ServerEventMap {
  'message:new': (message: ShadowMessage) => void
  'message:updated': (message: ShadowMessage) => void
  'message:deleted': (payload: MessageDeletedPayload) => void
  'message:typing': (payload: TypingPayload) => void
  'member:typing': (payload: TypingPayload) => void
  'member:join': (payload: MemberJoinPayload) => void
  'member:joined': (payload: MemberJoinPayload & { isBot?: boolean }) => void
  'member:leave': (payload: MemberLeavePayload) => void
  'member:left': (payload: MemberLeavePayload) => void
  'presence:change': (payload: PresenceChangePayload) => void
  'presence:activity': (payload: PresenceActivityPayload) => void
  'reaction:add': (payload: ReactionPayload) => void
  'reaction:remove': (payload: ReactionPayload) => void
  'notification:new': (notification: ShadowNotification) => void
  'channel:created': (payload: ChannelCreatedPayload) => void
  'channel:member-added': (payload: ChannelMemberAddedPayload) => void
  'channel:member-removed': (payload: ChannelMemberRemovedPayload) => void
  'channel:slash-commands-updated': (payload: SlashCommandsUpdatedPayload) => void
  'server:joined': (payload: ServerJoinedPayload) => void
  'agent:policy-changed': (payload: PolicyChangedPayload) => void
  error: (payload: { message: string }) => void
}

/** Events the client sends to the server */
export interface ClientEventMap {
  'channel:join': (data: { channelId: string }, ack?: (res: { ok: boolean }) => void) => void
  'channel:leave': (data: { channelId: string }) => void
  'message:send': (data: {
    channelId: string
    content: string
    threadId?: string
    replyToId?: string
    mentions?: ShadowMessageMention[]
    metadata?: Record<string, unknown>
  }) => void
  'message:typing': (data: { channelId: string; typing?: boolean }) => void
  'presence:update': (data: { status: 'online' | 'idle' | 'dnd' | 'offline' }) => void
  'presence:activity': (data: { channelId: string; activity: string | null }) => void
}
