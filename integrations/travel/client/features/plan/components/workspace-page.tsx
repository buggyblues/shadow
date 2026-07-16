import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  type ChangeEvent,
  type FormEvent,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ActionToast } from '../../../components/action-toast.js'
import { AvatarGroup, UserAvatar } from '../../../components/avatar-group.js'
import { Button, FloatingActionButton } from '../../../components/button.js'
import { EmptyState } from '../../../components/empty-state.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  Bed,
  Bolt,
  Briefcase,
  CalendarAdd,
  CalendarCheck,
  CalendarDate,
  CheckCircle,
  ChecklistAlt,
  ChevronDown,
  Clock,
  Coffee2,
  DocumentUpload2,
  Edit2,
  Filter,
  ForkKnife,
  Gallery,
  type IconComponent,
  Map,
  MapPoint,
  Paperclip,
  Plus,
  Receipt,
  Route,
  Search,
  Ticket,
  Tram,
  Users,
  Wallet,
  X,
} from '../../../components/icons.js'
import { Money } from '../../../components/money.js'
import { ProgressBar } from '../../../components/progress.js'
import { Sheet } from '../../../components/sheet.js'
import { StatusBadge } from '../../../components/status-badge.js'
import { SyncStatus } from '../../../components/sync-status.js'
import { Tabs } from '../../../components/tabs.js'
import { TextInput } from '../../../components/text-input.js'
import { tripDays } from '../../../config/copy.js'
import { useActionNotice } from '../../../hooks/use-action-notice.js'
import { combineTravelSyncStatus } from '../../../hooks/use-persistent-trip-state.js'
import { TravelShellTopAction } from '../../../layouts/travel-shell.js'
import { apiGet, apiPost } from '../../../services/api-client.js'
import { setTravelDay, useTravelDay } from '../../../store/travel-day.js'
import { cn } from '../../../utils/class-names.js'
import { formatTripDate } from '../../../utils/travel-date.js'
import { readSearchParam, writeSearchParams } from '../../../utils/url-state.js'
import type {
  BudgetCategoryRecord,
  ExpenseCategory,
  ExpenseRecord,
  JourneyRecord,
  PackingBagRecord,
  PackingItemRecord,
  ReservationKind,
  ReservationRecord,
  SettlementTransfer,
  TransportMode,
  TransportSegment,
  TravelMember,
  TripManagementData,
} from '../api/trip-management.js'
import type { TravelTripSummary } from '../api/trips.js'
import {
  type TravelDocument,
  type TravelDocumentKind,
  useTravelDocuments,
} from '../hooks/use-travel-documents.js'
import type { UserTravelReport } from '../hooks/use-travel-reports.js'
import { effectiveTravelReportStatus, useTravelReports } from '../hooks/use-travel-reports.js'
import { useTravelWorkspace } from '../hooks/use-travel-workspace.js'
import { useTripManagement } from '../hooks/use-trip-management.js'
import { ContextCollaboration } from './context-collaboration.js'
import { MemberAssignment } from './member-assignment.js'
import { PlacePickerInput } from './place-picker-input.js'
import {
  type JourneyItemKind,
  JourneyKindPicker,
  journeyIcons,
  journeyIconTone,
  type QuickAddInput,
  QuickAddSheet,
  type WorkspaceSection,
} from './quick-add-sheet.js'

type FinanceTab = 'ledger' | 'budget' | 'settlement'
type TeamTab = 'travelers' | 'groups' | 'preparation' | 'activity'
type JourneyMode = 'timeline' | 'bookings' | 'transport'
type ManagedTripData = TripManagementData & {
  settlement: { balances: Map<string, number>; transfers: SettlementTransfer[] }
}

const CommunityGroupsPanel = lazy(() =>
  import('./community-groups-panel.js').then((module) => ({
    default: module.CommunityGroupsPanel,
  })),
)

interface TimelineItem {
  id: string
  dayId?: string
  dayNumber?: number
  cost: number
  currency: string
  kind: JourneyItemKind
  notes: string
  participantIds: string[]
  place: string
  placeId?: string
  placeServerId?: string
  expenseId?: string
  source: 'booking' | 'transport' | 'plan'
  status: 'confirmed' | 'pending' | 'planned'
  time: string
  title: string
}

interface JourneyImpact {
  id: string
  participantIds: string[]
  severity: 'urgent' | 'high' | 'medium'
  summary: string
  title: string
}

const expenseIcons: Record<ExpenseCategory, IconComponent> = {
  activity: Gallery,
  food: ForkKnife,
  shopping: Receipt,
  stay: Bed,
  transport: Tram,
}

function initialJourneyMode(pathname: string): JourneyMode {
  const requested = readSearchParam('mode')
  if (requested === 'timeline' || requested === 'bookings' || requested === 'transport') {
    return requested
  }
  if (pathname.endsWith('/bookings')) return 'bookings'
  if (pathname.endsWith('/transport')) return 'transport'
  return 'timeline'
}

function initialFinanceTab(pathname: string): FinanceTab {
  const requested = readSearchParam('tab')
  if (requested === 'ledger' || requested === 'budget' || requested === 'settlement') {
    return requested
  }
  if (pathname.endsWith('/budget')) return 'budget'
  return 'ledger'
}

function initialTeamTab(pathname: string): TeamTab {
  const requested = readSearchParam('tab')
  if (
    requested === 'travelers' ||
    requested === 'groups' ||
    requested === 'preparation' ||
    requested === 'activity'
  ) {
    return requested
  }
  if (pathname.endsWith('/packing')) return 'preparation'
  return 'travelers'
}

function timeFromLabel(value: string, fallback = '09:00') {
  return value.match(/\b\d{1,2}:\d{2}\b/)?.[0] ?? fallback
}

function placeName(data: ManagedTripData, placeId: string, t: TFunction) {
  return (
    data.places.find((place) => place.id === placeId)?.title ?? t('management.context.unknownPlace')
  )
}

function memberById(members: TravelMember[], memberId: string) {
  return members.find((member) => member.id === memberId)
}

function expenseTitle(expense: ExpenseRecord, t: TFunction) {
  return t(`workspace.finance.items.${expense.id.replaceAll('-', '_')}`, {
    defaultValue: expense.title,
  })
}

function localizedDayLabel(value: string, t: TFunction) {
  const day = Number(value.match(/Day\s+(\d+)/i)?.[1])
  return Number.isInteger(day) && day > 0 ? t('workspace.journey.day', { count: day }) : value
}

function packingTitle(itemId: string, fallback: string, t: TFunction) {
  return t(`management.packing.item.${itemId.replaceAll('-', '_')}.title`, {
    defaultValue: fallback,
  })
}

function packingCategory(category: string, t: TFunction) {
  return t(`management.packing.category.${category}`, { defaultValue: category })
}

function avatarPeople(members: TravelMember[], ids: string[]) {
  return ids
    .map((id) => memberById(members, id))
    .filter((member): member is TravelMember => Boolean(member))
    .map((member) => ({
      avatarUrl: member.avatarUrl,
      color: member.avatarColor,
      id: member.id,
      name: member.displayName,
    }))
}

function reservationStatus(status: ReservationRecord['status']): TimelineItem['status'] {
  if (status === 'pending') return 'pending'
  return 'confirmed'
}

function transportStatus(status: TransportSegment['status']): TimelineItem['status'] {
  if (status === 'booked') return 'confirmed'
  return 'planned'
}

function buildTimelineItems(
  data: ManagedTripData,
  activeDay: number,
  customItems: TimelineItem[],
  t: TFunction,
) {
  const dayMarker = `Day ${activeDay}`
  const reservations: TimelineItem[] = data.reservations
    .filter((item) => item.startLabel.includes(dayMarker))
    .map((item) => ({
      cost: item.cost,
      currency: item.currency,
      id: item.id,
      kind: item.kind,
      notes: item.notes,
      participantIds: item.participantIds,
      place: placeName(data, item.placeId, t),
      placeId: item.placeId,
      expenseId: data.expenses.find((expense) => expense.reservationId === item.id)?.id,
      source: 'booking',
      status: reservationStatus(item.status),
      time: timeFromLabel(item.startLabel),
      title: item.title,
    }))
  const transports: TimelineItem[] = data.transports
    .filter((item) => item.departureLabel.includes(dayMarker))
    .map((item) => ({
      cost: item.cost,
      currency: item.currency,
      id: item.id,
      kind: item.mode,
      notes: item.serviceLabel ?? item.provider,
      participantIds: item.participantIds,
      place: `${placeName(data, item.fromPlaceId, t)} → ${placeName(data, item.toPlaceId, t)}`,
      placeId: item.toPlaceId,
      source: 'transport',
      status: transportStatus(item.status),
      time: timeFromLabel(item.departureLabel),
      title: item.title,
    }))
  const dayId = data.days?.[activeDay - 1]?.id
  const dayItems = customItems.filter((item) =>
    item.dayId
      ? item.dayId === dayId
      : item.dayNumber
        ? item.dayNumber === activeDay
        : activeDay === 2,
  )

  return [...reservations, ...transports, ...dayItems].sort((a, b) => a.time.localeCompare(b.time))
}

function squaredDistance(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  return (from.latitude - to.latitude) ** 2 + (from.longitude - to.longitude) ** 2
}

function buildJourneyImpacts(
  data: ManagedTripData,
  items: TimelineItem[],
  reports: UserTravelReport[],
  t: TFunction,
) {
  const impactByItem: Record<string, JourneyImpact[]> = {}
  const addImpact = (itemId: string, impact: JourneyImpact) => {
    impactByItem[itemId] = [...(impactByItem[itemId] ?? []), impact]
  }

  reports
    .filter((report) => effectiveTravelReportStatus(report) === 'active')
    .forEach((report) => {
      let linkedItemIds = report.journeyItemIds.filter((itemId) =>
        items.some((item) => item.id === itemId),
      )
      if (!linkedItemIds.length) {
        const nearestItem = items
          .map((item) => ({
            item,
            place: data.places.find((place) => place.id === item.placeId),
          }))
          .filter(
            (
              candidate,
            ): candidate is { item: TimelineItem; place: NonNullable<typeof candidate.place> } =>
              Boolean(candidate.place),
          )
          .sort(
            (left, right) =>
              squaredDistance(report, left.place) - squaredDistance(report, right.place),
          )[0]
        if (nearestItem) linkedItemIds = [nearestItem.item.id]
      }
      linkedItemIds.forEach((itemId) =>
        addImpact(itemId, {
          id: report.id,
          participantIds:
            report.participantIds.length > 0
              ? report.participantIds
              : (items.find((item) => item.id === itemId)?.participantIds ?? []),
          severity: report.severity,
          summary: t('workspace.journey.alerts.userReport'),
          title: report.title,
        }),
      )
    })

  return impactByItem
}

