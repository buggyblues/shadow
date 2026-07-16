import { type ChangeEvent, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/button.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  Bookmark,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  Clock3,
  DocumentUpload2,
  Edit2,
  Globe,
  Link2,
  LocationAlt,
  Lock,
  MapPoint,
  Paperclip,
  Star,
  Tag,
  Trash2,
  Users,
  X,
} from '../../../components/icons.js'
import { Money } from '../../../components/money.js'
import { VisibilitySelector } from '../../../components/visibility-selector.js'
import { tripDays } from '../../../config/copy.js'
import { cn } from '../../../utils/class-names.js'
import { isMeaningfulTravelImage } from '../../../utils/travel-images.js'
import {
  formatTravelAddress,
  formatTravelOpeningHours,
} from '../../../utils/travel-place-format.js'
import type { Place } from '../api/places.js'
import { ContextCollaboration } from './context-collaboration.js'

export interface PlaceEditPatch {
  address?: string
  attachmentId?: string
  attachmentName?: string
  cost?: string
  description?: string
  hero?: string
  hours?: string
  image?: string
  latitude?: number
  longitude?: number
  title?: string
}

interface PlaceInspectorProps {
  expanded: boolean
  place?: Place
  onAction: (message: string) => void
  onDelete?: (placeId: string) => void
  onExpandedChange: (expanded: boolean) => void
  onNotesChange: (placeId: string, notes: string) => void
  onPlaceChange?: (placeId: string, patch: PlaceEditPatch) => void
  onScheduleToDay: (placeId: string, dayIndex: number) => void
  onSaveProvider?: (placeId: string) => void
  onVisibilityChange?: (
    placeId: string,
    patch: { visibility?: 'private' | 'shared'; shareScope?: 'space' | 'public' },
  ) => void
  onClose?: () => void
  shareScope?: 'space' | 'public'
  variant?: 'saved' | 'custom'
  visibility?: 'private' | 'shared'
  className?: string
  initialEditing?: boolean
  tripId?: string
  providerResult?: boolean
  savingProvider?: boolean
}

const workspaceAttachments = [
  {
    id: 'workspace-louvre-pass',
    image:
      'https://images.unsplash.com/photo-1565099824688-e93eb20fe622?auto=format&fit=crop&w=900&q=80',
    nameKey: 'places.attachments.museumTicketFolder',
  },
  {
    id: 'workspace-dinner-confirmation',
    image:
      'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=900&q=80',
    nameKey: 'places.attachments.dinnerConfirmation',
  },
  {
    id: 'workspace-hotel-voucher',
    image:
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80',
    nameKey: 'places.attachments.hotelVoucher',
  },
]

function isVenuePlace(place: Place) {
  return place.category === 'Food' || place.category === 'Museums' || place.category === 'Sights'
}

function readImageFile(file: File, onLoad: (dataUrl: string) => void) {
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    if (typeof reader.result === 'string') onLoad(reader.result)
  })
  reader.readAsDataURL(file)
}

