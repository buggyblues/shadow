import { apiGet } from '../../../services/api-client.js'

export type MapContextCategory =
  | 'sights'
  | 'transport'
  | 'restaurant'
  | 'cafe'
  | 'museum'
  | 'nature'
  | 'shopping'
  | 'hotel'
  | 'essentials'

export const DEFAULT_MAP_CONTEXT_CATEGORIES: MapContextCategory[] = [
  'sights',
  'transport',
  'restaurant',
  'cafe',
]

export const MIN_CONTEXT_POI_ZOOM = 12

const DEFAULT_GRID_BUFFER_RATIO = 0.35
const MAP_CONTEXT_GRID_CACHE_TTL = 20 * 60 * 1000
const MAP_CONTEXT_GRID_CACHE_LIMIT = 720

export function createDefaultMapContextLayers(): Record<MapContextCategory, boolean> {
  const enabled = new Set<MapContextCategory>(DEFAULT_MAP_CONTEXT_CATEGORIES)
  return {
    cafe: enabled.has('cafe'),
    essentials: enabled.has('essentials'),
    hotel: enabled.has('hotel'),
    museum: enabled.has('museum'),
    nature: enabled.has('nature'),
    restaurant: enabled.has('restaurant'),
    shopping: enabled.has('shopping'),
    sights: enabled.has('sights'),
    transport: enabled.has('transport'),
  }
}

export interface MapBounds {
  south: number
  west: number
  north: number
  east: number
}

export interface MapContextPoi {
  id: string
  title: string
  category: MapContextCategory
  poiType?: string
  iconKind?: string
  lineRefs?: string[]
  lineColors?: string[]
  coordinates: {
    lat: number
    lng: number
  }
  address?: string | null
  website?: string | null
  phone?: string | null
  openingHours?: string | null
  clusterCount?: number
  externalRefs?: {
    provider?: string
    osmId?: string
    [key: string]: unknown
  }
}

export interface MapContextPoiDetails {
  source?: string
  title?: string
  address?: string | null
  website?: string | null
  phone?: string | null
  openingHours?: string | string[] | null
  rating?: number | null
  ratingCount?: number | null
  summary?: string | null
}

interface PoiSearchResponse {
  pois: Array<Omit<MapContextPoi, 'id'>>
  source: string
  clamped?: boolean
  error?: string
}

const poiResponseCache = new Map<string, PoiSearchResponse>()
const poiGridCache = new Map<
  string,
  {
    expiresAt: number
    pois: Array<Omit<MapContextPoi, 'id'>>
    source: string
  }
>()

export interface MapContextGridCell {
  id: string
  bounds: MapBounds
}

export interface MapContextGridPlan {
  bounds: MapBounds
  cells: MapContextGridCell[]
  key: string
}

async function allSettledWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
  signal?: AbortSignal,
) {
  const results = new Array<PromiseSettledResult<R>>(values.length)
  let cursor = 0
  const run = async () => {
    while (cursor < values.length && !signal?.aborted) {
      const index = cursor
      cursor += 1
      try {
        results[index] = { status: 'fulfilled', value: await worker(values[index]!) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, () => run()),
  )
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  return results
}

function gridSizeForZoom(zoom: number) {
  if (zoom <= 12) return 0.12
  if (zoom <= 13) return 0.06
  if (zoom <= 15) return 0.025
  return 0.0125
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(6))
}

export function createMapContextGridPlan(input: {
  bounds: MapBounds
  zoom: number
  bufferRatio?: number
}): MapContextGridPlan {
  const gridSize = gridSizeForZoom(input.zoom)
  const bufferRatio = Math.max(0, input.bufferRatio ?? DEFAULT_GRID_BUFFER_RATIO)
  const latitudeBuffer = Math.max(0, input.bounds.north - input.bounds.south) * bufferRatio
  const longitudeBuffer = Math.max(0, input.bounds.east - input.bounds.west) * bufferRatio
  const bufferedBounds = {
    east: Math.min(180, input.bounds.east + longitudeBuffer),
    north: Math.min(85, input.bounds.north + latitudeBuffer),
    south: Math.max(-85, input.bounds.south - latitudeBuffer),
    west: Math.max(-180, input.bounds.west - longitudeBuffer),
  }
  const latitudeStart = Math.floor((bufferedBounds.south + 90) / gridSize)
  const latitudeEnd = Math.floor((bufferedBounds.north + 90 - Number.EPSILON) / gridSize)
  const longitudeStart = Math.floor((bufferedBounds.west + 180) / gridSize)
  const longitudeEnd = Math.floor((bufferedBounds.east + 180 - Number.EPSILON) / gridSize)
  const zoomBand = gridSize.toString()
  const cells: MapContextGridCell[] = []

  for (let latitudeIndex = latitudeStart; latitudeIndex <= latitudeEnd; latitudeIndex += 1) {
    for (let longitudeIndex = longitudeStart; longitudeIndex <= longitudeEnd; longitudeIndex += 1) {
      cells.push({
        id: `${zoomBand}:${latitudeIndex}:${longitudeIndex}`,
        bounds: {
          east: roundCoordinate((longitudeIndex + 1) * gridSize - 180),
          north: roundCoordinate((latitudeIndex + 1) * gridSize - 90),
          south: roundCoordinate(latitudeIndex * gridSize - 90),
          west: roundCoordinate(longitudeIndex * gridSize - 180),
        },
      })
    }
  }

  return {
    bounds: bufferedBounds,
    cells,
    key: cells.map((cell) => cell.id).join('|'),
  }
}

function getGridCacheEntry(category: MapContextCategory, cellId: string) {
  const cacheKey = `${category}:${cellId}`
  let cached = poiGridCache.get(cacheKey)
  if (!cached) {
    try {
      cached =
        JSON.parse(localStorage.getItem(`travel:map-grid:${cacheKey}`) ?? 'null') ?? undefined
      if (cached) poiGridCache.set(cacheKey, cached)
    } catch {
      cached = undefined
    }
  }
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    poiGridCache.delete(cacheKey)
    return null
  }
  poiGridCache.delete(cacheKey)
  poiGridCache.set(cacheKey, cached)
  return cached
}

