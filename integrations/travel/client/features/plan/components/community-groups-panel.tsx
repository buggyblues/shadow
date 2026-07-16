import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/button.js'
import { EmptyState } from '../../../components/empty-state.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  CalendarDate,
  Chat,
  CheckCircle,
  ChecklistAlt,
  Edit2,
  MapPoint,
  Plus,
  Search,
  Users,
  Wallet,
  X,
} from '../../../components/icons.js'
import { Money } from '../../../components/money.js'
import { Sheet } from '../../../components/sheet.js'
import { StatusBadge } from '../../../components/status-badge.js'
import { TextInput } from '../../../components/text-input.js'
import { apiPost } from '../../../services/api-client.js'
import { travelShadowSpaceApp } from '../../../services/shadow-host.js'
import { createCommunityPoll, ensureCommunityChannel } from '../api/community.js'
import {
  applyToRecruitment,
  closeTravelIntent,
  getTripRecruitment,
  listRecruitments,
  listTravelIntents,
  type RecruitmentListing,
  reviewApplication,
  type TravelIntent,
  type TripJoinApplication,
  type TripRecruitment,
  type UpsertRecruitmentInput,
  updateJoinApplication,
  upsertTravelIntent,
  upsertTripRecruitment,
  withdrawApplication,
} from '../api/recruitment.js'
import type { TravelMember } from '../api/trip-management.js'
import type { TravelTripSummary } from '../api/trips.js'

const styleOptions = ['relaxed', 'intensive', 'food', 'photo', 'family', 'outdoor'] as const

function isoDateRange(start?: string, end?: string) {
  if (!start && !end) return '—'
  return [start, end].filter(Boolean).join(' – ')
}

