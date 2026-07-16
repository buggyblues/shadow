import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from 'react'
import { tripDays } from '../config/copy.js'
import { readSearchParam, writeSearchParams } from '../utils/url-state.js'

const listeners = new Set<() => void>()
const TravelDayDefaultContext = createContext(1)

function currentDay(defaultDay: number) {
  const requested = Number(readSearchParam('day'))
  return Number.isInteger(requested) && requested >= 1 && requested <= 60 ? requested : defaultDay
}

function normalizedIsoDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function defaultTravelDay(startDate?: string, endDate?: string, now = new Date()) {
  if (!startDate || !endDate) return 1
  const date = normalizedIsoDate(now)
  if (date < startDate || date > endDate) return 1
  const start = new Date(`${startDate}T00:00:00Z`)
  const current = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return 1
  return Math.min(
    60,
    Math.max(1, Math.floor((current.getTime() - start.getTime()) / 86_400_000) + 1),
  )
}

export function TravelDayProvider({
  children,
  endDate,
  startDate,
}: {
  children: ReactNode
  endDate?: string
  startDate?: string
}) {
  return createElement(
    TravelDayDefaultContext.Provider,
    { value: defaultTravelDay(startDate, endDate) },
    children,
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function setTravelDay(day: number, maximumDay: number = tripDays.length) {
  const nextDay = Math.min(maximumDay, Math.max(1, Math.round(day)))
  writeSearchParams({ day: nextDay })
  listeners.forEach((listener) => listener())
}

export function useTravelDay() {
  const defaultDay = useContext(TravelDayDefaultContext)
  return useSyncExternalStore(
    subscribe,
    () => currentDay(defaultDay),
    () => defaultDay,
  )
}
