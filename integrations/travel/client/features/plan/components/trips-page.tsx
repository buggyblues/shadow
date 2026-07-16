import { useQuery } from '@tanstack/react-query'
import { type ChangeEvent, type FormEvent, type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../../../components/avatar-group.js'
import { Button } from '../../../components/button.js'
import { IconBadge } from '../../../components/icon-badge.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  CalendarAdd,
  CalendarDate,
  CheckCircle,
  Clock,
  DocumentUpload2,
  Edit2,
  Globe,
  type IconComponent,
  Language,
  MapPoint,
  Paperclip,
  Plus,
  Ticket,
  Users,
  Wallet,
  X,
} from '../../../components/icons.js'
import { MetricCard } from '../../../components/metric-card.js'
import { Money } from '../../../components/money.js'
import { Panel } from '../../../components/panel.js'
import { PanelHeader } from '../../../components/panel-header.js'
import { StatusBadge } from '../../../components/status-badge.js'
import { TextInput } from '../../../components/text-input.js'
import { TravelShell } from '../../../layouts/travel-shell.js'
import { useTravelPreferences } from '../../../store/preferences.js'
import { cn } from '../../../utils/class-names.js'
import { formatTemperature } from '../../../utils/units.js'
import { resolveDestinationProfile } from '../api/destination-knowledge.js'
import { fetchWeatherSummary } from '../api/providers.js'
import type { TravelMember } from '../api/trip-management.js'
import type {
  TravelTripAnnotation,
  TravelTripSummary,
  UpdateTravelTripInput,
} from '../api/trips.js'
import { useTravelWorkspace } from '../hooks/use-travel-workspace.js'
import { TripCreateDialog } from './trip-create-dialog.js'

function TripStatusPill({ status }: { status: TravelTripSummary['status'] }) {
  const { t } = useTranslation()
  return (
    <StatusBadge tone={status === 'active' ? 'success' : 'neutral'}>
      {t(`trips.status.${status}`)}
    </StatusBadge>
  )
}

function TripStats({ trip }: { trip: TravelTripSummary }) {
  const { t } = useTranslation()
  const stats: Array<{ icon: IconComponent; label: string; value: ReactNode }> = [
    {
      icon: MapPoint,
      label: t('trips.stats.places'),
      value: String(trip.placeCount),
    },
    {
      icon: Ticket,
      label: t('trips.stats.reservations'),
      value: String(trip.reservationCount),
    },
    {
      icon: Wallet,
      label: t('trips.stats.budget'),
      value: <Money amount={trip.expenseTotal} currency={trip.currency} />,
    },
    {
      icon: Users,
      label: t('trips.stats.members'),
      value: String(trip.memberIds.length),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <MetricCard icon={stat.icon} key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  )
}

function readImageFile(file: File, onLoad: (dataUrl: string) => void) {
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    if (typeof reader.result === 'string') onLoad(reader.result)
  })
  reader.readAsDataURL(file)
}

function formatLocalTime(timezone?: string) {
  if (!timezone) return ''
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
      timeZoneName: 'short',
    }).format(new Date())
  } catch {
    return ''
  }
}

