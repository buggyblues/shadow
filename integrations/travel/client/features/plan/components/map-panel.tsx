import { useQueries, useQuery } from '@tanstack/react-query'
import {
  map as createMap,
  divIcon,
  type LatLngExpression,
  type Map as LeafletMap,
  type Marker as LeafletMarker,
  type LeafletMouseEvent,
  type Polyline as LeafletPolyline,
  latLngBounds,
  marker,
  point,
  polyline,
  tileLayer,
} from 'leaflet'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/icon-button.js'
import {
  ArrowRight,
  Bed,
  Bolt,
  CalendarCheck,
  CheckCircle,
  ChevronDown,
  Clock,
  Coffee2,
  Crosshairs,
  ForkKnife,
  Gallery,
  Globe,
  type IconComponent,
  Layer2,
  List,
  LocationAdd2,
  Map as MapIcon,
  MapPoint,
  Minus,
  Plus,
  RouteTrack,
  Star,
  Tram,
  X,
} from '../../../components/icons.js'
import { getRasterTileProvider } from '../../../config/map-providers.js'
import {
  type NavigationCoordinate,
  planAvoidingNavigationRoute,
  planNavigationRoute,
  planTransportNavigationRoute,
} from '../../../services/navigation-gateway.js'
import type { ViewMode } from '../../../store/view.js'
import { cn } from '../../../utils/class-names.js'
import { isMeaningfulTravelImage } from '../../../utils/travel-images.js'
import {
  formatTravelAddress,
  formatTravelOpeningHours,
} from '../../../utils/travel-place-format.js'
import {
  createMapContextGridPlan,
  fetchMapContextPoiDetails,
  fetchMapContextPoiPhoto,
  fetchMapContextPois,
  type MapBounds,
  type MapContextCategory,
  type MapContextPoi,
  MIN_CONTEXT_POI_ZOOM,
  mapContextCategoryToPlaceCategory,
} from '../api/map-context.js'
import type { Place } from '../api/places.js'
import {
  mapContextLayersForMode,
  type TravelMapMode,
  travelMapZoomStage,
} from '../model/map-experience.js'
import {
  contextCategoryColor,
  contextCategoryIcons,
  contextCategoryLabel,
  contextLayerOrder,
} from './map-context-palette.js'
import { contextPoiIcon, poiKindIcons } from './map-context-visuals.js'
import { localizedPlaceStatus } from './place-list.js'

const parisCenter: LatLngExpression = [48.8597, 2.3278]
const placeCategoryIcons: Record<Place['category'], IconComponent> = {
  Food: ForkKnife,
  Museums: Gallery,
  Sights: MapPoint,
}
const placeCategoryColors: Record<Place['category'], string> = {
  Food: '#b96e3c',
  Museums: '#6f7747',
  Sights: '#4c7191',
}
const journeyMarkerIcons: Record<string, IconComponent> = {
  activity: Gallery,
  flight: RouteTrack,
  hotel: Bed,
  meal: Coffee2,
  metro: Tram,
  restaurant: ForkKnife,
  taxi: RouteTrack,
  train: Tram,
  transport: Tram,
  walk: RouteTrack,
}
interface MapPanelProps {
  viewMode: ViewMode
  experienceMode: TravelMapMode
  places: Place[]
  selectedId: string
  focusSelectedPlace?: boolean
  onPlaceSelect: (id: string) => void
  onViewModeChange: (mode: ViewMode) => void
  onExperienceModeChange: (mode: TravelMapMode) => void
  mapMarkers: MapPointMarker[]
  selectedMapMarkerId: string | null
  onMapMarkerCreate: (marker: MapPointMarker) => void
  onMapMarkerSelect: (id: string | null) => void
  bottomToolbar?: ReactNode
  businessPanel?: ReactNode
  businessToolbar?: ReactNode
  journeyTimeline?: ReactNode
  businessLayerCount?: number
  businessMarkers?: TravelMapBusinessMarker[]
  businessRoutes?: TravelMapBusinessRoute[]
  routeHazards?: TravelMapBusinessMarker[]
  onBusinessMarkerSelect?: (marker: TravelMapBusinessMarker) => void
  onBusinessRouteSelect?: (route: TravelMapBusinessRoute) => void
  contextPoiFocusId?: string | null
  onContextPoisChange?: (pois: MapContextPoi[]) => void
  onContextPoiOpen?: (place: Place) => void
  onContextPoiSelect?: (id: string | null) => void
  onViewportChange?: (bounds: MapBounds) => void
  onReportLocationSelect?: (location: { latitude: number; longitude: number }) => void
  onReportPinModeChange?: (active: boolean) => void
  reportPinMode?: boolean
  focusedBusinessMarker?: TravelMapBusinessMarker | null
  navigationTargetId?: string | null
  navigationRequestId?: number
  listPanel?: ReactNode
  className?: string
}

export interface TravelMapBusinessMarker {
  amount?: number
  badge: string
  currency?: string
  id: string
  kind: 'journey' | 'flash' | 'transport'
  latitude: number
  longitude: number
  journeyItemIds?: string[]
  journeyKind?: string
  participantIds?: string[]
  placeId: string
  placeTitle?: string
  severity?: 'urgent' | 'high' | 'medium'
  eventStatus?: 'active' | 'ended' | 'removed'
  expiresAt?: string
  confidenceLabel?: string
  delayMinutes?: number
  removalVoteCount?: number
  sharedEventId?: string
  sourceLabel?: string
  updatedLabel?: string
  windowLabel?: string
  sequence?: number
  stackCount?: number
  stackIndex?: number
  startAt?: string
  subtitle: string
  targetId: string
  time?: string
  title: string
}

export interface TravelMapBusinessRoute {
  amount?: number
  currency?: string
  from: { latitude: number; longitude: number }
  fromPlaceId?: string
  id: string
  kind?: 'itinerary' | 'transport'
  mode: string
  participantIds?: string[]
  status: 'planned' | 'booked' | 'watching'
  subtitle: string
  targetId: string
  title: string
  to: { latitude: number; longitude: number }
  toPlaceId?: string
}

export interface MapPointMarker {
  id: string
  title: string
  latitude: number
  longitude: number
  note: string
  address?: string
  attachmentId?: string
  attachmentName?: string
  category?: Place['category']
  cost?: string
  description?: string
  hero?: string
  hours?: string
  image?: string
  rating?: string
  scheduledDay?: string
  visibility: 'private' | 'shared'
  shareScope: 'space' | 'public'
}

function pinPosition(place: Place): LatLngExpression {
  return [place.latitude, place.longitude]
}

function markerColor(place: Place) {
  if (place.status === 'booking') return '#ef5c49'
  return placeCategoryColors[place.category]
}

function markerIcon(place: Place, selected: boolean, sequence?: number, journeyKind?: string) {
  const color = markerColor(place)
  const Icon =
    (journeyKind && journeyMarkerIcons[journeyKind]) || placeCategoryIcons[place.category]
  const glyph = renderToStaticMarkup(
    <Icon color="#ffffff" size={selected ? 15 : 13} strokeWidth={2.1} weight="Outline" />,
  )
  return divIcon({
    className: 'travel-map-pin-icon',
    html: `<span class="travel-map-pin-shell${sequence !== undefined ? ' is-journey' : ''}"><span class="travel-map-pin${selected ? ' is-selected' : ''}" style="--pin-color: ${color};"><span class="travel-map-pin-glyph">${glyph}</span></span>${sequence !== undefined ? `<b class="travel-map-pin-sequence">${sequence}</b>` : ''}<small class="travel-map-pin-title">${escapeHtml(place.title)}</small></span>`,
    iconAnchor: selected ? [15, 34] : [13, 30],
    iconSize: selected ? [38, 40] : [34, 36],
    popupAnchor: [0, selected ? -32 : -28],
  })
}

function placePreviewContent(place: Place, translate: Parameters<typeof localizedPlaceStatus>[1]) {
  const Icon = placeCategoryIcons[place.category]
  const media = isMeaningfulTravelImage(place.image)
    ? `<img alt="" src="${escapeHtml(place.image)}" />`
    : `<span class="travel-map-place-preview-placeholder" style="--preview-color: ${placeCategoryColors[place.category]};">${renderToStaticMarkup(
        <Icon color="currentColor" size={20} strokeWidth={1.9} weight="Outline" />,
      )}</span>`
  return `<span class="travel-map-place-preview-content">${media}<span><strong>${escapeHtml(
    place.title,
  )}</strong><small>${escapeHtml(localizedPlaceStatus(place, translate))}</small></span></span>`
}

function userLocationIcon() {
  return divIcon({
    className: 'travel-map-user-icon',
    html: '<span class="travel-map-user-location"><span></span></span>',
    iconAnchor: [12, 12],
    iconSize: [24, 24],
  })
}

function mapPointMarkerIcon(selected: boolean, visibility: MapPointMarker['visibility']) {
  const color = visibility === 'shared' ? '#3d7eeb' : '#25231e'
  return divIcon({
    className: 'travel-map-custom-pin-icon',
    html: `<span class="travel-map-custom-pin${selected ? ' is-selected' : ''}" style="--pin-color: ${color};">${renderToStaticMarkup(
      <MapPoint color="#ffffff" size={selected ? 16 : 14} weight="Outline" strokeWidth={1.9} />,
    )}</span>`,
    iconAnchor: selected ? [15, 34] : [13, 30],
    iconSize: selected ? [30, 36] : [26, 32],
    popupAnchor: [0, selected ? -32 : -28],
  })
}

