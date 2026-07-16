import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AvatarGroup } from '../../../components/avatar-group.js'
import { Button } from '../../../components/button.js'
import { EmptyState } from '../../../components/empty-state.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  Bookmark,
  CalendarDate,
  CheckCircle,
  ChevronRight,
  Edit2,
  MapPoint,
  Pin,
  Plus,
  Search,
  Ticket,
  Users,
  Wallet,
  X,
} from '../../../components/icons.js'
import { Money } from '../../../components/money.js'
import { Sheet } from '../../../components/sheet.js'
import { StatusBadge } from '../../../components/status-badge.js'
import { TextInput } from '../../../components/text-input.js'
import { usePersistentTripState } from '../../../hooks/use-persistent-trip-state.js'
import { TravelShellTopAction } from '../../../layouts/travel-shell.js'
import { cn } from '../../../utils/class-names.js'
import type { TravelMember } from '../api/trip-management.js'
import type { TravelTripSummary, UpdateTravelTripInput } from '../api/trips.js'
import { useTravelWorkspace } from '../hooks/use-travel-workspace.js'
import { MemberAssignment } from './member-assignment.js'
import { TripCreateDialog } from './trip-create-dialog.js'

function tripMembers(
  trip: TravelTripSummary,
  members: ReturnType<typeof useTravelWorkspace>['members'],
) {
  return members
    .filter((member) => trip.memberIds.includes(member.id))
    .map((member) => ({
      avatarUrl: member.avatarUrl,
      color: member.avatarColor,
      id: member.id,
      name: member.displayName,
    }))
}

function TripListItem({
  current,
  onSelect,
  pinned,
  selected,
  trip,
}: {
  current: boolean
  onSelect: () => void
  pinned: boolean
  selected: boolean
  trip: TravelTripSummary
}) {
  return (
    <button
      className={cn(
        'grid min-w-[260px] grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-[16px] p-2 text-left transition xl:min-w-0',
        selected ? 'bg-sage shadow-[0_8px_22px_rgba(49,92,80,0.1)]' : 'hover:bg-paper',
      )}
      onClick={onSelect}
      type="button"
    >
      <img
        alt=""
        className="h-16 w-[72px] rounded-[12px] object-cover"
        src={trip.destinationPhoto ?? trip.coverImage}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <strong className="min-w-0 flex-1 truncate text-[13px]">{trip.title}</strong>
          {pinned ? <Pin className="text-olive" size={12} /> : null}
          {current ? <span className="size-2 rounded-full bg-coral" /> : null}
        </span>
        <span className="mt-1 block truncate text-[10px] text-muted">{trip.destination}</span>
        <span className="mt-1 block truncate text-[10px] text-muted">{trip.dateLabel}</span>
      </span>
    </button>
  )
}

function TripEditSheet({
  focus,
  members,
  onClose,
  onSave,
  trip,
}: {
  focus: 'details' | 'travelers'
  members: TravelMember[]
  onClose: () => void
  onSave: (patch: UpdateTravelTripInput) => Promise<unknown>
  trip: TravelTripSummary
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(trip.title)
  const [destination, setDestination] = useState(trip.destination)
  const [description, setDescription] = useState(trip.description ?? '')
  const [startDate, setStartDate] = useState(trip.startDate ?? '')
  const [endDate, setEndDate] = useState(trip.endDate ?? '')
  const [memberIds, setMemberIds] = useState(trip.memberIds)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !destination.trim() || saving) return
    setSaving(true)
    setSaveError(false)
    try {
      await onSave({ description, destination, endDate, memberIds, startDate, title })
      onClose()
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet className="sm:w-[430px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">{t('tripManager.edit.eyebrow')}</div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {focus === 'travelers' ? t('tripManager.editTravelers') : t('tripManager.edit.title')}
            </h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {focus === 'travelers' ? (
          <div className="mt-6">
            <MemberAssignment
              label={t('tripManager.travelers')}
              members={members}
              onChange={setMemberIds}
              selectedIds={memberIds}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            <label className="grid gap-1.5">
              <span className="font-bold text-[11px] text-muted">
                {t('tripManager.fields.name')}
              </span>
              <TextInput
                aria-label={t('tripManager.fields.name')}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="font-bold text-[11px] text-muted">
                {t('tripManager.fields.destination')}
              </span>
              <TextInput
                aria-label={t('tripManager.fields.destination')}
                leadingIcon={<MapPoint size={16} />}
                onChange={(event) => setDestination(event.target.value)}
                value={destination}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1.5">
                <span className="font-bold text-[11px] text-muted">
                  {t('tripManager.fields.start')}
                </span>
                <TextInput
                  aria-label={t('tripManager.fields.start')}
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="font-bold text-[11px] text-muted">
                  {t('tripManager.fields.end')}
                </span>
                <TextInput
                  aria-label={t('tripManager.fields.end')}
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="font-bold text-[11px] text-muted">
                {t('tripManager.fields.description')}
              </span>
              <textarea
                className="min-h-28 resize-none rounded-[14px] border border-line bg-white px-3 py-2 text-[13px] outline-none transition focus:border-olive"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
            <MemberAssignment
              label={t('tripManager.travelers')}
              members={members}
              onChange={setMemberIds}
              selectedIds={memberIds}
            />
          </div>
        )}
        <Button
          className="mt-5 w-full"
          disabled={saving || !title.trim() || !destination.trim()}
          size="lg"
          type="submit"
          variant="action"
        >
          {saving ? t('tripManager.edit.saving') : t('actions.saveChanges')}
        </Button>
        {saveError ? (
          <div aria-live="polite" className="mt-3 text-center font-bold text-[11px] text-coral">
            {t('tripManager.edit.error')}
          </div>
        ) : null}
      </form>
    </Sheet>
  )
}

