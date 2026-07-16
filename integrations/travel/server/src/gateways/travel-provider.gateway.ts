import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ProviderCacheDao } from '../dao/provider-cache.dao.js'
import { createId } from '../lib/id.js'
import { safeFetch, safeFetchFollow } from '../lib/safe-fetch.js'
import { nowIso } from '../lib/time.js'
import type { TravelCoordinates } from '../types.js'

export interface PlaceSearchResult {
  title: string
  address?: string
  coordinates?: TravelCoordinates
  rating?: number
  phone?: string
  website?: string
  externalRefs?: Record<string, unknown>
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
  staleAt: number
}

interface CacheLookup<T> {
  fresh: boolean
  value: T
}

const UA = `Shadow Travel Space App (${process.env.TRAVEL_PUBLIC_BASE_URL ?? 'self-hosted'})`
const exchangeInflight = new Map<string, Promise<Record<string, number> | null>>()
const responseCache = new Map<string, CacheEntry<unknown>>()
const providerInflight = new Map<string, Promise<Record<string, unknown> | null>>()
const photoInflight = new Map<string, Promise<PlacePhotoResult | null>>()
const poiInflight = new Map<string, Promise<Record<string, unknown>>>()
let overpassConsecutiveFailures = 0
let overpassCircuitOpenUntil = 0

function publicProvidersEnabled() {
  return process.env.TRAVEL_ENABLE_PUBLIC_PROVIDERS !== 'false'
}

function now() {
  return Date.now()
}

async function fetchJson<T>(url: string | URL, init?: RequestInit): Promise<T | null> {
  const response = await fetch(url, init).catch(() => null)
  if (!response?.ok) return null
  return (await response.json().catch(() => null)) as T | null
}