function setGridCacheEntry(
  category: MapContextCategory,
  cellId: string,
  entry: Omit<NonNullable<ReturnType<typeof getGridCacheEntry>>, 'expiresAt'>,
) {
  const cacheKey = `${category}:${cellId}`
  poiGridCache.set(cacheKey, {
    ...entry,
    expiresAt: Date.now() + MAP_CONTEXT_GRID_CACHE_TTL,
  })
  try {
    localStorage.setItem(`travel:map-grid:${cacheKey}`, JSON.stringify(poiGridCache.get(cacheKey)))
  } catch {
    // The memory cache remains available when persistent storage is full or disabled.
  }
  while (poiGridCache.size > MAP_CONTEXT_GRID_CACHE_LIMIT) {
    const oldestKey = poiGridCache.keys().next().value!
    poiGridCache.delete(oldestKey)
    try {
      localStorage.removeItem(`travel:map-grid:${oldestKey}`)
    } catch {
      // Ignore unavailable storage.
    }
  }
}

function cellContainsPoi(cell: MapContextGridCell, poi: Omit<MapContextPoi, 'id'>) {
  return (
    poi.coordinates.lat >= cell.bounds.south &&
    poi.coordinates.lat < cell.bounds.north &&
    poi.coordinates.lng >= cell.bounds.west &&
    poi.coordinates.lng < cell.bounds.east
  )
}

function poiId(poi: Omit<MapContextPoi, 'id'>) {
  return (
    poi.externalRefs?.osmId ??
    `${poi.category}:${poi.title}:${poi.coordinates.lat.toFixed(5)},${poi.coordinates.lng.toFixed(5)}`
  )
}

