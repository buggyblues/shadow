import { afterEach, describe, expect, it, vi } from 'vitest'
import { combineTravelSyncStatus } from '../client/hooks/use-persistent-trip-state.js'
import { defaultTravelDay, setTravelDay } from '../client/store/travel-day.js'
import { formatTripDate, formatTripDayNumber } from '../client/utils/travel-date.js'
import { readSearchParam, writeSearchParams } from '../client/utils/url-state.js'

function installWindow(url: string) {
  const location = new URL(url)
  vi.stubGlobal('window', {
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, nextPath: string) => {
        const nextUrl = new URL(nextPath, location.origin)
        location.href = nextUrl.href
      },
    },
    location,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('travel URL state', () => {
  it('updates several search values without dropping existing context', () => {
    installWindow('https://travel.test/trips?day=2')

    writeSearchParams({ item: 'louvre', mode: 'bookings' })

    expect(readSearchParam('day')).toBe('2')
    expect(readSearchParam('item')).toBe('louvre')
    expect(readSearchParam('mode')).toBe('bookings')
  })

  it('removes empty values while preserving the current path', () => {
    installWindow('https://travel.test/map?day=3&place=louvre#details')

    writeSearchParams({ place: null, step: 2 })

    expect(window.location.pathname).toBe('/map')
    expect(window.location.hash).toBe('#details')
    expect(readSearchParam('place')).toBeNull()
    expect(readSearchParam('step')).toBe('2')
  })

  it('clamps shared travel days to the configured itinerary', () => {
    installWindow('https://travel.test/trips?day=2')

    setTravelDay(9)

    expect(readSearchParam('day')).toBe('3')
  })

  it('starts at day one outside a trip and follows today during an active trip', () => {
    expect(defaultTravelDay()).toBe(1)
    expect(defaultTravelDay('2026-07-12', '2026-07-18', new Date(2026, 6, 13, 9))).toBe(2)
    expect(defaultTravelDay('2026-08-01', '2026-08-05', new Date(2026, 6, 13, 9))).toBe(1)
  })

  it('formats dates and day numbers for both supported languages', () => {
    expect(formatTripDayNumber(2, 'zh')).toBe('第 2 天')
    expect(formatTripDayNumber(2, 'en')).toBe('Day 2')
    expect(formatTripDate('2026-04-25', 'zh')).toContain('4月')
    expect(formatTripDate('2026-04-25', 'en')).toContain('Apr')
  })

  it('surfaces the most actionable persistence status', () => {
    expect(combineTravelSyncStatus(['saved', 'saving'])).toBe('saving')
    expect(combineTravelSyncStatus(['synced', 'saved'])).toBe('synced')
    expect(combineTravelSyncStatus(['saving', 'error'])).toBe('error')
    expect(combineTravelSyncStatus(['idle'])).toBe('idle')
  })
})
