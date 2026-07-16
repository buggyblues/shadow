import { inflateRawSync } from 'node:zlib'
import type { PlanningDao } from '../dao/planning.dao.js'
import type { TravelProviderGateway } from '../gateways/travel-provider.gateway.js'
import { badRequest, notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type {
  ItineraryAssignment,
  Place,
  RouteSegment,
  TravelCoordinates,
  TripDay,
  TripPhotoRef,
} from '../types.js'
import type {
  BulkCreatePlacesInput,
  CreateAssignmentInput,
  CreateDayInput,
  CreatePlaceInput,
  ExportRouteInput,
  ImportPlacesInput,
  LinkTripPhotoInput,
  OptimizeRouteInput,
  ReorderAssignmentsInput,
  SaveProviderPlaceInput,
  UpdateAssignmentInput,
  UpdateDayInput,
  UpdatePlaceInput,
} from '../validators/travel.schema.js'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record[key])
    if (value) return value
  }
  return undefined
}

function parseCoordinatePair(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return undefined
  const lng = Number(value[0])
  const lat = Number(value[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined
  return { lat, lng }
}

function parseCoordinatesRecord(value: unknown) {
  const record = asRecord(value)
  const location = asRecord(record.location)
  const coordinates = asRecord(record.coordinates)
  const lat = Number(
    coordinates.lat ?? coordinates.latitude ?? location.lat ?? location.latitude ?? record.lat,
  )
  const lng = Number(
    coordinates.lng ??
      coordinates.lon ??
      coordinates.longitude ??
      location.lng ??
      location.lon ??
      location.longitude ??
      record.lng ??
      record.lon,
  )
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined
  return { lat, lng }
}

function providerResultToPlaceInput(input: SaveProviderPlaceInput): CreatePlaceInput {
  const result = asRecord(input.providerResult)
  const displayName = asRecord(result.displayName)
  const externalRefs = asRecord(result.externalRefs)
  const url =
    stringValue(result.website) ??
    stringValue(result.websiteUri) ??
    stringValue(result.url) ??
    stringValue(result.googleMapsUri) ??
    stringValue(externalRefs.url) ??
    stringValue(externalRefs.googleMapsUri)
  return {
    title:
      stringValue(result.title) ??
      stringValue(result.name) ??
      stringValue(result.label) ??
      stringValue(displayName.text) ??
      'Saved place',
    kind: input.kind,
    address:
      stringValue(result.address) ??
      stringValue(result.formattedAddress) ??
      stringValue(result.display_name),
    coordinates: parseCoordinatesRecord(result),
    externalRefs: {
      ...externalRefs,
      provider:
        stringValue(externalRefs.provider) ??
        stringValue(result.provider) ??
        stringValue(result.source),
      googlePlaceId: stringValue(externalRefs.googlePlaceId) ?? stringValue(result.googlePlaceId),
      osmId: stringValue(externalRefs.osmId) ?? stringValue(result.osmId),
      source: stringValue(result.source),
    },
    links: [url].filter((value): value is string => Boolean(value)),
    tags: input.tags,
    categoryId: input.categoryId,
    photoRefs: input.photoRefs,
    notes:
      input.notes ??
      stringValue(result.notes) ??
      stringValue(result.summary) ??
      stringValue(result.description),
  }
}

function decodeXml(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function tagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return match?.[1]?.replace(/<[^>]+>/g, '').trim()
}

function parseGeoJsonPlaces(input: ImportPlacesInput): CreatePlaceInput[] {
  const payload = input.payload ?? (input.text ? (JSON.parse(input.text) as unknown) : undefined)
  const root = asRecord(payload)
  const features =
    root.type === 'FeatureCollection'
      ? Array.isArray(root.features)
        ? root.features
        : []
      : root.type === 'Feature'
        ? [root]
        : Array.isArray(payload)
          ? payload
          : []

  const places: CreatePlaceInput[] = []
  for (const feature of features) {
    const record = asRecord(feature)
    const properties = asRecord(record.properties)
    const geometry = asRecord(record.geometry)
    const coordinates = parseCoordinatePair(geometry.coordinates)
    if (!coordinates) continue
    places.push({
      title: firstString(properties, ['title', 'name', 'label']) ?? 'Imported place',
      kind: input.defaultKind,
      address: firstString(properties, ['address', 'formatted_address', 'vicinity']),
      coordinates,
      externalRefs: {
        provider: 'geojson',
        url: firstString(properties, ['url', 'website']),
      },
      links: [firstString(properties, ['url', 'website'])].filter((value): value is string =>
        Boolean(value),
      ),
      tags: [...new Set([...input.tags, ...String(properties.tags ?? '').split(',')])]
        .map((tag) => tag.trim())
        .filter(Boolean),
      categoryId: input.categoryId,
      photoRefs: [],
      notes: firstString(properties, ['description', 'notes']),
    })
  }
  return places
}

function parseGpxPlaces(input: ImportPlacesInput) {
  const text = input.text ?? ''
  const places: CreatePlaceInput[] = []
  const waypointPattern = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi
  let match = waypointPattern.exec(text)
  while (match) {
    const attrs = match[1] ?? ''
    const block = match[2] ?? ''
    const lat = Number(attrs.match(/\blat=["']([^"']+)["']/i)?.[1])
    const lng = Number(attrs.match(/\b(?:lon|lng)=["']([^"']+)["']/i)?.[1])
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      places.push({
        title: decodeXml(tagValue(block, 'name') ?? 'Imported waypoint'),
        kind: input.defaultKind,
        coordinates: { lat, lng },
        externalRefs: { provider: 'gpx' },
        links: [],
        tags: input.tags,
        categoryId: input.categoryId,
        photoRefs: [],
        notes: decodeXml(tagValue(block, 'desc') ?? tagValue(block, 'cmt') ?? ''),
      })
    }
    match = waypointPattern.exec(text)
  }
  return places
}

function parseKmlPlaces(input: ImportPlacesInput) {
  const text = input.text ?? ''
  const places: CreatePlaceInput[] = []
  const placemarkPattern = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi
  let match = placemarkPattern.exec(text)
  while (match) {
    const block = match[1] ?? ''
    const coordinateText = tagValue(block, 'coordinates')?.split(/\s+/).find(Boolean)
    const [lngText, latText] = coordinateText?.split(',') ?? []
    const lat = Number(latText)
    const lng = Number(lngText)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      places.push({
        title: decodeXml(tagValue(block, 'name') ?? 'Imported placemark'),
        kind: input.defaultKind,
        coordinates: { lat, lng },
        externalRefs: { provider: 'kml' },
        links: [],
        tags: input.tags,
        categoryId: input.categoryId,
        photoRefs: [],
        notes: decodeXml(tagValue(block, 'description') ?? ''),
      })
    }
    match = placemarkPattern.exec(text)
  }
  return places
}

