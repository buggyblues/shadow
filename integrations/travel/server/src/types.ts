import type { Context } from 'hono'

export type TravelRole = 'owner' | 'planner' | 'traveler' | 'viewer'
export type TripStatus = 'draft' | 'planning' | 'active' | 'completed' | 'archived'
export type PlaceKind =
  | 'sight'
  | 'restaurant'
  | 'hotel'
  | 'transport'
  | 'activity'
  | 'shopping'
  | 'custom'
export type AssignmentKind = 'place' | 'reservation' | 'transport' | 'note' | 'free_time'
export type AssignmentStatus = 'idea' | 'scheduled' | 'done' | 'skipped'
export type ReservationKind =
  | 'accommodation'
  | 'flight'
  | 'train'
  | 'bus'
  | 'car'
  | 'ferry'
  | 'activity'
  | 'restaurant'
  | 'insurance'
  | 'other'
export type ExpenseCategory =
  | 'accommodation'
  | 'transport'
  | 'food'
  | 'activity'
  | 'shopping'
  | 'insurance'
  | 'other'
export type ExpenseStatus = 'pending' | 'settled' | 'waived'
export type PackingStatus = 'needed' | 'packed' | 'skipped'
export type ShareMode = 'readonly' | 'live' | 'public_summary'
export type AutomationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled'
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
export type TodoStatus = 'open' | 'done' | 'cancelled'
export type TodoPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TravelCategoryDomain = 'place' | 'todo' | 'packing' | 'expense'
export type CategoryAssigneeDomain = 'todo' | 'packing'
export type BackupKind = 'trip' | 'server'
export type BackupStatus = 'available' | 'restored' | 'superseded'
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'
export type SettlementStatus = 'draft' | 'confirmed' | 'cancelled'
export type PackingTemplateVisibility = 'private' | 'server'
export type AuditAction = 'api.write' | 'command.write'
export type ProviderSettingScope = 'user' | 'server'
export type SyncMutationStatus = 'queued' | 'applied' | 'conflict' | 'failed'
export type TripRecruitmentStatus = 'draft' | 'open' | 'paused' | 'filled' | 'closed'
export type TripJoinApplicationStatus =
  | 'pending'
  | 'needs_info'
  | 'waitlisted'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export interface Money {
  amount: number
  currency: string
}

export interface TravelCoordinates {
  lat: number
  lng: number
}

export interface ExternalRefs {
  googlePlaceId?: string
  osmId?: string
  provider?: string
  url?: string
  [key: string]: unknown
}

export interface ActorRef {
  kind: string
  id?: string | null
  userId?: string | null
  ownerId?: string | null
  buddyId?: string | null
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  subjectKind?: string | null
  stableKey?: string | null
}

export interface RequestAuth {
  authenticated: boolean
  launchAuthenticated: boolean
  oauthAuthenticated: boolean
  oauthConfigured: boolean
  oauthRequired: boolean
  reason?: string | null
}

export interface RequestContext {
  requestId: string
  serverId: string
  actor: ActorRef
  startedAt: string
  local: boolean
  auth: RequestAuth
  launch?: {
    spaceAppId?: string | null
    appKey?: string | null
    channelId?: string | null
    token?: string | null
  } | null
}

export interface TravelHonoEnv {
  Variables: {
    requestContext: RequestContext
  }
}

export type TravelContext = Context<TravelHonoEnv>

