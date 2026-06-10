// ─── Shadow SDK Types ───────────────────────────────────────────────────────

import type {
  BuddyInboxAdmissionMode as SharedBuddyInboxAdmissionMode,
  BuddyInboxAdmissionPendingDelivery as SharedBuddyInboxAdmissionPendingDelivery,
  BuddyInboxAdmissionPolicy as SharedBuddyInboxAdmissionPolicy,
  BuddyInboxAdmissionRule as SharedBuddyInboxAdmissionRule,
  BuddyInboxAdmissionSubjectKind as SharedBuddyInboxAdmissionSubjectKind,
  MentionSuggestion as SharedMentionSuggestion,
  MentionSuggestionTrigger as SharedMentionSuggestionTrigger,
  MessageCard as SharedMessageCard,
  MessageCardApp as SharedMessageCardApp,
  MessageCardSource as SharedMessageCardSource,
  MessageCopilotContext as SharedMessageCopilotContext,
  MessageMention as SharedMessageMention,
  OAuthLinkCard as SharedOAuthLinkCard,
  TaskMessageCardTag as SharedTaskMessageCardTag,
  TaskMessageOutputContract as SharedTaskMessageOutputContract,
  TaskMessagePrivacy as SharedTaskMessagePrivacy,
  TaskMessageRequirements as SharedTaskMessageRequirements,
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
  copilotContext?: ShadowMessageCopilotContext
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
  interactive?: ShadowInteractiveBlock
  interactiveResponse?: ShadowInteractiveResponse
  interactiveState?: ShadowInteractiveState
  /** Unified card protocol. New card-like message surfaces must use this field. */
  cards?: ShadowMessageCard[]
  /**
   * @deprecated Compatibility-only commerce card array.
   * New card-like protocols must use `cards`; do not use this field for new product decisions.
   */
  commerceCards?: Array<ShadowCommerceProductCard | ShadowCommerceOfferCardInput>
  /**
   * @deprecated Compatibility-only OAuth link card array.
   * New card-like protocols must use `cards`; do not use this field for new product decisions.
   */
  oauthLinkCards?: ShadowOAuthLinkCard[]
  [key: string]: unknown
}

export interface ShadowBuddyReplyClaimInput {
  channelId: string
  rootMessageId: string
  buddyId: string
  replyToMessageId: string
  maxTurns?: number
  mode?: 'initial' | 'conversation'
  preferredTarget?: 'main' | 'thread'
}

export type ShadowBuddyReplyClaimResult =
  | {
      ok: true
      collaborationId: string
      turn: number
      replyToId: string
      target: 'main' | 'thread'
      threadId?: string
      suggestedTextLimit: number
      replyDensity: 'short'
      metadata: {
        collaboration: {
          id: string
          rootMessageId: string
          buddyId: string
          turn: number
          target: 'main' | 'thread'
          threadId?: string
          suggestedTextLimit: number
          replyDensity: 'short'
        }
      }
    }
  | {
      ok: false
      reason: 'busy' | 'duplicate' | 'policy_denied' | 'limit_reached' | 'stopped'
    }

export interface ShadowCommerceOfferCardInput {
  id?: string
  kind: 'offer'
  offerId: string
}

export type ShadowMessageMention = SharedMessageMention
export type ShadowMessageCopilotContext = SharedMessageCopilotContext
export type ShadowMessageCard = SharedMessageCard
export type ShadowMessageCardApp = SharedMessageCardApp
export type ShadowMessageCardSource = SharedMessageCardSource
export type ShadowOAuthLinkCard = SharedOAuthLinkCard
export type ShadowMentionSuggestion = SharedMentionSuggestion
export type ShadowMentionSuggestionTrigger = SharedMentionSuggestionTrigger
export type ShadowTaskMessageCardTag = SharedTaskMessageCardTag
export type ShadowTaskMessageRequirements = SharedTaskMessageRequirements
export type ShadowTaskMessageOutputContract = SharedTaskMessageOutputContract
export type ShadowTaskMessagePrivacy = SharedTaskMessagePrivacy
export type ShadowBuddyInboxAdmissionMode = SharedBuddyInboxAdmissionMode
export type ShadowBuddyInboxAdmissionSubjectKind = SharedBuddyInboxAdmissionSubjectKind
export type ShadowBuddyInboxAdmissionRule = SharedBuddyInboxAdmissionRule
export type ShadowBuddyInboxAdmissionPolicy = SharedBuddyInboxAdmissionPolicy
export type ShadowBuddyInboxAdmissionPendingDelivery = SharedBuddyInboxAdmissionPendingDelivery

