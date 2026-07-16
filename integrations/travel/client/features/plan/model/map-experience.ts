import type { MapContextCategory } from '../api/map-context.js'

export type TravelMapMode = 'explore' | 'plan' | 'live'
export type TravelMapZoomStage = 'city' | 'area' | 'street'

export interface TimedMapStep {
  startAt?: string
  time?: string
}

export interface DayAwareMapItem extends TimedMapStep {
  dayId?: string
  dayNumber?: number
}

const modeContextLayers: Record<TravelMapMode, MapContextCategory[]> = {
  explore: [
    'sights',
    'transport',
    'restaurant',
    'cafe',
    'museum',
    'nature',
    'shopping',
    'hotel',
    'essentials',
  ],
  plan: ['sights', 'transport', 'restaurant', 'museum', 'hotel'],
  live: ['transport', 'restaurant', 'cafe', 'essentials'],
}

export function normalizeTravelMapMode(value: string | null | undefined): TravelMapMode {
  return value === 'explore' || value === 'live' ? value : 'plan'
}

export function mapContextLayersForMode(mode: TravelMapMode) {
  const enabled = new Set(modeContextLayers[mode])
  return {
    cafe: enabled.has('cafe'),
    essentials: enabled.has('essentials'),
    hotel: enabled.has('hotel'),
    museum: enabled.has('museum'),
    nature: enabled.has('nature'),
    restaurant: enabled.has('restaurant'),
    shopping: enabled.has('shopping'),
    sights: enabled.has('sights'),
    transport: enabled.has('transport'),
  } satisfies Record<MapContextCategory, boolean>
}

export function travelMapZoomStage(zoom: number): TravelMapZoomStage {
  if (zoom < 12) return 'city'
  if (zoom < 15) return 'area'
  return 'street'
}

export function minutesFromMapTime(value?: string) {
  if (!value) return null
  const match = value.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

export function mapItemBelongsToDay(
  item: DayAwareMapItem,
  day: { id?: string; date?: string } | undefined,
  dayNumber: number,
) {
  if (item.dayId) return Boolean(day?.id) && item.dayId === day?.id
  if (item.dayNumber) return item.dayNumber === dayNumber
  const value = item.startAt ?? item.time ?? ''
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
  if (isoDate && day?.date) return isoDate === day.date.slice(0, 10)
  const legacyDay = Number(value.match(/Day\s+(\d+)/i)?.[1] ?? 0)
  if (legacyDay) return legacyDay === dayNumber
  return dayNumber === 1
}

export function mapItemSortTimestamp(item: TimedMapStep) {
  const value = item.startAt ?? item.time
  if (!value) return Number.POSITIVE_INFINITY
  const timestamp = Date.parse(value)
  if (Number.isFinite(timestamp)) return timestamp
  return minutesFromMapTime(value) ?? Number.POSITIVE_INFINITY
}

export function expectedMapStepIndex(
  steps: TimedMapStep[],
  at = new Date(),
  options: { date?: string; timeZone?: string } = {},
) {
  if (!steps.length) return 0
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: options.timeZone,
    year: 'numeric',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = part.value
      return parts
    }, {})
  const currentDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`
  const targetDate = options.date?.slice(0, 10)
  if (targetDate && targetDate > currentDate) return 0
  if (targetDate && targetDate < currentDate) return steps.length - 1
  const currentMinutes = Number(dateParts.hour) * 60 + Number(dateParts.minute)
  let expectedIndex = 0
  steps.forEach((step, index) => {
    const stepMinutes = minutesFromMapTime(step.time)
    if (stepMinutes !== null && stepMinutes <= currentMinutes) expectedIndex = index
  })
  return expectedIndex
}
