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
  MessageCardStatus as SharedMessageCardStatus,
  MessageCopilotContext as SharedMessageCopilotContext,
  MessageMention as SharedMessageMention,
  MessagePollSummary as SharedMessagePollSummary,
  OAuthLinkCard as SharedOAuthLinkCard,
  PaidFileCard as SharedPaidFileCard,
  PollVotersPage as SharedPollVotersPage,
  PresenceChangePayload as SharedPresenceChangePayload,
  PresenceSnapshotPayload as SharedPresenceSnapshotPayload,
  ShadowWidgetDefinition as SharedShadowWidgetDefinition,
  TaskMessageCardTag as SharedTaskMessageCardTag,
  TaskMessageOutputContract as SharedTaskMessageOutputContract,
  TaskMessagePrivacy as SharedTaskMessagePrivacy,
  TaskMessageRequirements as SharedTaskMessageRequirements,
} from '@shadowob/shared'

export type {
  ShadowAgentComputerPlacement,
  ShadowComputer,
  ShadowComputerBuddy,
  ShadowComputerCapabilities,
  ShadowComputerDevice,
  ShadowComputerDeviceClass,
  ShadowComputerKind,
  ShadowComputerRuntime,
  ShadowComputerStatus,
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

export interface ShadowMessageAgentChainMetadata {
  agentId: string
  depth: number
  participants: string[]
  startedAt?: number | string
  rootMessageId?: string
}

export interface ShadowMessageMetadata {
  agentChain?: ShadowMessageAgentChainMetadata
  mentions?: ShadowMessageMention[]
  copilotContext?: ShadowMessageCopilotContext
  interactive?: ShadowInteractiveBlock
  interactiveResponse?: ShadowInteractiveResponse
  interactiveState?: ShadowInteractiveState
  /** Unified card protocol for all card-like message surfaces. */
  cards?: ShadowMessageCard[]
  [key: string]: unknown
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
export type ShadowMessageCardStatus = SharedMessageCardStatus
export type ShadowOAuthLinkCard = SharedOAuthLinkCard
export type ShadowPaidFileCard = SharedPaidFileCard
export type ShadowMessagePollSummary = SharedMessagePollSummary
export type ShadowPollVotersPage = SharedPollVotersPage
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

export interface ShadowCreatePollInput {
  question: string
  answers: Array<string | { text: string; emoji?: string }>
  allowMultiselect?: boolean
  durationHours?: number
  layoutType?: 1
}

export interface ShadowPollVoteInput {
  optionIds?: string[]
  answerIds?: number[]
}

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

export interface ShadowInboxTaskStatusHook {
  id: string
  kind: 'space_app_command'
  label?: string
  trigger: {
    event: 'task.status'
    status: ShadowMessageCardStatus
    phase?: 'after'
  }
  required?: boolean
  appKey: string
  command: string
  input?: Record<string, unknown>
  instruction?: string
}

export interface ShadowInboxTaskData {
  statusHooks?: ShadowInboxTaskStatusHook[]
  [key: string]: unknown
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
  data?: ShadowInboxTaskData
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

export type ShadowSpaceAppAction = 'read' | 'write' | 'manage' | 'delete' | 'generate'
export type ShadowSpaceAppDataClass =
  | 'public'
  | 'server-private'
  | 'channel-private'
  | 'financial'
  | 'secret'
  | 'cloud-secret'
export type ShadowSpaceAppApprovalMode = 'none' | 'first_time' | 'every_time' | 'policy'

export interface ShadowSpaceAppCommand {
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
  ingress: {
    path: string
    auth?: 'shadow-command-jwt'
  }
  method?: 'POST'
  input?: 'json' | 'multipart'
  inputSchema?: Record<string, unknown>
  permission: string
  action: ShadowSpaceAppAction
  dataClass: ShadowSpaceAppDataClass
  approvalMode?: ShadowSpaceAppApprovalMode
  binary?: {
    supported?: boolean
    field?: string
    maxBytes?: number
    contentTypes?: readonly string[]
  }
}

export interface ShadowSpaceAppRealtimeSpec {
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

export interface ShadowSpaceAppMarketplaceMetadata {
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

export interface ShadowSpaceAppMarketplaceI18nMetadata {
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

export interface ShadowSpaceAppManifestI18nEntry {
  name?: string
  description?: string
  marketplace?: ShadowSpaceAppMarketplaceI18nMetadata
  help?: {
    overview?: string
    usage?: string
    details?: string
    commandIndex?: string
  }
  notifications?: Record<string, { title?: string; description?: string }>
}

export interface ShadowSpaceAppManifest {
  schemaVersion: 'shadow.space-app/1'
  appKey: string
  name: string
  description?: string
  version?: string
  updatedAt?: string
  iconUrl: string
  marketplace?: ShadowSpaceAppMarketplaceMetadata
  i18n?: Record<string, ShadowSpaceAppManifestI18nEntry>
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
    defaultApprovalMode?: ShadowSpaceAppApprovalMode
  }
  commands: readonly ShadowSpaceAppCommand[]
  skills?: readonly {
    name: string
    description: string
    commandHints?: readonly string[]
  }[]
  events?: readonly string[]
  notifications?: readonly ShadowSpaceAppNotificationTopic[]
  widgets?: readonly SharedShadowWidgetDefinition[]
  help?: {
    overview?: string
    usage?: string
    details?: string
    commandIndex?: string
  }
  realtime?: ShadowSpaceAppRealtimeSpec
  binary?: {
    supported: boolean
    maxBytes?: number
    contentTypes?: readonly string[]
  }
  mobile?: ShadowSpaceAppMobileConfig
}

export type ShadowSpaceAppNotificationChannel = 'in_app' | 'mobile_push' | 'web_push' | 'email'

export interface ShadowSpaceAppNotificationTopic {
  key: string
  title: string
  description?: string
  defaultEnabled?: boolean
  defaultChannels?: readonly ShadowSpaceAppNotificationChannel[]
}

export type ShadowSpaceAppMobileNavigationMode = 'compat' | 'immersive'

export interface ShadowSpaceAppMobileNavigationCapsule {
  backgroundColor?: string
  foregroundColor?: string
  borderColor?: string
}

export interface ShadowSpaceAppMobileNavigationConfig {
  mode?: ShadowSpaceAppMobileNavigationMode
  capsule?: ShadowSpaceAppMobileNavigationCapsule
}

export interface ShadowSpaceAppMobileConfig {
  navigation?: ShadowSpaceAppMobileNavigationConfig
}

export interface ShadowSpaceAppInstallation {
  id: string
  serverId: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  manifestUrl?: string | null
  manifest: ShadowSpaceAppManifest
  manifestVersion?: string | null
  manifestUpdatedAt?: string | null
  manifestFetchedAt?: string | null
  iframeEntry?: string | null
  allowedOrigins: string[]
  apiBaseUrl: string
  defaultPermissions: string[]
  defaultApprovalMode: ShadowSpaceAppApprovalMode
  status: string
  installedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface ShadowSpaceAppSummary {
  id: string
  serverId: string
  appKey: string
  name: string
  iconUrl?: string | null
  status: string
}

export interface ShadowSpaceAppDiscovery {
  manifest: ShadowSpaceAppManifest
  installed: ShadowSpaceAppInstallation | null
  permissions: Array<{
    name: string
    title: string
    description?: string | null
    permission: string
    action: ShadowSpaceAppAction
    dataClass: ShadowSpaceAppDataClass
    approvalMode: ShadowSpaceAppApprovalMode
  }>
}

export interface ShadowSpaceAppCommandApproval {
  appKey: string
  appName: string
  commandName: string
  commandTitle: string
  commandDescription?: string | null
  permission: string
  action: ShadowSpaceAppAction
  dataClass: ShadowSpaceAppDataClass
  actorKind: string
  subjectKind: 'user' | 'buddy'
  buddyAgentId?: string | null
  approvalMode: ShadowSpaceAppApprovalMode
  reason: 'not_default' | 'first_time' | 'every_time' | 'restricted' | 'policy'
}

export interface ShadowSpaceAppCommandConsent {
  id: string
  spaceAppId: string
  appKey: string
  command: string
  permission: string
  subjectKind: 'user' | 'buddy'
  subjectUserId?: string | null
  buddyAgentId?: string | null
  expiresAt?: string | null
}

export interface ShadowSpaceAppCatalogEntry {
  id: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  manifestUrl?: string | null
  manifest: ShadowSpaceAppManifest
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
  installed?: ShadowSpaceAppInstallation | null
  permissions?: ShadowSpaceAppDiscovery['permissions']
  createdAt: string
  updatedAt: string
}

export interface ShadowSpaceAppDirectoryResponse {
  apps: ShadowSpaceAppCatalogEntry[]
  total: number
  hasMore: boolean
}

export interface ShadowSpaceAppLaunchContext {
  serverId: string
  spaceAppId: string
  appKey: string
  iframeEntry: string | null
  allowedOrigins: string[]
  mobile?: ShadowSpaceAppMobileConfig
  launchToken: string
  eventStreamPath: string
  expiresIn: number
}

export interface ShadowSpaceAppSkillDocument {
  appKey: string
  markdown: string
  skills: Array<{
    name: string
    description: string
    commandHints?: string[]
  }>
}

export interface ShadowSpaceAppActorProfile {
  id?: string | null
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface ShadowSpaceAppBuddyContext {
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

export interface ShadowSpaceAppResourceContext {
  buddies?: ShadowSpaceAppBuddyContext[]
}

export interface ShadowSpaceAppTokenIntrospection {
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
    protocol: 'shadow.space-app/1'
    serverId: string
    spaceAppId: string
    appKey: string
    command?: string
    actor: {
      kind?: string
      userId?: string | null
      buddyAgentId?: string | null
      ownerId?: string | null
      profile?: ShadowSpaceAppActorProfile | null
    }
    channelId?: string | null
    resources?: ShadowSpaceAppResourceContext | null
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

export interface ShadowChannelLastMessagePreview {
  id: string
  content: string
  createdAt: string
  attachmentCount: number
  attachmentPreviews?: ShadowChannelAttachmentPreview[]
  author: Pick<ShadowUser, 'id' | 'username' | 'displayName'> | null
}

export interface ShadowChannelAttachmentPreview {
  id: string
  filename: string
  contentType: string
  kind: 'file' | 'image' | 'voice'
}

export interface ShadowChannelMemberPreview {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string | null
  lastSpokeAt: string | null
}

export interface ShadowChannel {
  id: string
  name: string
  type: string
  kind: 'server' | 'dm'
  serverId: string | null
  description?: string | null
  lastMessageAt?: string | null
  lastMessagePreview?: ShadowChannelLastMessagePreview | null
  memberPreviews?: ShadowChannelMemberPreview[]
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

export type ShadowServerWallpaperType = 'image' | 'html'

export interface ShadowServerDesktopLayoutWorkspaceItem {
  id: string
  kind: 'workspace-node'
  workspaceNodeId: string
  x: number
  y: number
  source?: 'workspace-root' | 'pinned'
  hidden?: boolean
}

export interface ShadowServerDesktopLayoutBuiltinAppItem {
  id: string
  kind: 'builtin-app'
  builtinKey: string
  title: string
  x: number
  y: number
  hidden?: boolean
}

export interface ShadowServerDesktopLayoutSpaceAppItem {
  id: string
  kind: 'space-app'
  appKey: string
  appId?: string
  title: string
  iconUrl?: string | null
  x: number
  y: number
  hidden?: boolean
}

export interface ShadowServerDesktopLayoutBuddyInboxItem {
  id: string
  kind: 'buddy-inbox'
  agentId: string
  channelId?: string | null
  title?: string
  x: number
  y: number
  hidden?: boolean
}

export type ShadowServerDesktopLayoutItem =
  | ShadowServerDesktopLayoutWorkspaceItem
  | ShadowServerDesktopLayoutBuiltinAppItem
  | ShadowServerDesktopLayoutSpaceAppItem
  | ShadowServerDesktopLayoutBuddyInboxItem

export interface ShadowServerDesktopStickyNoteWidget {
  id: string
  kind: 'sticky-note'
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  content: string
  updatedAt?: string
}

export type ShadowServerDesktopChatInputWidgetMode = 'chat' | 'tasks'

export interface ShadowServerDesktopChatInputWidget {
  id: string
  kind: 'chat-input'
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  defaultAgentId?: string | null
  inboxViewMode: ShadowServerDesktopChatInputWidgetMode
  placeholder?: string
  completionItems?: string[]
  updatedAt?: string
}

export type ShadowServerDesktopTypewriterWidgetFontFamily =
  | 'system'
  | 'serif'
  | 'mono'
  | 'handwriting'
export type ShadowServerDesktopTypewriterWidgetTextShadow = 'none' | 'soft' | 'glow' | 'strong'

export interface ShadowServerDesktopTypewriterWidget {
  id: string
  kind: 'typewriter'
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  content: string
  speedMs: number
  pauseMs: number
  loop: boolean
  cursor: boolean
  fontFamily: ShadowServerDesktopTypewriterWidgetFontFamily
  fontSize: number
  color: string
  textShadow: ShadowServerDesktopTypewriterWidgetTextShadow
  textStrokeWidth: number
  textStrokeColor: string
  updatedAt?: string
}

export type ShadowServerDesktopPhotoWidgetSourceType = 'url' | 'workspace-file'

export interface ShadowServerDesktopPhotoWidget {
  id: string
  kind: 'photo'
  sourceType: ShadowServerDesktopPhotoWidgetSourceType
  source: string
  x: number
  y: number
  zIndex?: number
  widthCells: number
  aspectRatio: number
  rotation: number
  title?: string
  workspaceFileName?: string | null
  updatedAt?: string
}

export type ShadowServerDesktopVideoWidgetProvider = 'bilibili' | 'youtube'

export interface ShadowServerDesktopVideoWidget {
  id: string
  kind: 'video-player'
  provider: ShadowServerDesktopVideoWidgetProvider
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  source: string
  title?: string
  coverUrl?: string | null
  autoplay?: boolean
  muted?: boolean
  danmaku?: boolean
  showCover?: boolean
  updatedAt?: string
}

export type ShadowServerDesktopWebEmbedWidgetSourceType = 'url' | 'workspace-file'

export interface ShadowServerDesktopWebEmbedWidget {
  id: string
  kind: 'web-embed'
  sourceType: ShadowServerDesktopWebEmbedWidgetSourceType
  source: string
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  title?: string
  workspaceFileName?: string | null
  updatedAt?: string
}

export interface ShadowServerDesktopRemoteWidget {
  id: string
  kind: 'remote-widget'
  sourceId: string
  options?: Record<string, string>
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  updatedAt?: string
}

export type ShadowServerDesktopWidget =
  | ShadowServerDesktopStickyNoteWidget
  | ShadowServerDesktopChatInputWidget
  | ShadowServerDesktopTypewriterWidget
  | ShadowServerDesktopPhotoWidget
  | ShadowServerDesktopVideoWidget
  | ShadowServerDesktopWebEmbedWidget
  | ShadowServerDesktopRemoteWidget

export interface ShadowServerDesktopLayout {
  version: 1 | 2
  items: ShadowServerDesktopLayoutItem[]
  widgets: ShadowServerDesktopWidget[]
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
  wallpaperType?: ShadowServerWallpaperType | null
  wallpaperUrl?: string | null
  wallpaperWorkspaceFileId?: string | null
  wallpaperInteractive?: boolean
  wallpaperUpdatedAt?: string | null
  desktopLayout?: ShadowServerDesktopLayout | null
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
  sourceSpaceAppId?: string | null
  sourceSpaceAppKey?: string | null
  sourceSpaceAppTopicKey?: string | null
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
  appSummaries?: ShadowSpaceAppSummary[]
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
  kind: 'server' | 'dm'
  topic?: string | null
  isPrivate?: boolean
  routeType: 'channel' | 'buddy-inbox'
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
  installationId: string | null
  deviceFingerprint: string | null
  name: string
  status: 'pending' | 'online' | 'offline'
  hostname: string | null
  os: string | null
  osVersion: string | null
  arch: string | null
  deviceClass: string | null
  deviceVendor: string | null
  deviceModel: string | null
  daemonVersion: string | null
  capabilities: string[]
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

export type PresenceChangePayload = SharedPresenceChangePayload
export type PresenceSnapshotPayload = SharedPresenceSnapshotPayload

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

export type ShadowCloudComputerShellColor =
  | 'aqua'
  | 'grape'
  | 'tangerine'
  | 'lime'
  | 'strawberry'
  | 'blueberry'
  | 'graphite'

export interface ShadowCloudComputer {
  id: string
  name: string
  status: ShadowCloudDeploymentStatus | string
  /** Total deployment execution units, including the Cloud Computer host. */
  agentCount: number
  /** User-visible Buddy accounts configured in this Cloud Computer. */
  buddyCount: number
  createdAt?: string | null
  updatedAt?: string | null
  lastActiveAt?: string | null
  errorMessage?: string | null
  capabilities: {
    files: boolean
    terminal: boolean
    browser: boolean
    desktop: boolean
    buddies: boolean
    backups: boolean
    connectors: boolean
    workspaceMounts: boolean
  }
  health: {
    state: 'ready' | 'preparing' | 'paused' | 'degraded' | 'failed'
    reason?: string | null
    message?: string | null
  }
  operation?: {
    kind: string
    stage: string
    progress: number
    cancellable: boolean
  } | null
  readiness: Record<
    string,
    {
      state: 'ready' | 'preparing' | 'paused' | 'repairable' | 'unavailable'
      reason?: string | null
      action?: string | null
    }
  >
  nextActions: string[]
  cost: { hourlyCredits: number; monthlyCredits: number | null }
  configuration: {
    resourceTier: 'lightweight' | 'standard' | 'pro'
    cpu: string
    memory: string
    storageGi: number
    pricingVersion: string
  }
  workspace: { persistent: boolean; mountPath: string }
  appearance: { shellColor: ShadowCloudComputerShellColor }
  /** Buddy requested atomically with Cloud Computer creation. */
  initialBuddy?: ShadowCloudComputerBuddy
}

export interface ShadowCloudComputerRuntime {
  id: string
  label: string
  description: string
  iconId: string
  adapterId: string
  version: string
  pluginId: string
  pluginVersion: string
  minimumResourceTier?: 'lightweight' | 'standard' | 'pro'
  supportsMultipleBuddies: boolean
  persistentState: boolean
  installed?: boolean
  status?: string
  installedAt?: string | null
}

export interface ShadowCloudComputerResourceProfile {
  id: 'lightweight' | 'standard' | 'pro'
  cpu: string
  memory: string
  storageGi: number
  baseHourlyCredits: number
  additionalBuddyCredits: number
  estimatedMonthlyCredits: number
}

export interface ShadowCloudComputerConfigurationQuote {
  quoteToken: string
  quote: {
    cloudComputerId: string
    resourceTier: 'lightweight' | 'standard' | 'pro'
    pricingVersion: string
    deploymentRevision: string
    buddyCount: number
    hourlyCredits: number
    monthlyCredits: number
    storageGi: number
    exp: number
  }
}

export interface ShadowCloudComputerApp {
  id: string
  appKey: string
  name: string
  status: string
  stableBaseUrl: string
  manifestUrl: string
  serverId: string
  sourcePath?: string | null
  currentReleaseId?: string | null
  updatedAt?: string | null
}

export interface ShadowCloudComputerAppsResponse {
  ok: true
  cloudComputerId: string
  apps: ShadowCloudComputerApp[]
}

export interface ShadowCloudComputerFilesUnavailable {
  ok: false
  code: 'cloud_computer_files_gateway_not_configured'
  error: string
}

export interface ShadowCreateCloudComputerInput {
  name?: string
  shellColor?: ShadowCloudComputerShellColor
  resourceTier?: 'lightweight' | 'standard' | 'pro'
  buddy?: ShadowCreateCloudComputerBuddyInput
}

export interface ShadowUpdateCloudComputerInput {
  name?: string
  shellColor?: ShadowCloudComputerShellColor
}

export interface ShadowCloudComputerLifecycleResponse {
  ok: boolean
  cloudComputerId: string
  status?: ShadowCloudDeploymentStatus | string
  error?: string
}

export interface ShadowCloudComputerConnectorOptionField {
  key: string
  type: 'string' | 'boolean' | 'number' | 'string-array'
  label: string
  description?: string
  defaultValue?: unknown
}

export interface ShadowCloudComputerConnector {
  id: string
  name: string
  description: string
  category: string
  icon: string
  iconDataUrl?: string
  iconSource?: {
    website: string
    sourceUrl: string | null
    sourceType: 'official-site' | 'official-favicon-cache' | 'generated-fallback'
    sha256: string
    visualBounds: { width: number; height: number; x: number; y: number }
  }
  website?: string
  docs?: string
  authType: 'oauth2' | 'api-key' | 'token' | 'basic' | 'none' | string
  capabilities: string[]
  tags: string[]
  popularity: number
  authFields: Array<{
    key: string
    label: string
    description?: string
    required: boolean
    sensitive: boolean
    placeholder?: string
    helpUrl?: string
  }>
  optionFields: ShadowCloudComputerConnectorOptionField[]
  oauth: {
    available: boolean
    configured: boolean
    scopes: string[]
  } | null
  connected: boolean
  status: 'available' | 'configured' | 'applying' | 'ready' | 'error'
  options: Record<string, unknown>
  lastError?: string | null
  account: {
    configured: true
    status: 'active' | 'invalid'
    authType: string
    fields: string[]
    accountId?: string | null
    accountName?: string | null
    avatarUrl?: string | null
    scopes: string[]
    lastVerifiedAt?: string | null
  } | null
}

export interface ShadowCloudComputerConnectorsResponse {
  ok: true
  cloudComputerId: string
  connectors: ShadowCloudComputerConnector[]
}

export interface ShadowConfigureCloudComputerConnectorInput {
  credentials?: Record<string, string>
  options?: Record<string, unknown>
}

export interface ShadowCloudComputerConnectorMutationResponse {
  ok: boolean
  cloudComputerId: string
  pluginId: string
  status: 'available' | 'configured' | 'applying' | 'ready' | 'error' | string
  deploymentId?: string | null
  verified?: boolean
  account?: Record<string, unknown> | null
}

export interface ShadowCloudComputerConnectorOAuthStartResponse {
  ok: true
  flowId: string
  authorizationUrl: string
  expiresAt: string
}

export interface ShadowCloudComputerConnectorOAuthFlowResponse {
  ok: true
  flow: {
    id: string
    pluginId: string
    cloudComputerId: string
    status: 'pending' | 'exchanging' | 'completed' | 'error' | 'expired'
    error?: string | null
    expiresAt: string
  }
}

export interface ShadowCreateCloudComputerBuddyInput {
  name: string
  description?: string
  avatarUrl?: string
  /** Existing Space to join with mention-only replies in its current channels. */
  serverId?: string
  runtimeId?: 'openclaw' | 'hermes' | 'claude-code' | 'codex' | 'opencode'
}

export interface ShadowCloudComputerBrowserPage {
  title: string
  url: string
}

export interface ShadowCloudComputerRepairResponse {
  ok: true
  component: 'browser' | 'desktop'
  cloudComputerId: string
  runtimeEnsured: boolean
  repairAvailable: boolean
  componentStatus: 'ensured' | 'repairable' | 'not-configured'
}

export interface ShadowCloudComputerRuntimeRepairResponse {
  ok?: boolean
  component: 'runtime'
  cloudComputerId: string
  recoveryAction: 'redeploy' | 'resume'
  status?: string
  error?: string
}

export interface ShadowCloudComputerRuntimeRebuildResponse {
  ok: true
  component: 'runtime'
  cloudComputerId: string
  recoveryAction: 'safe-rebuild'
  status: string
  detachedConnectors: number
  preservedWorkspace: boolean
}

export interface ShadowCloudComputerDesktopSession {
  ok: true
  token: string
  expiresAt: string
  websocketUrl: string
  runtimeEnsured?: boolean
  repairAvailable?: boolean
  componentStatus?: 'ensured' | 'repairable' | 'not-configured'
}

export interface ShadowCloudComputerBrowserSession {
  ok: true
  surface: 'cdp'
  token: string
  expiresAt: string
  cloudComputerId: string
  websocketUrl: string
  page: ShadowCloudComputerBrowserPage | null
  endpoints: {
    screenshot: string
    navigate: string
    click: string
    type: string
    key: string
  }
  runtimeEnsured?: boolean
  repairAvailable?: boolean
  componentStatus?: 'ensured' | 'repairable' | 'not-configured'
}

export interface ShadowCloudComputerBrowserCapture {
  ok: true
  image: string
  page: ShadowCloudComputerBrowserPage
}

export interface ShadowCreateCloudComputerWorkspaceMountInput {
  serverId: string
  rootId?: string | null
  mountPath?: string
  readOnly?: boolean
}

export interface ShadowCloudComputerWorkspaceMount {
  ok: true
  serverId: string
  serviceName: string
  mountPath: string
  webdavUrl: string
  mode: 'webdav'
  runtimeEnsured: boolean
}

export interface ShadowCreateCloudComputerBackupInput {
  agentId?: string
  driver?: 'volumeSnapshot' | 'restic'
  retentionDays?: number
  target?: {
    type: 'github'
    repository: string
    branch?: string
    pathPrefix?: string
    token?: string
    connectionId?: string
  }
}

export interface ShadowRestoreCloudComputerInput {
  agentId?: string
  backupId?: string
  target?: {
    type: 'github'
    connectionId?: string
    token?: string
  }
}

export interface ShadowCloudComputerBackupsResponse {
  cloudComputerId: string
  backups: ShadowCloudDeploymentBackup[]
}

export interface ShadowCloudComputerBuddy {
  id: string
  /** Provisioned Shadow Agent ID. Null while the Buddy is still being prepared. */
  agentId?: string | null
  name: string
  description?: string | null
  avatarUrl?: string | null
  status: string
  kernelType?: string | null
  lastHeartbeat?: string | null
  botUser?: {
    id?: string | null
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  owner?: {
    id?: string | null
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

export interface ShadowCloudComputerBuddiesResponse {
  ok: true
  cloudComputerId: string
  buddies: ShadowCloudComputerBuddy[]
}

export interface ShadowCloudComputerBuddyActionResponse {
  ok: true
  buddy: ShadowCloudComputerBuddy | null
}

export interface ShadowCloudComputerBuddyCreateResponse {
  ok: true
  cloudComputerId: string
  buddy: ShadowCloudComputerBuddy
  redeploy?: unknown
}

export interface ShadowCloudComputerBuddyRemoveResponse {
  ok: true
  cloudComputerId: string
  buddy: ShadowCloudComputerBuddy
  redeploy?: unknown
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

export type ShadowCloudExposureVisibility = 'private' | 'signed' | 'public'
export type ShadowCloudExposureKind = 'http_service' | 'space_app'
export type ShadowCloudAppReleaseMode = 'preview' | 'promoted' | 'installed'

export interface ShadowCloudExposurePolicy {
  rateLimit?: {
    requestsPerMinute?: number
    burst?: number
  }
  bodyLimitBytes?: number
  allowedMethods?: string[]
  allowIframe?: boolean
}

export interface ShadowCloudExposure {
  id: string
  deploymentId: string
  serverId?: string | null
  appInstanceId?: string | null
  appReleaseId?: string | null
  agentId: string
  localId: string
  source: string
  kind: ShadowCloudExposureKind | string
  releaseMode: ShadowCloudAppReleaseMode | string
  visibility: ShadowCloudExposureVisibility | string
  authMode: 'shadow_session' | 'signed_link' | 'space_app' | 'none' | string
  status: string
  host: string
  stableHost?: string | null
  publicBaseUrl: string
  manifestUrl?: string | null
  targetPort: number
  health?: Record<string, unknown> | null
  policy?: ShadowCloudExposurePolicy | null
  lastHeartbeatAt?: string | null
  leaseExpiresAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ShadowCloudRuntimeExposureRequest {
  id: string
  port: number
  kind?: ShadowCloudExposureKind
  displayName?: string
  visibility?: ShadowCloudExposureVisibility
  auth?: 'shadow_session' | 'signed_link' | 'space_app' | 'none'
  ttlSeconds?: number
  healthPath?: string
  appKey?: string
  manifestPath?: string
  policy?: ShadowCloudExposurePolicy
}

export interface ShadowCloudRuntimeExposureReconcileInput {
  deploymentId: string
  agentId: string
  desiredRevision?: string
  exposures: ShadowCloudRuntimeExposureRequest[]
}

export interface ShadowCloudRuntimeExposureReconcileResult {
  ok: boolean
  deploymentId: string
  agentId: string
  accepted: ShadowCloudExposure[]
  denied: Array<{ id: string; reason: string }>
  closed: ShadowCloudExposure[]
  status: { path: string; generatedAt: string }
}

export interface ShadowCloudAppInstance {
  id: string
  deploymentId: string
  serverId: string
  spaceAppInstallationId?: string | null
  agentId: string
  appKey: string
  name: string
  stableHost: string
  stableBaseUrl: string
  manifestUrl: string
  status: string
  currentReleaseId?: string | null
  currentExposureId?: string | null
  sourcePath?: string | null
  statePolicy: { paths?: string[]; backupOnPublish?: boolean; restoreStrategy?: string }
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ShadowCloudAppRelease {
  id: string
  appInstanceId: string
  exposureId?: string | null
  spaceAppInstallationId?: string | null
  version: string
  codeSha: string
  releaseMode: ShadowCloudAppReleaseMode | string
  status: string
  manifest: ShadowSpaceAppManifest
  manifestUrl: string
  sourcePath?: string | null
  artifactRef?: string | null
  metadata?: Record<string, unknown>
  activatedAt?: string | null
  createdAt: string
}

export interface ShadowCloudBackupComponent {
  id: string
  backupSetId: string
  componentKind: 'manifest' | 'release' | 'state' | string
  status: string
  refKind?: string | null
  refId?: string | null
  objectKey?: string | null
  path?: string | null
  checksum?: string | null
  sizeBytes?: number | null
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface ShadowCloudBackupSet {
  id: string
  appInstanceId: string
  releaseId?: string | null
  trigger: 'publish' | 'manual' | 'pre_restore' | string
  status: string
  manifestSnapshot?: ShadowSpaceAppManifest | Record<string, unknown> | null
  metadata?: Record<string, unknown>
  error?: string | null
  createdAt: string
  updatedAt: string
  components?: ShadowCloudBackupComponent[]
}

export interface ShadowCloudRestoreJob {
  id: string
  appInstanceId: string
  backupSetId: string
  safetyBackupSetId?: string | null
  strategy: 'in_place' | 'new_release' | string
  status: string
  phase: string
  error?: string | null
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ShadowCloudAppPublishInput {
  deploymentId: string
  agentId: string
  serverId: string
  port: number
  manifest?: ShadowSpaceAppManifest | Record<string, unknown>
  manifestUrl?: string
  appKey?: string
  sourcePath?: string
  statePaths?: string[]
  visibility?: ShadowCloudExposureVisibility
  releaseMode?: ShadowCloudAppReleaseMode
  install?: boolean
  defaultPermissions?: string[]
  defaultApprovalMode?: ShadowSpaceAppApprovalMode
  buddyGrants?: Array<{
    buddyAgentId: string
    permissions: string[]
    approvalMode?: ShadowSpaceAppApprovalMode
  }>
  backupOnPublish?: boolean
  backupPolicy?: {
    statePaths?: string[]
    schedule?: string
    retain?: number
    backupOnPublish?: boolean
    driver?: 'metadata' | 'volumeSnapshot' | 'restic' | 'git'
  }
  metadata?: Record<string, unknown>
}

export interface ShadowCloudAppPublishResult {
  ok: boolean
  appInstance: ShadowCloudAppInstance
  release: ShadowCloudAppRelease
  exposure: ShadowCloudExposure
  manifest: ShadowSpaceAppManifest
  installation?: ShadowSpaceAppInstallation | null
  grants?: unknown[]
  backupPolicy?: Record<string, unknown> | null
  backupSet?: ShadowCloudBackupSet | null
}

export interface ShadowCloudAppStatusResult {
  ok: boolean
  appInstance: ShadowCloudAppInstance
  exposure?: ShadowCloudExposure | null
  releases: ShadowCloudAppRelease[]
  backups: ShadowCloudBackupSet[]
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

export interface ShadowSpaceAppNotificationPreference {
  serverId: string
  serverName: string
  spaceAppId: string
  appKey: string
  appName: string
  appIconUrl: string | null
  topicKey: string
  title: string
  description: string | null
  enabled: boolean
  channels: ShadowSpaceAppNotificationChannel[]
  isDefault: boolean
}

export interface SpaceAppListChangedPayload {
  type: 'space_app.installed' | 'space_app.updated'
  serverId: string
  serverSlug?: string | null
  spaceAppId: string
  appKey: string
  appName: string
  manifestVersion?: string | null
  manifestHash?: string | null
  installedByKind: 'user' | 'pat' | 'oauth' | 'agent' | 'system'
  installedByUserId?: string | null
  timestamp: string
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
  'presence:snapshot': (payload: PresenceSnapshotPayload) => void
  'presence:activity': (payload: PresenceActivityPayload) => void
  'reaction:add': (payload: ReactionPayload) => void
  'reaction:remove': (payload: ReactionPayload) => void
  'poll:updated': (payload: { messageId: string; channelId: string }) => void
  'notification:new': (notification: ShadowNotification) => void
  'space-app:list-changed': (payload: SpaceAppListChangedPayload) => void
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