function TripProfileDialog({
  members,
  onClose,
  onSave,
  trip,
}: {
  members: TravelMember[]
  onClose: () => void
  onSave: (patch: UpdateTravelTripInput) => Promise<unknown>
  trip: TravelTripSummary
}) {
  const { t } = useTranslation()
  const coverInputId = useId()
  const destinationInputId = useId()
  const [title, setTitle] = useState(trip.title)
  const [destination, setDestination] = useState(trip.destination)
  const [description, setDescription] = useState(trip.description ?? '')
  const [startDate, setStartDate] = useState(trip.startDate ?? '')
  const [endDate, setEndDate] = useState(trip.endDate ?? '')
  const [coverImage, setCoverImage] = useState(trip.coverImage)
  const [destinationPhoto, setDestinationPhoto] = useState(trip.destinationPhoto ?? '')
  const [memberIds, setMemberIds] = useState(trip.memberIds)
  const [saving, setSaving] = useState(false)
  const toggleMember = (memberId: string) => {
    setMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((value) => value !== memberId)
        : [...current, memberId],
    )
  }
  const uploadImage = (event: ChangeEvent<HTMLInputElement>, setter: (value: string) => void) => {
    const file = event.target.files?.[0]
    if (!file) return
    readImageFile(file, setter)
    event.target.value = ''
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const destinationChanged = destination.trim() !== trip.destination
      const profile = destinationChanged ? resolveDestinationProfile(destination) : null
      await onSave({
        coverImage,
        currency: profile?.currency ?? trip.currency,
        description,
        destination,
        destinationPhoto: destinationPhoto || undefined,
        endDate,
        etiquetteNotes: profile?.etiquetteNotes ?? trip.etiquetteNotes,
        language: profile?.language ?? trip.language,
        memberIds,
        startDate,
        tabooNotes: profile?.tabooNotes ?? trip.tabooNotes,
        timezone: profile?.timezone ?? trip.timezone,
        title,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[6800] grid place-items-center bg-ink/20 px-3 py-4 backdrop-blur-sm">
      <form
        className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_70px_rgba(37,35,30,0.22)]"
        onSubmit={submit}
      >
        <div className="flex items-center justify-between gap-3 border-line border-b p-4">
          <div className="min-w-0">
            <h2 className="truncate font-extrabold text-[18px] leading-6">
              {t('trips.profile.title')}
            </h2>
            <p className="text-[12px] text-muted leading-4">{t('trips.profile.subtitle')}</p>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="grid content-start gap-3">
              <div className="grid gap-2">
                <img alt="" className="h-32 w-full rounded-xl object-cover" src={coverImage} />
                <input
                  accept="image/*"
                  className="sr-only"
                  id={coverInputId}
                  onChange={(event) => uploadImage(event, setCoverImage)}
                  type="file"
                />
                <label
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-paper px-3 font-bold text-[12px] transition hover:bg-sage"
                  htmlFor={coverInputId}
                >
                  <DocumentUpload2 size={15} />
                  {t('trips.profile.uploadCover')}
                </label>
              </div>
              <div className="grid gap-2">
                {destinationPhoto ? (
                  <img
                    alt=""
                    className="h-24 w-full rounded-xl object-cover"
                    src={destinationPhoto}
                  />
                ) : (
                  <div className="grid h-24 place-items-center rounded-xl border border-dashed border-line bg-paper text-[12px] text-muted">
                    {t('trips.profile.noDestinationPhoto')}
                  </div>
                )}
                <input
                  accept="image/*"
                  className="sr-only"
                  id={destinationInputId}
                  onChange={(event) => uploadImage(event, setDestinationPhoto)}
                  type="file"
                />
                <label
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-paper px-3 font-bold text-[12px] transition hover:bg-sage"
                  htmlFor={destinationInputId}
                >
                  <Paperclip size={15} />
                  {t('trips.profile.uploadDestination')}
                </label>
              </div>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="font-bold text-[12px] text-muted">
                  {t('trips.create.tripName')}
                </span>
                <TextInput
                  aria-label={t('trips.create.tripName')}
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="font-bold text-[12px] text-muted">
                  {t('trips.create.destination')}
                </span>
                <TextInput
                  aria-label={t('trips.create.destination')}
                  onChange={(event) => setDestination(event.target.value)}
                  value={destination}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="font-bold text-[12px] text-muted">
                  {t('trips.profile.description')}
                </span>
                <textarea
                  aria-label={t('trips.profile.description')}
                  className="min-h-[96px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[13px] leading-5 outline-none transition focus:border-olive focus:ring-4 focus:ring-olive/10"
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="font-bold text-[12px] text-muted">
                    {t('trips.create.startDate')}
                  </span>
                  <input
                    aria-label={t('trips.create.startDate')}
                    className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] outline-none transition focus:border-olive focus:ring-4 focus:ring-olive/10"
                    onChange={(event) => setStartDate(event.target.value)}
                    type="date"
                    value={startDate}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="font-bold text-[12px] text-muted">
                    {t('trips.create.endDate')}
                  </span>
                  <input
                    aria-label={t('trips.create.endDate')}
                    className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] outline-none transition focus:border-olive focus:ring-4 focus:ring-olive/10"
                    onChange={(event) => setEndDate(event.target.value)}
                    type="date"
                    value={endDate}
                  />
                </label>
              </div>
              <div>
                <div className="mb-2 font-bold text-[12px] text-muted">
                  {t('trips.profile.companions')}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((member) => (
                    <button
                      aria-pressed={memberIds.includes(member.id)}
                      className={cn(
                        'flex h-11 items-center gap-2 rounded-xl border px-2.5 text-left transition',
                        memberIds.includes(member.id)
                          ? 'border-olive bg-sage text-olive'
                          : 'border-line bg-white hover:bg-paper',
                      )}
                      key={member.id}
                      onClick={() => toggleMember(member.id)}
                      type="button"
                    >
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-full font-extrabold text-white text-[11px]"
                        style={{ backgroundColor: member.avatarColor }}
                      >
                        {member.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold text-[12px]">
                        {member.displayName}
                      </span>
                      {memberIds.includes(member.id) ? <CheckCircle size={14} /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-line border-t p-4">
          <button
            className="h-10 rounded-xl border border-line bg-white px-3 font-bold text-[13px] transition hover:bg-sage"
            onClick={onClose}
            type="button"
          >
            {t('actions.close')}
          </button>
          <button
            className="h-10 rounded-xl bg-olive px-4 font-bold text-[13px] text-white transition disabled:opacity-40"
            disabled={saving}
            type="submit"
          >
            {saving ? t('trips.profile.saving') : t('actions.saveChanges')}
          </button>
        </div>
      </form>
    </div>
  )
}

function DestinationContextPanel({
  members,
  onAnnotate,
  trip,
}: {
  members: TravelMember[]
  onAnnotate: (annotations: TravelTripAnnotation[]) => Promise<unknown>
  trip: TravelTripSummary
}) {
  const { t } = useTranslation()
  const preferences = useTravelPreferences()
  const [annotation, setAnnotation] = useState('')
  const weather = useQuery({
    enabled: Boolean(trip.destinationCoordinates),
    queryFn: () =>
      fetchWeatherSummary({
        coordinates: trip.destinationCoordinates,
        date: new Date().toISOString().slice(0, 10),
        detailed: true,
        lang: preferences.language,
      }).catch(() => null),
    queryKey: ['travel', 'trip-destination-weather', trip.id, trip.destinationCoordinates],
    staleTime: 15 * 60 * 1000,
  })
  const localTime = formatLocalTime(trip.timezone || weather.data?.timezone)
  const weatherWind =
    weather.data?.windspeed_10m_max ?? weather.data?.wind_max ?? weather.data?.windspeed_10m
  const weatherAqi = weather.data?.airQuality?.aqi ?? weather.data?.air_quality?.aqi
  const submitAnnotation = async () => {
    const body = annotation.trim()
    if (!body) return
    const currentMember = members.find((member) => member.current) ?? members[0]
    await onAnnotate([
      ...(trip.sharedAnnotations ?? []),
      {
        authorName: currentMember?.displayName ?? t('identity.anonymous'),
        body,
        createdAt: new Date().toISOString(),
        id: `annotation-${Date.now()}`,
        visibility: 'space',
      },
    ])
    setAnnotation('')
  }

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Panel>
        <PanelHeader className="mb-3" icon={Globe} title={t('trips.destination.title')} />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-paper p-3">
            <div className="mb-1 flex items-center gap-1.5 text-muted">
              <Clock size={14} />
              <span className="font-bold text-[11px]">{t('trips.destination.localTime')}</span>
            </div>
            <div className="font-extrabold text-[18px] leading-6">
              {localTime || t('trips.destination.unavailable')}
            </div>
          </div>
          <div className="rounded-xl bg-paper p-3">
            <div className="mb-1 flex items-center gap-1.5 text-muted">
              <Wallet size={14} />
              <span className="font-bold text-[11px]">{t('trips.destination.exchange')}</span>
            </div>
            <div className="font-extrabold text-[18px] leading-6">
              <Money amount={1} currency={trip.currency} />
            </div>
          </div>
          <div className="rounded-xl bg-paper p-3">
            <div className="mb-1 flex items-center gap-1.5 text-muted">
              <Language size={14} />
              <span className="font-bold text-[11px]">{t('trips.destination.language')}</span>
            </div>
            <div className="font-extrabold text-[15px] leading-5">
              {trip.language ?? t('trips.destination.unavailable')}
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-paper p-3">
          <div className="mb-2 font-bold text-[12px] text-muted">
            {t('trips.destination.weather')}
          </div>
          {weather.data ? (
            <div className="grid gap-2 text-[12px] sm:grid-cols-4">
              <strong className="text-[20px] text-ink">
                {formatTemperature(
                  weather.data.temp ?? weather.data.temp_max ?? 0,
                  preferences.temperatureUnit,
                )}
              </strong>
              <span>{weather.data.description ?? weather.data.main}</span>
              <span>
                {t('weather.wind')}: {weatherWind ?? '-'}
              </span>
              <span>
                {t('weather.aqi')}: {weatherAqi ?? t('trips.destination.unavailable')}
              </span>
            </div>
          ) : (
            <div className="text-[12px] text-muted">{t('weather.unavailable')}</div>
          )}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <h3 className="mb-2 font-extrabold text-[13px]">{t('trips.destination.etiquette')}</h3>
            <ul className="grid gap-1.5 text-[12px] text-muted leading-5">
              {(trip.etiquetteNotes ?? []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-line p-3">
            <h3 className="mb-2 font-extrabold text-[13px]">{t('trips.destination.taboos')}</h3>
            <ul className="grid gap-1.5 text-[12px] text-muted leading-5">
              {(trip.tabooNotes ?? []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
      <Panel as="aside">
        <PanelHeader className="mb-3" icon={Paperclip} title={t('trips.destination.annotations')} />
        <div className="grid gap-2">
          {(trip.sharedAnnotations ?? []).map((item) => (
            <div className="rounded-xl bg-paper p-3 text-[12px]" key={item.id}>
              <p className="text-ink leading-5">{item.body}</p>
              <div className="mt-2 text-[11px] text-muted">{item.authorName}</div>
            </div>
          ))}
          {!(trip.sharedAnnotations ?? []).length ? (
            <div className="rounded-xl bg-paper p-3 text-[12px] text-muted">
              {t('trips.destination.noAnnotations')}
            </div>
          ) : null}
          <textarea
            aria-label={t('trips.destination.addAnnotation')}
            className="min-h-[88px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[13px] leading-5 outline-none transition focus:border-olive"
            onChange={(event) => setAnnotation(event.target.value)}
            placeholder={t('trips.destination.annotationPlaceholder')}
            value={annotation}
          />
          <button
            className="h-10 rounded-xl bg-olive px-3 font-bold text-[12px] text-white transition disabled:opacity-40"
            disabled={!annotation.trim()}
            onClick={() => void submitAnnotation()}
            type="button"
          >
            {t('trips.destination.addAnnotation')}
          </button>
        </div>
      </Panel>
    </section>
  )
}

function TripCard({
  active,
  onSelect,
  trip,
}: {
  active: boolean
  onSelect: () => void
  trip: TravelTripSummary
}) {
  const { t } = useTranslation()
  return (
    <article
      className={cn(
        'rounded-2xl border bg-white p-3 shadow-sm transition',
        active ? 'border-olive/30 shadow-[0_12px_34px_rgba(115,120,66,0.12)]' : 'border-line',
      )}
    >
      <div className="flex gap-3">
        <img
          alt=""
          className="size-20 rounded-xl object-cover"
          src={trip.destinationPhoto ?? trip.coverImage}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-extrabold text-[16px] leading-6">{trip.title}</h3>
              <p className="truncate text-[12px] text-muted">
                {trip.destination} · {trip.dateLabel}
              </p>
            </div>
            <TripStatusPill status={trip.status} />
          </div>
          <div className="mt-3">
            <TripStats trip={trip} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {t('trips.updated', { value: trip.updatedLabel })}
        </span>
        <button
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 font-bold text-[12px] transition',
            active ? 'bg-sage text-olive' : 'border border-line bg-white hover:bg-sage',
          )}
          onClick={onSelect}
          type="button"
        >
          {active ? <CheckCircle size={14} /> : <CalendarDate size={14} />}
          {active ? t('trips.actions.currentTrip') : t('trips.actions.switchTrip')}
        </button>
      </div>
    </article>
  )
}

export function TripsPage() {
  const { t } = useTranslation()
  const workspace = useTravelWorkspace()
  const [createOpen, setCreateOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const currentTrip = workspace.currentTrip

  return (
    <TravelShell activeNav="trips">
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-28 pt-3 xl:p-4">
        <div className="mx-auto grid max-w-[1200px] gap-3">
          <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-1 py-2">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <IconBadge>
                <CalendarDate size={20} />
              </IconBadge>
              <div className="min-w-0">
                <h1 className="truncate font-extrabold text-[20px] leading-7">
                  {t('trips.page.title')}
                </h1>
                <p className="max-w-2xl text-[13px] text-muted leading-5">
                  {t('trips.page.subtitle')}
                </p>
              </div>
            </div>
            <Button icon={<Plus size={15} />} onClick={() => setCreateOpen(true)} variant="action">
              {t('trips.actions.addTrip')}
            </Button>
          </header>

          {currentTrip ? (
            <Panel className="overflow-hidden" padding="none">
              <div className="grid lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.4fr)]">
                <div className="relative min-h-[220px] overflow-hidden lg:min-h-[310px]">
                  <img
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                    src={currentTrip.destinationPhoto ?? currentTrip.coverImage}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,39,34,0.08)_20%,rgba(11,39,34,0.82)_100%)]" />
                  <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full border border-white/18 bg-[#173a35]/72 px-3 py-1.5 font-bold text-[11px] text-white backdrop-blur-md">
                    <CheckCircle size={14} />
                    {t('trips.page.current')}
                  </div>
                  <div className="absolute inset-x-5 bottom-5 text-white">
                    <div className="mb-1 flex items-center gap-1.5 font-bold text-[11px] text-white/76 uppercase tracking-[0.08em]">
                      <MapPoint size={14} />
                      {currentTrip.destination}
                    </div>
                    <div className="font-serif font-bold text-[28px] leading-8 tracking-[-0.02em]">
                      {currentTrip.dateLabel}
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col p-4 lg:p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <TripStatusPill status={currentTrip.status} />
                      <h2 className="mt-3 text-balance font-serif font-bold text-[30px] leading-9 tracking-[-0.025em]">
                        {currentTrip.title}
                      </h2>
                    </div>
                    <Button
                      className="shrink-0"
                      icon={<Edit2 size={14} />}
                      onClick={() => setProfileOpen(true)}
                      size="sm"
                    >
                      {t('trips.actions.editProfile')}
                    </Button>
                  </div>

                  {currentTrip.description ? (
                    <p className="mt-2 max-w-[680px] text-[13px] text-muted leading-5">
                      {currentTrip.description}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    <TripStats trip={currentTrip} />
                  </div>

                  <div className="mt-auto pt-4">
                    <div className="mb-2 font-bold text-[10px] text-muted uppercase tracking-[0.08em]">
                      {t('trips.stats.members')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTrip.memberIds.map((memberId) => {
                        const member = workspace.members.find((item) => item.id === memberId)
                        if (!member) return null
                        return (
                          <span
                            className="inline-flex h-8 items-center gap-2 rounded-full border border-line/70 bg-paper/65 px-2 font-bold text-[11px]"
                            key={member.id}
                          >
                            <UserAvatar
                              person={{
                                color: member.avatarColor,
                                id: member.id,
                                name: member.displayName,
                              }}
                            />
                            {member.displayName}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          {currentTrip ? (
            <DestinationContextPanel
              members={workspace.members}
              onAnnotate={(sharedAnnotations) =>
                workspace.updateTrip(currentTrip.id, { sharedAnnotations })
              }
              trip={currentTrip}
            />
          ) : null}

          <Panel>
            <div className="mb-3 flex items-center gap-2">
              <IconBadge size="sm">
                <CalendarAdd size={16} />
              </IconBadge>
              <h2 className="font-extrabold text-[15px] leading-5">{t('trips.page.allTrips')}</h2>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {workspace.trips.map((trip) => (
                <TripCard
                  active={trip.id === currentTrip?.id}
                  key={trip.id}
                  onSelect={() => {
                    void workspace.selectTrip(trip.id)
                  }}
                  trip={trip}
                />
              ))}
            </div>
          </Panel>
        </div>
      </div>
      {createOpen ? <TripCreateDialog onClose={() => setCreateOpen(false)} /> : null}
      {profileOpen && currentTrip ? (
        <TripProfileDialog
          members={workspace.members}
          onClose={() => setProfileOpen(false)}
          onSave={(patch) => workspace.updateTrip(currentTrip.id, patch)}
          trip={currentTrip}
        />
      ) : null}
    </TravelShell>
  )
}