export interface ShadowBuddyInboxSummary {
  agent: {
    id: string
    ownerId: string
    status?: string | null
    user?: ShadowUser | null
  }
  channel: ShadowChannel | null
  canManage: boolean
  server?: {
    id: string
    name: string
    slug?: string | null
  }
}

export interface ShadowEnsureBuddyInboxResult {
  channel: ShadowChannel
  agent: ShadowBuddyInboxSummary['agent']
  created: boolean
}

export interface ShadowBuddyInboxAdmissionPolicyResult {
  channel: ShadowChannel | null
  policy: ShadowBuddyInboxAdmissionPolicy
}

export interface ShadowBuddyInboxAdmissionPendingResult {
  channel: ShadowChannel | null
  pending: ShadowBuddyInboxAdmissionPendingDelivery[]
}

export interface ShadowBuddyInboxAdmissionPendingActionResult {
  channel: ShadowChannel | null
  pending: ShadowBuddyInboxAdmissionPendingDelivery
  message?: ShadowMessage
  policy?: ShadowBuddyInboxAdmissionPolicy
}

export interface ShadowInboxTaskInput {
  title: string
  body?: string
  priority?: 'low' | 'normal' | 'medium' | 'high'
  tags?: ShadowTaskMessageCardTag[]
  app?: ShadowMessageCardApp
  idempotencyKey?: string
  source?: ShadowMessageCardSource
  requirements?: ShadowTaskMessageRequirements
  outputContract?: ShadowTaskMessageOutputContract
  privacy?: ShadowTaskMessagePrivacy
  data?: Record<string, unknown>
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
}

export type ShadowContentFeedKind = 'image' | 'html' | 'pdf' | 'file' | 'voice' | 'card'
export type ShadowContentSubscriptionStatus = 'active' | 'paused'
export type ShadowContentDigestMode = 'realtime' | 'daily' | 'none'
export type ShadowContentFeedEventState = 'seen' | 'opened' | 'saved' | 'hidden' | 'dismissed'
export type ShadowContentFeedReadState =
  | 'unread'
  | 'seen'
  | 'opened'
  | 'saved'
  | 'hidden'
  | 'dismissed'

export interface ShadowContentSubscription {
  id: string
  userId: string
  channelId: string
  serverId: string
  status: ShadowContentSubscriptionStatus
  includeKinds: ShadowContentFeedKind[]
  excludeMimeTypes: string[]
  minAttachmentSize: number | null
  maxAttachmentSize: number | null
  pushEnabled: boolean
  digestMode: ShadowContentDigestMode
  lastReadAt: string | null
  createdAt: string
  updatedAt: string
  isDefault?: boolean
  isCustomRule?: boolean
  channel?: {
    id: string
    name: string
    type: string
    isPrivate?: boolean
    serverId: string | null
    lastMessageAt?: string | null
  }
  server?: {
    id: string
    name: string
    slug?: string | null
    iconUrl?: string | null
  }
}

export interface ShadowContentSubscriptionPreferences {
  id: string
  userId: string
  includeKinds: ShadowContentFeedKind[]
  pushEnabled: boolean
  digestMode: ShadowContentDigestMode
  createdAt: string
  updatedAt: string
  isDefault?: boolean
}

