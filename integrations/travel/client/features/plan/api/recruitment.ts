import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../../services/api-client.js'

export type RecruitmentStatus = 'draft' | 'open' | 'paused' | 'filled' | 'closed'
export type JoinApplicationStatus =
  | 'pending'
  | 'needs_info'
  | 'waitlisted'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export interface TripRecruitment {
  id: string
  serverId: string
  tripId: string
  status: RecruitmentStatus
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
  createdAt: string
  updatedAt: string
}

export interface TripJoinApplication {
  id: string
  tripId: string
  recruitmentId: string
  applicantUserId: string
  applicantDisplayName: string
  applicantAvatarUrl?: string
  message?: string
  answers: Array<{ question: string; answer: string }>
  status: JoinApplicationStatus
  reviewNote?: string
  createdAt: string
  updatedAt: string
}

export interface RecruitmentListing {
  recruitment: TripRecruitment
  trip: {
    id: string
    title: string
    summary?: string
    coverPhotoUrl?: string
    startDate?: string
    endDate?: string
    destinationLabels: string[]
  }
  memberCount: number
  organizer?: { displayName: string; avatarUrl?: string }
  viewerApplication?: TripJoinApplication
  viewerIsMember: boolean
  matchScore?: number
  matchReasons: Array<'destination' | 'style' | 'flexible_dates' | 'dates' | 'budget'>
}

export interface UpsertRecruitmentInput {
  status?: RecruitmentStatus
  maxMembers?: number
  departureCity?: string
  flexibleDates?: boolean
  budgetMin?: number
  budgetMax?: number
  currency?: string
  styles?: string[]
  note?: string
  questions?: string[]
  requiresApproval?: boolean
  closesAt?: string
  recruitmentChannelId?: string
  memberChannelId?: string
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

export function listRecruitments() {
  return apiGet<RecruitmentListing[]>('/api/recruitments')
}

export function listTravelIntents() {
  return apiGet<TravelIntent[]>('/api/travel-intents')
}

export function upsertTravelIntent(input: {
  destinationLabels: string[]
  earliestDate?: string
  latestDate?: string
  flexibleDates: boolean
  budgetMax?: number
  currency: string
  styles: string[]
  note?: string
  status?: TravelIntent['status']
}) {
  return apiPut<TravelIntent>('/api/travel-intents/me', input)
}

export function closeTravelIntent() {
  return apiDelete<TravelIntent>('/api/travel-intents/me')
}

export function getTripRecruitment(tripId: string) {
  return apiGet<{ recruitment: TripRecruitment; applications: TripJoinApplication[] } | null>(
    `/api/trips/${encodeURIComponent(tripId)}/recruitment`,
  )
}

export function upsertTripRecruitment(tripId: string, input: UpsertRecruitmentInput) {
  return apiPut<TripRecruitment>(`/api/trips/${encodeURIComponent(tripId)}/recruitment`, input)
}

export function applyToRecruitment(
  recruitmentId: string,
  input: { message?: string; answers: Array<{ question: string; answer: string }> },
) {
  return apiPost<TripJoinApplication>(
    `/api/recruitments/${encodeURIComponent(recruitmentId)}/applications`,
    input,
  )
}

export function withdrawApplication(applicationId: string) {
  return apiPost<TripJoinApplication>(
    `/api/applications/${encodeURIComponent(applicationId)}/withdraw`,
  )
}

export function updateJoinApplication(
  applicationId: string,
  input: { message?: string; answers: Array<{ question: string; answer: string }> },
) {
  return apiPatch<TripJoinApplication>(
    `/api/applications/${encodeURIComponent(applicationId)}`,
    input,
  )
}

export function reviewApplication(
  tripId: string,
  applicationId: string,
  input: {
    status: Extract<JoinApplicationStatus, 'needs_info' | 'waitlisted' | 'approved' | 'rejected'>
    reviewNote?: string
  },
) {
  return apiPost<{ application: TripJoinApplication }>(
    `/api/trips/${encodeURIComponent(tripId)}/applications/${encodeURIComponent(applicationId)}/review`,
    input,
  )
}
