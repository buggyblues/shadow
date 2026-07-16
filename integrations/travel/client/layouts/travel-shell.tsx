import { useQueries, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/button.js'
import { IconBadge } from '../components/icon-badge.js'
import { IconButton } from '../components/icon-button.js'
import {
  Briefcase,
  CalendarAdd,
  CalendarDate,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudBolt,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplet,
  Gauge3,
  Gear,
  type IconComponent,
  Language,
  MapPoint,
  MoreH,
  Plus,
  Receipt,
  Route,
  Share,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Ticket,
  Tram,
  Umbrella,
  Users,
  Wallet,
  Wind,
  X,
} from '../components/icons.js'
import { Select } from '../components/select.js'
import { Sheet } from '../components/sheet.js'
import { appConfig } from '../config/app.js'
import { tripDays } from '../config/copy.js'
import type { TravelMember } from '../features/plan/api/trip-management.js'
import type { TravelTripSummary } from '../features/plan/api/trips.js'
import { fetchTravelWeather, type TravelWeather } from '../features/plan/api/weather.js'
import { TravelerProfilePanel } from '../features/plan/components/traveler-profile-panel.js'
import { TripCreateDialog } from '../features/plan/components/trip-create-dialog.js'
import { useTravelWorkspace } from '../features/plan/hooks/use-travel-workspace.js'
import { resolveTravelRuntimeCapabilities } from '../services/runtime-mode.js'
import { travelShadowSpaceApp } from '../services/shadow-host.js'
import {
  type CurrencyPreference,
  type DistanceUnit,
  type TemperatureUnit,
  type TravelLanguage,
  useTravelPreferences,
} from '../store/preferences.js'
import { setTravelDay, TravelDayProvider, useTravelDay } from '../store/travel-day.js'
import { cn } from '../utils/class-names.js'
import { formatTripDate, formatTripDayNumber } from '../utils/travel-date.js'
import { formatTemperature, formatWindSpeed } from '../utils/units.js'

export type TravelNavId =
  | 'places'
  | 'trips'
  | 'flash'
  | 'transport'
  | 'bookings'
  | 'budget'
  | 'expenses'
  | 'packing'
  | 'share'

type TravelNavPath =
  | '/'
  | '/map'
  | '/trips'
  | '/manage-trips'
  | '/flash'
  | '/transport'
  | '/bookings'
  | '/budget'
  | '/expenses'
  | '/packing'
  | '/share'

interface TravelNavItem {
  id: TravelNavId
  icon: IconComponent
  labelKey: string
  to: TravelNavPath
}

const navItems: TravelNavItem[] = [
  { id: 'trips', icon: CalendarDate, labelKey: 'nav.trips', to: '/trips' },
  { id: 'places', icon: MapPoint, labelKey: 'nav.places', to: '/map' },
  { id: 'expenses', icon: Receipt, labelKey: 'nav.expenses', to: '/expenses' },
  { id: 'share', icon: Users, labelKey: 'nav.share', to: '/share' },
]
const mobileNavItems = navItems

function primaryNavId(activeNav: TravelNavId): TravelNavId {
  if (activeNav === 'places') return 'places'
  if (activeNav === 'flash') return 'trips'
  if (activeNav === 'budget' || activeNav === 'expenses') return 'expenses'
  if (activeNav === 'packing' || activeNav === 'share') return 'share'
  return 'trips'
}

interface TravelShellProps {
  activeNav: TravelNavId
  children: ReactNode
  context?: 'management' | 'trip'
  onShare?: () => void
  topAction?: ReactNode
}

const TravelShellTopActionContext = createContext<HTMLElement | null>(null)

export function TravelShellTopAction({ children }: { children: ReactNode }) {
  const target = useContext(TravelShellTopActionContext)
  return target ? createPortal(children, target) : null
}

function formatMetric(value: number | undefined, unit: string) {
  if (!Number.isFinite(value)) return '—'
  if (!unit) return `${Math.round(value!)}`
  if (unit === '%') return `${Math.round(value!)}%`
  return `${Math.round(value!)} ${unit}`
}

function formatHour(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(11, 16)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(date)
}

function formatTime(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(11, 16)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function weatherRange(weather: TravelWeather | null | undefined, unit: TemperatureUnit) {
  if (!weather) return '—'
  if (Number.isFinite(weather.temp_max) && Number.isFinite(weather.temp_min)) {
    return `${formatTemperature(weather.temp_max, unit)} / ${formatTemperature(
      weather.temp_min,
      unit,
    )}`
  }
  return formatTemperature(weather.temp, unit)
}

function weatherConditionIcon(main: string | undefined): IconComponent {
  const condition = (main ?? '').toLowerCase()
  if (condition.includes('thunder')) return CloudBolt
  if (condition.includes('rain') || condition.includes('drizzle')) return CloudRain
  if (condition.includes('snow')) return CloudSnow
  if (condition.includes('cloud') || condition.includes('fog') || condition.includes('mist')) {
    return Cloud
  }
  if (condition.includes('clear')) return Sun
  return CloudSun
}

function weatherConditionLabel(main: string | undefined, t: TFunction) {
  const condition = (main ?? '').toLowerCase()
  if (condition.includes('thunder')) return t('weather.conditions.thunder')
  if (condition.includes('rain') || condition.includes('drizzle')) {
    return t('weather.conditions.rain')
  }
  if (condition.includes('snow')) return t('weather.conditions.snow')
  if (condition.includes('fog') || condition.includes('mist')) return t('weather.conditions.fog')
  if (condition.includes('cloud')) return t('weather.conditions.clouds')
  if (condition.includes('clear')) return t('weather.conditions.clear')
  return t('weather.conditions.unknown')
}

function WeatherMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-paper/70 px-2.5 py-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sage text-olive">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] text-muted leading-3">{label}</span>
        <span className="block truncate font-bold text-[12px] leading-4">{value}</span>
      </span>
    </div>
  )
}

