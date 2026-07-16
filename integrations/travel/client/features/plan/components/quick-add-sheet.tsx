import type { FormEvent } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/button.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  Bed,
  CalendarDate,
  Clock,
  Coffee2,
  Edit2,
  ForkKnife,
  Gallery,
  type IconComponent,
  Plus,
  Receipt,
  Route,
  Ticket,
  Tram,
  Wallet,
  X,
} from '../../../components/icons.js'
import { Sheet } from '../../../components/sheet.js'
import { TextInput } from '../../../components/text-input.js'
import { cn } from '../../../utils/class-names.js'
import type {
  ReservationKind,
  TransportMode,
  TravelMember,
  TripManagementData,
} from '../api/trip-management.js'
import { MemberAssignment } from './member-assignment.js'
import { PlacePickerInput } from './place-picker-input.js'

export type WorkspaceSection = 'journey' | 'finance' | 'team'
export type JourneyItemKind = ReservationKind | TransportMode | 'meal'

export interface QuickAddInput {
  amount?: number
  kind?: JourneyItemKind
  notes?: string
  participantIds: string[]
  placeId?: string
  place?: TripManagementData['places'][number]
  time?: string
  title: string
}

export const journeyIcons: Record<JourneyItemKind, IconComponent> = {
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

export const journeyIconTone: Record<JourneyItemKind, string> = {
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

const journeyKinds: JourneyItemKind[] = [
  'activity',
  'restaurant',
  'hotel',
  'meal',
  'walk',
  'metro',
  'train',
  'taxi',
  'flight',
  'transport',
]

export function JourneyKindPicker({
  value,
  onChange,
}: {
  value: JourneyItemKind
  onChange: (value: JourneyItemKind) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 font-bold text-[11px] text-muted">
        {t('workspace.journey.edit.category')}
      </legend>
      <div className="grid grid-cols-5 gap-2">
        {journeyKinds.map((kind) => {
          const Icon = journeyIcons[kind]
          const selected = value === kind
          return (
            <button
              aria-pressed={selected}
              className={cn(
                'grid min-h-[58px] place-items-center gap-1 rounded-[14px] border px-1.5 py-2 text-center transition',
                selected
                  ? 'border-olive bg-sage text-olive ring-2 ring-olive/10'
                  : 'border-line/80 bg-white text-muted hover:border-olive/40 hover:bg-paper/60',
              )}
              key={kind}
              onClick={() => onChange(kind)}
              type="button"
            >
              <Icon size={17} />
              <span className="max-w-full truncate text-[9px] font-bold">
                {t(`workspace.journey.category.${kind}`)}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function QuickAddSheet({
  activeDay,
  members,
  onClose,
  onSubmit,
  places,
  section,
  tripId,
}: {
  activeDay: number
  members: TravelMember[]
  onClose: () => void
  onSubmit: (input: QuickAddInput) => Promise<unknown>
  places: TripManagementData['places']
  section: WorkspaceSection
  tripId: string
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<JourneyItemKind>('activity')
  const [time, setTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [participantIds, setParticipantIds] = useState(members.map((member) => member.id))
  const [placeId, setPlaceId] = useState(places[0]?.id)
  const [selectedPlace, setSelectedPlace] = useState<
    TripManagementData['places'][number] | undefined
  >(places[0])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || submitting) return
    setSubmitting(true)
    setSubmitError(false)
    try {
      const formData = new FormData(event.currentTarget)
      await onSubmit({
        amount: amount ? Number(amount) : undefined,
        kind: section === 'journey' ? kind : undefined,
        notes: section === 'journey' ? notes.trim() : undefined,
        participantIds,
        placeId,
        place: selectedPlace,
        time:
          section === 'journey'
            ? String(formData.get('journeyTime') || time || '09:00')
            : undefined,
        title: title.trim(),
      })
      onClose()
    } catch {
      setSubmitting(false)
      setSubmitError(true)
    }
  }

  return (
    <Sheet className="sm:w-[410px]" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted">
              {t(`workspace.quickAdd.eyebrow.${section}`)}
            </div>
            <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">
              {t(`workspace.quickAdd.title.${section}`)}
            </h2>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-6 grid gap-3">
          {section === 'journey' ? (
            <div className="flex items-center gap-3 rounded-[16px] bg-sage/70 px-3 py-2.5">
              <span className="grid size-9 place-items-center rounded-[12px] bg-white text-olive">
                <CalendarDate size={17} />
              </span>
              <span>
                <strong className="block text-[12px]">
                  {t('workspace.journey.day', { count: activeDay })}
                </strong>
                <span className="text-[10px] text-muted">{t('workspace.quickAdd.dayHint')}</span>
              </span>
            </div>
          ) : null}
          <TextInput
            aria-label={t('workspace.quickAdd.name')}
            leadingIcon={section === 'finance' ? <Receipt size={17} /> : <Edit2 size={17} />}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t(`workspace.quickAdd.placeholder.${section}`)}
            value={title}
          />
          {section === 'journey' ? <JourneyKindPicker onChange={setKind} value={kind} /> : null}
          {section === 'journey' ? (
            <div className="grid grid-cols-2 gap-2">
              <TextInput
                aria-label={t('workspace.journey.edit.time')}
                leadingIcon={<Clock size={17} />}
                name="journeyTime"
                onChange={(event) => setTime(event.target.value)}
                type="time"
                value={time}
              />
              <TextInput
                aria-label={t('workspace.journey.edit.cost')}
                leadingIcon={<Wallet size={17} />}
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                placeholder={t('workspace.quickAdd.amountPlaceholder')}
                step="0.01"
                type="number"
                value={amount}
              />
            </div>
          ) : section === 'finance' ? (
            <TextInput
              aria-label={t('workspace.quickAdd.amount')}
              leadingIcon={<Wallet size={17} />}
              min="0"
              onChange={(event) => setAmount(event.target.value)}
              placeholder={t('workspace.quickAdd.amountPlaceholder')}
              step="0.01"
              type="number"
              value={amount}
            />
          ) : null}
          {section !== 'team' ? (
            <PlacePickerInput
              label={t('workspace.journey.edit.place')}
              onChange={(place) => {
                setPlaceId(place.id)
                setSelectedPlace(place)
              }}
              places={places}
              selectedId={placeId}
              tripId={tripId}
            />
          ) : null}
          {section === 'journey' ? (
            <label className="grid gap-1.5">
              <span className="font-bold text-[11px] text-muted">
                {t('workspace.common.notes')}
              </span>
              <textarea
                className="min-h-20 resize-none rounded-[14px] border border-line bg-white px-3 py-2 text-[13px] outline-none transition focus:border-olive focus:ring-4 focus:ring-olive/10"
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('workspace.quickAdd.notesPlaceholder')}
                value={notes}
              />
            </label>
          ) : null}
          {section !== 'team' ? (
            <MemberAssignment
              label={t('workspace.assignment.travelers')}
              members={members}
              onChange={setParticipantIds}
              selectedIds={participantIds}
            />
          ) : null}
        </div>
        {submitError ? (
          <p className="mt-3 mb-0 text-[11px] font-bold text-coral" role="alert">
            {t('workspace.quickAdd.error')}
          </p>
        ) : null}
        <Button
          className="mt-5 w-full"
          disabled={!title.trim() || submitting}
          icon={<Plus size={17} />}
          size="lg"
          type="submit"
          variant="action"
        >
          {submitting ? t('workspace.quickAdd.saving') : t('workspace.quickAdd.submit')}
        </Button>
      </form>
    </Sheet>
  )
}