function normalizedPoiTitle(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function poiDistanceMeters(left: MapContextPoi, right: MapContextPoi) {
  const latitude = ((left.coordinates.lat + right.coordinates.lat) / 2) * (Math.PI / 180)
  const latitudeMeters = (left.coordinates.lat - right.coordinates.lat) * 111_320
  const longitudeMeters =
    (left.coordinates.lng - right.coordinates.lng) * 111_320 * Math.cos(latitude)
  return Math.hypot(latitudeMeters, longitudeMeters)
}

function poiQuality(poi: MapContextPoi) {
  return (
    Number(Boolean(poi.externalRefs?.osmId)) * 4 +
    Number(Boolean(poi.address)) * 3 +
    Number(Boolean(poi.openingHours)) * 2 +
    Number(Boolean(poi.website)) * 2 +
    Number(Boolean(poi.phone)) +
    (poi.lineRefs?.length ?? 0)
  )
}

export function dedupeMapContextPois(pois: MapContextPoi[]) {
  const result: MapContextPoi[] = []
  for (const poi of pois) {
    const normalizedTitle = normalizedPoiTitle(poi.title)
    const duplicateIndex = result.findIndex(
      (candidate) =>
        normalizedPoiTitle(candidate.title) === normalizedTitle &&
        poiDistanceMeters(candidate, poi) <= 45,
    )
    if (duplicateIndex < 0) {
      result.push(poi)
      continue
    }
    if (poiQuality(poi) > poiQuality(result[duplicateIndex]!)) result[duplicateIndex] = poi
  }
  return result
}

export function mapContextPlaceId(poi: MapContextPoi) {
  const googlePlaceId = poi.externalRefs?.googlePlaceId
  if (typeof googlePlaceId === 'string' && googlePlaceId) return googlePlaceId
  const osmId = poi.externalRefs?.osmId
  return typeof osmId === 'string' && osmId ? osmId : null
}

export function mapContextCategoryToPlaceCategory(category: MapContextCategory) {
  if (category === 'restaurant' || category === 'cafe') return 'Food' as const
  if (category === 'museum') return 'Museums' as const
  return 'Sights' as const
}

export async function fetchMapContextPoiDetails(poi: MapContextPoi, lang?: string) {
  const placeId = mapContextPlaceId(poi)
  if (!placeId) return null
  return apiGet<MapContextPoiDetails | null>('/api/providers/places/details', {
    expanded: true,
    lang,
    placeId,
  })
}

export async function fetchMapContextPoiPhoto(poi: MapContextPoi) {
  const placeId = mapContextPlaceId(poi)
  if (!placeId) return null
  const response = await apiGet<{ photoUrl?: string } | null>('/api/providers/places/photo', {
    lat: poi.coordinates.lat,
    lng: poi.coordinates.lng,
    name: poi.title,
    placeId,
  })
  return response?.photoUrl ?? null
}

export async function fetchMapContextPois(input: {
  bounds: MapBounds
  categories: MapContextCategory[]
  limit?: number
  zoom?: number
  bufferRatio?: number
  signal?: AbortSignal
}) {
  const zoom = input.zoom ?? 13
  if (zoom < MIN_CONTEXT_POI_ZOOM || input.categories.length === 0) {
    return { pois: [], sources: [], unavailableCategoryCount: 0 }
  }
  const gridPlan = createMapContextGridPlan({
    bounds: input.bounds,
    zoom,
    bufferRatio: input.bufferRatio,
  })
  const results = await allSettledWithConcurrency(
    input.categories,
    2,
    async (category) => {
      const cachedCells = gridPlan.cells.flatMap((cell) => {
        const cached = getGridCacheEntry(category, cell.id)
        return cached ? [{ cell, cached }] : []
      })
      const cachedCellIds = new Set(cachedCells.map(({ cell }) => cell.id))
      const missingCells = gridPlan.cells.filter((cell) => !cachedCellIds.has(cell.id))
      if (missingCells.length === 0) {
        return {
          pois: cachedCells.flatMap(({ cached }) => cached.pois),
          sources: [...new Set(cachedCells.map(({ cached }) => cached.source))],
          unavailable: false,
        }
      }

      const missingBounds = missingCells.reduce<MapBounds>(
        (bounds, cell) => ({
          east: Math.max(bounds.east, cell.bounds.east),
          north: Math.max(bounds.north, cell.bounds.north),
          south: Math.min(bounds.south, cell.bounds.south),
          west: Math.min(bounds.west, cell.bounds.west),
        }),
        {
          east: -180,
          north: -85,
          south: 85,
          west: 180,
        },
      )
      const params = {
        category,
        south: missingBounds.south,
        west: missingBounds.west,
        north: missingBounds.north,
        east: missingBounds.east,
        limit: Math.min(100, (input.limit ?? 24) * missingCells.length),
      }
      const cacheKey = JSON.stringify(params)
      const cached = poiResponseCache.get(cacheKey)
      let response: PoiSearchResponse
      try {
        response =
          cached ??
          (await apiGet<PoiSearchResponse>('/api/providers/places/pois', params, {
            signal: input.signal,
          }))
      } catch (error) {
        if (cachedCells.length === 0) throw error
        return {
          pois: cachedCells.flatMap(({ cached: cachedCell }) => cachedCell.pois),
          sources: [...new Set(cachedCells.map(({ cached: cachedCell }) => cachedCell.source))],
          unavailable: true,
        }
      }
      if (!cached) {
        poiResponseCache.set(cacheKey, response)
        if (poiResponseCache.size > 120)
          poiResponseCache.delete(poiResponseCache.keys().next().value!)
      }

      for (const cell of missingCells) {
        setGridCacheEntry(category, cell.id, {
          pois: response.pois.filter((poi) => cellContainsPoi(cell, poi)),
          source: response.source,
        })
      }
      return {
        pois: [
          ...cachedCells.flatMap(({ cached: cachedCell }) => cachedCell.pois),
          ...response.pois.filter((poi) => missingCells.some((cell) => cellContainsPoi(cell, poi))),
        ],
        sources: [
          ...new Set([
            ...cachedCells.map(({ cached: cachedCell }) => cachedCell.source),
            response.source,
          ]),
        ],
        unavailable: false,
      }
    },
    input.signal,
  )
  const responses = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
  if (responses.length === 0 && results.length > 0) {
    const failure = results.find((result) => result.status === 'rejected')
    throw failure?.status === 'rejected' ? failure.reason : new Error('Map context unavailable')
  }
  const uniquePois = new Map<string, MapContextPoi>()
  for (const response of responses) {
    for (const poi of response.pois) {
      const id = poiId(poi)
      uniquePois.set(id, { ...poi, id })
    }
  }
  return {
    pois: dedupeMapContextPois([...uniquePois.values()]),
    sources: [...new Set(responses.flatMap((response) => response.sources))],
    unavailableCategoryCount:
      results.length -
      responses.length +
      responses.filter((response) => response.unavailable).length,
  }
}
