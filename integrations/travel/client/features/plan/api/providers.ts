import { apiGet } from '../../../services/api-client.js'

export interface ProviderCoordinates {
  latitude: number
  longitude: number
}

export interface DestinationSearchResult {
  id: string
  label: string
  address?: string
  coordinates?: ProviderCoordinates
  provider: string
  placeId?: string
}

interface PlaceSearchResponse {
  places: Array<{
    title?: string
    address?: string
    coordinates?: { lat: number; lng: number }
    externalRefs?: {
      googlePlaceId?: string
      osmId?: string
      provider?: string
      [key: string]: unknown
    }
  }>
  source: string
}

interface PlacePhotoResponse {
  photoUrl?: string
}

export interface WeatherSummary {
  provider?: string
  timezone?: string
  temp?: number
  temp_max?: number
  temp_min?: number
  main?: string
  description?: string
  windspeed_10m?: number
  windspeed_10m_max?: number
  wind_max?: number
  relativehumidity_2m?: number
  precipitation_probability_max?: number
  precipitation_sum?: number
  airQuality?: {
    provider?: string
    aqi?: number | null
    pm25?: number | null
  } | null
  air_quality?: {
    provider?: string
    aqi?: number | null
    pm2_5?: number | null
  } | null
}

export interface ExchangeRatesResponse {
  provider?: string
  base: string
  rates: Record<string, number>
}

export async function searchDestinations(input: { query: string; lang?: string; limit?: number }) {
  const query = input.query.trim()
  if (query.length < 2) return []
  const response = await apiGet<PlaceSearchResponse>('/api/providers/places/search', {
    lang: input.lang,
    query,
  })
  return response.places.slice(0, input.limit ?? 6).map<DestinationSearchResult>((place, index) => {
    const placeId = place.externalRefs?.googlePlaceId ?? place.externalRefs?.osmId
    return {
      address: place.address,
      coordinates: place.coordinates
        ? { latitude: place.coordinates.lat, longitude: place.coordinates.lng }
        : undefined,
      id: placeId ?? `${response.source}:${place.title ?? query}:${index}`,
      label: place.title || place.address || query,
      placeId,
      provider: place.externalRefs?.provider ?? response.source,
    }
  })
}

export async function fetchDestinationPhoto(input: {
  placeId?: string
  coordinates?: ProviderCoordinates
  name: string
}) {
  if (!input.placeId || !input.coordinates) return null
  const response = await apiGet<PlacePhotoResponse>('/api/providers/places/photo', {
    lat: input.coordinates.latitude,
    lng: input.coordinates.longitude,
    name: input.name,
    placeId: input.placeId,
  })
  return response.photoUrl ?? null
}

export async function fetchWeatherSummary(input: {
  coordinates?: ProviderCoordinates
  date?: string
  lang?: string
  detailed?: boolean
}) {
  if (!input.coordinates) return null
  return apiGet<WeatherSummary>('/api/providers/weather', {
    date: input.date,
    detailed: input.detailed,
    lang: input.lang,
    lat: input.coordinates.latitude,
    lng: input.coordinates.longitude,
  })
}

export async function fetchExchangeRates(base: string) {
  const normalizedBase = base.trim().toUpperCase()
  if (!normalizedBase) return null
  return apiGet<ExchangeRatesResponse>('/api/providers/exchange-rates', {
    base: normalizedBase,
  })
}