export interface ShadowContentFeedItem {
  id: string
  messageId: string
  channelId: string
  serverId: string
  authorId: string
  title: string
  summary: string | null
  contentKinds: ShadowContentFeedKind[]
  primaryAttachmentId: string | null
  primaryAttachmentContentType: string | null
  primaryAttachmentSize: number | null
  primaryAttachmentDurationMs?: number | null
  attachmentIds: string[]
  cardRefs: Record<string, unknown>[]
  score: number
  publishedAt: string
  createdAt: string
  updatedAt: string
  readState: ShadowContentFeedReadState
  event: {
    state: ShadowContentFeedEventState
    lastPosition?: Record<string, unknown> | null
    updatedAt: string
  } | null
  channel: {
    id: string
    name: string
    type: string
    serverId: string | null
  }
  server: {
    id: string
    name: string
    slug?: string | null
    iconUrl?: string | null
  }
  author: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  }
  interactions?: {
    likeCount: number
    viewerLiked: boolean
    commentCount: number
    viewerSaved: boolean
  }
}

export interface ShadowContentFeedPage {
  items: ShadowContentFeedItem[]
  hasMore: boolean
  nextCursor: string | null
}

export interface ShadowSignedMediaUrl {
  url: string
  expiresAt: string
}

export type ShadowMediaVariant = 'avatar' | 'preview' | 'banner'

export type ShadowServerAppAction = 'read' | 'write' | 'manage' | 'delete' | 'generate'
export type ShadowServerAppDataClass =
  | 'public'
  | 'server-private'
  | 'channel-private'
  | 'financial'
  | 'secret'
  | 'cloud-secret'
export type ShadowServerAppApprovalMode = 'none' | 'first_time' | 'every_time' | 'policy'

export interface ShadowServerAppCommand {
  name: string
  title?: string
  description?: string
  help?: {
    summary?: string
    usage?: string
    details?: string
    examples?: readonly {
      title?: string
      command?: string
      input?: unknown
    }[]
    schemaRef?: string
  }
  path: string
  method?: 'POST'
  input?: 'json' | 'multipart'
  inputSchema?: Record<string, unknown>
  permission: string
  action: ShadowServerAppAction
  dataClass: ShadowServerAppDataClass
  approvalMode?: ShadowServerAppApprovalMode
  binary?: {
    supported?: boolean
    field?: string
    maxBytes?: number
    contentTypes?: readonly string[]
  }
}

export interface ShadowServerAppRealtimeSpec {
  transports?: readonly ('sse' | 'websocket')[]
  subscribe?: {
    events?: readonly string[]
    help?: string
  }
  publish?: {
    command?: string
    events?: readonly string[]
    help?: string
  }
  stateSync?: {
    model?: 'snapshot-patch' | 'frame-sync' | 'lockstep'
    authority?: 'server' | 'client'
    tickRate?: number
    help?: string
  }
}

export interface ShadowServerAppMarketplaceMetadata {
  tagline?: string
  summary?: string
  categories?: readonly string[]
  supportedLanguages?: readonly string[]
  coverImageUrl?: string
  gallery?: readonly {
    url: string
    type?: 'image' | 'video'
    alt?: string
  }[]
  links?: readonly {
    label: string
    url: string
    type?: 'website' | 'support' | 'docs' | 'terms' | 'privacy' | 'dashboard' | 'premium'
  }[]
  publisher?: {
    name?: string
    websiteUrl?: string
  }
}

export interface ShadowServerAppMarketplaceI18nMetadata {
  tagline?: string
  summary?: string
  categories?: readonly string[]
  supportedLanguages?: readonly string[]
  gallery?: readonly {
    alt?: string
  }[]
  links?: readonly {
    label?: string
  }[]
  publisher?: {
    name?: string
  }
}

export interface ShadowServerAppManifestI18nEntry {
  name?: string
  description?: string
  marketplace?: ShadowServerAppMarketplaceI18nMetadata
  help?: {
    overview?: string
    usage?: string
    details?: string
    commandIndex?: string
  }
}

