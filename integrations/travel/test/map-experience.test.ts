import { describe, expect, it } from 'vitest'
import {
  expectedMapStepIndex,
  mapContextLayersForMode,
  mapItemBelongsToDay,
  mapItemSortTimestamp,
  minutesFromMapTime,
  normalizeTravelMapMode,
  travelMapZoomStage,
} from '../client/features/plan/model/map-experience.js'

describe('Travel map experience model', () => {
  it('normalizes deep-linked modes and keeps planning as the trip default', () => {
    expect(normalizeTravelMapMode('explore')).toBe('explore')
    expect(normalizeTravelMapMode('live')).toBe('live')
    expect(normalizeTravelMapMode('unknown')).toBe('plan')
    expect(normalizeTravelMapMode(null)).toBe('plan')
  })

  it('uses task-focused nearby layers for each map mode', () => {
    expect(mapContextLayersForMode('explore')).toMatchObject({
      museum: true,
      nature: true,
      shopping: true,
      sights: true,
    })
    expect(mapContextLayersForMode('plan')).toMatchObject({
      hotel: true,
      transport: true,
      essentials: false,
    })
    expect(mapContextLayersForMode('live')).toMatchObject({
      cafe: true,
      essentials: true,
      museum: false,
      transport: true,
    })
  })

  it('maps zoom to a stable semantic level', () => {
    expect(travelMapZoomStage(10)).toBe('city')
    expect(travelMapZoomStage(13)).toBe('area')
    expect(travelMapZoomStage(16)).toBe('street')
  })

  it('locates the expected itinerary step from local time', () => {
    const steps = [{ time: '08:30' }, { time: '12:15' }, { time: '18:45' }]
    expect(expectedMapStepIndex(steps, new Date(2026, 6, 13, 7, 20))).toBe(0)
    expect(expectedMapStepIndex(steps, new Date(2026, 6, 13, 13, 0))).toBe(1)
    expect(expectedMapStepIndex(steps, new Date(2026, 6, 13, 20, 0))).toBe(2)
    expect(minutesFromMapTime('invalid')).toBeNull()
    expect(minutesFromMapTime('25:00')).toBeNull()
  })

  it('matches structured trip days and respects the destination date', () => {
    const day = { id: 'day-paris-2', date: '2026-07-14' }
    expect(mapItemBelongsToDay({ dayId: 'day-paris-2' }, day, 2)).toBe(true)
    expect(mapItemBelongsToDay({ dayNumber: 1 }, day, 2)).toBe(false)
    expect(mapItemBelongsToDay({ startAt: '2026-07-14T08:30:00+02:00' }, day, 2)).toBe(true)
    expect(mapItemSortTimestamp({ startAt: '2026-07-14T08:30:00+02:00' })).toBeLessThan(
      mapItemSortTimestamp({ startAt: '2026-07-14T12:00:00+02:00' }),
    )

    const steps = [{ time: '08:30' }, { time: '12:15' }, { time: '18:45' }]
    expect(
      expectedMapStepIndex(steps, new Date('2026-07-13T12:00:00Z'), {
        date: '2026-07-14',
        timeZone: 'Europe/Paris',
      }),
    ).toBe(0)
    expect(
      expectedMapStepIndex(steps, new Date('2026-07-15T12:00:00Z'), {
        date: '2026-07-14',
        timeZone: 'Europe/Paris',
      }),
    ).toBe(2)
  })
})