export function PlaceInspector({
  expanded,
  place,
  onAction,
  onDelete,
  onExpandedChange,
  onNotesChange,
  onPlaceChange,
  onScheduleToDay,
  onVisibilityChange,
  onClose,
  shareScope = 'space',
  variant = 'saved',
  visibility = 'private',
  className,
  initialEditing = false,
  tripId,
  providerResult = false,
  savingProvider = false,
  onSaveProvider,
}: PlaceInspectorProps) {
  const { t } = useTranslation()
  const uploadInputId = useId()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [editing, setEditing] = useState(initialEditing)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const editable = Boolean(onPlaceChange)
  useEffect(() => {
    setEditing(initialEditing)
  }, [initialEditing, place?.id])
  if (!place) return null
  const editingEnabled = editable && editing
  const venue = isVenuePlace(place)
  const updateCoordinate = (field: 'latitude' | 'longitude', value: string) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue)) return
    onPlaceChange?.(place.id, { [field]: nextValue })
  }
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    readImageFile(file, (dataUrl) => {
      onPlaceChange?.(place.id, {
        attachmentId: undefined,
        attachmentName: file.name,
        hero: dataUrl,
        image: dataUrl,
      })
    })
    event.target.value = ''
  }
  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white',
        className,
      )}
    >
      <div className="relative">
        {isMeaningfulTravelImage(place.hero ?? place.image) ? (
          <img alt="" className="h-[158px] w-full object-cover" src={place.hero ?? place.image} />
        ) : (
          <div className="grid h-[158px] w-full place-items-center bg-[radial-gradient(circle_at_76%_20%,rgba(255,255,255,0.8)_0_18px,transparent_19px),linear-gradient(145deg,#e1eadf,#f3eadb)] text-olive">
            <MapPoint size={34} strokeWidth={1.55} />
          </div>
        )}
        {onClose ? (
          <IconButton
            className="absolute right-3 top-3 size-9 rounded-full bg-white/94 shadow-lg"
            label={t('actions.close')}
            onClick={onClose}
          >
            <X size={16} />
          </IconButton>
        ) : null}
        <button
          aria-label={t('actions.saved')}
          className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-white text-olive shadow-lg"
          type="button"
        >
          <Bookmark fill="currentColor" size={18} />
        </button>
        {editable ? (
          <button
            aria-pressed={editing}
            className="absolute bottom-3 left-3 inline-flex h-10 items-center gap-2 rounded-full bg-white px-3 font-bold text-[12px] text-ink shadow-lg transition hover:bg-sage"
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            {editing ? <CheckCircle size={15} /> : <Edit2 size={15} />}
            {editing ? t('places.viewMode') : t('places.editMode')}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          {editingEnabled ? (
            <label className="min-w-0 flex-1">
              <span className="mb-1 block font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                {t('places.placeName')}
              </span>
              <input
                aria-label={t('places.placeName')}
                className="h-10 w-full rounded-xl border border-line bg-paper px-3 font-extrabold text-[16px] outline-none transition focus:border-olive"
                onChange={(event) => onPlaceChange?.(place.id, { title: event.target.value })}
                value={place.title}
              />
            </label>
          ) : (
            <h2 className="font-extrabold text-[20px] leading-6">{place.title}</h2>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-2.5 py-1.5 font-bold text-[12px] text-olive">
            <Bookmark fill="currentColor" size={13} />
            {place.statusLabel}
          </span>
        </div>

        {editingEnabled ? (
          <div className="mb-4 grid gap-2">
            <label>
              <span className="mb-1 block font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                {t('places.address')}
              </span>
              <input
                aria-label={t('places.address')}
                className="h-10 w-full rounded-xl border border-line bg-paper px-3 text-[13px] outline-none transition focus:border-olive"
                onChange={(event) => onPlaceChange?.(place.id, { address: event.target.value })}
                value={place.address}
              />
            </label>
            <label>
              <span className="mb-1 block font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                {t('places.heroImage')}
              </span>
              <input
                accept="image/*"
                className="sr-only"
                id={uploadInputId}
                onChange={handleUpload}
                type="file"
              />
              <div className="grid grid-cols-2 gap-2">
                <label
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-paper px-3 font-bold text-[12px] transition hover:bg-sage"
                  htmlFor={uploadInputId}
                >
                  <DocumentUpload2 size={15} />
                  {t('places.uploadHero')}
                </label>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-paper px-3 font-bold text-[12px] transition hover:bg-sage"
                  onClick={() => setAttachmentsOpen((value) => !value)}
                  type="button"
                >
                  <Paperclip size={15} />
                  {t('places.linkAttachment')}
                </button>
              </div>
              {place.attachmentName ? (
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-sage px-2 py-1 font-bold text-[11px] text-olive">
                  <Paperclip size={12} />
                  <span className="truncate">{place.attachmentName}</span>
                </div>
              ) : null}
              {attachmentsOpen ? (
                <div className="mt-2 grid gap-1 rounded-xl border border-line bg-white p-1 shadow-sm">
                  {workspaceAttachments.map((attachment) => (
                    <button
                      className="flex h-12 items-center gap-2 rounded-lg px-2 text-left transition hover:bg-sage"
                      key={attachment.id}
                      onClick={() => {
                        onPlaceChange?.(place.id, {
                          attachmentId: attachment.id,
                          attachmentName: t(attachment.nameKey),
                          hero: attachment.image,
                          image: attachment.image,
                        })
                        setAttachmentsOpen(false)
                      }}
                      type="button"
                    >
                      <img
                        alt=""
                        className="size-8 rounded-md object-cover"
                        src={attachment.image}
                      />
                      <span className="min-w-0 flex-1 truncate font-bold text-[12px]">
                        {t(attachment.nameKey)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <div>
              <span className="mb-1 block font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                {t('places.mapMarker')}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <label className="relative">
                  <MapPoint
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    size={14}
                  />
                  <input
                    aria-label={t('places.latitude')}
                    className="h-10 w-full rounded-xl border border-line bg-paper py-0 pr-2 pl-9 text-[13px] outline-none transition focus:border-olive"
                    onChange={(event) => updateCoordinate('latitude', event.target.value)}
                    step="0.00001"
                    type="number"
                    value={place.latitude}
                  />
                </label>
                <label className="relative">
                  <MapPoint
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    size={14}
                  />
                  <input
                    aria-label={t('places.longitude')}
                    className="h-10 w-full rounded-xl border border-line bg-paper py-0 pr-2 pl-9 text-[13px] outline-none transition focus:border-olive"
                    onChange={(event) => updateCoordinate('longitude', event.target.value)}
                    step="0.00001"
                    type="number"
                    value={place.longitude}
                  />
                </label>
              </div>
            </div>
            {venue ? (
              <label>
                <span className="mb-1 block font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                  {t('places.openingHours')}
                </span>
                <input
                  aria-label={t('places.openingHours')}
                  className="h-10 w-full rounded-xl border border-line bg-paper px-3 text-[13px] outline-none transition focus:border-olive"
                  onChange={(event) => onPlaceChange?.(place.id, { hours: event.target.value })}
                  placeholder={t('places.openingHoursPlaceholder')}
                  value={place.hours ?? ''}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 text-[13px]">
          <div className="flex items-center gap-3 text-ink/80">
            <LocationAlt className="text-muted" size={16} />
            {formatTravelAddress(place.address)}
          </div>
          <div className="flex items-center gap-3 text-ink/80">
            <Clock3 className="text-muted" size={16} />
            {formatTravelOpeningHours(place.hours)}
            <ChevronDown className="text-muted" size={14} />
          </div>
          <div className="flex items-center gap-3 text-ink/80">
            <Star className="text-muted" size={16} />
            {place.rating}
          </div>
          <div className="flex items-center gap-3 text-ink/80">
            <Tag className="text-muted" size={16} />
            {place.costAmount !== undefined && place.costCurrency ? (
              <span className="inline-flex items-center gap-1.5">
                <Money amount={place.costAmount} currency={place.costCurrency} />
                {place.costUnitKey ? (
                  <span className="text-muted">{t(place.costUnitKey)}</span>
                ) : null}
              </span>
            ) : (
              place.cost
            )}
          </div>
        </div>

        <div className="my-4 border-line border-t" />

        {editingEnabled ? (
          <label className="block">
            <span className="mb-1 block font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
              {t('places.description')}
            </span>
            <textarea
              aria-label={t('places.description')}
              className="min-h-[88px] w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[13px] leading-5 outline-none transition focus:border-olive"
              onChange={(event) => onPlaceChange?.(place.id, { description: event.target.value })}
              value={place.description ?? ''}
            />
          </label>
        ) : (
          <>
            <p className="text-muted text-[13px] leading-5">
              {place.description}
              {expanded ? ` ${t('places.expandedContext')}` : null}
            </p>
            <button
              className="mt-3 inline-flex items-center gap-2 font-bold text-[13px] text-olive"
              onClick={() => onExpandedChange(!expanded)}
              type="button"
            >
              {expanded ? t('actions.showLess') : t('actions.showMore')}
              <ChevronDown size={14} />
            </button>
          </>
        )}

        <div className="my-4 border-line border-t" />

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-[13px]">{t('places.notes')}</h3>
            <button
              aria-label={editingNotes ? t('actions.saveNote') : t('actions.editNotes')}
              className={cn('text-muted hover:text-ink', editingEnabled && 'hidden')}
              onClick={() => setEditingNotes((editing) => !editing)}
              type="button"
            >
              <Edit2 size={15} />
            </button>
          </div>
          {editingNotes || editingEnabled ? (
            <textarea
              aria-label={t('places.notes')}
              className="min-h-[96px] w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[13px] leading-5 outline-none transition focus:border-olive"
              onChange={(event) => onNotesChange(place.id, event.target.value)}
              placeholder={t('map.notePlaceholder')}
              value={place.notes ?? ''}
            />
          ) : (
            <p className="text-muted text-[13px] leading-5">{place.notes ?? t('places.noNotes')}</p>
          )}
        </div>

        {editingEnabled && onVisibilityChange ? (
          <div className="mb-5">
            <div className="mb-2 font-bold text-[12px] text-muted">{t('map.noteVisibility')}</div>
            <VisibilitySelector
              onChange={(value) => onVisibilityChange(place.id, { visibility: value })}
              options={[
                { icon: <Lock size={14} />, label: t('map.private'), value: 'private' },
                { icon: <Users size={14} />, label: t('map.shared'), value: 'shared' },
              ]}
              value={visibility}
            />

            {visibility === 'shared' ? (
              <VisibilitySelector
                className="mt-2"
                onChange={(value) => onVisibilityChange(place.id, { shareScope: value })}
                options={[
                  { icon: <Users size={14} />, label: t('map.tripSpace'), value: 'space' },
                  { icon: <Globe size={14} />, label: t('map.public'), value: 'public' },
                ]}
                value={shareScope}
              />
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          {providerResult ? (
            <Button
              className="w-full"
              disabled={savingProvider}
              icon={<Bookmark size={16} />}
              onClick={() => onSaveProvider?.(place.id)}
              variant="action"
            >
              {savingProvider ? t('placePicker.saving') : t('placePicker.saveToTrip')}
            </Button>
          ) : null}
          {editingEnabled ? (
            <Button
              className="w-full"
              icon={<CheckCircle size={16} />}
              onClick={() => {
                setEditing(false)
                onAction(t('places.savedChanges'))
              }}
              variant="primary"
            >
              {t('actions.saveChanges')}
            </Button>
          ) : null}
          <div className="relative">
            <Button
              className="w-full"
              disabled={providerResult}
              icon={<CalendarDays size={16} />}
              onClick={() => setScheduleOpen((open) => !open)}
              variant="primary"
            >
              {t('actions.scheduleToDay')}
            </Button>
            {scheduleOpen ? (
              <div className="absolute right-0 left-0 z-[5200] mt-1 grid gap-1 rounded-xl border border-line bg-white p-1 shadow-[0_18px_44px_rgba(37,35,30,0.16)]">
                {tripDays.map((day, index) => (
                  <button
                    className="flex h-10 items-center justify-between rounded-lg px-3 text-left font-semibold text-[12px] transition hover:bg-sage"
                    key={day.date}
                    onClick={() => {
                      onScheduleToDay(place.id, index)
                      setScheduleOpen(false)
                    }}
                    type="button"
                  >
                    <span>{day.day}</span>
                    <span className="text-muted">{day.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button
            className="w-full"
            icon={<Link2 size={16} />}
            onClick={() => onAction(t('actions.attachFromWorkspace'))}
          >
            {t('actions.attachFromWorkspace')}
          </Button>
          {tripId ? (
            <ContextCollaboration
              subjectId={place.serverId ?? place.id}
              subjectType="place"
              title={t('contextCollaboration.placeTitle', { title: place.title })}
              tripId={tripId}
            />
          ) : null}
          {onDelete ? (
            <Button
              className="mt-3 w-full"
              icon={<Trash2 size={16} />}
              onClick={() => onDelete(place.id)}
              variant="danger"
            >
              {variant === 'custom' ? t('actions.deletePoint') : t('actions.removeFromTrip')}
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