function stripDataUrl(value: string) {
  return value.replace(/^data:[^,]+,/, '')
}

function inflateZipEntry(buffer: Buffer, offset: number, compressedSize: number, method: number) {
  const data = buffer.subarray(offset, offset + compressedSize)
  if (method === 0) return data
  if (method === 8) return inflateRawSync(data)
  throw badRequest(`Unsupported KMZ compression method: ${method}`)
}

function extractKmlFromKmz(buffer: Buffer) {
  let offset = 0
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1
      continue
    }
    const method = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = buffer
      .subarray(nameStart, nameStart + nameLength)
      .toString('utf8')
      .toLowerCase()
    const dataEnd = dataStart + compressedSize
    if (dataStart > buffer.length || dataEnd > buffer.length) break
    if (name.endsWith('.kml')) {
      return inflateZipEntry(buffer, dataStart, compressedSize, method).toString('utf8')
    }
    offset = dataEnd
  }
  throw badRequest('KMZ file does not contain a readable KML document')
}

function parseKmzPlaces(input: ImportPlacesInput) {
  if (input.text?.trim().startsWith('<')) return parseKmlPlaces({ ...input, source: 'kml' })
  const encoded = input.fileBase64 ?? input.text
  if (!encoded) throw badRequest('KMZ import requires fileBase64 or text')
  const buffer = Buffer.from(stripDataUrl(encoded), 'base64')
  if (buffer.length === 0) throw badRequest('KMZ import payload is empty')
  return parseKmlPlaces({ ...input, source: 'kml', text: extractKmlFromKmz(buffer) })
}

