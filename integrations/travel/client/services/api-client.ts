import { travelShadowSpaceApp } from './shadow-host.js'

interface ApiEnvelope<T> {
  ok?: boolean
  data?: T
  error?: string
  message?: string
}

const inFlightApiGets = new Map<string, Promise<unknown>>()

function apiUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const base = import.meta.env.VITE_TRAVEL_API_BASE_URL || window.location.origin
  const url = new URL(path, base)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    url.searchParams.set(key, String(value))
  }
  return url
}

function apiWebSocketUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
) {
  const url = apiUrl(path, params)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url
}

async function performApiGet<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await travelShadowSpaceApp.fetchWithSession(url, {
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal,
  })
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? `Request failed with ${response.status}`)
  }
  return (payload?.data ?? payload) as T
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const url = apiUrl(path, params)
  if (options?.signal) return performApiGet<T>(url, options.signal)
  const key = url.toString()
  const inFlight = inFlightApiGets.get(key)
  if (inFlight) return inFlight as Promise<T>
  const request = performApiGet<T>(url).finally(() => inFlightApiGets.delete(key))
  inFlightApiGets.set(key, request)
  return request
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const response = await travelShadowSpaceApp.fetchWithSession(apiUrl(path, params), {
    credentials: 'include',
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? `Request failed with ${response.status}`)
  }
  return (payload?.data ?? payload) as T
}

async function apiWrite<T>(method: 'DELETE' | 'PATCH' | 'PUT', path: string, body?: unknown) {
  const response = await travelShadowSpaceApp.fetchWithSession(apiUrl(path), {
    credentials: 'include',
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  })
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok) {
    const error = new Error(
      payload?.message ?? payload?.error ?? `Request failed with ${response.status}`,
    )
    Object.assign(error, { status: response.status })
    throw error
  }
  return (payload?.data ?? payload) as T
}

export function apiPut<T>(path: string, body?: unknown) {
  return apiWrite<T>('PUT', path, body)
}

export function apiPatch<T>(path: string, body?: unknown) {
  return apiWrite<T>('PATCH', path, body)
}

export function apiDelete<T>(path: string) {
  return apiWrite<T>('DELETE', path)
}

export interface TravelRouteExportInput {
  routeSegmentId?: string
  dayId?: string
  assignmentIds?: string[]
  mode?: 'driving' | 'walking' | 'cycling'
  format?: 'google_maps' | 'geojson' | 'both'
}

export interface TravelBudgetAnalyticsQuery {
  targetCurrency?: string
  date?: string
  includeWaived?: boolean
}

export interface TravelPackingSuggestionsInput {
  destination?: string
  season?: string
  activities?: string[]
  travelerProfile?: 'solo' | 'couple' | 'family' | 'business' | 'group'
  includeExisting?: boolean
  limit?: number
}

export function exportTravelRoute<T = unknown>(tripId: string, input: TravelRouteExportInput) {
  return apiPost<T>(`/api/trips/${encodeURIComponent(tripId)}/routes/export`, input)
}

export function getTravelBudgetAnalytics<T = unknown>(
  tripId: string,
  params?: TravelBudgetAnalyticsQuery,
) {
  return apiGet<T>(
    `/api/trips/${encodeURIComponent(tripId)}/expenses/analytics`,
    params
      ? {
          targetCurrency: params.targetCurrency,
          date: params.date,
          includeWaived: params.includeWaived,
        }
      : undefined,
  )
}

export function suggestTravelPackingItems<T = unknown>(
  tripId: string,
  input: TravelPackingSuggestionsInput,
) {
  return apiPost<T>(`/api/trips/${encodeURIComponent(tripId)}/packing/suggestions`, input)
}

export function travelTripWebSocketUrl(
  tripId: string,
  params?: { since?: number; lastEventId?: number },
) {
  const url = apiWebSocketUrl(`/api/trips/${encodeURIComponent(tripId)}/ws`, params)
  return url.toString()
}
