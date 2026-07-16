import {
  map as createMap,
  divIcon,
  type LatLngExpression,
  type Map as LeafletMap,
  type Marker as LeafletMarker,
  type Polyline as LeafletPolyline,
  latLngBounds,
  marker,
  polyline,
  tileLayer,
} from 'leaflet'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getRasterTileProvider } from '../config/map-providers.js'
import { cn } from '../utils/class-names.js'
import { type IconComponent, MapPoint, Minus, Plus } from './icons.js'

const defaultCenter: LatLngExpression = [48.8597, 2.3278]

export interface TravelMapCoordinate {
  latitude: number
  longitude: number
}

export interface TravelMapMarker {
  id: string
  coordinate: TravelMapCoordinate
  icon: IconComponent
  title: ReactNode
  ariaLabel?: string
  className?: string
  compact?: boolean
  iconClassName?: string
  iconSize?: number
  onClick?: () => void
  selected?: boolean
  subtitle?: ReactNode
  titleClassName?: string
}

export interface TravelMapLabel {
  id: string
  coordinate: TravelMapCoordinate
  children: ReactNode
  className?: string
}

export interface TravelMapRoute {
  id: string
  coordinates: TravelMapCoordinate[]
  color?: string
  dashed?: boolean
  opacity?: number
  width?: number
}

interface TravelMapProps {
  className?: string
  controls?: ReactNode
  emptyText?: ReactNode
  fitPadding?: [number, number]
  labels?: TravelMapLabel[]
  markers?: TravelMapMarker[]
  minHeightClassName?: string
  routes?: TravelMapRoute[]
  showLocateControl?: boolean
  showZoomControls?: boolean
  zoom?: number
}

function coordinateToLatLng(coordinate: TravelMapCoordinate): LatLngExpression {
  return [coordinate.latitude, coordinate.longitude]
}

function renderNode(value: ReactNode) {
  return renderToStaticMarkup(<>{value}</>)
}

function markerIconContent(markerItem: TravelMapMarker) {
  const Icon = markerItem.icon
  const iconMarkup = renderToStaticMarkup(
    <Icon size={markerItem.iconSize ?? (markerItem.compact ? 20 : 22)} />,
  )
  return `
    <span
      class="travel-real-marker-card${markerItem.compact ? ' is-compact' : ''}${
        markerItem.selected ? ' is-selected' : ''
      } ${markerItem.className ?? ''}"
      data-travel-map-marker="${markerItem.id}"
      ${markerItem.selected ? 'data-travel-map-selected="true"' : ''}
    >
      <span class="travel-real-marker-icon ${markerItem.iconClassName ?? 'is-olive'}">
        ${iconMarkup}
      </span>
      <span class="travel-real-marker-copy">
        <strong class="${markerItem.titleClassName ?? ''}">${renderNode(markerItem.title)}</strong>
        ${markerItem.subtitle ? `<small>${renderNode(markerItem.subtitle)}</small>` : ''}
      </span>
    </span>
  `
}

function cardMarkerIcon(markerItem: TravelMapMarker) {
  return divIcon({
    className: 'travel-real-marker-leaflet-icon',
    html: markerIconContent(markerItem),
    iconAnchor: markerItem.compact ? [24, 24] : [26, 26],
    iconSize: markerItem.compact ? [190, 54] : [250, 64],
    popupAnchor: [0, -18],
  })
}

function labelIcon(label: TravelMapLabel) {
  return divIcon({
    className: 'travel-real-label-leaflet-icon',
    html: `<span class="travel-real-map-label ${label.className ?? ''}" data-travel-map-label="${
      label.id
    }">${renderNode(label.children)}</span>`,
    iconAnchor: [0, 0],
    iconSize: [160, 42],
  })
}