function DateSwitcher({
  compact = false,
  trip,
  showWeather = true,
}: {
  compact?: boolean
  trip: TravelTripSummary
  showWeather?: boolean
}) {
  const { i18n, t } = useTranslation()
  const { distanceUnit, temperatureUnit } = useTravelPreferences()
  const activeDayNumber = useTravelDay()
  const activeDayIndex = activeDayNumber - 1
  const [dateListOpen, setDateListOpen] = useState(false)
  const [weatherOpen, setWeatherOpen] = useState(false)
  const days = (() => {
    if (!trip.startDate || !trip.endDate) return tripDays
    const start = new Date(`${trip.startDate}T00:00:00Z`)
    const end = new Date(`${trip.endDate}T00:00:00Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return tripDays
    }
    const count = Math.min(60, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10)
      return { date, day: '', label: date }
    })
  })()
  const activeDay = days[activeDayIndex] ?? days[0]
  const canGoBack = activeDayIndex > 0
  const canGoForward = activeDayIndex < days.length - 1
  const weatherLocation = {
    label: trip.destination,
    latitude: trip.destinationCoordinates?.latitude ?? appConfig.weatherLocation.latitude,
    longitude: trip.destinationCoordinates?.longitude ?? appConfig.weatherLocation.longitude,
  }
  const dayWeatherQueries = useQueries({
    queries: days.map((day, index) => ({
      enabled:
        showWeather &&
        index !== activeDayIndex &&
        (dateListOpen || Math.abs(index - activeDayIndex) <= 1),
      queryFn: () =>
        fetchTravelWeather({
          date: day.date,
          latitude: weatherLocation.latitude,
          longitude: weatherLocation.longitude,
        }),
      queryKey: [
        'travel',
        'weather',
        weatherLocation.latitude,
        weatherLocation.longitude,
        day.date,
      ],
      refetchOnWindowFocus: false,
      staleTime: 15 * 60 * 1000,
    })),
  })
  const activeWeatherQuery = useQuery({
    enabled: showWeather,
    queryFn: () =>
      fetchTravelWeather({
        date: activeDay.date,
        detailed: true,
        latitude: weatherLocation.latitude,
        longitude: weatherLocation.longitude,
      }),
    queryKey: [
      'travel',
      'weather',
      weatherLocation.latitude,
      weatherLocation.longitude,
      activeDay.date,
      'detailed',
    ],
    refetchOnWindowFocus: false,
    staleTime: 15 * 60 * 1000,
  })
  const activeWeather = activeWeatherQuery.data ?? dayWeatherQueries[activeDayIndex]?.data
  const activeWeatherLabel = activeWeather
    ? weatherConditionLabel(activeWeather.main, t)
    : appConfig.weatherLocation.label
  const hourly = (activeWeather?.hourly ?? [])
    .filter((hour) => hour.time.startsWith(activeDay.date))
    .filter((_, index) => index % 3 === 0)
    .slice(0, 8)

  return (
    <div className={cn('relative flex min-w-0 items-center', compact ? 'gap-1' : 'gap-2')}>
      <div className="relative">
        <div
          className={cn(
            'inline-flex h-10 items-center rounded-xl bg-white/90 shadow-[0_6px_18px_rgba(34,55,48,0.06)]',
            compact ? 'px-0.5' : 'px-1',
          )}
        >
          <button
            aria-label={t('weather.previousDay')}
            className={cn(
              'size-8 place-items-center rounded-lg text-muted transition hover:bg-sage disabled:cursor-not-allowed disabled:opacity-35',
              compact ? 'hidden' : 'grid',
            )}
            disabled={!canGoBack}
            onClick={() => {
              setTravelDay(Math.max(1, activeDayNumber - 1), days.length)
              setDateListOpen(false)
              setWeatherOpen(false)
            }}
            type="button"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-expanded={dateListOpen}
            aria-label={t('weather.dateList')}
            className={cn(
              'flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-center transition hover:bg-sage',
              compact ? 'min-w-[52px] px-1.5' : 'min-w-[104px] px-2',
            )}
            onClick={() => {
              setDateListOpen((open) => !open)
              setWeatherOpen(false)
            }}
            type="button"
          >
            {compact ? (
              <span className="font-bold text-[11px] leading-4">
                {formatTripDayNumber(activeDayNumber, i18n.language)}
              </span>
            ) : (
              <span>
                <span className="block font-bold text-[13px] leading-4">
                  {formatTripDate(activeDay.date, i18n.language)}
                </span>
                <span className="block text-[11px] text-muted leading-3">
                  {formatTripDayNumber(activeDayNumber, i18n.language)}
                </span>
              </span>
            )}
            <ChevronDown className="shrink-0 text-muted" size={13} />
          </button>
          <button
            aria-label={t('weather.nextDay')}
            className={cn(
              'size-8 place-items-center rounded-lg text-muted transition hover:bg-sage disabled:cursor-not-allowed disabled:opacity-35',
              compact ? 'hidden' : 'grid',
            )}
            disabled={!canGoForward}
            onClick={() => {
              setTravelDay(Math.min(days.length, activeDayNumber + 1), days.length)
              setDateListOpen(false)
              setWeatherOpen(false)
            }}
            type="button"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {dateListOpen ? (
          <div
            className={cn(
              'z-[6000] w-[260px] rounded-2xl bg-white p-2 shadow-[0_18px_44px_rgba(37,35,30,0.16)]',
              compact ? 'fixed top-[3.75rem] right-3' : 'absolute top-12 left-0',
            )}
          >
            <div className="px-2 pb-2 font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
              {t('weather.dateList')}
            </div>
            <div className="grid gap-1">
              {days.map((day, index) => {
                const weather = dayWeatherQueries[index]?.data
                return (
                  <button
                    className={cn(
                      'flex h-12 items-center justify-between gap-3 rounded-xl px-2.5 text-left transition hover:bg-sage',
                      index === activeDayIndex ? 'bg-sage text-olive' : 'text-ink',
                    )}
                    key={day.date}
                    onClick={() => {
                      setTravelDay(index + 1, days.length)
                      setDateListOpen(false)
                      setWeatherOpen(false)
                    }}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold text-[13px] leading-4">
                        {formatTripDate(day.date, i18n.language)}
                      </span>
                      <span className="block text-[11px] text-muted leading-3">
                        {formatTripDayNumber(index + 1, i18n.language)}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px]">
                      <CloudSun size={14} />
                      <span className="font-bold">{weatherRange(weather, temperatureUnit)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {showWeather ? (
        <div className={cn('relative', compact && 'max-[359px]:hidden')}>
          <button
            aria-expanded={weatherOpen}
            aria-label={t('weather.details')}
            className={cn(
              'inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-xl bg-white/90 font-bold shadow-[0_6px_18px_rgba(34,55,48,0.06)] transition hover:bg-sage',
              compact ? 'gap-1 px-2 text-[11px]' : 'gap-2 px-3 text-[12px]',
            )}
            onClick={() => {
              setWeatherOpen((open) => !open)
              setDateListOpen(false)
            }}
            type="button"
          >
            <CloudSun size={compact ? 14 : 16} />
            <span>
              {activeWeather
                ? compact
                  ? formatTemperature(activeWeather.temp, temperatureUnit)
                  : weatherRange(activeWeather, temperatureUnit)
                : t('weather.unavailable')}
            </span>
            <span
              className={cn(
                'max-w-[84px] truncate font-semibold text-muted',
                compact ? 'hidden' : 'hidden sm:inline',
              )}
            >
              {activeWeatherLabel}
            </span>
          </button>

          {weatherOpen ? (
            <div className="fixed top-[4.25rem] right-3 left-3 z-[6100] rounded-2xl border border-line bg-white p-3 shadow-[0_18px_44px_rgba(37,35,30,0.16)] sm:absolute sm:top-12 sm:right-auto sm:left-0 sm:w-[380px]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                    {t('weather.details')}
                  </div>
                  <div className="truncate font-extrabold text-[16px] leading-6">
                    {formatTripDate(activeDay.date, i18n.language)} · {weatherLocation.label}
                  </div>
                  <div className="text-[12px] text-muted leading-4">
                    {activeWeather ? activeWeatherLabel : t('weather.unavailable')}
                    {activeWeather?.type === 'climate' ? ` · ${t('weather.estimate')}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-extrabold text-[24px] leading-7">
                    {formatTemperature(activeWeather?.temp, temperatureUnit)}
                  </div>
                  <div className="text-[11px] text-muted">
                    {weatherRange(activeWeather, temperatureUnit)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <WeatherMetric
                  icon={<Wind size={15} />}
                  label={t('weather.wind')}
                  value={formatWindSpeed(activeWeather?.wind_max, distanceUnit)}
                />
                <WeatherMetric
                  icon={<Umbrella size={15} />}
                  label={t('weather.precipitation')}
                  value={
                    Number.isFinite(activeWeather?.precipitation_probability_max)
                      ? `${Math.round(activeWeather!.precipitation_probability_max!)}%`
                      : formatMetric(activeWeather?.precipitation_sum, 'mm')
                  }
                />
                <WeatherMetric
                  icon={<Sunrise size={15} />}
                  label={t('weather.sunrise')}
                  value={formatTime(activeWeather?.sunrise)}
                />
                <WeatherMetric
                  icon={<Sunset size={15} />}
                  label={t('weather.sunset')}
                  value={formatTime(activeWeather?.sunset)}
                />
                <WeatherMetric
                  icon={<Gauge3 size={15} />}
                  label={t('weather.aqi')}
                  value={formatMetric(activeWeather?.air_quality?.aqi, '')}
                />
                <WeatherMetric
                  icon={<Droplet size={15} />}
                  label={t('weather.pm25')}
                  value={formatMetric(activeWeather?.air_quality?.pm2_5, 'µg/m³')}
                />
              </div>

              <div className="mt-3">
                <div className="mb-2 flex items-center gap-1.5 font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
                  <Clock size={13} />
                  {t('weather.hourly')}
                </div>
                <div className="grid max-h-[176px] grid-cols-4 gap-1.5 overflow-auto pr-1">
                  {hourly.length ? (
                    hourly.map((hour) => {
                      const HourIcon = weatherConditionIcon(hour.main)
                      const metricCandidates: Array<
                        { icon: ReactNode; label: string; value: string } | undefined
                      > = [
                        Number.isFinite(hour.wind)
                          ? {
                              icon: <Wind size={11} />,
                              label: t('weather.wind'),
                              value: formatWindSpeed(hour.wind, distanceUnit),
                            }
                          : undefined,
                        Number.isFinite(hour.humidity)
                          ? {
                              icon: <Droplet size={11} />,
                              label: t('weather.humidity'),
                              value: formatMetric(hour.humidity, '%'),
                            }
                          : undefined,
                        Number.isFinite(hour.precipitation_probability)
                          ? {
                              icon: <Umbrella size={11} />,
                              label: t('weather.precipitation'),
                              value: formatMetric(hour.precipitation_probability, '%'),
                            }
                          : undefined,
                        Number.isFinite(hour.air_quality?.aqi)
                          ? {
                              icon: <Gauge3 size={11} />,
                              label: t('weather.aqi'),
                              value: formatMetric(hour.air_quality?.aqi, ''),
                            }
                          : undefined,
                      ]
                      const metrics = metricCandidates.filter(
                        (item): item is { icon: ReactNode; label: string; value: string } =>
                          item !== undefined,
                      )
                      return (
                        <div
                          className="min-w-0 rounded-xl bg-paper p-2 text-[12px]"
                          key={hour.time}
                        >
                          <span className="block text-center font-bold text-[11px] leading-4">
                            {formatHour(hour.time)}
                          </span>
                          <span
                            className="mx-auto my-1 grid size-8 place-items-center rounded-lg bg-white text-olive"
                            title={hour.main ?? t('weather.unavailable')}
                          >
                            <HourIcon size={16} />
                          </span>
                          <span className="block text-center font-bold leading-4">
                            {formatTemperature(hour.temp, temperatureUnit)}
                          </span>
                          {metrics.length ? (
                            <span className="mt-1 grid grid-cols-2 gap-1 text-muted">
                              {metrics.map((metric) => (
                                <span
                                  className="inline-flex h-5 min-w-0 items-center justify-center gap-0.5 rounded-md bg-white px-1"
                                  key={metric.label}
                                  title={`${metric.label}: ${metric.value}`}
                                >
                                  {metric.icon}
                                  <span className="truncate text-[9px] leading-none">
                                    {metric.value}
                                  </span>
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-xl bg-paper px-3 py-2 text-[12px] text-muted">
                      {t('weather.unavailable')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ShellAvatar({ member, size = 'sm' }: { member: TravelMember; size?: 'sm' | 'md' }) {
  const dimension = size === 'md' ? 'size-10' : 'size-8'
  return member.avatarUrl ? (
    <img alt="" className={cn(dimension, 'rounded-full object-cover')} src={member.avatarUrl} />
  ) : (
    <span
      className={cn(
        dimension,
        'grid shrink-0 place-items-center rounded-full font-extrabold text-white text-[12px]',
      )}
      style={{ backgroundColor: member.avatarColor }}
    >
      {member.displayName.slice(0, 1).toUpperCase()}
    </span>
  )
}

function TripSwitcher({
  currentTrip,
  loading,
  onAdd,
  onManage,
  onProfile,
  onSelect,
  trips,
}: {
  currentTrip: TravelTripSummary | null
  loading: boolean
  onAdd: () => void
  onManage: () => void
  onProfile: () => void
  onSelect: (tripId: string) => void
  trips: TravelTripSummary[]
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const label = loading
    ? t('trips.switcher.loading')
    : (currentTrip?.title ?? t('trips.switcher.noTrip'))

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={t('trips.switcher.label')}
        className="travel-control flex h-10 w-[150px] min-w-0 items-center gap-2 rounded-[14px] bg-white/88 px-2 text-left shadow-[0_8px_24px_rgba(34,55,48,0.07)] backdrop-blur sm:w-[210px] xl:h-11 xl:w-[224px] xl:gap-2.5 xl:px-2.5"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {currentTrip ? (
          <img
            alt=""
            className="size-7 rounded-[9px] object-cover shadow-[0_3px_10px_rgba(34,55,48,0.14)] xl:size-8 xl:rounded-[10px]"
            src={currentTrip.coverImage}
          />
        ) : (
          <span className="grid size-8 place-items-center rounded-[10px] bg-sage text-olive">
            <CalendarAdd size={15} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-[13px] leading-4">{label}</span>
          {currentTrip ? (
            <span className="hidden truncate text-[10px] text-muted leading-3 xl:block">
              {currentTrip.dateLabel}
            </span>
          ) : null}
        </span>
        <ChevronDown className="shrink-0 text-muted" size={15} />
      </button>

      {open ? (
        <div className="absolute top-12 left-0 z-[6500] w-[300px] rounded-2xl border border-line bg-white p-2 shadow-[0_18px_44px_rgba(37,35,30,0.16)]">
          <div className="px-2 pb-2 font-bold text-[11px] text-muted uppercase tracking-[0.04em]">
            {t('trips.switcher.title')}
          </div>
          <div className="grid max-h-[292px] gap-1 overflow-auto">
            {trips.length ? (
              trips.map((trip) => (
                <button
                  className={cn(
                    'flex min-h-14 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-sage',
                    currentTrip?.id === trip.id ? 'bg-sage text-olive' : 'text-ink',
                  )}
                  key={trip.id}
                  onClick={() => {
                    onSelect(trip.id)
                    setOpen(false)
                  }}
                  type="button"
                >
                  <img alt="" className="size-10 rounded-lg object-cover" src={trip.coverImage} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-[13px] leading-4">
                      {trip.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted leading-4">
                      {trip.destination} · {trip.dateLabel}
                    </span>
                  </span>
                  {currentTrip?.id === trip.id ? (
                    <CheckCircle className="shrink-0 text-olive" size={15} />
                  ) : null}
                </button>
              ))
            ) : (
              <div className="rounded-xl bg-paper px-3 py-4 text-center text-[12px] text-muted">
                {t('trips.switcher.empty')}
              </div>
            )}
          </div>

          <div className="mt-2 grid gap-1 border-line border-t pt-2">
            <button
              className="flex h-10 items-center gap-2 rounded-xl px-2.5 font-bold text-[12px] transition hover:bg-sage"
              onClick={() => {
                setOpen(false)
                onProfile()
              }}
              type="button"
            >
              <Briefcase size={15} />
              {t('profile.open')}
            </button>
            <button
              className="flex h-10 items-center gap-2 rounded-xl px-2.5 font-bold text-[12px] transition hover:bg-sage"
              onClick={() => {
                setOpen(false)
                onAdd()
              }}
              type="button"
            >
              <Plus size={15} />
              {t('trips.actions.addTrip')}
            </button>
            <button
              className="flex h-10 items-center gap-2 rounded-xl px-2.5 font-bold text-[12px] transition hover:bg-sage"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
              type="button"
            >
              <CalendarDate size={15} />
              {t('trips.actions.manageTrips')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MoreMenu({
  currentMember,
  onManageTrips,
  onOpenSettings,
  onShare,
  oauthConnected,
}: {
  currentMember: TravelMember | undefined
  onManageTrips: () => void
  onOpenSettings: () => void
  onShare: () => void
  oauthConnected: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const closeAndRun = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div className="relative">
      <IconButton
        active={open}
        aria-expanded={open}
        label={t('nav.more')}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreH size={20} />
      </IconButton>

      {open ? (
        <div className="absolute top-12 right-0 z-[6500] w-[300px] rounded-2xl border border-line bg-white p-2 shadow-[0_18px_44px_rgba(37,35,30,0.16)]">
          <div className="rounded-xl bg-paper p-3">
            {currentMember ? (
              <div className="flex items-center gap-2.5">
                <ShellAvatar member={currentMember} size="md" />
                <div className="min-w-0">
                  <div className="truncate font-extrabold text-[14px] leading-5">
                    {currentMember.displayName}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    {t(`management.roles.${currentMember.role}`)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="font-bold text-[13px]">{t('identity.anonymous')}</div>
            )}
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted">{t('identity.oauth')}</span>
              <span className="font-bold text-ink">
                {oauthConnected ? t('identity.connected') : t('identity.preview')}
              </span>
            </div>
          </div>

          <div className="mt-2 grid gap-1">
            <button
              className="flex h-10 items-center gap-2 rounded-xl px-2.5 font-bold text-[12px] transition hover:bg-sage"
              onClick={() => closeAndRun(onManageTrips)}
              type="button"
            >
              <CalendarDate size={15} />
              {t('trips.actions.manageTrips')}
            </button>
            <button
              className="flex h-10 items-center gap-2 rounded-xl px-2.5 font-bold text-[12px] transition hover:bg-sage"
              onClick={() => closeAndRun(onShare)}
              type="button"
            >
              <Users size={15} />
              {t('nav.share')}
            </button>
            <button
              className="flex h-10 items-center gap-2 rounded-xl px-2.5 font-bold text-[12px] transition hover:bg-sage"
              onClick={() => closeAndRun(onOpenSettings)}
              type="button"
            >
              <Gear size={15} />
              {t('nav.settings')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NoTripsState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-4 pb-28 pt-6 xl:pb-6">
      <section className="w-full max-w-[520px] text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-sage text-olive">
          <CalendarAdd size={26} />
        </span>
        <h1 className="mt-4 font-extrabold text-[26px] leading-8">{t('trips.empty.title')}</h1>
        <p className="mx-auto mt-2 max-w-[420px] text-[14px] text-muted leading-6">
          {t('trips.empty.subtitle')}
        </p>
        <Button className="mt-5 h-11" icon={<Plus size={16} />} onClick={onCreate} variant="action">
          {t('trips.actions.addTrip')}
        </Button>
      </section>
    </div>
  )
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const preferences = useTravelPreferences()
  return (
    <Sheet
      backdropClassName="z-[6200] bg-ink/20 px-3 py-4 backdrop-blur-sm"
      className="flex max-w-[360px] flex-col rounded-2xl border border-line p-4 sm:rounded-2xl"
      onClose={onClose}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBadge>
            <Gear size={18} />
          </IconBadge>
          <h2 className="font-extrabold text-[18px] leading-6">{t('settings.title')}</h2>
        </div>
        <IconButton label={t('actions.close')} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-line p-3">
          <div className="mb-3 flex items-center gap-2 font-bold text-[12px] text-muted uppercase tracking-[0.04em]">
            <Language size={14} />
            {t('settings.language')}
          </div>
          <Select<TravelLanguage>
            align="left"
            label={t('settings.language')}
            onSelect={preferences.setLanguage}
            options={[
              {
                label: t('settings.english'),
                selected: preferences.language === 'en',
                value: 'en',
              },
              {
                label: t('settings.chinese'),
                selected: preferences.language === 'zh',
                value: 'zh',
              },
            ]}
            valueLabel={
              preferences.language === 'zh' ? t('settings.chinese') : t('settings.english')
            }
          />
        </section>

        <section className="rounded-xl border border-line p-3">
          <div className="mb-3 flex items-center gap-2 font-bold text-[12px] text-muted uppercase tracking-[0.04em]">
            <Thermometer size={14} />
            {t('settings.units')}
          </div>
          <div className="grid gap-2">
            <Select<TemperatureUnit>
              align="left"
              label={t('settings.temperature')}
              onSelect={preferences.setTemperatureUnit}
              options={[
                {
                  label: t('settings.celsius'),
                  selected: preferences.temperatureUnit === 'celsius',
                  value: 'celsius',
                },
                {
                  label: t('settings.fahrenheit'),
                  selected: preferences.temperatureUnit === 'fahrenheit',
                  value: 'fahrenheit',
                },
              ]}
              valueLabel={
                preferences.temperatureUnit === 'fahrenheit'
                  ? t('settings.fahrenheit')
                  : t('settings.celsius')
              }
            />
            <Select<DistanceUnit>
              align="left"
              label={t('settings.distance')}
              onSelect={preferences.setDistanceUnit}
              options={[
                {
                  label: t('settings.metric'),
                  selected: preferences.distanceUnit === 'metric',
                  value: 'metric',
                },
                {
                  label: t('settings.imperial'),
                  selected: preferences.distanceUnit === 'imperial',
                  value: 'imperial',
                },
              ]}
              valueLabel={
                preferences.distanceUnit === 'imperial'
                  ? t('settings.imperial')
                  : t('settings.metric')
              }
            />
            <Select<CurrencyPreference>
              align="left"
              label={t('settings.currency')}
              onSelect={preferences.setCurrency}
              options={[
                { label: 'EUR (€)', selected: preferences.currency === 'EUR', value: 'EUR' },
                { label: 'USD ($)', selected: preferences.currency === 'USD', value: 'USD' },
                { label: 'CNY (¥)', selected: preferences.currency === 'CNY', value: 'CNY' },
                { label: 'JPY (¥)', selected: preferences.currency === 'JPY', value: 'JPY' },
                { label: 'GBP (£)', selected: preferences.currency === 'GBP', value: 'GBP' },
                { label: 'SGD ($)', selected: preferences.currency === 'SGD', value: 'SGD' },
              ]}
              valueLabel={preferences.currency}
            />
          </div>
        </section>
      </div>
    </Sheet>
  )
}

export function TravelShell({
  activeNav,
  children,
  context = 'trip',
  onShare,
  topAction,
}: TravelShellProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useTravelWorkspace()
  const runtime = resolveTravelRuntimeCapabilities({
    bridgeAvailable: travelShadowSpaceApp.bridgeAvailable(),
    launchAuthenticated: workspace.bootstrap?.auth?.launchAuthenticated,
  })
  const embedded = runtime.mode === 'embedded'
  const [topActionTarget, setTopActionTarget] = useState<HTMLDivElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createTripOpen, setCreateTripOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const currentMember = workspace.members.find((member) => member.current) ?? workspace.members[0]
  const activePrimaryNav = primaryNavId(activeNav)
  const hasNoTrips = !workspace.isLoading && workspace.trips.length === 0
  const openTripManagement = () => void navigate({ to: '/manage-trips' })
  return (
    <TravelDayProvider
      endDate={workspace.currentTrip?.endDate}
      startDate={workspace.currentTrip?.startDate}
    >
      <TravelShellTopActionContext.Provider value={topActionTarget}>
        <div className="h-dvh overflow-hidden bg-app text-ink" data-runtime-mode={runtime.mode}>
          <div
            className={cn(
              'min-h-dvh bg-app xl:grid xl:h-dvh xl:overflow-hidden',
              embedded
                ? 'xl:grid-cols-[208px_minmax(0,1fr)]'
                : 'xl:grid-cols-[232px_minmax(0,1fr)]',
            )}
          >
            <aside
              className={cn(
                'travel-sidebar relative hidden h-dvh flex-col overflow-hidden bg-[#173a35] py-4 text-white xl:flex',
                embedded ? 'px-2.5' : 'px-3.5',
              )}
            >
              <div className="mb-5 flex items-center gap-2.5 px-1.5">
                <span className="grid size-9 place-items-center rounded-xl bg-white/12 text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
                  <Route aria-hidden="true" size={20} />
                </span>
                <div>
                  <div className="font-serif font-bold text-[21px] leading-5 tracking-[-0.02em]">
                    {t('app.name')}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-white/58 leading-4">
                    {embedded ? <Users size={11} /> : <Route size={11} />}
                    {t(`app.mode.${runtime.mode}`)}
                  </div>
                </div>
              </div>

              {workspace.currentTrip && context === 'trip' ? (
                <button
                  className="group relative mb-4 h-28 w-full shrink-0 overflow-hidden rounded-[20px] border border-white/12 bg-white/8 text-left shadow-[0_18px_40px_rgba(4,23,20,0.24)]"
                  onClick={openTripManagement}
                  type="button"
                >
                  <img
                    alt=""
                    className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    src={workspace.currentTrip.destinationPhoto ?? workspace.currentTrip.coverImage}
                  />
                  <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,31,28,0.06)_10%,rgba(8,31,28,0.86)_100%)]" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-[#173a35]/72 px-2.5 py-1 font-bold text-[10px] text-white/90 backdrop-blur-md">
                    <MapPoint size={12} />
                    {workspace.currentTrip.destination}
                  </span>
                  <span className="absolute inset-x-3 bottom-3">
                    <span className="block truncate font-serif font-bold text-[17px] leading-5 tracking-[-0.01em]">
                      {workspace.currentTrip.title}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/70">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                        <CalendarDate size={12} />
                        {workspace.currentTrip.dateLabel}
                      </span>
                      <span className="flex shrink-0 -space-x-1.5">
                        {workspace.members.slice(0, 3).map((member) => (
                          <span className="rounded-full border border-[#173a35]" key={member.id}>
                            <ShellAvatar member={member} />
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                </button>
              ) : null}

              <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5 pt-2">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const active = item.id === activePrimaryNav
                  return (
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex h-11 shrink-0 items-center gap-3 rounded-[14px] px-3 text-left font-semibold text-[13px] transition',
                        active
                          ? 'bg-white text-[#173a35] shadow-[0_8px_22px_rgba(4,23,20,0.18)]'
                          : 'text-white/68 hover:bg-white/8 hover:text-white',
                      )}
                      key={item.id}
                      preload="intent"
                      to={item.to}
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-[10px] transition',
                          active ? 'bg-sage text-olive' : 'text-white/58 group-hover:text-white',
                        )}
                      >
                        <Icon size={18} strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">{t(item.labelKey)}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className="mt-3 flex items-center gap-1 border-white/10 border-t pt-3">
                {currentMember ? (
                  <button
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] px-2 text-left transition hover:bg-white/8"
                    onClick={() => setProfileOpen(true)}
                    type="button"
                  >
                    <ShellAvatar member={currentMember} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-[12px] text-white">
                        {currentMember.displayName}
                      </span>
                      <span className="block truncate text-[10px] text-white/48">
                        {t(`management.roles.${currentMember.role}`)}
                      </span>
                    </span>
                  </button>
                ) : null}
                <IconButton
                  className="size-9 shrink-0 bg-white/8 text-white/60 shadow-none hover:bg-white/12 hover:text-white"
                  label={t('nav.settings')}
                  onClick={() => setSettingsOpen(true)}
                >
                  <Gear size={16} />
                </IconButton>
              </div>
            </aside>

            <main className="flex h-dvh min-w-0 flex-col overflow-hidden">
              <header
                className={cn(
                  'z-[5000] h-14 shrink-0 bg-app/92 px-3 py-2 shadow-[0_1px_0_rgba(34,55,48,0.06)] backdrop-blur-xl xl:px-5 xl:py-0',
                  embedded ? 'xl:h-[68px]' : 'xl:h-[76px]',
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 xl:h-full xl:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
                  <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
                    {context === 'management' ? (
                      <div className="flex min-w-0 items-center gap-2.5 px-1">
                        <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-sage text-olive">
                          <Briefcase size={18} />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-[14px]">
                            {t('tripManager.list.title')}
                          </strong>
                          <span className="hidden text-[10px] text-muted sm:block">
                            {t('tripManager.list.count', { count: workspace.trips.length })}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <TripSwitcher
                        currentTrip={workspace.currentTrip}
                        loading={workspace.isLoading}
                        onAdd={() => setCreateTripOpen(true)}
                        onManage={openTripManagement}
                        onProfile={() => setProfileOpen(true)}
                        onSelect={(tripId) => {
                          void workspace.selectTrip(tripId)
                        }}
                        trips={workspace.trips}
                      />
                    )}
                    {workspace.currentTrip && context === 'trip' ? (
                      <div className="min-w-0 xl:hidden">
                        <DateSwitcher compact showWeather={false} trip={workspace.currentTrip} />
                      </div>
                    ) : null}
                  </div>

                  {workspace.currentTrip && context === 'trip' ? (
                    <div className="hidden min-w-0 xl:col-start-2 xl:row-start-1 xl:block">
                      <DateSwitcher trip={workspace.currentTrip} />
                    </div>
                  ) : null}

                  <div
                    className="col-start-2 row-start-1 flex justify-end gap-2 xl:col-start-4"
                    ref={setTopActionTarget}
                  >
                    <span
                      aria-label={t(`app.mode.${runtime.mode}`)}
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-xl xl:hidden',
                        embedded ? 'bg-sage text-olive' : 'bg-paper text-muted',
                      )}
                      title={t(`app.mode.${runtime.mode}`)}
                    >
                      {embedded ? <Users size={15} /> : <Route size={15} />}
                    </span>
                    {topAction}
                  </div>
                </div>
              </header>

              {hasNoTrips ? <NoTripsState onCreate={() => setCreateTripOpen(true)} /> : children}

              <nav className="fixed inset-x-0 bottom-0 z-[6000] grid min-h-[calc(4.75rem+env(safe-area-inset-bottom))] grid-cols-4 gap-1 border-t border-line/60 bg-white/96 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-12px_32px_rgba(34,55,48,0.08)] backdrop-blur-xl xl:hidden">
                {mobileNavItems.map((item) => {
                  const Icon = item.icon
                  const active = item.id === activePrimaryNav
                  return (
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 font-semibold text-[10px] transition',
                        active ? 'text-olive' : 'text-muted',
                      )}
                      key={item.id}
                      preload="intent"
                      to={item.to}
                    >
                      <span
                        className={cn(
                          'grid size-8 place-items-center rounded-xl transition',
                          active && 'bg-sage',
                        )}
                      >
                        <Icon size={17} strokeWidth={1.8} />
                      </span>
                      <span className="max-w-full truncate">{t(item.labelKey)}</span>
                    </Link>
                  )
                })}
              </nav>
            </main>
            {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
            {profileOpen ? (
              <TravelerProfilePanel
                defaultFullName={currentMember?.displayName}
                onClose={() => setProfileOpen(false)}
                tripId={workspace.currentTrip?.id}
                tripTitle={workspace.currentTrip?.title}
              />
            ) : null}
            {createTripOpen ? <TripCreateDialog onClose={() => setCreateTripOpen(false)} /> : null}
          </div>
        </div>
      </TravelShellTopActionContext.Provider>
    </TravelDayProvider>
  )
}
