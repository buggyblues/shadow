import { apiDelete, apiGet, apiPatch, apiPost } from '../../../services/api-client.js'
import { getClientState, putClientState } from '../../../services/client-state-api.js'
import { resolveDestinationProfile } from './destination-knowledge.js'
import type { ShadowBootstrap, TravelMember } from './trip-management.js'

const travelCoverPlaceholder =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 640 360%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop stop-color=%22%23dce8df%22/%3E%3Cstop offset=%221%22 stop-color=%22%23f2e6d4%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22640%22 height=%22360%22 fill=%22url(%23g)%22/%3E%3Cg fill=%22none%22 stroke=%22%23fff%22 stroke-opacity=%22.72%22 stroke-width=%223%22%3E%3Cpath d=%22M-30 290C80 205 123 312 228 218S390 157 488 82 632 101 700 13%22/%3E%3Cpath d=%22M-18 205C91 126 161 226 257 140S425 105 541 22%22/%3E%3Cpath d=%22M18 366C110 278 183 353 296 271S486 228 664 113%22/%3E%3C/g%3E%3Ccircle cx=%22445%22 cy=%22117%22 r=%2218%22 fill=%22%23c84f43%22 stroke=%22%23fff%22 stroke-width=%226%22/%3E%3Ccircle cx=%22445%22 cy=%22117%22 r=%225%22 fill=%22%23fff%22/%3E%3C/svg%3E'

export type TravelTripStatus = 'planning' | 'active' | 'completed'

export interface TravelTripSummary {
  id: string
  title: string
  destination: string
  description?: string
  destinationCoordinates?: {
    latitude: number
    longitude: number
  }
  destinationPhoto?: string
  dateLabel: string
  startDate?: string
  endDate?: string
  status: TravelTripStatus
  coverImage: string
  coverAttachmentId?: string
  coverAttachmentName?: string
  memberIds: string[]
  placeCount: number
  reservationCount: number
  expenseTotal: number
  currency: string
  timezone?: string
  language?: string
  etiquetteNotes?: string[]
  tabooNotes?: string[]
  sharedAnnotations?: TravelTripAnnotation[]
  updatedLabel: string
}

export interface TravelTripAnnotation {
  id: string
  body: string
  authorName: string
  createdAt: string
  visibility: 'space' | 'public'
}

export interface TravelWorkspace {
  bootstrap: ShadowBootstrap | null
  members: TravelMember[]
  trips: TravelTripSummary[]
  currentTripId?: string
}

export interface CreateTravelTripInput {
  title: string
  destination: string
  destinationPhoto?: string
  destinationCoordinates?: {
    latitude: number
    longitude: number
  }
  placeId?: string
  startDate?: string
  endDate?: string
  timezone?: string
  currency?: string
  language?: string
  etiquetteNotes?: string[]
  tabooNotes?: string[]
}

export type UpdateTravelTripInput = Partial<
  Pick<
    TravelTripSummary,
    | 'coverAttachmentId'
    | 'coverAttachmentName'
    | 'coverImage'
    | 'currency'
    | 'dateLabel'
    | 'description'
    | 'destination'
    | 'destinationCoordinates'
    | 'destinationPhoto'
    | 'endDate'
    | 'etiquetteNotes'
    | 'language'
    | 'memberIds'
    | 'sharedAnnotations'
    | 'startDate'
    | 'tabooNotes'
    | 'timezone'
    | 'title'
    | 'updatedLabel'
  >
>

const workspaceChangedEvent = 'travel:workspace-changed'

async function fetchBootstrap() {
  try {
    return await apiGet<ShadowBootstrap>('/api/bootstrap')
  } catch {
    return null
  }
}

export function createCurrentActorMember(bootstrap: ShadowBootstrap | null): TravelMember[] {
  const actor = bootstrap?.actor
  const currentUserId = actor?.userId || actor?.id || actor?.stableKey
  const currentName = actor?.displayName || actor?.username
  if (!currentUserId || !currentName) return []
  return [
    {
      id: `member-space-${currentUserId}`,
      userId: currentUserId,
      displayName: currentName,
      role: 'owner',
      avatarUrl: actor?.avatarUrl ?? undefined,
      avatarColor: '#737842',
      current: true,
      lastSeenLabel: '',
    },
  ]
}

export interface SpaceMemberRef {
  id?: string
  userId?: string
  displayName?: string | null
  username?: string | null
  avatarUrl?: string | null
  role?: string
  kind?: string
  subjectKind?: string
  isBuddy?: boolean
  isBot?: boolean
}

