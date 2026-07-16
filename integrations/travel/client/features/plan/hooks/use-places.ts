import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { appConfig } from '../../../config/app.js'
import type { PlaceFilter } from '../../../config/copy.js'
import {
  combineTravelSyncStatus,
  usePersistentTripState,
} from '../../../hooks/use-persistent-trip-state.js'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../../services/api-client.js'
import {
  providerResultToPlace,
  saveProviderPlace,
  searchProviderPlaces,
} from '../api/place-search.js'
import type { Place } from '../api/places.js'
import { fetchTripDomain } from '../api/trip-domain.js'
import { useTravelWorkspace } from './use-travel-workspace.js'

export function usePlaces() {
  const { i18n } = useTranslation()
  const workspace = useTravelWorkspace()
  const queryClient = useQueryClient()
  const tripId = workspace.currentTrip?.id
  const [filter, setFilter] = useState<PlaceFilter>(appConfig.defaultFilter)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const [selectedId, setSelectedId] = useState('louvre')
  const [expanded, setExpanded] = useState(false)
  const [scheduledDays, setScheduledDays, scheduledDaysStatus] = usePersistentTripState<
    Record<string, string>
  >(tripId, 'place-schedule-labels', {}, { enabled: Boolean(tripId) })
  const queryKey = ['travel', 'trip-domain', tripId]
  const placesQuery = useQuery({
    enabled: Boolean(tripId),
    queryKey,
    queryFn: () => fetchTripDomain(tripId!, workspace.bootstrap),
    staleTime: 15_000,
  })
  const places = useMemo(
    () =>
      (placesQuery.data?.places ?? []).map((place) => {
        const dayLabel = scheduledDays[place.id]
        return dayLabel
          ? {
              ...place,
              meta: `Saved · ${dayLabel}`,
              status: 'scheduled' as const,
              statusLabel: `Saved · ${dayLabel}`,
            }
          : place
      }),
    [placesQuery.data?.places, scheduledDays],
  )
  const providerQuery = useQuery({
    enabled: Boolean(tripId && deferredQuery.length >= 2),
    queryKey: ['travel', 'provider-place-search', deferredQuery, i18n.language],
    queryFn: () => searchProviderPlaces(deferredQuery, i18n.language),
    staleTime: 5 * 60_000,
  })
  const providerPlaces = useMemo(
    () =>
      (providerQuery.data?.places ?? [])
        .filter((result) => result.coordinates)
        .map(providerResultToPlace)
        .filter(
          (candidate) =>
            !places.some(
              (place) =>
                place.title.toLowerCase() === candidate.title.toLowerCase() &&
                place.address.toLowerCase() === candidate.address.toLowerCase(),
            ),
        ),
    [places, providerQuery.data?.places],
  )
  const providerResultById = useMemo(
    () =>
      new Map(
        (providerQuery.data?.places ?? []).map(
          (result, index) => [providerResultToPlace(result, index).id, result] as const,
        ),
      ),
    [providerQuery.data?.places],
  )
  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...places, ...providerPlaces].filter((place) => {
      const matchesQuery =
        !normalizedQuery ||
        place.title.toLowerCase().includes(normalizedQuery) ||
        place.address.toLowerCase().includes(normalizedQuery)
      const matchesFilter =
        filter === 'All' ||
        (filter === 'Saved' && (place.status === 'saved' || place.status === 'scheduled')) ||
        place.category === filter
      return matchesQuery && matchesFilter
    })
  }, [filter, places, providerPlaces, query])
  useEffect(() => {
    if (filteredPlaces.length && !filteredPlaces.some((place) => place.id === selectedId))
      setSelectedId(filteredPlaces[0]!.id)
  }, [filteredPlaces, selectedId])
  const selectedPlace =
    filteredPlaces.find((place) => place.id === selectedId) ?? filteredPlaces[0] ?? places[0]
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const saveProvider = useMutation({
    mutationFn: async (placeId: string) => {
      const result = providerResultById.get(placeId)
      if (!tripId || !result) throw new Error('Provider place is unavailable')
      return saveProviderPlace(tripId, result)
    },
    onSuccess: async (place) => {
      await refresh()
      setSelectedId(place.id)
    },
  })

  return {
    expanded,
    filter,
    filteredPlaces,
    isLoading: placesQuery.isLoading || providerQuery.isFetching,
    isProviderResult: (placeId: string) => providerResultById.has(placeId),
    places,
    query,
    savedCount: places.filter((place) => place.status === 'saved' || place.status === 'scheduled')
      .length,
    scheduledCount: places.filter((place) => place.status === 'scheduled').length,
    syncStatus: combineTravelSyncStatus([
      scheduledDaysStatus,
      placesQuery.isError ? 'error' : placesQuery.data ? 'saved' : 'idle',
    ]),
    selectedId,
    selectedPlace,
    setExpanded,
    setFilter,
    setQuery,
    setSelectedId,
    schedulePlaceToDay: (placeId: string, dayLabel: string) => {
      setScheduledDays((current) => ({ ...current, [placeId]: dayLabel }))
      const place = places.find((item) => item.id === placeId)
      if (!tripId || !place?.serverId) return
      void apiGet<Array<{ id: string }>>(`/api/trips/${tripId}/days`)
        .then((days) => {
          const dayNumber = Number(dayLabel.match(/\d+/)?.[0] ?? 1)
          return apiPost(`/api/trips/${tripId}/assignments`, {
            dayId: days[Math.max(0, dayNumber - 1)]?.id,
            kind: 'place',
            participantMemberIds: [],
            placeId: place.serverId,
            status: 'scheduled',
            title: place.title,
          })
        })
        .then(refresh)
    },
    saveProviderPlace: (placeId: string) => saveProvider.mutateAsync(placeId),
    deletePlace: async (placeId: string) => {
      const place = places.find((candidate) => candidate.id === placeId)
      if (!tripId || !place?.serverId) throw new Error('Saved place is unavailable')
      await apiDelete(`/api/trips/${tripId}/places/${place.serverId}`)
      setSelectedId('')
      await refresh()
    },
    savingProviderPlace: saveProvider.isPending,
    updatePlace: (placeId: string, patch: Partial<Place>) => {
      const place = places.find((item) => item.id === placeId)
      if (!tripId || !place?.serverId) return
      void apiPatch(`/api/trips/${tripId}/places/${place.serverId}`, {
        address: patch.address,
        notes: patch.notes,
        title: patch.title,
      }).then(refresh)
    },
    updatePlaceNotes: (placeId: string, notes: string) => {
      const place = places.find((item) => item.id === placeId)
      if (!tripId || !place?.serverId) return
      void apiPatch(`/api/trips/${tripId}/places/${place.serverId}`, { notes }).then(refresh)
    },
  }
}
