import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { travelTripWebSocketUrl } from '../../../services/api-client.js'
import {
  type TravelClientStateEventDetail,
  travelClientStateEventName,
} from '../../../services/client-state-events.js'
import {
  type CreateTravelTripInput,
  createTravelTrip,
  deleteTravelTrip,
  fetchTravelSpaceMembers,
  fetchTravelTripMemberIds,
  fetchTravelWorkspace,
  selectTravelTrip,
  travelWorkspaceEventName,
  type UpdateTravelTripInput,
  updateTravelTrip,
} from '../api/trips.js'

const workspaceQueryKey = ['travel', 'workspace']

interface TripLiveConnection {
  clients: Map<QueryClient, number>
  closeTimer: number | null
  lastEventId: number
  reconnectTimer: number | null
  socket: WebSocket | null
  tripId: string
}

const tripLiveConnections = new Map<string, TripLiveConnection>()

function invalidateTripEvent(queryClient: QueryClient, tripId: string, type?: string) {
  for (const queryKey of [
    ['travel', 'trip-domain', tripId],
    ['travel', 'attachments', tripId],
    ['travel', 'settlement-records', tripId],
    ['travel', 'community', tripId],
    ['travel', 'audit', tripId],
  ]) {
    void queryClient.invalidateQueries({ queryKey })
  }
  void queryClient.invalidateQueries({ queryKey: ['travel', 'trip-memberships'] })
  if (type?.startsWith('emergency_report.')) {
    void queryClient.invalidateQueries({ queryKey: ['travel', 'emergency-reports'] })
  }
}

function connectTripLive(entry: TripLiveConnection) {
  if (entry.socket || entry.clients.size === 0) return
  if (entry.reconnectTimer) window.clearTimeout(entry.reconnectTimer)
  entry.reconnectTimer = null
  const socket = new WebSocket(
    travelTripWebSocketUrl(
      entry.tripId,
      entry.lastEventId > 0 ? { since: entry.lastEventId } : undefined,
    ),
  )
  entry.socket = socket
  socket.onmessage = (message) => {
    try {
      const event = JSON.parse(String(message.data)) as {
        kind?: string
        lastEventId?: string
        sequence?: number
        payload?: TravelClientStateEventDetail
        tripId?: string
        type?: string
      }
      if (event.kind === 'ready') {
        const lastEventId = Number(event.lastEventId)
        if (Number.isFinite(lastEventId)) entry.lastEventId = lastEventId
        return
      }
      if (event.kind !== 'event') return
      if (typeof event.sequence === 'number') entry.lastEventId = event.sequence
      if (event.type?.startsWith('client_state.')) {
        window.dispatchEvent(
          new CustomEvent<TravelClientStateEventDetail>(travelClientStateEventName, {
            detail: { ...event.payload, tripId: event.tripId ?? entry.tripId },
          }),
        )
        return
      }
      if (event.type?.startsWith('presence.')) return
      for (const queryClient of entry.clients.keys()) {
        invalidateTripEvent(queryClient, entry.tripId, event.type)
      }
    } catch {
      // Ignore non-event presence frames.
    }
  }
  socket.onclose = () => {
    if (entry.socket === socket) entry.socket = null
    if (entry.clients.size > 0) {
      entry.reconnectTimer = window.setTimeout(() => connectTripLive(entry), 2_000)
    }
  }
}

function subscribeTripLive(tripId: string, queryClient: QueryClient) {
  let entry = tripLiveConnections.get(tripId)
  if (!entry) {
    entry = {
      clients: new Map(),
      closeTimer: null,
      lastEventId: 0,
      reconnectTimer: null,
      socket: null,
      tripId,
    }
    tripLiveConnections.set(tripId, entry)
  }
  if (entry.closeTimer) window.clearTimeout(entry.closeTimer)
  entry.closeTimer = null
  entry.clients.set(queryClient, (entry.clients.get(queryClient) ?? 0) + 1)
  connectTripLive(entry)
  return () => {
    const count = entry!.clients.get(queryClient) ?? 0
    if (count > 1) entry!.clients.set(queryClient, count - 1)
    else entry!.clients.delete(queryClient)
    if (entry!.clients.size > 0) return
    entry!.closeTimer = window.setTimeout(() => {
      if (entry!.clients.size > 0) return
      if (entry!.reconnectTimer) window.clearTimeout(entry!.reconnectTimer)
      entry!.reconnectTimer = null
      entry!.socket?.close()
      entry!.socket = null
      tripLiveConnections.delete(tripId)
    }, 300)
  }
}

export function useTravelWorkspace() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryFn: fetchTravelWorkspace,
    queryKey: workspaceQueryKey,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,
  })
  const tripIds = query.data?.trips.map((trip) => trip.id) ?? []
  const membersQuery = useQuery({
    enabled: query.isSuccess,
    queryFn: () => fetchTravelSpaceMembers(query.data?.bootstrap ?? null),
    queryKey: ['travel', 'space-members', query.data?.bootstrap?.serverId ?? 'local-server'],
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const tripMembershipsQuery = useQuery({
    enabled: tripIds.length > 0,
    queryFn: () => fetchTravelTripMemberIds(tripIds),
    queryKey: ['travel', 'trip-memberships', tripIds],
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
    }
    window.addEventListener(travelWorkspaceEventName(), refresh)
    return () => window.removeEventListener(travelWorkspaceEventName(), refresh)
  }, [queryClient])

  const trips = (query.data?.trips ?? []).map((trip) => ({
    ...trip,
    memberIds: tripMembershipsQuery.data?.[trip.id] ?? trip.memberIds,
  }))
  const currentTrip =
    trips.find((trip) => trip.id === query.data?.currentTripId) ?? trips[0] ?? null

  useEffect(() => {
    if (!currentTrip?.id) return
    return subscribeTripLive(currentTrip.id, queryClient)
  }, [currentTrip?.id, queryClient])

  return {
    ...query,
    bootstrap: query.data?.bootstrap ?? null,
    createTrip: async (input: CreateTravelTripInput) => {
      const trip = await createTravelTrip(input)
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      return trip
    },
    currentTrip,
    deleteTrip: async (tripId: string) => {
      await deleteTravelTrip(tripId)
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
    },
    members: membersQuery.data ?? query.data?.members ?? [],
    selectTrip: async (tripId: string) => {
      await selectTravelTrip(tripId)
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
    },
    trips,
    updateTrip: async (tripId: string, patch: UpdateTravelTripInput) => {
      const trip = await updateTravelTrip(tripId, patch)
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      return trip
    },
  }
}
