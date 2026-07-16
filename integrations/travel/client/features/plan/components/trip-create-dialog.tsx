import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/button.js'
import { IconBadge } from '../../../components/icon-badge.js'
import { IconButton } from '../../../components/icon-button.js'
import { CalendarAdd, CheckCircle, Crosshairs, MapPoint, X } from '../../../components/icons.js'
import { TextInput } from '../../../components/text-input.js'
import { useTravelPreferences } from '../../../store/preferences.js'
import { resolveDestinationProfile } from '../api/destination-knowledge.js'
import {
  type DestinationSearchResult,
  fetchDestinationPhoto,
  searchDestinations,
} from '../api/providers.js'
import type { TravelTripSummary } from '../api/trips.js'
import { useTravelWorkspace } from '../hooks/use-travel-workspace.js'

interface TripCreateDialogProps {
  onClose: () => void
  onCreated?: (trip: TravelTripSummary) => void
}

const destinationSuggestions = [
  {
    id: 'fallback-paris',
    labelKey: 'trips.destinations.paris',
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    id: 'fallback-tokyo',
    labelKey: 'trips.destinations.tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
  },
  {
    id: 'fallback-new-york',
    labelKey: 'trips.destinations.newYork',
    latitude: 40.7128,
    longitude: -74.006,
  },
  {
    id: 'fallback-barcelona',
    labelKey: 'trips.destinations.barcelona',
    latitude: 41.3874,
    longitude: 2.1686,
  },
  {
    id: 'fallback-singapore',
    labelKey: 'trips.destinations.singapore',
    latitude: 1.3521,
    longitude: 103.8198,
  },
]

