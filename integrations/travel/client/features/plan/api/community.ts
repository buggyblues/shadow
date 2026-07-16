import { apiDelete, apiGet, apiPost } from '../../../services/api-client.js'

export interface CommunityBuddyInbox {
  agentId: string
  agentUserId?: string
  userId?: string
  channelId?: string
  username?: string
  displayName?: string
  avatarUrl?: string | null
  description?: string | null
}

export interface CommunityChannel {
  id: string
  name: string
  type?: string
}

export interface TripBuddyBinding {
  id: string
  tripId: string
  agentId: string
  agentUserId?: string
  displayName?: string
  status: 'active' | 'revoked'
  capabilities: string[]
  createdAt: string
  updatedAt: string
}

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
  status: 'draft' | 'proposed' | 'accepted' | 'rejected'
  operations: BuddyPlanOperation[]
  createdByAgentId?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TravelAutomationTask {
  id: string
  tripId: string
  source: 'buddy' | 'schedule' | 'manual' | 'provider'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  title: string
  input: Record<string, unknown>
  error?: string
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
  createdAt: string
  updatedAt: string
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

export function listCommunityBuddyInboxes() {
  return apiGet<{ inboxes: CommunityBuddyInbox[] }>('/api/shadow/inboxes')
}

export function listCommunityChannels() {
  return apiGet<{ channels: CommunityChannel[] }>('/api/shadow/channels')
}

export function listTripBuddyBindings(tripId: string) {
  return apiGet<TripBuddyBinding[]>(`/api/trips/${encodeURIComponent(tripId)}/buddy-bindings`)
}

export function bindTripBuddy(
  tripId: string,
  input: {
    agentId: string
    agentUserId?: string
    displayName?: string
    capabilities: string[]
  },
) {
  return apiPost<TripBuddyBinding>(`/api/trips/${encodeURIComponent(tripId)}/buddy-bindings`, input)
}

export function revokeTripBuddy(tripId: string, bindingId: string) {
  return apiDelete<TripBuddyBinding>(
    `/api/trips/${encodeURIComponent(tripId)}/buddy-bindings/${encodeURIComponent(bindingId)}`,
  )
}

export function dispatchBuddyPlan(
  tripId: string,
  input: { agentId: string; title: string; prompt: string; priority?: 'normal' | 'high' },
) {
  return apiPost(`/api/trips/${encodeURIComponent(tripId)}/buddy-plans/dispatch`, input)
}

export function listBuddyPlanDrafts(tripId: string) {
  return apiGet<BuddyPlanDraft[]>(`/api/trips/${encodeURIComponent(tripId)}/buddy-plans`)
}

export function listTravelAutomationTasks(tripId: string) {
  return apiGet<TravelAutomationTask[]>(`/api/trips/${encodeURIComponent(tripId)}/automation-tasks`)
}

export function reviewBuddyPlan(tripId: string, draftId: string, status: 'accepted' | 'rejected') {
  return apiPost<{ draft: BuddyPlanDraft; applied: Array<{ kind: string; id?: string }> }>(
    `/api/trips/${encodeURIComponent(tripId)}/buddy-plans/${encodeURIComponent(draftId)}/review`,
    { status },
  )
}

export function listCommunityShares(tripId: string) {
  return apiGet<CommunityShareRef[]>(`/api/trips/${encodeURIComponent(tripId)}/community-shares`)
}

export function shareTripToCommunity(tripId: string, channelId: string) {
  return apiPost<CommunityShareRef>(`/api/trips/${encodeURIComponent(tripId)}/community-shares`, {
    channelId,
    mode: 'live',
    allowedSections: ['overview', 'itinerary', 'map', 'bookings', 'budget', 'packing'],
  })
}

export function listDiscussionRefs(tripId: string) {
  return apiGet<DiscussionRef[]>(`/api/trips/${encodeURIComponent(tripId)}/discussion-refs`)
}

export function ensureCommunityChannel(input: {
  dedupeKey: string
  name: string
  topic?: string
  isPrivate?: boolean
  memberUserIds?: string[]
  syncMembers?: boolean
}) {
  return apiPost<{ channelId: string; created: boolean; name: string }>(
    '/api/shadow/channels/ensure',
    input,
  )
}

export function createCommunityPoll(input: {
  channelId: string
  question: string
  answers: string[]
  allowMultiselect?: boolean
  durationHours?: number
}) {
  return apiPost<{ channelId: string; messageId: string }>('/api/shadow/polls', input)
}

export function startDiscussion(
  tripId: string,
  input: {
    channelId?: string
    subjectType: string
    subjectId?: string
    title: string
    body?: string
  },
) {
  return apiPost<DiscussionRef>(`/api/trips/${encodeURIComponent(tripId)}/discussions`, input)
}