export function normalizeSpaceMembers(bootstrap: ShadowBootstrap | null, source: SpaceMemberRef[]) {
  const currentActorMembers = createCurrentActorMember(bootstrap)
  const mappedMembers = source
    .filter(
      (member) =>
        !member.isBuddy &&
        !member.isBot &&
        member.subjectKind !== 'buddy' &&
        member.kind !== 'buddy',
    )
    .filter(
      (member) =>
        Boolean(member.userId ?? member.id) && Boolean(member.displayName ?? member.username),
    )
    .map<TravelMember>((member, index) => ({
      avatarColor: ['#737842', '#ef5c49', '#2f7d9a', '#b26b39'][index % 4]!,
      avatarUrl: member.avatarUrl ?? undefined,
      displayName: member.displayName || member.username!,
      id: `member-space-${member.userId ?? member.id}`,
      lastSeenLabel: '',
      role: member.role === 'owner' ? 'owner' : member.role === 'admin' ? 'planner' : 'traveler',
      userId: member.userId ?? member.id,
    }))
  if (!mappedMembers.length) return currentActorMembers
  const currentUserId =
    bootstrap?.actor?.userId || bootstrap?.actor?.id || bootstrap?.actor?.stableKey || ''
  const resolved = mappedMembers.map((member) => ({
    ...member,
    current: Boolean(currentUserId && member.userId === currentUserId),
  }))
  return resolved.some((member) => member.current)
    ? resolved
    : [...currentActorMembers, ...resolved]
}

export async function fetchTravelSpaceMembers(bootstrap: ShadowBootstrap | null) {
  const currentActorMembers = createCurrentActorMember(bootstrap)
  try {
    // Member data is durable application input, so it always travels through the
    // authenticated API. Bridge remains reserved for host UI actions.
    const response = await apiGet<{ members: SpaceMemberRef[] }>('/api/shadow/members', {
      excludeBuddies: true,
      humansOnly: true,
    })
    return normalizeSpaceMembers(bootstrap, response.members ?? [])
  } catch {
    return currentActorMembers
  }
}

function notifyWorkspaceChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(workspaceChangedEvent))
}

export function travelWorkspaceEventName() {
  return workspaceChangedEvent
}

interface ServerTrip {
  id: string
  title: string
  summary?: string
  coverPhotoUrl?: string
  status: 'draft' | 'planning' | 'active' | 'completed' | 'archived'
  timezone: string
  currency: string
  startDate?: string
  endDate?: string
  homeLocation?: string
  destinationLabels: string[]
  updatedAt: string
}

function dateLabel(startDate?: string, endDate?: string) {
  return startDate && endDate ? `${startDate} - ${endDate}` : 'Dates not set'
}

function serverTripInput(trip: TravelTripSummary) {
  return {
    currency: trip.currency,
    destinationLabels: [trip.destination],
    endDate: trip.endDate,
    homeLocation: trip.destination,
    startDate: trip.startDate,
    summary: trip.description,
    timezone: trip.timezone ?? 'UTC',
    title: trip.title,
  }
}

function mapServerTrip(
  trip: ServerTrip,
  _members: TravelMember[],
  ui: Partial<TravelTripSummary> = {},
): TravelTripSummary {
  const destination = trip.homeLocation ?? trip.destinationLabels[0] ?? ui.destination ?? ''
  const profile = resolveDestinationProfile(destination)
  return {
    id: trip.id,
    title: trip.title,
    destination,
    description: trip.summary,
    dateLabel: dateLabel(trip.startDate, trip.endDate),
    startDate: trip.startDate,
    endDate: trip.endDate,
    status:
      trip.status === 'active' || trip.status === 'completed' ? trip.status : ('planning' as const),
    coverImage: trip.coverPhotoUrl ?? ui.coverImage ?? travelCoverPlaceholder,
    destinationPhoto: trip.coverPhotoUrl ?? ui.destinationPhoto,
    memberIds: [],
    placeCount: ui.placeCount ?? 0,
    reservationCount: ui.reservationCount ?? 0,
    expenseTotal: ui.expenseTotal ?? 0,
    currency: trip.currency,
    etiquetteNotes: profile.etiquetteNotes,
    language: profile.language,
    sharedAnnotations: [],
    tabooNotes: profile.tabooNotes,
    timezone: trip.timezone,
    updatedLabel: new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
      -Math.max(0, Math.round((Date.now() - new Date(trip.updatedAt).getTime()) / 3_600_000)),
      'hour',
    ),
    ...ui,
  }
}