function parseImportedPlaces(input: ImportPlacesInput): CreatePlaceInput[] {
  if (input.source === 'gpx') return parseGpxPlaces(input)
  if (input.source === 'kml') return parseKmlPlaces(input)
  if (input.source === 'kmz') return parseKmzPlaces(input)
  return parseGeoJsonPlaces(input)
}

function distanceMeters(a: TravelCoordinates, b: TravelCoordinates) {
  const radius = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function isTravelCoordinate(value: unknown): value is TravelCoordinates {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as TravelCoordinates).lat === 'number' &&
    typeof (value as TravelCoordinates).lng === 'number'
  )
}

function coordinateParam(coordinates: TravelCoordinates) {
  return `${coordinates.lat},${coordinates.lng}`
}

function routeModeForGoogleMaps(mode: ExportRouteInput['mode']) {
  return mode === 'cycling' ? 'bicycling' : mode
}

function routeGeoJson(
  coordinates: TravelCoordinates[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: coordinates.map((coord) => [coord.lng, coord.lat]),
    },
  }
}

function routeStopFromCoordinate(
  coordinate: TravelCoordinates,
  index: number,
  assignment?: ItineraryAssignment,
  place?: Place,
) {
  return {
    assignmentId: assignment?.id,
    placeId: place?.id,
    title: place?.title ?? assignment?.title ?? `Stop ${index + 1}`,
    coordinates: coordinate,
  }
}

export class PlanningService {
  constructor(private readonly planningDao: PlanningDao) {}

  listDays(tripId: string) {
    return this.planningDao.listDays(tripId)
  }

