import { apiDelete, apiGet, apiPatch, apiPost } from '../../../services/api-client.js'
import type { Place, PlaceCategory } from './places.js'
import {
  type BudgetCategoryRecord,
  type ExpenseCategory,
  type ExpenseRecord,
  type JourneyRecord,
  type PackingBagRecord,
  type PackingItemRecord,
  type ReservationKind,
  type ReservationRecord,
  type TransportMode,
  type TransportSegment,
  type TravelMember,
  type TripManagementData,
} from './trip-management.js'

interface ServerMember {
  id: string
  userId?: string
  displayName: string
  role: TravelMember['role']
  avatarUrl?: string
  lastSeenAt?: string
}
interface ServerPlace {
  id: string
  title: string
  kind: string
  address?: string
  coordinates?: { lat: number; lng: number }
  externalRefs?: Record<string, unknown>
  photoRefs?: string[]
  costEstimate?: { amount: number; currency: string }
  notes?: string
}
interface ServerReservation {
  id: string
  kind: string
  title: string
  status: 'pending' | 'confirmed' | 'cancelled'
  provider?: string
  confirmationCode?: string
  startAt?: string
  endAt?: string
  locationPlaceId?: string
  participantMemberIds: string[]
  attachmentIds: string[]
  cost?: { amount: number; currency: string }
  rawImport?: Record<string, unknown>
  transportDetails?: Record<string, string>
  cancellationPolicy?: string
}
interface ServerExpense {
  id: string
  title: string
  category: string
  amount: number
  currency: string
  paidByMemberId?: string
  participantMemberIds: string[]
  paidMemberIds: string[]
  reservationId?: string
  placeId?: string
  date?: string
  notes?: string
}
interface ServerBag {
  id: string
  title: string
  ownerMemberId?: string
  memberIds: string[]
  color?: string
  capacityNote?: string
}
interface ServerPackingItem {
  id: string
  title: string
  category?: string
  assignedToMemberId?: string
  bagId?: string
  quantity: number
  packedByMemberIds: string[]
  contributorMemberIds: string[]
  status: 'needed' | 'packed' | 'skipped'
  notes?: string
}
interface ServerAssignment {
  id: string
  dayId?: string
  placeId?: string
  title: string
  startAt?: string
  participantMemberIds: string[]
  notes?: string
}
interface ServerBundle {
  members: ServerMember[]
  places: ServerPlace[]
  reservations: ServerReservation[]
  expenses: ServerExpense[]
  packingBags: ServerBag[]
  packingItems: ServerPackingItem[]
  assignments: ServerAssignment[]
  days: Array<{ id: string; date: string }>
}