export interface ShadowServerAppManifest {
  schemaVersion: 'shadow.app/1'
  appKey: string
  name: string
  description?: string
  version?: string
  updatedAt?: string
  iconUrl: string
  marketplace?: ShadowServerAppMarketplaceMetadata
  i18n?: Record<string, ShadowServerAppManifestI18nEntry>
  iframe?: {
    entry: string
    allowedOrigins: readonly string[]
  }
  api: {
    baseUrl: string
    auth?: { type: 'oauth2-bearer' }
  }
  access?: {
    defaultPermissions?: string[]
    defaultApprovalMode?: ShadowServerAppApprovalMode
  }
  commands: readonly ShadowServerAppCommand[]
  skills?: readonly {
    name: string
    description: string
    commandHints?: readonly string[]
  }[]
  events?: readonly string[]
  help?: {
    overview?: string
    usage?: string
    details?: string
    commandIndex?: string
  }
  realtime?: ShadowServerAppRealtimeSpec
  binary?: {
    supported: boolean
    maxBytes?: number
    contentTypes?: readonly string[]
  }
}

export interface ShadowServerAppIntegration {
  id: string
  serverId: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  manifestUrl?: string | null
  manifest: ShadowServerAppManifest
  manifestVersion?: string | null
  manifestUpdatedAt?: string | null
  manifestFetchedAt?: string | null
  iframeEntry?: string | null
  allowedOrigins: string[]
  apiBaseUrl: string
  defaultPermissions: string[]
  defaultApprovalMode: ShadowServerAppApprovalMode
  status: string
  installedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface ShadowServerAppSummary {
  id: string
  serverId: string
  appKey: string
  name: string
  iconUrl?: string | null
  status: string
}

export interface ShadowServerAppDiscovery {
  manifest: ShadowServerAppManifest
  installed: ShadowServerAppIntegration | null
  permissions: Array<{
    name: string
    title: string
    description?: string | null
    permission: string
    action: ShadowServerAppAction
    dataClass: ShadowServerAppDataClass
    approvalMode: ShadowServerAppApprovalMode
  }>
}

export interface ShadowServerAppCommandApproval {
  appKey: string
  appName: string
  commandName: string
  commandTitle: string
  commandDescription?: string | null
  permission: string
  action: ShadowServerAppAction
  dataClass: ShadowServerAppDataClass
  actorKind: string
  subjectKind: 'user' | 'buddy'
  buddyAgentId?: string | null
  approvalMode: ShadowServerAppApprovalMode
  reason: 'not_default' | 'first_time' | 'every_time' | 'restricted' | 'policy'
}

export interface ShadowServerAppCommandConsent {
  id: string
  serverAppId: string
  appKey: string
  command: string
  permission: string
  subjectKind: 'user' | 'buddy'
  subjectUserId?: string | null
  buddyAgentId?: string | null
  expiresAt?: string | null
}

export interface ShadowServerAppCatalogEntry {
  id: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  manifestUrl?: string | null
  manifest: ShadowServerAppManifest
  status: string
  tagline?: string | null
  summary?: string | null
  categories?: string[]
  supportedLanguages?: string[]
  coverImageUrl?: string | null
  gallery?: Array<{ url: string; type: 'image' | 'video'; alt: string | null }>
  links?: Array<{ label: string; url: string; type: string }>
  publisher?: { name: string | null; websiteUrl: string | null } | null
  commandCount?: number
  skillCount?: number
  serverCount?: number
  installed?: ShadowServerAppIntegration | null
  permissions?: ShadowServerAppDiscovery['permissions']
  createdAt: string
  updatedAt: string
}

export interface ShadowServerAppDirectoryResponse {
  apps: ShadowServerAppCatalogEntry[]
  total: number
  hasMore: boolean
}

export interface ShadowServerAppLaunchContext {
  serverId: string
  serverAppId: string
  appKey: string
  iframeEntry: string | null
  allowedOrigins: string[]
  launchToken: string
  eventStreamPath: string
  expiresIn: number
}

export interface ShadowServerAppSkillDocument {
  appKey: string
  markdown: string
  skills: Array<{
    name: string
    description: string
    commandHints?: string[]
  }>
}

export interface ShadowServerAppActorProfile {
  id?: string | null
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface ShadowServerAppBuddyContext {
  agentId: string
  userId: string
  username?: string | null
  displayName?: string | null
  description?: string | null
  avatarUrl?: string | null
  ownerId?: string | null
  status?: string | null
  agentStatus?: string | null
}

export interface ShadowServerAppResourceContext {
  buddies?: ShadowServerAppBuddyContext[]
}

export interface ShadowServerAppTokenIntrospection {
  active: boolean
  token_type?: 'Bearer'
  iss?: string
  aud?: string
  sub?: string
  scope?: string
  client_id?: string
  exp?: number
  iat?: number
  shadow?: {
    protocol: 'shadow.app/1'
    serverId: string
    serverAppId: string
    appKey: string
    command?: string
    actor: {
      kind?: string
      userId?: string | null
      buddyAgentId?: string | null
      ownerId?: string | null
      profile?: ShadowServerAppActorProfile | null
    }
    channelId?: string | null
    resources?: ShadowServerAppResourceContext | null
    task?: {
      messageId: string
      cardId: string
      claimId?: string | null
      workspaceId?: string | null
      scopes?: string[]
    }
    permission?: string
    action?: string
    dataClass?: string
  }
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

export interface ShadowVoiceParticipant {
  id: string
  channelId: string
  userId: string
  uid: number
  screenUid: number
  username: string
  displayName: string | null
  avatarUrl: string | null
  isBot: boolean
  isMuted: boolean
  isDeafened: boolean
  isSpeaking: boolean
  isScreenSharing: boolean
  joinedAt: string
  updatedAt: string
  clientId: string | null
}

export interface ShadowVoiceCredentials {
  appId: string
  channelId: string
  agoraChannelName: string
  uid: number
  screenUid: number
  token: string | null
  screenToken: string | null
  expiresAt: string | null
}

export interface ShadowVoiceState {
  channelId: string
  agoraChannelName: string
  participants: ShadowVoiceParticipant[]
  participantCount: number
  emptySince: string | null
  graceEndsAt: string | null
}

export interface ShadowVoiceJoinResult {
  credentials: ShadowVoiceCredentials
  participant: ShadowVoiceParticipant
  state: ShadowVoiceState
}

export interface ShadowVoiceLeaveResult {
  participant: ShadowVoiceParticipant | null
  state: ShadowVoiceState
  left?: boolean
}

export interface ShadowVoiceRenewResult {
  credentials: ShadowVoiceCredentials
  state: ShadowVoiceState
}

export interface ShadowVoicePolicy {
  agentId: string
  channelId: string
  listen: boolean
  autoJoin: boolean
  consumeAudio: boolean
  consumeScreenShare: boolean
  screenshotIntervalSeconds: number | null
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

export interface ShadowUserMenuSummary {
  wallet: {
    balance: number
    frozenAmount: number
  }
  notifications: {
    unreadCount: number
  }
  buddy: {
    count: number
  }
  cloud: {
    deployedCount: number
  }
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
    }
  | {
      kind: 'private_room'
      serverId?: string
      serverSlug?: string
      namePrefix?: string
      buddyUserIds?: string[]
      buddyTemplateSlug?: string
    }
  | {
      kind: 'cloud_deploy'
      templateSlug: string
      buddyTemplateSlug?: string
      buddyUserIds?: string[]
      resourceTier?: 'lightweight' | 'standard' | 'pro'
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
  config: ShadowChannelPolicyConfig
}

export interface ShadowChannelPolicyConfig {
  allowedTriggerUserIds?: string[]
  triggerUserIds?: string[]
  ownerId?: string
  activeTenantIds?: string[]
  replyRequiresMention?: boolean
  [key: string]: unknown
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
  buddyUserId: string
  buddyUsername: string
  buddyDisplayName?: string | null
}

export interface ShadowChannelBootstrap {
  access: ShadowChannelAccess
  channel: ShadowChannel
  server: ShadowServer | null
  channels: ShadowChannel[]
  buddyInboxes?: ShadowBuddyInboxSummary[]
  appSummaries?: ShadowServerAppSummary[]
  members: ShadowMember[]
  messages: {
    messages: ShadowMessage[]
    hasMore: boolean
  }
  slashCommands: {
    commands: ShadowChannelSlashCommand[]
  }
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
  buddyUserId: string
  ownerId?: string
  buddyMode?: 'private' | 'shareable'
  allowedServerIds?: string[]
  activeTenantIds?: string[]
  allowedTriggerUserIds?: string[]
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

export interface ShadowConnectorRuntimeInfo {
  id: string
  label: string
  kind: 'openclaw' | 'cli'
  status: 'available' | 'missing'
  version?: string | null
  command?: string | null
  iconId?: string | null
  installCommand?: string | null
  installCommands?: string[]
  helpUrl?: string | null
  detectedAt?: string | null
}

export interface ShadowConnectorComputer {
  id: string
  name: string
  status: 'pending' | 'online' | 'offline'
  hostname: string | null
  os: string | null
  arch: string | null
  daemonVersion: string | null
  runtimes: ShadowConnectorRuntimeInfo[]
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ShadowConnectorBootstrapResult {
  computer: ShadowConnectorComputer
  apiKey: string
  command: string
}

export interface ShadowDesktopReleaseDownload {
  id: 'macos-arm64' | 'macos-x64' | 'windows-x64' | 'linux-x64'
  label: string
  url: string
  assetName: string | null
}

export interface ShadowDesktopReleaseInfo {
  tagName: string
  htmlUrl: string
  downloads: ShadowDesktopReleaseDownload[]
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
  agentId?: string | null
  agentStatus?: string | null
  lastHeartbeat?: string | null
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
  buddyUserId?: string
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

export interface VoiceParticipantPayload {
  channelId: string
  participant: ShadowVoiceParticipant | null
  state: ShadowVoiceState
}

export interface VoicePolicyUpdatedPayload {
  channelId: string
  agentId: string
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
    tags?: string[]
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
  buyer?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  order?:
    | (Omit<ShadowOrder, 'items' | 'currency'> & {
        currency?: string | null
        items?: ShadowOrder['items']
      })
    | null
  fulfillmentJobs?: Array<Record<string, unknown>>
}

export interface ShadowOAuthCommerceEntitlementSummary {
  id: string
  status: string
  capability: string
  resourceType: string
  resourceId: string
  productId?: string | null
  shopId?: string | null
  orderId?: string | null
  offerId?: string | null
  expiresAt?: string | null
}

export interface ShadowOAuthCommerceEntitlementAccess {
  allowed: boolean
  status: string
  reasonCode?: string | null
  resourceType: string
  resourceId: string
  capability: string
  app: { id: string }
  entitlement?: ShadowOAuthCommerceEntitlementSummary | null
}

export interface ShadowOAuthCommerceEntitlementRedeemInput {
  idempotencyKey: string
  resourceType?: string
  resourceId?: string
  capability?: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface ShadowOAuthCommerceEntitlementRedemption {
  appId: string
  resourceType: string
  resourceId: string
  capability: string
  idempotencyKey: string
  redeemedAt: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface ShadowOAuthCommerceEntitlementRedeemResult {
  redeemed: true
  resourceType: string
  resourceId: string
  capability: string
  app: { id: string }
  entitlement: ShadowOAuthCommerceEntitlementSummary
  redemption: ShadowOAuthCommerceEntitlementRedemption
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

export interface ShadowCommerceProductContext {
  product: ShadowProduct
  shop: ShadowShop & {
    logoUrl?: string | null
    bannerUrl?: string | null
  }
  server: {
    id: string
    name: string
    slug?: string | null
    description?: string | null
    iconUrl?: string | null
    bannerUrl?: string | null
    ownerId?: string | null
  } | null
  provider: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  } | null
  buddy: {
    id: string
    userId: string
    ownerId: string
    status: string
    totalOnlineSeconds?: number | null
    lastHeartbeat?: string | null
  } | null
  offer: {
    id: string
    status: string
    priceOverride?: number | null
    currency: string
    allowedSurfaces?: string[] | null
    sellerUserId?: string | null
    sellerBuddyUserId?: string | null
  } | null
  fulfillment: {
    status: string
    resourceType?: string | null
    resourceId?: string | null
    capability?: string | null
    deliverables: Array<{
      id: string
      kind: string
      resourceType?: string | null
      resourceId?: string | null
      deliveryTiming?: string | null
      status: string
    }>
  }
  refund: {
    policy: string
    status: string
    supportPath?: string | null
  }
  credit: {
    salesCount: number
    avgRating: number
    ratingCount: number
    completedOrders: number
  }
  links: {
    product: string
    shop?: string | null
    server?: string | null
    providerProfile?: string | null
    buddyProfile?: string | null
    assetHome?: string | null
    checkoutPreview?: string | null
  }
}

export interface ShadowPaidFileOpenResult {
  grant: { id: string; fileId: string; status: string; expiresAt: string }
  grantToken?: string
  viewerUrl: string
}

export interface ShadowCategory {
  id: string
  shopId: string
  name: string
  description?: string | null
  position: number
}

export interface ShadowProductMedia {
  id?: string
  type?: 'image' | 'video' | string
  url: string
  thumbnailUrl?: string | null
  position?: number
}

export interface ShadowProductSku {
  id: string
  specValues: string[]
  price: number
  stock: number
  imageUrl?: string | null
  skuCode?: string | null
  isActive?: boolean
}

export interface ShadowProductEntitlementConfig {
  resourceType?: string
  resourceId?: string
  capability?: string
  durationSeconds?: number | null
  renewalPeriodSeconds?: number | null
  privilegeDescription?: string
}

export interface ShadowProduct {
  id: string
  shopId: string
  categoryId?: string | null
  name: string
  slug?: string
  type?: 'physical' | 'entitlement' | string
  description?: string | null
  summary?: string | null
  price?: number
  basePrice?: number
  currency: string
  stock?: number
  status: string
  specNames?: string[]
  tags?: string[]
  globalPublic?: boolean
  salesCount?: number
  avgRating?: number
  ratingCount?: number
  billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
  entitlementConfig?: ShadowProductEntitlementConfig | ShadowProductEntitlementConfig[] | null
  media?: ShadowProductMedia[]
  skus?: ShadowProductSku[]
  images?: string[]
  createdAt: string
}

export interface ShadowMarketplaceProduct extends ShadowProduct {
  price: number
  imageUrl?: string | null
  shop: {
    id: string
    name: string
    scopeKind: 'server' | 'user' | string
    logoUrl?: string | null
    bannerUrl?: string | null
    server?: { id: string; name: string; slug?: string | null; iconUrl?: string | null } | null
    owner?: {
      id: string
      username: string
      displayName?: string | null
      avatarUrl?: string | null
    } | null
  }
  links?: {
    product?: string | null
    shop?: string | null
    server?: string | null
    providerProfile?: string | null
  }
}

export interface ShadowMarketplaceProductsResponse {
  products: ShadowMarketplaceProduct[]
  total: number
  hasMore: boolean
  filters?: { q?: string | null; tags?: string[]; scope?: string | null }
}

export interface ShadowMarketplaceCategory {
  tag: string
  title: string
  productCount: number
  salesCount: number
  ratingCount: number
  avgRating: number
  score: number
  href: string
}

export interface ShadowMarketplaceCategoriesResponse {
  categories: ShadowMarketplaceCategory[]
  total: number
  filters?: { q?: string | null }
}

export interface ShadowCartItem {
  id: string
  productId: string
  quantity: number
  product?: ShadowProduct
}

export interface ShadowOrder {
  id: string
  orderNo?: string
  shopId: string
  buyerId: string
  status:
    | 'pending'
    | 'paid'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'cancelled'
    | 'refunded'
    | string
  totalAmount: number
  currency: string
  trackingNo?: string | null
  buyerNote?: string | null
  sellerNote?: string | null
  paidAt?: string | null
  shippedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  items: Array<{
    id?: string
    productId: string
    skuId?: string | null
    productName?: string
    specValues?: string[]
    quantity: number
    price: number
    imageUrl?: string | null
  }>
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

export interface ShadowCloudDeploymentDestroyResponse {
  ok: boolean
  taskId: string
  status: ShadowCloudDeploymentStatus
}

export interface ShadowCloudTemplate {
  id?: string
  slug: string
  name: string
  description?: string | null
  content: Record<string, unknown>
  tags?: string[] | null
  category?: string | null
  baseCost?: number | null
  status?: string | null
  reviewStatus?: string | null
  deployCount?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export interface ShadowCreateCloudTemplateInput {
  slug: string
  name: string
  description?: string
  content: Record<string, unknown>
  tags?: string[]
  category?: string
  baseCost?: number
  githubSource?: Record<string, unknown> | null
}

export interface ShadowCloudDeployment {
  id: string
  namespace: string
  name: string
  status: ShadowCloudDeploymentStatus
  agentCount?: number | null
  templateSlug?: string | null
  resourceTier?: 'lightweight' | 'standard' | 'pro' | string | null
  configSnapshot?: Record<string, unknown> | null
  errorMessage?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export interface ShadowCreateCloudDeploymentInput {
  namespace: string
  name: string
  templateSlug: string
  resourceTier: 'lightweight' | 'standard' | 'pro'
  agentCount?: number
  configSnapshot: Record<string, unknown>
  envVars?: Record<string, string>
  temporaryTtlMinutes?: number
  runtimeContext: {
    locale?: string
    timezone?: string
  }
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
  'voice:state': (payload: ShadowVoiceState) => void
  'voice:participant-joined': (payload: VoiceParticipantPayload) => void
  'voice:participant-left': (payload: VoiceParticipantPayload) => void
  'voice:participant-updated': (payload: VoiceParticipantPayload) => void
  'voice:policy-updated': (payload: VoicePolicyUpdatedPayload) => void
  'server:joined': (payload: ServerJoinedPayload) => void
  'agent:policy-changed': (payload: PolicyChangedPayload) => void
  error: (payload: { message: string }) => void
}

/** Events the client sends to the server */
export interface ClientEventMap {
  'channel:join': (data: { channelId: string }, ack?: (res: { ok: boolean }) => void) => void
  'channel:leave': (data: { channelId: string }) => void
  'voice:join': (
    data: { channelId: string; clientId?: string; muted?: boolean; deafened?: boolean },
    ack?: (res: {
      ok: boolean
      data?: ShadowVoiceJoinResult
      error?: string
      code?: string
    }) => void,
  ) => void
  'voice:leave': (
    data: { channelId: string; clientId?: string | null },
    ack?: (res: {
      ok: boolean
      data?: ShadowVoiceLeaveResult
      error?: string
      code?: string
    }) => void,
  ) => void
  'voice:state:update': (
    data: {
      channelId: string
      clientId?: string | null
      muted?: boolean
      deafened?: boolean
      speaking?: boolean
      screenSharing?: boolean
    },
    ack?: (res: { ok: boolean; data?: unknown; error?: string; code?: string }) => void,
  ) => void
  'voice:token:renew': (
    data: { channelId: string; clientId?: string | null },
    ack?: (res: {
      ok: boolean
      data?: ShadowVoiceRenewResult
      error?: string
      code?: string
    }) => void,
  ) => void
  'voice:heartbeat': (data: { channelId: string; clientId?: string | null }) => void
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
