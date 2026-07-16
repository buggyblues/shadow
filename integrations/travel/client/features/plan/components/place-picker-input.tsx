import { useQuery } from '@tanstack/react-query'
import {
  map as createMap,
  divIcon,
  type Map as LeafletMap,
  type Marker,
  marker,
  tileLayer,
} from 'leaflet'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/button.js'
import { IconButton } from '../../../components/icon-button.js'
import { CheckCircle, Layer2, MapPoint, Search, X } from '../../../components/icons.js'
import { Sheet } from '../../../components/sheet.js'
import { getRasterTileProvider } from '../../../config/map-providers.js'
import { cn } from '../../../utils/class-names.js'
import {
  createDefaultMapContextLayers,
  createMapContextGridPlan,
  fetchMapContextPois,
  type MapBounds,
  type MapContextCategory,
  type MapContextPoi,
  MIN_CONTEXT_POI_ZOOM,
} from '../api/map-context.js'
import {
  type ProviderPlaceResult,
  providerResultToPlace,
  reverseGeocodePlace,
  saveProviderPlace,
  searchProviderPlaces,
} from '../api/place-search.js'
import type { Place } from '../api/places.js'
import {
  contextCategoryColor,
  contextCategoryIcons,
  contextCategoryLabel,
  contextLayerOrder,
} from './map-context-palette.js'

interface PickerCandidate {
  contextPoi?: MapContextPoi
  place: Place
  result: ProviderPlaceResult | null
}

function contextPoiToCandidate(poi: MapContextPoi): PickerCandidate {
  const result: ProviderPlaceResult = {
    address: poi.address ?? undefined,
    coordinates: poi.coordinates,
    externalRefs: {
      ...poi.externalRefs,
      type: poi.poiType ?? poi.category,
    },
    title: poi.title,
  }
  return { contextPoi: poi, place: providerResultToPlace(result), result }
}

function takeBalancedContextPois(
  pois: MapContextPoi[],
  categories: MapContextCategory[],
  limit: number,
) {
  const buckets = new Map(
    categories.map((category) => [category, pois.filter((poi) => poi.category === category)]),
  )
  const balanced: MapContextPoi[] = []
  let bucketIndex = 0
  while (balanced.length < limit) {
    let added = false
    for (const category of categories) {
      const poi = buckets.get(category)?.[bucketIndex]
      if (!poi) continue
      balanced.push(poi)
      added = true
      if (balanced.length === limit) break
    }
    if (!added) break
    bucketIndex += 1
  }
  return balanced
}

function pickerMarkerIcon(index: number, selected: boolean) {
  return divIcon({
    className: 'travel-place-picker-marker-icon',
    html: `<span class="travel-place-picker-marker${selected ? ' is-selected' : ''}">${index}</span>`,
    iconAnchor: [15, 15],
    iconSize: [30, 30],
  })
}

const contextMarkerGlyphs: Record<MapContextCategory, string> = {
  cafe: 'C',
  essentials: '+',
  hotel: 'H',
  museum: 'M',
  nature: 'P',
  restaurant: 'F',
  shopping: 'S',
  sights: '★',
  transport: 'T',
}