function productData(value: string | undefined) {
  if (!value?.startsWith('product:')) return {}
  try {
    return JSON.parse(value.slice(8)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function legacyMemberId(member: ServerMember, index: number) {
  return member.role === 'owner' || index === 0 ? 'member-current' : member.id
}

function memberMaps(members: ServerMember[]) {
  const serverToLegacy = new Map<string, string>()
  const legacyToServer = new Map<string, string>()
  members.forEach((member, index) => {
    const legacy = legacyMemberId(member, index)
    serverToLegacy.set(member.id, legacy)
    legacyToServer.set(legacy, member.id)
  })
  return { serverToLegacy, legacyToServer }
}

function mapMember(member: ServerMember, index: number): TravelMember {
  const colors = ['#737842', '#ef5c49', '#2f7d9a', '#b26b39']
  return {
    id: legacyMemberId(member, index),
    serverId: member.id,
    userId: member.userId,
    displayName: member.displayName,
    role: member.role,
    avatarUrl: member.avatarUrl,
    avatarColor: colors[index % colors.length]!,
    current: index === 0,
    lastSeenLabel: member.lastSeenAt ?? '',
  }
}

function mapPlace(place: ServerPlace): Place {
  const refs = place.externalRefs ?? {}
  const legacyId = typeof refs.legacyId === 'string' ? refs.legacyId : place.id
  const photoUrl =
    typeof refs.photoUrl === 'string'
      ? refs.photoUrl
      : typeof place.photoRefs?.[0] === 'string'
        ? place.photoRefs[0]
        : ''
  return {
    id: legacyId,
    serverId: place.id,
    title: place.title,
    category:
      (refs.category as PlaceCategory | undefined) ??
      (place.kind === 'restaurant' ? 'Food' : place.kind === 'museum' ? 'Museums' : 'Sights'),
    address: place.address ?? '',
    meta: (refs.meta as string | undefined) ?? 'Saved',
    status: (refs.status as Place['status'] | undefined) ?? 'saved',
    statusLabel: (refs.statusLabel as string | undefined) ?? 'Saved',
    image: photoUrl,
    hero: typeof refs.heroUrl === 'string' ? refs.heroUrl : undefined,
    latitude: place.coordinates?.lat ?? 0,
    longitude: place.coordinates?.lng ?? 0,
    rating: typeof refs.rating === 'number' ? String(refs.rating) : undefined,
    hours: typeof refs.hours === 'string' ? refs.hours : undefined,
    cost: typeof refs.costLabel === 'string' ? refs.costLabel : undefined,
    costAmount: place.costEstimate?.amount,
    costCurrency: place.costEstimate?.currency,
    costUnitKey: typeof refs.costUnitKey === 'string' ? refs.costUnitKey : undefined,
    description: typeof refs.description === 'string' ? refs.description : undefined,
    notes: place.notes,
  }
}

function reservationKind(kind: string): ReservationKind {
  return kind === 'restaurant'
    ? 'restaurant'
    : kind === 'activity'
      ? 'activity'
      : kind === 'accommodation'
        ? 'hotel'
        : 'transport'
}
function expenseCategory(category: string): ExpenseCategory {
  return category === 'accommodation'
    ? 'stay'
    : category === 'food' ||
        category === 'transport' ||
        category === 'activity' ||
        category === 'shopping'
      ? category
      : 'shopping'
}

function mapBundle(
  bundle: ServerBundle,
  bootstrap: TripManagementData['bootstrap'],
): TripManagementData {
  const maps = memberMaps(bundle.members)
  const placeId = new Map(
    bundle.places.map((place) => [
      place.id,
      typeof place.externalRefs?.legacyId === 'string' ? place.externalRefs.legacyId : place.id,
    ]),
  )
  const normalReservations = bundle.reservations.filter(
    (item) => item.rawImport?.productKind !== 'transport',
  )
  const transports: TransportSegment[] = bundle.reservations
    .filter((item) => item.rawImport?.productKind === 'transport')
    .map((item) => ({
      id: (item.rawImport?.legacyId as string) ?? item.id,
      serverId: item.id,
      mode: (item.rawImport?.mode as TransportMode) ?? 'train',
      title: item.title,
      fromPlaceId: (item.rawImport?.fromPlaceId as string) ?? '',
      toPlaceId: (item.rawImport?.toPlaceId as string) ?? '',
      departureLabel: item.startAt ?? '',
      arrivalLabel: item.endAt ?? '',
      startAt: item.startAt,
      endAt: item.endAt,
      durationMinutes: Number(item.rawImport?.durationMinutes ?? 0),
      distanceKm: Number(item.rawImport?.distanceKm ?? 0),
      provider: item.provider ?? '',
      serviceLabel: item.transportDetails?.serviceNumber,
      cost: item.cost?.amount ?? 0,
      currency: item.cost?.currency ?? 'EUR',
      participantIds: item.participantMemberIds.map((id) => maps.serverToLegacy.get(id) ?? id),
      status: (item.rawImport?.status as TransportSegment['status']) ?? 'planned',
    }))
  const reservations: ReservationRecord[] = normalReservations.map((item) => ({
    id: (item.rawImport?.legacyId as string) ?? item.id,
    serverId: item.id,
    kind: reservationKind(item.kind),
    title: item.title,
    placeId: placeId.get(item.locationPlaceId ?? '') ?? '',
    status: item.status === 'pending' ? 'pending' : item.rawImport?.shared ? 'shared' : 'confirmed',
    provider: item.provider ?? '',
    confirmationCode: item.confirmationCode,
    startLabel: item.startAt ?? '',
    endLabel: item.endAt,
    startAt: item.startAt,
    endAt: item.endAt,
    cost: item.cost?.amount ?? 0,
    currency: item.cost?.currency ?? 'EUR',
    ownerId: (item.rawImport?.ownerId as string) ?? 'member-current',
    participantIds: item.participantMemberIds.map((id) => maps.serverToLegacy.get(id) ?? id),
    attachmentCount: item.attachmentIds.length,
    notes: item.cancellationPolicy ?? '',
  }))
  const expenses: ExpenseRecord[] = bundle.expenses.map((item) => ({
    id: item.id,
    serverId: item.id,
    title: item.title,
    category: expenseCategory(item.category),
    placeId: placeId.get(item.placeId ?? '') ?? '',
    placeServerId: item.placeId,
    reservationId: bundle.reservations.find((r) => r.id === item.reservationId)?.rawImport
      ?.legacyId as string | undefined,
    amount: item.amount,
    currency: item.currency,
    paidByMemberId: maps.serverToLegacy.get(item.paidByMemberId ?? '') ?? 'member-current',
    participantIds: item.participantMemberIds.map((id) => maps.serverToLegacy.get(id) ?? id),
    paidMemberIds: item.paidMemberIds.map((id) => maps.serverToLegacy.get(id) ?? id),
    dateLabel: item.date ?? '',
    note: item.notes ?? '',
  }))
  const packingBags: PackingBagRecord[] = bundle.packingBags.map((bag) => ({
    id: bag.id,
    serverId: bag.id,
    name: bag.title,
    color: bag.color ?? '#737842',
    ownerIds: bag.memberIds.map((id) => maps.serverToLegacy.get(id) ?? id),
    weightLimitKg: Number.parseFloat(bag.capacityNote ?? '0') || 0,
  }))
  const packingItems: PackingItemRecord[] = bundle.packingItems.map((item) => {
    const product = productData(item.notes)
    return {
      id: item.id,
      serverId: item.id,
      bagId: item.bagId ?? '',
      name: item.title,
      category: item.category ?? '',
      quantity: item.quantity,
      packed: item.status === 'packed',
      ownerId: maps.serverToLegacy.get(item.assignedToMemberId ?? '') ?? 'member-current',
      recipientIds: Array.isArray(product.recipientIds) ? (product.recipientIds as string[]) : [],
      contributorIds: item.contributorMemberIds.map((id) => maps.serverToLegacy.get(id) ?? id),
      visibility: (product.visibility as PackingItemRecord['visibility']) ?? 'shared',
      placeId: product.placeId as string | undefined,
    }
  })
  const journeyItems: JourneyRecord[] = bundle.assignments.flatMap((item) => {
    const product = productData(item.notes)
    if (product.productKind !== 'journey') return []
    return [
      {
        id: item.id,
        serverId: item.id,
        dayId: item.dayId,
        dayNumber: Number(product.dayNumber) || undefined,
        cost: Number(product.cost ?? 0),
        currency: String(product.currency ?? 'EUR'),
        kind: (product.kind as JourneyRecord['kind']) ?? 'activity',
        notes: String(product.notes ?? ''),
        participantIds: item.participantMemberIds.map((id) => maps.serverToLegacy.get(id) ?? id),
        place: String(product.place ?? ''),
        placeId: placeId.get(item.placeId ?? ''),
        placeServerId: item.placeId,
        source: 'plan' as const,
        status: (product.status as JourneyRecord['status']) ?? 'planned',
        time: item.startAt ?? '16:30',
        startAt: item.startAt,
        title: item.title,
      },
    ]
  })
  const totals = new Map<ExpenseCategory, number>()
  for (const item of expenses)
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount)
  const budgets: BudgetCategoryRecord[] = [...totals].map(([category, spent]) => ({
    id: `budget-${category}`,
    category,
    budget: Math.ceil(spent * 1.25),
    spent,
    currency: expenses.find((item) => item.category === category)?.currency ?? 'EUR',
    placeIds: expenses.filter((item) => item.category === category).map((item) => item.placeId),
  }))
  return {
    bootstrap,
    places: bundle.places.map(mapPlace),
    members: bundle.members.map(mapMember),
    transports,
    reservations,
    budgets,
    expenses,
    packingBags,
    packingItems,
    journeyItems,
    days: bundle.days,
  }
}

export async function fetchTripDomain(
  tripId: string,
  bootstrap?: TripManagementData['bootstrap'],
): Promise<TripManagementData> {
  const cacheKey = `travel:offline-trip:${tripId}`
  let bundle: ServerBundle
  try {
    bundle = await apiGet<ServerBundle>(`/api/trips/${encodeURIComponent(tripId)}`)
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), value: bundle }))
    } catch {
      // Offline persistence is best-effort and must never block a live trip.
    }
  } catch (error) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as {
        savedAt?: number
        value?: ServerBundle
      } | null
      if (cached?.value && Date.now() - (cached.savedAt ?? 0) < 14 * 24 * 60 * 60 * 1000) {
        bundle = cached.value
      } else throw error
    } catch {
      throw error
    }
  }
  return mapBundle(bundle, bootstrap ?? null)
}