function RecruitmentSettingsSheet({
  current,
  defaultCurrency,
  onClose,
  onSave,
}: {
  current?: TripRecruitment
  defaultCurrency: string
  onClose: () => void
  onSave: (input: UpsertRecruitmentInput) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    maxMembers: current?.maxMembers ?? 6,
    departureCity: current?.departureCity ?? '',
    flexibleDates: current?.flexibleDates ?? false,
    budgetMin: current?.budgetMin?.toString() ?? '',
    budgetMax: current?.budgetMax?.toString() ?? '',
    currency: current?.currency ?? defaultCurrency,
    styles: current?.styles ?? [],
    note: current?.note ?? '',
    questions: current?.questions.join('\n') ?? '',
    closesAt: current?.closesAt?.slice(0, 16) ?? '',
  })
  const toggleStyle = (style: string) =>
    setDraft((value) => ({
      ...value,
      styles: value.styles.includes(style)
        ? value.styles.filter((item) => item !== style)
        : [...value.styles, style],
    }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await onSave({
        status: 'open',
        maxMembers: draft.maxMembers,
        departureCity: draft.departureCity || undefined,
        flexibleDates: draft.flexibleDates,
        budgetMin: draft.budgetMin ? Number(draft.budgetMin) : undefined,
        budgetMax: draft.budgetMax ? Number(draft.budgetMax) : undefined,
        currency: draft.currency,
        styles: draft.styles,
        note: draft.note || undefined,
        questions: draft.questions
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        closesAt: draft.closesAt ? new Date(draft.closesAt).toISOString() : undefined,
        requiresApproval: true,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet className="sm:w-[480px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">{t('workspace.team.groups.manageEyebrow')}</div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {t('workspace.team.groups.manageTitle')}
            </h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-5 grid gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
            <TextInput
              aria-label={t('workspace.team.groups.departure')}
              leadingIcon={<MapPoint size={16} />}
              onChange={(event) =>
                setDraft((value) => ({ ...value, departureCity: event.target.value }))
              }
              placeholder={t('workspace.team.groups.departure')}
              value={draft.departureCity}
            />
            <TextInput
              aria-label={t('workspace.team.groups.capacity')}
              leadingIcon={<Users size={16} />}
              min="2"
              max="100"
              onChange={(event) =>
                setDraft((value) => ({ ...value, maxMembers: Number(event.target.value) || 2 }))
              }
              type="number"
              value={draft.maxMembers}
            />
          </div>
          <div className="grid grid-cols-[1fr_1fr_82px] gap-2">
            <TextInput
              aria-label={t('workspace.team.groups.budgetMin')}
              leadingIcon={<Wallet size={16} />}
              min="0"
              onChange={(event) =>
                setDraft((value) => ({ ...value, budgetMin: event.target.value }))
              }
              placeholder={t('workspace.team.groups.budgetMin')}
              type="number"
              value={draft.budgetMin}
            />
            <TextInput
              aria-label={t('workspace.team.groups.budgetMax')}
              leadingIcon={<Wallet size={16} />}
              min="0"
              onChange={(event) =>
                setDraft((value) => ({ ...value, budgetMax: event.target.value }))
              }
              placeholder={t('workspace.team.groups.budgetMax')}
              type="number"
              value={draft.budgetMax}
            />
            <TextInput
              aria-label={t('workspace.team.groups.currency')}
              leadingIcon={<Wallet size={16} />}
              maxLength={8}
              onChange={(event) =>
                setDraft((value) => ({ ...value, currency: event.target.value.toUpperCase() }))
              }
              value={draft.currency}
            />
          </div>
          <div>
            <div className="mb-2 font-bold text-[11px] text-muted">
              {t('workspace.team.groups.styles')}
            </div>
            <div className="flex flex-wrap gap-2">
              {styleOptions.map((style) => (
                <button
                  aria-pressed={draft.styles.includes(style)}
                  className={`h-9 rounded-full px-3 font-bold text-[11px] transition ${
                    draft.styles.includes(style) ? 'bg-olive text-white' : 'bg-paper text-muted'
                  }`}
                  key={style}
                  onClick={() => toggleStyle(style)}
                  type="button"
                >
                  {t(`workspace.team.groups.style.${style}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5 font-bold text-[11px] text-muted">
            {t('workspace.team.groups.note')}
            <textarea
              className="min-h-24 resize-none rounded-[14px] border border-line bg-white p-3 text-[13px] text-ink outline-none focus:border-olive"
              onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))}
              placeholder={t('workspace.team.groups.notePlaceholder')}
              value={draft.note}
            />
          </label>
          <label className="grid gap-1.5 font-bold text-[11px] text-muted">
            {t('workspace.team.groups.questions')}
            <textarea
              className="min-h-20 resize-none rounded-[14px] border border-line bg-white p-3 text-[13px] text-ink outline-none focus:border-olive"
              onChange={(event) =>
                setDraft((value) => ({ ...value, questions: event.target.value }))
              }
              placeholder={t('workspace.team.groups.questionsPlaceholder')}
              value={draft.questions}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex h-11 items-center gap-2 rounded-[14px] bg-paper px-3 text-[11px] font-bold">
              <input
                checked={draft.flexibleDates}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, flexibleDates: event.target.checked }))
                }
                type="checkbox"
              />
              {t('workspace.team.groups.flexibleDates')}
            </label>
            <TextInput
              aria-label={t('workspace.team.groups.closesAt')}
              leadingIcon={<CalendarDate size={16} />}
              onChange={(event) =>
                setDraft((value) => ({ ...value, closesAt: event.target.value }))
              }
              type="datetime-local"
              value={draft.closesAt}
            />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button onClick={onClose} variant="outline">
            {t('actions.cancel')}
          </Button>
          <Button disabled={saving} type="submit" variant="action">
            {saving ? t('common.loading') : t('workspace.team.groups.publish')}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function ApplicationSheet({
  listing,
  onClose,
  onSubmit,
}: {
  listing: RecruitmentListing
  onClose: () => void
  onSubmit: (input: {
    message?: string
    answers: Array<{ question: string; answer: string }>
  }) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [message, setMessage] = useState(listing.viewerApplication?.message ?? '')
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(
      (listing.viewerApplication?.answers ?? []).map((item) => [item.question, item.answer]),
    ),
  )
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        message: message || undefined,
        answers: listing.recruitment.questions.map((question) => ({
          question,
          answer: answers[question] ?? '',
        })),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet className="sm:w-[450px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">{listing.trip.title}</div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {t('workspace.team.groups.applyTitle')}
            </h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-5 grid gap-3">
          {listing.recruitment.questions.map((question) => (
            <label className="grid gap-1.5 font-bold text-[11px] text-muted" key={question}>
              {question}
              <TextInput
                leadingIcon={<ChecklistAlt size={16} />}
                required
                onChange={(event) =>
                  setAnswers((value) => ({ ...value, [question]: event.target.value }))
                }
                value={answers[question] ?? ''}
              />
            </label>
          ))}
          <label className="grid gap-1.5 font-bold text-[11px] text-muted">
            {t('workspace.team.groups.applicationMessage')}
            <textarea
              className="min-h-28 resize-none rounded-[14px] border border-line bg-white p-3 text-[13px] text-ink outline-none focus:border-olive"
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('workspace.team.groups.applicationPlaceholder')}
              value={message}
            />
          </label>
        </div>
        <Button className="mt-5 w-full" disabled={saving} type="submit" variant="action">
          {saving ? t('common.loading') : t('workspace.team.groups.submitApplication')}
        </Button>
      </form>
    </Sheet>
  )
}

function PollSheet({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (question: string, answers: string[]) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState(['', ''])
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validAnswers = answers.map((item) => item.trim()).filter(Boolean)
    if (!question.trim() || validAnswers.length < 2) return
    setSaving(true)
    try {
      await onCreate(question.trim(), validAnswers)
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet className="sm:w-[430px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">{t('workspace.team.groups.communityPoll')}</div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {t('workspace.team.groups.pollTitle')}
            </h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-5 grid gap-2">
          <TextInput
            aria-label={t('workspace.team.groups.pollQuestion')}
            leadingIcon={<ChecklistAlt size={16} />}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('workspace.team.groups.pollQuestion')}
            required
            value={question}
          />
          {answers.map((answer, index) => (
            <div className="flex gap-2" key={index}>
              <TextInput
                aria-label={t('workspace.team.groups.pollOption', { count: index + 1 })}
                className="flex-1"
                leadingIcon={<CheckCircle size={16} />}
                onChange={(event) =>
                  setAnswers((value) =>
                    value.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }
                placeholder={t('workspace.team.groups.pollOption', { count: index + 1 })}
                required={index < 2}
                value={answer}
              />
              {index > 1 ? (
                <IconButton
                  label={t('actions.delete')}
                  onClick={() => setAnswers((value) => value.filter((_, i) => i !== index))}
                >
                  <X size={16} />
                </IconButton>
              ) : null}
            </div>
          ))}
          {answers.length < 10 ? (
            <Button
              icon={<Plus size={14} />}
              onClick={() => setAnswers((value) => [...value, ''])}
              size="sm"
              variant="outline"
            >
              {t('workspace.team.groups.addOption')}
            </Button>
          ) : null}
        </div>
        <Button className="mt-5 w-full" disabled={saving} type="submit" variant="action">
          {saving ? t('common.loading') : t('workspace.team.groups.createPoll')}
        </Button>
      </form>
    </Sheet>
  )
}

function IntentSheet({
  current,
  defaultCurrency,
  onClose,
  onSave,
}: {
  current?: TravelIntent
  defaultCurrency: string
  onClose: () => void
  onSave: (input: Parameters<typeof upsertTravelIntent>[0]) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    destinations: current?.destinationLabels.join('、') ?? '',
    earliestDate: current?.earliestDate ?? '',
    latestDate: current?.latestDate ?? '',
    flexibleDates: current?.flexibleDates ?? true,
    budgetMax: current?.budgetMax?.toString() ?? '',
    currency: current?.currency ?? defaultCurrency,
    styles: current?.styles ?? [],
    note: current?.note ?? '',
  })
  const toggleStyle = (style: string) =>
    setDraft((value) => ({
      ...value,
      styles: value.styles.includes(style)
        ? value.styles.filter((item) => item !== style)
        : [...value.styles, style],
    }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const destinations = draft.destinations
      .split(/[、,，]/u)
      .map((item) => item.trim())
      .filter(Boolean)
    if (!destinations.length) return
    setSaving(true)
    try {
      await onSave({
        destinationLabels: destinations,
        earliestDate: draft.earliestDate || undefined,
        latestDate: draft.latestDate || undefined,
        flexibleDates: draft.flexibleDates,
        budgetMax: draft.budgetMax ? Number(draft.budgetMax) : undefined,
        currency: draft.currency,
        styles: draft.styles,
        note: draft.note || undefined,
        status: 'open',
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet className="sm:w-[450px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">{t('workspace.team.groups.intentEyebrow')}</div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {t('workspace.team.groups.intentTitle')}
            </h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-5 grid gap-3">
          <TextInput
            aria-label={t('workspace.team.groups.intentDestinations')}
            leadingIcon={<MapPoint size={16} />}
            onChange={(event) =>
              setDraft((value) => ({ ...value, destinations: event.target.value }))
            }
            placeholder={t('workspace.team.groups.intentDestinationsPlaceholder')}
            required
            value={draft.destinations}
          />
          <div className="grid grid-cols-2 gap-2">
            <TextInput
              aria-label={t('workspace.team.groups.intentEarliest')}
              leadingIcon={<CalendarDate size={16} />}
              onChange={(event) =>
                setDraft((value) => ({ ...value, earliestDate: event.target.value }))
              }
              type="date"
              value={draft.earliestDate}
            />
            <TextInput
              aria-label={t('workspace.team.groups.intentLatest')}
              leadingIcon={<CalendarDate size={16} />}
              onChange={(event) =>
                setDraft((value) => ({ ...value, latestDate: event.target.value }))
              }
              type="date"
              value={draft.latestDate}
            />
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <TextInput
              aria-label={t('workspace.team.groups.budgetMax')}
              leadingIcon={<Wallet size={16} />}
              min="0"
              onChange={(event) =>
                setDraft((value) => ({ ...value, budgetMax: event.target.value }))
              }
              placeholder={t('workspace.team.groups.budgetMax')}
              type="number"
              value={draft.budgetMax}
            />
            <TextInput
              aria-label={t('workspace.team.groups.currency')}
              leadingIcon={<Wallet size={16} />}
              onChange={(event) =>
                setDraft((value) => ({ ...value, currency: event.target.value.toUpperCase() }))
              }
              value={draft.currency}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {styleOptions.map((style) => (
              <button
                aria-pressed={draft.styles.includes(style)}
                className={`h-9 rounded-full px-3 font-bold text-[11px] ${
                  draft.styles.includes(style) ? 'bg-olive text-white' : 'bg-paper text-muted'
                }`}
                key={style}
                onClick={() => toggleStyle(style)}
                type="button"
              >
                {t(`workspace.team.groups.style.${style}`)}
              </button>
            ))}
          </div>
          <textarea
            aria-label={t('workspace.team.groups.note')}
            className="min-h-24 resize-none rounded-[14px] border border-line bg-white p-3 text-[13px] outline-none focus:border-olive"
            onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))}
            placeholder={t('workspace.team.groups.intentNotePlaceholder')}
            value={draft.note}
          />
          <label className="flex h-11 items-center gap-2 rounded-[14px] bg-paper px-3 text-[11px] font-bold">
            <input
              checked={draft.flexibleDates}
              onChange={(event) =>
                setDraft((value) => ({ ...value, flexibleDates: event.target.checked }))
              }
              type="checkbox"
            />
            {t('workspace.team.groups.flexibleDates')}
          </label>
        </div>
        <Button className="mt-5 w-full" disabled={saving} type="submit" variant="action">
          {saving ? t('common.loading') : t('workspace.team.groups.intentPublish')}
        </Button>
      </form>
    </Sheet>
  )
}

function GroupCard({
  listing,
  onApply,
  onDiscuss,
  onWithdraw,
}: {
  listing: RecruitmentListing
  onApply: () => void
  onDiscuss: () => void
  onWithdraw: (application: TripJoinApplication) => void
}) {
  const { t } = useTranslation()
  const remaining = Math.max(0, listing.recruitment.maxMembers - listing.memberCount)
  const application = listing.viewerApplication
  return (
    <article className="travel-surface overflow-hidden">
      <div className="relative h-32 bg-[linear-gradient(135deg,#dce9df,#f4eee1)]">
        {listing.trip.coverPhotoUrl ? (
          <img alt="" className="size-full object-cover" src={listing.trip.coverPhotoUrl} />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_10%,rgba(13,43,38,.62))]" />
        <div className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1 text-[10px] text-white/80">
              <MapPoint size={12} />
              {listing.trip.destinationLabels.join(' · ') || '—'}
            </div>
            <h3 className="truncate font-serif text-[21px] leading-6">{listing.trip.title}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-white/18 px-2 py-1 text-[10px] backdrop-blur">
            {listing.matchScore !== undefined && listing.matchScore > 0
              ? t('workspace.team.groups.matchScore', { score: listing.matchScore })
              : t('workspace.team.groups.remaining', { count: remaining })}
          </span>
        </div>
      </div>
      <div className="p-3.5">
        <div className="grid grid-cols-3 gap-2 text-[10px] text-muted">
          <span className="flex items-center gap-1.5 rounded-xl bg-paper p-2">
            <CalendarDate size={14} />
            <span className="truncate">
              {isoDateRange(listing.trip.startDate, listing.trip.endDate)}
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-xl bg-paper p-2">
            <Users size={14} />
            {listing.memberCount}/{listing.recruitment.maxMembers}
          </span>
          <span className="flex items-center gap-1.5 rounded-xl bg-paper p-2">
            <Wallet size={14} />
            {listing.recruitment.budgetMax !== undefined ? (
              <Money
                amount={listing.recruitment.budgetMax}
                currency={listing.recruitment.currency}
              />
            ) : (
              '—'
            )}
          </span>
        </div>
        {listing.recruitment.note ? (
          <p className="mt-3 line-clamp-2 text-[12px] text-muted leading-5">
            {listing.recruitment.note}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.recruitment.styles.map((style) => (
            <span
              className="rounded-full bg-sage px-2 py-1 font-bold text-[9px] text-olive"
              key={style}
            >
              {t(`workspace.team.groups.style.${style}`, { defaultValue: style })}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 border-line/70 border-t pt-3">
          <div className="min-w-0 flex-1 text-[10px] text-muted">
            {t('workspace.team.groups.organizedBy', {
              name: listing.organizer?.displayName ?? '—',
            })}
          </div>
          <IconButton label={t('workspace.team.groups.discuss')} onClick={onDiscuss}>
            <Chat size={17} />
          </IconButton>
          {listing.viewerIsMember ? (
            <StatusBadge tone="success">{t('workspace.team.groups.joined')}</StatusBadge>
          ) : application?.status === 'needs_info' ? (
            <Button onClick={onApply} size="sm" variant="action">
              {t('workspace.team.groups.addInformation')}
            </Button>
          ) : application && ['pending', 'waitlisted'].includes(application.status) ? (
            <Button onClick={() => onWithdraw(application)} size="sm" variant="outline">
              {t(`workspace.team.groups.applicationStatus.${application.status}`)}
            </Button>
          ) : (
            <Button onClick={onApply} size="sm" variant="action">
              {t('workspace.team.groups.apply')}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export function CommunityGroupsPanel({
  members,
  trip,
}: {
  members: TravelMember[]
  trip: TravelTripSummary | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [matchingOnly, setMatchingOnly] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [intentOpen, setIntentOpen] = useState(false)
  const [applyListing, setApplyListing] = useState<RecruitmentListing | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const currentMember = members.find((member) => member.current) ?? members[0]
  const isOwner = currentMember?.role === 'owner'
  const listings = useQuery({ queryKey: ['travel', 'recruitments'], queryFn: listRecruitments })
  const intents = useQuery({ queryKey: ['travel', 'travel-intents'], queryFn: listTravelIntents })
  const own = useQuery({
    enabled: Boolean(trip?.id && isOwner),
    queryKey: ['travel', 'recruitment', trip?.id],
    queryFn: () => getTripRecruitment(trip!.id),
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['travel', 'recruitments'] }),
      queryClient.invalidateQueries({ queryKey: ['travel', 'travel-intents'] }),
      queryClient.invalidateQueries({ queryKey: ['travel', 'recruitment', trip?.id] }),
      queryClient.invalidateQueries({ queryKey: ['travel', 'trip-domain', trip?.id] }),
      queryClient.invalidateQueries({ queryKey: ['travel', 'workspace'] }),
    ])
  }
  const run = async <T,>(action: Promise<T>) => {
    setErrorMessage('')
    try {
      return await action
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('workspace.team.groups.error'))
      throw error
    }
  }
  const saveRecruitment = useMutation({
    mutationFn: (input: UpsertRecruitmentInput) => upsertTripRecruitment(trip!.id, input),
    onSuccess: refresh,
  })
  const apply = useMutation({
    mutationFn: (input: {
      recruitmentId: string
      message?: string
      answers: Array<{ question: string; answer: string }>
    }) => applyToRecruitment(input.recruitmentId, input),
    onSuccess: refresh,
  })
  const visibleListings = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return (listings.data ?? [])
      .filter((listing) => !matchingOnly || (listing.matchScore ?? 0) >= 40)
      .filter(
        (listing) =>
          !term ||
          [
            listing.trip.title,
            listing.trip.destinationLabels.join(' '),
            listing.recruitment.departureCity,
            listing.recruitment.styles.join(' '),
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase()
            .includes(term),
      )
      .sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1))
  }, [listings.data, matchingOnly, search])
  const ownIntent = intents.data?.find((item) => item.userId === currentMember?.userId)

  const ensureRecruitmentChannel = async (listing: RecruitmentListing) => {
    const channel = await ensureCommunityChannel({
      dedupeKey: `travel-recruitment:${listing.trip.id}`,
      isPrivate: false,
      name: t('workspace.team.groups.recruitmentChannelName', { title: listing.trip.title }),
      topic: listing.trip.summary,
    })
    if (isOwner && listing.trip.id === trip?.id) {
      await upsertTripRecruitment(trip.id, { recruitmentChannelId: channel.channelId })
      await refresh()
    }
    await travelShadowSpaceApp.openChannel({ channelId: channel.channelId })
  }

  const ensureMemberChannel = async (additionalUserId?: string) => {
    if (!trip) throw new Error('No active trip')
    const memberUserIds = [
      ...members.flatMap((member) => (member.userId ? [member.userId] : [])),
      ...(additionalUserId ? [additionalUserId] : []),
    ]
    const channel = await ensureCommunityChannel({
      dedupeKey: `travel-trip:${trip.id}`,
      isPrivate: true,
      memberUserIds,
      name: t('workspace.team.groups.memberChannelName', { title: trip.title }),
      syncMembers: true,
    })
    await upsertTripRecruitment(trip.id, { memberChannelId: channel.channelId })
    return channel
  }
  const discussIntent = async (intent: TravelIntent) => {
    if (!trip || !isOwner) return
    const channel = await ensureCommunityChannel({
      dedupeKey: `travel-intent:${trip.id}:${intent.userId}`,
      isPrivate: true,
      memberUserIds: [
        ...members.flatMap((member) => (member.userId ? [member.userId] : [])),
        intent.userId,
      ],
      name: t('workspace.team.groups.intentChannelName', { name: intent.displayName }),
      syncMembers: true,
    })
    await travelShadowSpaceApp.openChannel({ channelId: channel.channelId })
  }

  const review = async (
    application: TripJoinApplication,
    status: 'needs_info' | 'waitlisted' | 'approved' | 'rejected',
  ) => {
    await reviewApplication(application.tripId, application.id, { status })
    await refresh()
    if (status === 'approved') await ensureMemberChannel(application.applicantUserId)
  }

  const createPoll = async (question: string, answers: string[]) => {
    if (!trip) return
    const channel = await ensureMemberChannel()
    const poll = await createCommunityPoll({
      channelId: channel.channelId,
      question,
      answers,
      durationHours: 24,
    })
    await apiPost(`/api/trips/${encodeURIComponent(trip.id)}/decision-refs`, {
      decision: question,
      messageId: poll.messageId,
      status: 'proposed',
      subjectType: 'trip',
      subjectId: trip.id,
    })
    await travelShadowSpaceApp.openChannel({ channelId: poll.channelId, messageId: poll.messageId })
  }

  return (
    <div className="grid gap-3">
      <section className="travel-surface p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={15} />
            <TextInput
              aria-label={t('workspace.team.groups.search')}
              className="w-full pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('workspace.team.groups.search')}
              value={search}
            />
          </div>
          {trip && isOwner ? (
            <>
              <IconButton
                label={t('workspace.team.groups.createPoll')}
                onClick={() => setPollOpen(true)}
              >
                <ChecklistAlt size={17} />
              </IconButton>
              <Button
                icon={own.data?.recruitment ? <Edit2 size={14} /> : <Plus size={14} />}
                onClick={() => setSettingsOpen(true)}
                size="sm"
                variant={own.data?.recruitment?.status === 'open' ? 'outline' : 'action'}
              >
                {own.data?.recruitment
                  ? t('workspace.team.groups.manage')
                  : t('workspace.team.groups.start')}
              </Button>
            </>
          ) : null}
          <Button
            icon={ownIntent ? <Edit2 size={14} /> : <Plus size={14} />}
            onClick={() => setIntentOpen(true)}
            size="sm"
            variant="outline"
          >
            {ownIntent
              ? t('workspace.team.groups.intentManage')
              : t('workspace.team.groups.intentStart')}
          </Button>
          {ownIntent ? (
            <Button
              onClick={() => setMatchingOnly((current) => !current)}
              size="sm"
              variant={matchingOnly ? 'action' : 'outline'}
            >
              {t('workspace.team.groups.matchingOnly')}
            </Button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted">
          <span>{t('workspace.team.groups.spaceOnly')}</span>
          <span>{t('workspace.team.groups.groupCount', { count: visibleListings.length })}</span>
        </div>
        {errorMessage ? (
          <p
            className="mt-3 rounded-[12px] bg-coral/10 px-3 py-2 text-[11px] text-coral"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </section>

      {intents.data?.length ? (
        <section className="travel-surface p-3.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <strong className="text-[13px]">{t('workspace.team.groups.intentSection')}</strong>
            <span className="text-[10px] text-muted">
              {t('workspace.team.groups.intentCount', { count: intents.data.length })}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {intents.data.map((intent) => (
              <article className="min-w-[230px] rounded-[15px] bg-paper/75 p-3" key={intent.id}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[12px]">{intent.displayName}</strong>
                  {intent.userId === currentMember?.userId ? (
                    <StatusBadge tone="success">{t('workspace.team.you')}</StatusBadge>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-olive">
                  <MapPoint size={13} />
                  <span className="truncate">{intent.destinationLabels.join(' · ')}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {intent.styles.slice(0, 3).map((style) => (
                    <span
                      className="rounded-full bg-white px-2 py-1 text-[9px] text-muted"
                      key={style}
                    >
                      {t(`workspace.team.groups.style.${style}`, { defaultValue: style })}
                    </span>
                  ))}
                </div>
                {intent.userId === currentMember?.userId ? (
                  <button
                    className="mt-3 text-[10px] font-bold text-coral"
                    onClick={() => void run(closeTravelIntent().then(refresh))}
                    type="button"
                  >
                    {t('workspace.team.groups.intentClose')}
                  </button>
                ) : isOwner ? (
                  <IconButton
                    className="mt-3"
                    label={t('workspace.team.groups.intentDiscuss')}
                    onClick={() => void run(discussIntent(intent))}
                  >
                    <Chat size={14} />
                  </IconButton>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isOwner && own.data?.recruitment ? (
        <section className="travel-surface p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <strong className="text-[13px]">{t('workspace.team.groups.applications')}</strong>
                <StatusBadge tone={own.data.recruitment.status === 'open' ? 'success' : 'neutral'}>
                  {t(`workspace.team.groups.status.${own.data.recruitment.status}`)}
                </StatusBadge>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {t('workspace.team.groups.applicationCount', {
                  count: own.data.applications.length,
                })}
              </p>
            </div>
            {own.data.recruitment.status === 'open' ? (
              <Button
                onClick={() => void run(saveRecruitment.mutateAsync({ status: 'closed' }))}
                size="sm"
                variant="outline"
              >
                {t('workspace.team.groups.close')}
              </Button>
            ) : (
              <Button
                onClick={() => void run(saveRecruitment.mutateAsync({ status: 'open' }))}
                size="sm"
                variant="action"
              >
                {t('workspace.team.groups.reopen')}
              </Button>
            )}
          </div>
          {own.data.applications.length ? (
            <div className="mt-3 grid gap-2">
              {own.data.applications.map((application) => (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-[14px] bg-paper/70 p-3"
                  key={application.id}
                >
                  <div className="min-w-[160px] flex-1">
                    <strong className="block text-[12px]">
                      {application.applicantDisplayName}
                    </strong>
                    <span className="text-[10px] text-muted">
                      {application.message || t('workspace.team.groups.noMessage')}
                    </span>
                  </div>
                  {['pending', 'needs_info', 'waitlisted'].includes(application.status) ? (
                    <>
                      <Button
                        onClick={() => void run(review(application, 'waitlisted'))}
                        size="sm"
                        variant="outline"
                      >
                        {t('workspace.team.groups.waitlist')}
                      </Button>
                      <Button
                        onClick={() => void run(review(application, 'rejected'))}
                        size="sm"
                        variant="outline"
                      >
                        {t('workspace.team.groups.reject')}
                      </Button>
                      <Button
                        onClick={() => void run(review(application, 'approved'))}
                        size="sm"
                        variant="action"
                      >
                        {t('workspace.team.groups.approve')}
                      </Button>
                    </>
                  ) : (
                    <StatusBadge tone={application.status === 'approved' ? 'success' : 'neutral'}>
                      {t(`workspace.team.groups.applicationStatus.${application.status}`)}
                    </StatusBadge>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {listings.isLoading ? (
        <section className="travel-surface grid min-h-48 place-items-center text-[12px] text-muted">
          {t('common.loading')}
        </section>
      ) : visibleListings.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleListings.map((listing) => (
            <GroupCard
              key={listing.recruitment.id}
              listing={listing}
              onApply={() => setApplyListing(listing)}
              onDiscuss={() => void run(ensureRecruitmentChannel(listing))}
              onWithdraw={(application) =>
                void run(withdrawApplication(application.id).then(refresh))
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            trip && isOwner ? (
              <Button
                icon={<Plus size={14} />}
                onClick={() => setSettingsOpen(true)}
                variant="action"
              >
                {t('workspace.team.groups.start')}
              </Button>
            ) : (
              <Button
                icon={<Plus size={14} />}
                onClick={() => setIntentOpen(true)}
                variant="action"
              >
                {t('workspace.team.groups.intentStart')}
              </Button>
            )
          }
          description={t('workspace.team.groups.emptyHint')}
          icon={<Users size={21} />}
          size="page"
          title={t('workspace.team.groups.empty')}
        />
      )}

      {settingsOpen && trip ? (
        <RecruitmentSettingsSheet
          current={own.data?.recruitment}
          defaultCurrency={trip.currency}
          onClose={() => setSettingsOpen(false)}
          onSave={(input) => run(saveRecruitment.mutateAsync(input))}
        />
      ) : null}
      {applyListing ? (
        <ApplicationSheet
          listing={applyListing}
          onClose={() => setApplyListing(null)}
          onSubmit={(input) =>
            applyListing.viewerApplication
              ? run(updateJoinApplication(applyListing.viewerApplication.id, input).then(refresh))
              : run(apply.mutateAsync({ recruitmentId: applyListing.recruitment.id, ...input }))
          }
        />
      ) : null}
      {pollOpen ? (
        <PollSheet
          onClose={() => setPollOpen(false)}
          onCreate={(question, answers) => run(createPoll(question, answers))}
        />
      ) : null}
      {intentOpen ? (
        <IntentSheet
          current={ownIntent}
          defaultCurrency={trip?.currency ?? 'USD'}
          onClose={() => setIntentOpen(false)}
          onSave={(input) => run(upsertTravelIntent(input).then(refresh))}
        />
      ) : null}
    </div>
  )
}
