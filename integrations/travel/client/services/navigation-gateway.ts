import { apiGet } from './api-client.js'

export type NavigationMode = 'driving' | 'walking' | 'cycling'
export type NavigationProviderId = 'server' | 'osrm-demo'

export interface NavigationCoordinate {
  latitude: number
  longitude: number
}

export interface NavigationLeg {
  distanceMeters: number
  durationSeconds: number
}

export interface NavigationRoute {
  coordinates: NavigationCoordinate[]
  distanceMeters: number
  durationSeconds: number
  legs: NavigationLeg[]
  mode: NavigationMode
  provider: NavigationProviderId | string
  avoidance?: {
    addedDistanceMeters: number
    addedDurationSeconds: number
    hazardIds: string[]
    originalCoordinates: NavigationCoordinate[]
  }
}

export interface NavigationHazard {
  id: string
  coordinate: NavigationCoordinate
  radiusMeters?: number
}

export interface NavigationRouteRequest {
  coordinates: NavigationCoordinate[]
  mode: NavigationMode
}

interface RouteProvider {
  id: NavigationProviderId
  planRoute: (input: NavigationRouteRequest) => Promise<NavigationRoute | null>
}

interface ServerRouteResponse {
  coordinates?: Array<{ lat?: number; lng?: number }>
  distanceMeters?: number
  durationSeconds?: number
  legs?: Array<{ distanceMeters?: number; durationSeconds?: number }>
  mode?: NavigationMode
  source?: string
}

interface OsrmRouteResponse {
  code?: string
  routes?: Array<{
    distance?: number
    duration?: number
    geometry?: {
      coordinates?: number[][]
    }
    legs?: Array<{
      distance?: number
      duration?: number
    }>
  }>
}

interface TransitPlanResponse {
  source?: string
  itineraries?: Array<{
    duration?: number
    legs?: Array<{
      distance?: number | null
      geometry?: string | null
      geometryPrecision?: number
      from?: { lat?: number; lng?: number }
      to?: { lat?: number; lng?: number }
    }>
  }>
}

const routeCache = new Map<
  string,
  {
    expiresAt: number
    task: Promise<NavigationRoute | null>
  }
>()
const routeCacheTtlMs = 15 * 60 * 1000
const navigationQueue: Array<() => void> = []
let activeNavigationRequests = 0
const MAX_NAVIGATION_CONCURRENCY = 3

async function withNavigationSlot<T>(task: () => Promise<T>) {
  if (activeNavigationRequests >= MAX_NAVIGATION_CONCURRENCY) {
    await new Promise<void>((resolve) => navigationQueue.push(resolve))
  }
  activeNavigationRequests += 1
  try {
    return await task()
  } finally {
    activeNavigationRequests -= 1
    navigationQueue.shift()?.()
  }
}

function validCoordinate(coordinate: NavigationCoordinate) {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    Math.abs(coordinate.latitude) <= 90 &&
    Math.abs(coordinate.longitude) <= 180
  )
}

function routeCacheKey(input: NavigationRouteRequest) {
  const coordinates = input.coordinates
    .map((coordinate) => `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`)
    .join('|')
  return `${input.mode}:${coordinates}`
}

function coordinatesCsv(input: NavigationRouteRequest) {
  return input.coordinates
    .map((coordinate) => `${coordinate.latitude},${coordinate.longitude}`)
    .join('|')
}

function osrmProfile(mode: NavigationMode) {
  if (mode === 'cycling') return 'bike'
  if (mode === 'walking') return 'foot'
  return 'driving'
}

function osrmBaseUrl(mode: NavigationMode) {
  const customBase = import.meta.env.VITE_TRAVEL_OSRM_ROUTE_BASE_URL as string | undefined
  if (customBase) {
    const base = customBase.replace(/\/+$/, '')
    if (base.includes('/route/v1/')) return base
    return `${base}/route/v1/${osrmProfile(mode)}`
  }
  if (mode === 'walking') return 'https://router.project-osrm.org/route/v1/foot'
  if (mode === 'cycling') return 'https://router.project-osrm.org/route/v1/bike'
  return 'https://router.project-osrm.org/route/v1/driving'
}

function mapServerRoute(input: NavigationRouteRequest, data: ServerRouteResponse | null) {
  if (!data?.coordinates?.length) return null
  const coordinates = data.coordinates
    .map((coordinate) => {
      if (coordinate.lat === undefined || coordinate.lng === undefined) return null
      return { latitude: coordinate.lat, longitude: coordinate.lng }
    })
    .filter((coordinate): coordinate is NavigationCoordinate => Boolean(coordinate))
  if (coordinates.length < 2) return null
  return {
    coordinates,
    distanceMeters: Math.round(data.distanceMeters ?? 0),
    durationSeconds: Math.round(data.durationSeconds ?? 0),
    legs: (data.legs ?? []).map((leg) => ({
      distanceMeters: Math.round(leg.distanceMeters ?? 0),
      durationSeconds: Math.round(leg.durationSeconds ?? 0),
    })),
    mode: data.mode ?? input.mode,
    provider: data.source ?? 'server',
  } satisfies NavigationRoute
}

