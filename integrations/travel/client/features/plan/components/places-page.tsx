import {
  type FormEvent,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ActionToast } from '../../../components/action-toast.js'
import { AvatarGroup } from '../../../components/avatar-group.js'
import { Button } from '../../../components/button.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  Bed,
  Bolt,
  Bookmark,
  CalendarAdd,
  CalendarCheck,
  CheckCircle,
  ChevronDown,
  Clock,
  Coffee2,
  Crosshairs,
  Filter,
  FoodTray,
  ForkKnife,
  Gallery,
  MapPoint,
  Route,
  Ticket,
  Tram,
  X,
} from '../../../components/icons.js'
import { Money } from '../../../components/money.js'
import { Sheet } from '../../../components/sheet.js'
import { SyncStatus } from '../../../components/sync-status.js'
import { TextInput } from '../../../components/text-input.js'
import { filterLabels, type PlaceFilter, tripDays } from '../../../config/copy.js'
import { useActionNotice } from '../../../hooks/use-action-notice.js'
import {
  combineTravelSyncStatus,
  usePersistentTripState,
} from '../../../hooks/use-persistent-trip-state.js'
import { TravelShellTopAction } from '../../../layouts/travel-shell.js'
import { useTravelDay } from '../../../store/travel-day.js'
import { defaultViewState, type ViewMode } from '../../../store/view.js'
import { cn } from '../../../utils/class-names.js'
import { isMeaningfulTravelImage } from '../../../utils/travel-images.js'
import { readSearchParam, writeSearchParams } from '../../../utils/url-state.js'
import {
  type MapBounds,
  type MapContextCategory,
  type MapContextPoi,
  mapContextCategoryToPlaceCategory,
} from '../api/map-context.js'
import type { Place } from '../api/places.js'
import type { TravelMember } from '../api/trip-management.js'
import { usePlaces } from '../hooks/use-places.js'
import {
  effectiveTravelReportStatus,
  removalVoteThreshold,
  useTravelReports,
} from '../hooks/use-travel-reports.js'
import { useTravelWorkspace } from '../hooks/use-travel-workspace.js'
import { useTripManagement } from '../hooks/use-trip-management.js'
import {
  expectedMapStepIndex,
  mapItemBelongsToDay,
  mapItemSortTimestamp,
  normalizeTravelMapMode,
  type TravelMapMode,
} from '../model/map-experience.js'
import type { EventCategory, EventSeverity } from '../types/travel-events.js'
import {
  MapPanel,
  type MapPointMarker,
  type TravelMapBusinessMarker,
  type TravelMapBusinessRoute,
} from './map-panel.js'
import type { PlaceEditPatch } from './place-inspector.js'
import { PlaceList } from './place-list.js'
import { type QuickAddInput, QuickAddSheet } from './quick-add-sheet.js'

const ContextCollaboration = lazy(() =>
  import('./context-collaboration.js').then((module) => ({
    default: module.ContextCollaboration,
  })),
)
const loadPlaceInspector = () => import('./place-inspector.js')
const PlaceInspector = lazy(() =>
  loadPlaceInspector().then((module) => ({ default: module.PlaceInspector })),
)

const contextCategoryLabelKeys: Record<MapContextCategory, string> = {
  cafe: 'map.cafes',
  essentials: 'map.essentials',
  hotel: 'map.stay',
  museum: 'map.museums',
  nature: 'map.parks',
  restaurant: 'map.food',
  shopping: 'map.shopping',
  sights: 'map.landmarks',
  transport: 'map.transit',
}

const filterIcons: Record<PlaceFilter, ReactNode> = {
  All: <Filter size={15} />,
  Food: <FoodTray size={15} />,
  Museums: <Gallery size={15} />,
  Saved: <Bookmark size={15} />,
  Sights: <MapPoint size={15} />,
}

type MapListTab = 'visible' | 'scheduled'
type BusinessLayer = 'journey' | 'flash' | 'transport'
type MapJourneyKind =
  | 'activity'
  | 'flight'
  | 'hotel'
  | 'meal'
  | 'metro'
  | 'restaurant'
  | 'taxi'
  | 'train'
  | 'transport'
  | 'walk'

const journeyStepIcons: Record<MapJourneyKind, typeof Route> = {
  activity: Gallery,
  flight: Route,
  hotel: Bed,
  meal: Coffee2,
  metro: Tram,
  restaurant: ForkKnife,
  taxi: Route,
  train: Tram,
  transport: Ticket,
  walk: Route,
}

const journeyStepTones: Record<MapJourneyKind, string> = {
  activity: 'bg-[#edf5fa] text-[#35749a]',
  flight: 'bg-[#f3efe6] text-[#9d6d37]',
  hotel: 'bg-[#eef2f0] text-olive',
  meal: 'bg-[#eef3e9] text-olive',
  metro: 'bg-[#f3efe6] text-[#9d6d37]',
  restaurant: 'bg-[#fff0ec] text-coral',
  taxi: 'bg-[#f3efe6] text-[#9d6d37]',
  train: 'bg-[#f3efe6] text-[#9d6d37]',
  transport: 'bg-[#edf5fa] text-[#35749a]',
  walk: 'bg-[#eef2f0] text-olive',
}

function mapJourneyKind(value?: string): MapJourneyKind {
  if (value && value in journeyStepIcons) return value as MapJourneyKind
  return 'activity'
}

interface ReportJourneyOption {
  id: string
  latitude: number
  longitude: number
  participantIds: string[]
  time: string
  title: string
}

function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

function timeFromLabel(value: string) {
  return value.match(/\b\d{1,2}:\d{2}\b/)?.[0] ?? '—'
}

