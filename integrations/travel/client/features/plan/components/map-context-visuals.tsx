import { divIcon } from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  Bed,
  Bus,
  Castle,
  Coffee2,
  ForkKnife,
  Gallery,
  type IconComponent,
  Layer2,
  PizzaSlice2,
  RouteTrack,
  Store,
  Tram,
  Tree2,
  Wineglass,
} from '../../../components/icons.js'
import type { MapContextCategory, MapContextPoi } from '../api/map-context.js'
import { contextCategoryColor, contextCategoryIcons } from './map-context-palette.js'

export const poiKindIcons: Record<string, IconComponent> = {
  bar: Wineglass,
  bus: Bus,
  cafe: Coffee2,
  essentials: Layer2,
  fast_food: PizzaSlice2,
  hotel: Bed,
  museum: Gallery,
  nature: Tree2,
  rail: Tram,
  restaurant: ForkKnife,
  shopping: Store,
  sights: Castle,
  station: RouteTrack,
  subway: RouteTrack,
  tram: Tram,
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

function renderContextIcon(poi: MapContextPoi, selected: boolean) {
  const Icon = poiKindIcons[poi.iconKind ?? ''] ?? contextCategoryIcons[poi.category]
  const line = poi.lineRefs?.[0]
  const lineColor = poi.lineColors?.[0]
  const lineBadge =
    line && lineColor
      ? `<span class="travel-map-line-badge" style="--line-color: ${lineColor};">${escapeHtml(
          line,
        )}</span>`
      : ''
  const clusterBadge =
    (poi.clusterCount ?? 1) > 1
      ? `<span class="travel-map-cluster-badge">+${Math.min(99, (poi.clusterCount ?? 1) - 1)}</span>`
      : ''
  return renderToStaticMarkup(
    <Icon color="#ffffff" size={selected ? 16 : 14} weight="Outline" strokeWidth={2.15} />,
  ).concat(lineBadge, clusterBadge)
}

export function contextPoiIcon(
  poi: MapContextPoi,
  selected: boolean,
  labelPlacement?: 'left' | 'right',
) {
  const color = contextCategoryColor(poi.category)
  return divIcon({
    className: `travel-map-context-icon is-${poi.category}`,
    html: `<span class="travel-map-context-marker${selected ? ' is-selected' : ''}${labelPlacement ? ' has-label' : ''}${labelPlacement === 'left' ? ' is-label-left' : ''}"><span class="travel-map-context-point" style="--context-color: ${color}; --context-glow: ${contextCategoryGlows[poi.category]};">${renderContextIcon(
      poi,
      selected,
    )}</span><small class="travel-map-context-label">${escapeHtml(poi.title)}</small></span>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24],
    popupAnchor: [0, -12],
  })
}
