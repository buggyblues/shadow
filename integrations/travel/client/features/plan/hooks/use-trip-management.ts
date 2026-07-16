import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchTripDomain, tripDomainMutations } from '../api/trip-domain.js'
import {
  calculateSettlement,
  type ExpenseRecord,
  type JourneyRecord,
  type PackingBagRecord,
  type PackingItemRecord,
  type TripManagementData,
} from '../api/trip-management.js'
import {
  removeExpense,
  removeMember,
  removePackingBag,
  removePackingItem,
  removeTimelineItem,
} from '../model/trip-domain-state.js'
import { useTravelWorkspace } from './use-travel-workspace.js'

function toggleId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]
}

function cycleOwner(currentOwnerId: string, memberIds: string[]) {
  const currentIndex = memberIds.indexOf(currentOwnerId)
  return memberIds[currentIndex >= 0 ? (currentIndex + 1) % memberIds.length : 0] ?? currentOwnerId
}

export function useTripManagement() {
  const workspace = useTravelWorkspace()
  const queryClient = useQueryClient()
  const tripId = workspace.currentTrip?.id
  const queryKey = ['travel', 'trip-domain', tripId]
  const query = useQuery({
    enabled: Boolean(tripId),
    queryFn: () => fetchTripDomain(tripId!, workspace.bootstrap),
    queryKey,
    staleTime: 15_000,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const members = query.data?.members ?? []
  const memberIds = members.map((member) => member.id)
  const serverMemberId = (id: string) => members.find((member) => member.id === id)?.serverId ?? id
  const settlement = useMemo(
    () => calculateSettlement(query.data?.expenses ?? [], members),
    [members, query.data?.expenses],
  )
  const run = async (operation: Promise<unknown>) => {
    try {
      const result = await operation
      await refresh()
      return result
    } catch (error) {
      await refresh()
      throw error
    }
  }
  const runOptimistic = async (
    operation: () => Promise<unknown>,
    update: (current: TripManagementData) => TripManagementData,
  ) => {
    const cancellation = queryClient.cancelQueries({ queryKey }, { revert: false })
    const previous = queryClient.getQueryData<TripManagementData>(queryKey)
    if (previous) queryClient.setQueryData<TripManagementData>(queryKey, update(previous))
    await cancellation
    try {
      const result = await operation()
      await refresh()
      return result
    } catch (error) {
      if (previous) queryClient.setQueryData<TripManagementData>(queryKey, previous)
      await refresh()
      throw error
    }
  }

  return {
    ...query,
    tripId,
    syncStatus: query.isFetching
      ? ('saving' as const)
      : query.isError
        ? ('error' as const)
        : ('saved' as const),
    data: query.data ? { ...query.data, settlement } : undefined,
    addJourney: (item: JourneyRecord) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      const place = query.data?.places.find((candidate) => candidate.id === item.placeId)
      return run(
        tripDomainMutations.createJourney(tripId, item, {
          memberIds: item.participantIds.map(serverMemberId),
          placeServerId: item.placeServerId ?? place?.serverId,
        }),
      )
    },
    updateJourney: (item: JourneyRecord) => {
      if (!tripId) return
      const place = query.data?.places.find((candidate) => candidate.id === item.placeId)
      void run(
        tripDomainMutations.updateJourney(tripId, item, {
          memberIds: item.participantIds.map(serverMemberId),
          placeServerId: item.placeServerId ?? place?.serverId,
        }),
      )
    },
    deleteJourney: (id: string) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return runOptimistic(
        () => tripDomainMutations.deleteJourney(tripId, id),
        (current) => removeTimelineItem(current, id),
      )
    },
    deleteTimelineItem: (id: string) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      const reservation = query.data?.reservations.find((item) => item.id === id)
      const transport = query.data?.transports.find((item) => item.id === id)
      const serverId = (reservation ?? transport)?.serverId ?? id
      return runOptimistic(
        () =>
          reservation || transport
            ? tripDomainMutations.deleteReservation(tripId, serverId)
            : tripDomainMutations.deleteJourney(tripId, id),
        (current) => removeTimelineItem(current, id),
      )
    },
    updateTimelineItem: (item: JourneyRecord) => {
      if (!tripId) return
      const reservation = query.data?.reservations.find((candidate) => candidate.id === item.id)
      const transport = query.data?.transports.find((candidate) => candidate.id === item.id)
      const place = query.data?.places.find((candidate) => candidate.id === item.placeId)
      if (reservation || transport)
        void run(
          tripDomainMutations.updateReservationDetails(
            tripId,
            (reservation ?? transport)!.serverId ?? item.id,
            {
              title: item.title,
              startAt: item.time,
              notes: item.notes,
              participantMemberIds: item.participantIds.map(serverMemberId),
              locationPlaceId: item.placeServerId ?? place?.serverId,
            },
          ),
        )
      else
        void run(
          tripDomainMutations.updateJourney(tripId, item, {
            memberIds: item.participantIds.map(serverMemberId),
            placeServerId: place?.serverId,
          }),
        )
    },
    addExpense: (item: ExpenseRecord) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      const place = query.data?.places.find((candidate) => candidate.id === item.placeId)
      return run(
        tripDomainMutations.createExpense(tripId, item, {
          memberIds: item.participantIds.map(serverMemberId),
          payerId: serverMemberId(item.paidByMemberId),
          placeServerId: item.placeServerId ?? place?.serverId,
        }),
      )
    },
    updateExpense: (item: ExpenseRecord) => {
      if (tripId) {
        const place = query.data?.places.find((candidate) => candidate.id === item.placeId)
        void run(
          tripDomainMutations.updateExpense(tripId, {
            ...item,
            placeServerId: item.placeServerId ?? place?.serverId,
            participantIds: item.participantIds.map(serverMemberId),
            paidMemberIds: item.paidMemberIds.map(serverMemberId),
          }),
        )
      }
    },
    deleteExpense: (id: string) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return runOptimistic(
        () => tripDomainMutations.deleteExpense(tripId, id),
        (current) => removeExpense(current, id),
      )
    },
    addMember: (name: string) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return run(tripDomainMutations.addMember(tripId, { displayName: name }))
    },
    addCommunityMember: (member: { displayName: string; userId?: string; avatarUrl?: string }) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return run(tripDomainMutations.addMember(tripId, member))
    },
    updateMember: (
      id: string,
      patch: { displayName?: string; role?: (typeof members)[number]['role'] },
    ) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return run(tripDomainMutations.updateMember(tripId, serverMemberId(id), patch))
    },
    removeMember: (id: string) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return runOptimistic(
        () => tripDomainMutations.removeMember(tripId, serverMemberId(id)),
        (current) => removeMember(current, id),
      )
    },
    addPackingBag: (input: Omit<PackingBagRecord, 'id'>) => {
      if (!tripId) return
      void run(
        tripDomainMutations.createBag(tripId, {
          ...input,
          ownerIds: input.ownerIds.map(serverMemberId),
        }),
      )
    },
    addPackingItem: (input: Omit<PackingItemRecord, 'id'>) => {
      if (!tripId) return
      void run(
        tripDomainMutations.createItem(tripId, {
          ...input,
          ownerId: serverMemberId(input.ownerId),
          contributorIds: input.contributorIds.map(serverMemberId),
        }),
      )
    },
    updatePackingBag: (bagId: string, patch: Partial<PackingBagRecord>) => {
      if (!tripId) return
      const bag = query.data?.packingBags.find((candidate) => candidate.id === bagId)
      if (!bag) return
      const next = { ...bag, ...patch }
      void run(
        tripDomainMutations.updateBag(tripId, {
          ...next,
          ownerIds: next.ownerIds.map(serverMemberId),
        }),
      )
    },
    deletePackingBag: (bagId: string) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return runOptimistic(
        () => tripDomainMutations.deleteBag(tripId, bagId),
        (current) => removePackingBag(current, bagId),
      )
    },
    deletePackingItem: (itemId: string) => {
      if (!tripId) return Promise.reject(new Error('No active trip'))
      return runOptimistic(
        () => tripDomainMutations.deleteItem(tripId, itemId),
        (current) => removePackingItem(current, itemId),
      )
    },
    markExpensePaid: (expenseId: string, memberId: string) => {
      if (!tripId) return
      const item = query.data?.expenses.find((expense) => expense.id === expenseId)
      if (!item) return
      void run(
        tripDomainMutations.updateExpense(tripId, {
          ...item,
          participantIds: item.participantIds.map(serverMemberId),
          paidMemberIds: toggleId(item.paidMemberIds, memberId).map(serverMemberId),
        }),
      )
    },
    setExpenseParticipant: (expenseId: string, memberId: string) => {
      if (!tripId) return
      const item = query.data?.expenses.find((expense) => expense.id === expenseId)
      if (!item) return
      void run(
        tripDomainMutations.updateExpense(tripId, {
          ...item,
          participantIds: toggleId(item.participantIds, memberId).map(serverMemberId),
          paidMemberIds: item.paidMemberIds.map(serverMemberId),
        }),
      )
    },
    setReservationParticipant: (reservationId: string, memberId: string) => {
      if (!tripId) return
      const item = query.data?.reservations.find((reservation) => reservation.id === reservationId)
      if (!item) return
      void run(
        tripDomainMutations.updateReservation(tripId, {
          ...item,
          participantIds: toggleId(item.participantIds, memberId).map(serverMemberId),
        }),
      )
    },
    togglePacked: (itemId: string) => {
      if (!tripId) return
      const item = query.data?.packingItems.find((packingItem) => packingItem.id === itemId)
      if (!item) return
      void run(
        tripDomainMutations.updateItem(tripId, {
          ...item,
          packed: !item.packed,
          ownerId: serverMemberId(item.ownerId),
          contributorIds: item.contributorIds.map(serverMemberId),
        }),
      )
    },
    updatePackingItem: (itemId: string, patch: Partial<PackingItemRecord>) => {
      if (!tripId) return
      const item = query.data?.packingItems.find((packingItem) => packingItem.id === itemId)
      if (!item) return
      const next = { ...item, ...patch }
      void run(
        tripDomainMutations.updateItem(tripId, {
          ...next,
          ownerId: serverMemberId(next.ownerId),
          contributorIds: next.contributorIds.map(serverMemberId),
        }),
      )
    },
    togglePackingRecipient: (itemId: string, memberId: string) => {
      if (!tripId) return
      const item = query.data?.packingItems.find((packingItem) => packingItem.id === itemId)
      if (!item) return
      void run(
        tripDomainMutations.updateItem(tripId, {
          ...item,
          recipientIds: toggleId(item.recipientIds, memberId),
          ownerId: serverMemberId(item.ownerId),
          contributorIds: item.contributorIds.map(serverMemberId),
        }),
      )
    },
    cyclePackingOwner: (itemId: string) => {
      if (!tripId) return
      const item = query.data?.packingItems.find((packingItem) => packingItem.id === itemId)
      if (!item) return
      const ownerId = cycleOwner(item.ownerId, memberIds)
      void run(
        tripDomainMutations.updateItem(tripId, {
          ...item,
          ownerId: serverMemberId(ownerId),
          contributorIds: item.contributorIds.map(serverMemberId),
        }),
      )
    },
  }
}
