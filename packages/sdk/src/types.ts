// ─── Shadow SDK Types ───────────────────────────────────────────────────────

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
  agentChain?: Record<string, unknown>
  interactive?: ShadowInteractiveBlock
  interactiveResponse?: ShadowInteractiveResponse
  interactiveState?: ShadowInteractiveState
  [key: string]: unknown
}

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

export interface ShadowChannel {
  id: string
  name: string
  type: string
  serverId: string
  description?: string | null
  position?: number
}

export interface ShadowDmChannel {
  id: string
  user1Id: string
  user2Id: string
  createdAt: string
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
  user?: ShadowUser
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
  username: string
  displayName?: string
  avatarUrl?: string
  isBot?: boolean
  agentId?: string
}

export interface ShadowNotification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  referenceId?: string
  referenceType?: string
  isRead: boolean
  createdAt: string
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

// ─── Socket Event Payloads ──────────────────────────────────────────────────

export interface TypingPayload {
  channelId: string
  userId: string
  username: string
}

export interface PresenceChangePayload {
  userId: string
  status: 'online' | 'idle' | 'dnd' | 'offline'
}

export interface PresenceActivityPayload {
  userId: string
  activity: string | null
  channelId: string
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

export interface DmMessage {
  id: string
  content: string
  senderId: string
  receiverId: string
  dmChannelId: string
  channelId: string
  authorId: string
  author?: {
    id: string
    username: string
    displayName?: string
    avatarUrl?: string
    isBot?: boolean
  }
  replyToId?: string | null
  attachments?: ShadowAttachment[]
  metadata?: ShadowMessageMetadata | null
  createdAt: string
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
  serverId: string
  name: string
  description?: string | null
  isEnabled: boolean
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
  items: { productId: string; quantity: number; price: number }[]
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
  description?: string | null
  createdAt: string
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
  'dm:message:new': (message: DmMessage) => void
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
  }) => void
  'message:typing': (data: { channelId: string }) => void
  'presence:update': (data: { status: 'online' | 'idle' | 'dnd' | 'offline' }) => void
  'presence:activity': (data: { channelId: string; activity: string | null }) => void
}