function MapReportSheet({
  location,
  onClose,
  onSubmit,
}: {
  location: { latitude: number; longitude: number }
  onClose: () => void
  onSubmit: (input: {
    title: string
    category: EventCategory
    severity: EventSeverity
    validForHours: number
  }) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<EventCategory>('crowd')
  const [severity, setSeverity] = useState<EventSeverity>('medium')
  const [validForHours, setValidForHours] = useState(3)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) return
    onSubmit({
      category,
      severity,
      title: title.trim(),
      validForHours,
    })
  }
  return (
    <Sheet className="sm:w-[420px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">{t('map.report.eyebrow')}</div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">{t('map.report.title')}</h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-4 rounded-[15px] bg-sage/55 px-3 py-2.5 text-[11px] text-olive">
          <MapPoint className="mr-1.5 inline" size={14} />
          {t('map.report.locationLocked')} ·{' '}
          {formatCoordinates(location.latitude, location.longitude)}
        </div>
        <TextInput
          className="mt-4"
          aria-label={t('map.report.eventTitle')}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('map.report.eventPlaceholder')}
          value={title}
        />
        <div className="mt-4">
          <div className="mb-2 font-bold text-[10px] text-muted uppercase tracking-[0.08em]">
            {t('map.report.category')}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['crowd', 'transport', 'safety', 'weather', 'facility'] as EventCategory[]).map(
              (item) => (
                <button
                  aria-pressed={category === item}
                  className={cn(
                    'h-9 rounded-xl font-bold text-[10px] transition',
                    category === item ? 'bg-olive text-white' : 'bg-paper text-muted',
                  )}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {t(`workspace.flash.category.${item}`)}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 font-bold text-[10px] text-muted uppercase tracking-[0.08em]">
            {t('map.report.severity')}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['medium', 'high', 'urgent'] as EventSeverity[]).map((item) => (
              <button
                aria-pressed={severity === item}
                className={cn(
                  'h-9 rounded-xl font-bold text-[10px] transition',
                  severity === item ? 'bg-coral text-white' : 'bg-paper text-muted',
                )}
                key={item}
                onClick={() => setSeverity(item)}
                type="button"
              >
                {t(`workspace.flash.severity.${item}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 font-bold text-[10px] text-muted uppercase tracking-[0.08em]">
            {t('map.report.validity')}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 3, 6, 12].map((hours) => (
              <button
                aria-pressed={validForHours === hours}
                className={cn(
                  'h-9 rounded-xl font-bold text-[10px] transition',
                  validForHours === hours ? 'bg-olive text-white' : 'bg-paper text-muted',
                )}
                key={hours}
                onClick={() => setValidForHours(hours)}
                type="button"
              >
                {t('map.report.hours', { count: hours })}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-[15px] border border-line/70 bg-paper/65 p-3">
          <strong className="block text-[11px]">{t('map.report.automaticImpact')}</strong>
          <span className="mt-1 block text-[10px] text-muted leading-4">
            {t('map.report.automaticImpactHint')}
          </span>
        </div>
        <Button
          className="mt-5 w-full"
          disabled={!title.trim()}
          size="lg"
          type="submit"
          variant="action"
        >
          {t('map.report.submit')}
        </Button>
      </form>
    </Sheet>
  )
}

function MapBusinessDetail({
  collaboration,
  marker,
  members,
  onClose,
  onEndEvent,
  onOpenAffectedPlan,
  onPlanRoute,
  onVoteEvent,
  route,
}: {
  collaboration?: ReactNode
  marker: TravelMapBusinessMarker | null
  members: TravelMember[]
  onClose: () => void
  onEndEvent: (id: string) => void
  onOpenAffectedPlan?: () => void
  onPlanRoute: (placeId: string) => void
  onVoteEvent: (id: string) => void
  route: TravelMapBusinessRoute | null
}) {
  const { t } = useTranslation()
  const participantIds = marker?.participantIds ?? route?.participantIds ?? []
  const item = marker ?? route
  if (!item) return null
  const isAlert = marker?.kind === 'flash'
  const routeDestinationId = marker?.placeId ?? route?.toPlaceId
  const expiresAt = marker?.expiresAt

  return (
    <section className="overflow-hidden rounded-[18px] border border-white/70 bg-white/96 shadow-[0_18px_48px_rgba(34,55,48,0.18)] backdrop-blur-xl">
      <div className="flex items-start gap-3 p-3.5">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-[12px]',
            isAlert
              ? 'bg-[#fff0ec] text-coral'
              : marker?.kind === 'transport' || route
                ? 'bg-[#edf5fa] text-[#35749a]'
                : 'bg-sage text-olive',
          )}
        >
          {isAlert ? (
            <Bolt size={16} />
          ) : marker?.kind === 'transport' || route ? (
            <Tram size={16} />
          ) : (
            <CalendarCheck size={16} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[9px] text-muted uppercase tracking-[0.08em]">
            {route
              ? t('map.business.detail.route')
              : t(`map.business.detail.${marker?.kind ?? 'journey'}`)}
          </span>
          <strong className="mt-1 block text-[13px] leading-5">{item.title}</strong>
          <span className="mt-1 block text-[10px] text-muted leading-4">{item.subtitle}</span>
          {isAlert && expiresAt ? (
            <span className="mt-1.5 block font-bold text-[9px] text-coral">
              {t('map.report.validUntil', {
                value: new Intl.DateTimeFormat(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(expiresAt)),
              })}
            </span>
          ) : null}
        </span>
        <IconButton
          className="size-8 shrink-0 rounded-[10px] shadow-none"
          label={t('actions.close')}
          onClick={onClose}
        >
          <X size={15} />
        </IconButton>
      </div>
      {isAlert ? (
        <div className="grid grid-cols-2 gap-px border-line/70 border-t bg-line/70">
          {[
            { label: t('map.business.detail.source'), value: marker?.sourceLabel },
            { label: t('map.business.detail.confidence'), value: marker?.confidenceLabel },
            { label: t('map.business.detail.updated'), value: marker?.updatedLabel },
            { label: t('map.business.detail.window'), value: marker?.windowLabel },
          ].map((metadata) =>
            metadata.value ? (
              <span className="bg-white/96 px-3.5 py-2" key={metadata.label}>
                <span className="block text-[8px] text-muted uppercase tracking-[0.08em]">
                  {metadata.label}
                </span>
                <strong className="mt-0.5 block text-[10px] text-ink">{metadata.value}</strong>
              </span>
            ) : null,
          )}
          {marker?.delayMinutes ? (
            <span className="col-span-2 flex items-center justify-between bg-[#fff4f1] px-3.5 py-2 text-coral">
              <span className="text-[9px]">{t('map.business.detail.estimatedImpact')}</span>
              <strong className="text-[10px]">
                {t('map.business.detail.delayMinutes', { count: marker.delayMinutes })}
              </strong>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-line/70 border-t bg-paper/55 px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <AvatarGroup
            items={members
              .filter((member) => participantIds.includes(member.id))
              .map((member) => ({
                avatarUrl: member.avatarUrl,
                color: member.avatarColor,
                id: member.id,
                name: member.displayName,
              }))}
            max={4}
          />
          <span className="truncate font-bold text-[9px] text-muted">
            {marker?.journeyItemIds?.length
              ? t('map.business.detail.linkedPlans', {
                  count: marker.journeyItemIds.length,
                  travelers: participantIds.length,
                })
              : t('workspace.assignment.selected', { count: participantIds.length })}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {collaboration}
          {isAlert && marker?.journeyItemIds?.length && onOpenAffectedPlan ? (
            <IconButton
              className="size-8 rounded-[10px] shadow-none"
              label={t('map.business.detail.openAffectedPlan')}
              onClick={onOpenAffectedPlan}
            >
              <CalendarCheck size={14} />
            </IconButton>
          ) : null}
          {isAlert && marker?.sharedEventId && marker.eventStatus === 'active' ? (
            <>
              <button
                className="inline-flex h-8 items-center rounded-[10px] border border-line bg-white px-2.5 font-bold text-[9px] text-muted transition hover:bg-paper"
                onClick={() => onVoteEvent(marker.sharedEventId!)}
                type="button"
              >
                {t('map.report.voteRemove', {
                  count: marker.removalVoteCount ?? 0,
                  threshold: removalVoteThreshold,
                })}
              </button>
              <button
                className="inline-flex h-8 items-center rounded-[10px] bg-coral px-2.5 font-bold text-[9px] text-white"
                onClick={() => onEndEvent(marker.sharedEventId!)}
                type="button"
              >
                {t('map.report.endEvent')}
              </button>
            </>
          ) : routeDestinationId && !isAlert ? (
            <button
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-olive px-2.5 font-bold text-[10px] text-white"
              onClick={() => onPlanRoute(routeDestinationId)}
              type="button"
            >
              <Route size={13} />
              {t('map.business.detail.planRoute')}
            </button>
          ) : null}
        </span>
      </div>
    </section>
  )
}

function MapJourneyTimeline({
  activeIndex,
  day,
  events,
  mode,
  onLocateNow,
  onAdd,
  onExplore,
  onSelect,
  routes,
  steps,
  tripId,
}: {
  activeIndex: number
  day: number
  events: TravelMapBusinessMarker[]
  mode: TravelMapMode
  onLocateNow: () => void
  onAdd: () => void
  onExplore: () => void
  onSelect: (index: number) => void
  routes: TravelMapBusinessRoute[]
  steps: TravelMapBusinessMarker[]
  tripId?: string
}) {
  const { t } = useTranslation()
  if (!steps.length) {
    return (
      <section className="w-[min(720px,calc(100vw-1.5rem))] rounded-[18px] border border-white/80 bg-white/96 p-2.5 shadow-[0_18px_48px_rgba(34,55,48,0.16)] backdrop-blur-xl">
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-sage text-olive">
            <CalendarAdd size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-[12px] text-ink">
              {t('map.business.overview.empty')}
            </strong>
            <span className="mt-0.5 block text-[10px] text-muted leading-4">
              {t('map.business.overview.emptyHint')}
            </span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button icon={<CalendarAdd size={14} />} onClick={onAdd} size="sm" variant="action">
            {t('workspace.journey.add')}
          </Button>
          {tripId ? (
            <Suspense fallback={null}>
              <ContextCollaboration
                discussion={false}
                planner
                plannerAppearance="button"
                subjectId={`day-${day}`}
                subjectType="day"
                title={t('contextCollaboration.dayTitle', { count: day })}
                tripId={tripId}
              />
            </Suspense>
          ) : null}
          <Button icon={<MapPoint size={14} />} onClick={onExplore} size="sm" variant="outline">
            {t('map.business.overview.exploreNearby')}
          </Button>
        </div>
      </section>
    )
  }

  const current = Math.min(activeIndex, steps.length - 1)
  return (
    <section className="travel-map-timeline w-[min(900px,calc(100vw-1.5rem))] overflow-hidden rounded-[18px] border border-white/80 bg-white/96 shadow-[0_18px_48px_rgba(34,55,48,0.18)] backdrop-blur-xl">
      <header className="flex h-11 items-center gap-2 border-line/60 border-b px-2.5">
        <span className="inline-flex min-w-0 items-center gap-2 font-extrabold text-[11px] text-ink">
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-[9px]',
              mode === 'live' ? 'bg-coral text-white' : 'bg-[#173a35] text-white',
            )}
          >
            {mode === 'live' ? <Crosshairs size={14} /> : <CalendarCheck size={14} />}
          </span>
          <span className="truncate">
            {mode === 'live' ? t('map.timeline.liveTitle') : t('map.timeline.planTitle')}
          </span>
          <span className="shrink-0 font-semibold text-[9px] text-muted">
            {t('map.timeline.day', { day })} · {current + 1}/{steps.length}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton
            className="size-8 rounded-[10px] shadow-none"
            label={t('workspace.journey.add')}
            onClick={onAdd}
          >
            <CalendarAdd size={14} />
          </IconButton>
          {tripId ? (
            <Suspense fallback={null}>
              <ContextCollaboration
                planner
                subjectId={`day-${day}`}
                subjectType="day"
                title={t('contextCollaboration.dayTitle', { count: day })}
                tripId={tripId}
              />
            </Suspense>
          ) : null}
          <IconButton
            className="size-8 rounded-[10px] shadow-none"
            label={t('map.business.overview.locateNowLabel')}
            onClick={onLocateNow}
          >
            <Clock size={14} />
          </IconButton>
        </span>
      </header>
      {mode === 'live' ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 border-line/50 border-b bg-[#fff8f4] px-3 py-2 text-[10px]"
        >
          <Crosshairs className="shrink-0 text-coral" size={13} />
          <strong className="min-w-0 truncate text-ink">{steps[current]?.title}</strong>
          {steps[current + 1] ? (
            <>
              <ChevronDown className="-rotate-90 shrink-0 text-muted" size={12} />
              <span className="min-w-0 truncate text-muted">
                {t('map.timeline.upNext', { title: steps[current + 1]?.title })}
              </span>
            </>
          ) : (
            <span className="text-muted">{t('map.timeline.lastStep')}</span>
          )}
        </div>
      ) : null}
      <div className="travel-map-timeline-scroll flex max-w-full snap-x gap-1 overflow-x-auto p-1.5">
        {steps.map((step, index) => {
          const kind = mapJourneyKind(step.journeyKind)
          const Icon = journeyStepIcons[kind]
          const route = routes[Math.min(index, Math.max(0, routes.length - 1))]
          const alertCount = events.filter((event) =>
            event.journeyItemIds?.includes(step.targetId),
          ).length
          const active = index === current
          return (
            <button
              aria-label={t('map.timeline.stepLabel', {
                current: index + 1,
                title: step.title,
                total: steps.length,
              })}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'relative grid min-w-[138px] snap-center grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-[13px] px-2 py-2 text-left transition',
                active
                  ? 'bg-sage text-olive ring-1 ring-olive/15'
                  : 'bg-paper/55 text-ink hover:bg-paper',
              )}
              key={step.id}
              onClick={() => onSelect(index)}
              type="button"
            >
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-[9px]',
                  journeyStepTones[kind],
                )}
              >
                <Icon size={13} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-extrabold text-[9px] text-muted">
                  <span>{index + 1}</span>
                  {step.time ? <span>· {step.time}</span> : null}
                  {alertCount ? (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-coral">
                      <Bolt size={9} /> {alertCount}
                    </span>
                  ) : null}
                </span>
                <strong className="mt-0.5 block truncate text-[10px] leading-4">
                  {step.title}
                </strong>
                {step.amount !== undefined && step.currency ? (
                  <span className="mt-0.5 block text-[9px] text-muted">
                    <Money amount={step.amount} currency={step.currency} />
                  </span>
                ) : route?.amount !== undefined && route.currency ? (
                  <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted">
                    <Tram size={9} />
                    <Money amount={route.amount} currency={route.currency} />
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function PlacesPage() {
  const { t } = useTranslation()
  const places = usePlaces()
  const management = useTripManagement()
  const workspace = useTravelWorkspace()
  const reports = useTravelReports()
  const activeDay = useTravelDay()
  const { message, showNotice } = useActionNotice()
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    readSearchParam('view') === 'list' ? 'list' : defaultViewState.viewMode,
  )
  const [mapMode, setMapMode] = useState<TravelMapMode>(() =>
    normalizeTravelMapMode(readSearchParam('mode')),
  )
  const [detailSheet, setDetailSheet] = useState<'place' | 'map-point' | 'context-poi' | null>(null)
  const [contextDetailPlace, setContextDetailPlace] = useState<Place | null>(null)
  const [focusMapSelection, setFocusMapSelection] = useState(() =>
    Boolean(new URLSearchParams(window.location.search).get('place')),
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [journeyAddOpen, setJourneyAddOpen] = useState(false)
  const [mapListTab, setMapListTab] = useState<MapListTab>('visible')
  const [sheetClosing, setSheetClosing] = useState(false)
  const [mapMarkers, setMapMarkers, mapMarkerSyncStatus] = usePersistentTripState<MapPointMarker[]>(
    workspace.currentTrip?.id,
    'map-markers',
    [],
    { enabled: Boolean(workspace.currentTrip?.id) },
  )
  const [selectedMapMarkerId, setSelectedMapMarkerId] = useState<string | null>(null)
  const [mapContextPois, setMapContextPois] = useState<MapContextPoi[]>([])
  const [mapViewport, setMapViewport] = useState<MapBounds | null>(null)
  const [searchViewportOnly, setSearchViewportOnly] = useState(false)
  const [selectedContextPoiId, setSelectedContextPoiId] = useState<string | null>(null)
  const [newMapMarkerEditId, setNewMapMarkerEditId] = useState<string | null>(null)
  const [activeJourneyStepIndex, setActiveJourneyStepIndex] = useState(() => {
    const requested = Number(readSearchParam('step'))
    return Number.isInteger(requested) && requested > 0 ? requested - 1 : 0
  })
  const [selectedBusinessMarkerId, setSelectedBusinessMarkerId] = useState<string | null>(null)
  const [selectedBusinessRouteId, setSelectedBusinessRouteId] = useState<string | null>(null)
  const [navigationTargetId, setNavigationTargetId] = useState<string | null>(
    () =>
      new URLSearchParams(window.location.search).get('route') &&
      new URLSearchParams(window.location.search).get('place'),
  )
  const [navigationRequestId, setNavigationRequestId] = useState(0)
  const [reportPinMode, setReportPinMode] = useState(
    () => new URLSearchParams(window.location.search).get('report') === '1',
  )
  const [reportLocation, setReportLocation] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const requestedLayers = readSearchParam('layers')
  const [businessLayers, setBusinessLayers, businessLayerSyncStatus] = usePersistentTripState<
    Record<BusinessLayer, boolean>
  >(
    workspace.currentTrip?.id,
    'map-layers',
    {
      flash: requestedLayers ? requestedLayers.split(',').includes('flash') : true,
      journey: requestedLayers ? requestedLayers.split(',').includes('journey') : true,
      transport: requestedLayers ? requestedLayers.split(',').includes('transport') : true,
    },
    { enabled: Boolean(workspace.currentTrip?.id) },
  )
  const mapSyncStatus = combineTravelSyncStatus([
    places.syncStatus,
    reports.syncStatus,
    mapMarkerSyncStatus,
    businessLayerSyncStatus,
  ])
  const sheetCloseTimer = useRef<number | null>(null)
  const deepLinkHandled = useRef(false)
  const businessDeepLinkHandled = useRef(false)
  const listOpen = viewMode === 'list'
  const selectedMapMarker = useMemo(
    () => mapMarkers.find((marker) => marker.id === selectedMapMarkerId) ?? null,
    [mapMarkers, selectedMapMarkerId],
  )
  useEffect(() => {
    if (selectedContextPoiId || selectedMapMarkerId) void loadPlaceInspector()
  }, [selectedContextPoiId, selectedMapMarkerId])
  const mapMarkerPlaces = useMemo<Place[]>(
    () =>
      mapMarkers.map((marker) => {
        const scheduled = Boolean(marker.scheduledDay)
        const imageCandidate = marker.image || marker.hero
        const image = isMeaningfulTravelImage(imageCandidate) ? imageCandidate : ''
        return {
          id: marker.id,
          title: marker.title || t('map.markedPoint'),
          category: marker.category ?? 'Sights',
          address: marker.address || formatCoordinates(marker.latitude, marker.longitude),
          meta: scheduled ? `${t('actions.saved')} · ${marker.scheduledDay}` : t('map.mapPoint'),
          status: scheduled ? 'scheduled' : 'saved',
          statusLabel: scheduled
            ? `${t('actions.saved')} · ${marker.scheduledDay}`
            : t('map.mapPoint'),
          image,
          hero: isMeaningfulTravelImage(marker.hero) ? marker.hero : image || undefined,
          attachmentId: marker.attachmentId,
          attachmentName: marker.attachmentName,
          latitude: marker.latitude,
          longitude: marker.longitude,
          rating: marker.visibility === 'shared' ? t('map.shared') : t('map.private'),
          hours: marker.hours || t('places.customHours'),
          cost: marker.cost || t('places.notSet'),
          description: marker.description || t('places.customDescription'),
          notes: marker.note,
        }
      }),
    [mapMarkers, t],
  )
  const selectedMapMarkerPlace = useMemo(
    () => mapMarkerPlaces.find((place) => place.id === selectedMapMarkerId),
    [mapMarkerPlaces, selectedMapMarkerId],
  )
  const filteredMapMarkerPlaces = useMemo(() => {
    const normalizedQuery = places.query.trim().toLowerCase()
    return mapMarkerPlaces.filter((place) => {
      const matchesQuery =
        !normalizedQuery ||
        place.title.toLowerCase().includes(normalizedQuery) ||
        place.address.toLowerCase().includes(normalizedQuery)
      const matchesFilter =
        places.filter === 'All' || places.filter === 'Saved' || place.category === places.filter
      return matchesQuery && matchesFilter
    })
  }, [mapMarkerPlaces, places.filter, places.query])
  const filteredContextPlaces = useMemo<Place[]>(() => {
    const normalizedQuery = places.query.trim().toLowerCase()
    return mapContextPois.flatMap((poi) => {
      const category = mapContextCategoryToPlaceCategory(poi.category)
      const matchesQuery =
        !normalizedQuery ||
        poi.title.toLowerCase().includes(normalizedQuery) ||
        poi.address?.toLowerCase().includes(normalizedQuery) ||
        poi.poiType?.toLowerCase().includes(normalizedQuery)
      const matchesFilter =
        places.filter === 'All' || (places.filter !== 'Saved' && places.filter === category)
      if (!matchesQuery || !matchesFilter) return []
      const categoryLabel = t(contextCategoryLabelKeys[poi.category])
      return [
        {
          address:
            poi.address ||
            poi.poiType ||
            formatCoordinates(poi.coordinates.lat, poi.coordinates.lng),
          category,
          id: poi.id,
          image: '',
          latitude: poi.coordinates.lat,
          longitude: poi.coordinates.lng,
          meta: categoryLabel,
          status: 'idea' as const,
          statusLabel: t('places.nearbyResult', { category: categoryLabel }),
          title: poi.title,
        },
      ]
    })
  }, [mapContextPois, places.filter, places.query, t])
  const visibleListPlaces = useMemo(() => {
    const results = [...places.filteredPlaces, ...filteredMapMarkerPlaces, ...filteredContextPlaces]
    if (!searchViewportOnly || !mapViewport) return results
    return results.filter(
      (place) =>
        place.latitude >= mapViewport.south &&
        place.latitude <= mapViewport.north &&
        place.longitude >= mapViewport.west &&
        place.longitude <= mapViewport.east,
    )
  }, [
    filteredContextPlaces,
    filteredMapMarkerPlaces,
    mapViewport,
    places.filteredPlaces,
    searchViewportOnly,
  ])
  const scheduledListPlaces = useMemo(
    () => [
      ...places.filteredPlaces.filter((place) => place.status === 'scheduled'),
      ...filteredMapMarkerPlaces.filter((place) => place.status === 'scheduled'),
    ],
    [filteredMapMarkerPlaces, places.filteredPlaces],
  )
  const reportJourneyOptions = useMemo<ReportJourneyOption[]>(() => {
    const data = management.data
    if (!data) return []
    const findPlace = (placeId: string) =>
      places.places.find((place) => place.id === placeId) ??
      data.places.find((place) => place.id === placeId)
    const day = data.days?.[activeDay - 1]
    const belongsToDay = (item: {
      dayId?: string
      dayNumber?: number
      startAt?: string
      time?: string
    }) => mapItemBelongsToDay(item, day, activeDay)
    return [
      ...data.reservations.flatMap((item) => {
        if (!belongsToDay({ startAt: item.startAt ?? item.startLabel })) return []
        const place = findPlace(item.placeId)
        if (!place) return []
        return [
          {
            id: item.id,
            latitude: place.latitude,
            longitude: place.longitude,
            participantIds: item.participantIds,
            time: timeFromLabel(item.startLabel),
            title: item.title,
          },
        ]
      }),
      ...data.transports.flatMap((item) => {
        if (!belongsToDay({ startAt: item.startAt ?? item.departureLabel })) return []
        const place = findPlace(item.toPlaceId)
        if (!place) return []
        return [
          {
            id: item.id,
            latitude: place.latitude,
            longitude: place.longitude,
            participantIds: item.participantIds,
            time: timeFromLabel(item.departureLabel),
            title: item.title,
          },
        ]
      }),
      ...(data.journeyItems ?? []).flatMap((item) => {
        if (!item.placeId || !belongsToDay(item)) return []
        const place = findPlace(item.placeId)
        if (!place) return []
        return [
          {
            id: item.id,
            latitude: place.latitude,
            longitude: place.longitude,
            participantIds: item.participantIds,
            time: timeFromLabel(item.startAt ?? item.time),
            title: item.title,
          },
        ]
      }),
    ].sort((left, right) => left.time.localeCompare(right.time))
  }, [activeDay, management.data, places.places])
  const businessData = useMemo(() => {
    const data = management.data
    if (!data) {
      return {
        flash: [] as TravelMapBusinessMarker[],
        flashCount: 0,
        journey: [] as TravelMapBusinessMarker[],
        journeyRoutes: [] as TravelMapBusinessRoute[],
        transport: [] as TravelMapBusinessMarker[],
        routes: [] as TravelMapBusinessRoute[],
      }
    }
    const findPlace = (placeId: string) =>
      places.places.find((place) => place.id === placeId) ??
      data.places.find((place) => place.id === placeId)
    const day = data.days?.[activeDay - 1]
    const belongsToDay = (item: {
      dayId?: string
      dayNumber?: number
      startAt?: string
      time?: string
    }) => mapItemBelongsToDay(item, day, activeDay)
    const dayTransports = data.transports
      .filter((item) => belongsToDay({ startAt: item.startAt ?? item.departureLabel }))
      .sort(
        (left, right) =>
          mapItemSortTimestamp({ startAt: left.startAt ?? left.departureLabel }) -
          mapItemSortTimestamp({ startAt: right.startAt ?? right.departureLabel }),
      )
    const dayReservations = data.reservations.filter((item) =>
      belongsToDay({ startAt: item.startAt ?? item.startLabel }),
    )
    const dayJourneyItems = (data.journeyItems ?? []).filter(belongsToDay)
    const dayItemIds = new Set([
      ...dayTransports.map((item) => item.id),
      ...dayReservations.map((item) => item.id),
      ...dayJourneyItems.map((item) => item.id),
    ])
    type JourneyCandidate = {
      amount?: number
      currency?: string
      journeyKind: string
      participantIds: string[]
      placeId: string
      priority: number
      startAt?: string
      targetId: string
      title: string
    }
    const candidates: JourneyCandidate[] = [
      ...dayTransports.flatMap((item) => [
        {
          journeyKind: item.mode,
          participantIds: item.participantIds,
          placeId: item.fromPlaceId,
          priority: 1,
          startAt: item.startAt ?? item.departureLabel,
          targetId: item.id,
          title: findPlace(item.fromPlaceId)?.title ?? item.title,
        },
        {
          journeyKind: item.mode,
          participantIds: item.participantIds,
          placeId: item.toPlaceId,
          priority: 1,
          startAt: item.endAt ?? item.arrivalLabel ?? item.startAt,
          targetId: item.id,
          title: findPlace(item.toPlaceId)?.title ?? item.title,
        },
      ]),
      ...dayReservations.map((item) => ({
        amount: item.cost,
        currency: item.currency,
        journeyKind: item.kind,
        participantIds: item.participantIds,
        placeId: item.placeId,
        priority: 2,
        startAt: item.startAt ?? item.startLabel,
        targetId: item.id,
        title: item.title,
      })),
      ...dayJourneyItems.flatMap((item) =>
        item.placeId
          ? [
              {
                amount: item.cost,
                currency: item.currency,
                journeyKind: item.kind,
                participantIds: item.participantIds,
                placeId: item.placeId,
                priority: 3,
                startAt: item.startAt ?? item.time,
                targetId: item.id,
                title: item.title,
              },
            ]
          : [],
      ),
    ].filter((item) => Boolean(findPlace(item.placeId)))
    candidates.sort((left, right) => mapItemSortTimestamp(left) - mapItemSortTimestamp(right))
    const dedupedCandidates: JourneyCandidate[] = []
    for (const candidate of candidates) {
      const minute = timeFromLabel(candidate.startAt ?? '')
      const existingIndex = dedupedCandidates.findIndex(
        (item) =>
          item.placeId === candidate.placeId && timeFromLabel(item.startAt ?? '') === minute,
      )
      if (existingIndex < 0) dedupedCandidates.push(candidate)
      else if (candidate.priority > dedupedCandidates[existingIndex]!.priority)
        dedupedCandidates[existingIndex] = candidate
    }
    const journey: TravelMapBusinessMarker[] = dedupedCandidates.flatMap((item, index) => {
      const place = findPlace(item.placeId)
      if (!place) return []
      const sequence = index + 1
      return [
        {
          amount: item.amount,
          badge: String(sequence),
          currency: item.currency,
          id: `journey-${item.targetId}-${item.placeId}-${sequence}`,
          journeyKind: item.journeyKind,
          kind: 'journey' as const,
          latitude: place.latitude,
          longitude: place.longitude,
          participantIds: item.participantIds,
          placeId: item.placeId,
          placeTitle: place.title,
          sequence,
          startAt: item.startAt,
          subtitle: t('map.business.atlasStop', { place: place.title, sequence }),
          targetId: item.targetId,
          time: timeFromLabel(item.startAt ?? ''),
          title: item.title,
        },
      ]
    })
    const flash: TravelMapBusinessMarker[] = []
    const visibleSharedReports = reports.reports.filter(
      (report) =>
        effectiveTravelReportStatus(report) !== 'removed' &&
        (!report.journeyItemIds.length || report.journeyItemIds.some((id) => dayItemIds.has(id))),
    )
    flash.push(
      ...visibleSharedReports.map((report) => ({
        badge:
          effectiveTravelReportStatus(report) === 'ended'
            ? t('map.report.ended')
            : t(`workspace.flash.severity.${report.severity}`),
        confidenceLabel: t('workspace.flash.confidence.pending'),
        delayMinutes: report.severity === 'urgent' ? 25 : report.severity === 'high' ? 15 : 5,
        id: `flash-${report.id}`,
        kind: 'flash' as const,
        latitude: report.latitude,
        longitude: report.longitude,
        journeyItemIds: report.journeyItemIds,
        participantIds: report.participantIds,
        placeId: report.id,
        severity: report.severity,
        eventStatus: effectiveTravelReportStatus(report),
        expiresAt: report.expiresAt,
        removalVoteCount: report.removalVotes.length,
        sharedEventId: report.id,
        sourceLabel: t('workspace.flash.source.community'),
        subtitle: t('map.report.sharedEventSubtitle'),
        targetId: report.id,
        title: report.title,
        updatedLabel: t('workspace.flash.updated.now'),
        windowLabel: t('map.report.validUntil', {
          value: new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(report.expiresAt)),
        }),
      })),
    )
    const transport: TravelMapBusinessMarker[] = dayTransports.flatMap((item) => {
      const place = findPlace(item.toPlaceId)
      if (!place) return []
      return [
        {
          badge: t(`map.business.mode.${item.mode}`),
          id: `transport-${item.id}`,
          kind: 'transport',
          latitude: place.latitude,
          longitude: place.longitude,
          participantIds: item.participantIds,
          placeId: item.toPlaceId,
          subtitle: t('map.business.transportSubtitle', {
            duration: item.durationMinutes,
            service: item.serviceLabel ?? item.provider,
          }),
          targetId: item.id,
          title: item.title,
        },
      ]
    })
    const transportRoutes: TravelMapBusinessRoute[] = dayTransports.flatMap((item) => {
      const from = findPlace(item.fromPlaceId)
      const to = findPlace(item.toPlaceId)
      if (!from || !to) return []
      return [
        {
          amount: item.cost,
          currency: item.currency,
          from: { latitude: from.latitude, longitude: from.longitude },
          fromPlaceId: item.fromPlaceId,
          id: `route-${item.id}`,
          kind: 'transport',
          mode: item.mode,
          participantIds: item.participantIds,
          status: item.status,
          subtitle: t('map.business.routeSubtitle', {
            duration: item.durationMinutes,
            service: item.serviceLabel ?? item.provider,
          }),
          targetId: item.id,
          title: item.title,
          to: { latitude: to.latitude, longitude: to.longitude },
          toPlaceId: item.toPlaceId,
        },
      ]
    })
    const transportPairs = new Set(
      dayTransports.map((item) => `${item.fromPlaceId}:${item.toPlaceId}`),
    )
    const itineraryRoutes: TravelMapBusinessRoute[] = journey.slice(1).flatMap((step, index) => {
      const previous = journey[index]
      if (!previous || transportPairs.has(`${previous.placeId}:${step.placeId}`)) return []
      return [
        {
          from: { latitude: previous.latitude, longitude: previous.longitude },
          fromPlaceId: previous.placeId,
          id: `itinerary-${previous.id}-${step.id}`,
          kind: 'itinerary' as const,
          mode: 'walk',
          participantIds: [
            ...new Set([...(previous.participantIds ?? []), ...(step.participantIds ?? [])]),
          ],
          status: 'planned' as const,
          subtitle: t('map.business.walkingConnection'),
          targetId: step.targetId,
          title: t('map.business.itineraryPath', {
            from: previous.placeTitle ?? previous.title,
            to: step.placeTitle ?? step.title,
          }),
          to: { latitude: step.latitude, longitude: step.longitude },
          toPlaceId: step.placeId,
        },
      ]
    })
    const routes = [...transportRoutes, ...itineraryRoutes]
    return {
      flash,
      flashCount: visibleSharedReports.length,
      journey,
      journeyRoutes: itineraryRoutes,
      routes,
      transport,
    }
  }, [activeDay, management.data, places.places, reports.reports, t])
  const businessMarkers = useMemo(() => {
    if (mapMode === 'explore') return businessLayers.flash ? businessData.flash : []
    return [
      ...(businessLayers.journey ? businessData.journey : []),
      ...(businessLayers.flash ? businessData.flash : []),
    ]
  }, [businessData, businessLayers, mapMode])
  const journeySteps = useMemo(
    () =>
      [...businessData.journey].sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0)),
    [businessData.journey],
  )
  const expectedJourneyStepIndex = useCallback(
    () =>
      expectedMapStepIndex(journeySteps, new Date(), {
        date: management.data?.days?.[activeDay - 1]?.date,
        timeZone: workspace.currentTrip?.timezone,
      }),
    [activeDay, journeySteps, management.data?.days, workspace.currentTrip?.timezone],
  )
  const activeJourneyStep =
    journeySteps[Math.min(activeJourneyStepIndex, Math.max(0, journeySteps.length - 1))] ?? null
  const businessRoutes = useMemo(() => {
    if (mapMode === 'explore' || (!businessLayers.journey && !businessLayers.transport)) return []
    if (mapMode !== 'live') return businessData.routes
    const routeIndex = Math.min(activeJourneyStepIndex, Math.max(0, businessData.routes.length - 1))
    return businessData.routes.slice(routeIndex, routeIndex + 1)
  }, [activeJourneyStepIndex, businessData.routes, businessLayers, mapMode])
  const stepAutoLocatedRef = useRef(Boolean(readSearchParam('step')))
  useEffect(() => {
    if (stepAutoLocatedRef.current || !journeySteps.length) return
    const index = expectedJourneyStepIndex()
    const step = journeySteps[index]
    stepAutoLocatedRef.current = true
    setActiveJourneyStepIndex(index)
    if (step) places.setSelectedId(step.placeId)
  }, [expectedJourneyStepIndex, journeySteps, places.setSelectedId])
  const selectedBusinessMarker =
    [...businessData.journey, ...businessData.flash, ...businessData.transport].find(
      (item) => item.id === selectedBusinessMarkerId,
    ) ?? null
  const selectedBusinessRoute =
    businessData.routes.find((item) => item.id === selectedBusinessRouteId) ?? null
  const openBusinessMarker = useCallback((marker: TravelMapBusinessMarker) => {
    setSelectedBusinessMarkerId(marker.id)
    setSelectedBusinessRouteId(null)
    setDetailSheet(null)
    setViewMode('map')
  }, [])
  const openBusinessRoute = useCallback((route: TravelMapBusinessRoute) => {
    setSelectedBusinessRouteId(route.id)
    setSelectedBusinessMarkerId(null)
    setDetailSheet(null)
    setViewMode('map')
  }, [])
  const focusJourneyStep = (index: number) => {
    const nextIndex = Math.min(Math.max(0, index), Math.max(0, journeySteps.length - 1))
    const step = journeySteps[nextIndex]
    if (!step) return
    setActiveJourneyStepIndex(nextIndex)
    writeSearchParams({ step: nextIndex + 1 })
    setSelectedBusinessMarkerId(null)
    setSelectedBusinessRouteId(null)
    setFocusMapSelection(false)
    setViewMode('map')
    places.setSelectedId(step.placeId)
  }
  const changeViewMode = (nextMode: ViewMode) => {
    setViewMode(nextMode)
    writeSearchParams({ view: nextMode === 'map' ? null : nextMode })
  }
  const changeMapMode = (nextMode: TravelMapMode) => {
    setMapMode(nextMode)
    setViewMode('map')
    setSelectedBusinessMarkerId(null)
    setSelectedBusinessRouteId(null)
    setSelectedContextPoiId(null)
    writeSearchParams({ mode: nextMode === 'plan' ? null : nextMode, view: null })
    if (nextMode === 'live' && journeySteps.length) {
      const expectedIndex = expectedJourneyStepIndex()
      const expectedStep = journeySteps[expectedIndex]
      setActiveJourneyStepIndex(expectedIndex)
      if (expectedStep) places.setSelectedId(expectedStep.placeId)
    }
  }
  const toggleBusinessLayer = (layerId: BusinessLayer) => {
    setBusinessLayers((layers) => {
      const next = { ...layers, [layerId]: !layers[layerId] }
      writeSearchParams({
        layers: (Object.keys(next) as BusinessLayer[]).filter((key) => next[key]).join(','),
      })
      return next
    })
  }
  const planRouteToPlace = useCallback(
    (placeId: string) => {
      if (!places.places.some((place) => place.id === placeId)) return
      places.setSelectedId(placeId)
      setFocusMapSelection(true)
      setNavigationTargetId(placeId)
      setNavigationRequestId((value) => value + 1)
      setSelectedBusinessMarkerId(null)
      setSelectedBusinessRouteId(null)
    },
    [places.places, places.setSelectedId],
  )
  useEffect(() => {
    if (businessDeepLinkHandled.current) return
    const focusId = new URLSearchParams(window.location.search).get('focus')
    if (!focusId) {
      businessDeepLinkHandled.current = true
      return
    }
    const marker = [...businessData.journey, ...businessData.flash, ...businessData.transport].find(
      (item) => item.targetId === focusId,
    )
    if (!marker) return
    businessDeepLinkHandled.current = true
    openBusinessMarker(marker)
  }, [businessData, openBusinessMarker])
  useEffect(
    () => () => {
      if (sheetCloseTimer.current) window.clearTimeout(sheetCloseTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (deepLinkHandled.current || places.isLoading) return
    deepLinkHandled.current = true
    const placeId = new URLSearchParams(window.location.search).get('place')
    if (!placeId || !places.places.some((place) => place.id === placeId)) return
    places.setSelectedId(placeId)
    setFocusMapSelection(true)
    setSelectedMapMarkerId(null)
    setSheetClosing(false)
    setDetailSheet('place')
  }, [places.isLoading, places.places, places.setSelectedId])
  const openDetailSheet = (sheet: 'place' | 'map-point' | 'context-poi') => {
    if (sheetCloseTimer.current) window.clearTimeout(sheetCloseTimer.current)
    setSheetClosing(false)
    setDetailSheet(sheet)
  }
  const closeDetailSheet = (clearMapMarkerSelection = false) => {
    if (!detailSheet) return
    if (sheetCloseTimer.current) window.clearTimeout(sheetCloseTimer.current)
    setSheetClosing(true)
    sheetCloseTimer.current = window.setTimeout(() => {
      setDetailSheet(null)
      setSheetClosing(false)
      setContextDetailPlace(null)
      writeSearchParams({ place: null })
      if (clearMapMarkerSelection) {
        setSelectedMapMarkerId(null)
        setNewMapMarkerEditId(null)
      }
    }, 180)
  }
  const selectPlace = (id: string) => {
    places.setSelectedId(id)
    writeSearchParams({ place: id })
    setFocusMapSelection(true)
    setSelectedMapMarkerId(null)
    setSelectedContextPoiId(null)
    openDetailSheet('place')
  }
  const createMapMarker = (marker: MapPointMarker) => {
    const nextMarker: MapPointMarker = {
      ...marker,
      address: marker.address ?? formatCoordinates(marker.latitude, marker.longitude),
      category: marker.category ?? 'Sights',
      description: marker.description ?? t('places.customDescription'),
      hero: isMeaningfulTravelImage(marker.hero) ? marker.hero : undefined,
      hours: marker.hours ?? t('places.customHours'),
      image: isMeaningfulTravelImage(marker.image) ? marker.image : undefined,
      rating: marker.rating ?? t('map.private'),
    }
    setMapMarkers((markers) => [...markers, nextMarker].slice(-12))
    setSelectedMapMarkerId(nextMarker.id)
    writeSearchParams({ place: nextMarker.id })
    setNewMapMarkerEditId(nextMarker.id)
    openDetailSheet('map-point')
  }
  const openContextPlace = (place: Place) => {
    setContextDetailPlace(place)
    setSelectedContextPoiId(place.id)
    setSelectedMapMarkerId(null)
    setDetailSheet('context-poi')
  }
  const saveContextPlace = (place: Place) => {
    createMapMarker({
      address: place.address,
      category: place.category,
      description: place.description,
      hero: place.hero,
      hours: place.hours,
      id: `marker-${Date.now()}-${Math.round(place.latitude * 10000)}`,
      image: place.image,
      latitude: place.latitude,
      longitude: place.longitude,
      note: '',
      rating: place.rating,
      shareScope: 'space',
      title: place.title,
      visibility: 'private',
    })
    setContextDetailPlace(null)
    showNotice(t('placePicker.savedToTrip'))
  }
  const selectMapMarker = (id: string | null) => {
    setSelectedMapMarkerId(id)
    if (id) setSelectedContextPoiId(null)
    writeSearchParams({ place: id })
    setNewMapMarkerEditId(null)
    if (id) {
      openDetailSheet('map-point')
      return
    }
    setDetailSheet((current) => (current === 'map-point' ? null : current))
  }
  const deleteSelectedMapMarker = () => {
    if (!selectedMapMarkerId) return
    setMapMarkers((markers) => markers.filter((marker) => marker.id !== selectedMapMarkerId))
    setSelectedMapMarkerId(null)
    setNewMapMarkerEditId(null)
    setDetailSheet(null)
    writeSearchParams({ place: null })
  }
  const selectListPlace = (id: string) => {
    if (mapContextPois.some((poi) => poi.id === id)) {
      setSelectedContextPoiId(id)
      setSelectedMapMarkerId(null)
      setDetailSheet(null)
      return
    }
    if (mapMarkers.some((marker) => marker.id === id)) {
      selectMapMarker(id)
      return
    }
    selectPlace(id)
  }
  const updateMapMarkerPlace = (placeId: string, patch: PlaceEditPatch) => {
    setMapMarkers((markers) =>
      markers.map((marker) => (marker.id === placeId ? { ...marker, ...patch } : marker)),
    )
  }
  const updateSavedPlace = (placeId: string, patch: PlaceEditPatch) => {
    places.updatePlace(placeId, patch)
  }
  const updatePlaceNotes = (placeId: string, notes: string) => {
    if (mapMarkers.some((marker) => marker.id === placeId)) {
      setMapMarkers((markers) =>
        markers.map((marker) => (marker.id === placeId ? { ...marker, note: notes } : marker)),
      )
      return
    }
    places.updatePlaceNotes(placeId, notes)
  }
  const schedulePlaceToDay = (placeId: string, dayIndex: number) => {
    const day = tripDays[dayIndex] ?? tripDays[0]
    if (mapMarkers.some((marker) => marker.id === placeId)) {
      setMapMarkers((markers) =>
        markers.map((marker) =>
          marker.id === placeId ? { ...marker, scheduledDay: day.day } : marker,
        ),
      )
    } else {
      places.schedulePlaceToDay(placeId, day.day)
    }
    showNotice(t('places.scheduledTo', { day: day.day }))
  }
  const updateMapMarkerVisibility = (
    placeId: string,
    patch: { visibility?: 'private' | 'shared'; shareScope?: 'space' | 'public' },
  ) => {
    setMapMarkers((markers) =>
      markers.map((marker) => (marker.id === placeId ? { ...marker, ...patch } : marker)),
    )
  }
  const searchToolbar = (
    <div className="relative mx-auto flex w-[min(640px,calc(100vw-6rem))] min-w-0 items-center gap-1.5 rounded-2xl bg-white/96 p-1.5 shadow-[0_18px_48px_rgba(37,35,30,0.16)] backdrop-blur">
      <TextInput
        aria-label={t('places.searchPlaceholder')}
        className="h-10 border-transparent bg-white text-[13px] focus:border-transparent focus:ring-0"
        containerClassName="min-w-0 flex-1"
        onChange={(event) => places.setQuery(event.target.value)}
        placeholder={t('places.searchPlaceholder')}
        value={places.query}
      />
      <IconButton
        active={searchViewportOnly}
        className="size-10 shrink-0"
        label={t('map.searchCurrentArea')}
        onClick={() => {
          setSearchViewportOnly((current) => !current)
          setViewMode('list')
        }}
      >
        <Crosshairs size={14} />
      </IconButton>
      <IconButton
        active={filterOpen || places.filter !== 'All'}
        className="size-10 shrink-0"
        label={t('actions.filters')}
        onClick={() => setFilterOpen((open) => !open)}
      >
        <Filter size={14} />
      </IconButton>
      {filterOpen ? (
        <div className="absolute right-1.5 bottom-14 z-[9000] grid min-w-[188px] gap-1 rounded-xl border border-line bg-white p-1 shadow-[0_18px_44px_rgba(37,35,30,0.18)]">
          {filterLabels.map((filter) => (
            <button
              aria-pressed={places.filter === filter}
              className={cn(
                'flex h-9 items-center gap-2 rounded-lg px-2.5 text-left font-semibold text-[12px] transition hover:bg-sage',
                places.filter === filter ? 'bg-sage text-olive' : 'text-ink',
              )}
              key={filter}
              onClick={() => {
                places.setFilter(filter)
                setFilterOpen(false)
              }}
              type="button"
            >
              <span className="grid size-5 shrink-0 place-items-center">{filterIcons[filter]}</span>
              <span className="min-w-0 flex-1 truncate">{t(`filters.${filter}`)}</span>
              {places.filter === filter ? (
                <CheckCircle className="shrink-0 text-olive" size={14} />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
  const layerOptions: Array<{
    count: number
    icon: typeof CalendarCheck
    id: BusinessLayer
    label: string
  }> = [
    {
      count: businessData.journey.length,
      icon: CalendarCheck,
      id: 'journey',
      label: t('map.business.layers.journey'),
    },
    {
      count: businessData.flashCount,
      icon: Bolt,
      id: 'flash',
      label: t('map.business.layers.flash'),
    },
    {
      count: businessData.transport.length,
      icon: Tram,
      id: 'transport',
      label: t('map.business.layers.transport'),
    },
  ]
  const businessToolbar = (
    <div className="flex max-w-full gap-1 overflow-x-auto">
      {layerOptions.map((layer) => {
        const Icon = layer.icon
        const active = businessLayers[layer.id]
        return (
          <button
            aria-pressed={active}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 font-extrabold text-[11px] ring-1 ring-transparent transition',
              active && layer.id === 'journey' && 'bg-sage text-olive ring-olive/15',
              active && layer.id === 'flash' && 'bg-[#fff0ec] text-coral ring-coral/15',
              active && layer.id === 'transport' && 'bg-[#edf5fa] text-[#2f6688] ring-[#2f6688]/15',
              !active && 'text-muted hover:bg-paper',
            )}
            key={layer.id}
            onClick={() => toggleBusinessLayer(layer.id)}
            type="button"
          >
            <Icon size={14} />
            {layer.label}
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full',
                active ? 'bg-white/80 text-current' : 'bg-paper',
              )}
            >
              {layer.count}
            </span>
          </button>
        )
      })}
    </div>
  )
  const businessPanel =
    selectedBusinessMarker || selectedBusinessRoute ? (
      <MapBusinessDetail
        collaboration={
          workspace.currentTrip?.id ? (
            <Suspense fallback={null}>
              <ContextCollaboration
                subjectId={(selectedBusinessMarker ?? selectedBusinessRoute)?.targetId}
                subjectType={selectedBusinessMarker?.kind === 'journey' ? 'place' : 'assignment'}
                title={(selectedBusinessMarker ?? selectedBusinessRoute)?.title ?? ''}
                tripId={workspace.currentTrip.id}
              />
            </Suspense>
          ) : undefined
        }
        marker={selectedBusinessMarker}
        members={management.data?.members ?? []}
        onClose={() => {
          setSelectedBusinessMarkerId(null)
          setSelectedBusinessRouteId(null)
        }}
        onEndEvent={(id) => {
          reports.endReport(id)
          setSelectedBusinessMarkerId(null)
          showNotice(t('map.report.ended'))
        }}
        onOpenAffectedPlan={
          selectedBusinessMarker?.kind === 'flash'
            ? () => {
                const affectedIndex = journeySteps.findIndex((step) =>
                  selectedBusinessMarker.journeyItemIds?.includes(step.targetId),
                )
                if (affectedIndex >= 0) focusJourneyStep(affectedIndex)
              }
            : undefined
        }
        onPlanRoute={planRouteToPlace}
        onVoteEvent={(id) => {
          reports.voteToRemove(id)
          showNotice(t('map.report.voteSaved'))
        }}
        route={selectedBusinessRoute}
      />
    ) : null
  const addJourneyFromMap = async (input: QuickAddInput) => {
    const data = management.data
    if (!data) throw new Error('Trip data is not ready')
    const selectedPlace = input.place ?? data.places.find((place) => place.id === input.placeId)
    await management.addJourney({
      cost: input.amount ?? 0,
      currency: workspace.currentTrip?.currency ?? 'EUR',
      dayId: data.days?.[activeDay - 1]?.id,
      dayNumber: activeDay,
      id: '',
      kind: input.kind ?? 'activity',
      notes: input.notes || t('workspace.journey.customNote'),
      participantIds: input.participantIds,
      place: selectedPlace?.title ?? t('workspace.journey.placePending'),
      placeId: selectedPlace?.id,
      placeServerId: selectedPlace?.serverId,
      source: 'plan',
      status: 'planned',
      time: input.time ?? '09:00',
      title: input.title,
    })
    setActiveJourneyStepIndex(journeySteps.length)
    showNotice(t('workspace.notices.arrangementAdded', { count: activeDay }))
  }
  const journeyTimeline =
    mapMode === 'explore' ? null : (
      <MapJourneyTimeline
        activeIndex={activeJourneyStepIndex}
        day={activeDay}
        events={businessData.flash}
        mode={mapMode}
        onAdd={() => setJourneyAddOpen(true)}
        onExplore={() => changeMapMode('explore')}
        onLocateNow={() => focusJourneyStep(expectedJourneyStepIndex())}
        onSelect={focusJourneyStep}
        routes={businessData.routes}
        steps={journeySteps}
        tripId={workspace.currentTrip?.id}
      />
    )
  const mapListPanel = places.isLoading ? (
    <div className="rounded-xl bg-paper p-4 text-[13px] text-muted">{t('places.loading')}</div>
  ) : (
    <div className="min-w-0">
      <div className="mb-3 grid grid-cols-2 rounded-xl bg-paper p-1">
        {(['visible', 'scheduled'] as const).map((tab) => (
          <button
            className={cn(
              'h-9 rounded-lg font-bold text-[12px] transition',
              mapListTab === tab ? 'bg-white text-olive shadow-sm' : 'text-muted hover:text-ink',
            )}
            key={tab}
            onClick={() => setMapListTab(tab)}
            type="button"
          >
            {tab === 'visible' ? t('places.visibleTab') : t('places.scheduledTab')}
          </button>
        ))}
      </div>
      <PlaceList
        emptyAction={
          mapListTab === 'visible' ? (
            <Button
              icon={<MapPoint size={14} />}
              onClick={() => changeViewMode('map')}
              size="sm"
              variant="action"
            >
              {t('places.emptyState.openMap')}
            </Button>
          ) : (
            <Button
              icon={<CalendarAdd size={14} />}
              onClick={() => setJourneyAddOpen(true)}
              size="sm"
              variant="action"
            >
              {t('workspace.journey.add')}
            </Button>
          )
        }
        emptyDescription={
          mapListTab === 'visible'
            ? t('places.emptyState.visibleHint')
            : t('places.emptyState.scheduledHint')
        }
        emptyIcon={mapListTab === 'visible' ? <MapPoint size={17} /> : <CalendarAdd size={17} />}
        emptyLabel={
          mapListTab === 'visible' ? t('places.emptyList') : t('places.emptyScheduledList')
        }
        emptyTitle={
          mapListTab === 'visible'
            ? t('places.emptyState.visibleTitle')
            : t('places.emptyState.scheduledTitle')
        }
        onSelect={selectListPlace}
        places={mapListTab === 'visible' ? visibleListPlaces : scheduledListPlaces}
        selectedId={selectedContextPoiId ?? selectedMapMarkerId ?? places.selectedId}
        title={mapListTab === 'visible' ? t('places.visiblePlaces') : t('places.scheduledPlaces')}
      />
    </div>
  )

  return (
    <>
      <TravelShellTopAction>
        <span className="hidden xl:inline-flex">
          <SyncStatus status={mapSyncStatus} />
        </span>
      </TravelShellTopAction>
      <div className="min-h-0 flex-1 overflow-hidden xl:p-4 xl:pt-3">
        <MapPanel
          bottomToolbar={mapMode === 'live' ? undefined : searchToolbar}
          businessLayerCount={Object.values(businessLayers).filter(Boolean).length}
          businessMarkers={businessMarkers}
          businessPanel={businessPanel}
          businessRoutes={businessRoutes}
          routeHazards={businessData.flash}
          businessToolbar={businessToolbar}
          journeyTimeline={journeyTimeline}
          className="h-full w-full rounded-none border-0 shadow-none xl:rounded-[22px] xl:shadow-[0_16px_44px_rgba(34,55,48,0.08)]"
          focusSelectedPlace={focusMapSelection}
          contextPoiFocusId={selectedContextPoiId}
          experienceMode={mapMode}
          listPanel={listOpen ? mapListPanel : undefined}
          mapMarkers={mapMarkers}
          onMapMarkerCreate={createMapMarker}
          onMapMarkerSelect={selectMapMarker}
          onBusinessMarkerSelect={openBusinessMarker}
          onBusinessRouteSelect={openBusinessRoute}
          onContextPoisChange={setMapContextPois}
          onViewportChange={setMapViewport}
          onContextPoiOpen={openContextPlace}
          onContextPoiSelect={setSelectedContextPoiId}
          onExperienceModeChange={changeMapMode}
          onPlaceSelect={selectPlace}
          onReportLocationSelect={setReportLocation}
          onReportPinModeChange={setReportPinMode}
          onViewModeChange={changeViewMode}
          focusedBusinessMarker={
            selectedBusinessMarker ?? (mapMode === 'explore' ? null : activeJourneyStep)
          }
          navigationTargetId={navigationTargetId}
          navigationRequestId={navigationRequestId}
          places={places.filteredPlaces}
          selectedId={places.selectedId}
          selectedMapMarkerId={selectedMapMarkerId}
          reportPinMode={reportPinMode}
          viewMode={viewMode}
        />
      </div>
      {detailSheet === 'place' && places.selectedPlace ? (
        <Sheet
          backdropClassName={cn(sheetClosing && 'is-closing')}
          className={cn('p-0 sm:w-[390px]', sheetClosing && 'is-closing')}
          onClose={() => closeDetailSheet()}
        >
          <Suspense
            fallback={<div className="p-5 text-[12px] text-muted">{t('common.loading')}</div>}
          >
            <PlaceInspector
              className="h-full rounded-none border-0"
              expanded={places.expanded}
              key={places.selectedPlace.id}
              onAction={showNotice}
              onClose={() => closeDetailSheet()}
              onExpandedChange={places.setExpanded}
              onDelete={
                places.isProviderResult(places.selectedPlace.id)
                  ? undefined
                  : (placeId) => {
                      const title = places.selectedPlace?.title ?? ''
                      void places.deletePlace(placeId).then(() => {
                        closeDetailSheet()
                        showNotice(t('places.removedFromTrip', { title }))
                      })
                    }
              }
              onNotesChange={updatePlaceNotes}
              onPlaceChange={updateSavedPlace}
              onScheduleToDay={schedulePlaceToDay}
              onSaveProvider={(placeId) => {
                void places
                  .saveProviderPlace(placeId)
                  .then(() => showNotice(t('placePicker.savedToTrip')))
              }}
              place={places.selectedPlace}
              providerResult={places.isProviderResult(places.selectedPlace.id)}
              savingProvider={places.savingProviderPlace}
              tripId={workspace.currentTrip?.id}
            />
          </Suspense>
        </Sheet>
      ) : null}
      {detailSheet === 'context-poi' && contextDetailPlace ? (
        <Sheet
          backdropClassName={cn(sheetClosing && 'is-closing')}
          className={cn('p-0 sm:w-[390px]', sheetClosing && 'is-closing')}
          onClose={() => closeDetailSheet()}
        >
          <Suspense
            fallback={<div className="p-5 text-[12px] text-muted">{t('common.loading')}</div>}
          >
            <PlaceInspector
              className="h-full rounded-none border-0"
              expanded={places.expanded}
              key={contextDetailPlace.id}
              onAction={showNotice}
              onClose={() => closeDetailSheet()}
              onExpandedChange={places.setExpanded}
              onNotesChange={() => undefined}
              onSaveProvider={() => saveContextPlace(contextDetailPlace)}
              onScheduleToDay={() => undefined}
              place={contextDetailPlace}
              providerResult
              savingProvider={false}
              tripId={workspace.currentTrip?.id}
            />
          </Suspense>
        </Sheet>
      ) : null}
      {detailSheet === 'map-point' && selectedMapMarker && selectedMapMarkerPlace ? (
        <Sheet
          backdropClassName={cn(sheetClosing && 'is-closing')}
          className={cn('p-0 sm:w-[390px]', sheetClosing && 'is-closing')}
          onClose={() => closeDetailSheet(true)}
        >
          <Suspense
            fallback={<div className="p-5 text-[12px] text-muted">{t('common.loading')}</div>}
          >
            <PlaceInspector
              className="h-full rounded-none border-0"
              expanded={places.expanded}
              key={selectedMapMarker.id}
              onAction={showNotice}
              onClose={() => closeDetailSheet(true)}
              onDelete={deleteSelectedMapMarker}
              onExpandedChange={places.setExpanded}
              initialEditing={selectedMapMarker.id === newMapMarkerEditId}
              onNotesChange={updatePlaceNotes}
              onPlaceChange={updateMapMarkerPlace}
              onScheduleToDay={schedulePlaceToDay}
              onVisibilityChange={updateMapMarkerVisibility}
              place={selectedMapMarkerPlace}
              tripId={workspace.currentTrip?.id}
              shareScope={selectedMapMarker.shareScope}
              variant="custom"
              visibility={selectedMapMarker.visibility}
            />
          </Suspense>
        </Sheet>
      ) : null}
      {journeyAddOpen && management.data && management.tripId ? (
        <QuickAddSheet
          activeDay={activeDay}
          members={management.data.members}
          onClose={() => setJourneyAddOpen(false)}
          onSubmit={addJourneyFromMap}
          places={management.data.places}
          section="journey"
          tripId={management.tripId}
        />
      ) : null}
      <ActionToast message={message} />
      {reportLocation ? (
        <MapReportSheet
          location={reportLocation}
          onClose={() => setReportLocation(null)}
          onSubmit={(input) => {
            const affectedJourney = [...reportJourneyOptions].sort(
              (left, right) =>
                (left.latitude - reportLocation.latitude) ** 2 +
                (left.longitude - reportLocation.longitude) ** 2 -
                ((right.latitude - reportLocation.latitude) ** 2 +
                  (right.longitude - reportLocation.longitude) ** 2),
            )[0]
            reports.addReport({
              affectedTripIds: workspace.currentTrip?.id ? [workspace.currentTrip.id] : [],
              category: input.category,
              expiresAt: new Date(Date.now() + input.validForHours * 60 * 60 * 1000).toISOString(),
              journeyItemIds: affectedJourney ? [affectedJourney.id] : [],
              latitude: reportLocation.latitude,
              longitude: reportLocation.longitude,
              participantIds: affectedJourney?.participantIds ?? [],
              severity: input.severity,
              title: input.title,
            })
            setReportLocation(null)
            showNotice(t('map.report.saved'))
          }}
        />
      ) : null}
    </>
  )
}