export function TripManagerPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useTravelWorkspace()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [allTripsOpen, setAllTripsOpen] = useState(false)
  const [editFocus, setEditFocus] = useState<'details' | 'travelers'>('details')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'active' | 'all' | 'archived' | 'completed' | 'planning'
  >('all')
  const [pinnedTripIds, setPinnedTripIds] = usePersistentTripState<string[]>(
    undefined,
    'pinned-trips',
    [],
  )
  const [archivedTripIds, setArchivedTripIds] = usePersistentTripState<string[]>(
    undefined,
    'archived-trips',
    [],
  )
  const filteredTrips = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return workspace.trips
      .filter((trip) => {
        const archived = archivedTripIds.includes(trip.id)
        return (
          (statusFilter === 'archived'
            ? archived
            : !archived && (statusFilter === 'all' || trip.status === statusFilter)) &&
          (!normalizedQuery ||
            trip.title.toLowerCase().includes(normalizedQuery) ||
            trip.destination.toLowerCase().includes(normalizedQuery))
        )
      })
      .sort(
        (left, right) =>
          Number(pinnedTripIds.includes(right.id)) - Number(pinnedTripIds.includes(left.id)),
      )
  }, [archivedTripIds, pinnedTripIds, query, statusFilter, workspace.trips])
  useEffect(() => {
    if (selectedId && workspace.trips.some((trip) => trip.id === selectedId)) return
    setSelectedId(workspace.currentTrip?.id ?? workspace.trips[0]?.id ?? null)
  }, [selectedId, workspace.currentTrip?.id, workspace.trips])
  const selectedTrip =
    workspace.trips.find((trip) => trip.id === selectedId) ?? workspace.currentTrip
  useEffect(() => {
    setDeleteConfirmOpen(false)
    setDeleteError(false)
  }, [selectedTrip?.id])

  return (
    <>
      <TravelShellTopAction>
        <Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)} variant="action">
          {t('tripManager.create')}
        </Button>
      </TravelShellTopAction>
      <div className="min-h-0 flex-1 overflow-auto p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-4 xl:overflow-hidden xl:p-5">
        <div className="mx-auto grid h-full w-full max-w-[1260px] min-h-0 min-w-0 gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <section className="travel-surface min-h-0 min-w-0 overflow-hidden p-3 sm:p-4 xl:overflow-auto">
            <TextInput
              aria-label={t('tripManager.list.search')}
              className="h-10"
              leadingIcon={<Search size={15} />}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('tripManager.list.search')}
              value={query}
            />
            <div className="my-3 flex gap-1 overflow-x-auto">
              {(['all', 'active', 'planning', 'completed', 'archived'] as const).map((status) => (
                <button
                  aria-pressed={statusFilter === status}
                  className={cn(
                    'h-8 shrink-0 rounded-full px-3 font-bold text-[11px] transition',
                    statusFilter === status ? 'bg-olive text-white' : 'bg-paper text-muted',
                  )}
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {status === 'all'
                    ? t('tripManager.list.all')
                    : status === 'archived'
                      ? t('tripManager.list.archived')
                      : t(`trips.status.${status}`)}
                </button>
              ))}
            </div>
            <button
              className="mb-2 flex h-9 w-full items-center justify-between rounded-[12px] bg-paper/70 px-3 font-bold text-[11px] text-olive xl:hidden"
              onClick={() => setAllTripsOpen(true)}
              type="button"
            >
              {t('tripManager.list.viewAll')}
              <ChevronRight size={14} />
            </button>
            <div className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:overflow-visible">
              {filteredTrips.map((trip) => (
                <TripListItem
                  current={trip.id === workspace.currentTrip?.id}
                  key={trip.id}
                  onSelect={() => setSelectedId(trip.id)}
                  pinned={pinnedTripIds.includes(trip.id)}
                  selected={trip.id === selectedTrip?.id}
                  trip={trip}
                />
              ))}
              {!filteredTrips.length ? (
                <EmptyState
                  action={
                    <Button
                      onClick={() => {
                        setQuery('')
                        setStatusFilter('all')
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {t('tripManager.list.clear')}
                    </Button>
                  }
                  className="min-w-[260px] xl:min-w-0"
                  description={t('tripManager.list.emptyHint')}
                  icon={<Search size={17} />}
                  size="compact"
                  title={t('tripManager.list.emptyTitle')}
                />
              ) : null}
            </div>
          </section>

          {selectedTrip ? (
            <section className="travel-surface min-w-0 overflow-hidden xl:min-h-0 xl:overflow-auto">
              <div className="relative h-44 sm:h-64">
                <img
                  alt=""
                  className="size-full object-cover"
                  src={selectedTrip.destinationPhoto ?? selectedTrip.coverImage}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,42,38,0.05)_15%,rgba(14,42,38,0.82)_100%)]" />
                <div className="absolute inset-x-4 bottom-4 text-white sm:inset-x-6 sm:bottom-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={selectedTrip.status === 'active' ? 'success' : 'neutral'}>
                      {t(`trips.status.${selectedTrip.status}`)}
                    </StatusBadge>
                    {selectedTrip.id === workspace.currentTrip?.id ? (
                      <span className="rounded-full bg-white/16 px-2.5 py-1 font-bold text-[10px] backdrop-blur">
                        {t('tripManager.current')}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-2 mb-0 font-serif text-[27px] leading-8 tracking-[-0.02em] sm:text-[32px] sm:leading-10">
                    {selectedTrip.title}
                  </h1>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/72">
                    <span className="inline-flex items-center gap-1">
                      <MapPoint size={13} />
                      {selectedTrip.destination}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDate size={13} />
                      {selectedTrip.dateLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    {
                      icon: MapPoint,
                      label: t('trips.stats.places'),
                      to: '/map' as const,
                      value: String(selectedTrip.placeCount),
                    },
                    {
                      icon: Ticket,
                      label: t('trips.stats.reservations'),
                      to: '/bookings' as const,
                      value: String(selectedTrip.reservationCount),
                    },
                    {
                      icon: Wallet,
                      label: t('trips.stats.budget'),
                      to: '/expenses' as const,
                      value: (
                        <Money
                          amount={selectedTrip.expenseTotal}
                          currency={selectedTrip.currency}
                        />
                      ),
                    },
                    {
                      icon: Users,
                      label: t('trips.stats.members'),
                      to: '/share' as const,
                      value: String(selectedTrip.memberIds.length),
                    },
                  ].map((stat) => {
                    const Icon = stat.icon
                    return (
                      <button
                        className="rounded-[16px] bg-paper/70 p-3 text-left transition hover:bg-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-olive"
                        key={stat.label}
                        onClick={() => void navigate({ to: stat.to })}
                        title={t('tripManager.statsHint')}
                        type="button"
                      >
                        <Icon className="text-olive" size={17} />
                        <strong className="mt-2 block text-[17px]">{stat.value}</strong>
                        <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                          {stat.label}
                          <ChevronRight size={13} />
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    <strong className="text-[12px] text-muted">{t('tripManager.about')}</strong>
                    <p className="mt-2 mb-0 line-clamp-2 text-[13px] text-ink/78 leading-6 sm:line-clamp-none">
                      {selectedTrip.description || t('tripManager.noDescription')}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-card)] bg-sage/45 p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-[12px]">{t('tripManager.travelers')}</strong>
                      <AvatarGroup items={tripMembers(selectedTrip, workspace.members)} max={4} />
                    </div>
                    <div className="mt-4 grid gap-2">
                      {selectedTrip.id !== workspace.currentTrip?.id ? (
                        <Button
                          icon={<CheckCircle size={16} />}
                          onClick={() => void workspace.selectTrip(selectedTrip.id)}
                          variant="action"
                        >
                          {t('tripManager.setCurrent')}
                        </Button>
                      ) : null}
                      <Button
                        icon={<Edit2 size={16} />}
                        onClick={() => {
                          setEditFocus('travelers')
                          setEditOpen(true)
                        }}
                        variant="outline"
                      >
                        {t('tripManager.editTravelers')}
                      </Button>
                      <Button
                        icon={<Edit2 size={16} />}
                        onClick={() => {
                          setEditFocus('details')
                          setEditOpen(true)
                        }}
                        variant="outline"
                      >
                        {t('tripManager.editAction')}
                      </Button>
                      <Button
                        onClick={() => {
                          setDeleteConfirmOpen(true)
                          setDeleteError(false)
                        }}
                        variant="danger"
                      >
                        {t('tripManager.delete')}
                      </Button>
                      {deleteConfirmOpen ? (
                        <section className="rounded-[16px] bg-coral/8 p-3" aria-live="polite">
                          <strong className="block text-[12px] text-coral">
                            {t('tripManager.deleteConfirm', { name: selectedTrip.title })}
                          </strong>
                          <p className="mt-1 mb-0 text-[10px] text-muted leading-5">
                            {t('tripManager.deleteHint')}
                          </p>
                          {deleteError ? (
                            <p className="mt-2 mb-0 text-[10px] font-bold text-coral" role="alert">
                              {t('tripManager.deleteError')}
                            </p>
                          ) : null}
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              disabled={deleting}
                              onClick={() => setDeleteConfirmOpen(false)}
                              variant="outline"
                            >
                              {t('actions.cancel')}
                            </Button>
                            <Button
                              disabled={deleting}
                              onClick={async () => {
                                setDeleting(true)
                                setDeleteError(false)
                                try {
                                  await workspace.deleteTrip(selectedTrip.id)
                                  setSelectedId(null)
                                  setDeleteConfirmOpen(false)
                                } catch {
                                  setDeleteError(true)
                                } finally {
                                  setDeleting(false)
                                }
                              }}
                              variant="danger"
                            >
                              {deleting ? t('tripManager.deleting') : t('actions.delete')}
                            </Button>
                          </div>
                        </section>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          icon={<Pin size={15} />}
                          onClick={() =>
                            setPinnedTripIds((ids) =>
                              ids.includes(selectedTrip.id)
                                ? ids.filter((id) => id !== selectedTrip.id)
                                : [...ids, selectedTrip.id],
                            )
                          }
                          variant="outline"
                        >
                          {pinnedTripIds.includes(selectedTrip.id)
                            ? t('tripManager.unpin')
                            : t('tripManager.pin')}
                        </Button>
                        <Button
                          icon={<Bookmark size={15} />}
                          onClick={() => {
                            setArchivedTripIds((ids) =>
                              ids.includes(selectedTrip.id)
                                ? ids.filter((id) => id !== selectedTrip.id)
                                : [...ids, selectedTrip.id],
                            )
                            setStatusFilter('all')
                          }}
                          variant="outline"
                        >
                          {archivedTripIds.includes(selectedTrip.id)
                            ? t('tripManager.restore')
                            : t('tripManager.archive')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
      {createOpen ? (
        <TripCreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(trip) => setSelectedId(trip.id)}
        />
      ) : null}
      {allTripsOpen ? (
        <Sheet className="sm:w-[430px]" onClose={() => setAllTripsOpen(false)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] text-muted">{t('tripManager.list.eyebrow')}</div>
              <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
                {t('tripManager.list.viewAll')}
              </h2>
            </div>
            <IconButton label={t('actions.close')} onClick={() => setAllTripsOpen(false)}>
              <X size={18} />
            </IconButton>
          </div>
          <div className="mt-5 grid gap-2">
            {filteredTrips.map((trip) => (
              <TripListItem
                current={trip.id === workspace.currentTrip?.id}
                key={trip.id}
                onSelect={() => {
                  setSelectedId(trip.id)
                  setAllTripsOpen(false)
                }}
                pinned={pinnedTripIds.includes(trip.id)}
                selected={trip.id === selectedTrip?.id}
                trip={trip}
              />
            ))}
          </div>
        </Sheet>
      ) : null}
      {editOpen && selectedTrip ? (
        <TripEditSheet
          focus={editFocus}
          members={workspace.members}
          onClose={() => setEditOpen(false)}
          onSave={(patch) => workspace.updateTrip(selectedTrip.id, patch)}
          trip={selectedTrip}
        />
      ) : null}
    </>
  )
}