function mapOsrmRoute(input: NavigationRouteRequest, data: OsrmRouteResponse | null) {
  const route = data?.code === 'Ok' ? data.routes?.[0] : null
  const coordinates = route?.geometry?.coordinates
    ?.map(([longitude, latitude]) => {
      if (latitude === undefined || longitude === undefined) return null
      return { latitude, longitude }
    })
    .filter((coordinate): coordinate is NavigationCoordinate => Boolean(coordinate))
  if (!route || !coordinates || coordinates.length < 2) return null
  return {
    coordinates,
    distanceMeters: Math.round(route.distance ?? 0),
    durationSeconds: Math.round(route.duration ?? 0),
    legs: (route.legs ?? []).map((leg) => ({
      distanceMeters: Math.round(leg.distance ?? 0),
      durationSeconds: Math.round(leg.duration ?? 0),
    })),
    mode: input.mode,
    provider: 'osrm-demo',
  } satisfies NavigationRoute
}

const serverProvider: RouteProvider = {
  id: 'server',
  async planRoute(input) {
    try {
      const data = await apiGet<ServerRouteResponse | null>('/api/providers/routes/plan', {
        coordinates: coordinatesCsv(input),
        mode: input.mode,
      })
      return mapServerRoute(input, data)
    } catch {
      return null
    }
  },
}

const osrmDemoProvider: RouteProvider = {
  id: 'osrm-demo',
  async planRoute(input) {
    try {
      const coordinates = input.coordinates
        .map((coordinate) => `${coordinate.longitude},${coordinate.latitude}`)
        .join(';')
      const profile = osrmProfile(input.mode)
      const url = new URL(`${osrmBaseUrl(input.mode)}/${coordinates}`)
      if (input.mode !== 'driving' && !url.pathname.includes(`/route/v1/${profile}/`)) return null
      url.searchParams.set('overview', 'full')
      url.searchParams.set('geometries', 'geojson')
      url.searchParams.set('annotations', 'distance,duration')

      const response = await fetch(url, { headers: { accept: 'application/json' } })
      if (!response.ok) return null
      return mapOsrmRoute(input, (await response.json().catch(() => null)) as OsrmRouteResponse)
    } catch {
      return null
    }
  },
}

const providers: RouteProvider[] = [serverProvider, osrmDemoProvider]

export async function planNavigationRoute(input: NavigationRouteRequest) {
  const coordinates = input.coordinates.filter(validCoordinate)
  if (coordinates.length < 2) return null
  const request = { ...input, coordinates }
  const key = routeCacheKey(request)
  const cached = routeCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.task
  if (cached) routeCache.delete(key)

  const task = withNavigationSlot(() =>
    providers.reduce<Promise<NavigationRoute | null>>(async (previous, provider) => {
      const existing = await previous
      if (existing) return existing
      return provider.planRoute(request)
    }, Promise.resolve(null)),
  )
  routeCache.set(key, { expiresAt: Date.now() + routeCacheTtlMs, task })
  return task
}

function coordinateDistanceMeters(left: NavigationCoordinate, right: NavigationCoordinate) {
  const latitude = ((left.latitude + right.latitude) / 2) * (Math.PI / 180)
  return Math.hypot(
    (left.latitude - right.latitude) * 111_320,
    (left.longitude - right.longitude) * 111_320 * Math.cos(latitude),
  )
}

export function distanceFromRouteMeters(
  coordinate: NavigationCoordinate,
  route: NavigationCoordinate[],
) {
  let closest = Number.POSITIVE_INFINITY
  for (const [index, start] of route.entries()) {
    const end = route[index + 1]
    if (!end) break
    const latitude = ((start.latitude + end.latitude) / 2) * (Math.PI / 180)
    const scaleX = 111_320 * Math.cos(latitude)
    const scaleY = 111_320
    const segmentX = (end.longitude - start.longitude) * scaleX
    const segmentY = (end.latitude - start.latitude) * scaleY
    const pointX = (coordinate.longitude - start.longitude) * scaleX
    const pointY = (coordinate.latitude - start.latitude) * scaleY
    const lengthSquared = segmentX ** 2 + segmentY ** 2
    const ratio = Math.max(
      0,
      Math.min(1, lengthSquared ? (pointX * segmentX + pointY * segmentY) / lengthSquared : 0),
    )
    closest = Math.min(closest, Math.hypot(pointX - segmentX * ratio, pointY - segmentY * ratio))
  }
  return closest
}

function detourWaypoint(
  origin: NavigationCoordinate,
  destination: NavigationCoordinate,
  hazard: NavigationHazard,
) {
  const latitude = ((origin.latitude + destination.latitude) / 2) * (Math.PI / 180)
  const routeX = (destination.longitude - origin.longitude) * Math.cos(latitude)
  const routeY = destination.latitude - origin.latitude
  const length = Math.hypot(routeX, routeY) || 1
  const offsetMeters = Math.max(180, (hazard.radiusMeters ?? 140) * 1.8)
  const latitudeOffset = ((routeX / length) * offsetMeters) / 111_320
  const longitudeOffset = ((-routeY / length) * offsetMeters) / (111_320 * Math.cos(latitude))
  return {
    latitude: hazard.coordinate.latitude + latitudeOffset,
    longitude: hazard.coordinate.longitude + longitudeOffset,
  }
}