export function TripCreateDialog({ onClose, onCreated }: TripCreateDialogProps) {
  const { t } = useTranslation()
  const { language } = useTravelPreferences()
  const workspace = useTravelWorkspace()
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [selectedDestination, setSelectedDestination] = useState<DestinationSearchResult | null>(
    null,
  )
  const [destinationCoordinates, setDestinationCoordinates] = useState<
    { latitude: number; longitude: number } | undefined
  >()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState(false)

  const canSubmit = title.trim().length > 0 && destination.trim().length > 0
  const destinationQuery = destination.trim()
  const providerDestinations = useQuery({
    enabled: destinationQuery.length >= 2,
    queryFn: () =>
      searchDestinations({ lang: language, limit: 4, query: destinationQuery }).catch(() => []),
    queryKey: ['travel', 'destination-search', destinationQuery, language],
    staleTime: 10 * 60 * 1000,
  })
  const destinationOptions = useMemo<DestinationSearchResult[]>(() => {
    if (providerDestinations.data?.length) return providerDestinations.data
    return destinationSuggestions
      .map<DestinationSearchResult>((item) => ({
        coordinates: { latitude: item.latitude, longitude: item.longitude },
        id: item.id,
        label: t(item.labelKey),
        provider: 'fallback',
      }))
      .filter((item) => item.label.toLowerCase().includes(destinationQuery.toLowerCase()))
      .slice(0, 4)
  }, [destinationQuery, providerDestinations.data, t])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || submitting) return
    const form = new FormData(event.currentTarget)
    const formTitle = String(form.get('title') ?? title).trim()
    const formDestination = String(form.get('destination') ?? destination).trim()
    const formStartDate = String(form.get('startDate') ?? startDate)
    const formEndDate = String(form.get('endDate') ?? endDate)
    const coordinates = selectedDestination?.coordinates ?? destinationCoordinates
    setSubmitting(true)
    try {
      const profile = resolveDestinationProfile(formDestination)
      const destinationPhoto = await fetchDestinationPhoto({
        coordinates,
        name: formDestination,
        placeId: selectedDestination?.placeId,
      }).catch(() => null)
      const trip = await workspace.createTrip({
        currency: profile.currency,
        destination: formDestination,
        destinationPhoto: destinationPhoto ?? undefined,
        destinationCoordinates: coordinates,
        endDate: formEndDate,
        etiquetteNotes: profile.etiquetteNotes,
        language: profile.language,
        startDate: formStartDate,
        tabooNotes: profile.tabooNotes,
        timezone: profile.timezone,
        title: formTitle,
      })
      onCreated?.(trip)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError(true)
      return
    }
    setLocating(true)
    setLocationError(false)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = {
          latitude: Number(position.coords.latitude.toFixed(5)),
          longitude: Number(position.coords.longitude.toFixed(5)),
        }
        setDestinationCoordinates(coordinates)
        setDestination(t('trips.create.currentLocation'))
        setSelectedDestination(null)
        setLocating(false)
      },
      () => {
        setLocationError(true)
        setLocating(false)
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 8000 },
    )
  }

  return (
    <div className="fixed inset-0 z-[6800] grid place-items-center bg-ink/20 px-3 py-4 backdrop-blur-sm">
      <form
        className="w-full max-w-[420px] rounded-2xl border border-line bg-white p-4 shadow-[0_24px_70px_rgba(37,35,30,0.22)]"
        onSubmit={submit}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <IconBadge>
              <CalendarAdd size={18} />
            </IconBadge>
            <div className="min-w-0">
              <h2 className="truncate font-extrabold text-[18px] leading-6">
                {t('trips.create.title')}
              </h2>
              <p className="text-[12px] text-muted leading-4">{t('trips.create.subtitle')}</p>
            </div>
          </div>
          <IconButton label={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span className="font-bold text-[12px] text-muted">{t('trips.create.tripName')}</span>
            <TextInput
              aria-label={t('trips.create.tripName')}
              leadingIcon={<CalendarAdd size={16} />}
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('trips.create.tripNamePlaceholder')}
              value={title}
            />
          </div>

          <div className="grid gap-1.5">
            <span className="font-bold text-[12px] text-muted">
              {t('trips.create.destination')}
            </span>
            <TextInput
              aria-label={t('trips.create.destination')}
              leadingIcon={<MapPoint size={16} />}
              name="destination"
              onChange={(event) => {
                setDestination(event.target.value)
                setSelectedDestination(null)
                setDestinationCoordinates(undefined)
              }}
              placeholder={t('trips.create.destinationPlaceholder')}
              value={destination}
            />
            <div className="grid gap-1">
              {destinationOptions.map((item) => (
                <button
                  className="flex h-9 items-center gap-2 rounded-xl border border-line bg-white px-2.5 text-left text-[12px] transition hover:bg-sage"
                  key={item.id}
                  onClick={() => {
                    setDestination(item.address || item.label)
                    setSelectedDestination(item)
                    setDestinationCoordinates(item.coordinates)
                  }}
                  type="button"
                >
                  <MapPoint className="shrink-0 text-olive" size={14} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{item.label}</span>
                    {item.address ? (
                      <span className="block truncate text-[11px] text-muted">{item.address}</span>
                    ) : null}
                  </span>
                  {selectedDestination?.id === item.id ? (
                    <CheckCircle className="shrink-0 text-olive" size={14} />
                  ) : null}
                </button>
              ))}
            </div>
            <Button icon={<Crosshairs size={15} />} onClick={useCurrentLocation} variant="outline">
              {locating ? t('trips.create.locating') : t('trips.create.useCurrentLocation')}
            </Button>
            {destinationCoordinates ? (
              <div className="rounded-xl bg-sage px-3 py-2 font-bold text-[11px] text-olive">
                {t('trips.create.coordinates', {
                  latitude: destinationCoordinates.latitude,
                  longitude: destinationCoordinates.longitude,
                })}
              </div>
            ) : null}
            {locationError ? (
              <div className="rounded-xl bg-paper px-3 py-2 text-[11px] text-muted">
                {t('trips.create.locationUnavailable')}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="font-bold text-[12px] text-muted">
                {t('trips.create.startDate')}
              </span>
              <input
                aria-label={t('trips.create.startDate')}
                className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] outline-none transition focus:border-olive focus:ring-4 focus:ring-olive/10"
                onChange={(event) => setStartDate(event.target.value)}
                name="startDate"
                type="date"
                value={startDate}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="font-bold text-[12px] text-muted">{t('trips.create.endDate')}</span>
              <input
                aria-label={t('trips.create.endDate')}
                className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] outline-none transition focus:border-olive focus:ring-4 focus:ring-olive/10"
                onChange={(event) => setEndDate(event.target.value)}
                name="endDate"
                type="date"
                value={endDate}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            {t('actions.close')}
          </Button>
          <Button disabled={!canSubmit || submitting} type="submit" variant="action">
            {submitting ? t('trips.create.creating') : t('trips.create.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