async function safeJson<T>(url: string | URL, init?: RequestInit): Promise<T | null> {
  const response = await safeFetch(url, init).catch(() => null)
  if (!response?.ok) return null
  return (await response.json().catch(() => null)) as T | null
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function normalizeCurrency(value: string | undefined, fallback = 'EUR') {
  const text = value?.trim().toUpperCase()
  return text && /^[A-Z]{3,8}$/.test(text) ? text : fallback
}

function validCoord(value: string) {
  if (!/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(value)) return false
  const [lat, lng] = value.split(',').map(Number)
  if (lat === undefined || lng === undefined) return false
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function toApiLang(lang: string | undefined) {
  const code = lang?.trim()
  if (!code) return 'en'
  if (code === 'br') return 'pt-BR'
  if (code === 'gr') return 'el'
  return code
}

const WMO_MAIN: Record<number, string> = {
  0: 'Clear',
  1: 'Clear',
  2: 'Clouds',
  3: 'Clouds',
  45: 'Fog',
  48: 'Fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  56: 'Drizzle',
  57: 'Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Rain',
  66: 'Rain',
  67: 'Rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Snow',
  77: 'Snow',
  80: 'Rain',
  81: 'Rain',
  82: 'Rain',
  85: 'Snow',
  86: 'Snow',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
}

const WMO_DESCRIPTION_EN: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snowfall',
  73: 'Snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Light rain showers',
  81: 'Rain showers',
  82: 'Heavy rain showers',
  85: 'Light snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail',
}

function weatherDescription(code: number | undefined) {
  if (code === undefined) return ''
  return WMO_DESCRIPTION_EN[code] ?? ''
}

function weatherMain(code: number | undefined) {
  if (code === undefined) return 'Clouds'
  return WMO_MAIN[code] ?? 'Clouds'
}

function estimateCondition(tempAvg: number, precipMm: number) {
  if (precipMm > 5) return tempAvg <= 0 ? 'Snow' : 'Rain'
  if (precipMm > 1) return tempAvg <= 0 ? 'Snow' : 'Drizzle'
  if (precipMm > 0.3) return 'Clouds'
  return tempAvg > 15 ? 'Clear' : 'Clouds'
}

function photoDirectory() {
  return join(process.cwd(), process.env.TRAVEL_PHOTO_CACHE_DIR ?? 'data/travel-photo-cache')
}

function photoCacheKey(input: string) {
  return createHash('sha1').update(input).digest('hex')
}

function photoPath(cacheKey: string, contentType = 'image/jpeg') {
  const ext = contentType.includes('png')
    ? '.png'
    : contentType.includes('webp')
      ? '.webp'
      : contentType.includes('gif')
        ? '.gif'
        : '.jpg'
  return join(photoDirectory(), `${cacheKey}${ext}`)
}

export interface PlacePhotoResult {
  cacheKey: string
  photoUrl: string
  attribution?: string | null
  contentType: string
}

export class TravelProviderGateway {
  constructor(private readonly providerCacheDao?: ProviderCacheDao) {}

  private async cacheLookup<T>(key: string): Promise<CacheLookup<T> | null> {
    const hit = responseCache.get(key)
    if (hit && hit.staleAt > now()) {
      return { fresh: hit.expiresAt > now(), value: hit.value as T }
    }
    if (hit) responseCache.delete(key)

    const persisted = await this.providerCacheDao?.find(key)
    if (!persisted) return null
    const staleAt = new Date(persisted.staleAt ?? persisted.expiresAt).getTime()
    if (staleAt <= now()) return null
    const expiresAt = new Date(persisted.expiresAt).getTime()
    responseCache.set(key, {
      value: persisted.value,
      expiresAt,
      staleAt,
    })
    return { fresh: expiresAt > now(), value: persisted.value as T }
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    const cached = await this.cacheLookup<T>(key)
    return cached?.fresh ? cached.value : null
  }

  private cacheSet<T extends Record<string, unknown>>(
    provider: string,
    key: string,
    value: T,
    ttlMs: number,
    staleTtlMs = ttlMs * 4,
  ) {
    const expiresAt = new Date(now() + ttlMs).toISOString()
    const staleAt = new Date(now() + staleTtlMs).toISOString()
    if (responseCache.size > 2000) responseCache.delete(responseCache.keys().next().value as string)
    responseCache.set(key, {
      value,
      expiresAt: new Date(expiresAt).getTime(),
      staleAt: new Date(staleAt).getTime(),
    })
    const persistence = this.providerCacheDao?.upsert({
      id: createId('pcache'),
      serverId: process.env.SHADOWOB_SERVER_ID ?? 'local',
      key,
      provider,
      value,
      expiresAt,
      staleAt,
      updatedAt: nowIso(),
    })
    void persistence?.catch(() => undefined)
    return value
  }

  private async cacheThrough<T extends Record<string, unknown>>(input: {
    key: string
    load: () => Promise<T | null>
    provider: string
    staleTtlMs?: number
    ttlMs: number
  }): Promise<T | null> {
    const cached = await this.cacheLookup<T>(input.key)
    if (cached?.fresh) return cached.value

    let task = providerInflight.get(input.key) as Promise<T | null> | undefined
    if (!task) {
      task = input
        .load()
        .then((value) =>
          value
            ? this.cacheSet(input.provider, input.key, value, input.ttlMs, input.staleTtlMs)
            : null,
        )
        .finally(() => providerInflight.delete(input.key))
      providerInflight.set(input.key, task as Promise<Record<string, unknown> | null>)
    }

    if (cached) {
      void task.catch(() => undefined)
      return cached.value
    }
    return task
  }

  async exchangeRates(input: { base: string }) {
    if (!publicProvidersEnabled()) return null
    const base = normalizeCurrency(input.base)
    const cacheKey = `exchange:${base}`
    const hit = await this.cacheGet<{
      provider: string
      base: string
      rates: Record<string, number>
    }>(cacheKey)
    if (hit) return hit
    let task = exchangeInflight.get(base)
    if (!task) {
      task = this.fetchExchangeRates(base).then((rates) => {
        exchangeInflight.delete(base)
        return rates
      })
      exchangeInflight.set(base, task)
    }
    const rates = await task
    return rates
      ? this.cacheSet(
          'frankfurter',
          cacheKey,
          { provider: 'frankfurter', base, rates },
          15 * 60 * 1000,
        )
      : null
  }

  async exchangeRate(input: { from: string; to: string; date?: string }) {
    const from = normalizeCurrency(input.from)
    const to = normalizeCurrency(input.to)
    if (from === to) return { provider: 'identity', from, to, rate: 1 }
    if (input.date) {
      const dated = await this.fetchDatedExchangeRate(from, to, input.date)
      if (dated) return dated
    }
    const rates = await this.exchangeRates({ base: from })
    const rate = rates?.rates[to]
    return rate && rate > 0 ? { provider: 'frankfurter', from, to, rate } : null
  }

  private async fetchExchangeRates(base: string) {
    const url = new URL('https://api.frankfurter.dev/v2/rates')
    url.searchParams.set('base', base)
    const data = await fetchJson<Array<{ quote?: string; rate?: number }>>(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
    })
    if (!Array.isArray(data)) return null
    const rates: Record<string, number> = { [base]: 1 }
    for (const row of data) {
      if (row.quote && typeof row.rate === 'number' && row.rate > 0) rates[row.quote] = row.rate
    }
    return Object.keys(rates).length > 1 ? rates : null
  }

  private async fetchDatedExchangeRate(from: string, to: string, date: string) {
    const url = new URL(`https://api.frankfurter.app/${date}`)
    url.searchParams.set('from', from)
    url.searchParams.set('to', to)
    const data = await fetchJson<{ rates?: Record<string, number>; date?: string }>(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
    })
    const rate = data?.rates?.[to]
    return rate && rate > 0
      ? { provider: 'frankfurter', from, to, rate, date: data?.date ?? date }
      : null
  }

  async weather(input: {
    coordinates: TravelCoordinates
    date?: string
    lang?: string
    detailed?: boolean
  }): Promise<Record<string, unknown> | null> {
    if (!publicProvidersEnabled()) return null
    const { lat, lng } = input.coordinates
    const rounded = `${lat.toFixed(2)},${lng.toFixed(2)}`
    const cacheKey = `weather:v2:${rounded}:${input.date ?? 'current'}:${input.detailed ? 'd' : 's'}`
    const cached = await this.cacheGet<Record<string, unknown>>(cacheKey)
    if (cached) return cached

    const date = input.date
    if (!date)
      return this.cacheSet(
        'open-meteo',
        cacheKey,
        await this.currentWeather(lat, lng, input.detailed),
        15 * 60 * 1000,
      )
    const target = new Date(date)
    const diffDays = (target.getTime() - Date.now()) / 86_400_000
    const data =
      diffDays >= -1 && diffDays <= 16
        ? await this.forecastWeather(lat, lng, date, input.detailed)
        : diffDays < -1
          ? await this.archiveWeather(lat, lng, date, input.detailed)
          : await this.climateWeather(lat, lng, date)
    return this.cacheSet(
      'open-meteo',
      cacheKey,
      data,
      diffDays >= -1 && diffDays <= 16 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    )
  }

  private async currentWeather(lat: number, lng: number, detailed?: boolean) {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set(
      'current',
      detailed
        ? 'temperature_2m,relativehumidity_2m,precipitation,weathercode,windspeed_10m'
        : 'temperature_2m,weathercode',
    )
    url.searchParams.set('timezone', 'auto')
    const today = new Date().toISOString().slice(0, 10)
    const [data, airQuality] = await Promise.all([
      fetchJson<{
        current?: {
          temperature_2m?: number
          weathercode?: number
          windspeed_10m?: number
          relativehumidity_2m?: number
          precipitation?: number
        }
        timezone?: string
      }>(url),
      detailed ? this.forecastAirQuality(lat, lng, today) : Promise.resolve(null),
    ])
    const code = data?.current?.weathercode
    return {
      provider: 'open-meteo',
      type: 'current',
      timezone: data?.timezone,
      temp: Math.round(data?.current?.temperature_2m ?? 0),
      windspeed_10m: data?.current?.windspeed_10m,
      windspeed_10m_max: data?.current?.windspeed_10m,
      relativehumidity_2m: data?.current?.relativehumidity_2m,
      precipitation_sum: data?.current?.precipitation,
      airQuality,
      main: weatherMain(code),
      description: weatherDescription(code),
    }
  }

  private async forecastWeather(lat: number, lng: number, date: string, detailed?: boolean) {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('forecast_days', '16')
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset,precipitation_probability_max,precipitation_sum,windspeed_10m_max',
    )
    if (detailed) {
      url.searchParams.set(
        'hourly',
        'temperature_2m,precipitation_probability,precipitation,weathercode,windspeed_10m,relativehumidity_2m',
      )
    }
    const [data, airQuality] = await Promise.all([
      fetchJson<OpenMeteoWeather>(url),
      detailed ? this.forecastAirQuality(lat, lng, date) : Promise.resolve(null),
    ])
    return mapOpenMeteoDay(data, date, 'forecast', detailed, airQuality)
  }

  private async archiveWeather(lat: number, lng: number, date: string, detailed?: boolean) {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('start_date', date)
    url.searchParams.set('end_date', date)
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,windspeed_10m_max,sunrise,sunset',
    )
    if (detailed) {
      url.searchParams.set(
        'hourly',
        'temperature_2m,precipitation,weathercode,windspeed_10m,relativehumidity_2m',
      )
    }
    const data = await fetchJson<OpenMeteoWeather>(url)
    return mapOpenMeteoDay(data, date, 'archive', detailed)
  }

  private async forecastAirQuality(lat: number, lng: number, date: string) {
    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('forecast_days', '7')
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('hourly', 'us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone')
    const data = await fetchJson<OpenMeteoAirQuality>(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
    })
    return mapOpenMeteoAirQuality(data, date)
  }

  private async climateWeather(lat: number, lng: number, date: string) {
    const target = new Date(date)
    const month = target.getUTCMonth() + 1
    const day = target.getUTCDate()
    const refYear = new Date().getUTCFullYear() - 1
    const start = new Date(Date.UTC(refYear, month - 1, Math.max(1, day - 2)))
      .toISOString()
      .slice(0, 10)
    const end = new Date(Date.UTC(refYear, month - 1, day + 2)).toISOString().slice(0, 10)
    const url = new URL('https://archive-api.open-meteo.com/v1/archive')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('start_date', start)
    url.searchParams.set('end_date', end)
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum')
    url.searchParams.set('timezone', 'auto')
    const data = await fetchJson<OpenMeteoWeather>(url)
    const daily = data?.daily
    const max = daily?.temperature_2m_max ?? []
    const min = daily?.temperature_2m_min ?? []
    const precip = daily?.precipitation_sum ?? []
    const count = Math.min(max.length, min.length)
    const avgMax = count ? max.reduce((sum, value) => sum + value, 0) / count : 0
    const avgMin = count ? min.reduce((sum, value) => sum + value, 0) / count : 0
    const precipAvg = precip.length
      ? precip.reduce((sum, value) => sum + value, 0) / precip.length
      : 0
    return {
      provider: 'open-meteo',
      type: 'climate',
      date,
      temp: Math.round((avgMax + avgMin) / 2),
      temp_max: Math.round(avgMax),
      temp_min: Math.round(avgMin),
      precipitation_sum: Math.round(precipAvg * 10) / 10,
      main: estimateCondition((avgMax + avgMin) / 2, precipAvg),
      description: 'Historical climate estimate',
    }
  }

  async searchPlaces(input: {
    query: string
    lang?: string
    locationBias?: { lat: number; lng: number; radius?: number }
    googleMapsApiKey?: string
  }): Promise<{ places: PlaceSearchResult[]; source: string }> {
    if (!publicProvidersEnabled() && !input.googleMapsApiKey)
      return { places: [], source: 'disabled' }
    const provider = input.googleMapsApiKey ? 'google-places' : 'nominatim'
    const bias = input.locationBias
      ? `${input.locationBias.lat.toFixed(3)},${input.locationBias.lng.toFixed(3)},${Math.round(
          input.locationBias.radius ?? 50_000,
        )}`
      : 'global'
    const cacheKey = `place-search:v2:${provider}:${toApiLang(input.lang)}:${bias}:${input.query.trim().toLocaleLowerCase()}`
    const result = await this.cacheThrough<{ places: PlaceSearchResult[]; source: string }>({
      key: cacheKey,
      load: async () =>
        input.googleMapsApiKey
          ? this.searchGooglePlaces({ ...input, googleMapsApiKey: input.googleMapsApiKey })
          : this.searchNominatim(input.query, input.lang).then((places) =>
              places ? { places, source: 'openstreetmap' } : null,
            ),
      provider,
      ttlMs: 15 * 60 * 1000,
      staleTtlMs: 24 * 60 * 60 * 1000,
    })
    return result ?? { places: [], source: provider }
  }

  async autocompletePlaces(input: { query: string; lang?: string; googleMapsApiKey?: string }) {
    const provider = input.googleMapsApiKey ? 'google-places' : 'nominatim'
    const cacheKey = `place-autocomplete:v2:${provider}:${toApiLang(
      input.lang,
    )}:${input.query.trim().toLocaleLowerCase()}`
    const result = await this.cacheThrough<{
      source: string
      suggestions: Array<{ placeId?: string; mainText: string; secondaryText: string }>
    }>({
      key: cacheKey,
      load: async () => {
        if (input.googleMapsApiKey) {
          const url = 'https://places.googleapis.com/v1/places:autocomplete'
          const data = await fetchJson<{
            suggestions?: Array<{
              placePrediction?: {
                placeId?: string
                structuredFormat?: {
                  mainText?: { text?: string }
                  secondaryText?: { text?: string }
                }
              }
            }>
          }>(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': input.googleMapsApiKey,
            },
            body: JSON.stringify({ input: input.query, languageCode: toApiLang(input.lang) }),
          })
          return {
            source: 'google',
            suggestions: (data?.suggestions ?? [])
              .flatMap((item) => (item.placePrediction ? [item.placePrediction] : []))
              .slice(0, 8)
              .map((prediction) => ({
                placeId: prediction.placeId,
                mainText: prediction.structuredFormat?.mainText?.text ?? '',
                secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
              })),
          }
        }
        const places = await this.searchNominatim(input.query, input.lang)
        if (!places) return null
        return {
          source: 'openstreetmap',
          suggestions: places.slice(0, 8).map((place) => ({
            placeId: place.externalRefs?.osmId as string | undefined,
            mainText: place.title,
            secondaryText: place.address ?? '',
          })),
        }
      },
      provider,
      ttlMs: 3 * 60 * 1000,
      staleTtlMs: 60 * 60 * 1000,
    })
    return result ?? { source: provider, suggestions: [] }
  }

  private async searchGooglePlaces(input: {
    query: string
    lang?: string
    locationBias?: { lat: number; lng: number; radius?: number }
    googleMapsApiKey: string
  }) {
    const body: Record<string, unknown> = {
      textQuery: input.query,
      languageCode: toApiLang(input.lang),
    }
    if (input.locationBias) {
      body.locationBias = {
        circle: {
          center: { latitude: input.locationBias.lat, longitude: input.locationBias.lng },
          radius: input.locationBias.radius ?? 50_000,
        },
      }
    }
    const data = await fetchJson<{ places?: GooglePlaceResult[] }>(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': input.googleMapsApiKey,
          'x-goog-fieldmask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.websiteUri,places.nationalPhoneNumber,places.types,places.googleMapsUri',
        },
        body: JSON.stringify(body),
      },
    )
    if (!data) return null
    return {
      source: 'google',
      places: (data.places ?? []).map((place) => ({
        title: place.displayName?.text ?? '',
        address: place.formattedAddress,
        coordinates: place.location
          ? { lat: place.location.latitude, lng: place.location.longitude }
          : undefined,
        rating: place.rating,
        phone: place.nationalPhoneNumber,
        website: place.websiteUri,
        externalRefs: {
          provider: 'google',
          googlePlaceId: place.id,
          googleMapsUri: place.googleMapsUri,
          types: place.types,
        },
      })),
    }
  }

  private async searchNominatim(query: string, lang?: string) {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', '10')
    url.searchParams.set('q', query)
    url.searchParams.set('accept-language', toApiLang(lang))
    const results = await fetchJson<
      Array<{
        display_name?: string
        name?: string
        lat?: string
        lon?: string
        osm_id?: number
        osm_type?: string
        type?: string
      }>
    >(url, {
      headers: { 'user-agent': UA },
    })
    if (!results) return null
    return results.map((item) => ({
      title: item.name ?? item.display_name?.split(',')[0] ?? query,
      address: item.display_name,
      coordinates:
        item.lat && item.lon ? { lat: Number(item.lat), lng: Number(item.lon) } : undefined,
      externalRefs: {
        provider: 'openstreetmap',
        osmId: item.osm_type && item.osm_id ? `${item.osm_type}:${item.osm_id}` : undefined,
        osmType: item.osm_type,
        type: item.type,
      },
    }))
  }

  async reverseGeocode(input: { coordinates: TravelCoordinates; lang?: string }) {
    if (!publicProvidersEnabled()) return null
    const cacheKey = `reverse-geocode:v2:${toApiLang(input.lang)}:${input.coordinates.lat.toFixed(
      5,
    )},${input.coordinates.lng.toFixed(5)}`
    return this.cacheThrough({
      key: cacheKey,
      load: async () => {
        const url = new URL('https://nominatim.openstreetmap.org/reverse')
        url.searchParams.set('format', 'jsonv2')
        url.searchParams.set('addressdetails', '1')
        url.searchParams.set('lat', String(input.coordinates.lat))
        url.searchParams.set('lon', String(input.coordinates.lng))
        url.searchParams.set('accept-language', toApiLang(input.lang))
        const data = await fetchJson<{
          display_name?: string
          name?: string
          address?: Record<string, string>
        }>(url, { headers: { 'user-agent': UA } })
        if (!data) return null
        const address = data.address ?? {}
        return {
          provider: 'openstreetmap',
          name:
            data.name ??
            address.tourism ??
            address.amenity ??
            address.shop ??
            address.building ??
            address.road ??
            null,
          address: data.display_name ?? null,
        }
      },
      provider: 'nominatim',
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      staleTtlMs: 30 * 24 * 60 * 60 * 1000,
    })
  }

  async placeDetails(input: {
    placeId: string
    lang?: string
    expanded?: boolean
    googleMapsApiKey?: string
  }) {
    if (input.placeId.includes(':')) return this.osmPlaceDetails(input.placeId, input.lang)
    if (!input.googleMapsApiKey) return null
    const cacheKey = `google-details:${input.placeId}:${toApiLang(input.lang)}:${input.expanded ? 'x' : 'n'}`
    const cached = await this.cacheGet<Record<string, unknown>>(cacheKey)
    if (cached) return cached
    const mask = input.expanded
      ? 'id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri,nationalPhoneNumber,regularOpeningHours,googleMapsUri,reviews,editorialSummary,photos'
      : 'id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri,nationalPhoneNumber,regularOpeningHours,googleMapsUri,photos'
    const url = new URL(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}`,
    )
    url.searchParams.set('languageCode', toApiLang(input.lang))
    const data = await fetchJson<GooglePlaceDetails>(url, {
      headers: {
        'x-goog-api-key': input.googleMapsApiKey,
        'x-goog-fieldmask': mask,
      },
    })
    if (!data) return null
    return this.cacheSet(
      'google-places',
      cacheKey,
      {
        source: 'google',
        googlePlaceId: data.id,
        title: data.displayName?.text ?? '',
        address: data.formattedAddress ?? '',
        coordinates: data.location
          ? { lat: data.location.latitude, lng: data.location.longitude }
          : undefined,
        rating: data.rating ?? null,
        ratingCount: data.userRatingCount ?? null,
        website: data.websiteUri ?? null,
        phone: data.nationalPhoneNumber ?? null,
        openingHours: data.regularOpeningHours?.weekdayDescriptions ?? null,
        openNow: data.regularOpeningHours?.openNow ?? null,
        summary: data.editorialSummary?.text ?? null,
        reviews: (data.reviews ?? []).slice(0, 5).map((review) => ({
          author: review.authorAttribution?.displayName ?? null,
          rating: review.rating ?? null,
          text: review.text?.text ?? null,
          time: review.relativePublishTimeDescription ?? null,
        })),
        photos: (data.photos ?? []).slice(0, 5).map((photo) => ({
          name: photo.name,
          attribution: photo.authorAttributions?.[0]?.displayName ?? null,
        })),
        externalRefs: { googleMapsUri: data.googleMapsUri },
      },
      7 * 24 * 60 * 60 * 1000,
    )
  }

  private async osmPlaceDetails(placeId: string, lang?: string) {
    const [osmType, osmId] = placeId.split(':')
    if (!osmType || !osmId) return null
    const cacheKey = `osm-details:v2:${placeId}:${toApiLang(lang)}`
    return this.cacheThrough({
      key: cacheKey,
      load: async () => {
        const typePrefix = osmType.charAt(0).toUpperCase()
        const lookup = new URL('https://nominatim.openstreetmap.org/lookup')
        lookup.searchParams.set('osm_ids', `${typePrefix}${osmId}`)
        lookup.searchParams.set('format', 'jsonv2')
        lookup.searchParams.set('accept-language', toApiLang(lang))
        const data = await fetchJson<
          Array<{
            display_name?: string
            name?: string
            lat?: string
            lon?: string
            extratags?: Record<string, string>
          }>
        >(lookup, { headers: { 'user-agent': UA } })
        if (!data) return null
        const item = data[0]
        return {
          source: 'openstreetmap',
          osmId: placeId,
          title: item?.name ?? item?.display_name?.split(',')[0] ?? '',
          address: item?.display_name ?? '',
          coordinates:
            item?.lat && item.lon ? { lat: Number(item.lat), lng: Number(item.lon) } : undefined,
          website: item?.extratags?.website ?? null,
          phone: item?.extratags?.phone ?? null,
        }
      },
      provider: 'nominatim',
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      staleTtlMs: 30 * 24 * 60 * 60 * 1000,
    })
  }

  async searchPois(input: {
    category: string
    bbox: { south: number; west: number; north: number; east: number }
    limit?: number
    overpassUrl?: string
  }) {
    if (!publicProvidersEnabled()) return { pois: [], source: 'disabled' }
    const filters = CATEGORY_OSM_FILTERS[input.category]
    if (!filters) return { pois: [], source: 'openstreetmap', error: 'unknown_category' }
    let { south, west, north, east } = input.bbox
    let clamped = false
    if (north - south > 0.5) {
      const center = (north + south) / 2
      south = center - 0.25
      north = center + 0.25
      clamped = true
    }
    if (east - west > 0.5) {
      const center = (east + west) / 2
      west = center - 0.25
      east = center + 0.25
      clamped = true
    }
    const limit = Math.min(Math.max(input.limit ?? 60, 1), 100)
    const cacheKey = `poi:v2:${input.category}:${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}:${limit}`
    const cached = await this.cacheLookup<Record<string, unknown>>(cacheKey)
    if (cached?.fresh) return cached.value
    const existing = poiInflight.get(cacheKey)
    if (existing) return cached?.value ?? existing
    const task = (async () => {
      const box = `(${south},${west},${north},${east})`
      const selectors = filters
        .map((filter) => {
          const [key, value] = filter.split('=')
          return `nwr["${key}"="${value}"]${box};`
        })
        .join('')
      const query = `[out:json][timeout:20];(${selectors});out center tags ${limit + 25};`
      const endpoints = resolveOverpassEndpoints(input.overpassUrl)
      const elements = await overpassFetch(endpoints, query)
      const pois = elements
        .flatMap((element) => {
          const tags = element.tags ?? {}
          const title = tags.name ?? tags['name:en'] ?? tags.brand
          const lat = element.lat ?? element.center?.lat
          const lng = element.lon ?? element.center?.lon
          if (!title || lat === undefined || lng === undefined) return []
          const matched = filters.find((filter) => {
            const [key, value] = filter.split('=')
            if (!key) return false
            return tags[key] === value
          })
          const metadata = poiMetadata(input.category, tags, matched)
          return [
            {
              title,
              category: input.category,
              poiType: metadata.label,
              iconKind: metadata.iconKind,
              lineRefs: metadata.lineRefs,
              lineColors: metadata.lineColors,
              coordinates: { lat, lng },
              address:
                [
                  tags['addr:street'],
                  tags['addr:housenumber'],
                  tags['addr:postcode'],
                  tags['addr:city'],
                ]
                  .filter(Boolean)
                  .join(' ') || null,
              website: tags.website ?? tags['contact:website'] ?? null,
              phone: tags.phone ?? tags['contact:phone'] ?? null,
              openingHours: tags.opening_hours ?? null,
              externalRefs: { provider: 'openstreetmap', osmId: `${element.type}:${element.id}` },
            },
          ]
        })
        .slice(0, limit)
      return this.cacheSet(
        'overpass',
        cacheKey,
        { pois, source: 'openstreetmap', clamped },
        20 * 60 * 1000,
      )
    })().finally(() => {
      poiInflight.delete(cacheKey)
    })
    poiInflight.set(cacheKey, task)
    if (cached) {
      void task.catch(() => undefined)
      return cached.value
    }
    return task
  }

  async resolveMapsUrl(urlText: string) {
    if (!publicProvidersEnabled()) return null
    const parsed = new URL(urlText)
    const allowedHosts = new Set([
      'goo.gl',
      'maps.app.goo.gl',
      'google.com',
      'www.google.com',
      'maps.google.com',
    ])
    if (!allowedHosts.has(parsed.hostname)) throw new Error('Only Google Maps URLs are supported')
    const response = await safeFetchFollow(parsed, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(10_000),
    })
    const resolved = response.url || urlText
    const body = await response.text().catch(() => '')
    const coords = extractGoogleMapCoordinates(`${resolved}\n${body}`)
    if (!coords) return null
    const reverse = await this.reverseGeocode({ coordinates: coords })
    return {
      coordinates: coords,
      name: reverse?.name ?? null,
      address: reverse?.address ?? null,
      url: resolved,
    }
  }

  async placePhoto(input: {
    placeId: string
    coordinates: TravelCoordinates
    name?: string
    googleMapsApiKey?: string
  }): Promise<PlacePhotoResult | null> {
    const cacheKey = photoCacheKey(
      `v2:${input.placeId}:${input.coordinates.lat}:${input.coordinates.lng}`,
    )
    const cached = await this.readCachedPhoto(cacheKey)
    if (cached) return cached
    const inflight = photoInflight.get(cacheKey)
    if (inflight) return inflight
    const task = this.fetchAndCachePlacePhoto(cacheKey, input).finally(() =>
      photoInflight.delete(cacheKey),
    )
    photoInflight.set(cacheKey, task)
    return task
  }

  async placePhotoBytes(cacheKey: string) {
    const safeKey = cacheKey.replace(/[^a-z0-9]/gi, '')
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      const path = photoPath(safeKey, contentType)
      const bytes = await readFile(path).catch(() => null)
      if (bytes) return { bytes, contentType }
    }
    return null
  }

  private async readCachedPhoto(cacheKey: string): Promise<PlacePhotoResult | null> {
    const bytes = await this.placePhotoBytes(cacheKey)
    if (!bytes) return null
    return {
      cacheKey,
      photoUrl: `/api/providers/places/photo/${cacheKey}/bytes`,
      contentType: bytes.contentType,
      attribution: null,
    }
  }

  private async fetchAndCachePlacePhoto(
    cacheKey: string,
    input: {
      placeId: string
      coordinates: TravelCoordinates
      name?: string
      googleMapsApiKey?: string
    },
  ) {
    const google = input.googleMapsApiKey
      ? await this.fetchGooglePlacePhoto(input.placeId, input.googleMapsApiKey)
      : null
    const source = google ?? (await this.fetchWikimediaPhoto(input.coordinates, input.name))
    if (!source) return null
    const response = await safeFetchFollow(source.url, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)
    if (!response?.ok) return null
    const contentType =
      (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0] ?? 'image/jpeg'
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > 15 * 1024 * 1024) return null
    const path = photoPath(cacheKey, contentType)
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    await writeFile(tmp, bytes)
    await rename(tmp, path)
    return {
      cacheKey,
      photoUrl: `/api/providers/places/photo/${cacheKey}/bytes`,
      contentType,
      attribution: source.attribution,
    }
  }

  private async fetchGooglePlacePhoto(placeId: string, apiKey: string) {
    const details = await fetchJson<GooglePlaceDetails>(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          'x-goog-api-key': apiKey,
          'x-goog-fieldmask': 'photos',
        },
      },
    )
    const photo = details?.photos?.[0]
    if (!photo?.name) return null
    return {
      url: `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=800&key=${encodeURIComponent(apiKey)}`,
      attribution: photo.authorAttributions?.[0]?.displayName ?? null,
    }
  }

  private async fetchWikimediaPhoto(coordinates: TravelCoordinates, name?: string) {
    if (name) {
      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        titles: name,
        prop: 'pageimages',
        piprop: 'thumbnail',
        pithumbsize: '800',
        redirects: '1',
      })
      const data = await fetchJson<{
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> }
      }>(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'user-agent': UA } })
      const photo = Object.values(data?.query?.pages ?? {}).find((page) => page.thumbnail?.source)
      if (photo?.thumbnail?.source) return { url: photo.thumbnail.source, attribution: 'Wikipedia' }
    }
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'geosearch',
      ggsprimary: 'all',
      ggsnamespace: '6',
      ggsradius: '300',
      ggscoord: `${coordinates.lat}|${coordinates.lng}`,
      ggslimit: '5',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '800',
    })
    const data = await fetchJson<{
      query?: {
        pages?: Record<
          string,
          {
            title?: string
            imageinfo?: Array<{
              url?: string
              thumburl?: string
              mime?: string
              extmetadata?: { Artist?: { value?: string } }
            }>
          }
        >
      }
    }>(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'user-agent': UA } })
    const pages = Object.values(data?.query?.pages ?? {}).sort(
      (left, right) => photoTitleScore(right.title, name) - photoTitleScore(left.title, name),
    )
    for (const page of pages) {
      const info = page.imageinfo?.[0]
      if (info?.url && (info.thumburl || info.mime === 'image/jpeg' || info.mime === 'image/png')) {
        return {
          url: info.thumburl ?? info.url,
          attribution:
            info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '') ?? 'Wikimedia Commons',
        }
      }
    }
    return null
  }

  async transitGeocode(input: {
    query: string
    lang?: string
    near?: string
    transitApiUrl?: string
  }) {
    if (!publicProvidersEnabled()) return { results: [], source: 'disabled' }
    const text = input.query.trim()
    if (text.length < 2) return { results: [], source: 'transitous' }
    const params = new URLSearchParams({ text })
    if (input.lang) params.set('language', input.lang.slice(0, 5))
    if (input.near && validCoord(input.near)) params.set('place', input.near)
    const base = (
      input.transitApiUrl ??
      process.env.TRANSIT_API_URL ??
      'https://api.transitous.org'
    ).replace(/\/+$/, '')
    const cacheKey = `transit-geocode:v2:${base}:${params}`
    const result = await this.cacheThrough({
      key: cacheKey,
      load: async () => {
        const data = await safeJson<
          Array<{
            name?: string
            lat?: number
            lon?: number
            type?: string
            areas?: Array<{ name?: string }>
          }>
        >(`${base}/api/v1/geocode?${params}`, {
          headers: { 'user-agent': UA, accept: 'application/json' },
        })
        if (!data) return null
        return {
          source: 'transitous',
          results: data.slice(0, 8).flatMap((item) =>
            item.name && typeof item.lat === 'number' && typeof item.lon === 'number'
              ? [
                  {
                    name: item.name,
                    lat: item.lat,
                    lng: item.lon,
                    type: item.type ?? 'PLACE',
                    area: item.areas?.[0]?.name ?? null,
                  },
                ]
              : [],
          ),
        }
      },
      provider: 'transitous',
      ttlMs: 24 * 60 * 60 * 1000,
      staleTtlMs: 7 * 24 * 60 * 60 * 1000,
    })
    return result ?? { results: [], source: 'transitous' }
  }

  async transitPlan(input: TransitPlanInput & { transitApiUrl?: string }) {
    if (!publicProvidersEnabled()) return { itineraries: [], source: 'disabled' }
    const modes = input.modes
      ?.split(',')
      .map((mode) => mode.trim().toUpperCase())
      .filter(Boolean)
    if (modes?.some((mode) => !ALLOWED_TRANSIT_MODES.has(mode)))
      throw new Error('Unsupported transit mode')
    const params = new URLSearchParams({
      fromPlace: input.from,
      toPlace: input.to,
      numItineraries: '8',
      directModes: 'WALK',
    })
    if (input.time) params.set('time', new Date(input.time).toISOString())
    if (input.arriveBy) params.set('arriveBy', 'true')
    if (modes?.length) params.set('transitModes', modes.join(','))
    if (input.maxTransfers !== undefined) params.set('maxTransfers', String(input.maxTransfers))
    const base = (
      input.transitApiUrl ??
      process.env.TRANSIT_API_URL ??
      'https://api.transitous.org'
    ).replace(/\/+$/, '')
    const cacheKey = `transit:v2:${base}:${params}`
    const result = await this.cacheThrough({
      key: cacheKey,
      load: async () => {
        const raw = await safeJson<MotisPlanResponse>(`${base}/api/v6/plan?${params}`, {
          headers: { 'user-agent': UA, accept: 'application/json' },
        })
        if (!raw) return null
        return {
          source: 'transitous',
          itineraries: (raw.itineraries ?? []).slice(0, 8).map(mapTransitItinerary),
        }
      },
      provider: 'transitous',
      ttlMs: 60 * 1000,
      staleTtlMs: 10 * 60 * 1000,
    })
    return result ?? { itineraries: [], source: 'transitous' }
  }

  async routePlan(input: {
    mode: 'driving' | 'walking' | 'cycling'
    coordinates: TravelCoordinates[]
  }) {
    if (!publicProvidersEnabled()) return null
    const profileBase =
      input.mode === 'walking'
        ? 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
        : input.mode === 'cycling'
          ? 'https://routing.openstreetmap.de/routed-bike/route/v1/bike'
          : 'https://routing.openstreetmap.de/routed-car/route/v1/driving'
    const coords = input.coordinates.map((point) => `${point.lng},${point.lat}`).join(';')
    const url = new URL(`${profileBase}/${coords}`)
    url.searchParams.set('overview', 'full')
    url.searchParams.set('geometries', 'geojson')
    url.searchParams.set('annotations', 'distance,duration')
    const cacheKey = `route:v2:${input.mode}:${input.coordinates
      .map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
      .join(';')}`
    return this.cacheThrough({
      key: cacheKey,
      load: async () => {
        const data = await fetchJson<{
          code?: string
          routes?: Array<{
            distance?: number
            duration?: number
            geometry?: { coordinates?: number[][] }
            legs?: Array<{ distance?: number; duration?: number }>
          }>
        }>(url, { headers: { 'user-agent': UA } })
        const route = data?.code === 'Ok' ? data.routes?.[0] : null
        if (!route) return null
        return {
          source: 'osrm',
          mode: input.mode,
          distanceMeters: Math.round(route.distance ?? 0),
          durationSeconds: Math.round(route.duration ?? 0),
          coordinates: (route.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
          legs: (route.legs ?? []).map((leg) => ({
            distanceMeters: Math.round(leg.distance ?? 0),
            durationSeconds: Math.round(leg.duration ?? 0),
          })),
        }
      },
      provider: 'osrm',
      ttlMs: 15 * 60 * 1000,
      staleTtlMs: 24 * 60 * 60 * 1000,
    })
  }

  async searchUnsplash(input: { query: string; perPage?: number; accessKey?: string }) {
    const perPage = Math.min(Math.max(input.perPage ?? 9, 1), 30)
    if (!input.accessKey) {
      return {
        source: 'unsplash',
        connected: false,
        configured: false,
        errorCode: 'missing_config',
        warning: 'Unsplash access key is required for photo search',
        photos: [],
      }
    }
    const params = new URLSearchParams({ query: input.query, page: '1', per_page: String(perPage) })
    const response = await fetchJson<UnsplashSearchResponse>(
      `https://api.unsplash.com/search/photos?${params}`,
      {
        headers: {
          authorization: `Client-ID ${input.accessKey}`,
          'accept-version': 'v1',
        },
      },
    )
    const photos = (response?.results ?? []).slice(0, perPage).flatMap((photo) =>
      photo.urls?.regular
        ? [
            {
              id: photo.id,
              url: photo.urls.regular,
              thumb: photo.urls.small ?? photo.urls.thumb ?? photo.urls.regular,
              description: photo.description ?? photo.alt_description ?? null,
              photographer: photo.user?.name ?? null,
              link: photo.links?.html ?? null,
            },
          ]
        : [],
    )
    return {
      source: 'unsplash',
      connected: Boolean(response),
      configured: true,
      errorCode: response ? undefined : 'provider_error',
      warning: response ? undefined : 'Unsplash did not return a usable search response',
      photos,
    }
  }

  async airtrailFlights(input: { baseUrl: string; apiKey: string; allowInsecureTls?: boolean }) {
    const base = input.baseUrl.replace(/\/+$/, '').replace(/\/api$/i, '')
    const data = await safeJson<{ flights?: AirtrailFlight[] }>(`${base}/api/flight/list`, {
      headers: { authorization: `Bearer ${input.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    return { source: 'airtrail', flights: (data?.flights ?? []).map(normalizeAirtrailFlight) }
  }

  async airtrailStatus(input: { baseUrl: string; apiKey: string; allowInsecureTls?: boolean }) {
    const started = now()
    const result = await this.airtrailFlights(input).catch((error) => ({
      source: 'airtrail',
      flights: [],
      error: error instanceof Error ? error.message : String(error),
    }))
    return {
      source: 'airtrail',
      connected: !('error' in result),
      flightCount: result.flights.length,
      latencyMs: now() - started,
      error: 'error' in result ? result.error : undefined,
    }
  }

  async immichSearch(input: {
    baseUrl: string
    apiKey: string
    from?: string
    to?: string
    page?: number
    size?: number
  }) {
    const body = {
      takenAfter: input.from ? `${input.from}T00:00:00.000Z` : undefined,
      takenBefore: input.to ? `${input.to}T23:59:59.999Z` : undefined,
      page: input.page ?? 1,
      size: input.size ?? 50,
    }
    const data = await safeJson<{ assets?: { items?: ImmichAsset[] } }>(
      `${input.baseUrl.replace(/\/+$/, '')}/api/search/metadata`,
      {
        method: 'POST',
        headers: { 'x-api-key': input.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    )
    return {
      source: 'immich',
      assets: (data?.assets?.items ?? []).map((asset) => ({
        id: asset.id,
        takenAt: asset.fileCreatedAt ?? asset.createdAt,
        city: asset.exifInfo?.city ?? null,
        country: asset.exifInfo?.country ?? null,
        mediaType: asset.type === 'VIDEO' ? 'video' : 'image',
        coordinates:
          typeof asset.exifInfo?.latitude === 'number' &&
          typeof asset.exifInfo?.longitude === 'number'
            ? { lat: asset.exifInfo.latitude, lng: asset.exifInfo.longitude }
            : undefined,
      })),
    }
  }

  async immichStatus(input: { baseUrl: string; apiKey: string }) {
    const started = now()
    const response = await safeJson<{ name?: string; email?: string }>(
      `${input.baseUrl.replace(/\/+$/, '')}/api/users/me`,
      {
        headers: { 'x-api-key': input.apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      },
    )
    return {
      source: 'immich',
      connected: Boolean(response),
      latencyMs: now() - started,
      user: response ? { name: response.name, email: response.email } : undefined,
    }
  }

  async immichAlbums(input: { baseUrl: string; apiKey: string }) {
    const albums = await safeJson<
      Array<{
        id?: string
        albumName?: string
        assetCount?: number
        startDate?: string
        endDate?: string
      }>
    >(`${input.baseUrl.replace(/\/+$/, '')}/api/albums`, {
      headers: { 'x-api-key': input.apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    return {
      source: 'immich',
      albums: (albums ?? []).map((album) => ({
        id: album.id,
        title: album.albumName,
        assetCount: album.assetCount ?? 0,
        startDate: album.startDate,
        endDate: album.endDate,
      })),
    }
  }

  async immichAssetInfo(input: { baseUrl: string; apiKey: string; assetId: string }) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(input.assetId)) return null
    const asset = await safeJson<ImmichAsset>(
      `${input.baseUrl.replace(/\/+$/, '')}/api/assets/${encodeURIComponent(input.assetId)}`,
      {
        headers: { 'x-api-key': input.apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!asset) return null
    return {
      source: 'immich',
      id: asset.id,
      takenAt: asset.fileCreatedAt ?? asset.createdAt,
      city: asset.exifInfo?.city ?? null,
      country: asset.exifInfo?.country ?? null,
      mediaType: asset.type === 'VIDEO' ? 'video' : 'image',
      coordinates:
        typeof asset.exifInfo?.latitude === 'number' &&
        typeof asset.exifInfo?.longitude === 'number'
          ? { lat: asset.exifInfo.latitude, lng: asset.exifInfo.longitude }
          : undefined,
    }
  }

  async immichAssetBytes(input: {
    baseUrl: string
    apiKey: string
    assetId: string
    kind: 'thumbnail' | 'original'
  }) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(input.assetId)) return null
    const base = input.baseUrl.replace(/\/+$/, '')
    const path =
      input.kind === 'thumbnail'
        ? `/api/assets/${encodeURIComponent(input.assetId)}/thumbnail?size=thumbnail`
        : `/api/assets/${encodeURIComponent(input.assetId)}/original`
    const response = await safeFetch(`${base}${path}`, {
      headers: { 'x-api-key': input.apiKey },
      signal: AbortSignal.timeout(input.kind === 'thumbnail' ? 10_000 : 60_000),
    }).catch(() => null)
    if (!response?.ok) return null
    const contentType = (response.headers.get('content-type') ?? 'application/octet-stream').split(
      ';',
    )[0]
    return { bytes: Buffer.from(await response.arrayBuffer()), contentType }
  }

  async synologyStatus(input: { baseUrl: string; username: string; password: string }) {
    const started = now()
    const url = `${input.baseUrl.replace(/\/+$/, '')}/webapi/entry.cgi`
    const body = new URLSearchParams({
      api: 'SYNO.API.Auth',
      method: 'login',
      version: '6',
      account: input.username,
      passwd: input.password,
      format: 'sid',
      client: 'browser',
      device_name: 'shadow-travel',
    })
    const data = await safeJson<{
      success?: boolean
      error?: { code?: number }
      data?: { sid?: string }
    }>(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    return {
      source: 'synologyphotos',
      connected: Boolean(data?.success && data.data?.sid),
      latencyMs: now() - started,
      errorCode: data?.error?.code,
    }
  }

  async synologySearch(input: {
    baseUrl: string
    username: string
    password: string
    from?: string
    to?: string
    offset?: number
    limit?: number
  }) {
    const sid = await this.synologySid(input)
    if (!sid) return { source: 'synologyphotos', assets: [], connected: false }
    const data = await this.synologyApi<{ list?: SynologyPhotoItem[] }>(input.baseUrl, {
      api: 'SYNO.Foto.Search.Search',
      method: 'list_item',
      version: '1',
      start_time: input.from ? Math.floor(new Date(input.from).getTime() / 1000) : undefined,
      end_time: input.to
        ? Math.floor(new Date(`${input.to}T23:59:59Z`).getTime() / 1000)
        : undefined,
      offset: input.offset ?? 0,
      limit: Math.min(Math.max(input.limit ?? 100, 1), 300),
      additional: ['thumbnail', 'address', 'gps'],
      _sid: sid,
    })
    return {
      source: 'synologyphotos',
      assets: (data?.list ?? []).map(normalizeSynologyPhoto),
    }
  }

  async synologyAlbums(input: { baseUrl: string; username: string; password: string }) {
    const sid = await this.synologySid(input)
    if (!sid) return { source: 'synologyphotos', albums: [], connected: false }
    const data = await this.synologyApi<{
      list?: Array<{ id?: number; name?: string; item_count?: number }>
    }>(input.baseUrl, {
      api: 'SYNO.Foto.Browse.Album',
      method: 'list',
      version: '4',
      offset: 0,
      limit: 200,
      _sid: sid,
    })
    return {
      source: 'synologyphotos',
      albums: (data?.list ?? []).map((album) => ({
        id: String(album.id ?? ''),
        title: album.name ?? '',
        assetCount: album.item_count ?? 0,
      })),
    }
  }

  async synologyAssetBytes(input: {
    baseUrl: string
    username: string
    password: string
    assetId: string
    kind: 'thumbnail' | 'original'
  }) {
    const sid = await this.synologySid(input)
    const unitId = input.assetId.split('_')[0] ?? ''
    if (!sid || !/^\d+$/.test(unitId)) return null
    const body = new URLSearchParams()
    body.set('api', 'SYNO.Foto.Thumbnail')
    body.set('method', 'get')
    body.set('version', '2')
    body.set('id', unitId)
    body.set('cache_key', input.assetId)
    body.set('type', 'unit')
    body.set('size', input.kind === 'thumbnail' ? 'sm' : 'xl')
    body.set('mode', 'download')
    body.set('_sid', sid)
    const response = await safeFetch(`${input.baseUrl.replace(/\/+$/, '')}/webapi/entry.cgi`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      signal: AbortSignal.timeout(input.kind === 'thumbnail' ? 10_000 : 60_000),
    }).catch(() => null)
    if (!response?.ok) return null
    const contentType = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
    return { bytes: Buffer.from(await response.arrayBuffer()), contentType }
  }

  private async synologySid(input: { baseUrl: string; username: string; password: string }) {
    const status = await this.synologyStatus(input).catch(() => null)
    if (!status?.connected) return null
    const url = `${input.baseUrl.replace(/\/+$/, '')}/webapi/entry.cgi`
    const body = new URLSearchParams({
      api: 'SYNO.API.Auth',
      method: 'login',
      version: '6',
      account: input.username,
      passwd: input.password,
      format: 'sid',
      client: 'browser',
      device_name: 'shadow-travel',
    })
    const data = await safeJson<{ success?: boolean; data?: { sid?: string } }>(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    return data?.success ? (data.data?.sid ?? null) : null
  }

  private async synologyApi<T>(baseUrl: string, params: Record<string, unknown>) {
    const body = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
    }
    const data = await safeJson<{ success?: boolean; data?: T }>(
      `${baseUrl.replace(/\/+$/, '')}/webapi/entry.cgi`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
        signal: AbortSignal.timeout(30_000),
      },
    )
    return data?.success ? (data.data ?? null) : null
  }

  async deleteCachedPhoto(cacheKey: string) {
    await Promise.all(
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].map((contentType) =>
        unlink(photoPath(cacheKey, contentType)).catch(() => undefined),
      ),
    )
  }
}

export function photoTitleScore(title?: string, name?: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/^file:/, '')
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
      .trim()
  const candidate = normalize(title ?? '')
  const target = normalize(name ?? '')
  if (!candidate || !target) return 0
  if (candidate === target) return 1000
  if (candidate.includes(target) || target.includes(candidate)) return 500
  const targetTokens = new Set(target.split(' ').filter((token) => token.length > 2))
  if (targetTokens.size === 0) return 0
  const candidateTokens = new Set(candidate.split(' '))
  let overlap = 0
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) overlap += 1
  }
  return overlap / targetTokens.size
}

interface OpenMeteoWeather {
  timezone?: string
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    weathercode?: number[]
    precipitation_sum?: number[]
    precipitation_probability_max?: number[]
    windspeed_10m_max?: number[]
    sunrise?: string[]
    sunset?: string[]
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    precipitation_probability?: number[]
    precipitation?: number[]
    weathercode?: number[]
    windspeed_10m?: number[]
    relativehumidity_2m?: number[]
  }
}

interface OpenMeteoAirQuality {
  timezone?: string
  hourly?: {
    time?: string[]
    us_aqi?: number[]
    pm10?: number[]
    pm2_5?: number[]
    carbon_monoxide?: number[]
    nitrogen_dioxide?: number[]
    ozone?: number[]
  }
}

interface AirQualityPoint {
  time: string
  aqi?: number
  pm10?: number
  pm2_5?: number
  carbon_monoxide?: number
  nitrogen_dioxide?: number
  ozone?: number
}

interface AirQualityDay {
  provider: 'open-meteo-air-quality'
  aqi?: number
  pm10?: number
  pm2_5?: number
  carbon_monoxide?: number
  nitrogen_dioxide?: number
  ozone?: number
  hourly: AirQualityPoint[]
}

function mapOpenMeteoDay(
  data: OpenMeteoWeather | null,
  date: string,
  type: string,
  detailed?: boolean,
  airQuality?: AirQualityDay | null,
) {
  const daily = data?.daily
  const index = daily?.time?.indexOf(date) ?? 0
  const safeIndex = index >= 0 ? index : 0
  const code = daily?.weathercode?.[safeIndex]
  const tempMax = daily?.temperature_2m_max?.[safeIndex] ?? 0
  const tempMin = daily?.temperature_2m_min?.[safeIndex] ?? 0
  const hourly = data?.hourly
  const airQualityByTime = new Map((airQuality?.hourly ?? []).map((item) => [item.time, item]))
  return {
    provider: 'open-meteo-air-quality',
    type,
    date,
    timezone: data?.timezone,
    temp: Math.round((tempMax + tempMin) / 2),
    temp_max: Math.round(tempMax),
    temp_min: Math.round(tempMin),
    main: weatherMain(code),
    description: weatherDescription(code),
    precipitation_sum: daily?.precipitation_sum?.[safeIndex],
    precipitation_probability_max: daily?.precipitation_probability_max?.[safeIndex],
    wind_max: daily?.windspeed_10m_max?.[safeIndex],
    sunrise: daily?.sunrise?.[safeIndex],
    sunset: daily?.sunset?.[safeIndex],
    air_quality: airQuality
      ? {
          provider: airQuality.provider,
          aqi: airQuality.aqi,
          pm10: airQuality.pm10,
          pm2_5: airQuality.pm2_5,
          carbon_monoxide: airQuality.carbon_monoxide,
          nitrogen_dioxide: airQuality.nitrogen_dioxide,
          ozone: airQuality.ozone,
        }
      : undefined,
    hourly: detailed
      ? (hourly?.time ?? []).map((time, hourIndex) => ({
          time,
          temp: hourly?.temperature_2m?.[hourIndex],
          precipitation: hourly?.precipitation?.[hourIndex],
          precipitation_probability: hourly?.precipitation_probability?.[hourIndex],
          wind: hourly?.windspeed_10m?.[hourIndex],
          humidity: hourly?.relativehumidity_2m?.[hourIndex],
          main: weatherMain(hourly?.weathercode?.[hourIndex]),
          air_quality: airQualityByTime.get(time),
        }))
      : undefined,
  }
}

function averageNumber(values: Array<number | undefined>) {
  const numbers = values.filter((value): value is number => Number.isFinite(value))
  if (!numbers.length) return undefined
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10
}

function mapOpenMeteoAirQuality(
  data: OpenMeteoAirQuality | null,
  date: string,
): AirQualityDay | null {
  const hourly = data?.hourly
  const points = (hourly?.time ?? [])
    .map<AirQualityPoint>((time, index) => ({
      time,
      aqi: hourly?.us_aqi?.[index],
      pm10: hourly?.pm10?.[index],
      pm2_5: hourly?.pm2_5?.[index],
      carbon_monoxide: hourly?.carbon_monoxide?.[index],
      nitrogen_dioxide: hourly?.nitrogen_dioxide?.[index],
      ozone: hourly?.ozone?.[index],
    }))
    .filter((point) => point.time.startsWith(date))
  if (!points.length) return null
  return {
    provider: 'open-meteo-air-quality',
    aqi: averageNumber(points.map((point) => point.aqi)),
    pm10: averageNumber(points.map((point) => point.pm10)),
    pm2_5: averageNumber(points.map((point) => point.pm2_5)),
    carbon_monoxide: averageNumber(points.map((point) => point.carbon_monoxide)),
    nitrogen_dioxide: averageNumber(points.map((point) => point.nitrogen_dioxide)),
    ozone: averageNumber(points.map((point) => point.ozone)),
    hourly: points,
  }
}

interface GooglePlaceResult {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  websiteUri?: string
  nationalPhoneNumber?: string
  types?: string[]
  googleMapsUri?: string
}

interface GooglePlaceDetails extends GooglePlaceResult {
  userRatingCount?: number
  regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean }
  editorialSummary?: { text?: string }
  reviews?: Array<{
    authorAttribution?: { displayName?: string }
    rating?: number
    text?: { text?: string }
    relativePublishTimeDescription?: string
  }>
  photos?: Array<{ name?: string; authorAttributions?: Array<{ displayName?: string }> }>
}

const CATEGORY_OSM_FILTERS: Record<string, string[]> = {
  restaurant: ['amenity=restaurant', 'amenity=fast_food'],
  cafe: ['amenity=cafe'],
  bar: ['amenity=bar', 'amenity=pub', 'amenity=nightclub'],
  hotel: [
    'tourism=hotel',
    'tourism=hostel',
    'tourism=guest_house',
    'tourism=apartment',
    'tourism=motel',
  ],
  sights: [
    'tourism=attraction',
    'tourism=viewpoint',
    'historic=monument',
    'historic=castle',
    'historic=memorial',
    'historic=ruins',
  ],
  museum: ['tourism=museum', 'tourism=gallery', 'tourism=artwork', 'amenity=theatre'],
  nature: ['leisure=park', 'leisure=garden', 'natural=beach', 'natural=peak'],
  activity: ['tourism=theme_park', 'tourism=zoo', 'tourism=aquarium', 'leisure=water_park'],
  shopping: ['shop=mall', 'shop=department_store', 'amenity=marketplace'],
  supermarket: ['shop=supermarket', 'shop=convenience'],
  essentials: ['amenity=toilets', 'amenity=atm', 'amenity=pharmacy', 'amenity=drinking_water'],
  transport: [
    'public_transport=station',
    'public_transport=stop_position',
    'amenity=bus_station',
    'highway=bus_stop',
    'railway=station',
    'railway=subway_entrance',
    'railway=tram_stop',
  ],
}

const OSM_FILTER_LABELS: Record<string, { label: string; iconKind: string }> = {
  'amenity=atm': { iconKind: 'essentials', label: 'ATM' },
  'amenity=bar': { iconKind: 'bar', label: 'Bar' },
  'amenity=bus_station': { iconKind: 'bus', label: 'Bus station' },
  'amenity=cafe': { iconKind: 'cafe', label: 'Cafe' },
  'amenity=drinking_water': { iconKind: 'essentials', label: 'Drinking water' },
  'amenity=fast_food': { iconKind: 'fast_food', label: 'Fast food' },
  'amenity=marketplace': { iconKind: 'shopping', label: 'Market' },
  'amenity=nightclub': { iconKind: 'bar', label: 'Nightlife' },
  'amenity=pharmacy': { iconKind: 'essentials', label: 'Pharmacy' },
  'amenity=pub': { iconKind: 'bar', label: 'Pub' },
  'amenity=restaurant': { iconKind: 'restaurant', label: 'Restaurant' },
  'amenity=theatre': { iconKind: 'museum', label: 'Theatre' },
  'amenity=toilets': { iconKind: 'essentials', label: 'Toilets' },
  'highway=bus_stop': { iconKind: 'bus', label: 'Bus stop' },
  'historic=castle': { iconKind: 'sights', label: 'Castle' },
  'historic=memorial': { iconKind: 'sights', label: 'Memorial' },
  'historic=monument': { iconKind: 'sights', label: 'Monument' },
  'historic=ruins': { iconKind: 'sights', label: 'Ruins' },
  'leisure=garden': { iconKind: 'nature', label: 'Garden' },
  'leisure=park': { iconKind: 'nature', label: 'Park' },
  'natural=beach': { iconKind: 'nature', label: 'Beach' },
  'natural=peak': { iconKind: 'nature', label: 'Viewpoint' },
  'public_transport=station': { iconKind: 'station', label: 'Transit station' },
  'public_transport=stop_position': { iconKind: 'station', label: 'Transit stop' },
  'railway=station': { iconKind: 'rail', label: 'Rail station' },
  'railway=subway_entrance': { iconKind: 'subway', label: 'Metro entrance' },
  'railway=tram_stop': { iconKind: 'tram', label: 'Tram stop' },
  'shop=convenience': { iconKind: 'shopping', label: 'Convenience store' },
  'shop=department_store': { iconKind: 'shopping', label: 'Department store' },
  'shop=mall': { iconKind: 'shopping', label: 'Mall' },
  'shop=supermarket': { iconKind: 'shopping', label: 'Supermarket' },
  'tourism=apartment': { iconKind: 'hotel', label: 'Apartment stay' },
  'tourism=artwork': { iconKind: 'museum', label: 'Artwork' },
  'tourism=attraction': { iconKind: 'sights', label: 'Attraction' },
  'tourism=gallery': { iconKind: 'museum', label: 'Gallery' },
  'tourism=guest_house': { iconKind: 'hotel', label: 'Guest house' },
  'tourism=hostel': { iconKind: 'hotel', label: 'Hostel' },
  'tourism=hotel': { iconKind: 'hotel', label: 'Hotel' },
  'tourism=motel': { iconKind: 'hotel', label: 'Motel' },
  'tourism=museum': { iconKind: 'museum', label: 'Museum' },
  'tourism=viewpoint': { iconKind: 'sights', label: 'Viewpoint' },
}

const PARIS_METRO_LINE_COLORS: Record<string, string> = {
  '1': '#FFCD00',
  '2': '#0065AE',
  '3': '#9F9825',
  '3BIS': '#98D4E2',
  '4': '#C04191',
  '5': '#F28E42',
  '6': '#83C491',
  '7': '#F3A4BA',
  '7BIS': '#83C491',
  '8': '#CEADD2',
  '9': '#D5C900',
  '10': '#E3B32A',
  '11': '#8D5E2A',
  '12': '#00814F',
  '13': '#98D4E2',
  '14': '#662483',
}

const PARIS_METRO_STATION_LINES: Record<string, string[]> = {
  chatelet: ['1', '4', '7', '11', '14'],
  châtelet: ['1', '4', '7', '11', '14'],
  concorde: ['1', '8', '12'],
  'franklin d. roosevelt': ['1', '9'],
  'hotel de ville': ['1', '11'],
  'hôtel de ville': ['1', '11'],
  'louvre - rivoli': ['1'],
  'louvre rivoli': ['1'],
  'palais royal - musee du louvre': ['1', '7'],
  'palais royal - musée du louvre': ['1', '7'],
  tuileries: ['1'],
}

function poiMetadata(category: string, tags: Record<string, string>, matched?: string) {
  const known = matched ? OSM_FILTER_LABELS[matched] : undefined
  const lineRefs = category === 'transport' ? transitLineRefs(tags) : []
  return {
    iconKind: known?.iconKind ?? category,
    label: known?.label ?? humanizeOsmTag(matched ?? tags.amenity ?? tags.tourism ?? category),
    lineColors: lineRefs.map((line) => PARIS_METRO_LINE_COLORS[line.toUpperCase()] ?? '#3d7eeb'),
    lineRefs,
  }
}

function transitLineRefs(tags: Record<string, string>) {
  const raw = [tags.ref, tags.route_ref, tags.line, tags['line:ref'], tags['public_transport:line']]
    .filter(Boolean)
    .join(';')
  const refs = raw
    .split(/[;,/|]/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => /^(\d{1,2}|3BIS|7BIS)$/.test(item))
  if (refs.length) return [...new Set(refs)].slice(0, 4)
  const stationName = normalizeStationName(tags.name ?? tags['name:en'] ?? '')
  return (PARIS_METRO_STATION_LINES[stationName] ?? []).slice(0, 4)
}

function humanizeOsmTag(value: string) {
  const raw = value.includes('=') ? (value.split('=')[1] ?? value) : value
  return raw
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeStationName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function resolveOverpassEndpoints(raw?: string) {
  const custom = raw ?? process.env.OVERPASS_URL
  const parsed = (custom ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('https://') || item.startsWith('http://'))
  return parsed.length
    ? parsed
    : [
        'https://overpass-api.de/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
      ]
}

async function overpassFetch(endpoints: string[], query: string) {
  if (overpassCircuitOpenUntil > Date.now()) {
    throw new Error('Overpass circuit is temporarily open')
  }
  const body = `data=${encodeURIComponent(query)}`
  const cancellation = new AbortController()
  const timeoutMs = Number(process.env.OVERPASS_TIMEOUT_MS ?? 12_000)
  let cursor = 0
  const worker = async (hedgeDelay = 0): Promise<OverpassElement[]> => {
    if (hedgeDelay) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, hedgeDelay)
        cancellation.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(cancellation.signal.reason)
          },
          { once: true },
        )
      })
    }
    const errors: unknown[] = []
    while (cursor < endpoints.length && !cancellation.signal.aborted) {
      const endpoint = endpoints[cursor++]
      if (!endpoint) break
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(timeoutMs)]),
        })
        if (!response.ok) throw new Error(`Overpass ${response.status}`)
        const data = (await response.json()) as { elements?: OverpassElement[]; remark?: string }
        if (data.remark || !Array.isArray(data.elements)) {
          throw new Error('Overpass invalid response')
        }
        return data.elements
      } catch (error) {
        if (cancellation.signal.aborted) throw error
        errors.push(error)
      }
    }
    throw new AggregateError(errors, 'All Overpass endpoints failed')
  }
  try {
    const elements = await Promise.any([
      worker(),
      worker(Number(process.env.OVERPASS_HEDGE_DELAY_MS ?? 450)),
    ])
    overpassConsecutiveFailures = 0
    overpassCircuitOpenUntil = 0
    return elements
  } catch (error) {
    overpassConsecutiveFailures += 1
    if (overpassConsecutiveFailures >= 2) {
      overpassCircuitOpenUntil = Date.now() + Number(process.env.OVERPASS_CIRCUIT_MS ?? 30_000)
    }
    throw error
  } finally {
    cancellation.abort(new DOMException('Overpass winner selected', 'AbortError'))
  }
}

function extractGoogleMapCoordinates(value: string) {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (!match) continue
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

interface TransitPlanInput {
  from: string
  to: string
  time?: string
  arriveBy?: boolean
  modes?: string
  maxTransfers?: number
}

const ALLOWED_TRANSIT_MODES = new Set([
  'TRANSIT',
  'BUS',
  'COACH',
  'TRAM',
  'SUBWAY',
  'RAIL',
  'FERRY',
  'FUNICULAR',
  'AERIAL_LIFT',
  'HIGHSPEED_RAIL',
  'LONG_DISTANCE',
  'NIGHT_RAIL',
  'REGIONAL_RAIL',
  'SUBURBAN',
])

interface MotisPlanResponse {
  itineraries?: Array<{
    startTime?: string
    endTime?: string
    duration?: number
    transfers?: number
    legs?: Array<{
      mode?: string
      duration?: number
      distance?: number
      headsign?: string
      routeShortName?: string
      displayName?: string
      routeColor?: string
      routeTextColor?: string
      agencyName?: string
      from?: MotisPlace
      to?: MotisPlace
      intermediateStops?: unknown[]
      legGeometry?: { points?: string; precision?: number }
    }>
  }>
}

interface MotisPlace {
  name?: string
  lat?: number
  lon?: number
  departure?: string
  arrival?: string
  scheduledDeparture?: string
  scheduledArrival?: string
  track?: string
  scheduledTrack?: string
}

function mapTransitStop(place: MotisPlace | undefined, kind: 'from' | 'to') {
  return {
    name: place?.name ?? '',
    lat: place?.lat ?? 0,
    lng: place?.lon ?? 0,
    time: kind === 'from' ? (place?.departure ?? null) : (place?.arrival ?? null),
    scheduledTime:
      kind === 'from' ? (place?.scheduledDeparture ?? null) : (place?.scheduledArrival ?? null),
    track: place?.track ?? place?.scheduledTrack ?? null,
  }
}

function mapTransitItinerary(itinerary: NonNullable<MotisPlanResponse['itineraries']>[number]) {
  const legs = (itinerary.legs ?? []).map((leg) => ({
    mode: (leg.mode ?? 'WALK').toUpperCase(),
    from: mapTransitStop(leg.from, 'from'),
    to: mapTransitStop(leg.to, 'to'),
    duration: leg.duration ?? 0,
    distance: leg.distance ? Math.round(leg.distance) : null,
    headsign: leg.headsign ?? null,
    line: leg.routeShortName ?? leg.displayName ?? null,
    lineColor: leg.routeColor ? `#${leg.routeColor.replace(/^#/, '')}` : null,
    lineTextColor: leg.routeTextColor ? `#${leg.routeTextColor.replace(/^#/, '')}` : null,
    agency: leg.agencyName ?? null,
    intermediateStops: leg.intermediateStops?.length ?? 0,
    geometry: leg.legGeometry?.points ?? null,
    geometryPrecision: leg.legGeometry?.precision ?? 6,
  }))
  return {
    startTime: itinerary.startTime,
    endTime: itinerary.endTime,
    duration:
      itinerary.startTime && itinerary.endTime
        ? Math.max(
            0,
            Math.round(
              (new Date(itinerary.endTime).getTime() - new Date(itinerary.startTime).getTime()) /
                1000,
            ),
          )
        : (itinerary.duration ?? 0),
    transfers:
      itinerary.transfers ?? Math.max(0, legs.filter((leg) => leg.mode !== 'WALK').length - 1),
    walkSeconds: legs
      .filter((leg) => leg.mode === 'WALK')
      .reduce((sum, leg) => sum + leg.duration, 0),
    legs,
  }
}

