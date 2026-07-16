import type { Place } from './places.js'

export type TravelMemberRole = 'owner' | 'planner' | 'traveler' | 'viewer'
export type TransportMode = 'walk' | 'metro' | 'train' | 'taxi' | 'flight'
export type ReservationKind = 'restaurant' | 'activity' | 'hotel' | 'transport'
export type ReservationStatus = 'pending' | 'confirmed' | 'shared'
export type ExpenseCategory = 'transport' | 'food' | 'activity' | 'stay' | 'shopping'
export type PackingVisibility = 'common' | 'personal' | 'shared'

export interface ShadowBootstrap {
  serverId?: string
  actor?: {
    id?: string | null
    userId?: string | null
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
    stableKey?: string | null
  }
  auth?: {
    authenticated?: boolean
    oauthAuthenticated?: boolean
    launchAuthenticated?: boolean
    oauthConfigured?: boolean
  }
  launch?: {
    channelId?: string | null
    spaceAppId?: string | null
  } | null
}

export interface TravelMember {
  id: string
  serverId?: string
  userId?: string
  displayName: string
  role: TravelMemberRole
  avatarUrl?: string
  avatarColor: string
  current?: boolean
  lastSeenLabel: string
}

export interface TransportSegment {
  id: string
  serverId?: string
  mode: TransportMode
  title: string
  fromPlaceId: string
  toPlaceId: string
  departureLabel: string
  arrivalLabel: string
  startAt?: string
  endAt?: string
  durationMinutes: number
  distanceKm: number
  provider: string
  serviceLabel?: string
  cost: number
  currency: string
  participantIds: string[]
  status: 'planned' | 'booked' | 'watching'
}

export interface ReservationRecord {
  id: string
  serverId?: string
  kind: ReservationKind
  title: string
  placeId: string
  status: ReservationStatus
  provider: string
  confirmationCode?: string
  startLabel: string
  endLabel?: string
  startAt?: string
  endAt?: string
  cost: number
  currency: string
  ownerId: string
  participantIds: string[]
  attachmentCount: number
  notes: string
}

export interface BudgetCategoryRecord {
  id: string
  category: ExpenseCategory
  budget: number
  spent: number
  currency: string
  placeIds: string[]
}

export interface ExpenseRecord {
  id: string
  serverId?: string
  title: string
  category: ExpenseCategory
  placeId: string
  placeServerId?: string
  reservationId?: string
  amount: number
  currency: string
  paidByMemberId: string
  participantIds: string[]
  paidMemberIds: string[]
  dateLabel: string
  note: string
}

export interface SettlementTransfer {
  id: string
  fromMemberId: string
  toMemberId: string
  amount: number
  currency: string
}

export interface PackingBagRecord {
  id: string
  serverId?: string
  name: string
  color: string
  ownerIds: string[]
  weightLimitKg: number
}

export interface PackingItemRecord {
  id: string
  serverId?: string
  bagId: string
  name: string
  category: string
  quantity: number
  packed: boolean
  ownerId: string
  recipientIds: string[]
  contributorIds: string[]
  visibility: PackingVisibility
  placeId?: string
}

export interface JourneyRecord {
  id: string
  serverId?: string
  dayId?: string
  dayNumber?: number
  cost: number
  currency: string
  kind: ReservationKind | TransportMode | 'meal'
  notes: string
  participantIds: string[]
  place: string
  placeId?: string
  placeServerId?: string
  source: 'booking' | 'plan' | 'transport'
  status: 'planned' | 'pending' | 'confirmed'
  time: string
  startAt?: string
  title: string
}

export interface TripManagementData {
  bootstrap: ShadowBootstrap | null
  places: Place[]
  members: TravelMember[]
  transports: TransportSegment[]
  reservations: ReservationRecord[]
  budgets: BudgetCategoryRecord[]
  expenses: ExpenseRecord[]
  packingBags: PackingBagRecord[]
  packingItems: PackingItemRecord[]
  journeyItems?: JourneyRecord[]
  days?: Array<{ id: string; date: string }>
}

export function calculateSettlement(expenses: ExpenseRecord[], members: TravelMember[]) {
  const balances = new Map(members.map((member) => [member.id, 0]))

  for (const expense of expenses) {
    const participants = expense.participantIds.length
      ? expense.participantIds
      : [expense.paidByMemberId]
    const share = expense.amount / participants.length
    balances.set(
      expense.paidByMemberId,
      (balances.get(expense.paidByMemberId) ?? 0) + expense.amount,
    )
    for (const memberId of participants) {
      balances.set(memberId, (balances.get(memberId) ?? 0) - share)
    }
  }

  const creditors = [...balances.entries()]
    .filter(([, amount]) => amount > 0.01)
    .sort((a, b) => b[1] - a[1])
  const debtors = [...balances.entries()]
    .filter(([, amount]) => amount < -0.01)
    .sort((a, b) => a[1] - b[1])
  const transfers: SettlementTransfer[] = []
  let creditorIndex = 0
  let debtorIndex = 0

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const [toMemberId, credit] = creditors[creditorIndex]!
    const [fromMemberId, debt] = debtors[debtorIndex]!
    const amount = Math.min(credit, Math.abs(debt))
    transfers.push({
      id: `settle-${fromMemberId}-${toMemberId}`,
      fromMemberId,
      toMemberId,
      amount,
      currency: 'EUR',
    })
    creditors[creditorIndex]![1] -= amount
    debtors[debtorIndex]![1] += amount
    if (creditors[creditorIndex]![1] <= 0.01) creditorIndex += 1
    if (Math.abs(debtors[debtorIndex]![1]) <= 0.01) debtorIndex += 1
  }

  return { balances, transfers }
}