  async createDay(tripId: string, input: CreateDayInput, fallbackTimezone: string) {
    const timestamp = nowIso()
    const day: TripDay = {
      id: createId('day'),
      tripId,
      date: input.date,
      title: input.title,
      timezone: input.timezone ?? fallbackTimezone,
      notes: input.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.planningDao.upsertDay(day)
  }

  async updateDay(tripId: string, dayId: string, input: UpdateDayInput) {
    const current = await this.planningDao.findDay(dayId)
    if (!current || current.tripId !== tripId) throw notFound('Day')
    const updated = await this.planningDao.updateDay(dayId, (day) => ({
      ...day,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Day')
    return updated
  }

  async deleteDay(tripId: string, dayId: string) {
    const current = await this.planningDao.findDay(dayId)
    if (!current || current.tripId !== tripId) throw notFound('Day')
    const deleted = await this.planningDao.deleteDay(dayId)
    if (!deleted) throw notFound('Day')
    return deleted
  }

  listPlaces(tripId: string) {
    return this.planningDao.listPlaces(tripId)
  }

  async createPlace(tripId: string, input: CreatePlaceInput, savedByMemberId?: string) {
    const timestamp = nowIso()
    const place: Place = {
      id: createId('place'),
      tripId,
      title: input.title,
      kind: input.kind,
      address: input.address,
      coordinates: input.coordinates,
      externalRefs: input.externalRefs,
      costEstimate: input.costEstimate,
      durationMinutes: input.durationMinutes,
      links: input.links,
      tags: input.tags,
      categoryId: input.categoryId,
      photoRefs: input.photoRefs,
      notes: input.notes,
      savedByMemberId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.planningDao.createPlace(place)
  }

  async bulkCreatePlaces(tripId: string, input: BulkCreatePlacesInput, savedByMemberId?: string) {
    const timestamp = nowIso()
    const places = input.places.map<Place>((placeInput) => ({
      id: createId('place'),
      tripId,
      title: placeInput.title,
      kind: placeInput.kind,
      address: placeInput.address,
      coordinates: placeInput.coordinates,
      externalRefs: placeInput.externalRefs,
      costEstimate: placeInput.costEstimate,
      durationMinutes: placeInput.durationMinutes,
      links: placeInput.links,
      tags: placeInput.tags,
      categoryId: placeInput.categoryId,
      photoRefs: placeInput.photoRefs,
      notes: placeInput.notes,
      savedByMemberId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    return this.planningDao.createPlaces(places)
  }

  async importPlaces(tripId: string, input: ImportPlacesInput, savedByMemberId?: string) {
    const places = parseImportedPlaces(input)
    if (places.length === 0) return []
    return this.bulkCreatePlaces(
      tripId,
      {
        places,
      },
      savedByMemberId,
    )
  }

  async saveProviderPlace(tripId: string, input: SaveProviderPlaceInput, savedByMemberId?: string) {
    return this.createPlace(tripId, providerResultToPlaceInput(input), savedByMemberId)
  }

  async updatePlace(tripId: string, placeId: string, input: UpdatePlaceInput) {
    const current = await this.planningDao.findPlace(placeId)
    if (!current || current.tripId !== tripId) throw notFound('Place')
    const updated = await this.planningDao.updatePlace(placeId, (place) => ({
      ...place,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Place')
    return updated
  }

  async deletePlace(tripId: string, placeId: string) {
    const current = await this.planningDao.findPlace(placeId)
    if (!current || current.tripId !== tripId) throw notFound('Place')
    const deleted = await this.planningDao.deletePlace(placeId)
    if (!deleted) throw notFound('Place')
    return deleted
  }

  listAssignments(tripId: string, dayId?: string) {
    return this.planningDao.listAssignments(tripId, dayId)
  }

  async createAssignment(tripId: string, input: CreateAssignmentInput) {
    const timestamp = nowIso()
    const sequence =
      input.sequence ??
      ((await this.planningDao.listAssignments(tripId, input.dayId)).length + 1) * 100

    const assignment: ItineraryAssignment = {
      id: createId('assign'),
      tripId,
      dayId: input.dayId,
      placeId: input.placeId,
      reservationId: input.reservationId,
      expenseId: input.expenseId,
      title: input.title,
      kind: input.kind,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone,
      sequence,
      status: input.status,
      participantMemberIds: input.participantMemberIds,
      notes: input.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    return this.planningDao.createAssignment(assignment)
  }

  async updateAssignment(tripId: string, assignmentId: string, input: UpdateAssignmentInput) {
    const current = await this.planningDao.findAssignment(assignmentId)
    if (!current || current.tripId !== tripId) throw notFound('Assignment')
    const updated = await this.planningDao.updateAssignment(assignmentId, (assignment) => ({
      ...assignment,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Assignment')
    return updated
  }

  async deleteAssignment(tripId: string, assignmentId: string) {
    const current = await this.planningDao.findAssignment(assignmentId)
    if (!current || current.tripId !== tripId) throw notFound('Assignment')
    const deleted = await this.planningDao.deleteAssignment(assignmentId)
    if (!deleted) throw notFound('Assignment')
    return deleted
  }

  async reorderAssignments(tripId: string, input: ReorderAssignmentsInput) {
    const reordered = await this.planningDao.reorderAssignments(
      tripId,
      input.dayId,
      input.orderedIds,
    )
    if (!reordered) throw notFound('Assignment')
    return this.planningDao.listAssignments(tripId, input.dayId)
  }

  async refreshTripWeather(tripId: string, providerGateway: TravelProviderGateway) {
    const [days, places, assignments] = await Promise.all([
      this.planningDao.listDays(tripId),
      this.planningDao.listPlaces(tripId),
      this.planningDao.listAssignments(tripId),
    ])
    const byPlaceId = new Map(places.map((place) => [place.id, place]))
    const fallback = places.find((place) => place.coordinates)
    const refreshed = []
    for (const day of days) {
      const dayAssignments = assignments.filter((assignment) => assignment.dayId === day.id)
      const preferred =
        dayAssignments
          .map((assignment) => (assignment.placeId ? byPlaceId.get(assignment.placeId) : undefined))
          .find((place) => place?.kind === 'hotel' && place.coordinates) ??
        dayAssignments
          .map((assignment) => (assignment.placeId ? byPlaceId.get(assignment.placeId) : undefined))
          .find((place) => place?.coordinates) ??
        fallback
      if (!preferred?.coordinates) continue
      const weather = await providerGateway
        .weather({ coordinates: preferred.coordinates, date: day.date })
        .catch(() => null)
      if (!weather) continue
      const updated = await this.planningDao.updateDay(day.id, (item) => ({
        ...item,
        weatherRef: {
          ...weather,
          placeId: preferred.id,
          placeTitle: preferred.title,
          refreshedAt: nowIso(),
        },
        updatedAt: nowIso(),
      }))
      if (updated) refreshed.push(updated)
    }
    return refreshed
  }

  async optimizeRoute(
    tripId: string,
    input: OptimizeRouteInput,
    providerGateway: TravelProviderGateway,
  ) {
    const [assignments, places] = await Promise.all([
      this.planningDao.listAssignments(tripId, input.dayId),
      this.planningDao.listPlaces(tripId),
    ])
    const byPlaceId = new Map(places.map((place) => [place.id, place]))
    const locked = new Set(input.lockedAssignmentIds)
    const routable = assignments.filter((assignment) => {
      if (locked.has(assignment.id) || assignment.dayId !== input.dayId || !assignment.placeId)
        return false
      return Boolean(byPlaceId.get(assignment.placeId)?.coordinates)
    })
    if (routable.length < 2)
      throw badRequest('At least two unlocked assignments with coordinates are required')

    const start = input.startPlaceId ? byPlaceId.get(input.startPlaceId)?.coordinates : undefined
    const end = input.endPlaceId ? byPlaceId.get(input.endPlaceId)?.coordinates : undefined
    const remaining = [...routable]
    const optimized: ItineraryAssignment[] = []
    let cursor = start ?? byPlaceId.get(remaining[0]?.placeId ?? '')?.coordinates
    while (remaining.length > 0) {
      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (const [index, assignment] of remaining.entries()) {
        const coordinate = byPlaceId.get(assignment.placeId ?? '')?.coordinates
        if (!coordinate || !cursor) continue
        const score = distanceMeters(cursor, coordinate)
        if (score < bestDistance) {
          bestDistance = score
          bestIndex = index
        }
      }
      const [next] = remaining.splice(bestIndex, 1)
      if (!next) break
      optimized.push(next)
      cursor = byPlaceId.get(next.placeId ?? '')?.coordinates
    }

    const queue = [...optimized]
    const orderedIds = assignments.map((assignment) => {
      if (
        assignment.dayId === input.dayId &&
        assignment.placeId &&
        !locked.has(assignment.id) &&
        byPlaceId.get(assignment.placeId)?.coordinates
      ) {
        return queue.shift()?.id ?? assignment.id
      }
      return assignment.id
    })
    if (input.apply) await this.planningDao.reorderAssignments(tripId, input.dayId, orderedIds)

    const routeAssignments = orderedIds
      .map((id) => assignments.find((assignment) => assignment.id === id))
      .filter((assignment): assignment is ItineraryAssignment => Boolean(assignment))
    const routeCoordinates = [
      start,
      ...routeAssignments.flatMap((assignment) => {
        const coord = byPlaceId.get(assignment.placeId ?? '')?.coordinates
        return coord ? [coord] : []
      }),
      end,
    ].filter((coord): coord is TravelCoordinates => Boolean(coord))

    const route =
      routeCoordinates.length >= 2
        ? await providerGateway
            .routePlan({ mode: input.mode, coordinates: routeCoordinates })
            .catch(() => null)
        : null
    const providerCoordinates = (route?.coordinates ?? []).filter(isTravelCoordinate)
    const segment: RouteSegment = {
      id: createId('route'),
      tripId,
      dayId: input.dayId,
      mode: input.mode,
      source: route?.source ?? 'nearest-neighbor',
      assignmentIds: orderedIds,
      distanceMeters: route?.distanceMeters,
      durationSeconds: route?.durationSeconds,
      coordinates: providerCoordinates.length > 0 ? providerCoordinates : routeCoordinates,
      legs: route?.legs ?? [],
      optimized: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    const savedSegment = await this.planningDao.createRouteSegment(segment)
    return {
      applied: input.apply,
      orderedIds,
      assignments: input.apply
        ? await this.planningDao.listAssignments(tripId, input.dayId)
        : routeAssignments,
      route: savedSegment,
    }
  }

  listRouteSegments(tripId: string, dayId?: string) {
    return this.planningDao.listRouteSegments(tripId, dayId)
  }

  async exportRoute(tripId: string, input: ExportRouteInput) {
    const [segments, assignments, places] = await Promise.all([
      this.planningDao.listRouteSegments(tripId),
      this.planningDao.listAssignments(tripId, input.dayId),
      this.planningDao.listPlaces(tripId),
    ])
    const byAssignmentId = new Map(assignments.map((assignment) => [assignment.id, assignment]))
    const byPlaceId = new Map(places.map((place) => [place.id, place]))
    let mode = input.mode
    let dayId = input.dayId
    let source: 'route_segment' | 'assignments' | 'day' = input.dayId ? 'day' : 'assignments'
    let routeCoordinates: TravelCoordinates[] = []
    let routeAssignments: ItineraryAssignment[] = []
    const warnings: string[] = []

    if (input.routeSegmentId) {
      const segment = segments.find((item) => item.id === input.routeSegmentId)
      if (!segment) throw notFound('Route segment')
      if (segment.mode === 'transit')
        warnings.push('Transit route exported as driving in Google Maps')
      mode = segment.mode === 'transit' ? 'driving' : segment.mode
      dayId = segment.dayId
      source = 'route_segment'
      routeAssignments = segment.assignmentIds
        .map((id) => byAssignmentId.get(id))
        .filter((assignment): assignment is ItineraryAssignment => Boolean(assignment))
      routeCoordinates = segment.coordinates
    } else if (input.assignmentIds.length >= 2) {
      routeAssignments = input.assignmentIds.map((id) => {
        const assignment = byAssignmentId.get(id)
        if (!assignment) throw notFound('Assignment')
        return assignment
      })
    } else if (input.dayId) {
      routeAssignments = assignments.filter((assignment) => assignment.dayId === input.dayId)
    }

    const assignmentStops = routeAssignments
      .map((assignment, index) => {
        const place = assignment.placeId ? byPlaceId.get(assignment.placeId) : undefined
        return place?.coordinates
          ? routeStopFromCoordinate(place.coordinates, index, assignment, place)
          : undefined
      })
      .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop))

    const stops =
      assignmentStops.length >= 2
        ? assignmentStops
        : routeCoordinates.map((coordinate, index) => routeStopFromCoordinate(coordinate, index))
    if (stops.length < 2) throw badRequest('At least two route stops with coordinates are required')
    const firstStop = stops[0]
    const lastStop = stops[stops.length - 1]
    if (!firstStop || !lastStop) {
      throw badRequest('At least two route stops with coordinates are required')
    }

    const middleStops = stops.slice(1, -1)
    const waypointLimit = 23
    const exportedMiddleStops = middleStops.slice(0, waypointLimit)
    if (middleStops.length > waypointLimit) {
      warnings.push(
        `Google Maps supports ${waypointLimit} waypoints; ${middleStops.length - waypointLimit} stops were omitted from the URL`,
      )
    }

    const params = new URLSearchParams({
      api: '1',
      travelmode: routeModeForGoogleMaps(mode),
      origin: coordinateParam(firstStop.coordinates),
      destination: coordinateParam(lastStop.coordinates),
    })
    if (exportedMiddleStops.length > 0) {
      params.set(
        'waypoints',
        exportedMiddleStops.map((stop) => coordinateParam(stop.coordinates)).join('|'),
      )
    }

    const coordinates = stops.map((stop) => stop.coordinates)
    return {
      tripId,
      dayId,
      routeSegmentId: input.routeSegmentId,
      source,
      format: input.format,
      mode,
      stopCount: stops.length,
      stops,
      googleMapsUrl:
        input.format === 'geojson'
          ? undefined
          : `https://www.google.com/maps/dir/?${params.toString()}`,
      geoJson:
        input.format === 'google_maps'
          ? undefined
          : routeGeoJson(coordinates, { tripId, dayId, mode, source }),
      warnings,
    }
  }

  async linkTripPhoto(tripId: string, input: LinkTripPhotoInput, createdByMemberId?: string) {
    const timestamp = nowIso()
    const ref: TripPhotoRef = {
      id: createId('photo'),
      tripId,
      provider: input.provider,
      assetId: input.assetId,
      ownerUserId: input.ownerUserId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      mediaType: input.mediaType,
      takenAt: input.takenAt,
      coordinates: input.coordinates,
      thumbnailUrl: input.thumbnailUrl,
      originalUrl: input.originalUrl,
      metadata: input.metadata,
      createdByMemberId,
      createdAt: timestamp,
    }
    return this.planningDao.createTripPhotoRef(ref)
  }

  listTripPhotoRefs(tripId: string, subjectType?: string, subjectId?: string) {
    return this.planningDao.listTripPhotoRefs(tripId, subjectType, subjectId)
  }

  async deleteTripPhotoRef(tripId: string, refId: string) {
    const deleted = await this.planningDao.deleteTripPhotoRef(tripId, refId)
    if (!deleted) throw notFound('Trip photo')
    return deleted
  }
}
