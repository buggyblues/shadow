import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/button.js'
import { IconButton } from '../../../components/icon-button.js'
import {
  Briefcase,
  CheckCircle,
  ChevronDown,
  Plus,
  Trash2,
  Users,
  X,
} from '../../../components/icons.js'
import { Sheet } from '../../../components/sheet.js'
import { SyncStatus } from '../../../components/sync-status.js'
import { TextInput } from '../../../components/text-input.js'
import { cn } from '../../../utils/class-names.js'
import {
  createEmptyTravelerProfile,
  type TravelerProfile,
  useTravelerProfiles,
} from '../hooks/use-traveler-profiles.js'

export function TravelerProfilePanel({
  defaultFullName,
  onClose,
  tripId,
  tripTitle,
}: {
  defaultFullName?: string
  onClose: () => void
  tripId?: string
  tripTitle?: string
}) {
  const { t } = useTranslation()
  const profiles = useTravelerProfiles(tripId)
  const createDraft = () => ({
    ...createEmptyTravelerProfile(),
    fullName: defaultFullName ?? '',
  })
  const [draft, setDraft] = useState<TravelerProfile>(
    profiles.selectedProfile ?? profiles.profiles[0] ?? createDraft(),
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  useEffect(() => {
    if (profiles.selectedProfile) setDraft(profiles.selectedProfile)
  }, [profiles.selectedProfile])
  const update = (patch: Partial<TravelerProfile>) => setDraft((value) => ({ ...value, ...patch }))
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.profileName.trim() || !draft.fullName.trim()) return
    profiles.upsertProfile(draft, true)
  }
  const savedDraft = profiles.profiles.some((profile) => profile.id === draft.id)

  return (
    <Sheet className="sm:w-[460px]" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] text-muted">{tripTitle ?? t('profile.currentTrip')}</div>
          <h2 className="mt-1 mb-0 font-serif text-[25px] leading-8">{t('profile.title')}</h2>
        </div>
        <span className="flex items-center gap-2">
          <SyncStatus status={profiles.syncStatus} />
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </span>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {profiles.profiles.map((profile) => {
          const selected = profiles.selectedProfile?.id === profile.id
          return (
            <button
              className={cn(
                'min-w-[150px] rounded-[15px] border p-3 text-left transition',
                selected ? 'border-olive bg-sage' : 'border-line bg-white hover:bg-paper',
              )}
              key={profile.id}
              onClick={() => {
                profiles.selectProfile(profile.id)
                setDraft(profile)
                setDeletePending(false)
              }}
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <Briefcase className={selected ? 'text-olive' : 'text-muted'} size={16} />
                {selected ? <CheckCircle className="text-olive" size={15} /> : null}
              </span>
              <strong className="mt-2 block truncate text-[12px]">{profile.profileName}</strong>
              <span className="mt-0.5 block truncate text-[10px] text-muted">
                {profile.fullName}
              </span>
            </button>
          )
        })}
        <button
          className="grid min-w-[118px] place-items-center rounded-[15px] border border-dashed border-line bg-paper/60 p-3 text-center text-olive"
          onClick={() => {
            setDraft(createDraft())
            setAdvancedOpen(false)
            setDeletePending(false)
          }}
          type="button"
        >
          <span>
            <Plus className="mx-auto" size={18} />
            <span className="mt-1 block font-bold text-[10px]">{t('profile.newSet')}</span>
          </span>
        </button>
      </div>

      <div className="mt-4 rounded-[15px] bg-paper/70 px-3 py-2.5 text-[11px] text-muted leading-5">
        <Users className="mr-1.5 inline text-olive" size={14} />
        {t('profile.tripHint')}
      </div>

      <form className="mt-4 grid gap-3" onSubmit={submit}>
        <div className="rounded-[18px] border border-line/70 bg-white p-3">
          <strong className="text-[12px]">{t('profile.basicTitle')}</strong>
          <p className="mt-0.5 mb-3 text-[10px] text-muted">{t('profile.basicHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput
              aria-label={t('profile.fields.profileName')}
              onChange={(event) => update({ profileName: event.target.value })}
              placeholder={t('profile.fields.profileName')}
              value={draft.profileName}
            />
            <TextInput
              aria-label={t('profile.fields.fullName')}
              onChange={(event) => update({ fullName: event.target.value })}
              placeholder={t('profile.fields.fullName')}
              value={draft.fullName}
            />
            <TextInput
              aria-label={t('profile.fields.preferredName')}
              onChange={(event) => update({ preferredName: event.target.value })}
              placeholder={t('profile.fields.preferredName')}
              value={draft.preferredName}
            />
            <TextInput
              aria-label={t('profile.fields.phone')}
              onChange={(event) => update({ phone: event.target.value })}
              placeholder={t('profile.fields.phone')}
              value={draft.phone}
            />
          </div>
        </div>

        <button
          aria-expanded={advancedOpen}
          className="flex h-11 items-center justify-between rounded-[14px] bg-paper/70 px-3 text-left font-bold text-[12px] text-ink"
          onClick={() => setAdvancedOpen((open) => !open)}
          type="button"
        >
          <span>
            {t('profile.advancedTitle')}
            <span className="ml-2 font-normal text-[10px] text-muted">
              {t('profile.advancedOptional')}
            </span>
          </span>
          <ChevronDown className={cn('transition', advancedOpen && 'rotate-180')} size={16} />
        </button>

        {advancedOpen ? (
          <div className="grid gap-2 rounded-[18px] bg-paper/45 p-3">
            <div className="grid grid-cols-2 gap-2">
              <TextInput
                aria-label={t('profile.fields.nationality')}
                onChange={(event) => update({ nationality: event.target.value })}
                placeholder={t('profile.fields.nationality')}
                value={draft.nationality}
              />
              <TextInput
                aria-label={t('profile.fields.documentExpiry')}
                onChange={(event) => update({ documentExpiry: event.target.value })}
                type="date"
                value={draft.documentExpiry}
              />
            </div>
            <TextInput
              aria-label={t('profile.fields.documentNumber')}
              onChange={(event) => update({ documentNumber: event.target.value })}
              placeholder={t('profile.fields.documentNumber')}
              value={draft.documentNumber}
            />
            <TextInput
              aria-label={t('profile.fields.emergencyContact')}
              onChange={(event) => update({ emergencyContact: event.target.value })}
              placeholder={t('profile.fields.emergencyContact')}
              value={draft.emergencyContact}
            />
            <TextInput
              aria-label={t('profile.fields.dietaryNeeds')}
              onChange={(event) => update({ dietaryNeeds: event.target.value })}
              placeholder={t('profile.fields.dietaryNeeds')}
              value={draft.dietaryNeeds}
            />
            <label className="grid gap-1.5">
              <span className="font-bold text-[11px] text-muted">{t('profile.fields.notes')}</span>
              <textarea
                className="min-h-20 resize-none rounded-[14px] border border-line bg-white px-3 py-2 text-[13px] outline-none transition focus:border-olive"
                onChange={(event) => update({ notes: event.target.value })}
                value={draft.notes}
              />
            </label>
          </div>
        ) : null}
        <Button
          className="mt-1 w-full"
          disabled={!draft.profileName.trim() || !draft.fullName.trim()}
          size="lg"
          type="submit"
          variant="action"
        >
          {t('profile.saveAndUse')}
        </Button>
        {savedDraft && !deletePending ? (
          <Button
            icon={<Trash2 size={15} />}
            onClick={() => setDeletePending(true)}
            type="button"
            variant="outline"
          >
            {t('profile.delete')}
          </Button>
        ) : null}
        {savedDraft && deletePending ? (
          <div className="rounded-[16px] bg-coral/8 p-3" role="alert">
            <strong className="block text-[12px] text-coral">{t('profile.deleteConfirm')}</strong>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={() => setDeletePending(false)} type="button" variant="outline">
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={() => {
                  const fallback = profiles.profiles.find((profile) => profile.id !== draft.id)
                  profiles.deleteProfile(draft.id)
                  setDraft(fallback ?? createDraft())
                  setDeletePending(false)
                }}
                type="button"
                variant="danger"
              >
                {t('actions.delete')}
              </Button>
            </div>
          </div>
        ) : null}
      </form>
    </Sheet>
  )
}