function businessMarkerIcon(item: TravelMapBusinessMarker) {
  const Icon = item.kind === 'flash' ? Bolt : item.kind === 'transport' ? Tram : CalendarCheck
  const tone =
    item.kind === 'flash'
      ? item.severity === 'urgent'
        ? 'is-urgent'
        : 'is-warning'
      : item.kind === 'transport'
        ? 'is-transport'
        : 'is-journey'
  return divIcon({
    className: 'travel-map-business-icon',
    html: renderToStaticMarkup(
      <span className={`travel-map-business-marker ${tone}`}>
        {item.kind === 'journey' && item.sequence !== undefined ? (
          <b>{item.sequence}</b>
        ) : (
          <Icon size={15} strokeWidth={2} />
        )}
        {item.kind !== 'journey' ? <small>{item.badge}</small> : null}
      </span>,
    ),
    iconAnchor: item.kind === 'journey' ? [11, 11] : [18, 18],
    iconSize: item.kind === 'journey' ? [22, 22] : [36, 36],
    popupAnchor: [0, -16],
  })
}

function formatMapAmount(amount: number, currency = 'EUR') {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
}

function fallbackRouteCoordinates(item: TravelMapBusinessRoute): [number, number][] {
  const from = item.from
  const to = item.to
  return Array.from({ length: 12 }, (_, pointIndex) => {
    const progress = pointIndex / 11
    return [
      from.latitude + (to.latitude - from.latitude) * progress,
      from.longitude + (to.longitude - from.longitude) * progress,
    ]
  })
}

function simplifyRouteCoordinates(coordinates: NavigationCoordinate[]) {
  if (coordinates.length <= 64) {
    return coordinates.map(
      (coordinate) => [coordinate.latitude, coordinate.longitude] as [number, number],
    )
  }
  const step = Math.ceil(coordinates.length / 62)
  const simplified = coordinates
    .filter((_, index) => index === 0 || index % step === 0)
    .map((coordinate) => [coordinate.latitude, coordinate.longitude] as [number, number])
  const last = coordinates.at(-1)
  if (last) simplified.push([last.latitude, last.longitude])
  return simplified
}

function routeColorChunks(coordinates: [number, number][], maximumChunks = 7) {
  const segmentCount = Math.max(1, coordinates.length - 1)
  const chunkSize = Math.max(1, Math.ceil(segmentCount / maximumChunks))
  const chunks: Array<{ coordinates: [number, number][]; progress: number }> = []
  for (let start = 0; start < coordinates.length - 1; start += chunkSize) {
    const end = Math.min(coordinates.length - 1, start + chunkSize)
    chunks.push({
      coordinates: coordinates.slice(start, end + 1),
      progress: start / segmentCount,
    })
  }
  return chunks
}