const contextCategoryGlows: Record<MapContextCategory, string> = {
  cafe: 'rgba(166, 106, 63, 0.14)',
  essentials: 'rgba(42, 157, 143, 0.14)',
  hotel: 'rgba(127, 109, 95, 0.14)',
  museum: 'rgba(115, 120, 66, 0.16)',
  nature: 'rgba(47, 143, 91, 0.14)',
  restaurant: 'rgba(215, 122, 61, 0.14)',
  shopping: 'rgba(141, 99, 199, 0.14)',
  sights: 'rgba(239, 92, 73, 0.14)',
  transport: 'rgba(61, 126, 235, 0.14)',
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function pickerContextPoiIcon(
  poi: MapContextPoi,
  selected: boolean,
  labelPlacement?: 'left' | 'right',
) {
  const line = poi.lineRefs?.[0]
  const glyph = line || contextMarkerGlyphs[poi.category]
  return divIcon({
    className: `travel-map-context-icon is-${poi.category}`,
    html: `<span class="travel-map-context-marker${selected ? ' is-selected' : ''}${labelPlacement ? ' has-label' : ''}${labelPlacement === 'left' ? ' is-label-left' : ''}"><span class="travel-map-context-point" style="--context-color: ${contextCategoryColor(poi.category)}; --context-glow: ${contextCategoryGlows[poi.category]};"><b class="travel-place-picker-context-glyph">${escapeHtml(glyph)}</b></span><small class="travel-map-context-label">${escapeHtml(poi.title)}</small></span>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24],
    popupAnchor: [0, -12],
  })
}

function CandidateRow({
  candidate,
  disabled,
  onSelect,
  selected,
}: {
  candidate: PickerCandidate
  disabled: boolean
  onSelect: () => void
  selected: boolean
}) {
  const { t } = useTranslation()
  const ContextIcon = candidate.contextPoi
    ? contextCategoryIcons[candidate.contextPoi.category]
    : MapPoint
  return (
    <button
      aria-selected={selected}
      className="flex min-h-12 w-full items-center gap-2 rounded-[11px] px-2 text-left transition hover:bg-paper disabled:opacity-55"
      disabled={disabled}
      onClick={onSelect}
      role="option"
      type="button"
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-sage text-olive"
        style={
          candidate.contextPoi
            ? { background: contextCategoryColor(candidate.contextPoi.category), color: '#fff' }
            : undefined
        }
      >
        <ContextIcon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[12px]">{candidate.place.title}</strong>
        <span className="block truncate text-[10px] text-muted">{candidate.place.address}</span>
        {candidate.contextPoi ? (
          <span className="text-[9px] font-bold text-olive">
            {contextCategoryLabel(candidate.contextPoi.category, t)}
          </span>
        ) : candidate.result ? (
          <span className="text-[9px] font-bold text-olive">{t('placePicker.providerResult')}</span>
        ) : null}
      </span>
      <CheckCircle className={selected ? 'text-olive' : 'text-muted/20'} size={16} />
    </button>
  )
}

export function PlacePickerInput({
  label,
  onChange,
  places,
  selectedId,
  tripId,
}: {
  label: string
  onChange: (place: Place) => void
  places: Place[]
  selectedId?: string
  tripId?: string
}) {
  const { i18n, t } = useTranslation()
  const inputId = useId()
  const resultsId = useId()
  const mapRootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const mapMarkersRef = useRef<Marker[]>([])
  const reverseRequestRef = useRef(0)
  const onChangeRef = useRef(onChange)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [providerResults, setProviderResults] = useState<PickerCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [selectedExternal, setSelectedExternal] = useState<Place | null>(null)
  const [mapDraft, setMapDraft] = useState<PickerCandidate | null>(null)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [mapZoom, setMapZoom] = useState(13)
  const [contextLayers, setContextLayers] = useState<Record<MapContextCategory, boolean>>(() =>
    createDefaultMapContextLayers(),
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()

  const localResults = useMemo(
    () =>
      places.filter(
        (place) =>
          !normalizedQuery ||
          place.title.toLocaleLowerCase().includes(normalizedQuery) ||
          place.address.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, places],
  )
  const results = useMemo<PickerCandidate[]>(
    () => [
      ...localResults.map((place) => ({ place, result: null })),
      ...providerResults.filter(
        (candidate) =>
          !localResults.some(
            (place) =>
              place.title === candidate.place.title && place.address === candidate.place.address,
          ),
      ),
    ],
    [localResults, providerResults],
  )
  const activeContextCategories = useMemo(
    () => contextLayerOrder.filter((category) => contextLayers[category]),
    [contextLayers],
  )
  const mapContextGridKey = useMemo(
    () =>
      mapBounds && mapZoom >= MIN_CONTEXT_POI_ZOOM
        ? createMapContextGridPlan({ bounds: mapBounds, zoom: mapZoom }).key
        : 'hidden',
    [mapBounds, mapZoom],
  )
  const mapContextQuery = useQuery<Awaited<ReturnType<typeof fetchMapContextPois>>>({
    enabled: Boolean(
      mapOpen && mapBounds && mapZoom >= MIN_CONTEXT_POI_ZOOM && activeContextCategories.length,
    ),
    gcTime: 30 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: ({ signal }) =>
      fetchMapContextPois({
        bounds: mapBounds!,
        categories: activeContextCategories,
        limit: activeContextCategories.length > 4 ? 16 : 24,
        signal,
        zoom: mapZoom,
      }),
    queryKey: ['travel-place-picker-context', mapContextGridKey, activeContextCategories.join('|')],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 15 * 60 * 1000,
  })
  const contextPois = useMemo(() => {
    if (!mapBounds || mapZoom < MIN_CONTEXT_POI_ZOOM) return []
    const visiblePois = (mapContextQuery.data?.pois ?? []).filter(
      (poi) =>
        activeContextCategories.includes(poi.category) &&
        poi.coordinates.lat >= mapBounds.south &&
        poi.coordinates.lat <= mapBounds.north &&
        poi.coordinates.lng >= mapBounds.west &&
        poi.coordinates.lng <= mapBounds.east,
    )
    const balancedPois = takeBalancedContextPois(
      visiblePois,
      activeContextCategories,
      visiblePois.length,
    )
    const minimumDistance = mapZoom >= 15 ? 24 : 30
    const occupiedPoints: Array<{ x: number; y: number }> = []
    const declutteredPois = balancedPois.filter((poi) => {
      const point = mapRef.current?.latLngToContainerPoint([
        poi.coordinates.lat,
        poi.coordinates.lng,
      ])
      if (!point) return true
      if (
        occupiedPoints.some(
          (occupied) => Math.hypot(occupied.x - point.x, occupied.y - point.y) < minimumDistance,
        )
      )
        return false
      occupiedPoints.push(point)
      return true
    })
    return declutteredPois.slice(0, mapZoom >= 15 ? 60 : 36)
  }, [activeContextCategories, mapBounds, mapContextQuery.data?.pois, mapZoom])
  const contextCandidates = useMemo(() => contextPois.map(contextPoiToCandidate), [contextPois])
  const mapSearchResults = useMemo(() => {
    if (!mapOpen || !normalizedQuery) return results
    return [
      ...contextCandidates.filter(
        (candidate) =>
          candidate.place.title.toLocaleLowerCase().includes(normalizedQuery) ||
          candidate.place.address.toLocaleLowerCase().includes(normalizedQuery),
      ),
      ...results,
    ].filter(
      (candidate, index, candidates) =>
        candidates.findIndex(
          (item) =>
            item.place.title === candidate.place.title &&
            item.place.address === candidate.place.address,
        ) === index,
    )
  }, [contextCandidates, mapOpen, normalizedQuery, results])
  const selectedPlace =
    places.find((place) => place.id === selectedId) ??
    providerResults.find((item) => item.place.id === selectedId)?.place ??
    (selectedExternal?.id === selectedId ? selectedExternal : undefined)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setProviderResults([])
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    setError(false)
    const timer = window.setTimeout(() => {
      void searchProviderPlaces(query.trim(), i18n.language)
        .then((response) => {
          if (!active) return
          setProviderResults(
            response.places
              .filter((item) => item.coordinates)
              .map((result, index) => ({ place: providerResultToPlace(result, index), result })),
          )
        })
        .catch(() => active && setError(true))
        .finally(() => active && setSearching(false))
    }, 280)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [i18n.language, normalizedQuery, query])

  useEffect(() => {
    if (!mapOpen || !mapRootRef.current || mapRef.current) return
    const provider = getRasterTileProvider()
    const center = mapDraft?.place ?? selectedPlace ?? results[0]?.place
    const nextMap = createMap(mapRootRef.current, {
      attributionControl: true,
      center: [center?.latitude ?? 48.8566, center?.longitude ?? 2.3522],
      scrollWheelZoom: true,
      zoom: 13,
      zoomControl: true,
    })
    tileLayer(provider.tileUrl, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
    }).addTo(nextMap)
    const updateViewport = () => {
      const bounds = nextMap.getBounds()
      setMapBounds({
        east: bounds.getEast(),
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        west: bounds.getWest(),
      })
      setMapZoom(nextMap.getZoom())
    }
    nextMap.on('moveend zoomend', updateViewport)
    nextMap.on('click', (event) => {
      const requestId = reverseRequestRef.current + 1
      reverseRequestRef.current = requestId
      setLocating(true)
      setError(false)
      void reverseGeocodePlace(event.latlng.lat, event.latlng.lng, i18n.language)
        .then((reverse) => {
          if (reverseRequestRef.current !== requestId) return
          const result: ProviderPlaceResult = {
            title: reverse?.name || t('placePicker.droppedPin'),
            address: reverse?.address ?? undefined,
            coordinates: { lat: event.latlng.lat, lng: event.latlng.lng },
            externalRefs: { provider: reverse?.provider ?? 'map' },
          }
          setMapDraft({ place: providerResultToPlace(result), result })
          setSearchOpen(false)
        })
        .catch(() => setError(true))
        .finally(() => {
          if (reverseRequestRef.current === requestId) setLocating(false)
        })
    })
    mapRef.current = nextMap
    window.setTimeout(() => {
      nextMap.invalidateSize()
      updateViewport()
    }, 0)
    return () => {
      reverseRequestRef.current += 1
      mapMarkersRef.current = []
      nextMap.remove()
      mapRef.current = null
      setMapBounds(null)
    }
  }, [i18n.language, mapOpen, t])

  useEffect(() => {
    if (!mapOpen || !mapRef.current) return
    mapMarkersRef.current.forEach((item) => item.remove())
    const candidates = [...results]
    if (
      mapDraft &&
      !mapDraft.contextPoi &&
      !candidates.some((candidate) => candidate.place.id === mapDraft.place.id)
    ) {
      candidates.push(mapDraft)
    }
    mapMarkersRef.current = candidates.map((candidate, index) => {
      const selected = candidate.place.id === mapDraft?.place.id
      const nextMarker = marker([candidate.place.latitude, candidate.place.longitude], {
        alt: candidate.place.title,
        bubblingMouseEvents: false,
        icon: pickerMarkerIcon(index + 1, selected),
        keyboard: true,
        title: candidate.place.title,
      }).addTo(mapRef.current!)
      nextMarker.bindTooltip(candidate.place.title, { direction: 'top', offset: [0, -12] })
      nextMarker.on('click', () => {
        setMapDraft(candidate)
        setSearchOpen(false)
      })
      return nextMarker
    })
    const contextMarkers = contextCandidates.map((candidate, index) => {
      const poi = candidate.contextPoi!
      const selected = candidate.place.id === mapDraft?.place.id
      const labelLimit = mapZoom >= 15 ? 18 : 8
      const labelPlacement =
        selected || index < labelLimit
          ? poi.coordinates.lng > mapRef.current!.getCenter().lng
            ? 'left'
            : 'right'
          : undefined
      const nextMarker = marker([poi.coordinates.lat, poi.coordinates.lng], {
        alt: poi.title,
        bubblingMouseEvents: false,
        icon: pickerContextPoiIcon(poi, selected, labelPlacement),
        keyboard: true,
        riseOnHover: true,
        title: poi.title,
        zIndexOffset: selected ? 450 : poi.category === 'transport' ? 150 : 100,
      }).addTo(mapRef.current!)
      nextMarker.bindTooltip(poi.title, {
        className: 'travel-map-tooltip',
        direction: 'top',
        offset: [0, -12],
        opacity: 1,
      })
      nextMarker.on('click', () => {
        setMapDraft(candidate)
        setSearchOpen(false)
      })
      return nextMarker
    })
    mapMarkersRef.current.push(...contextMarkers)
  }, [contextCandidates, mapDraft, mapOpen, mapZoom, results, t])

  async function persistCandidate(candidate: PickerCandidate) {
    return candidate.result && tripId
      ? saveProviderPlace(tripId, candidate.result)
      : candidate.place
  }

  async function chooseCandidate(candidate: PickerCandidate) {
    setError(false)
    setSaving(Boolean(candidate.result && tripId))
    try {
      const selected = await persistCandidate(candidate)
      setSelectedExternal(selected)
      onChangeRef.current(selected)
      setQuery('')
      setSearchOpen(false)
      setMapOpen(false)
      setMapDraft(null)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  function openMap() {
    const selectedCandidate = results.find((candidate) => candidate.place.id === selectedId)
    setMapDraft(
      selectedCandidate ?? (selectedPlace ? { place: selectedPlace, result: null } : null),
    )
    setSearchOpen(false)
    setMapOpen(true)
    setError(false)
  }

  function closeMap() {
    setMapOpen(false)
    setMapDraft(null)
    setQuery('')
    setSearchOpen(false)
    setError(false)
  }

  function focusMapCandidate(candidate: PickerCandidate) {
    setMapDraft(candidate)
    setSearchOpen(false)
    mapRef.current?.flyTo([candidate.place.latitude, candidate.place.longitude], 15, {
      duration: 0.35,
    })
  }

  const SelectedMapIcon = mapDraft?.contextPoi
    ? contextCategoryIcons[mapDraft.contextPoi.category]
    : CheckCircle

  return (
    <div className="relative min-w-0">
      <label className="mb-2 block font-bold text-[11px] text-muted" htmlFor={inputId}>
        {label}
      </label>
      <div className="flex min-h-11 items-center gap-1.5 rounded-[14px] border border-line bg-white p-1.5 focus-within:border-olive focus-within:ring-4 focus-within:ring-olive/10">
        <MapPoint className="ml-2 shrink-0 text-olive" size={15} />
        {selectedPlace && !query && !searchOpen ? (
          <button
            className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => setSearchOpen(true)}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[11px]">{selectedPlace.title}</strong>
              <span className="block truncate text-[9px] text-muted">{selectedPlace.address}</span>
            </span>
          </button>
        ) : (
          <span className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-1 -translate-y-1/2 text-muted"
              size={13}
            />
            <input
              aria-controls={resultsId}
              aria-expanded={searchOpen}
              aria-label={label}
              autoComplete="off"
              className="h-8 w-full bg-transparent pr-2 pl-6 text-[12px] outline-none placeholder:text-muted"
              id={inputId}
              onChange={(event) => {
                setQuery(event.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder={t('placePicker.search')}
              role="combobox"
              value={query}
            />
          </span>
        )}
        {selectedPlace ? (
          <button
            aria-label={t('placePicker.clear')}
            className="grid size-8 shrink-0 place-items-center rounded-[9px] text-muted hover:bg-paper"
            onClick={() => {
              setQuery('')
              setSearchOpen(true)
            }}
            type="button"
          >
            <X size={13} />
          </button>
        ) : null}
        <button
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[9px] bg-sage/70 px-2 font-bold text-[9px] text-olive transition hover:bg-sage"
          onClick={openMap}
          type="button"
        >
          <MapPoint size={12} />
          {t('placePicker.map')}
        </button>
      </div>
      {searchOpen && !mapOpen ? (
        <div
          className="absolute inset-x-0 top-full z-[90] mt-1.5 max-h-56 overflow-auto rounded-[14px] border border-line bg-white p-1.5 shadow-[0_16px_40px_rgba(34,55,48,0.18)]"
          id={resultsId}
          role="listbox"
        >
          {results.length ? (
            results.map((candidate) => (
              <CandidateRow
                candidate={candidate}
                disabled={saving}
                key={candidate.place.id}
                onSelect={() => void chooseCandidate(candidate)}
                selected={candidate.place.id === selectedId}
              />
            ))
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-muted">
              {searching ? t('placePicker.searching') : t('placePicker.empty')}
            </div>
          )}
        </div>
      ) : null}
      {error && !mapOpen ? (
        <div className="mt-2 text-[10px] font-bold text-coral" role="alert">
          {t('placePicker.error')}
        </div>
      ) : null}
      {mapOpen ? (
        <Sheet
          backdropClassName="z-[7600] bg-ink/20 px-0 py-0 backdrop-blur-sm"
          className="flex h-[92dvh] max-h-[92dvh] flex-col overflow-hidden p-0 sm:h-full sm:max-h-none sm:w-[540px]"
          onClose={closeMap}
        >
          <header className="flex shrink-0 items-center gap-3 border-line border-b px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-sage text-olive">
              <MapPoint size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-[14px]">{t('placePicker.mapTitle')}</strong>
              <span className="block text-[10px] text-muted">{t('placePicker.mapHint')}</span>
            </span>
            <IconButton label={t('actions.close')} onClick={closeMap}>
              <X size={17} />
            </IconButton>
          </header>
          <div className="relative z-[2] shrink-0 border-line border-b bg-white p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
                size={15}
              />
              <input
                aria-controls={`${resultsId}-map`}
                aria-expanded={searchOpen}
                aria-label={t('placePicker.searchMap')}
                autoComplete="off"
                className="h-11 w-full rounded-[13px] border border-line bg-paper/70 pr-3 pl-10 text-[13px] outline-none transition focus:border-olive focus:bg-white focus:ring-4 focus:ring-olive/10"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSearchOpen(true)
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder={t('placePicker.search')}
                role="combobox"
                value={query}
              />
              {searchOpen ? (
                <div
                  className="absolute inset-x-0 top-[calc(100%+0.375rem)] max-h-56 overflow-auto rounded-[14px] border border-line bg-white p-1.5 shadow-[0_18px_44px_rgba(34,55,48,0.2)]"
                  id={`${resultsId}-map`}
                  role="listbox"
                >
                  {mapSearchResults.length ? (
                    mapSearchResults.map((candidate) => (
                      <CandidateRow
                        candidate={candidate}
                        disabled={saving}
                        key={`${candidate.contextPoi?.id ?? 'place'}:${candidate.place.id}`}
                        onSelect={() => focusMapCandidate(candidate)}
                        selected={candidate.place.id === mapDraft?.place.id}
                      />
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center text-[11px] text-muted">
                      {searching ? t('placePicker.searching') : t('placePicker.empty')}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 font-bold text-[9px] text-muted uppercase tracking-[0.05em]">
                <Layer2 size={12} />
                {t('placePicker.layers')}
              </span>
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
                {contextLayerOrder.map((category) => {
                  const Icon = contextCategoryIcons[category]
                  const enabled = contextLayers[category]
                  return (
                    <button
                      aria-label={contextCategoryLabel(category, t)}
                      aria-pressed={enabled}
                      className={cn(
                        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border px-2 font-bold text-[10px] transition',
                        enabled
                          ? 'border-olive/15 bg-sage text-olive'
                          : 'border-line bg-white text-muted hover:bg-paper',
                      )}
                      key={category}
                      onClick={() =>
                        setContextLayers((layers) => ({
                          ...layers,
                          [category]: !layers[category],
                        }))
                      }
                      type="button"
                    >
                      <span
                        className="grid size-5 place-items-center rounded-[6px] text-white"
                        style={{ background: contextCategoryColor(category) }}
                      >
                        <Icon size={11} />
                      </span>
                      {contextCategoryLabel(category, t)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="travel-map relative min-h-[280px] flex-1 bg-paper">
            <div className="absolute inset-0" ref={mapRootRef} />
            <div
              aria-live="polite"
              className={cn(
                'pointer-events-none absolute top-3 right-3 z-[500] inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-white/75 bg-white/94 px-2.5 py-1.5 font-bold text-[9px] shadow-sm backdrop-blur',
                mapContextQuery.isError ? 'text-coral' : 'text-olive',
              )}
            >
              <Layer2
                className={cn('shrink-0', mapContextQuery.isFetching && 'animate-pulse')}
                size={12}
              />
              {mapZoom < MIN_CONTEXT_POI_ZOOM
                ? t('placePicker.zoomForPlaces')
                : mapContextQuery.isError
                  ? t('map.mapDataUnavailable')
                  : mapContextQuery.isFetching
                    ? t('map.mapDataLoading')
                    : t('placePicker.nearbyCount', { count: contextPois.length })}
            </div>
            {locating ? (
              <div className="absolute top-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-white/95 px-3 py-2 font-bold text-[10px] text-olive shadow-lg backdrop-blur">
                {t('placePicker.locating')}
              </div>
            ) : null}
          </div>
          <footer className="shrink-0 border-line border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {mapDraft ? (
              <div className="mb-3 flex items-center gap-2 rounded-[13px] bg-paper px-3 py-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-sage text-olive"
                  style={
                    mapDraft.contextPoi
                      ? {
                          background: contextCategoryColor(mapDraft.contextPoi.category),
                          color: '#fff',
                        }
                      : undefined
                  }
                >
                  <SelectedMapIcon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-bold text-muted uppercase tracking-[0.04em]">
                    {t('placePicker.selected')}
                  </span>
                  <strong className="block truncate text-[12px]">{mapDraft.place.title}</strong>
                  <span className="block truncate text-[10px] text-muted">
                    {mapDraft.place.address}
                  </span>
                </span>
              </div>
            ) : (
              <p className="mb-3 text-[11px] text-muted">{t('placePicker.tapToSelect')}</p>
            )}
            {error ? (
              <p className="mb-3 text-[10px] font-bold text-coral" role="alert">
                {t('placePicker.error')}
              </p>
            ) : null}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <Button onClick={closeMap} variant="outline">
                {t('actions.cancel')}
              </Button>
              <Button
                disabled={!mapDraft || saving || locating}
                icon={<CheckCircle size={16} />}
                onClick={() => mapDraft && void chooseCandidate(mapDraft)}
                variant="action"
              >
                {saving ? t('placePicker.saving') : t('placePicker.confirm')}
              </Button>
            </div>
          </footer>
        </Sheet>
      ) : null}
    </div>
  )
}
