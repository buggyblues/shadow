import { describe, expect, it } from 'vitest'
import { timeFromTravelLabel } from '../client/utils/travel-date.js'

describe('timeFromTravelLabel', () => {
  it('uses the local clock time from an ISO timestamp instead of seconds or offset', () => {
    expect(timeFromTravelLabel('2026-09-18T15:00:00+02:00')).toBe('15:00')
    expect(timeFromTravelLabel('2026-09-18T18:30:00+02:00')).toBe('18:30')
  })

  it('keeps legacy labels and explicit fallbacks working', () => {
    expect(timeFromTravelLabel('Day 2 · 10:15')).toBe('10:15')
    expect(timeFromTravelLabel('', '09:00')).toBe('09:00')
  })
})
