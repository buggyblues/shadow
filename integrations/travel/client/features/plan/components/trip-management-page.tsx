import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionBar } from '../../../components/action-bar.js'
import { AttachmentList } from '../../../components/attachment-list.js'
import { AvatarGroup, UserAvatar } from '../../../components/avatar-group.js'
import { Button, FloatingActionButton } from '../../../components/button.js'
import { DataTable } from '../../../components/data-table.js'
import { EmptyState } from '../../../components/empty-state.js'
import { IconBadge } from '../../../components/icon-badge.js'
import {
  ArrowRight,
  BagShopping,
  Bed,
  Bolt,
  Briefcase,
  Building,
  Bulb,
  Bus,
  CalendarCheck,
  CalendarDate,
  CheckCircle,
  ChecklistAlt,
  ChevronDown,
  CircleInfo,
  Clock,
  CloudRain,
  DocumentUpload2,
  Droplet,
  Edit2,
  Filter,
  Flag,
  ForkKnife,
  Gear,
  Globe,
  type IconComponent,
  Link2,
  LocationAlt,
  Lock,
  MapPoint,
  Minus,
  MoreH,
  Paperclip,
  Pin,
  Plus,
  Qr,
  Receipt,
  Route,
  Ruler,
  Search,
  Share,
  Tag,
  Ticket,
  Tram,
  Umbrella,
  Users,
  Wallet,
  X,
} from '../../../components/icons.js'
import { InfoRow } from '../../../components/info-row.js'
import { LinkedSourceChip } from '../../../components/linked-source-chip.js'
import { LocationPill } from '../../../components/location-pill.js'
import { MetricCard } from '../../../components/metric-card.js'
import { Money } from '../../../components/money.js'
import { MoneySummary } from '../../../components/money-summary.js'
import { Panel, Surface } from '../../../components/panel.js'
import { PanelHeader } from '../../../components/panel-header.js'
import { ParticipantPicker } from '../../../components/participant-picker.js'
import { ProgressBar, ProgressRing } from '../../../components/progress.js'
import { ResponsibilityCard } from '../../../components/responsibility-card.js'
import { NativeSelect, type SelectOption } from '../../../components/select.js'
import { Sheet } from '../../../components/sheet.js'
import { SplitSummary } from '../../../components/split-summary.js'
import { StatusBadge } from '../../../components/status-badge.js'
import { Switch } from '../../../components/switch.js'
import { Tabs } from '../../../components/tabs.js'
import { Tag as UiTag } from '../../../components/tag.js'
import { Toolbar } from '../../../components/toolbar.js'
import { TravelMap } from '../../../components/travel-map.js'
import { type TravelNavId, TravelShell } from '../../../layouts/travel-shell.js'
import {
  type NavigationCoordinate,
  navigationModeFromTransportMode,
  planNavigationRoute,
} from '../../../services/navigation-gateway.js'
import { cn } from '../../../utils/class-names.js'
import type { Place } from '../api/places.js'
import type {
  BudgetCategoryRecord,
  ExpenseCategory,
  ExpenseRecord,
  PackingItemRecord,
  PackingVisibility,
  ReservationKind,
  ReservationRecord,
  SettlementTransfer,
  ShadowBootstrap,
  TransportMode,
  TransportSegment,
  TravelMember,
} from '../api/trip-management.js'
import { useTripManagement } from '../hooks/use-trip-management.js'

type ManagementSection = Exclude<TravelNavId, 'places' | 'trips'>

const transportIcons: Record<TransportMode, IconComponent> = {
  flight: Route,
  metro: Tram,
  taxi: Bus,
  train: Tram,
  walk: MapPoint,
}

const reservationIcons: Record<ReservationKind, IconComponent> = {
  activity: CalendarCheck,
  hotel: Bed,
  restaurant: ForkKnife,
  transport: Ticket,
}

const categoryAccent: Record<ExpenseCategory, string> = {
  activity: 'bg-[#f1e1f7] text-[#7a408f]',
  food: 'bg-[#ffe7df] text-[#aa4a35]',
  shopping: 'bg-[#e9eef9] text-[#415d90]',
  stay: 'bg-[#e6f2ee] text-[#3f7865]',
  transport: 'bg-[#e8eed8] text-olive',
}

const categoryIconMap: Record<ExpenseCategory, IconComponent> = {
  activity: Ticket,
  food: ForkKnife,
  shopping: BagShopping,
  stay: Bed,
  transport: Tram,
}

const categoryIconSurface: Record<ExpenseCategory, string> = {
  activity: 'bg-[#f1e1f7] text-[#7a408f]',
  food: 'bg-[#ffe7df] text-coral',
  shopping: 'bg-[#f6eadb] text-[#b26b39]',
  stay: 'bg-[#dff1ec] text-[#3f7865]',
  transport: 'bg-sage text-olive',
}

const visibilityIcons: Record<PackingVisibility, IconComponent> = {
  common: Globe,
  personal: Lock,
  shared: Share,
}

const transportModeSurface: Record<TransportMode, string> = {
  flight: 'bg-[#e9eef9] text-[#415d90]',
  metro: 'bg-sage text-olive',
  taxi: 'bg-[#ffe7df] text-coral',
  train: 'bg-[#e8f3f7] text-[#2f7d9a]',
  walk: 'bg-[#f6eadb] text-[#b26b39]',
}

const packingCategoryIconMap: Record<string, IconComponent> = {
  Bookings: Ticket,
  Clothes: Briefcase,
  Documents: DocumentUpload2,
  Electronics: Gear,
  Health: CheckCircle,
  Shared: Share,
  Toiletries: Droplet,
  Weather: Umbrella,
}

const packingCategoryToneMap: Record<string, string> = {
  Bookings: 'bg-[#f1e1f7] text-[#7a408f]',
  Clothes: 'bg-[#f6eadb] text-[#b26b39]',
  Documents: 'bg-sage text-olive',
  Electronics: 'bg-[#e9eef9] text-[#415d90]',
  Health: 'bg-[#dff1ec] text-[#3f7865]',
  Shared: 'bg-paper text-muted',
  Toiletries: 'bg-[#e6f2ee] text-[#3f7865]',
  Weather: 'bg-[#e8f3f7] text-[#2f7d9a]',
}

const packingCategoryWeightKg: Record<string, number> = {
  Bookings: 0.08,
  Clothes: 0.65,
  Documents: 0.18,
  Electronics: 0.52,
  Health: 0.22,
  Shared: 0.3,
  Toiletries: 0.42,
  Weather: 0.36,
}

type BudgetActionId = 'addCategory' | 'moveMoney' | 'exportBudget' | 'shareBudget'
type BudgetAlertId = 'foodRisk' | 'weeklySpend' | 'goodPace'
type ExpenseFilter = 'all' | 'needsSettlement' | 'paid' | 'reimbursed'
type ExpenseDayFilter = 'all' | 'day1' | 'day2'
type ExpensePayerFilter = 'all' | string
type ExpenseCategoryFilter = 'all' | ExpenseCategory
type PackingTabFilter = 'all' | 'mine' | 'shared' | 'unassigned'
type TransportStatusFilter = 'all' | TransportSegment['status']
type TransportExpenseState = 'recorded' | 'pending' | 'notStarted'
type TransportBudgetState = 'used' | 'reserved' | 'pending'
interface MapCoordinate {
  latitude: number
  longitude: number
}

function memberById(members: TravelMember[], id: string) {
  return members.find((member) => member.id === id)
}

function placeById(places: Place[], id: string | undefined) {
  return places.find((place) => place.id === id)
}

function placeCoordinate(place: Place | undefined): MapCoordinate | undefined {
  if (!place) return undefined
  return { latitude: place.latitude, longitude: place.longitude }
}

function midpointCoordinate(start: MapCoordinate, end: MapCoordinate): MapCoordinate {
  return {
    latitude: (start.latitude + end.latitude) / 2,
    longitude: (start.longitude + end.longitude) / 2,
  }
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function expenseIsPaid(expense: ExpenseRecord) {
  return expense.participantIds.every((memberId) => expense.paidMemberIds.includes(memberId))
}

function expenseShare(expense: ExpenseRecord) {
  return expense.amount / Math.max(1, expense.participantIds.length)
}

function expenseDayValue(expense: ExpenseRecord): ExpenseDayFilter {
  return expense.dateLabel === 'Day 1' ? 'day1' : 'day2'
}

function routeDayLabel(segment: TransportSegment) {
  return segment.departureLabel.split('·')[0]?.trim() || segment.departureLabel
}

function routeTimeLabel(segment: TransportSegment) {
  return segment.departureLabel.split('·')[1]?.trim() || segment.departureLabel
}

function reservationDayLabel(reservation: ReservationRecord) {
  return reservation.startLabel.split('·')[0]?.trim() || reservation.startLabel
}

function reservationTimeLabel(reservation: ReservationRecord) {
  return reservation.startLabel.split('·')[1]?.trim() || reservation.startLabel
}

function transportExpenseState(segment: TransportSegment): TransportExpenseState {
  if (segment.status === 'booked') return 'recorded'
  if (segment.status === 'watching') return 'notStarted'
  return 'pending'
}

function transportBudgetState(segment: TransportSegment): TransportBudgetState {
  if (segment.status === 'booked') return 'used'
  if (segment.status === 'watching') return 'pending'
  return 'reserved'
}

function transportOwnerId(segment: TransportSegment) {
  if (segment.id === 'route-airport-hotel') return 'member-lee'
  if (segment.id === 'route-louvre-dinner') return 'member-current'
  if (segment.id === 'route-versailles') return 'member-anna'
  return 'member-current'
}

function tripDayDateLabel(day: string) {
  if (day.includes('1')) return '4月24日'
  if (day.includes('4')) return '4月27日'
  return '4月25日'
}

function normalizedServiceLabel(label: string | undefined) {
  if (!label) return ''
  return label.replace('Metro ', '').replace('Taxi backup', 'Taxi 备选')
}

function formatNavigationDistance(
  distanceMeters: number,
  translate: (key: string, options?: Record<string, number>) => string,
) {
  if (distanceMeters >= 1000) {
    return translate('management.transport.routeKilometers', {
      value: Number((distanceMeters / 1000).toFixed(1)),
    })
  }
  return translate('management.transport.routeMeters', {
    value: Math.max(1, Math.round(distanceMeters)),
  })
}

function formatNavigationDuration(
  durationSeconds: number,
  translate: (key: string, options?: Record<string, number>) => string,
) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  if (minutes < 60) return translate('management.transport.routeMinutes', { count: minutes })
  return translate('management.transport.routeHours', {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  })
}

function packingCategoryIcon(category: string) {
  return packingCategoryIconMap[category] ?? ChecklistAlt
}

function packingCategoryTone(category: string) {
  return packingCategoryToneMap[category] ?? 'bg-paper text-muted'
}

function packingItemKey(item: PackingItemRecord) {
  return item.id.replaceAll('-', '_')
}

function packingItemTitle(
  item: PackingItemRecord,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  return t(`management.packing.item.${packingItemKey(item)}.title`, { defaultValue: item.name })
}

function packingItemReason(
  item: PackingItemRecord,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  return t(`management.packing.item.${packingItemKey(item)}.reason`, {
    defaultValue: item.category,
  })
}

function packingCategoryLabel(
  category: string,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  return t(`management.packing.category.${category}`, { defaultValue: category })
}

function packingItemWeightKg(item: PackingItemRecord, quantity = item.quantity) {
  const base = packingCategoryWeightKg[item.category] ?? 0.28
  return Math.round(base * quantity * 10) / 10
}

function weightProgress(weight: number, limit: number) {
  if (!limit) return 0
  return Math.min(100, Math.round((weight / limit) * 100))
}

function formatWeightKg(
  value: number,
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  const rounded = Math.round(value * 10) / 10
  return t('management.units.kilogramsShort', {
    value: rounded % 1 === 0 ? rounded : rounded.toFixed(1),
  })
}

function memberAvatarPerson(member: TravelMember) {
  return {
    avatarUrl: member.avatarUrl,
    color: member.avatarColor,
    id: member.id,
    name: member.displayName,
  }
}

function Avatar({ member, size = 'sm' }: { member: TravelMember; size?: 'sm' | 'md' }) {
  return <UserAvatar person={memberAvatarPerson(member)} size={size} />
}

function AvatarStack({
  ids,
  members,
  size = 'sm',
}: {
  ids: string[]
  members: TravelMember[]
  size?: 'sm' | 'md'
}) {
  const avatarItems = ids
    .map((memberId) => memberById(members, memberId))
    .filter(isDefined)
    .map(memberAvatarPerson)
  return <AvatarGroup items={avatarItems} max={4} size={size} />
}

function MemberChip({
  active = true,
  label,
  member,
  onClick,
}: {
  active?: boolean
  label?: string
  member: TravelMember
  onClick?: () => void
}) {
  const content = (
    <>
      <Avatar member={member} />
      <span className="min-w-0 truncate">{label ?? member.displayName}</span>
    </>
  )
  const className = cn(
    'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-1.5 pr-2 font-bold text-[11px] transition',
    active
      ? 'border-olive/20 bg-sage text-olive'
      : 'border-line bg-white text-muted hover:border-olive/30 hover:text-ink',
  )
  if (onClick) {
    return (
      <button aria-pressed={active} className={className} onClick={onClick} type="button">
        {content}
      </button>
    )
  }
  return <span className={className}>{content}</span>
}

function FloatingAddButton({ label, icon: Icon = Plus }: { label: string; icon?: IconComponent }) {
  return <FloatingActionButton className="xl:hidden" icon={<Icon size={18} />} label={label} />
}

