import { apiGet, apiPost } from '../../../services/api-client.js'
import type { Place, PlaceCategory } from './places.js'

export interface ProviderPlaceResult {
  title: string
  address?: string
  coordinates?: { lat: number; lng: number }
  rating?: number
  externalRefs?: Record<string, unknown>
}

interface ProviderSearchResponse {
  places: ProviderPlaceResult[]
  source: string
}

interface SavedPlaceResponse {
  id: string
  title: string
  kind: string
  address?: string
  coordinates?: { lat: number; lng: number }
  externalRefs?: Record<string, unknown>
  notes?: string
}

function categoryFor(kind: string, result: ProviderPlaceResult): PlaceCategory {
  const providerKind = String(result.externalRefs?.type ?? '').toLowerCase()
  if (kind === 'restaurant' || ['restaurant', 'cafe', 'food'].includes(providerKind)) return 'Food'
  if (providerKind.includes('museum')) return 'Museums'
  return 'Sights'
}

export function providerResultId(result: ProviderPlaceResult, index = 0) {
  const providerId = result.externalRefs?.osmId ?? result.externalRefs?.googlePlaceId
  return `provider:${String(providerId ?? `${result.title}:${index}`)}`
}

export function providerResultToPlace(result: ProviderPlaceResult, index = 0): Place {
  const kind = String(result.externalRefs?.type ?? 'custom')
  return {
    id: providerResultId(result, index),
    title: result.title,
    category: categoryFor(kind, result),
    address: result.address ?? '',
    meta: '',
    status: 'idea',
    statusLabel: '',
    image: '',
    latitude: result.coordinates?.lat ?? 0,
    longitude: result.coordinates?.lng ?? 0,
    rating: result.rating ? String(result.rating) : undefined,
  }
}

export function savedResponseToPlace(result: SavedPlaceResponse): Place {
  const provider: ProviderPlaceResult = {
    title: result.title,
    address: result.address,
    coordinates: result.coordinates,
    externalRefs: result.externalRefs,
  }
  return {
    ...providerResultToPlace(provider),
    id: result.id,
    serverId: result.id,
    meta: '',
    status: 'saved',
    statusLabel: '',
    notes: result.notes,
  }
}

export function searchProviderPlaces(query: string, lang?: string) {
  return apiGet<ProviderSearchResponse>('/api/providers/places/search', { query, lang })
}

export function reverseGeocodePlace(latitude: number, longitude: number, lang?: string) {
  return apiGet<{ provider: string; name?: string | null; address?: string | null } | null>(
    '/api/providers/places/reverse-geocode',
    { lat: latitude, lng: longitude, lang },
  )
}

export async function saveProviderPlace(
  tripId: string,
  result: ProviderPlaceResult,
  kind = 'custom',
) {
  const saved = await apiPost<SavedPlaceResponse>(
    `/api/trips/${encodeURIComponent(tripId)}/places/provider-save`,
    { providerResult: result, kind, tags: [], photoRefs: [] },
  )
  return savedResponseToPlace(saved)
}