function mixRouteColor(from: string, to: string, progress: number) {
  const parse = (value: string) =>
    [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
  const fromRgb = parse(from)
  const toRgb = parse(to)
  return `rgb(${fromRgb
    .map((value, index) => Math.round(value + ((toRgb[index] ?? value) - value) * progress))
    .join(', ')})`
}

function routeDirectionIcon(angle: number, color: string) {
  return divIcon({
    className: 'travel-map-route-direction-icon',
    html: renderToStaticMarkup(
      <span
        className="travel-map-route-direction"
        style={{
          backgroundColor: color,
          borderColor: '#ffffff',
          color: '#ffffff',
          transform: `rotate(${angle}deg)`,
        }}
      >
        <ArrowRight size={14} strokeWidth={2.5} />
      </span>,
    ),
    iconAnchor: [13, 13],
    iconSize: [26, 26],
  })
}

function routeDirectionAngle(coordinates: [number, number][], index: number) {
  const from = coordinates[Math.max(0, index - 1)] ?? coordinates[0]
  const to = coordinates[Math.min(coordinates.length - 1, index + 1)] ?? coordinates.at(-1)
  if (!from || !to) return 0
  return (Math.atan2(-(to[0] - from[0]), to[1] - from[1]) * 180) / Math.PI
}

function routeCostIcon(amount: number, currency?: string) {
  return divIcon({
    className: 'travel-map-route-cost-icon',
    html: `<span>${formatMapAmount(amount, currency)}</span>`,
    iconAnchor: [24, 12],
    iconSize: [48, 24],
  })
}

function businessMarkerPosition(
  item: TravelMapBusinessMarker,
  index: number,
  currentMap: LeafletMap,
): LatLngExpression {
  if (item.kind === 'journey') {
    const basePoint = currentMap.latLngToLayerPoint([item.latitude, item.longitude])
    return currentMap.layerPointToLatLng(basePoint.add(point(17, 17)))
  }
  if (item.kind === 'flash') {
    const basePoint = currentMap.latLngToLayerPoint([item.latitude, item.longitude])
    return currentMap.layerPointToLatLng(basePoint.add(point(-24, -24)))
  }
  const angle = ((index % 8) / 8) * Math.PI * 2
  const distance = 0.0007
  return [item.latitude + Math.sin(angle) * distance, item.longitude + Math.cos(angle) * distance]
}

function currentMapBounds(currentMap: LeafletMap): MapBounds {
  const bounds = currentMap.getBounds()
  return {
    south: Number(bounds.getSouth().toFixed(5)),
    west: Number(bounds.getWest().toFixed(5)),
    north: Number(bounds.getNorth().toFixed(5)),
    east: Number(bounds.getEast().toFixed(5)),
  }
}

function mapViewportKey(bounds: MapBounds, zoom: number) {
  return [
    zoom,
    bounds.south.toFixed(4),
    bounds.west.toFixed(4),
    bounds.north.toFixed(4),
    bounds.east.toFixed(4),
  ].join(':')
}

function contextLabelPriority(poi: MapContextPoi) {
  if (poi.category === 'transport' && poi.lineRefs?.length) return 7
  if (poi.category === 'sights') return 6
  if (poi.category === 'museum') return 5
  if (poi.category === 'nature') return 4
  if (poi.category === 'hotel') return 3
  if (poi.category === 'restaurant') return 2
  return 1
}

function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

function placeToNavigationCoordinate(place: Place): NavigationCoordinate {
  return {
    latitude: place.latitude,
    longitude: place.longitude,
  }
}

function formatRouteDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`
  return `${Math.max(1, Math.round(distanceMeters))} m`
}

function formatRouteDuration(durationSeconds: number) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

function poiSummaryLine(poi: MapContextPoi, lineLabel = 'Line') {
  if (poi.lineRefs?.length) {
    const lineText = `${lineLabel} ${poi.lineRefs.join(', ')}`
    return poi.poiType ? `${lineText} · ${poi.poiType}` : lineText
  }
  return (
    poi.address ||
    poi.openingHours ||
    poi.poiType ||
    formatCoordinates(poi.coordinates.lat, poi.coordinates.lng)
  )
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function MapPanel({
  viewMode,
  experienceMode,
  places,
  selectedId,
  focusSelectedPlace = false,
  onPlaceSelect,
  onViewModeChange,
  onExperienceModeChange,
  mapMarkers,
  selectedMapMarkerId,
  onMapMarkerCreate,
  onMapMarkerSelect,
  bottomToolbar,
  businessPanel,
  businessToolbar,
  journeyTimeline,
  businessLayerCount = 0,
  businessMarkers = [],
  businessRoutes = [],
  routeHazards = [],
  onBusinessMarkerSelect,
  onBusinessRouteSelect,
  contextPoiFocusId = null,
  onContextPoisChange,
  onContextPoiOpen,
  onContextPoiSelect,
  onViewportChange,
  onReportLocationSelect,
  onReportPinModeChange,
  reportPinMode = false,
  focusedBusinessMarker = null,
  navigationTargetId = null,
  navigationRequestId = 0,
  listPanel,
  className,
}: MapPanelProps) {
  const { i18n, t } = useTranslation()
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map())
  const markerRenderStateRef = useRef<Map<string, string>>(new Map())
  const contextMarkersRef = useRef<Map<string, LeafletMarker>>(new Map())
  const contextMarkerRenderStateRef = useRef<Map<string, string>>(new Map())
  const customMarkersRef = useRef<LeafletMarker[]>([])
  const businessMarkersRef = useRef<LeafletMarker[]>([])
  const businessRoutesRef = useRef<LeafletPolyline[]>([])
  const businessRouteLabelsRef = useRef<LeafletMarker[]>([])
  const routeRefs = useRef<LeafletPolyline[]>([])
  const userMarkerRef = useRef<LeafletMarker | null>(null)
  const viewportKeyRef = useRef('')
  const fittedPlacesKeyRef = useRef('')
  const focusedPlaceKeyRef = useRef('')
  const focusedContextPoiKeyRef = useRef('')
  const focusedBusinessMarkerKeyRef = useRef('')
  const markerInteractionAtRef = useRef(0)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapZoom, setMapZoom] = useState(13)
  const [mapMoving, setMapMoving] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [contextLayers, setContextLayers] = useState<Record<MapContextCategory, boolean>>(() =>
    mapContextLayersForMode(experienceMode),
  )
  const [dropPinMode, setDropPinMode] = useState(false)
  const [, setHoveredContextPoiId] = useState<string | null>(null)
  const [selectedContextPoiId, setSelectedContextPoiId] = useState<string | null>(null)
  const activeContextPoiId = contextPoiFocusId ?? selectedContextPoiId
  const [routePreviewEnabled, setRoutePreviewEnabled] = useState(
    () => new URLSearchParams(window.location.search).get('route') === '1',
  )
  const [navigationActive, setNavigationActive] = useState(false)
  const [routeOrigin, setRouteOrigin] = useState<NavigationCoordinate | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'found' | 'blocked'>(
    'idle',
  )
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedId),
    [places, selectedId],
  )
  const activeContextCategories = useMemo(
    () => contextLayerOrder.filter((category) => contextLayers[category]),
    [contextLayers],
  )
  const selectedLayerCount = activeContextCategories.length
  const zoomStage = travelMapZoomStage(mapZoom)
  const mapContextGridKey = useMemo(
    () =>
      mapBounds && mapZoom >= MIN_CONTEXT_POI_ZOOM
        ? createMapContextGridPlan({ bounds: mapBounds, zoom: mapZoom }).key
        : 'hidden',
    [mapBounds, mapZoom],
  )
  const mapContextQuery = useQuery({
    enabled: Boolean(
      mapBounds && mapZoom >= MIN_CONTEXT_POI_ZOOM && activeContextCategories.length > 0,
    ),
    queryFn: ({ signal }) =>
      fetchMapContextPois({
        bounds: mapBounds!,
        categories: activeContextCategories,
        limit: experienceMode === 'explore' ? (activeContextCategories.length > 3 ? 18 : 26) : 14,
        signal,
        zoom: mapZoom,
      }),
    queryKey: ['travel-map-context-grid', mapContextGridKey, activeContextCategories.join('|')],
    gcTime: 30 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 15 * 60 * 1000,
  })
  const contextPois = useMemo(() => {
    if (!mapBounds || mapZoom < MIN_CONTEXT_POI_ZOOM) return []
    const visibleSavedPlaces = new Set(places.map((place) => place.title.toLowerCase()))
    const candidates = (mapContextQuery.data?.pois ?? [])
      .filter(
        (poi) =>
          poi.coordinates.lat >= mapBounds.south &&
          poi.coordinates.lat <= mapBounds.north &&
          poi.coordinates.lng >= mapBounds.west &&
          poi.coordinates.lng <= mapBounds.east &&
          !visibleSavedPlaces.has(poi.title.toLowerCase()),
      )
      .slice(0, experienceMode === 'explore' ? 90 : experienceMode === 'plan' ? 58 : 38)
    const cellScale = mapZoom <= 13 ? 180 : mapZoom <= 15 ? 420 : 900
    const clusteredCells = new Map<string, MapContextPoi>()
    for (const poi of candidates) {
      const cell = `${poi.category}:${Math.round(poi.coordinates.lat * cellScale)}:${Math.round(
        poi.coordinates.lng * cellScale,
      )}`
      const existing = clusteredCells.get(cell)
      if (!existing) clusteredCells.set(cell, poi)
      else clusteredCells.set(cell, { ...existing, clusterCount: (existing.clusterCount ?? 1) + 1 })
    }
    return [...clusteredCells.values()]
  }, [experienceMode, mapBounds, mapContextQuery.data?.pois, mapZoom, places])
  const contextPoiLabelPlacements = useMemo(() => {
    const zoomLabelLimit = mapZoom <= 12 ? 8 : mapZoom <= 13 ? 10 : mapZoom <= 15 ? 18 : 30
    const maximumLabels =
      experienceMode === 'explore'
        ? zoomLabelLimit
        : Math.min(zoomLabelLimit, experienceMode === 'live' ? 8 : 12)
    const currentMap = mapRef.current
    const placements = new Map<string, 'left' | 'right'>()
    const occupiedRects: Array<{ bottom: number; left: number; right: number; top: number }> = []
    if (!currentMap) return placements
    const mapWidth = currentMap.getSize().x
    const rankedPois = [...contextPois].sort((left, right) => {
      if (left.id === activeContextPoiId) return -1
      if (right.id === activeContextPoiId) return 1
      return contextLabelPriority(right) - contextLabelPriority(left)
    })
    for (const poi of rankedPois) {
      if (placements.size >= maximumLabels && poi.id !== activeContextPoiId) continue
      const mapPoint = currentMap.latLngToContainerPoint([poi.coordinates.lat, poi.coordinates.lng])
      const estimatedWidth = Math.min(
        112,
        Math.max(
          44,
          [...poi.title].reduce(
            (width, character) => width + (character.charCodeAt(0) > 255 ? 10 : 5.6),
            8,
          ),
        ),
      )
      const placement = mapPoint.x + estimatedWidth + 34 > mapWidth ? 'left' : 'right'
      const rect = {
        bottom: mapPoint.y + 10,
        left: placement === 'right' ? mapPoint.x + 25 : mapPoint.x - 25 - estimatedWidth,
        right: placement === 'right' ? mapPoint.x + 25 + estimatedWidth : mapPoint.x - 25,
        top: mapPoint.y - 10,
      }
      const collides = occupiedRects.some(
        (occupied) =>
          rect.left < occupied.right + 5 &&
          rect.right > occupied.left - 5 &&
          rect.top < occupied.bottom + 5 &&
          rect.bottom > occupied.top - 5,
      )
      if (collides && poi.id !== activeContextPoiId) continue
      occupiedRects.push(rect)
      placements.set(poi.id, placement)
    }
    return placements
  }, [activeContextPoiId, contextPois, experienceMode, mapBounds, mapZoom])
  const selectedContextPoi = useMemo(
    () => contextPois.find((poi) => poi.id === activeContextPoiId) ?? null,
    [activeContextPoiId, contextPois],
  )
  const activeContextPoi = selectedContextPoi
  const selectedContextDetailsQuery = useQuery({
    enabled: Boolean(selectedContextPoi),
    queryFn: () => fetchMapContextPoiDetails(selectedContextPoi!, i18n.resolvedLanguage),
    queryKey: ['travel-map-context-details', selectedContextPoi?.id, i18n.resolvedLanguage],
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 24 * 60 * 60 * 1000,
  })
  const selectedContextPhotoQuery = useQuery({
    enabled: Boolean(selectedContextPoi),
    queryFn: () => fetchMapContextPoiPhoto(selectedContextPoi!),
    queryKey: ['travel-map-context-photo', selectedContextPoi?.id],
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  })
  const activeContextDetails =
    activeContextPoi?.id === selectedContextPoi?.id ? selectedContextDetailsQuery.data : null
  const activeContextPhoto =
    activeContextPoi?.id === selectedContextPoi?.id ? selectedContextPhotoQuery.data : null
  const routeBasePlace = useMemo(
    () =>
      places.find((place) => place.status === 'near-hotel') ??
      places.find((place) => place.id !== selectedId),
    [places, selectedId],
  )
  const selectedRouteCoordinates = useMemo(() => {
    if (!selectedPlace || !routePreviewEnabled) return null
    const origin =
      routeOrigin ?? (routeBasePlace ? placeToNavigationCoordinate(routeBasePlace) : null)
    if (!origin) return null
    return [origin, placeToNavigationCoordinate(selectedPlace)]
  }, [routeBasePlace, routeOrigin, routePreviewEnabled, selectedPlace])
  const selectedRouteQuery = useQuery({
    enabled: Boolean(selectedRouteCoordinates),
    gcTime: 30 * 60 * 1000,
    queryFn: () =>
      planNavigationRoute({
        coordinates: selectedRouteCoordinates!,
        mode: 'walking',
      }),
    queryKey: [
      'travel-navigation-route',
      'places',
      selectedRouteCoordinates
        ?.map((coordinate) => `${coordinate.latitude},${coordinate.longitude}`)
        .join('|'),
    ],
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 15 * 60 * 1000,
  })
  const selectedRoute = selectedRouteQuery.data
  const businessRouteQueries = useQueries({
    queries: businessRoutes.map((route) => ({
      gcTime: 30 * 60 * 1000,
      queryFn: async () => {
        const baseRoute = await planTransportNavigationRoute({
          coordinates: [route.from, route.to],
          transportMode: route.mode,
        })
        if (!['walk', 'taxi', 'car', 'bus', 'bike', 'bicycle'].includes(route.mode)) {
          return baseRoute
        }
        return planAvoidingNavigationRoute({
          baseRoute,
          coordinates: [route.from, route.to],
          hazards: routeHazards
            .filter((marker) => marker.kind === 'flash' && marker.eventStatus !== 'ended')
            .map((marker) => ({
              coordinate: { latitude: marker.latitude, longitude: marker.longitude },
              id: marker.sharedEventId ?? marker.id,
              radiusMeters:
                marker.severity === 'urgent' ? 260 : marker.severity === 'high' ? 200 : 140,
            })),
          mode:
            route.mode === 'taxi' || route.mode === 'car' || route.mode === 'bus'
              ? 'driving'
              : route.mode === 'bike' || route.mode === 'bicycle'
                ? 'cycling'
                : 'walking',
        })
      },
      queryKey: [
        'travel-navigation-route',
        'business-map',
        route.id,
        route.mode,
        route.from.latitude,
        route.from.longitude,
        route.to.latitude,
        route.to.longitude,
        routeHazards
          .filter((marker) => marker.kind === 'flash' && marker.eventStatus !== 'ended')
          .map((marker) => `${marker.id}:${marker.latitude}:${marker.longitude}:${marker.severity}`)
          .join('|'),
      ],
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15 * 60 * 1000,
    })),
  })
  const businessRouteGeometryKey = businessRouteQueries
    .map((query) => query.dataUpdatedAt)
    .join('|')
  const routePlanning =
    selectedRouteQuery.isFetching || businessRouteQueries.some((query) => query.isFetching)
  const routeFallback =
    selectedRouteQuery.isError ||
    businessRouteQueries.some((query) => query.isError || (query.isSuccess && query.data === null))
  const mapContextLoading = mapContextQuery.isFetching && !mapContextQuery.data
  const mapContextUnavailable = mapContextQuery.isError
  const toggleContextLayer = (category: MapContextCategory) => {
    setContextLayers((layers) => ({ ...layers, [category]: !layers[category] }))
  }

  useEffect(() => {
    const updateOnlineStatus = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    setContextLayers(mapContextLayersForMode(experienceMode))
    setToolsOpen(false)
    setDropPinMode(false)
    onReportPinModeChange?.(false)
  }, [experienceMode, onReportPinModeChange])

  useEffect(() => {
    onContextPoisChange?.(contextPois)
  }, [contextPois, onContextPoisChange])

  useEffect(() => {
    if (!contextPoiFocusId) {
      focusedContextPoiKeyRef.current = ''
      return
    }
    if (focusedContextPoiKeyRef.current === contextPoiFocusId) return
    const poi = contextPois.find((item) => item.id === contextPoiFocusId)
    const currentMap = mapRef.current
    if (!poi || !currentMap || !mapReady) return
    focusedContextPoiKeyRef.current = contextPoiFocusId
    setSelectedContextPoiId(poi.id)
    setHoveredContextPoiId(null)
    currentMap.flyTo([poi.coordinates.lat, poi.coordinates.lng], Math.max(mapZoom, 15), {
      duration: 0.35,
    })
    window.setTimeout(() => {
      contextMarkersRef.current.get(poi.id)?.openPopup()
    }, 380)
  }, [contextPoiFocusId, contextPois, mapReady, mapZoom])

  useEffect(() => {
    if (!navigationTargetId || selectedPlace?.id !== navigationTargetId) return
    setRoutePreviewEnabled(true)
    setNavigationActive(false)
    setDropPinMode(false)
    onReportPinModeChange?.(false)
  }, [navigationRequestId, navigationTargetId, onReportPinModeChange, selectedPlace?.id])

  useEffect(() => {
    const currentMap = mapRef.current
    if (!focusedBusinessMarker) {
      focusedBusinessMarkerKeyRef.current = ''
      return
    }
    if (
      !currentMap ||
      !mapReady ||
      focusedBusinessMarkerKeyRef.current === focusedBusinessMarker.id
    )
      return
    focusedBusinessMarkerKeyRef.current = focusedBusinessMarker.id
    currentMap.flyTo([focusedBusinessMarker.latitude, focusedBusinessMarker.longitude], 15, {
      duration: 0.4,
    })
    const offsetTimer = window.setTimeout(() => {
      currentMap.panBy(window.innerWidth >= 768 ? [150, 0] : [0, -72], {
        animate: true,
        duration: 0.25,
      })
    }, 460)
    return () => window.clearTimeout(offsetTimer)
  }, [focusedBusinessMarker, mapReady])

  useEffect(() => {
    if (!routePreviewEnabled) setNavigationActive(false)
  }, [routePreviewEnabled])

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return
    const tileProvider = getRasterTileProvider()

    const nextMap = createMap(mapRootRef.current, {
      attributionControl: true,
      center: parisCenter,
      scrollWheelZoom: true,
      zoom: 13,
      zoomControl: false,
      preferCanvas: true,
    })

    tileLayer(tileProvider.tileUrl, {
      attribution: tileProvider.attribution,
      maxZoom: tileProvider.maxZoom,
    }).addTo(nextMap)

    mapRef.current = nextMap
    setMapReady(true)
    window.setTimeout(() => nextMap.invalidateSize(), 80)

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current.clear()
      markerRenderStateRef.current.clear()
      contextMarkersRef.current.forEach((marker) => marker.remove())
      contextMarkersRef.current.clear()
      contextMarkerRenderStateRef.current.clear()
      customMarkersRef.current.forEach((marker) => marker.remove())
      customMarkersRef.current = []
      businessMarkersRef.current.forEach((marker) => marker.remove())
      businessMarkersRef.current = []
      businessRoutesRef.current.forEach((route) => route.remove())
      businessRoutesRef.current = []
      businessRouteLabelsRef.current.forEach((label) => label.remove())
      businessRouteLabelsRef.current = []
      routeRefs.current.forEach((route) => route.remove())
      routeRefs.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      nextMap.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !mapReady) return
    const syncBounds = () => {
      const nextBounds = currentMapBounds(currentMap)
      const nextZoom = currentMap.getZoom()
      const nextViewportKey = mapViewportKey(nextBounds, nextZoom)
      setMapMoving(false)
      if (viewportKeyRef.current === nextViewportKey) return
      viewportKeyRef.current = nextViewportKey
      setMapBounds(nextBounds)
      onViewportChange?.(nextBounds)
      setMapZoom(nextZoom)
    }
    const startMoving = () => setMapMoving(true)
    syncBounds()
    currentMap.on('moveend zoomend', syncBounds)
    currentMap.on('movestart zoomstart', startMoving)
    return () => {
      currentMap.off('moveend zoomend', syncBounds)
      currentMap.off('movestart zoomstart', startMoving)
    }
  }, [mapReady, onViewportChange])

  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !mapReady) return
    const handleMapClick = (event: LeafletMouseEvent) => {
      const eventTarget = event.originalEvent.target
      if (eventTarget instanceof Element && eventTarget.closest('.leaflet-marker-icon')) return
      if (Date.now() - markerInteractionAtRef.current < 1200) return
      if (reportPinMode) {
        onReportLocationSelect?.({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        })
        onReportPinModeChange?.(false)
        return
      }
      if (!dropPinMode) {
        setHoveredContextPoiId(null)
        onMapMarkerSelect(null)
        return
      }

      const nextMarker: MapPointMarker = {
        id: `marker-${Date.now()}-${Math.round(event.latlng.lat * 10000)}`,
        note: '',
        shareScope: 'space',
        title: t('map.markedPoint'),
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
        visibility: 'private',
      }
      onMapMarkerCreate(nextMarker)
      setSelectedContextPoiId(null)
      setHoveredContextPoiId(null)
      setDropPinMode(false)
    }
    currentMap.on('click', handleMapClick)
    return () => {
      currentMap.off('click', handleMapClick)
    }
  }, [
    dropPinMode,
    mapReady,
    onMapMarkerCreate,
    onMapMarkerSelect,
    onContextPoiSelect,
    onReportLocationSelect,
    onReportPinModeChange,
    reportPinMode,
    t,
  ])

  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !mapReady) return

    const journeyByPlaceId = new Map(
      businessMarkers
        .filter((item) => item.kind === 'journey')
        .map((item) => [item.placeId, item] as const),
    )
    const visiblePlaceIds = new Set(places.map((place) => place.id))
    for (const [placeId, existingMarker] of markersRef.current) {
      if (visiblePlaceIds.has(placeId)) continue
      existingMarker.remove()
      markersRef.current.delete(placeId)
      markerRenderStateRef.current.delete(placeId)
    }

    for (const place of places) {
      const selected = place.id === selectedId
      const journeyMarker = journeyByPlaceId.get(place.id)
      const renderState = [
        selected ? 'selected' : 'idle',
        journeyMarker?.sequence ?? '',
        journeyMarker?.journeyKind ?? '',
        place.category,
        place.status,
      ].join(':')
      let nextMarker = markersRef.current.get(place.id)
      if (!nextMarker) {
        nextMarker = marker(pinPosition(place), {
          alt: place.title,
          bubblingMouseEvents: false,
          icon: markerIcon(place, selected, journeyMarker?.sequence, journeyMarker?.journeyKind),
          keyboard: true,
          title: place.title,
          zIndexOffset: selected ? 1000 : 0,
        }).addTo(currentMap)
        nextMarker.bindPopup('', { className: 'travel-map-popup' })
        nextMarker.bindTooltip('', {
          className: 'travel-map-place-preview',
          direction: 'top',
          offset: [0, -24],
          opacity: 1,
        })
        markersRef.current.set(place.id, nextMarker)
      }
      nextMarker.setLatLng(pinPosition(place))
      nextMarker.setZIndexOffset(selected ? 1000 : 0)
      if (markerRenderStateRef.current.get(place.id) !== renderState) {
        nextMarker.setIcon(
          markerIcon(place, selected, journeyMarker?.sequence, journeyMarker?.journeyKind),
        )
        markerRenderStateRef.current.set(place.id, renderState)
      }
      nextMarker.setPopupContent(
        `<strong>${escapeHtml(place.title)}</strong><br><span>${escapeHtml(localizedPlaceStatus(place, t))}</span>`,
      )
      nextMarker.setTooltipContent(placePreviewContent(place, t))
      nextMarker.off('mousedown click')
      nextMarker.on('mousedown', () => {
        markerInteractionAtRef.current = Date.now()
      })
      nextMarker.on('click', (event: LeafletMouseEvent) => {
        markerInteractionAtRef.current = Date.now()
        event.originalEvent.stopPropagation()
        setSelectedContextPoiId(null)
        onMapMarkerSelect(null)
        setHoveredContextPoiId(null)
        setDropPinMode(false)
        onPlaceSelect(place.id)
        nextMarker.openPopup()
      })
    }

    const placesGeometryKey = places
      .map((place) => `${place.id}:${place.latitude.toFixed(5)}:${place.longitude.toFixed(5)}`)
      .sort()
      .join('|')

    if (focusSelectedPlace && selectedPlace) {
      if (focusedPlaceKeyRef.current === selectedPlace.id) return
      focusedPlaceKeyRef.current = selectedPlace.id
      currentMap.flyTo(pinPosition(selectedPlace), 14, { duration: 0.45 })
      window.setTimeout(() => {
        markersRef.current.get(selectedPlace.id)?.openPopup()
      }, 480)
      return
    }
    focusedPlaceKeyRef.current = ''

    if (focusedBusinessMarker) return
    if (fittedPlacesKeyRef.current === placesGeometryKey) return
    fittedPlacesKeyRef.current = placesGeometryKey

    if (places.length > 0) {
      currentMap.fitBounds(latLngBounds(places.map((place) => pinPosition(place))), {
        maxZoom: 14,
        padding: [40, 40],
      })
    }
  }, [
    focusSelectedPlace,
    focusedBusinessMarker,
    businessMarkers,
    mapReady,
    onMapMarkerSelect,
    onPlaceSelect,
    places,
    selectedId,
    selectedPlace,
  ])

  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap || !mapReady) return
    const visiblePoiIds = new Set(contextPois.map((poi) => poi.id))
    for (const [poiId, existingMarker] of contextMarkersRef.current) {
      if (visiblePoiIds.has(poiId)) continue
      existingMarker.remove()
      contextMarkersRef.current.delete(poiId)
      contextMarkerRenderStateRef.current.delete(poiId)
    }

    for (const poi of contextPois) {
      const selected = poi.id === activeContextPoiId
      const labelPlacement = contextPoiLabelPlacements.get(poi.id)
      const renderState = `${selected ? 'selected' : 'idle'}:${labelPlacement ?? 'icon'}:${poi.category}:${poi.iconKind ?? ''}:${poi.lineRefs?.join(',') ?? ''}`
      let nextMarker = contextMarkersRef.current.get(poi.id)
      if (!nextMarker) {
        nextMarker = marker([poi.coordinates.lat, poi.coordinates.lng], {
          bubblingMouseEvents: false,
          icon: contextPoiIcon(poi, selected, labelPlacement),
          keyboard: true,
          riseOnHover: true,
          title: poi.title,
          zIndexOffset: selected ? 450 : poi.category === 'transport' ? 150 : 100,
        }).addTo(currentMap)
        nextMarker.bindPopup('', { className: 'travel-map-popup' })
        nextMarker.bindTooltip('', {
          className: 'travel-map-tooltip',
          direction: 'top',
          offset: [0, -12],
          opacity: 1,
        })
        contextMarkersRef.current.set(poi.id, nextMarker)
      }
      nextMarker.setLatLng([poi.coordinates.lat, poi.coordinates.lng])
      nextMarker.setZIndexOffset(selected ? 450 : poi.category === 'transport' ? 150 : 100)
      if (contextMarkerRenderStateRef.current.get(poi.id) !== renderState) {
        nextMarker.setIcon(contextPoiIcon(poi, selected, labelPlacement))
        contextMarkerRenderStateRef.current.set(poi.id, renderState)
      }
      nextMarker.setPopupContent(
        `<strong>${escapeHtml(poi.title)}</strong><br><span>${escapeHtml(
          contextCategoryLabel(poi.category, t),
        )}</span>`,
      )
      nextMarker.setTooltipContent(
        `<strong>${escapeHtml(poi.title)}</strong><span>${escapeHtml(
          contextCategoryLabel(poi.category, t),
        )}</span><small>${escapeHtml(poiSummaryLine(poi, t('map.line')))}</small>`,
      )
      nextMarker.off('mousedown mouseover mouseout click')
      nextMarker.on('mousedown', () => {
        markerInteractionAtRef.current = Date.now()
      })
      nextMarker.on('mouseover', () => setHoveredContextPoiId(poi.id))
      nextMarker.on('mouseout', () => setHoveredContextPoiId((id) => (id === poi.id ? null : id)))
      const selectContextPoi = () => {
        markerInteractionAtRef.current = Date.now()
        setSelectedContextPoiId(poi.id)
        onContextPoiSelect?.(poi.id)
        onMapMarkerSelect(null)
        setDropPinMode(false)
        nextMarker.openPopup()
      }
      nextMarker.on('click', (event: LeafletMouseEvent) => {
        event.originalEvent.stopPropagation()
        selectContextPoi()
      })
    }
  }, [
    contextPoiLabelPlacements,
    contextPois,
    mapReady,
    onContextPoiSelect,
    onMapMarkerSelect,
    activeContextPoiId,
    t,
  ])

  useEffect(() => {
    const currentMap = mapRef.current
    customMarkersRef.current.forEach((marker) => marker.remove())
    customMarkersRef.current = []
    if (!currentMap || !mapReady || mapMarkers.length === 0) return

    customMarkersRef.current = mapMarkers.map((mapMarker) => {
      const selected = mapMarker.id === selectedMapMarkerId
      const markerTitle = mapMarker.title.trim() || t('map.markedPoint')
      const nextMarker = marker([mapMarker.latitude, mapMarker.longitude], {
        bubblingMouseEvents: false,
        icon: mapPointMarkerIcon(selected, mapMarker.visibility),
        keyboard: true,
        riseOnHover: true,
        title: markerTitle,
        zIndexOffset: selected ? 650 : 350,
      }).addTo(currentMap)
      nextMarker.bindPopup(
        `<strong>${escapeHtml(markerTitle)}</strong><br><span>${escapeHtml(
          mapMarker.note || formatCoordinates(mapMarker.latitude, mapMarker.longitude),
        )}</span>`,
        { className: 'travel-map-popup' },
      )
      nextMarker.on('mousedown', () => {
        markerInteractionAtRef.current = Date.now()
      })
      nextMarker.on('click', (event: LeafletMouseEvent) => {
        markerInteractionAtRef.current = Date.now()
        event.originalEvent.stopPropagation()
        onMapMarkerSelect(mapMarker.id)
        setSelectedContextPoiId(null)
        setHoveredContextPoiId(null)
        setDropPinMode(false)
        nextMarker.openPopup()
      })
      return nextMarker
    })
  }, [mapMarkers, mapReady, onMapMarkerSelect, selectedMapMarkerId, t])

  useEffect(() => {
    const currentMap = mapRef.current
    businessMarkersRef.current.forEach((businessMarker) => businessMarker.remove())
    businessMarkersRef.current = []
    if (!currentMap || !mapReady || businessMarkers.length === 0) return

    businessMarkersRef.current = businessMarkers
      .filter((item) => item.kind !== 'journey')
      .map((item, index) => {
        const nextMarker = marker(businessMarkerPosition(item, index, currentMap), {
          alt: item.title,
          bubblingMouseEvents: false,
          icon: businessMarkerIcon(item),
          keyboard: true,
          riseOnHover: true,
          title: item.title,
          zIndexOffset: item.kind === 'journey' ? 1100 : item.kind === 'flash' ? 950 : 800,
        }).addTo(currentMap)
        nextMarker.getElement()?.setAttribute('aria-label', `${item.title} · ${item.subtitle}`)
        nextMarker.bindTooltip(
          `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.subtitle)}</span>${
            item.kind === 'journey' && item.amount !== undefined
              ? `<small>${escapeHtml(formatMapAmount(item.amount, item.currency))}</small>`
              : ''
          }`,
          {
            className: 'travel-map-tooltip',
            direction: 'top',
            offset: [0, -14],
            opacity: 1,
          },
        )
        nextMarker.on('mousedown', () => {
          markerInteractionAtRef.current = Date.now()
        })
        nextMarker.on('click', (event: LeafletMouseEvent) => {
          markerInteractionAtRef.current = Date.now()
          event.originalEvent.stopPropagation()
          onBusinessMarkerSelect?.(item)
        })
        return nextMarker
      })
  }, [businessMarkers, mapBounds, mapReady, onBusinessMarkerSelect])

  useEffect(() => {
    const currentMap = mapRef.current
    businessRoutesRef.current.forEach((route) => route.remove())
    businessRoutesRef.current = []
    businessRouteLabelsRef.current.forEach((label) => label.remove())
    businessRouteLabelsRef.current = []
    if (!currentMap || !mapReady || businessRoutes.length === 0) return

    businessRoutesRef.current = businessRoutes.flatMap((item, index) => {
      const plannedRoute = businessRouteQueries[index]?.data
      const routeCoordinates = plannedRoute?.coordinates.length
        ? simplifyRouteCoordinates(plannedRoute.coordinates)
        : fallbackRouteCoordinates(item)
      const routeFocusActive = focusedBusinessMarker?.kind === 'journey'
      const activeRoute =
        !routeFocusActive ||
        item.fromPlaceId === focusedBusinessMarker.placeId ||
        item.toPlaceId === focusedBusinessMarker.placeId
      const fromColor = item.status === 'watching' ? '#c98235' : '#315c50'
      const toColor = item.status === 'watching' ? '#ef5c49' : '#3978cf'
      const routeHalo = polyline(routeCoordinates, {
        className: 'travel-map-business-route-halo',
        color: '#fffaf0',
        interactive: false,
        opacity: activeRoute ? 0.96 : 0.18,
        weight: activeRoute ? 13 : 7,
      }).addTo(currentMap)
      const avoidedRoute = plannedRoute?.avoidance?.originalCoordinates.length
        ? polyline(simplifyRouteCoordinates(plannedRoute.avoidance.originalCoordinates), {
            className: 'travel-map-avoided-route',
            color: '#df6b5c',
            dashArray: '5 9',
            opacity: activeRoute ? 0.58 : 0.12,
            weight: 3,
          }).addTo(currentMap)
        : null
      if (avoidedRoute && plannedRoute?.avoidance) {
        avoidedRoute.bindTooltip(
          `<strong>${escapeHtml(t('map.routeAvoidance.original'))}</strong><span>${escapeHtml(
            t('map.routeAvoidance.detour', {
              count: Math.ceil(plannedRoute.avoidance.addedDurationSeconds / 60),
            }),
          )}</span>`,
          { className: 'travel-map-tooltip', direction: 'top', opacity: 1 },
        )
      }
      const routeSegments = routeColorChunks(routeCoordinates).map((chunk) => {
        const segment = polyline(chunk.coordinates, {
          className: 'travel-map-business-route',
          color: mixRouteColor(fromColor, toColor, chunk.progress),
          opacity: activeRoute ? 1 : 0.16,
          weight: activeRoute ? 6.5 : 3,
        }).addTo(currentMap)
        segment.bindTooltip(
          `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.subtitle)}</span>`,
          {
            className: 'travel-map-tooltip',
            direction: 'top',
            opacity: 1,
          },
        )
        segment.on('mousedown', () => {
          markerInteractionAtRef.current = Date.now()
        })
        segment.on('click', (event: LeafletMouseEvent) => {
          markerInteractionAtRef.current = Date.now()
          event.originalEvent.stopPropagation()
          onBusinessRouteSelect?.(item)
        })
        return segment
      })
      const routeFlow = activeRoute
        ? polyline(routeCoordinates, {
            className: 'travel-map-business-route-flow',
            color: '#e7fff7',
            dashArray: '2 16',
            interactive: false,
            opacity: 0.92,
            weight: 3,
          }).addTo(currentMap)
        : null
      const directionIndex = Math.max(1, routeCoordinates.length - 2)
      const directionPosition = routeCoordinates[directionIndex]
      if (directionPosition && activeRoute) {
        businessRouteLabelsRef.current.push(
          marker(directionPosition, {
            bubblingMouseEvents: false,
            icon: routeDirectionIcon(
              routeDirectionAngle(routeCoordinates, directionIndex),
              mixRouteColor(fromColor, toColor, 0.92),
            ),
            interactive: false,
            keyboard: false,
            zIndexOffset: 840,
          }).addTo(currentMap),
        )
      }
      if (item.amount && activeRoute && routeCoordinates.length) {
        const costPosition = routeCoordinates[Math.floor(routeCoordinates.length * 0.42)]!
        businessRouteLabelsRef.current.push(
          marker(costPosition, {
            bubblingMouseEvents: false,
            icon: routeCostIcon(item.amount, item.currency),
            interactive: false,
            keyboard: false,
            zIndexOffset: 850,
          }).addTo(currentMap),
        )
      }
      return [
        ...(avoidedRoute ? [avoidedRoute] : []),
        routeHalo,
        ...routeSegments,
        ...(routeFlow ? [routeFlow] : []),
      ]
    })
  }, [
    businessRouteGeometryKey,
    businessRoutes,
    focusedBusinessMarker,
    mapReady,
    onBusinessRouteSelect,
    t,
  ])

  useEffect(() => {
    const currentMap = mapRef.current
    routeRefs.current.forEach((route) => route.remove())
    routeRefs.current = []
    if (!currentMap || !mapReady || !selectedRoute?.coordinates.length) return

    routeRefs.current = [
      polyline(
        selectedRoute.coordinates.map((coordinate) => [coordinate.latitude, coordinate.longitude]),
        {
          className: 'travel-map-provider-route',
          color: '#737842',
          opacity: 0.92,
          weight: 5,
        },
      ).addTo(currentMap),
    ]
    currentMap.fitBounds(
      latLngBounds(
        selectedRoute.coordinates.map((coordinate) => [coordinate.latitude, coordinate.longitude]),
      ),
      {
        maxZoom: 15,
        padding: [64, 64],
      },
    )
  }, [mapReady, selectedRoute])

  const useCurrentLocation = useCallback(() => {
    const currentMap = mapRef.current
    if (!currentMap || !navigator.geolocation) {
      setLocationStatus('blocked')
      return
    }

    setLocationStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentPosition: LatLngExpression = [
          position.coords.latitude,
          position.coords.longitude,
        ]
        userMarkerRef.current?.remove()
        userMarkerRef.current = marker(currentPosition, {
          icon: userLocationIcon(),
          title: t('map.currentLocation'),
          zIndexOffset: 1200,
        }).addTo(currentMap)
        setRouteOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        currentMap.flyTo(currentPosition, 14, { duration: 0.5 })
        setLocationStatus('found')
      },
      () => setLocationStatus('blocked'),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 5000 },
    )
  }, [t])

  const markPoi = (poi: MapContextPoi) => {
    const details = poi.id === selectedContextPoi?.id ? selectedContextDetailsQuery.data : null
    const photo = poi.id === selectedContextPoi?.id ? selectedContextPhotoQuery.data : null
    const openingHours = Array.isArray(details?.openingHours)
      ? details.openingHours.join(' · ')
      : details?.openingHours
    const nextMarker: MapPointMarker = {
      address: details?.address ?? poi.address ?? undefined,
      category: mapContextCategoryToPlaceCategory(poi.category),
      description: details?.summary ?? undefined,
      hero: photo ?? undefined,
      hours: openingHours ?? poi.openingHours ?? undefined,
      id: `marker-${Date.now()}-${Math.round(poi.coordinates.lat * 10000)}`,
      image: photo ?? undefined,
      note: '',
      shareScope: 'space',
      title: poi.title,
      latitude: poi.coordinates.lat,
      longitude: poi.coordinates.lng,
      visibility: 'private',
    }
    onMapMarkerCreate(nextMarker)
    setSelectedContextPoiId(null)
    onContextPoiSelect?.(null)
    setHoveredContextPoiId(null)
    mapRef.current?.flyTo([poi.coordinates.lat, poi.coordinates.lng], 15, { duration: 0.35 })
  }
  const openContextPoi = (poi: MapContextPoi) => {
    const details = poi.id === selectedContextPoi?.id ? selectedContextDetailsQuery.data : null
    const photo = poi.id === selectedContextPoi?.id ? selectedContextPhotoQuery.data : null
    const openingHours = Array.isArray(details?.openingHours)
      ? details.openingHours.join(' · ')
      : details?.openingHours
    const category = contextCategoryLabel(poi.category, t)
    onContextPoiOpen?.({
      address:
        details?.address ??
        poi.address ??
        formatCoordinates(poi.coordinates.lat, poi.coordinates.lng),
      category: mapContextCategoryToPlaceCategory(poi.category),
      description: details?.summary ?? undefined,
      hero: photo ?? undefined,
      hours: openingHours ?? poi.openingHours ?? undefined,
      id: poi.id,
      image: photo ?? '',
      latitude: poi.coordinates.lat,
      longitude: poi.coordinates.lng,
      meta: category,
      rating: details?.rating ? String(details.rating) : undefined,
      status: 'idea',
      statusLabel: t('places.nearbyResult', { category }),
      title: poi.title,
    })
  }
  const ActiveContextIcon = activeContextPoi
    ? (poiKindIcons[activeContextPoi.iconKind ?? ''] ??
      contextCategoryIcons[activeContextPoi.category])
    : null
  const hasListPanel = listPanel !== undefined && listPanel !== null && listPanel !== false

  return (
    <section
      className={cn(
        'travel-map relative min-h-0 overflow-hidden rounded-[22px] border border-line/80 bg-white shadow-[0_16px_44px_rgba(34,55,48,0.1)]',
        mapZoom <= 13 ? 'is-zoom-low' : mapZoom <= 15 ? 'is-zoom-medium' : 'is-zoom-high',
        mapMoving && 'is-moving',
        `is-mode-${experienceMode}`,
        dropPinMode && 'is-drop-pin',
        reportPinMode && 'is-drop-pin',
        className,
      )}
    >
      <div
        aria-label={t('map.canvasLabel')}
        className="h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-olive focus-visible:outline-offset-[-2px]"
        ref={mapRootRef}
        role="region"
        tabIndex={0}
      />

      <div className="pointer-events-auto absolute top-[4.25rem] left-1/2 z-[1395] -translate-x-1/2 sm:top-3">
        <div
          aria-label={t('map.mode.label')}
          className="travel-map-mode-switcher flex items-center gap-1 rounded-[15px] border border-white/70 bg-white/94 p-1 shadow-[0_12px_30px_rgba(34,55,48,0.14)] backdrop-blur-xl"
          role="group"
        >
          {(
            [
              { icon: Globe, id: 'explore' },
              { icon: CalendarCheck, id: 'plan' },
              { icon: Crosshairs, id: 'live' },
            ] as const
          ).map((mode) => {
            const Icon = mode.icon
            const active = experienceMode === mode.id
            return (
              <button
                aria-pressed={active}
                className={cn(
                  'inline-flex h-10 items-center gap-1.5 rounded-[11px] px-2.5 font-extrabold text-[11px] transition sm:px-3',
                  active
                    ? 'bg-[#173a35] text-white shadow-[0_6px_16px_rgba(23,58,53,0.2)]'
                    : 'text-muted hover:bg-paper hover:text-ink',
                )}
                key={mode.id}
                onClick={() => {
                  onExperienceModeChange(mode.id)
                  onViewModeChange('map')
                }}
                type="button"
              >
                <Icon size={14} />
                {t(`map.mode.${mode.id}`)}
              </button>
            )
          })}
        </div>
        <div className="mt-1 text-center font-bold text-[9px] text-olive/70 drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">
          {t(`map.zoomStage.${zoomStage}`)}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1400] flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 rounded-[15px] border border-white/70 bg-white/94 p-1 shadow-[0_12px_30px_rgba(34,55,48,0.14)] backdrop-blur-xl">
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label={t('map.list')}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-[11px] px-3 font-bold text-[12px]',
                viewMode === 'list'
                  ? 'bg-olive text-white shadow-[0_6px_16px_rgba(49,92,80,0.18)]'
                  : 'text-muted',
              )}
              onClick={() => {
                setToolsOpen(false)
                onViewModeChange('list')
              }}
              type="button"
            >
              <List size={14} />
              <span className="hidden md:inline">{t('map.list')}</span>
            </button>
            <button
              aria-label={t('map.map')}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-[11px] px-3 font-bold text-[12px]',
                viewMode === 'map'
                  ? 'bg-olive text-white shadow-[0_6px_16px_rgba(49,92,80,0.18)]'
                  : 'text-muted',
              )}
              onClick={() => {
                setToolsOpen(false)
                onViewModeChange('map')
              }}
              type="button"
            >
              <MapIcon size={14} />
              <span className="hidden md:inline">{t('map.map')}</span>
            </button>
          </div>
          <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-line/80 md:block" />
          <button
            aria-label={t('map.report.mark')}
            aria-pressed={reportPinMode}
            className={cn(
              'hidden size-10 shrink-0 items-center justify-center gap-1.5 rounded-[11px] font-bold text-[11px] transition md:inline-flex lg:w-auto lg:px-3',
              reportPinMode
                ? 'bg-[#fff0ec] text-coral ring-1 ring-coral/20'
                : 'text-coral hover:bg-[#fff5f2]',
            )}
            onClick={() => {
              setToolsOpen(false)
              onReportPinModeChange?.(!reportPinMode)
              setDropPinMode(false)
            }}
            type="button"
          >
            <Bolt size={15} />
            <span className="hidden lg:inline">{t('map.report.markShort')}</span>
          </button>
          <button
            aria-label={t('map.dropPin')}
            aria-pressed={dropPinMode}
            className={cn(
              'hidden size-10 shrink-0 items-center justify-center gap-1.5 rounded-[11px] font-bold text-[11px] transition md:inline-flex lg:w-auto lg:px-3',
              dropPinMode ? 'bg-sage text-olive ring-1 ring-olive/15' : 'text-ink hover:bg-sage/65',
            )}
            onClick={() => {
              setToolsOpen(false)
              setDropPinMode((active) => !active)
              onReportPinModeChange?.(false)
            }}
            type="button"
          >
            <LocationAdd2 size={15} />
            <span className="hidden lg:inline">{t('map.dropPinShort')}</span>
          </button>
        </div>

        <div className="pointer-events-auto relative shrink-0">
          <button
            aria-label={t('map.layers')}
            aria-expanded={toolsOpen}
            className={cn(
              'inline-flex h-12 items-center justify-center gap-2 rounded-[15px] border border-white/70 bg-white/94 px-3 font-bold text-[11px] text-ink shadow-[0_12px_30px_rgba(34,55,48,0.14)] backdrop-blur-xl transition hover:bg-sage',
              toolsOpen && 'border-olive/15 bg-sage text-olive hover:bg-sage',
            )}
            onClick={() => setToolsOpen((open) => !open)}
            type="button"
          >
            <Layer2 size={17} />
            <span className="hidden md:inline">{t('map.layers')}</span>
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full text-[9px]',
                toolsOpen ? 'bg-white/80 text-olive' : 'bg-paper text-muted',
              )}
            >
              {businessLayerCount + selectedLayerCount}
            </span>
          </button>

          {toolsOpen ? (
            <div className="absolute top-14 right-0 max-h-[min(620px,calc(100dvh-9rem))] w-[min(360px,calc(100vw-1.5rem))] overflow-auto rounded-[20px] border border-line/80 bg-white/97 p-3 shadow-[0_22px_60px_rgba(34,55,48,0.22)] backdrop-blur-xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-serif font-bold text-[19px] leading-6">
                    {t('map.layers')}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted">
                    {t('map.controls.layerSummary', {
                      nearby: selectedLayerCount,
                      travel: businessLayerCount,
                    })}
                  </div>
                </div>
                <IconButton
                  className="size-8 rounded-[10px] shadow-none"
                  label={t('actions.close')}
                  onClick={() => setToolsOpen(false)}
                >
                  <X size={16} />
                </IconButton>
              </div>

              <section className="mb-3 grid grid-cols-2 gap-2 md:hidden">
                <button
                  aria-pressed={reportPinMode}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-left font-bold text-[12px]',
                    reportPinMode ? 'bg-[#fff0ec] text-coral' : 'bg-paper/70 text-coral',
                  )}
                  onClick={() => {
                    setToolsOpen(false)
                    onReportPinModeChange?.(!reportPinMode)
                    setDropPinMode(false)
                  }}
                  type="button"
                >
                  <Bolt size={16} />
                  {t('map.report.markShort')}
                </button>
                <button
                  aria-pressed={dropPinMode}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-left font-bold text-[12px]',
                    dropPinMode ? 'bg-sage text-olive' : 'bg-paper/70 text-ink',
                  )}
                  onClick={() => {
                    setToolsOpen(false)
                    setDropPinMode((active) => !active)
                    onReportPinModeChange?.(false)
                  }}
                  type="button"
                >
                  <LocationAdd2 size={16} />
                  {t('map.dropPinShort')}
                </button>
              </section>

              {businessToolbar ? (
                <section className="mb-3">
                  <div className="mb-1.5 font-bold text-[10px] text-muted uppercase tracking-[0.08em]">
                    {t('map.controls.travelLayers')}
                  </div>
                  <div className="rounded-[14px] bg-paper/60 p-1">{businessToolbar}</div>
                </section>
              ) : null}
              <section>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="font-bold text-[10px] text-muted uppercase tracking-[0.08em]">
                    {t('map.mapContent')}
                  </span>
                  <span className="text-[9px] text-muted">
                    {t('map.layerCount', { count: selectedLayerCount })}
                  </span>
                </div>
                <div className="grid max-h-[190px] grid-cols-2 gap-1.5 overflow-auto">
                  {contextLayerOrder.map((category) => {
                    const Icon = contextCategoryIcons[category]
                    const enabled = contextLayers[category]
                    return (
                      <button
                        aria-pressed={enabled}
                        className={cn(
                          'flex h-10 min-w-0 items-center gap-2 rounded-xl px-2.5 text-left font-bold text-[11px] transition',
                          enabled ? 'bg-sage text-olive' : 'bg-paper/70 text-muted hover:bg-paper',
                        )}
                        key={category}
                        onClick={() => toggleContextLayer(category)}
                        type="button"
                      >
                        <span
                          className="grid size-6 shrink-0 place-items-center rounded-[7px] text-white shadow-[0_3px_8px_rgba(37,35,30,0.12)]"
                          style={{ background: contextCategoryColor(category) }}
                        >
                          <Icon size={13} strokeWidth={2.1} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {contextCategoryLabel(category, t)}
                        </span>
                        {enabled ? <CheckCircle className="shrink-0" size={13} /> : null}
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {reportPinMode || dropPinMode ? (
        <div className="pointer-events-auto absolute inset-x-3 bottom-[calc(9.25rem+env(safe-area-inset-bottom))] z-[1390] flex justify-center md:bottom-[4.75rem]">
          <div
            className={cn(
              'inline-flex min-h-12 max-w-full items-center gap-3 rounded-[16px] px-4 text-white shadow-[0_16px_38px_rgba(34,55,48,0.24)]',
              reportPinMode ? 'bg-coral' : 'bg-[#173a35]',
            )}
          >
            {reportPinMode ? <Bolt size={17} /> : <LocationAdd2 size={17} />}
            <span className="min-w-0 flex-1">
              <strong className="block text-[11px]">
                {reportPinMode ? t('map.report.pinTitle') : t('map.dropPinTitle')}
              </strong>
              <span className="block truncate text-[9px] text-white/76">
                {reportPinMode ? t('map.report.pinHint') : t('map.dropPinHint')}
              </span>
            </span>
            <button
              className="h-8 shrink-0 rounded-[10px] bg-white/14 px-2.5 font-bold text-[10px]"
              onClick={() => {
                setDropPinMode(false)
                onReportPinModeChange?.(false)
              }}
              type="button"
            >
              {t('actions.close')}
            </button>
          </div>
        </div>
      ) : businessPanel ? (
        <div className="pointer-events-auto absolute top-[4.75rem] right-3 z-[1390] w-[min(330px,calc(100%-1.5rem))]">
          {businessPanel}
        </div>
      ) : null}

      {hasListPanel ? (
        <div className="travel-map-list-panel pointer-events-auto absolute inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[1420] max-h-[min(58dvh,420px)] overflow-hidden rounded-2xl border border-line bg-white/96 shadow-[0_18px_54px_rgba(37,35,30,0.2)] backdrop-blur md:inset-x-auto md:left-3 md:top-[4.5rem] md:bottom-[5.25rem] md:w-[320px] md:max-h-none">
          <div
            className={cn(
              'h-full min-h-0 overflow-auto p-3 pr-2',
              Boolean(bottomToolbar) && 'pb-16 md:pb-3',
            )}
          >
            {listPanel}
          </div>
        </div>
      ) : null}

      {bottomToolbar ? (
        <div
          className={cn(
            'travel-map-search-toolbar pointer-events-auto absolute inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[5200] flex justify-center px-3 xl:bottom-3',
            hasListPanel && 'md:left-[332px]',
          )}
        >
          {bottomToolbar}
        </div>
      ) : null}

      {journeyTimeline && !activeContextPoi && !routePreviewEnabled && !hasListPanel ? (
        <div
          className={cn(
            'travel-map-journey-timeline pointer-events-auto absolute inset-x-3 z-[1360] flex justify-center',
            bottomToolbar
              ? 'bottom-[calc(9.6rem+env(safe-area-inset-bottom))] xl:bottom-[4.8rem]'
              : 'bottom-[calc(5.75rem+env(safe-area-inset-bottom))] xl:bottom-3',
          )}
        >
          {journeyTimeline}
        </div>
      ) : null}

      {activeContextPoi ? (
        <div
          className={cn(
            'travel-map-context-sheet absolute bottom-[calc(10.5rem+env(safe-area-inset-bottom))] left-3 z-[1300] w-[min(320px,calc(100%-5rem))] rounded-[18px] border border-white/80 bg-white/96 p-3 shadow-[0_18px_48px_rgba(37,35,30,0.16)] backdrop-blur-xl md:bottom-20',
            viewMode === 'list' && 'md:left-[348px]',
          )}
        >
          {activeContextPhoto ? (
            <img
              alt=""
              className="mb-3 h-28 w-full rounded-[10px] object-cover"
              src={activeContextPhoto}
            />
          ) : null}
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                {ActiveContextIcon ? (
                  <span
                    className="grid size-5 place-items-center rounded-full bg-paper"
                    style={{ color: contextCategoryColor(activeContextPoi.category) }}
                  >
                    <ActiveContextIcon size={13} />
                  </span>
                ) : null}
                {contextCategoryLabel(activeContextPoi.category, t)}
              </div>
              <div className="truncate font-extrabold text-[14px] leading-5">
                {activeContextPoi.title}
              </div>
            </div>
            <IconButton
              className="size-8 shrink-0 rounded-lg border-transparent"
              label={t('map.closeMapDetail')}
              onClick={() => {
                setSelectedContextPoiId(null)
                onContextPoiSelect?.(null)
                setHoveredContextPoiId(null)
              }}
            >
              <X size={15} />
            </IconButton>
          </div>
          <div className="space-y-1.5 text-[12px] text-muted leading-4">
            <div className="line-clamp-2">
              {formatTravelAddress(activeContextDetails?.address || activeContextPoi.address) ||
                poiSummaryLine(activeContextPoi, t('map.line'))}
            </div>
            {activeContextDetails?.summary ? (
              <div className="line-clamp-3 text-ink/75">{activeContextDetails.summary}</div>
            ) : null}
            {activeContextDetails?.rating ? (
              <div className="flex items-center gap-1.5 font-bold text-ink">
                <Star className="text-[#b97835]" fill="currentColor" size={13} />
                <span>{activeContextDetails.rating}</span>
                {activeContextDetails.ratingCount ? (
                  <span className="font-normal text-muted">
                    {t('map.placeRatingCount', { count: activeContextDetails.ratingCount })}
                  </span>
                ) : null}
              </div>
            ) : null}
            {activeContextPoi.lineRefs?.length ? (
              <div className="flex flex-wrap gap-1">
                {activeContextPoi.lineRefs.map((line, index) => (
                  <span
                    className="inline-flex h-5 items-center rounded-full px-2 font-bold text-[11px] text-white"
                    key={`${line}-${index}`}
                    style={{ background: activeContextPoi.lineColors?.[index] ?? '#3d7eeb' }}
                  >
                    {line}
                  </span>
                ))}
              </div>
            ) : null}
            {(activeContextDetails?.openingHours || activeContextPoi.openingHours) &&
            (activeContextDetails?.openingHours || activeContextPoi.openingHours) !==
              poiSummaryLine(activeContextPoi, t('map.line')) ? (
              <div className="flex items-start gap-1.5">
                <Clock className="mt-0.5 shrink-0" size={12} />
                <span className="line-clamp-2">
                  {formatTravelOpeningHours(
                    activeContextDetails?.openingHours || activeContextPoi.openingHours,
                  )}
                </span>
              </div>
            ) : null}
            {activeContextDetails?.phone ? (
              <div className="truncate">{activeContextDetails.phone}</div>
            ) : null}
            {activeContextDetails?.website ? (
              <div className="flex items-center gap-1.5 truncate">
                <Globe className="shrink-0" size={12} />
                <span className="truncate">{activeContextDetails.website}</span>
              </div>
            ) : null}
            <div className="truncate">
              {formatCoordinates(
                activeContextPoi.coordinates.lat,
                activeContextPoi.coordinates.lng,
              )}
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {onContextPoiOpen ? (
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 font-bold text-[12px] text-ink transition hover:bg-paper"
                onClick={() => openContextPoi(activeContextPoi)}
                type="button"
              >
                <ChevronDown className="-rotate-90" size={14} />
                {t('map.placeDetails')}
              </button>
            ) : null}
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-olive px-3 font-bold text-[12px] text-white transition hover:bg-olive/90"
              onClick={() => markPoi(activeContextPoi)}
              type="button"
            >
              <LocationAdd2 size={14} />
              {t('actions.markHere')}
            </button>
          </div>
        </div>
      ) : null}

      {routePreviewEnabled && selectedPlace && selectedRouteCoordinates ? (
        <div
          className={cn(
            'travel-map-context-sheet absolute bottom-[calc(10.5rem+env(safe-area-inset-bottom))] left-3 z-[1350] w-[min(320px,calc(100%-5rem))] rounded-[18px] border border-white/80 bg-white/96 p-3 shadow-[0_18px_48px_rgba(37,35,30,0.16)] backdrop-blur-xl md:bottom-20',
            viewMode === 'list' && 'md:left-[348px]',
            activeContextPoi && 'hidden md:block',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                <RouteTrack size={14} />
                {t('map.routePreview')}
              </div>
              <div className="truncate font-extrabold text-[14px] leading-5">
                {selectedPlace.title}
              </div>
            </div>
            <IconButton
              className="size-8 shrink-0 rounded-lg border-transparent"
              label={t('map.closeMapDetail')}
              onClick={() => setRoutePreviewEnabled(false)}
            >
              <X size={15} />
            </IconButton>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
            <span className="rounded-full bg-sage px-2 py-1 font-bold text-olive">
              {selectedRoute
                ? formatRouteDistance(selectedRoute.distanceMeters)
                : selectedRouteQuery.isError
                  ? t('map.routeFallback')
                  : t('map.routeLoading')}
            </span>
            <span className="rounded-full bg-paper px-2 py-1 font-bold text-muted">
              {selectedRoute
                ? formatRouteDuration(selectedRoute.durationSeconds)
                : t('map.routeProvider')}
            </span>
            <span className="rounded-full bg-paper px-2 py-1 font-bold text-muted">
              {selectedRoute?.provider ?? t('map.routeProvider')}
            </span>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 font-bold text-[12px] text-white transition',
                navigationActive ? 'bg-coral' : 'bg-olive hover:bg-olive/90',
              )}
              onClick={() => setNavigationActive((active) => !active)}
              type="button"
            >
              <RouteTrack size={14} />
              {navigationActive ? t('map.navigation.stop') : t('map.navigation.start')}
            </button>
          </div>
          {navigationActive ? (
            <div className="mt-2 rounded-[10px] bg-sage/70 px-2.5 py-2 font-bold text-[10px] text-olive">
              {t('map.navigation.activeHint', { place: selectedPlace.title })}
            </div>
          ) : null}
        </div>
      ) : null}

      {!online || routePlanning || routeFallback || mapContextLoading || mapContextUnavailable ? (
        <div
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute bottom-[calc(9.5rem+env(safe-area-inset-bottom))] left-3 z-[1220] flex max-w-[min(290px,calc(100%-5rem))] items-center gap-2 rounded-[var(--radius-control)] border border-white/75 bg-white/94 px-3 py-2 text-[11px] shadow-[var(--shadow-control)] backdrop-blur md:bottom-20',
            routeFallback || mapContextUnavailable || !online ? 'text-warning' : 'text-olive',
          )}
        >
          {!online ? (
            <MapIcon className="shrink-0" size={15} />
          ) : mapContextLoading && !routePlanning ? (
            <MapPoint className="shrink-0 animate-pulse" size={15} />
          ) : (
            <RouteTrack className={cn('shrink-0', routePlanning && 'animate-pulse')} size={15} />
          )}
          <span className="min-w-0 line-clamp-2 font-bold">
            {!online
              ? t('map.offlinePack')
              : routePlanning
                ? t('map.routeLoading')
                : mapContextLoading
                  ? t('map.mapDataLoading')
                  : routeFallback
                    ? t('map.routeFallback')
                    : t('map.mapDataUnavailable')}
          </span>
        </div>
      ) : null}

      <div className="absolute right-3 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-[1200] grid overflow-hidden rounded-xl border border-line bg-white shadow-sm md:bottom-20">
        <button
          aria-label={t('actions.zoomIn')}
          className="hidden size-10 place-items-center hover:bg-sage md:grid"
          onClick={() => mapRef.current?.zoomIn()}
          type="button"
        >
          <Plus size={18} />
        </button>
        <button
          aria-label={t('actions.zoomOut')}
          className="hidden size-10 place-items-center border-line border-t hover:bg-sage md:grid"
          onClick={() => mapRef.current?.zoomOut()}
          type="button"
        >
          <Minus size={18} />
        </button>
        <button
          aria-label={t('map.currentLocation')}
          className={cn(
            'grid size-10 place-items-center border-line text-ink transition hover:bg-sage md:border-t',
            locationStatus === 'locating' && 'animate-pulse text-olive',
            locationStatus === 'found' && 'text-olive',
          )}
          disabled={locationStatus === 'locating'}
          onClick={() => {
            setToolsOpen(false)
            useCurrentLocation()
          }}
          title={
            locationStatus === 'locating'
              ? t('map.locating')
              : locationStatus === 'blocked'
                ? t('map.locationUnavailable')
                : t('map.currentLocation')
          }
          type="button"
        >
          <Crosshairs size={18} />
        </button>
      </div>
      {locationStatus !== 'idle' ? (
        <div
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute right-[3.75rem] bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-[1220] rounded-xl border border-white/75 bg-white/94 px-3 py-2 font-bold text-[10px] shadow-[0_10px_26px_rgba(34,55,48,0.14)] backdrop-blur md:bottom-20',
            locationStatus === 'blocked' ? 'text-coral' : 'text-olive',
          )}
        >
          {locationStatus === 'locating'
            ? t('map.locating')
            : locationStatus === 'found'
              ? t('map.locationFound')
              : t('map.locationUnavailable')}
        </div>
      ) : null}
    </section>
  )
}