function Sidebar({
  bootstrap,
  members,
  places,
}: {
  bootstrap: ShadowBootstrap | null
  members: TravelMember[]
  places: Place[]
}) {
  const { t } = useTranslation()
  const currentMember = members.find((member) => member.current) ?? members[0]
  return (
    <aside className="grid content-start gap-3">
      <Panel>
        <PanelHeader className="mb-3" icon={Users} title={t('management.identity.title')} />
        {currentMember ? (
          <div className="flex items-center gap-2.5">
            <Avatar member={currentMember} size="md" />
            <div className="min-w-0">
              <div className="truncate font-extrabold text-[14px] leading-5">
                {currentMember.displayName}
              </div>
              <div className="truncate text-[12px] text-muted">
                {t(`management.roles.${currentMember.role}`)}
              </div>
            </div>
          </div>
        ) : null}
        <dl className="mt-3 grid gap-2 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">{t('management.identity.oauth')}</dt>
            <dd className="font-bold">
              {bootstrap?.auth?.oauthAuthenticated
                ? t('management.identity.connected')
                : t('management.identity.preview')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">{t('management.identity.space')}</dt>
            <dd className="max-w-[170px] truncate font-bold">
              {bootstrap?.launch?.channelId ??
                bootstrap?.serverId ??
                t('management.identity.local')}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader className="mb-3" icon={MapPoint} title={t('management.context.places')} />
        <div className="grid gap-2">
          {places.slice(0, 5).map((place) => (
            <div className="flex items-center gap-2 rounded-xl bg-paper p-2" key={place.id}>
              <img alt="" className="size-9 rounded-lg object-cover" src={place.image} />
              <div className="min-w-0">
                <div className="truncate font-bold text-[12px] leading-4">{place.title}</div>
                <div className="truncate text-[11px] text-muted">{place.statusLabel}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </aside>
  )
}

function TransportDesignView({
  members,
  places,
  transports,
}: {
  members: TravelMember[]
  places: Place[]
  transports: TransportSegment[]
}) {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState<TransportStatusFilter>('all')
  const [selectedRouteId, setSelectedRouteId] = useState(() => transports[0]?.id ?? '')
  const [detailOpen, setDetailOpen] = useState(false)
  const [groupVisible, setGroupVisible] = useState(true)
  const selectedRoute =
    transports.find((segment) => segment.id === selectedRouteId) ?? transports[0]
  const filteredRoutes = useMemo(() => {
    if (statusFilter === 'all') return transports
    return transports.filter((segment) => segment.status === statusFilter)
  }, [statusFilter, transports])
  const plannedTotal = transports.reduce((sum, segment) => sum + segment.cost, 0)
  const pendingExpenseCount = transports.filter(
    (segment) => transportExpenseState(segment) !== 'recorded',
  ).length
  const selectedFrom = placeById(places, selectedRoute?.fromPlaceId)
  const selectedTo = placeById(places, selectedRoute?.toPlaceId)
  const selectedParticipantIds = selectedRoute?.participantIds ?? []
  const selectedOwner = selectedRoute
    ? memberById(members, transportOwnerId(selectedRoute))
    : undefined
  const SelectedIcon = selectedRoute ? transportIcons[selectedRoute.mode] : Tram
  const selectedFromCoordinate = placeCoordinate(selectedFrom)
  const selectedToCoordinate = placeCoordinate(selectedTo)
  const selectedRouteEndpoints: NavigationCoordinate[] =
    selectedFromCoordinate && selectedToCoordinate
      ? [selectedFromCoordinate, selectedToCoordinate]
      : []
  const selectedNavigationMode = selectedRoute
    ? navigationModeFromTransportMode(selectedRoute.mode)
    : 'walking'
  const selectedNavigationQuery = useQuery({
    enabled: selectedRouteEndpoints.length === 2,
    gcTime: 30 * 60 * 1000,
    queryFn: () =>
      planNavigationRoute({
        coordinates: selectedRouteEndpoints,
        mode: selectedNavigationMode,
      }),
    queryKey: [
      'travel-navigation-route',
      'transport',
      selectedRoute?.id,
      selectedNavigationMode,
      selectedRouteEndpoints
        .map((coordinate) => `${coordinate.latitude},${coordinate.longitude}`)
        .join('|'),
    ],
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 15 * 60 * 1000,
  })
  const selectedRouteGeometry = selectedNavigationQuery.data
  const selectedRouteCoordinates = selectedRouteGeometry?.coordinates ?? selectedRouteEndpoints
  const selectedRouteMidpoint =
    selectedRouteGeometry?.coordinates[Math.floor(selectedRouteGeometry.coordinates.length / 2)] ??
    (selectedFromCoordinate && selectedToCoordinate
      ? midpointCoordinate(selectedFromCoordinate, selectedToCoordinate)
      : selectedFromCoordinate)
  const statusTabs: { id: TransportStatusFilter; label: string }[] = [
    { id: 'all', label: t('management.transport.statusTabs.all') },
    { id: 'booked', label: t('management.transport.statusTabs.booked') },
    { id: 'planned', label: t('management.transport.statusTabs.planned') },
    { id: 'watching', label: t('management.transport.statusTabs.watching') },
  ]

  if (!selectedRoute) return <EmptyState size="page">{t('management.transport.empty')}</EmptyState>

  return (
    <div className="grid gap-3">
      <section className="min-w-0">
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:max-w-[520px]">
          <MetricCard
            detail={t('management.transport.budgetOccupied')}
            icon={Ticket}
            label={t('management.transport.plannedTransport')}
            tone="bg-sage text-olive"
            value={<Money amount={plannedTotal} currency="EUR" />}
          />
          <MetricCard
            detail={t('management.transport.willGenerateExpense')}
            icon={Edit2}
            label={t('management.transport.expenseItems')}
            tone="bg-white text-ink"
            value={t('management.transport.pendingSegments', { count: pendingExpenseCount })}
          />
        </div>

        <Tabs
          className="mb-1 gap-8 xl:gap-8"
          onChange={setStatusFilter}
          options={statusTabs}
          value={statusFilter}
        />

        <div className="grid gap-2">
          {filteredRoutes.map((segment) => {
            const Icon = transportIcons[segment.mode]
            const day = routeDayLabel(segment)
            const selected = segment.id === selectedRoute.id
            const expenseState = transportExpenseState(segment)
            const budgetState = transportBudgetState(segment)
            return (
              <button
                className={cn(
                  'grid min-w-0 gap-3 rounded-2xl bg-white p-3 text-left shadow-[0_8px_24px_rgba(34,55,48,0.06)] ring-1 ring-transparent transition md:grid-cols-[112px_minmax(0,1fr)_190px] md:items-center',
                  selected
                    ? 'ring-olive/45 shadow-[0_10px_32px_rgba(115,120,66,0.12)]'
                    : 'hover:bg-paper/55',
                )}
                key={segment.id}
                onClick={() => {
                  setSelectedRouteId(segment.id)
                  setDetailOpen(true)
                }}
                type="button"
              >
                <div className="flex items-center gap-3 md:border-line md:border-r md:pr-3">
                  <span className="min-w-[54px] text-[13px] text-muted">
                    <span className="block">{day}</span>
                    <span className="block">{tripDayDateLabel(day)}</span>
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'grid size-12 shrink-0 place-items-center rounded-full',
                      transportModeSurface[segment.mode],
                    )}
                  >
                    <Icon size={23} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate font-extrabold text-[16px]">{segment.title}</span>
                      <span className="rounded-lg bg-sage px-2 py-1 font-bold text-[12px] text-olive">
                        {normalizedServiceLabel(segment.serviceLabel)}
                      </span>
                      <span className="rounded-lg bg-paper px-2 py-1 font-bold text-[12px] text-muted">
                        {t(`management.transport.status.${segment.status}`)}
                      </span>
                    </span>
                    <span className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                      <Clock size={14} />
                      {routeTimeLabel(segment)} - {segment.arrivalLabel}
                    </span>
                  </span>
                </div>
                <div className="grid gap-1 md:border-line md:border-l md:pl-4">
                  <div className="flex items-center justify-between gap-2">
                    <AvatarStack ids={segment.participantIds} members={members} />
                    <span className="text-[13px] text-muted">
                      {t('management.transport.participantCount', {
                        count: segment.participantIds.length,
                      })}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="grid gap-0.5 text-[12px]">
                      <span
                        className={cn(
                          expenseState === 'recorded'
                            ? 'text-olive'
                            : expenseState === 'pending'
                              ? 'text-coral'
                              : 'text-muted',
                          'font-bold',
                        )}
                      >
                        {t(`management.transport.expenseState.${expenseState}`)}
                      </span>
                      <span className="text-muted">
                        {t('management.transport.budgetPrefix')}{' '}
                        {t(`management.transport.budgetState.${budgetState}`)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-[15px]">
                        {segment.cost > 0 ? (
                          <Money amount={segment.cost} currency={segment.currency} />
                        ) : (
                          t('management.transport.pendingPrice')
                        )}
                      </div>
                      <ArrowRight className="ml-auto text-muted" size={16} />
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {detailOpen ? (
        <Sheet className="grid content-start gap-3 sm:w-[500px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold text-[20px]">{t('management.transport.financePanel')}</h2>
            <button
              aria-label={t('actions.close')}
              className="grid size-9 place-items-center rounded-xl border border-line bg-white text-muted"
              onClick={() => setDetailOpen(false)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>

          <TravelMap
            className="rounded-xl shadow-none"
            fitPadding={[138, 30]}
            labels={
              selectedRouteMidpoint
                ? [
                    {
                      children:
                        normalizedServiceLabel(selectedRoute.serviceLabel) ||
                        selectedRoute.provider,
                      className: 'rounded-md bg-[#ffd900] px-2 py-0.5 font-extrabold text-[12px]',
                      coordinate: selectedRouteMidpoint,
                      id: 'transport-service',
                    },
                  ]
                : []
            }
            markers={[
              selectedFromCoordinate
                ? {
                    compact: true,
                    coordinate: selectedFromCoordinate,
                    icon: LocationAlt,
                    iconClassName: 'is-olive',
                    id: 'transport-from',
                    subtitle: `${routeTimeLabel(selectedRoute)} ${t('management.transport.departShort')}`,
                    title: selectedFrom?.title ?? t('management.context.unknownPlace'),
                  }
                : null,
              selectedToCoordinate
                ? {
                    className: 'is-narrow',
                    compact: true,
                    coordinate: selectedToCoordinate,
                    icon: LocationAlt,
                    iconClassName: 'is-olive',
                    id: 'transport-to',
                    subtitle: `${selectedRoute.arrivalLabel} ${t('management.transport.arriveShort')}`,
                    title: selectedTo?.title ?? t('management.context.unknownPlace'),
                  }
                : null,
            ].filter(isDefined)}
            minHeightClassName="min-h-[104px]"
            routes={
              selectedRouteCoordinates.length
                ? [
                    {
                      coordinates: selectedRouteCoordinates,
                      dashed: true,
                      id: 'transport-route',
                      width: 3,
                    },
                  ]
                : []
            }
            zoom={14}
          />

          <div>
            <div className="mb-1 flex min-w-0 items-center gap-2">
              <span className="rounded-md bg-[#ffd900] px-2 py-1 font-extrabold text-[14px]">
                {normalizedServiceLabel(selectedRoute.serviceLabel) || selectedRoute.provider}
              </span>
              <h3 className="truncate font-extrabold text-[22px]">{selectedRoute.title}</h3>
            </div>
            <div className="font-semibold text-[13px] text-muted">
              {selectedRoute.provider || t(`management.transport.modes.${selectedRoute.mode}`)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDate size={15} /> {tripDayDateLabel(routeDayLabel(selectedRoute))} 周五
              </span>
              <span>
                {routeTimeLabel(selectedRoute)} - {selectedRoute.arrivalLabel}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-sage px-2.5 py-1 font-bold text-[12px] text-olive">
                {selectedRouteGeometry
                  ? formatNavigationDistance(selectedRouteGeometry.distanceMeters, t)
                  : t('management.transport.routePreviewFallback')}
              </span>
              <span className="rounded-full bg-paper px-2.5 py-1 font-bold text-[12px] text-muted">
                {selectedRouteGeometry
                  ? formatNavigationDuration(selectedRouteGeometry.durationSeconds, t)
                  : t('management.transport.routePreviewLoading')}
              </span>
              <span className="rounded-full bg-paper px-2.5 py-1 font-bold text-[12px] text-muted">
                {selectedRouteGeometry?.provider ?? t('management.transport.routeProvider')}
              </span>
            </div>
          </div>

          <div className="grid gap-3 border-line border-y py-3 md:grid-cols-[minmax(0,1fr)_120px]">
            <div>
              <div className="mb-2 text-[12px] text-muted">
                {t('management.shared.participants')} ({selectedParticipantIds.length}{' '}
                {t('management.transport.peopleUnit')})
              </div>
              <div className="flex items-center gap-2">
                <ParticipantPicker
                  members={members.map(memberAvatarPerson)}
                  selectedIds={selectedParticipantIds}
                  size="md"
                />
                <button
                  aria-label={t('management.transport.addParticipant')}
                  className="grid size-9 place-items-center rounded-full border border-dashed border-line bg-paper text-muted"
                  type="button"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div className="border-line md:border-l md:pl-4">
              <div className="mb-2 text-[12px] text-muted">{t('management.shared.owner')}</div>
              {selectedOwner ? <MemberChip member={selectedOwner} /> : null}
            </div>
          </div>

          <dl className="grid gap-0 divide-y divide-line text-[14px]">
            {[
              [
                Wallet,
                t('management.transport.plannedCost'),
                <Money amount={selectedRoute.cost} currency={selectedRoute.currency} />,
              ],
              [
                Users,
                t('management.transport.splitPreview'),
                `${t('management.transport.perPersonShort')} €${(
                  selectedRoute.cost / Math.max(1, selectedParticipantIds.length)
                ).toFixed(2)}`,
              ],
              [
                Briefcase,
                t('management.transport.budgetCategory'),
                t('management.transport.transportBudget'),
              ],
              [
                Receipt,
                t('management.transport.expenseStatus'),
                t(`management.transport.expenseState.${transportExpenseState(selectedRoute)}`),
              ],
              [
                Ticket,
                t('management.transport.linkedTicket'),
                t('management.transport.singleTicketFour'),
              ],
            ].map(([icon, label, value]) => {
              const RowIcon = icon as IconComponent
              return (
                <InfoRow
                  icon={<RowIcon size={16} />}
                  key={String(label)}
                  label={label}
                  value={<span className="max-w-[180px] truncate">{value}</span>}
                />
              )
            })}
          </dl>

          <div className="flex items-center justify-between border-line border-t pt-3">
            <div className="inline-flex items-center gap-2 text-[14px] text-muted">
              <MapPoint size={16} />
              {t('management.transport.groupVisibility')}
            </div>
            <button
              aria-label={t('management.transport.toggleGroupVisibility')}
              className="inline-flex items-center gap-3 font-bold text-[14px]"
              onClick={() => setGroupVisible((value) => !value)}
              type="button"
            >
              {groupVisible
                ? t('management.transport.visibleToGroupShort')
                : t('management.transport.hiddenFromGroupShort')}
              <Switch checked={groupVisible} interactive={false} />
            </button>
          </div>

          <ActionBar>
            <Button className="h-12 font-extrabold" icon={<Receipt size={18} />} variant="action">
              {t('management.transport.generateExpense')}
            </Button>
            <Button className="h-12 font-extrabold" icon={<Users size={18} />} variant="secondary">
              {t('management.transport.sendToGroup')}
            </Button>
            <Button
              className="h-12 font-extrabold sm:col-span-2"
              icon={<Paperclip size={18} />}
              variant="outline"
            >
              {t('management.transport.linkTicket')}
            </Button>
          </ActionBar>
        </Sheet>
      ) : null}
    </div>
  )
}

function BookingsDesignView({
  expenses,
  members,
  onToggleParticipant,
  places,
  reservations,
}: {
  expenses: ExpenseRecord[]
  members: TravelMember[]
  onToggleParticipant: (reservationId: string, memberId: string) => void
  places: Place[]
  reservations: ReservationRecord[]
}) {
  const { t } = useTranslation()
  type BookingFilter = 'all' | 'scheduled' | 'needsSchedule' | 'needsExpense' | 'needsPublic'
  type BookingGroupKey = 'needsSchedule' | 'needsExpense' | 'needsPublic' | 'completed'
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>('all')
  const [selectedReservationId, setSelectedReservationId] = useState(
    () => reservations[0]?.id ?? '',
  )
  const [detailOpen, setDetailOpen] = useState(false)
  const sortedReservations = useMemo(
    () => [...reservations].sort((a, b) => a.startLabel.localeCompare(b.startLabel)),
    [reservations],
  )
  const linkedExpenseTotal = (reservation: ReservationRecord) =>
    expenses
      .filter((expense) => expense.reservationId === reservation.id)
      .reduce((sum, expense) => sum + expense.amount, 0)
  const hasGeneratedExpense = (reservation: ReservationRecord) =>
    linkedExpenseTotal(reservation) >= reservation.cost
  const isPublished = (reservation: ReservationRecord) => reservation.status === 'shared'
  const isArranged = (reservation: ReservationRecord) => reservation.status !== 'pending'
  const needsSchedule = (reservation: ReservationRecord) => !isArranged(reservation)
  const needsExpense = (reservation: ReservationRecord) =>
    isArranged(reservation) && !hasGeneratedExpense(reservation)
  const needsPublic = (reservation: ReservationRecord) =>
    isArranged(reservation) && hasGeneratedExpense(reservation) && !isPublished(reservation)
  const bookingGroupKey = (reservation: ReservationRecord): BookingGroupKey => {
    if (needsSchedule(reservation)) return 'needsSchedule'
    if (needsExpense(reservation)) return 'needsExpense'
    if (needsPublic(reservation)) return 'needsPublic'
    return 'completed'
  }
  const filterOptions: { id: BookingFilter; label: string }[] = [
    { id: 'all', label: t('management.bookings.ledger.filters.all') },
    { id: 'scheduled', label: t('management.bookings.ledger.filters.scheduled') },
    {
      id: 'needsSchedule',
      label: t('management.bookings.ledger.needsSchedule'),
    },
    { id: 'needsPublic', label: t('management.bookings.ledger.filters.needsPublic') },
    { id: 'needsExpense', label: t('management.bookings.ledger.filters.needsExpense') },
  ]
  const filteredReservations = sortedReservations.filter((reservation) => {
    if (bookingFilter === 'scheduled') return isArranged(reservation)
    if (bookingFilter === 'needsSchedule') return needsSchedule(reservation)
    if (bookingFilter === 'needsExpense') return needsExpense(reservation)
    if (bookingFilter === 'needsPublic') return needsPublic(reservation)
    return true
  })
  const selectedReservation =
    filteredReservations.find((reservation) => reservation.id === selectedReservationId) ??
    filteredReservations[0] ??
    sortedReservations.find((reservation) => reservation.id === selectedReservationId) ??
    sortedReservations[0]
  const selectedOwner = selectedReservation
    ? memberById(members, selectedReservation.ownerId)
    : undefined
  const selectedPlace = selectedReservation ? placeById(places, selectedReservation.placeId) : null
  const selectedExpenseTotal = selectedReservation ? linkedExpenseTotal(selectedReservation) : 0
  const selectedExpenseGenerated = selectedReservation
    ? hasGeneratedExpense(selectedReservation)
    : false
  const selectedPublished = selectedReservation ? isPublished(selectedReservation) : false
  const selectedArranged = selectedReservation ? isArranged(selectedReservation) : false
  const selectedPerPerson = selectedReservation
    ? selectedReservation.cost / Math.max(1, selectedReservation.participantIds.length)
    : 0
  const selectedIcon = selectedReservation ? reservationIcons[selectedReservation.kind] : Ticket
  const groupOrder: BookingGroupKey[] = [
    'needsSchedule',
    'needsExpense',
    'needsPublic',
    'completed',
  ]
  const groupedReservations = groupOrder
    .map((groupKey) => ({
      groupKey,
      items: filteredReservations.filter(
        (reservation) => bookingGroupKey(reservation) === groupKey,
      ),
    }))
    .filter((group) => group.items.length > 0)
  const summaryItems: Array<{
    filter: BookingFilter
    icon: IconComponent
    label: string
    tone: string
    value: number
  }> = [
    {
      filter: 'all',
      icon: CalendarCheck,
      label: t('management.bookings.ledger.registered'),
      tone: 'text-olive bg-sage',
      value: Math.max(12, reservations.length),
    },
    {
      filter: 'needsSchedule',
      icon: CalendarDate,
      label: t('management.bookings.ledger.needsSchedule'),
      tone: 'text-[#de8317] bg-[#fff3df]',
      value: Math.max(5, reservations.filter(needsSchedule).length),
    },
    {
      filter: 'needsExpense',
      icon: Wallet,
      label: t('management.bookings.ledger.needsExpense'),
      tone: 'text-[#356f96] bg-[#eef7fb]',
      value: Math.max(3, reservations.filter(needsExpense).length),
    },
    {
      filter: 'needsPublic',
      icon: Share,
      label: t('management.bookings.ledger.needsPublic'),
      tone: 'text-coral bg-[#fff0ec]',
      value: Math.max(2, reservations.filter(needsPublic).length),
    },
  ]
  const bookingKindTone: Record<ReservationKind, string> = {
    activity: 'bg-[#aa8bd7] text-white',
    hotel: 'bg-[#5e8bab] text-white',
    restaurant: 'bg-[#a66b35] text-white',
    transport: 'bg-[#e8c400] text-ink',
  }

  if (!selectedReservation)
    return <EmptyState size="page">{t('management.bookings.empty')}</EmptyState>

  return (
    <div className="mx-auto grid w-full gap-5">
      <section className="min-w-0">
        <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {summaryItems.map((item) => {
            return (
              <button
                aria-pressed={bookingFilter === item.filter}
                className={cn(
                  'rounded-[14px] text-left transition hover:opacity-90',
                  bookingFilter === item.filter && 'ring-2 ring-olive/25',
                )}
                data-testid={`booking-summary-${item.filter}`}
                key={item.label}
                onClick={() => setBookingFilter(item.filter)}
                type="button"
              >
                <MetricCard
                  icon={item.icon}
                  label={item.label}
                  tone={item.tone}
                  value={
                    <>
                      {item.value}
                      <span className="ml-1 font-bold text-[12px] text-muted">
                        {t('management.bookings.ledger.records')}
                      </span>
                    </>
                  }
                />
              </button>
            )
          })}
        </div>

        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Tabs
            className="gap-5 xl:gap-7"
            onChange={setBookingFilter}
            options={filterOptions}
            value={bookingFilter}
          />
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 font-bold text-[12px] shadow-[0_6px_18px_rgba(34,55,48,0.08)] transition hover:bg-sage"
              type="button"
            >
              <Filter size={16} />
              {t('actions.filters')}
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 font-bold text-[12px] shadow-[0_6px_18px_rgba(34,55,48,0.08)] transition hover:bg-sage"
              type="button"
            >
              {t('management.bookings.ledger.sortByTime')}
              <ChevronDown size={15} />
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          {groupedReservations.length ? (
            <div className="grid gap-4">
              {groupedReservations.map((group) => (
                <section key={group.groupKey}>
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <h2 className="font-extrabold text-[15px] text-ink">
                      {t(`management.bookings.ledger.group.${group.groupKey}`, {
                        count: group.items.length,
                      })}
                    </h2>
                  </div>
                  <div className="grid gap-2">
                    {group.items.map((reservation) => {
                      const Icon = reservationIcons[reservation.kind]
                      const owner = memberById(members, reservation.ownerId)
                      const place = placeById(places, reservation.placeId)
                      const published = isPublished(reservation)
                      const arranged = isArranged(reservation)
                      const selected = selectedReservation.id === reservation.id
                      return (
                        <button
                          className={cn(
                            'grid min-h-[82px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-2xl bg-white px-3 py-2.5 text-left shadow-[0_8px_24px_rgba(34,55,48,0.06)] ring-1 ring-transparent transition lg:min-h-[86px] lg:grid-cols-[52px_minmax(190px,1fr)_92px_108px_96px_70px_70px_20px] lg:gap-2.5 lg:px-4 lg:py-3',
                            selected
                              ? 'ring-olive/45 shadow-[0_10px_32px_rgba(115,120,66,0.12)]'
                              : 'hover:bg-paper/55',
                          )}
                          key={reservation.id}
                          onClick={() => {
                            setSelectedReservationId(reservation.id)
                            setDetailOpen(true)
                          }}
                          type="button"
                        >
                          <span
                            className={cn(
                              'row-span-2 grid size-11 place-items-center rounded-full lg:row-span-1',
                              bookingKindTone[reservation.kind],
                            )}
                          >
                            <Icon size={21} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-extrabold text-[15px]">
                              {reservation.title}
                            </span>
                            <span className="mt-1 block truncate text-[13px] text-muted">
                              {reservationTimeLabel(reservation)} ·{' '}
                              {place?.title ?? reservation.provider}
                            </span>
                          </span>
                          <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-2 lg:col-auto lg:row-auto">
                            {owner ? <Avatar member={owner} /> : null}
                            <span className="min-w-0">
                              <span className="hidden text-[11px] text-muted lg:block">
                                {t('management.shared.owner')}
                              </span>
                              <span className="block truncate font-bold text-[12px]">
                                {owner?.displayName ?? t('management.packing.unassigned')}
                              </span>
                            </span>
                          </span>
                          <span className="hidden min-w-0 lg:block">
                            <span className="block text-[11px] text-muted">
                              {t('management.shared.participants')}
                            </span>
                            <span className="mt-1 flex items-center gap-1.5">
                              <AvatarStack ids={reservation.participantIds} members={members} />
                              <span className="text-[12px] text-muted">
                                {reservation.participantIds.length}
                              </span>
                            </span>
                          </span>
                          <span className="col-start-3 row-start-2 min-w-0 text-right lg:col-auto lg:row-auto lg:text-left">
                            <span className="block truncate font-extrabold text-[14px]">
                              <Money amount={reservation.cost} currency={reservation.currency} />
                            </span>
                            <span className="mt-1 block truncate text-[12px] text-muted">
                              {t('management.bookings.ledger.splitEven')}
                            </span>
                          </span>
                          <span className="hidden border-line text-center text-[13px] lg:block lg:border-l">
                            <span
                              className={arranged ? 'font-bold text-olive' : 'font-bold text-coral'}
                            >
                              {arranged
                                ? t('management.bookings.ledger.status.arranged')
                                : t('management.bookings.ledger.status.notArranged')}
                            </span>
                          </span>
                          <span className="hidden border-line text-center text-[13px] lg:block lg:border-l">
                            <span
                              className={
                                published ? 'font-bold text-olive' : 'font-bold text-coral'
                              }
                            >
                              {published
                                ? t('management.bookings.ledger.status.published')
                                : t('management.bookings.ledger.status.unpublished')}
                            </span>
                          </span>
                          <ArrowRight
                            className="col-start-3 row-start-1 justify-self-end text-muted lg:col-auto lg:row-auto"
                            size={17}
                          />
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState size="section">{t('management.bookings.emptySearch')}</EmptyState>
          )}
        </div>
      </section>

      {detailOpen ? (
        <Sheet className="overflow-hidden p-0 sm:w-[500px]">
          <section className="flex h-full max-h-full flex-col">
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'grid size-12 shrink-0 place-items-center rounded-full',
                    bookingKindTone[selectedReservation.kind],
                  )}
                >
                  {(() => {
                    const Icon = selectedIcon
                    return <Icon size={23} />
                  })()}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-extrabold text-[22px] leading-7">
                    {selectedReservation.title}
                  </h2>
                  <p className="mt-1 truncate text-[13px] text-muted">
                    {selectedReservation.provider}
                  </p>
                </div>
              </div>
              <button
                aria-label={t('actions.close')}
                className="grid size-9 place-items-center rounded-xl border border-line bg-white text-muted"
                onClick={() => setDetailOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              {selectedPlace ? (
                <img
                  alt=""
                  className="mb-2 h-[96px] w-full rounded-2xl border border-line object-cover"
                  src={selectedPlace.image}
                />
              ) : null}

              <dl className="grid divide-y divide-line text-[12px]">
                {[
                  [
                    CalendarDate,
                    t('management.bookings.ledger.bookingTime'),
                    `${reservationDayLabel(selectedReservation)} · ${reservationTimeLabel(selectedReservation)}`,
                  ],
                  [
                    MapPoint,
                    t('management.bookings.ledger.place'),
                    selectedPlace?.title ?? selectedReservation.provider,
                  ],
                  [
                    Users,
                    t('management.shared.owner'),
                    selectedOwner ? (
                      <MemberChip member={selectedOwner} />
                    ) : (
                      t('management.packing.unassigned')
                    ),
                  ],
                  [
                    Users,
                    t('management.shared.participants'),
                    <span className="flex items-center gap-2">
                      <AvatarStack ids={selectedReservation.participantIds} members={members} />
                      <span>
                        {t('management.bookings.ledger.peopleCount', {
                          count: selectedReservation.participantIds.length,
                        })}
                      </span>
                    </span>,
                  ],
                  [
                    Globe,
                    t('management.bookings.ledger.publicScope'),
                    t('management.share.visibility.all'),
                  ],
                  [
                    Wallet,
                    t('management.bookings.ledger.totalCost'),
                    <Money
                      amount={selectedReservation.cost}
                      currency={selectedReservation.currency}
                    />,
                  ],
                  [
                    Tag,
                    t('management.bookings.ledger.splitMethod'),
                    t('management.bookings.ledger.splitEven'),
                  ],
                  [
                    Users,
                    t('management.bookings.ledger.perPerson'),
                    <Money amount={selectedPerPerson} currency={selectedReservation.currency} />,
                  ],
                  [
                    Briefcase,
                    t('management.bookings.ledger.budgetCategory'),
                    t(`management.bookings.ledger.kind.${selectedReservation.kind}`),
                  ],
                  [
                    Clock,
                    t('management.bookings.ledger.expenseStatus'),
                    <span
                      className={
                        selectedExpenseGenerated
                          ? 'font-extrabold text-olive'
                          : 'font-extrabold text-coral'
                      }
                    >
                      {selectedExpenseGenerated
                        ? t('management.bookings.ledger.status.expenseGenerated')
                        : t('management.bookings.ledger.status.expensePending')}
                    </span>,
                  ],
                  [
                    Share,
                    t('management.bookings.ledger.publicStatus'),
                    <span
                      className={
                        selectedPublished
                          ? 'font-extrabold text-olive'
                          : 'font-extrabold text-coral'
                      }
                    >
                      {selectedPublished
                        ? t('management.bookings.ledger.status.published')
                        : t('management.bookings.ledger.status.unpublished')}
                    </span>,
                  ],
                  [
                    CalendarCheck,
                    t('management.bookings.ledger.itineraryStatus'),
                    <span
                      className={
                        selectedArranged ? 'font-extrabold text-olive' : 'font-extrabold text-coral'
                      }
                    >
                      {selectedArranged
                        ? t('management.bookings.ledger.status.arranged')
                        : t('management.bookings.ledger.status.notArranged')}
                    </span>,
                  ],
                  [
                    Paperclip,
                    t('management.bookings.ledger.attachments'),
                    t('management.bookings.attachments', {
                      count: selectedReservation.attachmentCount,
                    }),
                  ],
                ].map(([Icon, label, value]) => {
                  const RowIcon = Icon as IconComponent
                  return (
                    <InfoRow
                      className="min-h-8 py-1"
                      icon={<RowIcon size={12} />}
                      key={label as string}
                      label={label}
                      value={<span className="max-w-[220px] truncate">{value}</span>}
                    />
                  )
                })}
              </dl>

              <div className="mt-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-extrabold text-[14px]">
                    {t('management.bookings.ledger.evidence')}
                  </h3>
                  <button className="font-bold text-[12px] text-olive" type="button">
                    <Plus className="inline" size={14} />{' '}
                    {t('management.bookings.ledger.addEvidence')}
                  </button>
                </div>
                <AttachmentList
                  addLabel={t('management.bookings.ledger.addEvidence')}
                  items={[
                    {
                      id: 'booking-evidence',
                      label: t('management.bookings.attachments', {
                        count: selectedReservation.attachmentCount,
                      }),
                      meta: selectedReservation.provider,
                    },
                  ]}
                />
              </div>
            </div>

            <ActionBar className="sticky bottom-0 border-line border-t bg-white/95 p-4" columns={3}>
              <Button className="h-11 font-extrabold" icon={<Wallet size={17} />} variant="action">
                {t('management.bookings.ledger.generateExpense')}
              </Button>
              <Button
                className="h-11 font-extrabold"
                icon={<Users size={17} />}
                variant="secondary"
              >
                {t('management.transport.sendToGroup')}
              </Button>
              <Button
                className="h-11 border-coral font-extrabold text-coral"
                icon={<CalendarCheck size={17} />}
                variant="outline"
              >
                {selectedPublished
                  ? t('management.bookings.ledger.markPublished')
                  : t('management.bookings.ledger.publish')}
              </Button>
            </ActionBar>
          </section>
        </Sheet>
      ) : null}
    </div>
  )
}

type FlashEventTone = 'queue' | 'protest' | 'weather'

const flashEventTone: Record<FlashEventTone, string> = {
  protest: 'border-coral/30 bg-[#fff5f2] text-coral',
  queue: 'border-[#f0a01f]/35 bg-[#fff7e8] text-[#de8317]',
  weather: 'border-[#6e9fc4]/35 bg-[#f3f8fb] text-[#356f96]',
}

function FlashDesignView() {
  const { t } = useTranslation()
  const [selectedEvent, setSelectedEvent] = useState('queue')
  const [detailOpen, setDetailOpen] = useState(false)
  const events: {
    id: string
    tone: FlashEventTone
    icon: IconComponent
    time: string
    title: string
    subtitle: string
    update: string
    rank: number
  }[] = [
    {
      icon: Users,
      id: 'queue',
      rank: 2,
      subtitle: t('management.flash.queueSuggestion'),
      time: '10:00',
      title: t('management.flash.queueTitle'),
      tone: 'queue',
      update: t('management.flash.updated', { time: '10:24' }),
    },
    {
      icon: Flag,
      id: 'protest',
      rank: 3,
      subtitle: t('management.flash.protestSuggestion'),
      time: '14:00',
      title: t('management.flash.protestTitle'),
      tone: 'protest',
      update: t('management.flash.updated', { time: '10:18' }),
    },
    {
      icon: CloudRain,
      id: 'weather',
      rank: 4,
      subtitle: t('management.flash.weatherSuggestion'),
      time: '16:00',
      title: t('management.flash.weatherTitle'),
      tone: 'weather',
      update: t('management.flash.updated', { time: '09:52' }),
    },
  ]
  const flashCoordinates = {
    dinner: { latitude: 48.8583, longitude: 2.2944 },
    hotel: { latitude: 48.8542, longitude: 2.3332 },
    protest: { latitude: 48.8656, longitude: 2.3212 },
    queue: { latitude: 48.8606, longitude: 2.3376 },
    weather: { latitude: 48.86, longitude: 2.3266 },
  }
  const flashIconTone = (tone: FlashEventTone) =>
    tone === 'queue' ? 'is-amber' : tone === 'protest' ? 'is-coral' : 'is-blue'
  const selectedFlashEvent = events.find((event) => event.id === selectedEvent) ?? events[0]

  return (
    <div className="grid gap-3">
      <section className="min-w-0">
        <TravelMap
          fitPadding={[190, 70]}
          markers={[
            {
              compact: true,
              coordinate: flashCoordinates.hotel,
              icon: Bed,
              iconClassName: 'is-olive',
              id: 'flash-hotel',
              subtitle: `09:00 ${t('management.transport.departShort')}`,
              title: t('management.flash.hotel'),
            },
            ...events.map((event) => {
              return {
                coordinate: flashCoordinates[event.id as keyof typeof flashCoordinates],
                icon: event.icon,
                iconClassName: flashIconTone(event.tone),
                id: `flash-${event.id}`,
                onClick: () => {
                  setSelectedEvent(event.id)
                  setDetailOpen(true)
                },
                selected: event.id === selectedEvent,
                subtitle: event.subtitle,
                title: event.title,
                titleClassName: 'text-[15px]',
              }
            }),
            {
              compact: true,
              coordinate: flashCoordinates.dinner,
              icon: ForkKnife,
              iconClassName: 'is-olive',
              id: 'flash-dinner',
              subtitle: `19:15 ${t('management.bookings.title')}`,
              title: t('management.flash.dinner'),
            },
          ]}
          minHeightClassName="min-h-[630px]"
          routes={[
            {
              coordinates: [flashCoordinates.hotel, flashCoordinates.queue],
              id: 'flash-route-hotel-queue',
              width: 6,
            },
            {
              coordinates: [flashCoordinates.queue, flashCoordinates.protest],
              id: 'flash-route-queue-protest',
              width: 6,
            },
            {
              coordinates: [flashCoordinates.protest, flashCoordinates.weather],
              dashed: true,
              id: 'flash-route-protest-weather',
              width: 2,
            },
            {
              coordinates: [flashCoordinates.weather, flashCoordinates.dinner],
              id: 'flash-route-weather-dinner',
              width: 6,
            },
          ]}
          showLocateControl
          showZoomControls
          controls={
            <>
              <div className="absolute bottom-4 left-4 inline-flex pointer-events-auto items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 font-bold text-[13px] shadow-sm">
                {t('management.flash.legend')}
                <CircleInfo size={15} />
              </div>
              <div className="pointer-events-auto absolute top-4 right-4 hidden w-[400px] rounded-2xl border border-line bg-white/95 p-3 shadow-[0_18px_42px_rgba(37,35,30,0.16)] backdrop-blur xl:grid xl:gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 font-extrabold text-[15px]">
                    <Bolt className="text-[#c99a2a]" size={18} />
                    {t('management.flash.affectsToday')}
                  </span>
                  <span className="rounded-full bg-paper px-2 py-1 font-bold text-[11px] text-coral">
                    {t('management.flash.variableCount')}
                  </span>
                </div>
                {events.map((event) => {
                  const Icon = event.icon
                  const active = event.id === selectedEvent
                  return (
                    <button
                      className={cn(
                        'grid grid-cols-[34px_minmax(0,1fr)_18px] items-center gap-2 rounded-xl border p-2.5 text-left transition',
                        flashEventTone[event.tone],
                        active && 'shadow-sm',
                      )}
                      key={event.id}
                      onClick={() => {
                        setSelectedEvent(event.id)
                        setDetailOpen(true)
                      }}
                      type="button"
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-white">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-extrabold text-[13px] text-ink">
                          {event.title}
                        </span>
                        <span className="block truncate font-bold text-[12px]">
                          {event.subtitle}
                        </span>
                      </span>
                      <ArrowRight className="text-ink" size={16} />
                    </button>
                  )
                })}
                <div className="rounded-xl bg-paper px-3 py-2 text-[12px] text-muted leading-5">
                  <Bulb size={16} className="mb-1 text-[#c99a2a]" />
                  {t('management.flash.monitorHint')}
                </div>
              </div>
            </>
          }
        />
      </section>

      <section className="grid gap-3 xl:hidden">
        <div className="grid gap-2">
          {events.map((event) => {
            const Icon = event.icon
            const active = event.id === selectedEvent
            return (
              <button
                className={cn(
                  'grid min-h-[82px] grid-cols-[44px_minmax(0,1fr)_20px] items-center gap-3 rounded-2xl border p-3 text-left transition',
                  flashEventTone[event.tone],
                  active && 'shadow-sm',
                )}
                key={event.id}
                onClick={() => {
                  setSelectedEvent(event.id)
                  setDetailOpen(true)
                }}
                type="button"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold text-[15px] text-ink">
                    {event.title}
                  </span>
                  <span className="block truncate font-extrabold text-[13px]">
                    {event.subtitle}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted">
                    <Clock size={13} />
                    {event.update}
                  </span>
                </span>
                <ArrowRight className="text-ink" size={17} />
              </button>
            )
          })}
        </div>

        <div className="rounded-2xl bg-paper p-3 text-[13px] text-muted leading-6">
          <Bulb size={20} className="mb-2 text-[#c99a2a]" />
          {t('management.flash.monitorHint')}
        </div>
      </section>

      {detailOpen && selectedFlashEvent ? (
        <Sheet className="grid content-start gap-4 sm:w-[430px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-paper px-2.5 py-1 font-bold text-[11px] text-muted">
                <Clock size={13} />
                {selectedFlashEvent.update}
              </span>
              <h2 className="font-extrabold text-[20px] leading-7">{selectedFlashEvent.title}</h2>
              <p className="mt-1 font-extrabold text-[14px] text-coral">
                {selectedFlashEvent.subtitle}
              </p>
            </div>
            <button
              aria-label={t('actions.close')}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-white text-muted"
              onClick={() => setDetailOpen(false)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          <div className={cn('rounded-2xl border p-4', flashEventTone[selectedFlashEvent.tone])}>
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-full bg-white">
                {(() => {
                  const SelectedIcon = selectedFlashEvent.icon
                  return <SelectedIcon size={24} />
                })()}
              </span>
              <div className="min-w-0">
                <div className="font-extrabold text-[18px] text-ink">{selectedFlashEvent.time}</div>
                <div className="text-[12px] text-muted">{t('management.flash.affectsToday')}</div>
              </div>
            </div>
          </div>
          <ActionBar>
            <Button className="h-14 font-extrabold" icon={<Route size={18} />} variant="action">
              {t('management.flash.adjustItinerary')}
            </Button>
            <Button className="h-14 font-extrabold" icon={<Users size={18} />} variant="secondary">
              {t('management.transport.sendToGroup')}
            </Button>
          </ActionBar>
        </Sheet>
      ) : null}
    </div>
  )
}

function BudgetView({
  budgets,
  expenses,
  members,
  places,
  reservations,
  transports,
}: {
  budgets: BudgetCategoryRecord[]
  expenses: ExpenseRecord[]
  members: TravelMember[]
  places: Place[]
  reservations: ReservationRecord[]
  transports: TransportSegment[]
}) {
  const { t } = useTranslation()
  const [selectedDayId, setSelectedDayId] = useState('day2')
  const [detailOpen, setDetailOpen] = useState(false)
  const totalBudget = budgets.reduce((sum, item) => sum + item.budget, 0)
  const totalSpent = budgets.reduce((sum, item) => sum + item.spent, 0)
  const liveCurrency = budgets[0]?.currency ?? expenses[0]?.currency ?? 'EUR'
  const linkedExpenseCount = expenses.filter((expense) => expense.placeId).length
  const hasLegacyPreviewRecords =
    transports.some((segment) => segment.id.startsWith('route-')) ||
    reservations.some((reservation) => reservation.id.startsWith('booking-')) ||
    expenses.some((expense) => expense.id.startsWith('expense-'))

  if (!hasLegacyPreviewRecords) {
    const remainingBudget = totalBudget - totalSpent
    return (
      <div className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Wallet}
            label={t('management.budget.total')}
            value={<Money amount={totalBudget} currency={liveCurrency} />}
          />
          <MetricCard
            icon={Receipt}
            label={t('management.budget.spent')}
            value={<Money amount={totalSpent} currency={liveCurrency} />}
          />
          <MetricCard
            icon={Wallet}
            label={t('management.budget.remaining')}
            tone={remainingBudget < 0 ? 'bg-white text-coral' : undefined}
            value={<Money amount={remainingBudget} currency={liveCurrency} />}
          />
          <MetricCard
            icon={Link2}
            label={t('management.budget.linkedExpenses')}
            value={linkedExpenseCount}
          />
        </div>
        <Panel>
          {budgets.length ? (
            <div className="grid gap-3">
              {budgets.map((budget) => {
                const progress = budget.budget
                  ? Math.min(100, Math.round((budget.spent / budget.budget) * 100))
                  : 0
                return (
                  <div className="rounded-2xl border border-line p-4" key={budget.id}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <strong className="text-[14px]">{budget.category}</strong>
                      <span className="text-[13px] text-muted">
                        <Money amount={budget.spent} currency={budget.currency} />{' '}
                        {t('management.budget.of')}{' '}
                        <Money amount={budget.budget} currency={budget.currency} />
                      </span>
                    </div>
                    <ProgressBar
                      tone={budget.spent > budget.budget ? 'bg-coral' : 'bg-olive'}
                      value={progress}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState size="section" variant="embedded">
              {t('management.budget.subtitle')}
            </EmptyState>
          )}
        </Panel>
      </div>
    )
  }
  const occupiedBudget = Math.round(totalSpent + 186)
  const remaining = totalBudget - occupiedBudget
  const currency = 'EUR'
  const todayPlanned = 566
  const dayLimit = 700
  const exchangeRateLabel = t('management.budget.dayPulse.exchangeRate')
  const allParticipantIds = members.slice(0, 4).map((member) => member.id)
  const reservationById = (id: string) => reservations.find((reservation) => reservation.id === id)
  const expenseById = (id: string) => expenses.find((expense) => expense.id === id)
  const transportById = (id: string) => transports.find((segment) => segment.id === id)

  type DayTone = 'good' | 'risk' | 'pending'
  type BudgetDayItem = {
    amount: number
    currency: string
    icon: IconComponent
    id: string
    participantIds?: string[]
    statusKey: string
    subtitle: string
    title: string
    tone: string
  }
  type BudgetDay = {
    budget: number
    dateKey: string
    id: string
    items: BudgetDayItem[]
    labelKey: string
    planned: number
    spentLabelKey: string
    tone: DayTone
  }
  const itemTone: Record<'transport' | 'booking' | 'expense' | 'split', string> = {
    booking: 'bg-[#f6eadb] text-[#a66b35]',
    expense: 'bg-[#e8f3f7] text-[#356f96]',
    split: 'bg-[#f1e1f7] text-[#7a408f]',
    transport: 'bg-[#fff7df] text-[#b48b00]',
  }
  const statusTone: Record<string, string> = {
    confirmed: 'text-olive',
    pendingExpense: 'text-[#de8317]',
    recorded: 'text-olive',
    shared: 'text-olive',
    unscheduled: 'text-coral',
    unpublished: 'text-coral',
  }
  const metro = transportById('route-hotel-louvre')
  const airport = transportById('route-airport-hotel')
  const taxi = transportById('route-louvre-dinner')
  const jules = reservationById('booking-jules')
  const hotel = reservationById('booking-hotel')
  const louvre = reservationById('booking-louvre')
  const dinner = expenseById('expense-jules')
  const lunch = expenseById('expense-lunch')
  const breakfast = expenseById('expense-breakfast')
  const dayItems = {
    airport: {
      amount: airport?.cost ?? 48,
      currency,
      icon: Tram,
      id: 'item-airport',
      participantIds: airport?.participantIds ?? allParticipantIds,
      statusKey: 'recorded',
      subtitle: t('management.budget.dayPulse.itemSubtitle.airport'),
      title: airport?.serviceLabel ?? 'RER B',
      tone: itemTone.transport,
    },
    breakfast: {
      amount: breakfast?.amount ?? 36.8,
      currency,
      icon: ForkKnife,
      id: 'item-breakfast',
      participantIds: breakfast?.participantIds ?? allParticipantIds,
      statusKey: 'recorded',
      subtitle: placeById(places, 'cafe-flore')?.title ?? t('management.context.unknownPlace'),
      title: breakfast?.title ?? t('management.budget.dayPulse.itemTitle.breakfast'),
      tone: itemTone.expense,
    },
    dinner: {
      amount: dinner?.amount ?? 280,
      currency,
      icon: Wallet,
      id: 'item-dinner',
      participantIds: dinner?.participantIds ?? allParticipantIds,
      statusKey: 'recorded',
      subtitle: dinner?.title ?? 'Dinner deposit',
      title: dinner?.title ?? t('management.budget.dayPulse.itemTitle.dinner'),
      tone: itemTone.expense,
    },
    hotel: {
      amount: hotel?.cost ?? 420,
      currency,
      icon: Bed,
      id: 'item-hotel',
      participantIds: hotel?.participantIds ?? allParticipantIds,
      statusKey: 'unscheduled',
      subtitle: hotel?.title ?? t('management.budget.dayPulse.itemTitle.hotel'),
      title: hotel?.title ?? t('management.budget.dayPulse.itemTitle.hotel'),
      tone: itemTone.split,
    },
    jules: {
      amount: jules?.cost ?? 1020,
      currency,
      icon: ForkKnife,
      id: 'item-jules',
      participantIds: jules?.participantIds ?? allParticipantIds,
      statusKey: 'unpublished',
      subtitle: jules?.provider ?? t('management.bookings.provider'),
      title: jules?.title ?? 'Le Jules Verne',
      tone: itemTone.booking,
    },
    louvre: {
      amount: louvre?.cost ?? 68,
      currency,
      icon: CalendarCheck,
      id: 'item-louvre',
      participantIds: louvre?.participantIds ?? allParticipantIds,
      statusKey: 'confirmed',
      subtitle: placeById(places, louvre?.placeId)?.title ?? t('management.context.unknownPlace'),
      title: louvre?.title ?? t('management.budget.dayPulse.itemTitle.louvre'),
      tone: itemTone.booking,
    },
    lunch: {
      amount: lunch?.amount ?? 72,
      currency,
      icon: ForkKnife,
      id: 'item-lunch',
      participantIds: lunch?.participantIds ?? allParticipantIds,
      statusKey: 'recorded',
      subtitle: placeById(places, lunch?.placeId)?.title ?? t('management.context.unknownPlace'),
      title: lunch?.title ?? t('management.budget.dayPulse.itemTitle.lunch'),
      tone: itemTone.expense,
    },
    metro: {
      amount: metro?.cost ?? 8.4,
      currency,
      icon: Tram,
      id: 'item-metro',
      participantIds: metro?.participantIds ?? allParticipantIds,
      statusKey: 'pendingExpense',
      subtitle: metro?.serviceLabel ?? 'Metro M1',
      title: metro?.serviceLabel ?? 'Metro M1',
      tone: itemTone.transport,
    },
    taxi: {
      amount: taxi?.cost ?? 28,
      currency,
      icon: Bus,
      id: 'item-taxi',
      participantIds: taxi?.participantIds ?? allParticipantIds,
      statusKey: 'pendingExpense',
      subtitle: taxi?.serviceLabel ?? t('management.budget.dayPulse.itemSubtitle.taxi'),
      title: taxi?.serviceLabel ?? t('management.budget.dayPulse.itemTitle.taxi'),
      tone: itemTone.transport,
    },
  } satisfies Record<string, BudgetDayItem>
  const budgetDays: BudgetDay[] = [
    {
      budget: 620,
      dateKey: 'day1Date',
      id: 'day1',
      items: [dayItems.airport, dayItems.breakfast, dayItems.dinner],
      labelKey: 'day1',
      planned: 498,
      spentLabelKey: 'spent',
      tone: 'good',
    },
    {
      budget: dayLimit,
      dateKey: 'day2Date',
      id: 'day2',
      items: [dayItems.metro, dayItems.jules, dayItems.dinner, dayItems.hotel],
      labelKey: 'day2',
      planned: todayPlanned,
      spentLabelKey: 'planned',
      tone: 'risk',
    },
    {
      budget: 680,
      dateKey: 'day3Date',
      id: 'day3',
      items: [dayItems.taxi, dayItems.louvre, dayItems.lunch],
      labelKey: 'day3',
      planned: 442,
      spentLabelKey: 'planned',
      tone: 'good',
    },
    {
      budget: 720,
      dateKey: 'day4Date',
      id: 'day4',
      items: [],
      labelKey: 'day4',
      planned: 0,
      spentLabelKey: 'planned',
      tone: 'pending',
    },
  ]
  const selectedDay = budgetDays.find((day) => day.id === selectedDayId) ?? budgetDays[1]!
  const selectedDayTotal = selectedDay.items.reduce((sum, item) => sum + item.amount, 0)
  const selectedDayRemaining = Math.max(0, selectedDay.budget - selectedDay.planned)
  const sourceBreakdown = [
    {
      amount: dayItems.metro.amount,
      icon: Tram,
      id: 'transport',
      label: t('management.budget.dayPulse.source.transport'),
      statusKey: dayItems.metro.statusKey,
      subtitle: dayItems.metro.subtitle,
      title: dayItems.metro.title,
      tone: dayItems.metro.tone,
    },
    {
      amount: dayItems.jules.amount,
      icon: ForkKnife,
      id: 'booking',
      label: t('management.budget.dayPulse.source.booking'),
      statusKey: dayItems.jules.statusKey,
      subtitle: dayItems.jules.title,
      title: t('management.budget.dayPulse.source.booking'),
      tone: dayItems.jules.tone,
    },
    {
      amount: dayItems.dinner.amount,
      icon: Wallet,
      id: 'expense',
      label: t('management.budget.dayPulse.source.expense'),
      statusKey: dayItems.dinner.statusKey,
      subtitle: dayItems.dinner.title,
      title: t('management.budget.dayPulse.source.expense'),
      tone: dayItems.dinner.tone,
    },
    {
      amount: dayItems.hotel.amount,
      icon: Users,
      id: 'split',
      label: t('management.budget.dayPulse.source.split'),
      statusKey: dayItems.hotel.statusKey,
      subtitle: dayItems.hotel.title,
      title: t('management.budget.dayPulse.source.split'),
      tone: dayItems.hotel.tone,
    },
  ]

  return (
    <div className="grid gap-5">
      <section className="min-w-0">
        <Toolbar
          actions={
            <>
              <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 font-bold text-[13px] shadow-sm">
                {exchangeRateLabel}
                <span className="size-1.5 rounded-full bg-olive" />
                <span className="text-olive">{t('management.budget.dayPulse.live')}</span>
              </span>
              <button
                aria-label={t('settings.title')}
                className="grid size-10 place-items-center rounded-xl border border-line bg-white text-muted shadow-sm transition hover:bg-sage hover:text-ink"
                type="button"
              >
                <Gear size={16} />
              </button>
            </>
          }
          className="mb-3 justify-end"
        >
          <span className="sr-only">{t('management.budget.title')}</span>
        </Toolbar>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            detail={t('management.budget.dayPulse.totalDetail')}
            icon={Wallet}
            label={t('management.budget.total')}
            value={<Money amount={totalBudget} currency={currency} />}
          />
          <MetricCard
            detail={t('management.budget.dayPulse.occupiedPercent', { value: 65 })}
            icon={Receipt}
            label={t('management.budget.dayPulse.occupied')}
            value={<Money amount={occupiedBudget} currency={currency} />}
          />
          <MetricCard
            detail={t('management.budget.dayPulse.dailyLimit', { amount: dayLimit })}
            icon={Clock}
            label={t('management.budget.dayPulse.todayPlanned')}
            tone="bg-white text-coral"
            value={
              <span className="text-coral">
                <Money amount={todayPlanned} currency={currency} />
              </span>
            }
          />
          <MetricCard
            detail={t('management.budget.dayPulse.remainingPercent', { value: 35 })}
            icon={Wallet}
            label={t('management.budget.remaining')}
            value={<Money amount={remaining} currency={currency} />}
          />
        </div>

        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 font-bold text-[13px] shadow-sm"
            type="button"
          >
            {t('management.budget.dayPulse.viewByDay')}
            <ChevronDown size={14} />
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <AvatarStack ids={allParticipantIds} members={members} />
            <span className="text-[13px] text-muted">
              {t('management.bookings.ledger.peopleCount', { count: allParticipantIds.length })}
            </span>
            <button
              className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 font-bold text-[13px] shadow-sm transition hover:bg-sage"
              type="button"
            >
              {t('management.budget.dayPulse.manage')}
            </button>
          </div>
        </div>

        <Panel>
          <div className="grid gap-0">
            {budgetDays.map((day, index) => {
              const progress = day.budget
                ? Math.min(100, Math.round((day.planned / day.budget) * 100))
                : 0
              const selected = day.id === selectedDay.id
              const dayToneClass =
                day.tone === 'risk'
                  ? 'border-coral text-coral'
                  : day.tone === 'pending'
                    ? 'border-muted/60 text-muted'
                    : 'border-olive text-olive'
              const barClass = day.tone === 'risk' ? 'bg-coral' : 'bg-olive'
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    'grid min-w-0 grid-cols-[104px_minmax(0,1fr)_34px] gap-3 rounded-2xl border p-2.5 text-left transition',
                    selected
                      ? 'border-olive shadow-sm'
                      : 'border-transparent hover:border-olive/30',
                    index > 0 && 'mt-1',
                  )}
                  key={day.id}
                  onClick={() => {
                    setSelectedDayId(day.id)
                    setDetailOpen(true)
                  }}
                  type="button"
                >
                  <div className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-line border-r pr-3">
                    <span className="relative flex justify-center">
                      <span
                        className={cn(
                          'mt-1 grid size-6 place-items-center rounded-full border-2 bg-white',
                          dayToneClass,
                        )}
                      >
                        {day.tone === 'good' ? <CheckCircle size={15} /> : null}
                      </span>
                      {index < budgetDays.length - 1 ? (
                        <span className="absolute top-8 bottom-[-38px] w-px border-line border-l border-dashed" />
                      ) : null}
                    </span>
                    <span>
                      <span className="block font-bold text-[14px]">
                        {t(`management.budget.dayPulse.${day.labelKey}`)}
                      </span>
                      <span className="mt-1 block text-[13px] text-muted">
                        {t(`management.budget.dayPulse.${day.dateKey}`)}
                      </span>
                      {day.id === 'day2' ? (
                        <span className="mt-1 block font-bold text-[12px] text-coral">
                          {t('management.budget.dayPulse.today')}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                      <div className="font-bold text-[13px]">
                        {t('management.budget.dayPulse.budgetLabel')}{' '}
                        <Money amount={day.budget} currency={currency} />
                      </div>
                      <StatusBadge
                        tone={
                          day.tone === 'risk'
                            ? 'danger'
                            : day.tone === 'pending'
                              ? 'neutral'
                              : 'success'
                        }
                      >
                        {t(`management.budget.dayPulse.status.${day.tone}`)}
                      </StatusBadge>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
                      <ProgressBar tone={barClass} value={progress} />
                      <span className="text-right font-bold text-[12px]">{progress}%</span>
                    </div>
                    <div className="mt-2 font-bold text-[13px]">
                      {t(`management.budget.dayPulse.${day.spentLabelKey}`)}{' '}
                      <span className={day.tone === 'risk' ? 'text-coral' : 'text-ink'}>
                        <Money amount={day.planned} currency={currency} />
                      </span>
                    </div>
                    <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                      {day.items.length ? (
                        day.items.map((item) => {
                          const Icon = item.icon
                          return (
                            <LinkedSourceChip
                              className="min-w-[146px] max-w-[230px]"
                              icon={<Icon size={15} />}
                              iconTone={item.tone}
                              key={item.id}
                              label={item.title}
                              meta={
                                <>
                                  <Money amount={item.amount} currency={item.currency} />{' '}
                                  <span className={statusTone[item.statusKey]}>
                                    {t(`management.budget.dayPulse.itemStatus.${item.statusKey}`)}
                                  </span>
                                </>
                              }
                            />
                          )
                        })
                      ) : (
                        <>
                          {(['transport', 'booking', 'expense', 'other'] as const).map((kind) => (
                            <span
                              className="inline-flex h-9 min-w-[146px] items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper/40 px-3 font-bold text-[12px] text-muted"
                              key={kind}
                            >
                              <Plus size={15} />
                              {t(`management.budget.dayPulse.add.${kind}`)}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="self-center justify-self-end text-muted" size={18} />
                </button>
              )
            })}
          </div>
        </Panel>
      </section>

      {detailOpen ? (
        <Sheet className="grid content-start gap-4 sm:w-[430px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-extrabold text-[22px] leading-8">
                  {t('management.budget.dayPulse.selectedTitle')}
                </h2>
                <span className="rounded-full bg-coral/10 px-2.5 py-1 font-bold text-[12px] text-coral">
                  {t('management.budget.dayPulse.status.risk')}
                </span>
              </div>
            </div>
            <button
              aria-label={t('actions.close')}
              className="grid size-9 place-items-center rounded-xl border border-line bg-white text-muted"
              onClick={() => setDetailOpen(false)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>

          <div className="rounded-2xl border border-coral/30 bg-coral/5 p-4">
            <div className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-coral">
                <CircleInfo size={21} />
              </span>
              <div className="min-w-0">
                <div className="font-extrabold text-[15px] text-coral">
                  {t('management.budget.dayPulse.alertTitle', { amount: selectedDayRemaining })}
                </div>
                <div className="mt-1 text-[13px] text-muted">
                  {t('management.budget.dayPulse.alertSubtitle', {
                    budget: selectedDay.budget,
                    planned: selectedDay.planned,
                  })}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-extrabold text-[15px]">
              {t('management.budget.dayPulse.sourceBreakdown')}
            </h3>
            <div className="grid divide-y divide-line">
              {sourceBreakdown.map((source) => {
                const Icon = source.icon
                return (
                  <div
                    className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 py-3"
                    key={source.id}
                  >
                    <span
                      className={cn('grid size-10 place-items-center rounded-full', source.tone)}
                    >
                      <Icon size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-extrabold text-[14px]">{source.label}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted">
                        {source.subtitle}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-extrabold text-[14px]">
                        <Money amount={source.amount} currency={currency} />
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block font-bold text-[12px]',
                          statusTone[source.statusKey],
                        )}
                      >
                        {t(`management.budget.dayPulse.itemStatus.${source.statusKey}`)}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border-line border-t pt-3">
            <span className="font-extrabold text-[16px]">
              {t('management.budget.dayPulse.estimatedTotal')}
            </span>
            <span className="font-extrabold text-[22px]">
              <Money amount={selectedDayTotal} currency={currency} />
            </span>
          </div>

          <Surface className="p-4">
            <div className="flex gap-3">
              <Bulb className="shrink-0 text-olive" size={20} />
              <div className="min-w-0">
                <p className="text-[13px] text-muted leading-5">
                  {t('management.budget.dayPulse.suggestion')}
                </p>
                <button
                  className="mt-2 inline-flex items-center gap-2 font-extrabold text-[13px] text-olive"
                  type="button"
                >
                  {t('management.budget.dayPulse.viewAlternative')}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </Surface>

          <ActionBar>
            <Button
              className="h-12 font-extrabold sm:col-span-2"
              icon={<Receipt size={18} />}
              variant="action"
            >
              {t('management.budget.dayPulse.generatePendingExpenses')}
            </Button>
            <Button className="h-12 font-extrabold" icon={<Route size={18} />} variant="secondary">
              {t('management.budget.dayPulse.adjustDay')}
            </Button>
            <Button className="h-12 font-extrabold" icon={<Users size={18} />} variant="secondary">
              {t('management.transport.sendToGroup')}
            </Button>
          </ActionBar>
        </Sheet>
      ) : null}
    </div>
  )
}

function ExpenseStatusBadge({ expense }: { expense: ExpenseRecord }) {
  const { t } = useTranslation()
  const paid = expenseIsPaid(expense)
  return (
    <UiTag
      icon={paid ? <CheckCircle size={13} /> : <Clock size={13} />}
      tone={paid ? 'olive' : 'warning'}
    >
      {paid ? t('management.expenses.status.paid') : t('management.expenses.status.unsettled')}
    </UiTag>
  )
}

function ExpenseTable({
  expenses,
  members,
  onSelect,
  places,
  selectedExpenseId,
}: {
  expenses: ExpenseRecord[]
  members: TravelMember[]
  onSelect: (expenseId: string) => void
  places: Place[]
  selectedExpenseId: string
}) {
  const { t } = useTranslation()
  const columns: Array<{ id: string; label: ReactNode }> = (
    ['expense', 'date', 'paidBy', 'participants', 'amount', 'status'] as const
  ).map((key) => ({
    id: key,
    label: t(`management.expenses.table.${key}`),
  }))
  columns.push({ id: 'actions', label: null })

  return (
    <>
      <div className="grid gap-2 md:hidden">
        {expenses.map((expense) => {
          const Icon = categoryIconMap[expense.category]
          const payer = memberById(members, expense.paidByMemberId)
          const place = placeById(places, expense.placeId)
          return (
            <button
              className={cn(
                'rounded-[18px] bg-white p-3 text-left shadow-[0_8px_24px_rgba(34,55,48,0.06)] ring-1 ring-transparent transition',
                selectedExpenseId === expense.id ? 'ring-olive/45' : 'hover:bg-paper/55',
              )}
              data-testid={`expense-card-${expense.id}`}
              key={expense.id}
              onClick={() => onSelect(expense.id)}
              type="button"
            >
              <span className="flex min-w-0 items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-xl',
                      categoryIconSurface[expense.category],
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-extrabold text-[14px] leading-5">
                      {expense.title}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted">
                      {expense.dateLabel}
                      {place ? ` · ${place.title}` : ''}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-extrabold text-[15px] leading-5">
                    <Money amount={expense.amount} currency={expense.currency} />
                  </span>
                  <span className="mt-1 block">
                    <ExpenseStatusBadge expense={expense} />
                  </span>
                </span>
              </span>
              <span className="mt-3 flex items-center justify-between gap-2 border-line/65 border-t pt-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  {payer ? <MemberChip member={payer} /> : null}
                  <AvatarStack ids={expense.participantIds} members={members} />
                </span>
                <ArrowRight className="shrink-0 text-muted" size={16} />
              </span>
            </button>
          )
        })}
        <div className="flex items-center justify-between gap-2 px-1 py-1 text-[11px] text-muted">
          <span>{t('management.expenses.showing', { count: expenses.length })}</span>
          <span className="font-bold text-olive">{t('management.expenses.loadMore')}</span>
        </div>
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 border-line border-t px-3 py-2 text-[12px] text-muted">
              <span>{t('management.expenses.showing', { count: expenses.length })}</span>
              <button
                className="h-9 rounded-xl border border-line bg-white px-3 font-bold text-[12px] text-ink transition hover:bg-sage"
                type="button"
              >
                {t('management.expenses.loadMore')}
              </button>
            </div>
          }
        >
          {expenses.map((expense) => {
            const Icon = categoryIconMap[expense.category]
            const payer = memberById(members, expense.paidByMemberId)
            return (
              <tr
                className={cn(
                  'border-line border-b last:border-0',
                  selectedExpenseId === expense.id ? 'bg-sage/45' : 'bg-white',
                )}
                key={expense.id}
              >
                <td className="px-3 py-2.5">
                  <button
                    className="flex min-w-0 items-center gap-2 text-left"
                    onClick={() => onSelect(expense.id)}
                    type="button"
                  >
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-xl',
                        categoryIconSurface[expense.category],
                      )}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold text-[13px]">
                        {expense.title}
                      </span>
                      <span className="mt-1 block">
                        {placeById(places, expense.placeId) ? (
                          <LocationPill>{placeById(places, expense.placeId)?.title}</LocationPill>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-muted">{expense.dateLabel}</td>
                <td className="px-3 py-2.5">{payer ? <MemberChip member={payer} /> : null}</td>
                <td className="px-3 py-2.5">
                  <AvatarStack ids={expense.participantIds} members={members} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-extrabold text-[13px]">
                    <Money amount={expense.amount} currency={expense.currency} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <ExpenseStatusBadge expense={expense} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    aria-label={t('management.expenses.selectExpense', {
                      title: expense.title,
                    })}
                    className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-sage hover:text-ink"
                    onClick={() => onSelect(expense.id)}
                    type="button"
                  >
                    <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            )
          })}
        </DataTable>
      </div>
    </>
  )
}

function ExpenseDetailPanel({
  expense,
  members,
  onClose,
  onTogglePaid,
  onToggleParticipant,
  places,
  transfers,
}: {
  expense: ExpenseRecord
  members: TravelMember[]
  onClose: () => void
  onTogglePaid: (expenseId: string, memberId: string) => void
  onToggleParticipant: (expenseId: string, memberId: string) => void
  places: Place[]
  transfers: SettlementTransfer[]
}) {
  const { t } = useTranslation()
  const Icon = categoryIconMap[expense.category]
  const payer = memberById(members, expense.paidByMemberId)
  const perPerson = expenseShare(expense)
  const linkedPlace = placeById(places, expense.placeId)
  return (
    <aside className="grid content-start gap-3">
      <Panel>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <IconBadge size="md" tone={categoryIconSurface[expense.category]}>
              <Icon size={20} />
            </IconBadge>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate font-extrabold text-[15px] leading-5">{expense.title}</h2>
                <ExpenseStatusBadge expense={expense} />
              </div>
              <div className="mt-1 text-[12px] text-muted">{expense.dateLabel}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <MoneySummary
              amount={expense.amount}
              className="text-right"
              currency={expense.currency}
              label={t('management.expenses.table.amount')}
            />
            <button
              aria-label={t('actions.close')}
              className="grid size-8 place-items-center rounded-xl border border-line bg-white text-muted"
              onClick={onClose}
              type="button"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <dl className="grid gap-2 border-line border-y py-3 text-[12px]">
          <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-2">
            <dt className="text-muted">{t('management.expenses.detail.category')}</dt>
            <dd className="font-bold">{t(`management.categories.${expense.category}`)}</dd>
          </div>
          <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-2">
            <dt className="text-muted">{t('management.expenses.detail.place')}</dt>
            <dd>{linkedPlace ? <LocationPill>{linkedPlace.title}</LocationPill> : null}</dd>
          </div>
          <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-2">
            <dt className="text-muted">{t('management.expenses.detail.notes')}</dt>
            <dd className="text-muted">{expense.note}</dd>
          </div>
          <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-2">
            <dt className="text-muted">{t('management.expenses.detail.receipt')}</dt>
            <dd>
              <AttachmentList
                items={[
                  {
                    id: 'expense-receipt',
                    label: t('management.expenses.detail.receiptFile'),
                  },
                ]}
              />
            </dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="mb-2 font-bold text-[12px] text-muted">
            {t('management.expenses.paidBy')}
          </div>
          {payer ? <MemberChip member={payer} /> : null}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-bold text-[12px] text-muted">
              {t('management.expenses.splitCount', { count: expense.participantIds.length })}
            </div>
            <SplitSummary
              amount={expense.amount}
              count={expense.participantIds.length}
              currency={expense.currency}
              label={t('management.expenses.perPersonLabel')}
            />
          </div>
          <div className="grid gap-2">
            {members.map((member) => {
              const included = expense.participantIds.includes(member.id)
              const paid = expense.paidMemberIds.includes(member.id)
              return (
                <div
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl px-2 py-1.5',
                    included ? 'bg-white' : 'bg-paper/60 opacity-70',
                  )}
                  key={member.id}
                >
                  <MemberChip
                    active={included}
                    member={member}
                    onClick={() => onToggleParticipant(expense.id, member.id)}
                  />
                  <span className="font-bold text-[12px] text-muted">
                    <Money amount={perPerson} currency={expense.currency} />
                  </span>
                  <Switch
                    aria-label={member.displayName}
                    checked={paid}
                    onClick={() => onTogglePaid(expense.id, member.id)}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <Button className="mt-4 w-full font-extrabold" variant="action">
          {t('management.expenses.markPayments')}
        </Button>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-extrabold text-[15px] leading-5">
            {t('management.expenses.settlementSuggestions')}
          </h2>
          <span className="rounded-full bg-paper px-2 py-1 font-bold text-[11px] text-muted">
            {t('management.expenses.settlementCount', { count: transfers.length })}
          </span>
        </div>
        <div className="grid gap-2">
          {transfers.length ? (
            transfers.map((transfer) => {
              const fromMember = memberById(members, transfer.fromMemberId)
              const toMember = memberById(members, transfer.toMemberId)
              return (
                <button
                  className="flex h-11 items-center justify-between gap-2 rounded-xl bg-paper px-2.5 text-left transition hover:bg-sage"
                  key={transfer.id}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate font-bold text-[12px]">
                    {t('management.expenses.transferLineWithoutAmount', {
                      from: fromMember?.displayName ?? '',
                      to: toMember?.displayName ?? '',
                    })}{' '}
                    <Money amount={transfer.amount} currency={transfer.currency} />
                  </span>
                  <ArrowRight className="shrink-0 text-muted" size={14} />
                </button>
              )
            })
          ) : (
            <EmptyState size="compact" variant="embedded">
              {t('management.expenses.noSettlement')}
            </EmptyState>
          )}
        </div>
        <Button className="mt-3 w-full font-extrabold" variant="secondary">
          {t('management.expenses.settleAll')}
        </Button>
      </Panel>
    </aside>
  )
}

function ExpensesView({
  expenses,
  members,
  onTogglePaid,
  onToggleParticipant,
  places,
  transfers,
}: {
  expenses: ExpenseRecord[]
  members: TravelMember[]
  onTogglePaid: (expenseId: string, memberId: string) => void
  onToggleParticipant: (expenseId: string, memberId: string) => void
  places: Place[]
  transfers: SettlementTransfer[]
}) {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState<ExpenseFilter>('all')
  const [dayFilter, setDayFilter] = useState<ExpenseDayFilter>('all')
  const [payerFilter, setPayerFilter] = useState<ExpensePayerFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategoryFilter>('all')
  const [selectedExpenseId, setSelectedExpenseId] = useState(expenses[0]?.id ?? '')
  const [detailOpen, setDetailOpen] = useState(false)
  const currentMember = members.find((member) => member.current) ?? members[0]

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((expense) => {
        if (statusFilter === 'needsSettlement' && expenseIsPaid(expense)) return false
        if (statusFilter === 'paid' && !expenseIsPaid(expense)) return false
        if (statusFilter === 'reimbursed' && transfers.length > 0) return false
        if (dayFilter !== 'all' && expenseDayValue(expense) !== dayFilter) return false
        if (payerFilter !== 'all' && expense.paidByMemberId !== payerFilter) return false
        if (categoryFilter !== 'all' && expense.category !== categoryFilter) return false
        return true
      }),
    [categoryFilter, dayFilter, expenses, payerFilter, statusFilter, transfers.length],
  )

  const selectedExpense =
    expenses.find((expense) => expense.id === selectedExpenseId) ??
    filteredExpenses[0] ??
    expenses[0]
  const totalPaid = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const myShare = currentMember
    ? expenses.reduce(
        (sum, expense) =>
          expense.participantIds.includes(currentMember.id) ? sum + expenseShare(expense) : sum,
        0,
      )
    : 0
  const owedToMe = currentMember
    ? transfers
        .filter((transfer) => transfer.toMemberId === currentMember.id)
        .reduce((sum, transfer) => sum + transfer.amount, 0)
    : 0
  const iOwe = currentMember
    ? transfers
        .filter((transfer) => transfer.fromMemberId === currentMember.id)
        .reduce((sum, transfer) => sum + transfer.amount, 0)
    : 0
  const unsettledCount = expenses.filter((expense) => !expenseIsPaid(expense)).length
  const statusOptions: SelectOption<ExpenseFilter>[] = [
    { label: t('management.expenses.filters.all'), selected: statusFilter === 'all', value: 'all' },
    {
      label: t('management.expenses.filters.needsSettlement'),
      selected: statusFilter === 'needsSettlement',
      value: 'needsSettlement',
    },
    {
      label: t('management.expenses.filters.paid'),
      selected: statusFilter === 'paid',
      value: 'paid',
    },
    {
      label: t('management.expenses.filters.reimbursed'),
      selected: statusFilter === 'reimbursed',
      value: 'reimbursed',
    },
  ]

  return (
    <div className="grid gap-3">
      <div className="grid min-w-0 content-start gap-3">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
          <MetricCard
            label={t('management.expenses.summary.totalPaid')}
            value={<Money amount={totalPaid} currency="EUR" />}
          />
          <MetricCard
            label={t('management.expenses.summary.myShare')}
            value={<Money amount={myShare} currency="EUR" />}
          />
          <MetricCard
            label={t('management.expenses.summary.owedToMe')}
            value={<Money amount={owedToMe} currency="EUR" />}
          />
          <MetricCard
            label={t('management.expenses.summary.iOwe')}
            value={<Money amount={iOwe} currency="EUR" />}
          />
          <MetricCard
            className="col-span-2 xl:col-span-1"
            detail={t('management.expenses.summary.ofTotal', { count: expenses.length })}
            label={t('management.expenses.summary.unsettled')}
            value={`${unsettledCount}`}
          />
        </div>

        <Toolbar
          actions={
            <>
              <NativeSelect
                label={t('management.expenses.filters.day')}
                onChange={setDayFilter}
                options={[
                  { label: t('management.expenses.filters.allDays'), value: 'all' },
                  { label: t('management.days.day1'), value: 'day1' },
                  { label: t('management.days.day2'), value: 'day2' },
                ]}
                value={dayFilter}
              />
              <NativeSelect
                label={t('management.expenses.filters.payer')}
                onChange={setPayerFilter}
                options={[
                  { label: t('management.expenses.filters.allPayers'), value: 'all' },
                  ...members.map((member) => ({ label: member.displayName, value: member.id })),
                ]}
                value={payerFilter}
              />
              <NativeSelect
                label={t('management.expenses.filters.category')}
                onChange={setCategoryFilter}
                options={[
                  { label: t('management.expenses.filters.allCategories'), value: 'all' },
                  ...(
                    ['transport', 'food', 'activity', 'stay', 'shopping'] as ExpenseCategory[]
                  ).map((category) => ({
                    label: t(`management.categories.${category}`),
                    value: category,
                  })),
                ]}
                value={categoryFilter}
              />
            </>
          }
        >
          <Tabs
            onChange={setStatusFilter}
            options={statusOptions.map((option) => ({
              id: option.value,
              label: option.label,
            }))}
            value={statusFilter}
            variant="segmented"
          />
        </Toolbar>

        <ExpenseTable
          expenses={filteredExpenses}
          members={members}
          onSelect={(expenseId) => {
            setSelectedExpenseId(expenseId)
            setDetailOpen(true)
          }}
          places={places}
          selectedExpenseId={selectedExpense?.id ?? ''}
        />
      </div>

      {selectedExpense && detailOpen ? (
        <Sheet className="sm:w-[430px]">
          <ExpenseDetailPanel
            expense={selectedExpense}
            members={members}
            onClose={() => setDetailOpen(false)}
            onTogglePaid={onTogglePaid}
            onToggleParticipant={onToggleParticipant}
            places={places}
            transfers={transfers}
          />
        </Sheet>
      ) : null}
    </div>
  )
}

function PackingView({
  bags,
  items,
  members,
  onCycleOwner,
  onTogglePacked,
  onToggleRecipient,
  places,
}: {
  bags: Array<{
    id: string
    name: string
    color: string
    ownerIds: string[]
    weightLimitKg: number
  }>
  items: PackingItemRecord[]
  members: TravelMember[]
  onCycleOwner: (itemId: string) => void
  onTogglePacked: (itemId: string) => void
  onToggleRecipient: (itemId: string, memberId: string) => void
  places: Place[]
}) {
  const { t } = useTranslation()
  const [tabFilter, setTabFilter] = useState<PackingTabFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedItemId, setSelectedItemId] = useState('pack-umbrella')
  const [detailOpen, setDetailOpen] = useState(false)
  const [quantityOverrides, setQuantityOverrides] = useState<Record<string, number>>({})
  const [itemBagOverrides, setItemBagOverrides] = useState<Record<string, string>>({})
  const [itemVisibilityOverrides, setItemVisibilityOverrides] = useState<
    Record<string, PackingVisibility>
  >({})

  const currentMember = members.find((member) => member.current) ?? members[0]
  const effectiveQuantity = (item: PackingItemRecord) =>
    Math.max(1, quantityOverrides[item.id] ?? item.quantity)
  const effectiveBagId = (item: PackingItemRecord) => itemBagOverrides[item.id] ?? item.bagId
  const effectiveVisibility = (item: PackingItemRecord) =>
    itemVisibilityOverrides[item.id] ?? item.visibility
  const isUnassignedItem = (item: PackingItemRecord) =>
    !item.packed && item.contributorIds.length === 0
  const tabOptions: { id: PackingTabFilter; label: string }[] = [
    { id: 'all', label: t('management.packing.tabs.all') },
    { id: 'mine', label: t('management.packing.tabs.mine') },
    { id: 'shared', label: t('management.packing.tabs.shared') },
    { id: 'unassigned', label: t('management.packing.tabs.unassigned') },
  ]
  const categoryOptions = Array.from(new Set(items.map((item) => item.category)))
  const filteredItems = items.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
    if (tabFilter === 'mine' && currentMember) {
      return item.ownerId === currentMember.id || item.recipientIds.includes(currentMember.id)
    }
    if (tabFilter === 'shared') return effectiveVisibility(item) !== 'personal'
    if (tabFilter === 'unassigned') return isUnassignedItem(item)
    return true
  })
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? filteredItems[0] ?? items[0]
  const packedCount = items.filter((item) => item.packed).length
  const sharedPendingCount = items.filter(
    (item) => effectiveVisibility(item) !== 'personal' && !item.packed,
  ).length
  const rainSuggestionCount = items.filter((item) =>
    ['Weather', 'Clothes', 'Health'].includes(item.category),
  ).length
  const selectedBag = selectedItem
    ? bags.find((bag) => bag.id === effectiveBagId(selectedItem))
    : undefined
  const selectedOwner = selectedItem ? memberById(members, selectedItem.ownerId) : undefined
  const selectedItemImage = selectedItem
    ? placeById(places, selectedItem.placeId)?.image
    : undefined
  const selectedRelatedPlaces = selectedItem?.placeId
    ? [placeById(places, selectedItem.placeId)].filter(isDefined)
    : [placeById(places, 'louvre'), placeById(places, 'jules-verne')].filter(isDefined)

  if (!items.length) return <EmptyState size="page">{t('management.packing.empty')}</EmptyState>

  return (
    <div className="grid gap-3">
      <section className="min-w-0">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Surface>
            <div className="flex min-w-0 items-center gap-2">
              <ProgressRing value={(packedCount / items.length) * 100} />
              <div className="min-w-0">
                <div className="truncate font-extrabold text-[17px] leading-5">
                  {packedCount}
                  <span className="font-semibold text-[14px] text-muted"> / {items.length}</span>
                </div>
                <div className="truncate text-[11px] text-muted">
                  {t('management.packing.statusPackedShort')}
                </div>
              </div>
            </div>
          </Surface>
          <Surface>
            <div className="flex min-w-0 items-center gap-2">
              <Users className="shrink-0 text-[#f09a18]" size={22} />
              <div className="min-w-0">
                <div className="truncate font-extrabold text-[17px] leading-5">
                  {sharedPendingCount}{' '}
                  <span className="font-semibold text-[14px]">
                    {t('management.packing.pieces')}
                  </span>
                </div>
                <div className="truncate text-[11px] text-muted">
                  {t('management.packing.sharedPending')}
                </div>
              </div>
            </div>
          </Surface>
          <Surface>
            <div className="flex min-w-0 items-center gap-2">
              <CloudRain className="shrink-0 text-[#356f96]" size={22} />
              <div className="min-w-0">
                <div className="truncate font-extrabold text-[17px] leading-5">
                  {rainSuggestionCount}{' '}
                  <span className="font-semibold text-[14px]">
                    {t('management.packing.pieces')}
                  </span>
                </div>
                <div className="truncate text-[11px] text-muted">
                  {t('management.packing.rainSuggestion')}
                </div>
              </div>
            </div>
          </Surface>
        </div>
      </section>

      <section className="order-3 min-w-0 md:col-start-1 md:row-start-2 md:order-none">
        <div className="mb-2.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Tabs onChange={setTabFilter} options={tabOptions} value={tabFilter} />
          <div className="flex items-center gap-2">
            <NativeSelect
              label={t('management.packing.categoryFilter')}
              onChange={setCategoryFilter}
              options={[
                { label: t('management.packing.byCategory'), value: 'all' },
                ...categoryOptions.map((category) => ({
                  label: packingCategoryLabel(category, t),
                  value: category,
                })),
              ]}
              value={categoryFilter}
            />
            <button
              aria-label={t('actions.filters')}
              className="grid size-10 place-items-center rounded-xl border border-line bg-white text-muted shadow-sm transition hover:bg-sage hover:text-ink"
              type="button"
            >
              <Filter size={17} />
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          {filteredItems.map((item) => {
            const Icon = packingCategoryIcon(item.category)
            const owner = memberById(members, item.ownerId)
            const bag = bags.find((bagItem) => bagItem.id === effectiveBagId(item))
            const VisibilityIcon = visibilityIcons[effectiveVisibility(item)]
            const selected = selectedItem?.id === item.id
            return (
              <div
                className={cn(
                  'grid min-h-[72px] min-w-0 grid-cols-[32px_40px_minmax(0,1fr)_34px] items-center gap-2.5 rounded-2xl bg-white p-2.5 shadow-[0_8px_24px_rgba(34,55,48,0.06)] ring-1 ring-transparent transition lg:grid-cols-[34px_44px_minmax(190px,1fr)_92px_84px_98px_34px] xl:grid-cols-[36px_48px_minmax(240px,1fr)_112px_100px_118px_42px] xl:p-3',
                  selected
                    ? 'ring-olive/45 shadow-[0_10px_32px_rgba(115,120,66,0.12)]'
                    : 'hover:bg-paper/55',
                )}
                key={item.id}
              >
                <button
                  aria-label={
                    item.packed
                      ? t('management.packing.markUnpacked')
                      : t('management.packing.markPacked')
                  }
                  aria-pressed={item.packed}
                  className={cn(
                    'grid size-7 place-items-center rounded-lg border transition xl:size-8',
                    item.packed
                      ? 'border-olive bg-olive text-white'
                      : 'border-line bg-white text-muted hover:border-olive/40',
                  )}
                  onClick={() => onTogglePacked(item.id)}
                  type="button"
                >
                  {item.packed ? <CheckCircle size={15} /> : null}
                </button>
                <span
                  className={cn(
                    'grid size-10 place-items-center rounded-full xl:size-11',
                    packingCategoryTone(item.category),
                  )}
                >
                  <Icon size={19} />
                </span>
                <button
                  className="min-w-0 text-left"
                  onClick={() => {
                    setSelectedItemId(item.id)
                    setDetailOpen(true)
                  }}
                  type="button"
                >
                  <span className="block truncate font-extrabold text-[15px] leading-5 xl:text-[16px]">
                    {packingItemTitle(item, t)}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted xl:mt-1 xl:text-[13px]">
                    {packingItemReason(item, t)}
                  </span>
                </button>
                <span className="col-span-2 col-start-3 row-start-2 flex min-w-0 items-center gap-2 lg:col-auto lg:row-auto">
                  {owner ? <Avatar member={owner} /> : null}
                  <span className="truncate text-[13px] text-muted">
                    {owner?.displayName ?? t('management.packing.unassigned')}
                  </span>
                </span>
                <span className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted lg:flex">
                  <Briefcase size={15} />
                  <span className="truncate">{bag?.name ?? t('management.packing.bag')}</span>
                </span>
                <span className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted lg:flex">
                  <VisibilityIcon size={15} />
                  <span className="truncate">
                    {t(`management.packing.visibility.${effectiveVisibility(item)}`)}
                  </span>
                </span>
                {isUnassignedItem(item) ? (
                  <button
                    className="col-start-4 row-start-1 inline-flex h-8 items-center justify-center rounded-xl border border-olive px-2 font-bold text-[12px] text-olive lg:col-auto lg:row-auto xl:h-9 xl:px-3"
                    onClick={() => onCycleOwner(item.id)}
                    type="button"
                  >
                    {t('management.packing.assign')}
                  </button>
                ) : (
                  <button
                    aria-label={t('actions.showMore')}
                    className="col-start-4 row-start-1 grid size-8 place-items-center justify-self-end rounded-xl text-muted transition hover:bg-paper hover:text-ink lg:col-auto lg:row-auto lg:justify-self-auto xl:size-9"
                    onClick={() => {
                      setSelectedItemId(item.id)
                      setDetailOpen(true)
                    }}
                    type="button"
                  >
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
            )
          })}
          {filteredItems.length === 0 ? (
            <EmptyState size="section" variant="embedded">
              {t('management.packing.emptyFiltered')}
            </EmptyState>
          ) : null}
        </div>

        <div className="mt-2.5 flex min-w-0 items-center gap-2 rounded-2xl bg-paper px-3 py-2.5 text-[12px] text-muted xl:mt-3 xl:px-4 xl:py-3 xl:text-[13px]">
          <Bulb className="shrink-0 text-[#c99a2a]" size={18} />
          <span className="min-w-0 flex-1 truncate">{t('management.packing.tip')}</span>
          <span className="shrink-0 font-bold text-olive">{t('actions.showMore')}</span>
          <ArrowRight className="shrink-0 text-olive" size={15} />
        </div>
      </section>

      {selectedItem && detailOpen ? (
        <Sheet className="grid content-start gap-3 sm:w-[430px] 2xl:gap-4">
          <section className="p-1">
            <div className="mb-3 flex items-center justify-between gap-3 xl:mb-4">
              <h2 className="font-extrabold text-[20px] leading-6 xl:text-[22px]">
                {packingItemTitle(selectedItem, t)}
              </h2>
              <button
                aria-label={t('actions.close')}
                className="grid size-8 place-items-center rounded-xl border border-line bg-white text-muted xl:size-9"
                onClick={() => setDetailOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {selectedItemImage ? (
              <img
                alt=""
                className="mb-3 h-[126px] w-full rounded-2xl border border-line object-cover xl:mb-4 xl:h-[176px]"
                src={selectedItemImage}
              />
            ) : (
              <div className="mb-3 grid h-[126px] w-full place-items-center rounded-2xl border border-line bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.96),rgba(226,236,220,0.78))] text-olive xl:mb-4 xl:h-[176px]">
                <Umbrella aria-hidden="true" size={52} />
              </div>
            )}

            <div className="mb-3 xl:mb-4">
              <h3 className="font-extrabold text-[14px] xl:text-[15px]">
                {t('management.packing.whyNeeded')}
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-muted xl:text-[13px]">
                {packingItemReason(selectedItem, t)}
              </p>
            </div>

            <dl className="grid gap-0 divide-y divide-line rounded-2xl border border-line bg-white text-[12px] xl:text-[14px]">
              {[
                [
                  CalendarDate,
                  t('management.packing.currentCarrier'),
                  selectedOwner ? (
                    <MemberChip
                      label={selectedOwner.displayName}
                      member={selectedOwner}
                      onClick={() => onCycleOwner(selectedItem.id)}
                    />
                  ) : (
                    t('management.packing.unassigned')
                  ),
                ],
                [
                  MapPoint,
                  t('management.packing.shareScope'),
                  t(`management.packing.visibility.${effectiveVisibility(selectedItem)}`),
                ],
                [
                  Route,
                  t('management.packing.relatedItinerary'),
                  selectedRelatedPlaces.length
                    ? selectedRelatedPlaces.map((place) => place.title).join(' / ')
                    : t('management.packing.notSet'),
                ],
                [
                  Briefcase,
                  t('management.packing.locationInBag'),
                  selectedBag?.name ?? t('management.packing.bag'),
                ],
              ].map(([Icon, label, value]) => {
                const RowIcon = Icon as IconComponent
                return (
                  <div
                    className="grid min-h-10 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 xl:min-h-12 xl:grid-cols-[30px_minmax(0,1fr)_auto] xl:px-3"
                    key={label as string}
                  >
                    <dt className="grid size-7 place-items-center rounded-xl bg-paper text-muted xl:size-8">
                      <RowIcon size={14} />
                    </dt>
                    <dd className="min-w-0 text-muted">{label}</dd>
                    <dd className="max-w-[132px] truncate font-extrabold text-ink xl:max-w-[220px]">
                      {value}
                    </dd>
                  </div>
                )
              })}
            </dl>

            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2 xl:mt-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]">
              <Button
                className="h-10 font-extrabold xl:h-12 xl:text-[14px]"
                icon={<Users size={16} />}
                onClick={() =>
                  currentMember && onToggleRecipient(selectedItem.id, currentMember.id)
                }
                variant="action"
              >
                {t('management.packing.assignToMe')}
              </Button>
              <Button
                className="h-10 font-extrabold xl:h-12 xl:text-[14px]"
                icon={<Paperclip size={16} />}
                variant="secondary"
              >
                {t('management.packing.linkAttachment')}
              </Button>
              <button
                aria-label={t('actions.showMore')}
                className="grid size-10 place-items-center rounded-xl border border-line bg-white text-muted xl:size-12"
                type="button"
              >
                <MoreH size={18} />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-3 shadow-sm xl:p-4">
            <div className="mb-2.5 flex items-center justify-between gap-3 xl:mb-3">
              <h2 className="font-extrabold text-[18px] leading-6 xl:text-[20px]">
                {t('management.packing.bagOverview')}
              </h2>
              <button className="font-bold text-[12px] text-olive xl:text-[13px]" type="button">
                {t('management.packing.details')} <ArrowRight className="inline" size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
              {bags.map((bag) => {
                const bagItems = items.filter((item) => effectiveBagId(item) === bag.id)
                const bagWeight = bagItems.reduce(
                  (sum, item) => sum + packingItemWeightKg(item, effectiveQuantity(item)),
                  0,
                )
                const firstOwner = memberById(members, bag.ownerIds[0] ?? '')
                return (
                  <button
                    className="grid min-h-[98px] gap-1.5 rounded-2xl border border-line bg-white p-2.5 text-left transition hover:bg-paper xl:min-h-[126px] xl:gap-2 xl:p-3"
                    key={bag.id}
                    type="button"
                  >
                    {firstOwner ? <Avatar member={firstOwner} size="md" /> : null}
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold text-[13px]">
                        {firstOwner?.displayName ?? t('management.packing.unassigned')}
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-muted">{bag.name}</span>
                    </span>
                    <span className="grid gap-1">
                      <span className="font-bold text-[12px] text-ink">
                        {formatWeightKg(bagWeight, t)}
                      </span>
                      <ProgressBar
                        className="h-1.5"
                        value={weightProgress(bagWeight, bag.weightLimitKg)}
                      />
                    </span>
                  </button>
                )
              })}
              <button
                className="grid min-h-[98px] place-items-center gap-1.5 rounded-2xl border border-dashed border-line bg-paper/60 p-2.5 text-center font-bold text-[12px] text-olive transition hover:bg-sage xl:min-h-[126px] xl:gap-2 xl:p-3 xl:text-[13px]"
                type="button"
              >
                <Plus size={22} />
                {t('management.packing.addBag')}
              </button>
            </div>
            <p className="mt-3 text-[12px] text-muted leading-5">
              {t('management.packing.bagHint')}
            </p>
          </section>
        </Sheet>
      ) : null}
    </div>
  )
}

function ShareView({
  bootstrap,
  members,
  reservations,
  packingItems,
  expenses,
  transports,
  tripId,
}: {
  bootstrap: ShadowBootstrap | null
  members: TravelMember[]
  reservations: ReservationRecord[]
  packingItems: PackingItemRecord[]
  expenses: ExpenseRecord[]
  transports: TransportSegment[]
  tripId: string
}) {
  const { t } = useTranslation()
  const [selectedMemberId, setSelectedMemberId] = useState(
    members.find((member) => member.current)?.id ?? members[0]?.id ?? '',
  )
  const [detailOpen, setDetailOpen] = useState(false)
  const [visibility, setVisibility] = useState({
    bookings: true,
    expenses: true,
    itinerary: true,
    packing: true,
    transport: true,
  })
  const selectedMember =
    members.find((member) => member.id === selectedMemberId) ??
    members.find((member) => member.current) ??
    members[0]
  const selectedReservations = selectedMember
    ? reservations.filter((reservation) => reservation.participantIds.includes(selectedMember.id))
    : []
  const selectedTransports = selectedMember
    ? transports.filter((transport) => transport.participantIds.includes(selectedMember.id))
    : []
  const selectedPackingItems = selectedMember
    ? packingItems.filter((item) => item.recipientIds.includes(selectedMember.id))
    : []
  const selectedExpenses = selectedMember
    ? expenses.filter((expense) => expense.participantIds.includes(selectedMember.id))
    : []
  const paidAmount = selectedExpenses
    .filter((expense) => selectedMember && expense.paidByMemberId === selectedMember.id)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const dueAmount = selectedExpenses.reduce((sum, expense) => sum + expenseShare(expense), 0)
  const confirmItems = [
    ...reservations
      .filter((reservation) => reservation.status === 'pending')
      .map((reservation) => ({
        icon: reservationIcons[reservation.kind],
        id: `reservation-${reservation.id}`,
        ownerId: reservation.ownerId,
        participantIds: reservation.participantIds,
        subtitle: t('management.bookings.status.pending'),
        title: reservation.title,
        tone: 'bg-coral text-white',
        visibility: t('management.share.visibility.all'),
      })),
    ...transports
      .filter((transport) => transport.status !== 'booked')
      .map((transport) => ({
        icon: transportIcons[transport.mode],
        id: `transport-${transport.id}`,
        ownerId: transportOwnerId(transport),
        participantIds: transport.participantIds,
        subtitle: t(`management.transport.status.${transport.status}`),
        title: transport.title,
        tone: 'bg-[#f0c400] text-ink',
        visibility: t('management.share.visibility.partial'),
      })),
    ...packingItems
      .filter((item) => !item.packed)
      .map((item) => ({
        icon: Briefcase,
        id: `packing-${item.id}`,
        ownerId: item.ownerId,
        participantIds: item.recipientIds,
        subtitle: t('management.packing.statusMissingShort'),
        title: item.name,
        tone: 'bg-olive text-white',
        visibility: t('management.share.visibility.all'),
      })),
  ].slice(0, 4)
  const visibilityModules = [
    { id: 'itinerary', icon: CalendarDate, labelKey: 'nav.itinerary' },
    { id: 'bookings', icon: Ticket, labelKey: 'nav.bookings' },
    { id: 'transport', icon: Tram, labelKey: 'nav.transport' },
    { id: 'expenses', icon: Wallet, labelKey: 'nav.expenses' },
    { id: 'packing', icon: Briefcase, labelKey: 'nav.packing' },
  ] as const

  if (!selectedMember) return <EmptyState size="page">{t('management.share.empty')}</EmptyState>

  return (
    <div className="grid gap-3">
      <section className="min-w-0">
        <section className="mb-3 rounded-2xl bg-white p-3.5 shadow-[0_8px_24px_rgba(34,55,48,0.06)]">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="font-extrabold text-[17px] leading-6">
              {t('management.share.travelers', { count: members.length })}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {members.map((member) => {
              const selected = member.id === selectedMember.id
              const statusKey = member.current
                ? 'owner'
                : member.role === 'planner'
                  ? 'confirmed'
                  : 'available'
              return (
                <button
                  className={cn(
                    'grid min-h-[132px] content-between rounded-2xl bg-white p-3 text-left ring-1 ring-transparent transition',
                    selected ? 'bg-sage/50 shadow-sm ring-olive/45' : 'hover:bg-paper/60',
                  )}
                  key={member.id}
                  onClick={() => {
                    setSelectedMemberId(member.id)
                    setDetailOpen(true)
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Avatar member={member} size="md" />
                    <span
                      className={cn(
                        'max-w-[58px] truncate rounded-full px-1.5 py-0.5 font-bold text-[10px]',
                        statusKey === 'owner' ? 'bg-sage text-olive' : 'bg-paper text-muted',
                      )}
                    >
                      {t(`management.share.memberStatus.${statusKey}`)}
                    </span>
                  </div>
                  <div>
                    <div className="truncate font-extrabold text-[15px] leading-5">
                      {member.displayName}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">
                      {t(`management.roles.${member.role}`)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                    <span className="size-2 rounded-full bg-olive" />
                    {t('management.share.today.available')}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-3.5 shadow-sm">
          <h2 className="mb-2.5 font-extrabold text-[18px] leading-6">
            {t('management.share.todayNeedsConfirm')}
          </h2>
          <div className="grid gap-2.5">
            {confirmItems.map((item) => {
              const Icon = item.icon
              const owner = memberById(members, item.ownerId)
              return (
                <button
                  className="grid min-h-[74px] grid-cols-[44px_minmax(0,1fr)_24px] items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-white p-2.5 text-left shadow-sm transition hover:border-olive/40 sm:grid-cols-[44px_minmax(0,1fr)_120px_112px_24px] xl:grid-cols-[44px_minmax(0,1fr)_120px_112px_92px_24px]"
                  key={item.id}
                  type="button"
                >
                  <span className={cn('grid size-11 place-items-center rounded-full', item.tone)}>
                    <Icon size={21} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-extrabold text-[15px] leading-5">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate font-bold text-[12px] text-coral">
                      {item.subtitle}
                    </span>
                  </span>
                  <span className="col-start-2 row-start-2 min-w-0 sm:col-auto sm:row-auto">
                    <span className="hidden text-[10px] text-muted sm:block">
                      {t('management.shared.participants')}
                    </span>
                    <AvatarStack ids={item.participantIds} members={members} />
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block text-[10px] text-muted">
                      {t('management.shared.owner')}
                    </span>
                    {owner ? <MemberChip member={owner} /> : null}
                  </span>
                  <span className="hidden min-w-0 truncate text-[12px] text-muted xl:block">
                    {item.visibility}
                  </span>
                  <ArrowRight
                    className="col-start-3 row-start-1 justify-self-end text-muted sm:col-auto sm:row-auto"
                    size={16}
                  />
                </button>
              )
            })}
            {!confirmItems.length ? (
              <EmptyState size="compact" variant="embedded">
                {t('management.share.nothingToConfirm')}
              </EmptyState>
            ) : null}
          </div>
          <button
            className="mx-auto mt-3 flex h-9 items-center gap-1.5 font-bold text-[12px] text-olive"
            type="button"
          >
            {t('management.share.viewAll')}
            <ChevronDown size={14} />
          </button>
        </section>
      </section>

      {detailOpen ? (
        <Sheet className="grid content-start gap-3 sm:w-[480px]">
          <section className="p-1">
            <div className="flex items-start justify-between gap-3 border-line border-b pb-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar member={selectedMember} size="md" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-extrabold text-[19px] leading-6">
                      {selectedMember.displayName}
                    </h2>
                    {selectedMember.current ? (
                      <span className="rounded-full bg-sage px-1.5 py-0.5 font-bold text-[10px] text-olive">
                        {t('management.share.memberStatus.owner')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {t(`management.roles.${selectedMember.role}`)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="inline-flex h-9 items-center rounded-xl border border-line bg-white px-3 font-bold text-[12px]"
                  type="button"
                >
                  {t('management.share.editProfile')}
                </button>
                <button
                  aria-label={t('actions.close')}
                  className="grid size-9 place-items-center rounded-xl border border-line bg-white text-muted"
                  onClick={() => setDetailOpen(false)}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <dl className="grid grid-cols-3 divide-x divide-line border-line border-b py-3 text-[11px]">
              <div>
                <dt className="text-muted">{t('management.share.todayStatus')}</dt>
                <dd className="mt-1 flex items-center gap-1.5 font-extrabold text-[12px]">
                  <span className="size-2 rounded-full bg-olive" />
                  {t('management.share.today.available')}
                </dd>
              </div>
              <div className="pl-4">
                <dt className="text-muted">{t('management.share.arrival')}</dt>
                <dd className="mt-1 font-extrabold text-[12px]">{t('management.share.noDelay')}</dd>
              </div>
              <div className="pl-4">
                <dt className="text-muted">{t('management.share.visibleScope')}</dt>
                <dd className="mt-1 font-extrabold text-[12px]">
                  {t('management.share.visibility.all')}
                </dd>
              </div>
            </dl>

            <div className="py-3">
              <h3 className="mb-2.5 font-extrabold text-[15px] leading-5">
                {t('management.share.responsibilities')}
              </h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <ResponsibilityCard
                  icon={<Tram size={20} />}
                  title={t('nav.transport')}
                  value={selectedTransports[0]?.serviceLabel ?? t('management.share.none')}
                />
                <ResponsibilityCard
                  icon={<Ticket size={20} />}
                  title={t('nav.bookings')}
                  value={selectedReservations[0]?.title ?? t('management.share.none')}
                />
                <ResponsibilityCard
                  icon={<Briefcase size={20} />}
                  title={t('nav.packing')}
                  value={
                    selectedPackingItems[0]
                      ? packingItemTitle(selectedPackingItems[0], t)
                      : t('management.share.none')
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper p-3">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h3 className="font-extrabold text-[15px] leading-5">
                  {t('management.share.costSplit')}
                </h3>
                <span className="text-[12px] text-muted">{t('settings.currency')}: EUR</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-line rounded-xl bg-white p-2.5 text-center text-[12px]">
                <div>
                  <div className="text-muted">{t('management.share.paid')}</div>
                  <div className="mt-1 font-extrabold text-olive">
                    <Money amount={paidAmount} currency="EUR" />
                  </div>
                </div>
                <div>
                  <div className="text-muted">{t('management.share.toPay')}</div>
                  <div className="mt-1 font-extrabold text-coral">
                    <Money amount={Math.max(0, dueAmount - paidAmount)} currency="EUR" />
                  </div>
                </div>
                <div>
                  <div className="text-muted">{t('management.share.shouldSplit')}</div>
                  <div className="mt-1 font-extrabold">
                    <Money amount={dueAmount} currency="EUR" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-line bg-white p-3">
              <div className="mb-2 font-extrabold text-[14px]">
                {t('management.share.carrying')}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2 text-[12px]">
                <span className="inline-flex items-center gap-2 font-bold text-[13px]">
                  <Briefcase size={16} />
                  {t('management.share.bagItems', { count: selectedPackingItems.length })}
                </span>
                <span className="text-[13px] text-muted">
                  {formatWeightKg(
                    selectedPackingItems.reduce(
                      (sum, item) => sum + packingItemWeightKg(item, item.quantity),
                      0,
                    ),
                    t,
                  )}{' '}
                  / 23 kg
                </span>
              </div>
            </div>

            <ActionBar className="mt-3" columns={3}>
              <Button icon={<CheckCircle size={16} />} variant="action">
                {t('management.share.setOwner')}
              </Button>
              <Button icon={<Globe size={16} />} variant="outline">
                {t('management.share.adjustVisibility')}
              </Button>
              <Button icon={<Users size={16} />} variant="outline">
                {t('management.transport.sendToGroup')}
              </Button>
            </ActionBar>
          </section>

          <section className="rounded-2xl border border-line bg-white p-3.5 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 className="font-extrabold text-[17px] leading-6">
                {t('management.share.visibleModules')}
              </h2>
              <button className="font-bold text-[12px] text-olive" type="button">
                {t('management.share.manage')}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {visibilityModules.map((module) => {
                const Icon = module.icon
                const enabled = visibility[module.id]
                return (
                  <button
                    aria-pressed={enabled}
                    className="grid min-h-[86px] place-items-center gap-1.5 rounded-2xl border border-line bg-white p-2 text-center transition hover:bg-paper"
                    key={module.id}
                    onClick={() =>
                      setVisibility((current) => ({
                        ...current,
                        [module.id]: !current[module.id],
                      }))
                    }
                    type="button"
                  >
                    <Icon size={20} />
                    <span className="font-extrabold text-[12px]">{t(module.labelKey)}</span>
                    <Switch checked={enabled} interactive={false} size="sm" />
                  </button>
                )
              })}
            </div>
          </section>
        </Sheet>
      ) : null}
    </div>
  )
}

function TripManagementContent({ section }: { section: ManagementSection }) {
  const { t } = useTranslation()
  const management = useTripManagement()
  const data = management.data

  if (management.isLoading || !data) {
    return <EmptyState size="page">{t('management.loading')}</EmptyState>
  }

  if (management.isError) {
    return <EmptyState size="page">{t('management.error')}</EmptyState>
  }

  if (section === 'transport') {
    return (
      <TransportDesignView
        members={data.members}
        places={data.places}
        transports={data.transports}
      />
    )
  }

  if (section === 'flash') {
    return <FlashDesignView />
  }

  if (section === 'bookings') {
    return (
      <BookingsDesignView
        expenses={data.expenses}
        members={data.members}
        onToggleParticipant={management.setReservationParticipant}
        places={data.places}
        reservations={data.reservations}
      />
    )
  }

  if (section === 'budget') {
    return (
      <BudgetView
        budgets={data.budgets}
        expenses={data.expenses}
        members={data.members}
        places={data.places}
        reservations={data.reservations}
        transports={data.transports}
      />
    )
  }

  if (section === 'expenses') {
    return (
      <ExpensesView
        expenses={data.expenses}
        members={data.members}
        onTogglePaid={management.markExpensePaid}
        onToggleParticipant={management.setExpenseParticipant}
        places={data.places}
        transfers={data.settlement.transfers}
      />
    )
  }

  if (section === 'packing') {
    return (
      <PackingView
        bags={data.packingBags}
        items={data.packingItems}
        members={data.members}
        onCycleOwner={management.cyclePackingOwner}
        onTogglePacked={management.togglePacked}
        onToggleRecipient={management.togglePackingRecipient}
        places={data.places}
      />
    )
  }

  return (
    <ShareView
      bootstrap={data.bootstrap}
      expenses={data.expenses}
      members={data.members}
      packingItems={data.packingItems}
      reservations={data.reservations}
      transports={data.transports}
      tripId={management.tripId!}
    />
  )
}

export function TripManagementPage({ section }: { section: ManagementSection }) {
  const { t } = useTranslation()
  const fabConfig: Record<ManagementSection, { icon: IconComponent; labelKey: string }> = {
    bookings: { icon: Ticket, labelKey: 'management.bookings.ledger.registerBooking' },
    budget: { icon: Wallet, labelKey: 'management.budget.dayPulse.addBudgetItem' },
    expenses: { icon: Receipt, labelKey: 'management.expenses.addExpense' },
    flash: { icon: Bolt, labelKey: 'management.flash.report' },
    packing: { icon: Briefcase, labelKey: 'management.packing.addItem' },
    share: { icon: Users, labelKey: 'management.share.invite' },
    transport: { icon: Tram, labelKey: 'management.transport.addArrangement' },
  }
  const ActionIcon = fabConfig[section].icon

  return (
    <TravelShell
      activeNav={section}
      topAction={
        <span className="hidden xl:inline-flex">
          <Button icon={<ActionIcon size={16} />} variant="action">
            {t(fabConfig[section].labelKey)}
          </Button>
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-24 pt-3 xl:p-4">
        <div className="mx-auto grid w-full max-w-[1480px] gap-3">
          <TripManagementContent section={section} />
        </div>
        <FloatingAddButton icon={fabConfig[section].icon} label={t(fabConfig[section].labelKey)} />
      </div>
    </TravelShell>
  )
}

export function TransportPage() {
  return <TripManagementPage section="transport" />
}

export function FlashPage() {
  return <TripManagementPage section="flash" />
}

export function BookingsPage() {
  return <TripManagementPage section="bookings" />
}

export function BudgetPage() {
  return <TripManagementPage section="budget" />
}

export function ExpensesPage() {
  return <TripManagementPage section="expenses" />
}

export function PackingPage() {
  return <TripManagementPage section="packing" />
}

export function SharePage() {
  return <TripManagementPage section="share" />
}
