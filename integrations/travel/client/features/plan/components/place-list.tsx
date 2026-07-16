import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/empty-state.js'
import {
  Bookmark,
  ChevronRight,
  FoodTray,
  Gallery,
  LocationAlt,
  MapPoint,
} from '../../../components/icons.js'
import { useTravelPreferences } from '../../../store/preferences.js'
import { cn } from '../../../utils/class-names.js'
import { isMeaningfulTravelImage } from '../../../utils/travel-images.js'
import { formatDistance } from '../../../utils/units.js'
import type { Place } from '../api/places.js'

function statusIcon(status: Place['status']) {
  if (status === 'booking') return <FoodTray size={15} />
  if (status === 'idea' || status === 'near-hotel') return <LocationAlt size={15} />
  return <Bookmark size={15} fill="currentColor" />
}

export function localizedPlaceStatus(place: Place, t: TFunction) {
  if (place.status === 'idea' && place.statusLabel.trim()) return place.statusLabel
  return t(`workspace.map.status.${place.status.replace('-', '_')}`, {
    defaultValue: place.statusLabel,
  })
}

interface PlaceRowProps {
  place: Place
  selected: boolean
  onSelect: () => void
}

function PlaceRow({ place, selected, onSelect }: PlaceRowProps) {
  const { t } = useTranslation()
  const { distanceUnit } = useTravelPreferences()
  const warning = place.status === 'booking'
  const distance = formatDistance(place.distanceKm, distanceUnit) ?? place.distance
  const PlaceholderIcon =
    place.category === 'Food' ? FoodTray : place.category === 'Museums' ? Gallery : MapPoint
  return (
    <button
      className={cn(
        'grid w-full grid-cols-[72px_minmax(0,1fr)_22px] items-center gap-3 rounded-xl bg-white p-2 text-left ring-1 ring-transparent transition',
        selected ? 'bg-sage/65 ring-olive/35' : 'hover:bg-paper/55',
      )}
      onClick={onSelect}
      type="button"
    >
      {isMeaningfulTravelImage(place.image) ? (
        <img alt="" className="h-16 w-[72px] rounded-lg object-cover" src={place.image} />
      ) : (
        <span className="grid h-16 w-[72px] place-items-center rounded-lg bg-sage text-olive">
          <PlaceholderIcon size={22} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-bold text-[13px]">{place.title}</span>
        <span className="mt-1 block truncate text-[12px] text-muted">{place.address}</span>
        <span
          className={cn(
            'mt-1.5 flex items-center gap-1.5 text-[12px]',
            warning ? 'text-coral' : 'text-olive',
          )}
        >
          {statusIcon(place.status)}
          {localizedPlaceStatus(place, t)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-4 text-muted">
        {place.distance ? <span className="whitespace-nowrap text-xs">{distance}</span> : null}
        <ChevronRight size={17} />
      </span>
    </button>
  )
}

interface PlaceListProps {
  emptyAction?: ReactNode
  emptyDescription?: ReactNode
  emptyIcon?: ReactNode
  emptyLabel?: string
  emptyTitle?: ReactNode
  places: Place[]
  selectedId: string
  title?: string
  onSelect: (id: string) => void
}

export function PlaceList({
  emptyAction,
  emptyDescription,
  emptyIcon,
  emptyLabel,
  emptyTitle,
  places,
  selectedId,
  title,
  onSelect,
}: PlaceListProps) {
  const { t } = useTranslation()
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2 px-1 font-bold text-[13px]">
        <Bookmark className="text-olive" fill="currentColor" size={15} />
        {title ?? t('places.visiblePlaces')} ({places.length})
      </div>
      {places.length ? (
        <div className="space-y-2">
          {places.map((place) => (
            <PlaceRow
              key={place.id}
              onSelect={() => onSelect(place.id)}
              place={place}
              selected={place.id === selectedId}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          action={emptyAction}
          description={emptyDescription ?? emptyLabel ?? t('places.emptyList')}
          icon={emptyIcon ?? <MapPoint size={17} />}
          size="compact"
          title={emptyTitle}
        />
      )}
    </section>
  )
}
