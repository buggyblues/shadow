import { describe, expect, it } from 'vitest'
import type { TripManagementData } from '../client/features/plan/api/trip-management.js'
import {
  removeExpense,
  removeMember,
  removePackingBag,
  removePackingItem,
  removeTimelineItem,
} from '../client/features/plan/model/trip-domain-state.js'

function emptyTripDomain(): TripManagementData {
  return {
    bootstrap: null,
    budgets: [],
    expenses: [],
    members: [],
    packingBags: [],
    packingItems: [],
    places: [],
    reservations: [],
    transports: [],
  }
}

describe('trip domain optimistic deletion', () => {
  it('removes a timeline record from every possible timeline collection', () => {
    const data: TripManagementData = {
      ...emptyTripDomain(),
      journeyItems: [
        {
          cost: 0,
          currency: 'EUR',
          id: 'journey-local',
          kind: 'activity',
          notes: '',
          participantIds: [],
          place: 'Paris',
          serverId: 'journey-server',
          source: 'plan',
          status: 'planned',
          time: '09:00',
          title: 'Museum',
        },
      ],
      reservations: [
        {
          attachmentCount: 0,
          cost: 0,
          currency: 'EUR',
          id: 'reservation-local',
          kind: 'activity',
          notes: '',
          ownerId: 'member',
          participantIds: [],
          placeId: 'place',
          provider: '',
          serverId: 'reservation-server',
          startLabel: '09:00',
          status: 'confirmed',
          title: 'Ticket',
        },
      ],
    }

    expect(removeTimelineItem(data, 'journey-server').journeyItems).toEqual([])
    expect(removeTimelineItem(data, 'reservation-local').reservations).toEqual([])
  })

  it('removes list records by either client or server identity', () => {
    const data: TripManagementData = {
      ...emptyTripDomain(),
      expenses: [
        {
          amount: 10,
          category: 'food',
          currency: 'EUR',
          dateLabel: 'Day 1',
          id: 'expense-local',
          note: '',
          paidByMemberId: 'member',
          paidMemberIds: [],
          participantIds: ['member'],
          placeId: 'place',
          serverId: 'expense-server',
          title: 'Lunch',
        },
      ],
      members: [
        {
          avatarColor: '#000',
          displayName: 'Traveler',
          id: 'member-local',
          lastSeenLabel: '',
          role: 'traveler',
          serverId: 'member-server',
        },
      ],
      packingBags: [
        {
          color: '#000',
          id: 'bag-local',
          name: 'Carry-on',
          ownerIds: [],
          serverId: 'bag-server',
          weightLimitKg: 8,
        },
      ],
      packingItems: [
        {
          bagId: 'bag-local',
          category: 'documents',
          contributorIds: [],
          id: 'item-local',
          name: 'Passport',
          ownerId: 'member-local',
          packed: false,
          quantity: 1,
          recipientIds: [],
          serverId: 'item-server',
          visibility: 'personal',
        },
      ],
    }

    expect(removeExpense(data, 'expense-server').expenses).toEqual([])
    expect(removeMember(data, 'member-local').members).toEqual([])
    expect(removePackingBag(data, 'bag-server').packingBags).toEqual([])
    expect(removePackingItem(data, 'item-local').packingItems).toEqual([])
  })
})