export async function fetchTravelWorkspace(): Promise<TravelWorkspace> {
  const [bootstrap, serverTrips, currentState] = await Promise.all([
    fetchBootstrap(),
    apiGet<ServerTrip[]>('/api/trips'),
    getClientState<string>('current-trip', { scope: 'user' }).catch(() => ({
      revision: 0,
      value: null,
    })),
  ])
  const members = createCurrentActorMember(bootstrap)
  const trips = await Promise.all(
    serverTrips.map(async (trip) => {
      const snapshot = await getClientState<Partial<TravelTripSummary>>('trip-summary', {
        scope: 'trip',
        tripId: trip.id,
      }).catch(() => ({ value: null }))
      return mapServerTrip(trip, members, snapshot.value ?? {})
    }),
  )
  const fallbackTripId = trips.find((trip) => trip.status === 'active')?.id ?? trips[0]?.id
  const currentTripId = trips.some((trip) => trip.id === currentState.value)
    ? (currentState.value ?? undefined)
    : fallbackTripId
  if (currentTripId && currentTripId !== currentState.value) {
    void putClientState('current-trip', {
      expectedRevision: currentState.revision,
      scope: 'user',
      value: currentTripId,
    }).catch(() => undefined)
  }
  return { bootstrap, currentTripId, members, trips }
}

export async function fetchTravelTripMemberIds(tripIds: string[]) {
  const entries = await Promise.all(
    tripIds.map(async (tripId) => {
      const tripMembers = await apiGet<Array<{ userId?: string }>>(
        `/api/trips/${encodeURIComponent(tripId)}/members`,
      ).catch(() => [])
      return [
        tripId,
        tripMembers.flatMap((member) => (member.userId ? [`member-space-${member.userId}`] : [])),
      ] as const
    }),
  )
  return Object.fromEntries(entries)
}

export async function selectTravelTrip(tripId: string) {
  await putClientState('current-trip', { scope: 'user', value: tripId })
  notifyWorkspaceChanged()
  return { tripId }
}

export async function createTravelTrip(input: CreateTravelTripInput) {
  const title = input.title.trim()
  const destination = input.destination.trim()
  const profile = resolveDestinationProfile(destination)
  const serverTrip = await apiPost<ServerTrip>('/api/trips', {
    currency: input.currency || profile.currency,
    destinationLabels: [destination || 'New destination'],
    endDate: input.endDate || undefined,
    homeLocation: destination || 'New destination',
    startDate: input.startDate || undefined,
    timezone: input.timezone ?? profile.timezone,
    title: title || 'Untitled trip',
  })
  const ui: Partial<TravelTripSummary> = {
    destinationCoordinates: input.destinationCoordinates,
    destinationPhoto: input.destinationPhoto,
    etiquetteNotes: input.etiquetteNotes ?? profile.etiquetteNotes,
    language: input.language ?? profile.language,
    sharedAnnotations: [],
    tabooNotes: input.tabooNotes ?? profile.tabooNotes,
  }
  await putClientState('trip-summary', { scope: 'trip', tripId: serverTrip.id, value: ui })
  await putClientState('current-trip', { scope: 'user', value: serverTrip.id })
  const trip = mapServerTrip(serverTrip, [], ui)
  notifyWorkspaceChanged()
  return trip
}

export async function updateTravelTrip(tripId: string, patch: UpdateTravelTripInput) {
  const currentUi = await getClientState<Partial<TravelTripSummary>>('trip-summary', {
    scope: 'trip',
    tripId,
  })
  const domainPatch = {
    currency: patch.currency,
    destinationLabels: patch.destination ? [patch.destination] : undefined,
    endDate: patch.endDate,
    homeLocation: patch.destination,
    startDate: patch.startDate,
    summary: patch.description,
    timezone: patch.timezone,
    title: patch.title,
  }
  const serverTrip = await apiPatch<ServerTrip>(
    `/api/trips/${encodeURIComponent(tripId)}`,
    domainPatch,
  )
  const ui = { ...(currentUi.value ?? {}), ...patch }
  await putClientState('trip-summary', {
    expectedRevision: currentUi.revision,
    scope: 'trip',
    tripId,
    value: ui,
  })
  const updatedTrip = mapServerTrip(serverTrip, [], ui)
  notifyWorkspaceChanged()
  return updatedTrip
}

export async function deleteTravelTrip(tripId: string) {
  await apiDelete(`/api/trips/${encodeURIComponent(tripId)}`)
  notifyWorkspaceChanged()
  return { tripId }
}