export async function planAvoidingNavigationRoute(
  input: NavigationRouteRequest & {
    hazards: NavigationHazard[]
    baseRoute?: NavigationRoute | null
  },
) {
  const baseRoute = input.baseRoute ?? (await planNavigationRoute(input))
  const [origin, destination] = input.coordinates
  if (!baseRoute || !origin || !destination || input.hazards.length === 0) return baseRoute
  const affected = input.hazards.filter(
    (hazard) =>
      distanceFromRouteMeters(hazard.coordinate, baseRoute.coordinates) <=
      (hazard.radiusMeters ?? 140),
  )
  if (!affected.length) return baseRoute
  const alternative = await planNavigationRoute({
    coordinates: [
      origin,
      ...affected.map((hazard) => detourWaypoint(origin, destination, hazard)),
      destination,
    ],
    mode: input.mode,
  })
  if (!alternative) return baseRoute
  const directDistance = coordinateDistanceMeters(origin, destination)
  if (alternative.distanceMeters > Math.max(baseRoute.distanceMeters * 2.8, directDistance * 3.2)) {
    return baseRoute
  }
  return {
    ...alternative,
    avoidance: {
      addedDistanceMeters: Math.max(0, alternative.distanceMeters - baseRoute.distanceMeters),
      addedDurationSeconds: Math.max(0, alternative.durationSeconds - baseRoute.durationSeconds),
      hazardIds: affected.map((hazard) => hazard.id),
      originalCoordinates: baseRoute.coordinates,
    },
  }
}

export function navigationModeFromTransportMode(mode: string): NavigationMode {
  if (mode === 'walk') return 'walking'
  if (mode === 'taxi' || mode === 'car' || mode === 'bus') return 'driving'
  if (mode === 'bike' || mode === 'bicycle') return 'cycling'
  return 'walking'
}

function decodePolyline(value: string, precision = 6) {
  const coordinates: NavigationCoordinate[] = []
  const factor = 10 ** precision
  let latitude = 0
  let longitude = 0
  let index = 0
  const decodeValue = () => {
    let result = 0
    let shift = 0
    let byte = 0
    do {
      byte = value.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index <= value.length)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < value.length) {
    latitude += decodeValue()
    longitude += decodeValue()
    coordinates.push({ latitude: latitude / factor, longitude: longitude / factor })
  }
  return coordinates
}

function transitModes(transportMode: string) {
  if (transportMode === 'metro') return 'SUBWAY,TRAM'
  if (transportMode === 'train') return 'RAIL,SUBURBAN,REGIONAL_RAIL'
  return null
}

export async function planTransportNavigationRoute(input: {
  coordinates: NavigationCoordinate[]
  transportMode: string
}) {
  const coordinates = input.coordinates.filter(validCoordinate)
  const [origin, destination] = coordinates
  const modes = transitModes(input.transportMode)
  if (modes && origin && destination) {
    try {
      const response = await withNavigationSlot(() =>
        apiGet<TransitPlanResponse>('/api/providers/transit/plan', {
          from: `${origin.latitude},${origin.longitude}`,
          modes,
          to: `${destination.latitude},${destination.longitude}`,
        }),
      )
      const itinerary = response.itineraries?.[0]
      const routeCoordinates = (itinerary?.legs ?? []).flatMap((leg) => {
        if (leg.geometry) return decodePolyline(leg.geometry, leg.geometryPrecision ?? 6)
        const from = leg.from
        const to = leg.to
        return [from, to].flatMap((point) =>
          typeof point?.lat === 'number' && typeof point.lng === 'number'
            ? [{ latitude: point.lat, longitude: point.lng }]
            : [],
        )
      })
      if (routeCoordinates.length > 1) {
        return {
          coordinates: routeCoordinates,
          distanceMeters: (itinerary?.legs ?? []).reduce(
            (total, leg) => total + (leg.distance ?? 0),
            0,
          ),
          durationSeconds: itinerary?.duration ?? 0,
          legs: [],
          mode: 'walking' as const,
          provider: response.source ?? 'transitous',
        }
      }
    } catch {
      // Fall through to street routing while the transit provider is unavailable.
    }
  }
  return planNavigationRoute({
    coordinates,
    mode: navigationModeFromTransportMode(input.transportMode),
  })
}

export function openStreetMapDirectionsUrl(input: NavigationRouteRequest) {
  const [origin, destination] = input.coordinates
  if (!origin || !destination) return null
  const engine = input.mode === 'driving' ? 'fossgis_osrm_car' : 'fossgis_osrm_foot'
  const url = new URL('https://www.openstreetmap.org/directions')
  url.searchParams.set(
    'route',
    `${origin.latitude},${origin.longitude};${destination.latitude},${destination.longitude}`,
  )
  url.searchParams.set('engine', engine)
  return url.toString()
}