export function TravelMap({
  className,
  controls,
  emptyText,
  fitPadding = [42, 42],
  labels = [],
  markers = [],
  minHeightClassName = 'min-h-[560px]',
  routes = [],
  showLocateControl = false,
  showZoomControls = false,
  zoom = 13,
}: TravelMapProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRefs = useRef<LeafletMarker[]>([])
  const labelRefs = useRef<LeafletMarker[]>([])
  const routeRefs = useRef<LeafletPolyline[]>([])
  const fitCoordinates = useMemo(() => {
    const routeCoordinates = routes.flatMap((route) => route.coordinates)
    const markerCoordinates = markers.map((markerItem) => markerItem.coordinate)
    return [...routeCoordinates, ...markerCoordinates]
  }, [markers, routes])

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return
    const tileProvider = getRasterTileProvider()
    const nextMap = createMap(mapRootRef.current, {
      attributionControl: true,
      center: defaultCenter,
      scrollWheelZoom: true,
      zoom,
      zoomControl: false,
    })

    tileLayer(tileProvider.tileUrl, {
      attribution: tileProvider.attribution,
      maxZoom: tileProvider.maxZoom,
    }).addTo(nextMap)

    mapRef.current = nextMap
    window.setTimeout(() => nextMap.invalidateSize(), 80)

    return () => {
      markerRefs.current.forEach((item) => item.remove())
      markerRefs.current = []
      labelRefs.current.forEach((item) => item.remove())
      labelRefs.current = []
      routeRefs.current.forEach((item) => item.remove())
      routeRefs.current = []
      nextMap.remove()
      mapRef.current = null
    }
  }, [zoom])

  useEffect(() => {
    const currentMap = mapRef.current
    if (!currentMap) return

    markerRefs.current.forEach((item) => item.remove())
    labelRefs.current.forEach((item) => item.remove())
    routeRefs.current.forEach((item) => item.remove())
    markerRefs.current = []
    labelRefs.current = []
    routeRefs.current = []

    routeRefs.current = routes
      .filter((route) => route.coordinates.length > 1)
      .map((route) =>
        polyline(route.coordinates.map(coordinateToLatLng), {
          className: 'travel-real-map-route',
          color: route.color ?? '#737842',
          dashArray: route.dashed ? '6 8' : undefined,
          opacity: route.opacity ?? 0.9,
          weight: route.width ?? 5,
        }).addTo(currentMap),
      )

    labelRefs.current = labels.map((label) =>
      marker(coordinateToLatLng(label.coordinate), {
        icon: labelIcon(label),
        interactive: false,
        keyboard: false,
        zIndexOffset: 300,
      }).addTo(currentMap),
    )

    markerRefs.current = markers.map((markerItem) => {
      const nextMarker = marker(coordinateToLatLng(markerItem.coordinate), {
        alt:
          typeof markerItem.title === 'string'
            ? markerItem.title
            : (markerItem.ariaLabel ?? markerItem.id),
        bubblingMouseEvents: false,
        icon: cardMarkerIcon(markerItem),
        keyboard: Boolean(markerItem.onClick),
        riseOnHover: true,
        title:
          typeof markerItem.title === 'string'
            ? markerItem.title
            : (markerItem.ariaLabel ?? markerItem.id),
        zIndexOffset: markerItem.selected ? 900 : markerItem.onClick ? 500 : 350,
      }).addTo(currentMap)
      if (markerItem.onClick) {
        nextMarker.on('click', markerItem.onClick)
      }
      return nextMarker
    })

    window.setTimeout(() => currentMap.invalidateSize(), 0)

    if (fitCoordinates.length > 1) {
      currentMap.fitBounds(latLngBounds(fitCoordinates.map(coordinateToLatLng)), {
        maxZoom: 15,
        padding: fitPadding,
      })
      return
    }
    if (fitCoordinates[0]) {
      currentMap.setView(coordinateToLatLng(fitCoordinates[0]), zoom)
    }
  }, [fitCoordinates, fitPadding, labels, markers, routes, zoom])

  const locateUser = () => {
    const currentMap = mapRef.current
    if (!currentMap || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((position) => {
      currentMap.flyTo([position.coords.latitude, position.coords.longitude], 14, {
        duration: 0.45,
      })
    })
  }

  return (
    <div
      className={cn(
        'travel-map travel-real-map relative isolate overflow-hidden rounded-2xl border border-line bg-paper shadow-sm',
        minHeightClassName,
        className,
      )}
    >
      <div aria-label="Travel map" className="absolute inset-0 z-0" ref={mapRootRef} />

      {emptyText ? (
        <div className="pointer-events-none absolute inset-x-8 top-1/2 z-[1200] -translate-y-1/2 rounded-2xl border border-line bg-white/90 px-4 py-3 text-center font-bold text-[14px] text-muted shadow-sm">
          {emptyText}
        </div>
      ) : null}

      {showZoomControls || showLocateControl ? (
        <div className="absolute right-4 top-4 z-[1200] grid overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          {showZoomControls ? (
            <>
              <button
                aria-label="Zoom in"
                className="grid size-11 place-items-center hover:bg-sage"
                onClick={() => mapRef.current?.zoomIn()}
                type="button"
              >
                <Plus size={18} />
              </button>
              <button
                aria-label="Zoom out"
                className="grid size-11 place-items-center border-line border-t hover:bg-sage"
                onClick={() => mapRef.current?.zoomOut()}
                type="button"
              >
                <Minus size={18} />
              </button>
            </>
          ) : null}
          {showLocateControl ? (
            <button
              aria-label="Use current location"
              className="grid size-11 place-items-center border-line border-t hover:bg-sage"
              onClick={locateUser}
              type="button"
            >
              <MapPoint size={18} />
            </button>
          ) : null}
        </div>
      ) : null}

      {controls ? (
        <div className="absolute inset-0 z-[1200] pointer-events-none">{controls}</div>
      ) : null}
    </div>
  )
}