interface UnsplashSearchResponse {
  results?: Array<{
    id: string
    urls?: { regular?: string; small?: string; thumb?: string }
    description?: string | null
    alt_description?: string | null
    user?: { name?: string }
    links?: { html?: string }
  }>
}

export interface AirtrailFlight {
  id?: number
  from?: { iata?: string | null; name?: string | null; lat?: number | null; lon?: number | null }
  to?: { iata?: string | null; name?: string | null; lat?: number | null; lon?: number | null }
  departure?: string | null
  arrival?: string | null
  airline?: { name?: string | null; iata?: string | null; icao?: string | null } | null
  flightNumber?: string | null
  note?: string | null
  seats?: Array<{
    guestName?: string | null
    seatNumber?: string | null
    seat?: string | null
    seatClass?: string | null
  }>
}

function normalizeAirtrailFlight(flight: AirtrailFlight) {
  const carrier = flight.airline?.name ?? flight.airline?.iata ?? flight.airline?.icao ?? undefined
  return {
    id: flight.id,
    kind: 'flight',
    title: [carrier, flight.flightNumber].filter(Boolean).join(' ') || 'Flight',
    provider: 'AirTrail',
    startAt: flight.departure ?? undefined,
    endAt: flight.arrival ?? undefined,
    passengerNames: (flight.seats ?? []).flatMap((seat) =>
      seat.guestName ? [seat.guestName] : [],
    ),
    transportDetails: {
      carrier,
      serviceNumber: flight.flightNumber ?? undefined,
      departurePlace: flight.from?.iata ?? flight.from?.name ?? undefined,
      arrivalPlace: flight.to?.iata ?? flight.to?.name ?? undefined,
      seat:
        flight.seats
          ?.map((seat) => seat.seatNumber ?? seat.seat)
          .filter(Boolean)
          .join(', ') || undefined,
      cabin: flight.seats?.find((seat) => seat.seatClass)?.seatClass ?? undefined,
    },
    rawImport: { provider: 'airtrail', id: flight.id, flight },
  }
}

interface ImmichAsset {
  id: string
  type?: string
  fileCreatedAt?: string
  createdAt?: string
  exifInfo?: {
    city?: string
    country?: string
    latitude?: number
    longitude?: number
  }
}

interface SynologyPhotoItem {
  id?: string | number
  filename?: string
  time?: number
  additional?: {
    thumbnail?: { cache_key?: string }
    address?: { city?: string; country?: string; state?: string }
    gps?: { latitude?: number; longitude?: number }
  }
}

function normalizeSynologyPhoto(item: SynologyPhotoItem) {
  const cacheKey = item.additional?.thumbnail?.cache_key ?? String(item.id ?? '')
  const gps = item.additional?.gps
  return {
    id: cacheKey,
    assetId: cacheKey,
    fileName: item.filename ?? null,
    takenAt: item.time ? new Date(item.time * 1000).toISOString() : null,
    city: item.additional?.address?.city ?? null,
    country: item.additional?.address?.country ?? null,
    state: item.additional?.address?.state ?? null,
    mediaType: 'image',
    coordinates:
      typeof gps?.latitude === 'number' && typeof gps.longitude === 'number'
        ? { lat: gps.latitude, lng: gps.longitude }
        : undefined,
  }
}