export interface Trip {
  id: string
  serverId: string
  title: string
  summary?: string
  coverImageRef?: string
  coverPhotoUrl?: string
  status: TripStatus
  timezone: string
  currency: string
  startDate?: string
  endDate?: string
  homeLocation?: string
  destinationLabels: string[]
  createdByMemberId: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export interface TripMember {
  id: string
  tripId: string
  userId?: string
  displayName: string
  role: TravelRole
  avatarUrl?: string
  email?: string
  invitedByMemberId?: string
  lastSeenAt?: string
  createdAt: string
  updatedAt: string
}

export interface TripGuest {
  id: string
  tripId: string
  displayName: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface TripInvite {
  id: string
  tripId: string
  tokenHash: string
  role: Exclude<TravelRole, 'owner'>
  invitedEmail?: string
  invitedUserId?: string
  message?: string
  status: InviteStatus
  createdByMemberId?: string
  acceptedByMemberId?: string
  expiresAt?: string
  revokedAt?: string
  acceptedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TripRecruitment {
  id: string
  serverId: string
  tripId: string
  status: TripRecruitmentStatus
  maxMembers: number
  departureCity?: string
  flexibleDates: boolean
  budgetMin?: number
  budgetMax?: number
  currency: string
  styles: string[]
  note?: string
  questions: string[]
  requiresApproval: boolean
  closesAt?: string
  recruitmentChannelId?: string
  memberChannelId?: string
  publishedByMemberId?: string
  createdAt: string
  updatedAt: string
}

export interface TripJoinApplication {
  id: string
  serverId: string
  tripId: string
  recruitmentId: string
  applicantUserId: string
  applicantDisplayName: string
  applicantAvatarUrl?: string
  message?: string
  answers: Array<{ question: string; answer: string }>
  status: TripJoinApplicationStatus
  reviewNote?: string
  reviewedByMemberId?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TravelIntent {
  id: string
  serverId: string
  userId: string
  displayName: string
  avatarUrl?: string
  destinationLabels: string[]
  earliestDate?: string
  latestDate?: string
  flexibleDates: boolean
  budgetMax?: number
  currency: string
  styles: string[]
  note?: string
  status: 'open' | 'matched' | 'closed'
  createdAt: string
  updatedAt: string
}

export interface TripDay {
  id: string
  tripId: string
  date: string
  title?: string
  timezone: string
  notes?: string
  weatherRef?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Place {
  id: string
  tripId: string
  title: string
  kind: PlaceKind
  address?: string
  coordinates?: TravelCoordinates
  externalRefs?: ExternalRefs
  costEstimate?: Money
  durationMinutes?: number
  links: string[]
  tags: string[]
  categoryId?: string
  photoRefs: string[]
  notes?: string
  savedByMemberId?: string
  createdAt: string
  updatedAt: string
}

export interface ItineraryAssignment {
  id: string
  tripId: string
  dayId?: string
  placeId?: string
  reservationId?: string
  expenseId?: string
  title: string
  kind: AssignmentKind
  startAt?: string
  endAt?: string
  timezone?: string
  sequence: number
  status: AssignmentStatus
  participantMemberIds: string[]
  notes?: string
  routeSegmentId?: string
  providerRefs?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Reservation {
  id: string
  tripId: string
  kind: ReservationKind
  title: string
  status: ReservationStatus
  provider?: string
  vendorUrl?: string
  confirmationCode?: string
  startAt?: string
  endAt?: string
  locationPlaceId?: string
  checkInDayId?: string
  checkOutDayId?: string
  sequence: number
  guestIds: string[]
  participantMemberIds: string[]
  passengerNames: string[]
  attachmentIds: string[]
  cost?: Money
  expenseId?: string
  transportDetails?: {
    carrier?: string
    serviceNumber?: string
    departurePlace?: string
    arrivalPlace?: string
    departureTerminal?: string
    arrivalTerminal?: string
    seat?: string
    cabin?: string
  }
  accommodationDetails?: {
    address?: string
    roomType?: string
    checkInTime?: string
    checkOutTime?: string
    nights?: number
  }
  contact?: {
    name?: string
    phone?: string
    email?: string
  }
  cancellationPolicy?: string
  rawImport?: Record<string, unknown>
  externalSource?: string
  externalId?: string
  externalOwnerUserId?: string
  externalHash?: string
  externalSyncedAt?: string
  syncEnabled?: boolean
  createdAt: string
  updatedAt: string
}

export interface ExpenseShare {
  memberId: string
  amount: number
}

export interface Expense {
  id: string
  tripId: string
  title: string
  category: ExpenseCategory
  amount: number
  currency: string
  paidByMemberId?: string
  participantMemberIds: string[]
  splitMode: 'equal' | 'custom' | 'paid_by_one'
  shares: ExpenseShare[]
  paidMemberIds: string[]
  reservationId?: string
  placeId?: string
  date?: string
  notes?: string
  originalAmount?: number
  originalCurrency?: string
  exchangeRate?: number
  exchangeRateDate?: string
  status: ExpenseStatus
  sequence: number
  createdAt: string
  updatedAt: string
}

export interface SettlementTransfer {
  fromMemberId: string
  toMemberId: string
  amount: number
}

export interface SettlementBalance {
  memberId: string
  amount: number
}

export interface SettlementRecord {
  id: string
  tripId: string
  currency: string
  balances: SettlementBalance[]
  transfers: SettlementTransfer[]
  status: SettlementStatus
  notes?: string
  createdByMemberId?: string
  createdAt: string
  updatedAt: string
  confirmedAt?: string
  cancelledAt?: string
  paidTransferIds: string[]
}

export interface PackingBag {
  id: string
  tripId: string
  title: string
  ownerMemberId?: string
  memberIds: string[]
  color?: string
  capacityNote?: string
  createdAt: string
  updatedAt: string
}

export interface PackingItem {
  id: string
  tripId: string
  title: string
  category?: string
  assignedToMemberId?: string
  bagId?: string
  quantity: number
  packedByMemberIds: string[]
  contributorMemberIds: string[]
  status: PackingStatus
  sequence: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface PackingTemplateItem {
  title: string
  category?: string
  quantity: number
  notes?: string
}

export interface PackingTemplate {
  id: string
  serverId: string
  ownerUserId?: string
  sourceTripId?: string
  title: string
  description?: string
  destinationTags: string[]
  season?: string
  visibility: PackingTemplateVisibility
  items: PackingTemplateItem[]
  createdAt: string
  updatedAt: string
}

export interface CategoryAssignee {
  id: string
  tripId: string
  domain: CategoryAssigneeDomain
  category: string
  memberIds: string[]
  updatedAt: string
}

export interface TodoItem {
  id: string
  tripId: string
  title: string
  category?: string
  description?: string
  dueDate?: string
  assignedToMemberId?: string
  priority: TodoPriority
  status: TodoStatus
  sequence: number
  completedAt?: string
  createdByMemberId?: string
  createdAt: string
  updatedAt: string
}

export interface TravelTag {
  id: string
  serverId: string
  ownerUserId?: string
  name: string
  color?: string
  createdAt: string
  updatedAt: string
}

export interface TravelCategory {
  id: string
  serverId: string
  ownerUserId?: string
  domain: TravelCategoryDomain
  name: string
  color?: string
  icon?: string
  createdAt: string
  updatedAt: string
}

export interface TripSettings {
  tripId: string
  distanceUnit: 'km' | 'mi'
  temperatureUnit: 'c' | 'f'
  weekStartsOn: 0 | 1 | 6
  defaultShareSections: string[]
  notificationLeadHours: number[]
  updatedAt: string
}

export interface ProviderSetting {
  id: string
  serverId: string
  ownerUserId?: string
  scope: ProviderSettingScope
  key: string
  value: string
  encrypted: boolean
  secret: boolean
  updatedAt: string
}

export interface ProviderCacheEntry {
  id: string
  serverId: string
  key: string
  provider: string
  value: Record<string, unknown>
  expiresAt: string
  staleAt?: string
  updatedAt: string
}

export interface RouteSegment {
  id: string
  tripId: string
  dayId?: string
  mode: 'driving' | 'walking' | 'cycling' | 'transit'
  source: string
  assignmentIds: string[]
  distanceMeters?: number
  durationSeconds?: number
  coordinates: TravelCoordinates[]
  legs: Array<Record<string, unknown>>
  optimized?: boolean
  createdAt: string
  updatedAt: string
}

export interface TripPhotoRef {
  id: string
  tripId: string
  provider: 'immich' | 'synologyphotos' | 'local' | 'place-photo' | string
  assetId: string
  ownerUserId?: string
  subjectType?: 'trip' | 'day' | 'place' | 'reservation' | 'assignment'
  subjectId?: string
  mediaType?: 'image' | 'video'
  takenAt?: string
  coordinates?: TravelCoordinates
  thumbnailUrl?: string
  originalUrl?: string
  metadata?: Record<string, unknown>
  createdByMemberId?: string
  createdAt: string
}

export interface SyncMutation {
  id: string
  tripId: string
  entityType: 'place' | 'assignment' | 'reservation' | 'expense' | 'packing_item' | 'todo' | 'day'
  entityId?: string
  action: 'create' | 'update' | 'delete'
  baseUpdatedAt?: string
  payload: Record<string, unknown>
  status: SyncMutationStatus
  conflict?: {
    reason: string
    serverUpdatedAt?: string
    serverValue?: Record<string, unknown>
  }
  result?: Record<string, unknown>
  createdByMemberId?: string
  createdAt: string
  updatedAt: string
}

export interface AttachmentRef {
  id: string
  tripId: string
  subjectType: 'trip' | 'place' | 'reservation' | 'expense' | 'packing_item' | 'day'
  subjectId?: string
  workspaceNodeId?: string
  fileName: string
  mimeType?: string
  sizeBytes?: number
  label?: string
  createdByMemberId?: string
  createdAt: string
  contentBase64?: string
}

export interface ShareLink {
  id: string
  tripId: string
  tokenHash: string
  mode: ShareMode
  allowedSections: string[]
  expiresAt?: string
  createdByMemberId?: string
  revokedAt?: string
  createdAt: string
}

export interface DiscussionRef {
  id: string
  tripId: string
  channelId?: string
  messageId: string
  subjectType: string
  subjectId?: string
  title?: string
  createdAt: string
}

export interface DecisionRef {
  id: string
  tripId: string
  decision: string
  subjectType?: string
  subjectId?: string
  messageId?: string
  status: 'proposed' | 'accepted' | 'superseded'
  decidedByMemberId?: string
  createdAt: string
}

export interface ImportJob {
  id: string
  tripId: string
  kind: ReservationKind | 'mixed'
  status: AutomationStatus
  source: 'email' | 'file' | 'manual' | 'provider'
  parsedPayload?: Record<string, unknown>
  error?: string
  createdAt: string
  updatedAt: string
}

export interface AutomationTask {
  id: string
  tripId: string
  source: 'buddy' | 'schedule' | 'manual' | 'provider'
  status: AutomationStatus
  title: string
  input: Record<string, unknown>
  result?: Record<string, unknown>
  shadowDelivery?: {
    messageId?: string
    cardId?: string | null
    taskId?: string | null
    pendingId?: string | null
    agentId?: string
    idempotencyKey?: string
  }
  error?: string
  createdAt: string
  updatedAt: string
}

export interface TravelAppAccount {
  id: string
  primaryShadowUserId: string
  displayName?: string
  username?: string
  avatarUrl?: string
  createdAt: string
  updatedAt: string
}

export interface TravelIdentityLink {
  id: string
  accountId: string
  shadowUserId: string
  username?: string
  createdAt: string
  lastSeenAt: string
}

export interface TravelAppSession {
  id: string
  accountId: string
  tokenHash: string
  scope: string
  authSource?: 'launch' | 'oauth'
  serverId?: string
  spaceAppId?: string
  appKey?: string
  channelId?: string
  actorKind?: string
  actorUserId?: string
  buddyAgentId?: string
  ownerId?: string
  launchTokenEncrypted?: string
  launchExpiresAt?: string
  oauthAccessTokenEncrypted?: string
  oauthAccessTokenExpiresAt?: string
  expiresAt: string
  createdAt: string
  lastSeenAt: string
  revokedAt?: string
}

export interface TripBuddyBinding {
  id: string
  tripId: string
  agentId: string
  agentUserId?: string
  displayName?: string
  status: 'active' | 'revoked'
  capabilities: string[]
  createdByMemberId?: string
  createdAt: string
  updatedAt: string
}

export type BuddyPlanDraftStatus = 'draft' | 'proposed' | 'accepted' | 'rejected'

export interface BuddyPlanOperation {
  kind: 'place.create' | 'assignment.create' | 'reservation.create' | 'todo.create' | 'note'
  input: Record<string, unknown>
}

export interface BuddyPlanDraft {
  id: string
  tripId: string
  automationTaskId?: string
  title: string
  summary?: string
  status: BuddyPlanDraftStatus
  operations: BuddyPlanOperation[]
  createdByAgentId?: string
  createdByUserId?: string
  reviewedByMemberId?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface CommunityShareRef {
  id: string
  tripId: string
  channelId: string
  messageId?: string
  mode: 'snapshot' | 'live'
  allowedSections: string[]
  status: 'pending' | 'shared' | 'failed' | 'revoked'
  idempotencyKey: string
  createdByMemberId?: string
  createdAt: string
  updatedAt: string
}

export interface TravelBackup {
  id: string
  serverId: string
  tripId?: string
  kind: BackupKind
  status: BackupStatus
  label?: string
  snapshot: Record<string, unknown>
  createdByMemberId?: string
  createdAt: string
  restoredAt?: string
}

export interface TravelNotification {
  id: string
  serverId: string
  tripId?: string
  title: string
  body?: string
  level: NotificationLevel
  subjectType?: string
  subjectId?: string
  readByMemberIds: string[]
  createdAt: string
}

export type ClientStateScope = 'global' | 'trip' | 'user'

export interface ClientStateRecord {
  id: string
  serverId: string
  scope: ClientStateScope
  key: string
  ownerUserId?: string
  tripId?: string
  value: unknown
  revision: number
  updatedAt: string
}

export interface EmergencyReport {
  id: string
  serverId: string
  title: string
  category: 'weather' | 'transport' | 'safety' | 'crowd' | 'facility'
  severity: 'urgent' | 'high' | 'medium'
  latitude: number
  longitude: number
  affectedTripIds: string[]
  journeyItemIds: string[]
  participantMemberIds: string[]
  reporterUserId: string
  createdAt: string
  expiresAt: string
  status: 'active' | 'ended' | 'removed'
  removalVoteUserIds: string[]
  endedAt?: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  serverId: string
  tripId?: string
  action: AuditAction
  method: string
  path: string
  statusCode: number
  requestId: string
  actor: ActorRef
  subjectType?: string
  subjectId?: string
  createdAt: string
}

export interface TravelState {
  schemaVersion: number
  updatedAt: string
  trips: Trip[]
  members: TripMember[]
  guests: TripGuest[]
  invites: TripInvite[]
  recruitments: TripRecruitment[]
  joinApplications: TripJoinApplication[]
  travelIntents: TravelIntent[]
  days: TripDay[]
  places: Place[]
  assignments: ItineraryAssignment[]
  reservations: Reservation[]
  expenses: Expense[]
  settlementRecords: SettlementRecord[]
  packingBags: PackingBag[]
  packingItems: PackingItem[]
  packingTemplates: PackingTemplate[]
  categoryAssignees: CategoryAssignee[]
  todos: TodoItem[]
  tags: TravelTag[]
  categories: TravelCategory[]
  tripSettings: TripSettings[]
  providerSettings: ProviderSetting[]
  providerCache: ProviderCacheEntry[]
  routeSegments: RouteSegment[]
  tripPhotoRefs: TripPhotoRef[]
  syncMutations: SyncMutation[]
  attachments: AttachmentRef[]
  shareLinks: ShareLink[]
  discussionRefs: DiscussionRef[]
  decisionRefs: DecisionRef[]
  importJobs: ImportJob[]
  automationTasks: AutomationTask[]
  appAccounts: TravelAppAccount[]
  identityLinks: TravelIdentityLink[]
  appSessions: TravelAppSession[]
  tripBuddyBindings: TripBuddyBinding[]
  buddyPlanDrafts: BuddyPlanDraft[]
  communityShareRefs: CommunityShareRef[]
  backups: TravelBackup[]
  notifications: TravelNotification[]
  clientStates: ClientStateRecord[]
  emergencyReports: EmergencyReport[]
  auditLogs: AuditLog[]
}

export interface TravelEvent {
  id: string
  sequence: number
  type: string
  tripId?: string
  payload: Record<string, unknown>
  emittedAt: string
}