function WorkspaceLoading({
  children,
  loading = false,
}: {
  children: ReactNode
  loading?: boolean
}) {
  return (
    <div
      aria-busy={loading}
      className="travel-surface grid min-h-52 place-items-center p-6 text-center text-[13px] text-muted"
    >
      <div className="w-full max-w-sm">
        {loading ? (
          <div className="mb-5 grid animate-pulse gap-2" aria-hidden="true">
            <span className="mx-auto h-10 w-10 rounded-[var(--radius-control)] bg-sage" />
            <span className="mx-auto h-3 w-36 rounded-full bg-paper" />
            <span className="mx-auto h-3 w-52 rounded-full bg-paper" />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

function DayStrip({
  activeDay,
  dates,
  onChange,
}: {
  activeDay: number
  dates?: Array<{ date: string }>
  onChange: (day: number) => void
}) {
  const { i18n, t } = useTranslation()
  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto rounded-[16px] bg-paper/70 p-1">
      {(dates?.length ? dates : tripDays).map((day, index) => {
        const value = index + 1
        const active = value === activeDay
        return (
          <button
            aria-pressed={active}
            className={cn(
              'min-w-[104px] flex-1 rounded-[12px] px-3 py-2 text-left transition',
              active ? 'bg-white text-ink shadow-[0_6px_18px_rgba(34,55,48,0.07)]' : 'text-muted',
            )}
            key={day.date}
            onClick={() => onChange(value)}
            type="button"
          >
            <span className="block font-extrabold text-[12px]">
              {t('workspace.journey.day', { count: value })}
            </span>
            <span className="block text-[10px] leading-4">
              {formatTripDate(day.date, i18n.language)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function DayOverviewMetrics({
  impactCount,
  items,
}: {
  impactCount: number
  items: TimelineItem[]
}) {
  const { t } = useTranslation()
  const spend = items.reduce((total, item) => total + item.cost, 0)
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      <div className="rounded-[var(--radius-control)] bg-paper/65 px-2.5 py-2">
        <CalendarCheck className="mb-1 text-olive" size={14} />
        <strong className="block text-[12px]">{items.length}</strong>
        <span className="text-[10px] text-muted">{t('workspace.journey.dayStats.plans')}</span>
      </div>
      <div className="rounded-[var(--radius-control)] bg-paper/65 px-2.5 py-2">
        <Bolt className={impactCount ? 'mb-1 text-coral' : 'mb-1 text-muted'} size={14} />
        <strong className="block text-[12px]">{impactCount}</strong>
        <span className="text-[10px] text-muted">{t('workspace.journey.dayStats.alerts')}</span>
      </div>
      <div className="rounded-[var(--radius-control)] bg-paper/65 px-2.5 py-2">
        <Wallet className="mb-1 text-olive" size={14} />
        <strong className="block truncate text-[12px]">
          <Money amount={spend} currency="EUR" />
        </strong>
        <span className="text-[10px] text-muted">{t('workspace.journey.dayStats.spend')}</span>
      </div>
    </div>
  )
}

function TimelineRow({
  impactCounts,
  impacts,
  item,
  members,
  onImpactSelect,
  onSelect,
}: {
  impactCounts: Record<string, number>
  impacts: JourneyImpact[]
  item: TimelineItem
  members: TravelMember[]
  onImpactSelect: (impact: JourneyImpact) => void
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const Icon = journeyIcons[item.kind]
  const tone =
    item.status === 'pending' ? 'warning' : item.status === 'planned' ? 'neutral' : 'success'
  return (
    <article className="travel-virtual-row border-line/70 border-b py-1 last:border-0">
      <button
        className="group grid w-full grid-cols-[46px_40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] px-1 py-3 text-left transition hover:bg-paper/45 sm:grid-cols-[58px_44px_minmax(0,1fr)_auto] sm:px-3 sm:py-3.5"
        onClick={onSelect}
        type="button"
      >
        <span className="self-start pt-2 font-extrabold text-[13px] tabular-nums text-ink sm:text-[14px]">
          {item.time}
        </span>
        <span
          className={cn(
            'grid size-10 place-items-center rounded-[14px]',
            journeyIconTone[item.kind],
          )}
        >
          <Icon size={19} strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <strong className="truncate text-[14px] sm:text-[15px]">{item.title}</strong>
            <StatusBadge tone={tone}>{t(`workspace.journey.status.${item.status}`)}</StatusBadge>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted sm:text-[12px]">
            {item.place}
          </span>
          <span className="mt-1.5 flex items-center justify-between gap-3 sm:hidden">
            <AvatarGroup items={avatarPeople(members, item.participantIds)} max={3} />
            <span className="shrink-0 font-extrabold text-[12px] text-ink">
              {item.cost ? <Money amount={item.cost} currency={item.currency} /> : '—'}
            </span>
          </span>
        </span>
        <span className="hidden items-center gap-4 sm:flex">
          <AvatarGroup items={avatarPeople(members, item.participantIds)} max={4} />
          <span className="min-w-[66px] text-right font-extrabold text-[13px]">
            {item.cost ? <Money amount={item.cost} currency={item.currency} /> : '—'}
          </span>
        </span>
      </button>
      {impacts.length ? (
        <div className="grid gap-1.5 pr-1 pb-2 pl-[52px] sm:pr-3 sm:pl-[118px]">
          {impacts.map((impact) => (
            <ImpactNotice
              affectedCount={impactCounts[impact.id] ?? 0}
              impact={impact}
              key={impact.id}
              members={members}
              onOpen={() => onImpactSelect(impact)}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}

function ImpactNotice({
  affectedCount,
  impact,
  members,
  onOpen,
}: {
  affectedCount: number
  impact: JourneyImpact
  members: TravelMember[]
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const urgent = impact.severity === 'urgent'
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[minmax(0,1fr)_36px] rounded-[var(--radius-control)] border-l-[3px] transition',
        urgent ? 'border-coral bg-[#fff1ed]' : 'border-[#d09a45] bg-[#fbf6eb]',
      )}
    >
      <button
        aria-expanded={expanded}
        className="flex min-w-0 items-start gap-2.5 px-2.5 py-2 text-left"
        onClick={() => setExpanded((open) => !open)}
        type="button"
      >
        <Bolt className={urgent ? 'mt-0.5 text-coral' : 'mt-0.5 text-warning'} size={14} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <strong className="truncate text-[12px]">{impact.title}</strong>
            <span className="shrink-0 font-bold text-[10px] text-muted">
              {t(`workspace.flash.severity.${impact.severity}`)}
            </span>
            {affectedCount > 1 ? (
              <span className="shrink-0 rounded-full bg-white/75 px-1.5 py-0.5 font-bold text-[10px] text-muted">
                {t('workspace.journey.alerts.affectedCount', { count: affectedCount })}
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              'mt-0.5 block text-[11px] text-muted leading-4',
              expanded ? 'line-clamp-none' : 'line-clamp-1',
            )}
          >
            {impact.summary}
          </span>
          {expanded ? (
            <span className="mt-2 flex items-center gap-2">
              <AvatarGroup items={avatarPeople(members, impact.participantIds)} max={3} />
              <span className="text-[10px] text-muted">
                {t('workspace.journey.alerts.openMapHint')}
              </span>
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('mt-0.5 shrink-0 text-muted transition', expanded && 'rotate-180')}
          size={14}
        />
      </button>
      <button
        aria-label={t('workspace.flash.links.map')}
        className="grid min-h-10 place-items-center border-line/60 border-l text-muted transition hover:text-olive"
        onClick={onOpen}
        type="button"
      >
        <MapPoint size={15} />
      </button>
    </div>
  )
}

function JourneyWorkspace({
  customItems,
  data,
  reports,
  onAdd,
  onSelect,
  trip,
  tripId,
}: {
  customItems: TimelineItem[]
  data: ManagedTripData
  reports: UserTravelReport[]
  onAdd: () => void
  onSelect: (item: TimelineItem) => void
  trip: TravelTripSummary | null
  tripId: string
}) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const activeDay = useTravelDay()
  const [mode, setMode] = useState<JourneyMode>(() => initialJourneyMode(pathname))
  const activeDate = data.days?.[activeDay - 1]?.date ?? tripDays[activeDay - 1]?.date
  const activeDayLabel = activeDate
    ? formatTripDate(activeDate, i18n.language)
    : t('workspace.journey.dayDate')
  const activeDaySummary = t('workspace.journey.customDaySummary')
  const allItems = useMemo(
    () => buildTimelineItems(data, activeDay, customItems, t),
    [activeDay, customItems, data, t],
  )
  const items = useMemo(
    () =>
      allItems.filter(
        (item) =>
          mode === 'timeline' ||
          (mode === 'bookings' && item.source === 'booking') ||
          (mode === 'transport' && item.source === 'transport'),
      ),
    [allItems, mode],
  )
  const impactsByItem = useMemo(
    () => buildJourneyImpacts(data, allItems, reports, t),
    [allItems, data, reports, t],
  )
  const impactCount = Object.values(impactsByItem).reduce(
    (total, impacts) => total + impacts.length,
    0,
  )
  const impactCounts = useMemo(
    () =>
      Object.values(impactsByItem)
        .flat()
        .reduce<Record<string, number>>((counts, impact) => {
          counts[impact.id] = (counts[impact.id] ?? 0) + 1
          return counts
        }, {}),
    [impactsByItem],
  )
  const visibleImpactsByItem = useMemo(() => {
    const seen = new Set<string>()
    return Object.fromEntries(
      items.map((item) => [
        item.id,
        (impactsByItem[item.id] ?? []).filter((impact) => {
          if (seen.has(impact.id)) return false
          seen.add(impact.id)
          return true
        }),
      ]),
    ) as Record<string, JourneyImpact[]>
  }, [impactsByItem, items])

  const changeDay = (day: number) => {
    setTravelDay(day, data.days?.length || tripDays.length)
  }
  const changeMode = (nextMode: JourneyMode) => {
    setMode(nextMode)
    writeSearchParams({ mode: nextMode === 'timeline' ? null : nextMode })
  }
  const EmptyJourneyIcon = mode === 'bookings' ? Ticket : mode === 'transport' ? Tram : CalendarAdd

  return (
    <div className="mx-auto grid h-auto w-full max-w-[1320px] gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="travel-surface min-w-0 px-3 py-3 sm:px-4 xl:min-h-0 xl:overflow-auto xl:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="text-[11px] text-muted">
              {trip?.destination ?? t('workspace.journey.destination')}
            </div>
            <div className="mt-0.5 font-serif font-bold text-[21px] leading-7 tracking-[-0.02em] text-ink">
              {t('workspace.journey.todayPlan')}
            </div>
          </div>
          <div className="flex max-w-full items-center gap-2 overflow-x-auto">
            <Tabs
              onChange={changeMode}
              options={[
                { id: 'timeline', label: t('workspace.journey.tabs.timeline') },
                { id: 'bookings', label: t('workspace.journey.tabs.bookings') },
                { id: 'transport', label: t('workspace.journey.tabs.transport') },
              ]}
              value={mode}
              variant="segmented"
            />
            <ContextCollaboration
              planner
              subjectId={String(activeDay)}
              subjectType="day"
              title={t('contextCollaboration.dayTitle', { count: activeDay })}
              tripId={tripId}
            />
            <span className="relative inline-flex shrink-0">
              <IconButton
                className="border-coral/20 bg-coral/8 text-coral hover:bg-coral/12"
                label={t('workspace.journey.alerts.report')}
                onClick={() => void navigate({ to: '/map', search: { report: 1 } })}
              >
                <Bolt size={17} />
              </IconButton>
              {impactCount ? (
                <span className="pointer-events-none absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-coral text-[8px] text-white ring-2 ring-white">
                  {impactCount}
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <DayStrip activeDay={activeDay} dates={data.days} onChange={changeDay} />
        <details className="mt-2 rounded-[var(--radius-card)] bg-sage/45 px-3 py-2.5 xl:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <CalendarCheck className="shrink-0 text-olive" size={16} />
            <strong className="min-w-0 flex-1 truncate text-[12px]">
              {t('workspace.journey.dayOverview')}
            </strong>
            <span className="text-[11px] text-muted">{activeDayLabel}</span>
          </summary>
          <p className="mt-2 mb-0 text-[12px] text-muted leading-5">
            {allItems.length ? activeDaySummary : t('workspace.journey.empty.timeline')}
          </p>
          <DayOverviewMetrics impactCount={impactCount} items={allItems} />
        </details>
        <div className="mt-3 min-h-0">
          {items.length ? (
            items.map((item) => (
              <TimelineRow
                impactCounts={impactCounts}
                impacts={visibleImpactsByItem[item.id] ?? []}
                item={item}
                key={item.id}
                members={data.members}
                onImpactSelect={(impact) =>
                  void navigate({ to: '/map', search: { focus: impact.id } })
                }
                onSelect={() => onSelect(item)}
              />
            ))
          ) : (
            <EmptyState
              action={
                <Button icon={<Plus size={15} />} onClick={onAdd} variant="action">
                  {t('workspace.journey.add')}
                </Button>
              }
              description={t(`workspace.journey.emptyState.${mode}Hint`)}
              eyebrow={activeDayLabel}
              icon={<EmptyJourneyIcon size={21} />}
              secondaryAction={
                <Button
                  icon={<MapPoint size={15} />}
                  onClick={() => void navigate({ to: '/map' })}
                  variant="outline"
                >
                  {t('workspace.journey.emptyState.exploreMap')}
                </Button>
              }
              size="page"
              title={t(`workspace.journey.emptyState.${mode}Title`)}
              variant="embedded"
            />
          )}
          {items.length ? (
            <button
              className="mt-3 hidden h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-sage/65 font-bold text-[12px] text-olive transition hover:bg-sage xl:flex"
              onClick={onAdd}
              type="button"
            >
              <Plus size={16} />
              {t('workspace.journey.add')}
            </button>
          ) : null}
        </div>
      </section>

      <aside className="grid content-start gap-3 pb-24 xl:overflow-auto xl:pb-0">
        <section className="travel-surface overflow-hidden">
          {trip ? (
            <img
              alt=""
              className="h-36 w-full object-cover"
              src={trip.destinationPhoto ?? trip.coverImage}
            />
          ) : null}
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-extrabold text-[14px]">
                <CalendarCheck size={17} className="text-olive" />
                {t('workspace.journey.dayOverview')}
              </span>
              <span className="text-[11px] text-muted">{activeDayLabel}</span>
            </div>
            <p className="mb-0 text-[12px] text-muted leading-5">
              {allItems.length ? activeDaySummary : t('workspace.journey.empty.timeline')}
            </p>
            <DayOverviewMetrics impactCount={impactCount} items={allItems} />
          </div>
        </section>
      </aside>
    </div>
  )
}

function FinanceSummary({ currency, data }: { currency: string; data: ManagedTripData }) {
  const { t } = useTranslation()
  const current = data.members.find((member) => member.current)
  const totals = Array.from(
    data.expenses
      .reduce<Map<string, number>>((currencies, expense) => {
        currencies.set(expense.currency, (currencies.get(expense.currency) ?? 0) + expense.amount)
        return currencies
      }, new globalThis.Map())
      .entries(),
  )
  const myShares = Array.from(
    data.expenses
      .reduce<Map<string, number>>((currencies, expense) => {
        if (!current || !expense.participantIds.includes(current.id)) return currencies
        currencies.set(
          expense.currency,
          (currencies.get(expense.currency) ?? 0) +
            expense.amount / Math.max(1, expense.participantIds.length),
        )
        return currencies
      }, new globalThis.Map())
      .entries(),
  )
  const unsettled = data.expenses.filter(
    (expense) => expense.paidMemberIds.length < expense.participantIds.length,
  ).length
  const summaryCurrency = totals[0]?.[0] ?? currency
  const displayedTotals = totals.length ? totals : [[summaryCurrency, 0] as const]
  const displayedMyShares = myShares.length ? myShares : [[summaryCurrency, 0] as const]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="travel-surface px-4 py-3">
        <div className="text-[11px] text-muted">{t('workspace.finance.total')}</div>
        <div className="mt-1 flex flex-wrap gap-x-2 font-extrabold text-[19px]">
          {displayedTotals.map(([currency, amount]) => (
            <Money amount={amount} currency={currency} key={currency} />
          ))}
        </div>
      </div>
      <div className="travel-surface px-4 py-3">
        <div className="text-[11px] text-muted">{t('workspace.finance.myShare')}</div>
        <div className="mt-1 flex flex-wrap gap-x-2 font-extrabold text-[19px]">
          {displayedMyShares.map(([currency, amount]) => (
            <Money amount={amount} currency={currency} key={currency} />
          ))}
        </div>
      </div>
      <div className="travel-surface col-span-2 px-4 py-3 sm:col-span-1">
        <div className="text-[11px] text-muted">{t('workspace.finance.unsettled')}</div>
        <div className="mt-1 font-extrabold text-[19px]">{unsettled}</div>
      </div>
    </div>
  )
}

function LedgerView({
  data,
  expenses,
  onSelect,
}: {
  data: ManagedTripData
  expenses: ExpenseRecord[]
  onSelect: (expense: ExpenseRecord) => void
}) {
  const { t } = useTranslation()
  const groups = Array.from(
    expenses.reduce<Map<string, ExpenseRecord[]>>((current, expense) => {
      current.set(expense.dateLabel, [...(current.get(expense.dateLabel) ?? []), expense])
      return current
    }, new globalThis.Map()),
  )
  return (
    <section className="travel-surface overflow-hidden">
      {groups.map(([dateLabel, records]) => (
        <div key={dateLabel}>
          <div className="flex items-center justify-between border-line/60 border-b bg-paper/45 px-4 py-2.5">
            <strong className="text-[11px] text-ink">{localizedDayLabel(dateLabel, t)}</strong>
            <span className="text-[10px] text-muted">
              {t('workspace.finance.records', { count: records.length })}
            </span>
          </div>
          <div className="px-3 sm:px-4">
            {records.map((expense) => {
              const Icon = expenseIcons[expense.category]
              const payer = memberById(data.members, expense.paidByMemberId)
              const settled = expense.paidMemberIds.length >= expense.participantIds.length
              return (
                <button
                  className="travel-virtual-row grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 border-line/70 border-b px-1 py-3.5 text-left transition last:border-0 hover:bg-paper/45 sm:grid-cols-[44px_minmax(0,1fr)_150px_100px] sm:px-2"
                  key={expense.id}
                  onClick={() => onSelect(expense)}
                  type="button"
                >
                  <span className="grid size-10 place-items-center rounded-[14px] bg-paper text-olive">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-[14px]">
                      {expenseTitle(expense, t)}
                    </strong>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {localizedDayLabel(expense.dateLabel, t)} ·{' '}
                      {placeName(data, expense.placeId, t)}
                      {payer ? ` · ${payer.displayName}` : ''}
                    </span>
                  </span>
                  <span className="hidden min-w-0 items-center gap-2 sm:flex">
                    {payer ? (
                      <UserAvatar
                        person={{ color: payer.avatarColor, id: payer.id, name: payer.displayName }}
                      />
                    ) : null}
                    <span className="truncate text-[11px] text-muted">{payer?.displayName}</span>
                  </span>
                  <span className="text-right">
                    <strong className="block text-[14px]">
                      <Money amount={expense.amount} currency={expense.currency} />
                    </strong>
                    <span
                      className={cn(
                        'text-[10px] font-bold',
                        settled ? 'text-olive' : 'text-[#9b6b1f]',
                      )}
                    >
                      {settled ? t('workspace.finance.settled') : t('workspace.finance.pending')}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}

function BudgetView({ budgets, onAdd }: { budgets: BudgetCategoryRecord[]; onAdd: () => void }) {
  const { t } = useTranslation()
  if (!budgets.length)
    return (
      <EmptyState
        action={
          <Button icon={<Receipt size={15} />} onClick={onAdd} variant="action">
            {t('workspace.finance.add')}
          </Button>
        }
        description={t('workspace.finance.emptyState.budgetHint')}
        icon={<Wallet size={21} />}
        size="page"
        title={t('workspace.finance.emptyState.budgetTitle')}
      />
    )
  return (
    <section className="travel-surface p-4 sm:p-5">
      <div className="grid gap-5">
        {budgets.map((budget) => {
          const percent = Math.round((budget.spent / Math.max(1, budget.budget)) * 100)
          return (
            <div key={budget.id}>
              <div className="mb-2 flex items-end justify-between gap-4">
                <div>
                  <strong className="block text-[14px]">
                    {t(`management.categories.${budget.category}`)}
                  </strong>
                  <span className="text-[11px] text-muted">
                    {t('workspace.finance.used', { percent })}
                  </span>
                </div>
                <span className="text-right font-extrabold text-[13px]">
                  <Money amount={budget.spent} currency={budget.currency} />
                  <span className="font-semibold text-[11px] text-muted">
                    {' '}
                    / <Money amount={budget.budget} currency={budget.currency} />
                  </span>
                </span>
              </div>
              <ProgressBar tone={percent > 85 ? 'bg-coral' : 'bg-olive'} value={percent} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SettlementView({
  data,
  onAdd,
  tripId,
}: {
  data: ManagedTripData
  onAdd: () => void
  tripId?: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  type SettlementRecordResponse = {
    id: string
    currency: string
    transfers: Array<{ fromMemberId: string; toMemberId: string; amount: number }>
    paidTransferIds: string[]
  }
  const queryKey = ['travel', 'settlement-records', tripId]
  const recordsQuery = useQuery({
    enabled: Boolean(tripId),
    queryFn: () =>
      apiGet<SettlementRecordResponse[]>(
        `/api/trips/${encodeURIComponent(tripId!)}/expenses/settlement-records`,
      ),
    queryKey,
  })
  const createMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/trips/${encodeURIComponent(tripId!)}/expenses/settlement-records`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const paidMutation = useMutation({
    mutationFn: (input: { paid: boolean; recordId: string; transferId: string }) =>
      apiPost(
        `/api/trips/${encodeURIComponent(tripId!)}/expenses/settlement-records/${encodeURIComponent(input.recordId)}/transfer-paid`,
        { paid: input.paid, transferId: input.transferId },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  useEffect(() => {
    if (
      tripId &&
      data.settlement.transfers.length &&
      recordsQuery.data &&
      !recordsQuery.data.length &&
      !createMutation.isPending
    ) {
      createMutation.mutate()
    }
  }, [createMutation, data.settlement.transfers.length, recordsQuery.data, tripId])
  const transfers = data.settlement.transfers
  const transferState = transfers.map((transfer) => {
    const record = recordsQuery.data?.find((item) => item.currency === transfer.currency)
    const index = record?.transfers.findIndex(
      (item) =>
        item.fromMemberId ===
          data.members.find((member) => member.id === transfer.fromMemberId)?.serverId &&
        item.toMemberId ===
          data.members.find((member) => member.id === transfer.toMemberId)?.serverId &&
        Math.abs(item.amount - transfer.amount) < 0.01,
    )
    const transferId = record && index !== undefined && index >= 0 ? `${record.id}:${index}` : null
    return {
      completed: Boolean(transferId && record?.paidTransferIds.includes(transferId)),
      recordId: record?.id,
      transfer,
      transferId,
    }
  })
  const remaining = transferState.filter((item) => !item.completed)
  const settlementStatus =
    recordsQuery.isFetching || createMutation.isPending || paidMutation.isPending
      ? ('saving' as const)
      : recordsQuery.isError || createMutation.isError || paidMutation.isError
        ? ('error' as const)
        : ('saved' as const)
  return (
    <section className="travel-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-line/60 border-b px-4 py-3.5">
        <span className="inline-flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-[var(--radius-control)] bg-sage text-olive">
            <Wallet size={18} />
          </span>
          <span>
            <strong className="block text-[14px]">{t('workspace.finance.settlementTitle')}</strong>
            <span className="text-[11px] text-muted">
              {t('workspace.finance.settlementRemaining', { count: remaining.length })}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <SyncStatus status={settlementStatus} />
          <StatusBadge tone={remaining.length ? 'warning' : 'success'}>
            {remaining.length
              ? t('workspace.finance.pending')
              : t('workspace.finance.settlementComplete')}
          </StatusBadge>
        </span>
      </div>
      {transfers.length ? (
        <div className="px-3 sm:px-4">
          {transferState.map(({ completed, recordId, transfer, transferId }) => {
            const from = memberById(data.members, transfer.fromMemberId)
            const to = memberById(data.members, transfer.toMemberId)
            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-line/60 border-b px-1 py-4 last:border-0"
                key={transfer.id}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {from ? (
                    <UserAvatar
                      person={{ color: from.avatarColor, id: from.id, name: from.displayName }}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[13px]">
                      {t('workspace.finance.settlementTransfer', {
                        from: from?.displayName ?? '—',
                        to: to?.displayName ?? '—',
                      })}
                    </strong>
                    <span className="text-[11px] text-muted">
                      <Money amount={transfer.amount} currency={transfer.currency} />
                    </span>
                  </span>
                </div>
                <Button
                  disabled={!recordId || !transferId || paidMutation.isPending}
                  onClick={() => {
                    if (recordId && transferId)
                      paidMutation.mutate({ paid: !completed, recordId, transferId })
                  }}
                  size="sm"
                  variant={completed ? 'ghost' : 'outline'}
                >
                  {completed
                    ? t('workspace.finance.settlementUndo')
                    : t('workspace.finance.settlementMarkPaid')}
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          action={
            data.expenses.length ? undefined : (
              <Button icon={<Receipt size={15} />} onClick={onAdd} variant="action">
                {t('workspace.finance.add')}
              </Button>
            )
          }
          description={
            data.expenses.length
              ? t('workspace.finance.emptyState.settlementCompleteHint')
              : t('workspace.finance.emptyState.settlementHint')
          }
          icon={<CheckCircle size={21} />}
          size="section"
          title={
            data.expenses.length
              ? t('workspace.finance.emptyState.settlementCompleteTitle')
              : t('workspace.finance.emptyState.settlementTitle')
          }
          variant="embedded"
        />
      )}
    </section>
  )
}

function FinanceWorkspace({
  currency,
  data,
  documents,
  expenses,
  onAdd,
  onSelect,
  tripId,
}: {
  currency: string
  data: ManagedTripData
  documents: TravelDocument[]
  expenses: ExpenseRecord[]
  onAdd: () => void
  onSelect: (expense: ExpenseRecord) => void
  tripId?: string
}) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [tab, setTab] = useState<FinanceTab>(() => initialFinanceTab(pathname))
  const [query, setQuery] = useState('')
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'pending' | 'settled'>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [missingReceiptOnly, setMissingReceiptOnly] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const documentedExpenseIds = useMemo(
    () =>
      new Set(
        documents
          .filter((document) => document.subjectType === 'expense')
          .map((document) => document.subjectId),
      ),
    [documents],
  )
  const missingReceiptCount = expenses.filter(
    (expense) => !documentedExpenseIds.has(expense.id),
  ).length
  const filteredExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return expenses.filter((expense) => {
      const settled = expense.paidMemberIds.length >= expense.participantIds.length
      return (
        (categoryFilter === 'all' || expense.category === categoryFilter) &&
        (settlementFilter === 'all' || (settlementFilter === 'settled' ? settled : !settled)) &&
        (!missingReceiptOnly || !documentedExpenseIds.has(expense.id)) &&
        (!normalizedQuery ||
          expenseTitle(expense, t).toLowerCase().includes(normalizedQuery) ||
          placeName(data, expense.placeId, t).toLowerCase().includes(normalizedQuery) ||
          (memberById(data.members, expense.paidByMemberId)?.displayName ?? '')
            .toLowerCase()
            .includes(normalizedQuery))
      )
    })
  }, [
    categoryFilter,
    data,
    documentedExpenseIds,
    expenses,
    missingReceiptOnly,
    query,
    settlementFilter,
    t,
  ])
  const hasLedgerFilters = Boolean(
    query || settlementFilter !== 'all' || categoryFilter !== 'all' || missingReceiptOnly,
  )
  const clearLedgerFilters = () => {
    setQuery('')
    setSettlementFilter('all')
    setCategoryFilter('all')
    setMissingReceiptOnly(false)
  }
  return (
    <div className="mx-auto grid h-full w-full max-w-[1120px] min-h-0 content-start gap-4 overflow-auto pb-24 xl:pb-4">
      <FinanceSummary currency={currency} data={{ ...data, expenses }} />
      <div className="flex items-center justify-between gap-3">
        <Tabs
          onChange={(nextTab) => {
            setTab(nextTab)
            writeSearchParams({ tab: nextTab === 'ledger' ? null : nextTab })
          }}
          options={[
            { id: 'ledger', label: t('workspace.finance.tabs.ledger') },
            { id: 'budget', label: t('workspace.finance.tabs.budget') },
            { id: 'settlement', label: t('workspace.finance.tabs.settlement') },
          ]}
          value={tab}
          variant="segmented"
        />
        <span className="flex items-center gap-2">
          {tripId ? (
            <ContextCollaboration
              subjectType="ledger"
              title={t('contextCollaboration.ledgerTitle')}
              tripId={tripId}
            />
          ) : null}
          <span className="hidden text-[11px] text-muted sm:block">
            {t('workspace.finance.records', { count: expenses.length })}
          </span>
        </span>
      </div>
      {tab === 'ledger' ? (
        <>
          <section className="travel-surface grid gap-2 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <TextInput
              aria-label={t('workspace.finance.search')}
              className="h-10"
              leadingIcon={<Search size={15} />}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('workspace.finance.search')}
              value={query}
            />
            <div className="flex gap-1 overflow-x-auto">
              {(['all', 'pending', 'settled'] as const).map((filter) => (
                <button
                  aria-pressed={settlementFilter === filter}
                  className={cn(
                    'h-10 shrink-0 rounded-full px-3 font-bold text-[11px] transition',
                    settlementFilter === filter ? 'bg-olive text-white' : 'bg-paper text-muted',
                  )}
                  key={filter}
                  onClick={() => setSettlementFilter(filter)}
                  type="button"
                >
                  {t(`workspace.finance.filters.${filter}`)}
                </button>
              ))}
            </div>
            <button
              className="flex h-9 items-center justify-between rounded-[12px] bg-paper/70 px-3 font-bold text-[11px] text-olive sm:hidden"
              onClick={() => setFilterSheetOpen(true)}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <Filter size={15} />
                {t('workspace.finance.filters.more')}
              </span>
              {categoryFilter !== 'all' || missingReceiptOnly ? (
                <span className="grid size-5 place-items-center rounded-full bg-olive text-[9px] text-white">
                  {Number(categoryFilter !== 'all') + Number(missingReceiptOnly)}
                </span>
              ) : null}
            </button>
            <div className="hidden gap-1 overflow-x-auto sm:col-span-2 sm:flex">
              {(['all', 'transport', 'food', 'activity', 'stay', 'shopping'] as const).map(
                (category) => (
                  <button
                    aria-pressed={categoryFilter === category}
                    className={cn(
                      'h-8 shrink-0 rounded-full px-3 font-bold text-[10px] transition',
                      categoryFilter === category ? 'bg-sage text-olive' : 'bg-paper/70 text-muted',
                    )}
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    type="button"
                  >
                    {category === 'all'
                      ? t('workspace.finance.filters.allCategories')
                      : t(`management.categories.${category}`)}
                  </button>
                ),
              )}
              <button
                aria-pressed={missingReceiptOnly}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3 font-bold text-[10px] transition',
                  missingReceiptOnly ? 'bg-[#fff1ed] text-coral' : 'bg-paper/70 text-muted',
                )}
                onClick={() => setMissingReceiptOnly((active) => !active)}
                type="button"
              >
                {t('workspace.finance.filters.missingReceipt', { count: missingReceiptCount })}
              </button>
            </div>
          </section>
          {filteredExpenses.length ? (
            <LedgerView data={data} expenses={filteredExpenses} onSelect={onSelect} />
          ) : (
            <EmptyState
              action={
                expenses.length && hasLedgerFilters ? (
                  <Button icon={<X size={14} />} onClick={clearLedgerFilters} variant="outline">
                    {t('workspace.finance.filters.clear')}
                  </Button>
                ) : (
                  <Button icon={<Plus size={15} />} onClick={onAdd} variant="action">
                    {t('workspace.finance.add')}
                  </Button>
                )
              }
              description={
                expenses.length
                  ? t('workspace.finance.emptyState.filteredHint')
                  : t('workspace.finance.emptyState.ledgerHint')
              }
              icon={<Receipt size={21} />}
              size="page"
              title={
                expenses.length
                  ? t('workspace.finance.emptyState.filteredTitle')
                  : t('workspace.finance.emptyState.ledgerTitle')
              }
            />
          )}
          {filterSheetOpen ? (
            <Sheet className="sm:hidden" onClose={() => setFilterSheetOpen(false)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] text-muted">
                    {t('workspace.finance.filters.eyebrow')}
                  </div>
                  <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
                    {t('workspace.finance.filters.more')}
                  </h2>
                </div>
                <IconButton label={t('actions.close')} onClick={() => setFilterSheetOpen(false)}>
                  <X size={18} />
                </IconButton>
              </div>
              <div className="mt-5 grid gap-2">
                {(['all', 'transport', 'food', 'activity', 'stay', 'shopping'] as const).map(
                  (category) => (
                    <button
                      aria-pressed={categoryFilter === category}
                      className={cn(
                        'flex h-11 items-center justify-between rounded-[14px] px-3 font-bold text-[12px]',
                        categoryFilter === category
                          ? 'bg-sage text-olive'
                          : 'bg-paper/70 text-muted',
                      )}
                      key={category}
                      onClick={() => setCategoryFilter(category)}
                      type="button"
                    >
                      {category === 'all'
                        ? t('workspace.finance.filters.allCategories')
                        : t(`management.categories.${category}`)}
                      {categoryFilter === category ? <CheckCircle size={16} /> : null}
                    </button>
                  ),
                )}
                <button
                  aria-pressed={missingReceiptOnly}
                  className={cn(
                    'flex h-11 items-center justify-between rounded-[14px] px-3 font-bold text-[12px]',
                    missingReceiptOnly ? 'bg-[#fff1ed] text-coral' : 'bg-paper/70 text-muted',
                  )}
                  onClick={() => setMissingReceiptOnly((active) => !active)}
                  type="button"
                >
                  {t('workspace.finance.filters.missingReceipt', { count: missingReceiptCount })}
                  {missingReceiptOnly ? <CheckCircle size={16} /> : null}
                </button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    setCategoryFilter('all')
                    setMissingReceiptOnly(false)
                  }}
                  variant="outline"
                >
                  {t('workspace.finance.filters.clear')}
                </Button>
                <Button onClick={() => setFilterSheetOpen(false)} variant="action">
                  {t('workspace.finance.filters.apply')}
                </Button>
              </div>
            </Sheet>
          ) : null}
        </>
      ) : null}
      {tab === 'budget' ? <BudgetView budgets={data.budgets} onAdd={onAdd} /> : null}
      {tab === 'settlement' ? <SettlementView data={data} onAdd={onAdd} tripId={tripId} /> : null}
    </div>
  )
}

function MemberRows({
  data,
  onSelect,
}: {
  data: ManagedTripData
  onSelect: (member: TravelMember) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="travel-surface overflow-hidden px-3 sm:px-4">
      {data.members.map((member) => {
        const planCount = data.reservations.filter((item) =>
          item.participantIds.includes(member.id),
        ).length
        const taskCount = data.packingItems.filter(
          (item) => item.ownerId === member.id && !item.packed,
        ).length
        const unsettledCount = data.expenses.filter(
          (item) =>
            item.participantIds.includes(member.id) && !item.paidMemberIds.includes(member.id),
        ).length
        return (
          <button
            className="flex w-full items-center gap-3 border-line/70 border-b px-1 py-4 text-left transition last:border-0 hover:bg-paper/45"
            key={member.id}
            onClick={() => onSelect(member)}
            type="button"
          >
            <UserAvatar
              person={{
                avatarUrl: member.avatarUrl,
                color: member.avatarColor,
                id: member.id,
                name: member.displayName,
              }}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-[14px]">{member.displayName}</strong>
              <span className="text-[11px] text-muted">{t(`management.roles.${member.role}`)}</span>
              <span className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted">
                <span>{t('workspace.team.collaboration.plans', { count: planCount })}</span>
                <span>·</span>
                <span>{t('workspace.team.collaboration.tasks', { count: taskCount })}</span>
                <span>·</span>
                <span>
                  {t('workspace.team.collaboration.unsettled', { count: unsettledCount })}
                </span>
              </span>
            </div>
            <StatusBadge tone={taskCount || unsettledCount ? 'warning' : 'success'}>
              {member.current
                ? t('workspace.team.you')
                : taskCount || unsettledCount
                  ? t('workspace.team.needsAttention')
                  : t('workspace.team.ready')}
            </StatusBadge>
          </button>
        )
      })}
    </section>
  )
}

type PackingItemDraft = Omit<PackingItemRecord, 'id'>

function PackingItemSheet({
  bags,
  item,
  members,
  onClose,
  onDelete,
  onSave,
}: {
  bags: PackingBagRecord[]
  item: PackingItemRecord | null
  members: TravelMember[]
  onClose: () => void
  onDelete?: () => void
  onSave: (draft: PackingItemDraft) => void
}) {
  const { t } = useTranslation()
  const fallbackMember = members.find((member) => member.current)?.id ?? members[0]?.id ?? ''
  const [draft, setDraft] = useState<PackingItemDraft>(
    item
      ? { ...item }
      : {
          bagId: bags[0]?.id ?? '',
          category: 'Essentials',
          contributorIds: [],
          name: '',
          ownerId: fallbackMember,
          packed: false,
          quantity: 1,
          recipientIds: members.map((member) => member.id),
          visibility: 'shared',
        },
  )
  const toggleRecipient = (memberId: string) =>
    setDraft((value) => ({
      ...value,
      recipientIds: value.recipientIds.includes(memberId)
        ? value.recipientIds.filter((id) => id !== memberId)
        : [...value.recipientIds, memberId],
    }))
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.name.trim()) return
    onSave({ ...draft, name: draft.name.trim() })
  }
  return (
    <Sheet className="sm:w-[430px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">{t('packing.item.eyebrow')}</div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {item ? t('packing.item.edit') : t('packing.item.add')}
            </h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-5 grid gap-3">
          <TextInput
            aria-label={t('packing.item.name')}
            onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
            placeholder={t('packing.item.name')}
            value={draft.name}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
            <TextInput
              aria-label={t('packing.item.category')}
              onChange={(event) =>
                setDraft((value) => ({ ...value, category: event.target.value }))
              }
              placeholder={t('packing.item.category')}
              value={draft.category}
            />
            <TextInput
              aria-label={t('packing.item.quantity')}
              min="1"
              onChange={(event) =>
                setDraft((value) => ({ ...value, quantity: Number(event.target.value) || 1 }))
              }
              type="number"
              value={draft.quantity}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1.5">
              <span className="font-bold text-[10px] text-muted">{t('packing.item.bag')}</span>
              <select
                className="h-10 rounded-[12px] border border-line bg-white px-2.5 text-[11px]"
                onChange={(event) => setDraft((value) => ({ ...value, bagId: event.target.value }))}
                value={draft.bagId}
              >
                <option value="">{t('packing.item.noBag')}</option>
                {bags.map((bag) => (
                  <option key={bag.id} value={bag.id}>
                    {bag.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="font-bold text-[10px] text-muted">{t('packing.item.owner')}</span>
              <select
                className="h-10 rounded-[12px] border border-line bg-white px-2.5 text-[11px]"
                onChange={(event) =>
                  setDraft((value) => ({ ...value, ownerId: event.target.value }))
                }
                value={draft.ownerId}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <div className="mb-2 font-bold text-[10px] text-muted">{t('packing.item.forWhom')}</div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((member) => (
                <button
                  aria-pressed={draft.recipientIds.includes(member.id)}
                  className={cn(
                    'h-8 rounded-full px-3 font-bold text-[10px]',
                    draft.recipientIds.includes(member.id)
                      ? 'bg-olive text-white'
                      : 'bg-paper text-muted',
                  )}
                  key={member.id}
                  onClick={() => toggleRecipient(member.id)}
                  type="button"
                >
                  {member.displayName}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="font-bold text-[10px] text-muted">{t('packing.item.visibility')}</span>
            <select
              className="h-10 rounded-[12px] border border-line bg-white px-2.5 text-[11px]"
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  visibility: event.target.value as PackingItemRecord['visibility'],
                }))
              }
              value={draft.visibility}
            >
              <option value="personal">{t('packing.visibility.personal')}</option>
              <option value="shared">{t('packing.visibility.shared')}</option>
              <option value="common">{t('packing.visibility.common')}</option>
            </select>
          </label>
        </div>
        <Button
          className="mt-5 w-full"
          disabled={!draft.name.trim()}
          size="lg"
          type="submit"
          variant="action"
        >
          {t('actions.saveChanges')}
        </Button>
        {onDelete ? (
          <Button className="mt-2 w-full" onClick={onDelete} variant="danger">
            {t('actions.delete')}
          </Button>
        ) : null}
      </form>
    </Sheet>
  )
}

function PackingBagManager({
  bags,
  itemCount,
  onAdd,
  onClose,
  onDelete,
  onUpdate,
}: {
  bags: PackingBagRecord[]
  itemCount: (bagId: string) => number
  onAdd: (input: Omit<PackingBagRecord, 'id'>) => void
  onClose: () => void
  onDelete: (bagId: string) => void
  onUpdate: (bagId: string, patch: Partial<PackingBagRecord>) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('20')
  const [editingBagId, setEditingBagId] = useState<string | null>(null)
  const resetForm = () => {
    setName('')
    setLimit('20')
    setEditingBagId(null)
  }
  return (
    <Sheet className="sm:w-[410px]" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] text-muted">{t('packing.bags.eyebrow')}</div>
          <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">{t('packing.bags.title')}</h2>
        </div>
        <IconButton label={t('actions.close')} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="mt-5 grid gap-2">
        {bags.map((bag) => (
          <div className="flex items-center gap-3 rounded-[14px] bg-paper/70 p-3" key={bag.id}>
            <span
              className="grid size-9 place-items-center rounded-[12px] text-white"
              style={{ backgroundColor: bag.color }}
            >
              <Briefcase size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[12px]">{bag.name}</strong>
              <span className="text-[10px] text-muted">
                {t('packing.bags.meta', { count: itemCount(bag.id), limit: bag.weightLimitKg })}
              </span>
            </span>
            <IconButton
              className="size-8 bg-transparent shadow-none"
              label={t('actions.edit')}
              onClick={() => {
                setEditingBagId(bag.id)
                setName(bag.name)
                setLimit(String(bag.weightLimitKg))
              }}
            >
              <Edit2 size={14} />
            </IconButton>
            <IconButton
              className="size-8 bg-transparent shadow-none"
              label={t('actions.delete')}
              onClick={() => {
                onDelete(bag.id)
                if (editingBagId === bag.id) resetForm()
              }}
            >
              <X size={14} />
            </IconButton>
          </div>
        ))}
      </div>
      <form
        className="mt-5 grid grid-cols-[minmax(0,1fr)_90px] gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim()) return
          if (editingBagId) {
            onUpdate(editingBagId, {
              name: name.trim(),
              weightLimitKg: Number(limit) || 20,
            })
          } else {
            onAdd({
              color: '#737842',
              name: name.trim(),
              ownerIds: [],
              weightLimitKg: Number(limit) || 20,
            })
          }
          resetForm()
        }}
      >
        <TextInput
          aria-label={t('packing.bags.name')}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('packing.bags.name')}
          value={name}
        />
        <TextInput
          aria-label={t('packing.bags.limit')}
          min="1"
          onChange={(event) => setLimit(event.target.value)}
          type="number"
          value={limit}
        />
        <Button
          className="col-span-2"
          disabled={!name.trim()}
          icon={editingBagId ? <CheckCircle size={15} /> : <Plus size={15} />}
          type="submit"
          variant="action"
        >
          {editingBagId ? t('actions.saveChanges') : t('packing.bags.add')}
        </Button>
        {editingBagId ? (
          <Button className="col-span-2" onClick={resetForm} type="button" variant="outline">
            {t('actions.cancel')}
          </Button>
        ) : null}
      </form>
    </Sheet>
  )
}

function PreparationRows({
  data,
  onAddBag,
  onAddItem,
  onDeleteBag,
  onDeleteItem,
  onToggle,
  onUpdateItem,
  onUpdateBag,
}: {
  data: ManagedTripData
  onAddBag: (input: Omit<PackingBagRecord, 'id'>) => void
  onAddItem: (input: PackingItemDraft) => void
  onDeleteBag: (bagId: string) => void
  onDeleteItem: (itemId: string) => void
  onToggle: (id: string) => void
  onUpdateItem: (itemId: string, patch: Partial<PackingItemRecord>) => void
  onUpdateBag: (bagId: string, patch: Partial<PackingBagRecord>) => void
}) {
  const { t } = useTranslation()
  const [activeBagId, setActiveBagId] = useState('all')
  const [editingItem, setEditingItem] = useState<PackingItemRecord | 'new' | null>(null)
  const [bagsOpen, setBagsOpen] = useState(false)
  const visibleItems =
    activeBagId === 'all'
      ? data.packingItems
      : data.packingItems.filter((item) => item.bagId === activeBagId)
  const packed = visibleItems.filter((item) => item.packed).length
  const progress = Math.round((packed / Math.max(1, visibleItems.length)) * 100)
  return (
    <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_34px_rgba(34,55,48,0.055)] sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <strong className="text-[15px]">{t('workspace.team.preparationTitle')}</strong>
          <div className="mt-0.5 text-[11px] text-muted">
            {t('workspace.team.packed', { packed, total: visibleItems.length })}
          </div>
        </div>
        <span className="font-extrabold text-[13px] text-olive">{progress}%</span>
      </div>
      <ProgressBar className="mb-4" value={progress} />
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          className={cn(
            'min-w-[100px] rounded-[14px] p-3 text-left',
            activeBagId === 'all' ? 'bg-olive text-white' : 'bg-paper',
          )}
          onClick={() => setActiveBagId('all')}
          type="button"
        >
          <Briefcase size={15} />
          <strong className="mt-2 block text-[11px]">{t('packing.all')}</strong>
          <span
            className={cn('text-[9px]', activeBagId === 'all' ? 'text-white/62' : 'text-muted')}
          >
            {data.packingItems.length}
          </span>
        </button>
        {data.packingBags.map((bag) => (
          <button
            className={cn(
              'min-w-[120px] rounded-[14px] p-3 text-left',
              activeBagId === bag.id ? 'text-white' : 'bg-paper',
            )}
            key={bag.id}
            onClick={() => setActiveBagId(bag.id)}
            style={activeBagId === bag.id ? { backgroundColor: bag.color } : undefined}
            type="button"
          >
            <Briefcase size={15} />
            <strong className="mt-2 block truncate text-[11px]">{bag.name}</strong>
            <span
              className={cn('text-[9px]', activeBagId === bag.id ? 'text-white/62' : 'text-muted')}
            >
              {t('packing.bagCount', {
                count: data.packingItems.filter((item) => item.bagId === bag.id).length,
              })}
            </span>
          </button>
        ))}
        <button
          className="grid min-w-[90px] place-items-center rounded-[14px] border border-dashed border-line text-olive"
          onClick={() => setBagsOpen(true)}
          type="button"
        >
          <span>
            <Plus className="mx-auto" size={16} />
            <span className="mt-1 block text-[9px]">{t('packing.manage')}</span>
          </span>
        </button>
      </div>
      <div className="mt-2">
        {visibleItems.map((item) => {
          const owner = memberById(data.members, item.ownerId)
          const bag = data.packingBags.find((value) => value.id === item.bagId)
          return (
            <div
              className="flex items-center gap-3 border-line/70 border-b py-3 last:border-0"
              key={item.id}
            >
              <button
                aria-label={t('packing.item.toggle', {
                  name: packingTitle(item.id, item.name, t),
                })}
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border transition',
                  item.packed
                    ? 'border-olive bg-olive text-white'
                    : 'border-line bg-white text-transparent',
                )}
                onClick={() => onToggle(item.id)}
                type="button"
              >
                <CheckCircle size={15} />
              </button>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setEditingItem(item)}
                type="button"
              >
                <strong
                  className={cn(
                    'block truncate text-[13px]',
                    item.packed && 'text-muted line-through',
                  )}
                >
                  {packingTitle(item.id, item.name, t)}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                </strong>
                <span className="text-[10px] text-muted">
                  {packingCategory(item.category, t)} · {bag?.name}
                </span>
              </button>
              <span className="text-[10px] text-muted">{owner?.displayName}</span>
            </div>
          )
        })}
        {!visibleItems.length ? (
          <EmptyState
            action={
              <Button
                icon={<Plus size={14} />}
                onClick={() => setEditingItem('new')}
                size="sm"
                variant="action"
              >
                {t('packing.item.add')}
              </Button>
            }
            description={t('packing.emptyHint')}
            icon={<Briefcase size={17} />}
            size="section"
            title={t('packing.emptyTitle')}
            variant="embedded"
          />
        ) : null}
      </div>
      {visibleItems.length ? (
        <Button
          className="mt-3 w-full"
          icon={<Plus size={15} />}
          onClick={() => setEditingItem('new')}
          variant="outline"
        >
          {t('packing.item.add')}
        </Button>
      ) : null}
      {editingItem ? (
        <PackingItemSheet
          bags={data.packingBags}
          item={editingItem === 'new' ? null : editingItem}
          members={data.members}
          onClose={() => setEditingItem(null)}
          onDelete={
            editingItem === 'new'
              ? undefined
              : () => {
                  onDeleteItem(editingItem.id)
                  setEditingItem(null)
                }
          }
          onSave={(draft) => {
            if (editingItem === 'new') onAddItem(draft)
            else onUpdateItem(editingItem.id, draft)
            setEditingItem(null)
          }}
        />
      ) : null}
      {bagsOpen ? (
        <PackingBagManager
          bags={data.packingBags}
          itemCount={(bagId) => data.packingItems.filter((item) => item.bagId === bagId).length}
          onAdd={onAddBag}
          onClose={() => setBagsOpen(false)}
          onDelete={(bagId) => {
            onDeleteBag(bagId)
            if (activeBagId === bagId) setActiveBagId('all')
          }}
          onUpdate={onUpdateBag}
        />
      ) : null}
    </section>
  )
}

interface TripAuditEntry {
  id: string
  actor: { userId?: string; buddyId?: string; kind: string }
  subjectType?: string
  subjectId?: string
  createdAt: string
}

function relativeActivityTime(value: string) {
  const deltaMinutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(deltaMinutes) < 60) return formatter.format(deltaMinutes, 'minute')
  return formatter.format(Math.round(deltaMinutes / 60), 'hour')
}

function ActivityRows({ data, tripId }: { data: ManagedTripData; tripId: string }) {
  const { t } = useTranslation()
  const audit = useQuery({
    queryFn: () =>
      apiGet<TripAuditEntry[]>(`/api/trips/${encodeURIComponent(tripId)}/audit-logs`, {
        limit: 30,
      }),
    queryKey: ['travel', 'audit', tripId],
    staleTime: 10_000,
  })
  const items = audit.data ?? []
  if (audit.isLoading) {
    return (
      <section
        aria-busy="true"
        className="travel-surface grid min-h-48 place-items-center text-[12px] text-muted"
      >
        <span className="inline-flex items-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-sage border-t-olive" />
          {t('common.loading')}
        </span>
      </section>
    )
  }
  if (!items.length) {
    return (
      <EmptyState
        description={t('workspace.team.activity.emptyHint')}
        icon={<Clock size={21} />}
        size="page"
        title={t('workspace.team.activity.emptyTitle')}
      />
    )
  }
  return (
    <section className="travel-surface overflow-hidden px-4">
      {items.map((item) => {
        const member = data.members.find((candidate) => candidate.userId === item.actor.userId)
        const actor =
          member?.displayName ?? item.actor.buddyId ?? t('workspace.team.activity.actor')
        const command = item.subjectId?.startsWith('travel.')
          ? t(`workspace.team.activity.commands.${item.subjectId.slice(7)}`, {
              defaultValue: item.subjectId.slice(7),
            })
          : t('workspace.team.activity.change')
        return (
          <div
            className="flex items-start gap-3 border-line/70 border-b py-4 last:border-0"
            key={item.id}
          >
            <span className="grid size-9 place-items-center rounded-[13px] bg-paper text-olive">
              {item.actor.kind === 'agent' ? <Bolt size={17} /> : <Users size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[13px]">
                {item.subjectType === 'command'
                  ? t('workspace.team.activity.command', { actor, command })
                  : t('workspace.team.activity.updated', { actor })}
              </strong>
              <span className="text-[11px] text-muted">{command}</span>
            </div>
            <span className="text-[10px] text-muted">{relativeActivityTime(item.createdAt)}</span>
          </div>
        )
      })}
    </section>
  )
}

function TeamPulse({ data }: { data: ManagedTripData }) {
  const { t } = useTranslation()
  const packed = data.packingItems.filter((item) => item.packed).length
  const progress = Math.round((packed / Math.max(1, data.packingItems.length)) * 100)
  return (
    <aside className="hidden content-start gap-3 xl:grid">
      <section className="travel-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <strong className="text-[14px]">{t('workspace.team.preparationTitle')}</strong>
          <span className="font-extrabold text-[12px] text-olive">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
        <div className="mt-3 grid gap-2">
          {data.packingItems
            .filter((item) => !item.packed)
            .slice(0, 3)
            .map((item) => (
              <div className="flex items-center gap-2 text-[11px]" key={item.id}>
                <span className="size-1.5 rounded-full bg-coral" />
                <span className="min-w-0 flex-1 truncate">
                  {packingTitle(item.id, item.name, t)}
                </span>
                <span className="text-muted">
                  {memberById(data.members, item.ownerId)?.displayName}
                </span>
              </div>
            ))}
        </div>
      </section>
    </aside>
  )
}

function TeamWorkspace({
  activeTab,
  communityMembers,
  data,
  tripId,
  trip,
  onAddBag,
  onAddItem,
  onDeleteBag,
  onDeleteItem,
  onSelectMember,
  onInvite,
  onInviteCommunityMember,
  onTogglePacked,
  onUpdateItem,
  onUpdateBag,
  onTabChange,
}: {
  activeTab: TeamTab
  communityMembers: TravelMember[]
  data: ManagedTripData
  tripId: string
  trip: TravelTripSummary | null
  onAddBag: (input: Omit<PackingBagRecord, 'id'>) => void
  onAddItem: (input: PackingItemDraft) => void
  onDeleteBag: (bagId: string) => void
  onDeleteItem: (itemId: string) => void
  onSelectMember: (member: TravelMember) => void
  onInvite: () => void
  onInviteCommunityMember: (member: TravelMember) => void
  onTogglePacked: (id: string) => void
  onUpdateItem: (itemId: string, patch: Partial<PackingItemRecord>) => void
  onUpdateBag: (bagId: string, patch: Partial<PackingBagRecord>) => void
  onTabChange: (tab: TeamTab) => void
}) {
  const { t } = useTranslation()
  const tab = activeTab
  const preparationProgress = Math.round(
    (data.packingItems.filter((item) => item.packed).length /
      Math.max(1, data.packingItems.length)) *
      100,
  )
  const invitedUserIds = new Set(data.members.map((member) => member.userId).filter(Boolean))
  const communityCandidates = communityMembers.filter(
    (member) => member.userId && !invitedUserIds.has(member.userId),
  )
  const currentMember = data.members.find((member) => member.current) ?? data.members[0]
  const hasTravelCompanions = data.members.some((member) => member.id !== currentMember?.id)
  const showPreparationSummary =
    data.packingItems.length > 0 && (tab === 'travelers' || tab === 'activity')
  return (
    <div className="mx-auto grid h-full w-full max-w-[1120px] min-h-0 content-start gap-4 overflow-auto pb-24 xl:pb-4">
      <div className="flex items-center justify-between gap-3">
        <Tabs
          onChange={(nextTab) => {
            onTabChange(nextTab)
            writeSearchParams({ tab: nextTab === 'travelers' ? null : nextTab })
          }}
          options={[
            { id: 'travelers', label: t('workspace.team.tabs.travelers') },
            { id: 'groups', label: t('workspace.team.tabs.groups') },
            { id: 'preparation', label: t('workspace.team.tabs.preparation') },
            { id: 'activity', label: t('workspace.team.tabs.activity') },
          ]}
          value={tab}
          variant="segmented"
        />
        <span className="hidden text-[11px] text-muted sm:block">
          {t('workspace.team.memberCount', { count: data.members.length })}
        </span>
      </div>
      {showPreparationSummary ? (
        <section className="travel-surface p-3 xl:hidden">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 font-bold text-[12px]">
              <ChecklistAlt className="text-olive" size={15} />
              {t('workspace.team.preparationTitle')}
            </span>
            <strong className="text-[12px] text-olive">{preparationProgress}%</strong>
          </div>
          <ProgressBar value={preparationProgress} />
        </section>
      ) : null}
      <div
        className={`grid min-w-0 gap-4 ${tab === 'groups' || !showPreparationSummary ? '' : 'xl:grid-cols-[minmax(0,1fr)_300px]'}`}
      >
        <div className="min-w-0">
          {tab === 'travelers' ? (
            <div className="grid gap-3">
              <MemberRows data={data} onSelect={onSelectMember} />
              {!hasTravelCompanions ? (
                <EmptyState
                  action={
                    <Button icon={<Plus size={15} />} onClick={onInvite} variant="action">
                      {t('workspace.team.invite')}
                    </Button>
                  }
                  className="min-h-48"
                  description={t('workspace.team.emptyState.travelersHint')}
                  eyebrow={t('workspace.team.emptyState.eyebrow')}
                  icon={<Users size={21} />}
                  secondaryAction={
                    <Button
                      icon={<Search size={15} />}
                      onClick={() => {
                        onTabChange('groups')
                        writeSearchParams({ tab: 'groups' })
                      }}
                      variant="outline"
                    >
                      {t('workspace.team.emptyState.findCompanions')}
                    </Button>
                  }
                  size="page"
                  title={t('workspace.team.emptyState.travelersTitle')}
                />
              ) : null}
              {communityCandidates.length || hasTravelCompanions ? (
                <section className="travel-surface p-3.5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-xl bg-sage text-olive">
                      <Users size={16} />
                    </span>
                    <div>
                      <strong className="block text-[13px]">
                        {t('workspace.team.spaceMembers')}
                      </strong>
                      <span className="text-[11px] text-muted">
                        {t('workspace.team.spaceMembersHint')}
                      </span>
                    </div>
                  </div>
                  {communityCandidates.length ? (
                    <div className="flex flex-wrap gap-2">
                      {communityCandidates.map((member) => (
                        <Button
                          icon={<Plus size={14} />}
                          key={member.userId}
                          onClick={() => onInviteCommunityMember(member)}
                          size="sm"
                          variant="outline"
                        >
                          {member.displayName}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted">
                      {t('workspace.team.allSpaceMembersAdded')}
                    </p>
                  )}
                </section>
              ) : null}
            </div>
          ) : null}
          {tab === 'preparation' ? (
            <PreparationRows
              data={data}
              onAddBag={onAddBag}
              onAddItem={onAddItem}
              onDeleteBag={onDeleteBag}
              onDeleteItem={onDeleteItem}
              onToggle={onTogglePacked}
              onUpdateItem={onUpdateItem}
              onUpdateBag={onUpdateBag}
            />
          ) : null}
          {tab === 'activity' ? <ActivityRows data={data} tripId={tripId} /> : null}
          {tab === 'groups' ? (
            <Suspense
              fallback={
                <section
                  aria-busy="true"
                  className="travel-surface grid min-h-52 place-items-center text-[12px] text-muted"
                >
                  {t('common.loading')}
                </section>
              }
            >
              <CommunityGroupsPanel members={data.members} trip={trip} />
            </Suspense>
          ) : null}
        </div>
        {showPreparationSummary ? <TeamPulse data={data} /> : null}
      </div>
    </div>
  )
}

function LinkedDocuments({
  documents,
  kinds,
  onAdd,
  onRemove,
}: {
  documents: TravelDocument[]
  kinds: TravelDocumentKind[]
  onAdd: (kind: TravelDocumentKind, file: File) => void
  onRemove: (documentId: string) => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const [kind, setKind] = useState<TravelDocumentKind>(kinds[0] ?? 'other')
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    onAdd(kind, file)
    event.target.value = ''
  }
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-bold text-[12px] text-muted">{t('documents.title')}</div>
        <span className="text-[10px] text-muted">
          {t('documents.count', { count: documents.length })}
        </span>
      </div>
      <div className="grid gap-2">
        {documents.map((document) => (
          <div
            className="flex min-h-11 items-center gap-2 rounded-[13px] bg-paper/70 px-3"
            key={document.id}
          >
            <Paperclip className="shrink-0 text-olive" size={15} />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[11px]">{document.name}</strong>
              <span className="text-[9px] text-muted">{t(`documents.kind.${document.kind}`)}</span>
            </span>
            <IconButton
              className="size-7 rounded-lg bg-transparent shadow-none"
              label={t('documents.remove')}
              onClick={() => onRemove(document.id)}
            >
              <X size={13} />
            </IconButton>
          </div>
        ))}
        {!documents.length ? (
          <EmptyState
            description={t('documents.emptyHint')}
            icon={<Paperclip size={17} />}
            size="compact"
            title={t('documents.emptyTitle')}
          />
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <select
          className="h-10 min-w-0 rounded-[12px] border border-line bg-white px-2.5 font-bold text-[11px] outline-none"
          aria-label={t('documents.type')}
          onChange={(event) => setKind(event.target.value as TravelDocumentKind)}
          value={kind}
        >
          {kinds.map((item) => (
            <option key={item} value={item}>
              {t(`documents.kind.${item}`)}
            </option>
          ))}
        </select>
        <input
          accept="image/*,.pdf"
          className="sr-only"
          id={inputId}
          onChange={upload}
          type="file"
        />
        <label
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] bg-olive px-3 font-bold text-[11px] text-white"
          htmlFor={inputId}
        >
          <DocumentUpload2 size={14} />
          {t('documents.add')}
        </label>
      </div>
    </section>
  )
}

function JourneyDetail({
  item,
  members,
  places,
  onClose,
  onDelete,
  documents,
  onAddDocument,
  onRemoveDocument,
  onSave,
  tripId,
}: {
  item: TimelineItem
  members: TravelMember[]
  places: ManagedTripData['places']
  onClose: () => void
  onDelete: () => void
  documents: TravelDocument[]
  onAddDocument: (kind: TravelDocumentKind, file: File) => void
  onRemoveDocument: (documentId: string) => void
  onSave: (patch: Partial<TimelineItem>) => void
  tripId: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [kind, setKind] = useState(item.kind)
  const [time, setTime] = useState(item.time)
  const [place, setPlace] = useState(item.place)
  const [placeId, setPlaceId] = useState(item.placeId)
  const [placeServerId, setPlaceServerId] = useState(item.placeServerId)
  const [cost, setCost] = useState(String(item.cost))
  const [notes, setNotes] = useState(item.notes)
  const [participantIds, setParticipantIds] = useState(item.participantIds)
  const Icon = journeyIcons[item.kind]
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    onSave({
      cost: Number(cost) || 0,
      kind,
      notes,
      participantIds,
      place,
      placeId,
      placeServerId,
      time: String(formData.get('journeyTime') || time || '09:00'),
      title,
    })
    setEditing(false)
  }
  return (
    <Sheet className="sm:w-[410px]" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <span
          aria-label={t(`workspace.journey.category.${item.kind}`)}
          className={cn(
            'grid size-11 place-items-center rounded-[15px]',
            journeyIconTone[item.kind],
          )}
          title={t(`workspace.journey.category.${item.kind}`)}
        >
          <Icon size={20} />
        </span>
        <div className="flex gap-1">
          <ContextCollaboration
            compact
            subjectId={item.id}
            subjectType="assignment"
            title={t('contextCollaboration.itemTitle', { title: item.title })}
            tripId={tripId}
          />
          <IconButton
            active={editing}
            label={t('actions.edit')}
            onClick={() => setEditing((value) => !value)}
          >
            <Edit2 size={17} />
          </IconButton>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
      </div>
      {editing ? (
        <form className="mt-5 grid gap-3" onSubmit={save}>
          <TextInput
            aria-label={t('workspace.journey.edit.title')}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <JourneyKindPicker onChange={setKind} value={kind} />
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <TextInput
              aria-label={t('workspace.journey.edit.time')}
              name="journeyTime"
              onChange={(event) => setTime(event.target.value)}
              type="time"
              value={time}
            />
            <PlacePickerInput
              label={t('workspace.journey.edit.place')}
              onChange={(nextPlace) => {
                setPlace(nextPlace.title)
                setPlaceId(nextPlace.id)
                setPlaceServerId(nextPlace.serverId)
              }}
              places={places}
              selectedId={placeId}
              tripId={tripId}
            />
          </div>
          <TextInput
            aria-label={t('workspace.journey.edit.cost')}
            min="0"
            onChange={(event) => setCost(event.target.value)}
            step="0.01"
            type="number"
            value={cost}
          />
          <label className="grid gap-1.5">
            <span className="font-bold text-[11px] text-muted">{t('workspace.common.notes')}</span>
            <textarea
              className="min-h-28 resize-none rounded-[14px] border border-line bg-white px-3 py-2 text-[13px] outline-none transition focus:border-olive"
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>
          <MemberAssignment
            label={t('workspace.assignment.travelers')}
            members={members}
            onChange={setParticipantIds}
            selectedIds={participantIds}
          />
          <Button className="mt-2 w-full" size="lg" type="submit" variant="action">
            {t('actions.saveChanges')}
          </Button>
        </form>
      ) : (
        <>
          <div className="mt-4">
            <div className="text-[11px] text-muted">
              {item.time} · {item.place}
            </div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">{item.title}</h2>
          </div>
          <div className="mt-5 grid gap-1 rounded-[18px] bg-paper/70 p-2 text-[12px]">
            <div className="flex min-h-11 items-center justify-between gap-3 px-2">
              <span className="text-muted">{t('workspace.common.status')}</span>
              <StatusBadge
                tone={
                  item.status === 'pending'
                    ? 'warning'
                    : item.status === 'planned'
                      ? 'neutral'
                      : 'success'
                }
              >
                {t(`workspace.journey.status.${item.status}`)}
              </StatusBadge>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-[12px] px-2">
              <span className="text-muted">{t('workspace.common.travelers')}</span>
              <span className="flex items-center gap-2">
                <span className="font-bold text-[10px] text-muted">
                  {t('workspace.assignment.selected', { count: item.participantIds.length })}
                </span>
                <AvatarGroup items={avatarPeople(members, item.participantIds)} />
              </span>
            </div>
            <button
              className="flex min-h-11 items-center justify-between gap-3 rounded-[12px] px-2 text-left transition hover:bg-white disabled:pointer-events-none"
              disabled={!item.expenseId}
              onClick={() =>
                item.expenseId &&
                void navigate({ to: '/expenses', search: { expense: item.expenseId } })
              }
              type="button"
            >
              <span className="text-muted">{t('workspace.common.cost')}</span>
              <strong>
                <Money amount={item.cost} currency={item.currency} />
              </strong>
            </button>
          </div>
          <div className="mt-5">
            <div className="font-bold text-[12px] text-muted">{t('workspace.common.notes')}</div>
            <p className="text-[13px] leading-6">{item.notes}</p>
          </div>
          <LinkedDocuments
            documents={documents}
            kinds={
              item.source === 'transport'
                ? ['ticket', 'booking', 'other']
                : ['booking', 'ticket', 'receipt', 'other']
            }
            onAdd={onAddDocument}
            onRemove={onRemoveDocument}
          />
          <Button
            className="mt-5 w-full"
            disabled={!item.placeId}
            icon={<Map size={17} />}
            onClick={() =>
              item.placeId &&
              void navigate({ to: '/map', search: { place: item.placeId, route: 1 } })
            }
            size="lg"
            variant="action"
          >
            {t('workspace.journey.startNavigation')}
          </Button>
          <Button className="mt-2 w-full" onClick={onDelete} variant="danger">
            {t('actions.delete')}
          </Button>
        </>
      )}
    </Sheet>
  )
}

function ExpenseDetail({
  data,
  expense,
  onClose,
  onDelete,
  documents,
  onAddDocument,
  onRemoveDocument,
  onMarkPaid,
  onSave,
  tripId,
}: {
  data: ManagedTripData
  expense: ExpenseRecord
  onClose: () => void
  onDelete: () => void
  documents: TravelDocument[]
  onAddDocument: (kind: TravelDocumentKind, file: File) => void
  onRemoveDocument: (documentId: string) => void
  onMarkPaid: (memberId: string) => void
  onSave: (patch: Partial<ExpenseRecord>) => void
  tripId: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(expense.title)
  const [amount, setAmount] = useState(String(expense.amount))
  const [note, setNote] = useState(expense.note)
  const [placeId, setPlaceId] = useState(expense.placeId)
  const [placeServerId, setPlaceServerId] = useState(expense.placeServerId)
  const [participantIds, setParticipantIds] = useState(expense.participantIds)
  const [paidByMemberId, setPaidByMemberId] = useState(expense.paidByMemberId)
  const payer = memberById(data.members, expense.paidByMemberId)
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({
      amount: Number(amount) || 0,
      note,
      paidByMemberId,
      participantIds,
      placeId,
      placeServerId,
      title,
    })
    setEditing(false)
  }
  return (
    <Sheet className="sm:w-[410px]" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-[15px] bg-paper text-olive">
          <Receipt size={20} />
        </span>
        <div className="flex gap-1">
          <ContextCollaboration
            compact
            subjectId={expense.id}
            subjectType="expense"
            title={t('contextCollaboration.expenseTitle', { title: expense.title })}
            tripId={tripId}
          />
          <IconButton
            active={editing}
            label={t('actions.edit')}
            onClick={() => setEditing((value) => !value)}
          >
            <Edit2 size={17} />
          </IconButton>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
      </div>
      {editing ? (
        <form className="mt-5 grid gap-3" onSubmit={save}>
          <TextInput
            aria-label={t('workspace.finance.edit.title')}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <TextInput
            aria-label={t('workspace.finance.edit.amount')}
            min="0"
            onChange={(event) => setAmount(event.target.value)}
            step="0.01"
            type="number"
            value={amount}
          />
          <PlacePickerInput
            label={t('workspace.journey.edit.place')}
            onChange={(place) => {
              setPlaceId(place.id)
              setPlaceServerId(place.serverId)
            }}
            places={data.places}
            selectedId={placeId}
            tripId={tripId}
          />
          <label className="grid gap-1.5">
            <span className="font-bold text-[11px] text-muted">
              {t('workspace.assignment.payer')}
            </span>
            <select
              className="h-11 rounded-[14px] border border-line bg-white px-3 text-[12px] outline-none focus:border-olive"
              onChange={(event) => setPaidByMemberId(event.target.value)}
              value={paidByMemberId}
            >
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <MemberAssignment
            label={t('workspace.assignment.sharedBy')}
            members={data.members}
            onChange={setParticipantIds}
            selectedIds={participantIds}
          />
          <label className="grid gap-1.5">
            <span className="font-bold text-[11px] text-muted">{t('workspace.common.notes')}</span>
            <textarea
              className="min-h-28 resize-none rounded-[14px] border border-line bg-white px-3 py-2 text-[13px] outline-none transition focus:border-olive"
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </label>
          <Button className="mt-2 w-full" size="lg" type="submit" variant="action">
            {t('actions.saveChanges')}
          </Button>
        </form>
      ) : (
        <>
          <div className="mt-4">
            <div className="text-[11px] text-muted">
              {expense.dateLabel} · {placeName(data, expense.placeId, t)}
            </div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {expenseTitle(expense, t)}
            </h2>
            <div className="mt-2 font-extrabold text-[24px]">
              <Money amount={expense.amount} currency={expense.currency} />
            </div>
          </div>
          <div className="mt-5 flex w-full items-center gap-3 rounded-[18px] bg-paper/70 p-4 text-left text-[12px]">
            {payer ? (
              <UserAvatar
                person={{ color: payer.avatarColor, id: payer.id, name: payer.displayName }}
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] text-muted">{t('workspace.finance.paidBy')}</span>
              <strong>{payer?.displayName}</strong>
            </span>
            <Users className="text-muted" size={17} />
          </div>
          <div className="mt-5">
            <div className="mb-2 font-bold text-[12px] text-muted">
              {t('workspace.finance.markPaid')}
            </div>
            <div className="grid gap-2">
              {expense.participantIds.map((memberId) => {
                const member = memberById(data.members, memberId)
                const paid = expense.paidMemberIds.includes(memberId)
                if (!member) return null
                return (
                  <button
                    className="flex h-11 items-center gap-2 rounded-[14px] bg-paper/70 px-3 text-left"
                    key={memberId}
                    onClick={() => onMarkPaid(memberId)}
                    type="button"
                  >
                    <UserAvatar
                      person={{
                        color: member.avatarColor,
                        id: member.id,
                        name: member.displayName,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate font-bold text-[12px]">
                      {member.displayName}
                    </span>
                    <CheckCircle className={paid ? 'text-olive' : 'text-muted/30'} size={17} />
                  </button>
                )
              })}
            </div>
          </div>
          <LinkedDocuments
            documents={documents}
            kinds={['receipt', 'invoice', 'booking', 'other']}
            onAdd={onAddDocument}
            onRemove={onRemoveDocument}
          />
          <Button
            className="mt-4 w-full"
            onClick={() => void navigate({ to: '/map', search: { place: expense.placeId } })}
            variant="outline"
          >
            {t('workspace.finance.openPlace')}
          </Button>
          <Button className="mt-2 w-full" onClick={onDelete} variant="danger">
            {t('actions.delete')}
          </Button>
        </>
      )}
    </Sheet>
  )
}

function MemberDetail({
  canRemove,
  data,
  member,
  onClose,
  onRemove,
  onSave,
}: {
  canRemove: boolean
  data: ManagedTripData
  member: TravelMember
  onClose: () => void
  onRemove: () => Promise<unknown>
  onSave: (patch: { displayName: string; role: TravelMember['role'] }) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [displayName, setDisplayName] = useState(member.displayName)
  const [role, setRole] = useState(member.role)
  const reservations = data.reservations.filter((item) => item.participantIds.includes(member.id))
  const expenses = data.expenses.filter((item) => item.participantIds.includes(member.id))
  const packingItems = data.packingItems.filter((item) => item.ownerId === member.id)
  const share = expenses.reduce(
    (total, expense) => total + expense.amount / Math.max(1, expense.participantIds.length),
    0,
  )
  return (
    <Sheet className="sm:w-[410px]" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <UserAvatar
          person={{
            avatarUrl: member.avatarUrl,
            color: member.avatarColor,
            id: member.id,
            name: member.displayName,
          }}
          size="md"
        />
        <span className="flex items-center gap-1">
          <IconButton
            active={editing}
            label={t('workspace.team.memberDetail.edit')}
            onClick={() => {
              setEditing((value) => !value)
              setSaveError(false)
            }}
          >
            <Edit2 size={16} />
          </IconButton>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </span>
      </div>
      {editing ? (
        <form
          className="mt-4 grid gap-2 rounded-[18px] bg-paper/70 p-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!displayName.trim()) return
            setSaving(true)
            setSaveError(false)
            try {
              await onSave({ displayName: displayName.trim(), role })
              setEditing(false)
            } catch {
              setSaveError(true)
            } finally {
              setSaving(false)
            }
          }}
        >
          <TextInput
            aria-label={t('workspace.team.memberDetail.name')}
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
          <label className="grid gap-1 text-[11px] font-bold text-muted">
            {t('workspace.team.memberDetail.role')}
            <select
              className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] text-ink"
              disabled={member.role === 'owner'}
              onChange={(event) => setRole(event.target.value as TravelMember['role'])}
              value={role}
            >
              {(['planner', 'traveler', 'viewer'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`management.roles.${value}`)}
                </option>
              ))}
              {member.role === 'owner' ? (
                <option value="owner">{t('management.roles.owner')}</option>
              ) : null}
            </select>
          </label>
          {saveError ? (
            <span className="text-[10px] font-bold text-coral" role="alert">
              {t('workspace.team.memberDetail.saveError')}
            </span>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setEditing(false)} type="button" variant="outline">
              {t('actions.cancel')}
            </Button>
            <Button disabled={!displayName.trim() || saving} type="submit" variant="action">
              {saving ? t('workspace.team.memberDetail.saving') : t('actions.saveChanges')}
            </Button>
          </div>
        </form>
      ) : null}
      <div className="mt-4">
        <div className="text-[11px] text-muted">{t(`management.roles.${member.role}`)}</div>
        <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">{member.displayName}</h2>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-[15px] bg-paper/70 p-3">
          <span className="block text-[10px] text-muted">
            {t('workspace.team.memberDetail.plans')}
          </span>
          <strong className="mt-1 block text-[18px]">{reservations.length}</strong>
        </div>
        <div className="rounded-[15px] bg-paper/70 p-3">
          <span className="block text-[10px] text-muted">
            {t('workspace.team.memberDetail.share')}
          </span>
          <strong className="mt-1 block text-[13px]">
            <Money amount={share} currency="EUR" />
          </strong>
        </div>
        <div className="rounded-[15px] bg-paper/70 p-3">
          <span className="block text-[10px] text-muted">
            {t('workspace.team.memberDetail.tasks')}
          </span>
          <strong className="mt-1 block text-[18px]">{packingItems.length}</strong>
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        {reservations.slice(0, 3).map((reservation) => (
          <button
            className="flex min-h-12 items-center gap-3 rounded-[14px] bg-paper/70 px-3 text-left"
            key={reservation.id}
            onClick={() => void navigate({ to: '/trips', search: { item: reservation.id } })}
            type="button"
          >
            <CalendarCheck className="text-olive" size={17} />
            <span className="min-w-0 flex-1 truncate font-bold text-[12px]">
              {reservation.title}
            </span>
            <span className="text-[10px] text-muted">{timeFromLabel(reservation.startLabel)}</span>
          </button>
        ))}
      </div>
      {expenses[0] ? (
        <Button
          className="mt-4 w-full"
          icon={<Receipt size={16} />}
          onClick={() => void navigate({ to: '/expenses', search: { expense: expenses[0]?.id } })}
          variant="outline"
        >
          {t('workspace.team.memberDetail.openExpenses')}
        </Button>
      ) : null}
      {canRemove && !confirmingRemoval ? (
        <Button
          className="mt-3 w-full"
          onClick={() => {
            setConfirmingRemoval(true)
            setRemoveError(false)
          }}
          variant="danger"
        >
          {t('workspace.team.memberDetail.remove')}
        </Button>
      ) : null}
      {canRemove && confirmingRemoval ? (
        <section className="mt-4 rounded-[18px] bg-coral/8 p-4" aria-live="polite">
          <strong className="block text-[13px] text-coral">
            {t('workspace.team.memberDetail.removeConfirmTitle', {
              name: member.displayName,
            })}
          </strong>
          <p className="mt-1 mb-0 text-[11px] leading-5 text-muted">
            {t('workspace.team.memberDetail.removeConfirmBody')}
          </p>
          {removeError ? (
            <p className="mt-2 mb-0 text-[11px] font-bold text-coral" role="alert">
              {t('workspace.team.memberDetail.removeError')}
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              disabled={removing}
              onClick={() => setConfirmingRemoval(false)}
              variant="outline"
            >
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={removing}
              onClick={async () => {
                setRemoving(true)
                setRemoveError(false)
                try {
                  await onRemove()
                } catch {
                  setRemoving(false)
                  setRemoveError(true)
                }
              }}
              variant="danger"
            >
              {removing
                ? t('workspace.team.memberDetail.removing')
                : t('workspace.team.memberDetail.removeAction')}
            </Button>
          </div>
        </section>
      ) : null}
    </Sheet>
  )
}

const sectionConfig: Record<WorkspaceSection, { actionKey: string; icon: IconComponent }> = {
  finance: { actionKey: 'workspace.finance.add', icon: Receipt },
  journey: { actionKey: 'workspace.journey.add', icon: CalendarAdd },
  team: { actionKey: 'workspace.team.invite', icon: Users },
}

function UnifiedWorkspacePage({ section }: { section: WorkspaceSection }) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const management = useTripManagement()
  const workspace = useTravelWorkspace()
  const activeDay = useTravelDay()
  const linkedDocuments = useTravelDocuments(workspace.currentTrip?.id)
  const travelReports = useTravelReports(workspace.currentTrip?.id, 'affected')
  const { message, showNotice } = useActionNotice()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [selectedJourneyItem, setSelectedJourneyItem] = useState<TimelineItem | null>(null)
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [activeTeamTab, setActiveTeamTab] = useState<TeamTab>(() => initialTeamTab(pathname))
  const config = sectionConfig[section]
  const ActionIcon = config.icon
  const syncStatus = combineTravelSyncStatus([
    management.syncStatus,
    linkedDocuments.syncStatus,
    travelReports.syncStatus,
  ])

  useEffect(() => {
    if (!management.data) return
    const params = new URLSearchParams(window.location.search)
    if (section === 'finance') {
      const expenseId = params.get('expense')
      if (expenseId && management.data.expenses.some((expense) => expense.id === expenseId)) {
        setSelectedExpenseId(expenseId)
      }
    }
    if (section === 'team') {
      const memberId = params.get('member')
      if (memberId && management.data.members.some((member) => member.id === memberId)) {
        setSelectedMemberId(memberId)
      }
    }
    if (section === 'journey') {
      if (params.get('add') === '1') {
        setQuickAddOpen(true)
        writeSearchParams({ add: null })
      }
      const itemId = params.get('item')
      if (!itemId) return
      const item = [1, 2, 3, 4]
        .flatMap((day) => buildTimelineItems(management.data as ManagedTripData, day, [], t))
        .find((candidate) => candidate.id === itemId)
      if (item) setSelectedJourneyItem(item)
    }
  }, [management.data, section, t])

  if (management.isLoading || !management.data) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4 xl:p-5">
        <WorkspaceLoading loading>{t('management.loading')}</WorkspaceLoading>
      </div>
    )
  }

  if (management.isError) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4 xl:p-5">
        <WorkspaceLoading>
          <div>{t('management.error')}</div>
          <Button className="mt-4" onClick={() => void management.refetch()} variant="outline">
            {t('actions.retry')}
          </Button>
        </WorkspaceLoading>
      </div>
    )
  }

  const data: ManagedTripData = management.data
  const customItems = (management.data.journeyItems ?? []) as TimelineItem[]
  const expenses = data.expenses
  const primaryActionIsInEmptyState =
    (section === 'journey' && buildTimelineItems(data, activeDay, customItems, t).length === 0) ||
    (section === 'finance' && expenses.length === 0) ||
    (section === 'team' && activeTeamTab === 'travelers' && data.members.length <= 1)
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId) ?? null
  const selectedMember = data.members.find((member) => member.id === selectedMemberId) ?? null
  const openPrimaryAction = () => {
    setQuickAddOpen(true)
  }
  const addItem = async (input: QuickAddInput) => {
    const selectedPlace = input.place ?? data.places.find((place) => place.id === input.placeId)
    if (section === 'journey') {
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
      showNotice(t('workspace.notices.arrangementAdded', { count: activeDay }))
    }
    if (section === 'finance') {
      await management.addExpense({
        amount: input.amount ?? 0,
        category: 'food',
        currency: workspace.currentTrip?.currency ?? 'EUR',
        dateLabel: `Day ${activeDay}`,
        id: '',
        note: t('workspace.finance.customNote'),
        paidByMemberId:
          data.members.find((member) => member.current)?.id ?? data.members[0]?.id ?? '',
        paidMemberIds: [],
        participantIds: input.participantIds,
        placeId: selectedPlace?.id ?? data.places[0]?.id ?? '',
        placeServerId: selectedPlace?.serverId,
        title: input.title,
      })
      showNotice(t('workspace.notices.expenseAdded'))
    }
    if (section === 'team') {
      await management.addMember(input.title)
      showNotice(t('workspace.notices.inviteReady'))
    }
  }

  return (
    <>
      <TravelShellTopAction>
        <span className="hidden items-center gap-2 xl:inline-flex">
          <SyncStatus status={syncStatus} />
          {!primaryActionIsInEmptyState &&
          section !== 'journey' &&
          (section !== 'team' || activeTeamTab === 'travelers') ? (
            <Button icon={<ActionIcon size={16} />} onClick={openPrimaryAction} variant="action">
              {t(config.actionKey)}
            </Button>
          ) : null}
        </span>
      </TravelShellTopAction>
      <div className="min-h-0 flex-1 overflow-auto p-3 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-4 xl:overflow-hidden xl:p-5">
        <div className="mb-2 flex justify-end xl:hidden">
          <SyncStatus status={syncStatus} />
        </div>
        {section === 'journey' ? (
          <JourneyWorkspace
            customItems={customItems}
            data={data}
            onAdd={openPrimaryAction}
            onSelect={(item) => {
              setSelectedJourneyItem(item)
              writeSearchParams({ item: item.id })
            }}
            reports={travelReports.reports}
            trip={workspace.currentTrip}
            tripId={management.tripId!}
          />
        ) : null}
        {section === 'finance' ? (
          <FinanceWorkspace
            currency={workspace.currentTrip?.currency ?? 'EUR'}
            data={data}
            documents={linkedDocuments.documents}
            expenses={expenses}
            onAdd={openPrimaryAction}
            tripId={workspace.currentTrip?.id}
            onSelect={(expense) => {
              setSelectedExpenseId(expense.id)
              writeSearchParams({ expense: expense.id })
            }}
          />
        ) : null}
        {section === 'team' ? (
          <TeamWorkspace
            activeTab={activeTeamTab}
            communityMembers={workspace.members}
            data={data}
            tripId={management.tripId!}
            trip={workspace.currentTrip}
            onAddBag={management.addPackingBag}
            onAddItem={management.addPackingItem}
            onDeleteBag={management.deletePackingBag}
            onDeleteItem={management.deletePackingItem}
            onSelectMember={(member) => {
              setSelectedMemberId(member.id)
              writeSearchParams({ member: member.id })
            }}
            onInvite={openPrimaryAction}
            onInviteCommunityMember={(member) => {
              management.addCommunityMember({
                avatarUrl: member.avatarUrl,
                displayName: member.displayName,
                userId: member.userId,
              })
              showNotice(t('workspace.notices.memberAdded', { name: member.displayName }))
            }}
            onTogglePacked={management.togglePacked}
            onTabChange={setActiveTeamTab}
            onUpdateItem={management.updatePackingItem}
            onUpdateBag={management.updatePackingBag}
          />
        ) : null}
      </div>
      {!primaryActionIsInEmptyState && (section !== 'team' || activeTeamTab === 'travelers') ? (
        <FloatingActionButton
          className="xl:hidden"
          icon={<ActionIcon size={17} />}
          label={t(config.actionKey)}
          onClick={openPrimaryAction}
        />
      ) : null}
      {selectedJourneyItem ? (
        <JourneyDetail
          documents={linkedDocuments.documents.filter(
            (document) =>
              document.subjectType === 'journey' && document.subjectId === selectedJourneyItem.id,
          )}
          item={selectedJourneyItem}
          members={data.members}
          places={data.places}
          onClose={() => {
            setSelectedJourneyItem(null)
            writeSearchParams({ item: null })
          }}
          onDelete={() => {
            const itemId = selectedJourneyItem.id
            setSelectedJourneyItem(null)
            writeSearchParams({ item: null })
            void management
              .deleteTimelineItem(itemId)
              .then(() => showNotice(t('workspace.notices.arrangementDeleted')))
              .catch(() => showNotice(t('workspace.notices.arrangementDeleteFailed')))
          }}
          onAddDocument={(kind, file) =>
            linkedDocuments.addDocument('journey', selectedJourneyItem.id, kind, file)
          }
          onRemoveDocument={linkedDocuments.removeDocument}
          onSave={(patch) => {
            management.updateTimelineItem({ ...selectedJourneyItem, ...patch })
            setSelectedJourneyItem((item) => (item ? { ...item, ...patch } : item))
            showNotice(t('workspace.notices.arrangementUpdated'))
          }}
          tripId={management.tripId!}
        />
      ) : null}
      {selectedExpense ? (
        <ExpenseDetail
          data={{ ...data, expenses }}
          documents={linkedDocuments.documents.filter(
            (document) =>
              document.subjectType === 'expense' && document.subjectId === selectedExpense.id,
          )}
          expense={selectedExpense}
          onClose={() => {
            setSelectedExpenseId(null)
            writeSearchParams({ expense: null })
          }}
          onDelete={() => {
            management.deleteExpense(selectedExpense.serverId ?? selectedExpense.id)
            setSelectedExpenseId(null)
            writeSearchParams({ expense: null })
            showNotice(t('workspace.notices.expenseDeleted'))
          }}
          onAddDocument={(kind, file) =>
            linkedDocuments.addDocument('expense', selectedExpense.id, kind, file)
          }
          onRemoveDocument={linkedDocuments.removeDocument}
          onMarkPaid={(memberId) => {
            management.markExpensePaid(selectedExpense.id, memberId)
          }}
          onSave={(patch) => {
            management.updateExpense({ ...selectedExpense, ...patch })
            showNotice(t('workspace.notices.expenseUpdated'))
          }}
          tripId={management.tripId!}
        />
      ) : null}
      {selectedMember ? (
        <MemberDetail
          canRemove={!selectedMember.current && selectedMember.role !== 'owner'}
          data={{ ...data, expenses }}
          member={selectedMember}
          onClose={() => {
            setSelectedMemberId(null)
            writeSearchParams({ member: null })
          }}
          onRemove={async () => {
            await management.removeMember(selectedMember.id)
            setSelectedMemberId(null)
            writeSearchParams({ member: null })
            showNotice(t('workspace.notices.memberRemoved', { name: selectedMember.displayName }))
          }}
          onSave={async (patch) => {
            await management.updateMember(selectedMember.id, patch)
            showNotice(t('workspace.notices.memberUpdated', { name: patch.displayName }))
          }}
        />
      ) : null}
      {quickAddOpen ? (
        <QuickAddSheet
          activeDay={activeDay}
          members={data.members}
          onClose={() => setQuickAddOpen(false)}
          onSubmit={addItem}
          places={data.places}
          section={section}
          tripId={management.tripId!}
        />
      ) : null}
      <ActionToast message={message} />
    </>
  )
}

export function JourneyPage() {
  return <UnifiedWorkspacePage section="journey" />
}

export function FinancePage() {
  return <UnifiedWorkspacePage section="finance" />
}

export function TeamPage() {
  return <UnifiedWorkspacePage section="team" />
}