export const tripDomainMutations = {
  createJourney: (
    tripId: string,
    item: JourneyRecord,
    input: { memberIds: string[]; placeServerId?: string },
  ) =>
    apiPost(`/api/trips/${tripId}/assignments`, {
      dayId: item.dayId,
      kind: ['flight', 'metro', 'taxi', 'train', 'transport', 'walk'].includes(item.kind)
        ? 'transport'
        : 'place',
      participantMemberIds: input.memberIds,
      placeId: input.placeServerId,
      startAt: item.time,
      status: 'scheduled',
      title: item.title,
      notes: `product:${JSON.stringify({ productKind: 'journey', cost: item.cost, currency: item.currency, dayNumber: item.dayNumber, kind: item.kind, notes: item.notes, place: item.place, status: item.status })}`,
    }),
  updateJourney: (
    tripId: string,
    item: JourneyRecord,
    input: { memberIds: string[]; placeServerId?: string },
  ) =>
    apiPatch(`/api/trips/${tripId}/assignments/${item.serverId ?? item.id}`, {
      dayId: item.dayId,
      kind: ['flight', 'metro', 'taxi', 'train', 'transport', 'walk'].includes(item.kind)
        ? 'transport'
        : 'place',
      participantMemberIds: input.memberIds,
      placeId: input.placeServerId,
      startAt: item.time,
      title: item.title,
      notes: `product:${JSON.stringify({ productKind: 'journey', cost: item.cost, currency: item.currency, dayNumber: item.dayNumber, kind: item.kind, notes: item.notes, place: item.place, status: item.status })}`,
    }),
  deleteJourney: (tripId: string, id: string) =>
    apiDelete(`/api/trips/${tripId}/assignments/${id}`),
  createExpense: (
    tripId: string,
    item: ExpenseRecord,
    input: { memberIds: string[]; payerId: string; placeServerId?: string },
  ) =>
    apiPost(`/api/trips/${tripId}/expenses`, {
      title: item.title,
      category: item.category === 'stay' ? 'accommodation' : item.category,
      amount: item.amount,
      currency: item.currency,
      paidByMemberId: input.payerId,
      participantMemberIds: input.memberIds,
      paidMemberIds: [],
      splitMode: 'equal',
      shares: [],
      placeId: input.placeServerId,
      notes: item.note,
      status: 'pending',
    }),
  deleteExpense: (tripId: string, id: string) => apiDelete(`/api/trips/${tripId}/expenses/${id}`),
  addMember: (
    tripId: string,
    input: { displayName: string; userId?: string; avatarUrl?: string },
  ) => apiPost(`/api/trips/${tripId}/members`, { ...input, role: 'traveler' }),
  updateMember: (
    tripId: string,
    memberId: string,
    patch: { displayName?: string; role?: TravelMember['role'] },
  ) => apiPatch(`/api/trips/${tripId}/members/${memberId}`, patch),
  removeMember: (tripId: string, memberId: string) =>
    apiDelete(`/api/trips/${tripId}/members/${memberId}`),
  updateReservation: (tripId: string, item: ReservationRecord) =>
    apiPatch(`/api/trips/${tripId}/reservations/${item.serverId ?? item.id}`, {
      participantMemberIds: item.participantIds,
    }),
  updateReservationDetails: (
    tripId: string,
    serverId: string,
    input: {
      title: string
      startAt: string
      notes: string
      participantMemberIds: string[]
      locationPlaceId?: string
    },
  ) =>
    apiPatch(`/api/trips/${tripId}/reservations/${serverId}`, {
      title: input.title,
      startAt: input.startAt,
      cancellationPolicy: input.notes,
      participantMemberIds: input.participantMemberIds,
      locationPlaceId: input.locationPlaceId,
    }),
  deleteReservation: (tripId: string, id: string) =>
    apiDelete(`/api/trips/${tripId}/reservations/${id}`),
  updateExpense: (tripId: string, item: ExpenseRecord) =>
    apiPatch(`/api/trips/${tripId}/expenses/${item.serverId ?? item.id}`, {
      title: item.title,
      amount: item.amount,
      category: item.category === 'stay' ? 'accommodation' : item.category,
      notes: item.note,
      placeId: item.placeServerId,
      participantMemberIds: item.participantIds,
      paidMemberIds: item.paidMemberIds,
    }),
  createBag: (tripId: string, input: Omit<PackingBagRecord, 'id'>) =>
    apiPost(`/api/trips/${tripId}/packing/bags`, {
      title: input.name,
      color: input.color,
      capacityNote: String(input.weightLimitKg),
      memberIds: input.ownerIds,
    }),
  updateBag: (tripId: string, item: PackingBagRecord) =>
    apiPatch(`/api/trips/${tripId}/packing/bags/${item.serverId ?? item.id}`, {
      title: item.name,
      color: item.color,
      capacityNote: String(item.weightLimitKg),
      memberIds: item.ownerIds,
    }),
  deleteBag: (tripId: string, id: string) => apiDelete(`/api/trips/${tripId}/packing/bags/${id}`),
  createItem: (tripId: string, input: Omit<PackingItemRecord, 'id'>) =>
    apiPost(`/api/trips/${tripId}/packing/items`, {
      title: input.name,
      category: input.category,
      assignedToMemberId: input.ownerId,
      bagId: input.bagId || undefined,
      quantity: input.quantity,
      contributorMemberIds: input.contributorIds,
      packedByMemberIds: input.packed ? [input.ownerId] : [],
      status: input.packed ? 'packed' : 'needed',
      notes: `product:${JSON.stringify({ recipientIds: input.recipientIds, visibility: input.visibility, placeId: input.placeId })}`,
    }),
  updateItem: (tripId: string, item: PackingItemRecord) =>
    apiPatch(`/api/trips/${tripId}/packing/items/${item.serverId ?? item.id}`, {
      title: item.name,
      category: item.category,
      assignedToMemberId: item.ownerId,
      bagId: item.bagId || undefined,
      quantity: item.quantity,
      contributorMemberIds: item.contributorIds,
      packedByMemberIds: item.packed ? [item.ownerId] : [],
      status: item.packed ? 'packed' : 'needed',
      notes: `product:${JSON.stringify({ recipientIds: item.recipientIds, visibility: item.visibility, placeId: item.placeId })}`,
    }),
  deleteItem: (tripId: string, id: string) => apiDelete(`/api/trips/${tripId}/packing/items/${id}`),
}
