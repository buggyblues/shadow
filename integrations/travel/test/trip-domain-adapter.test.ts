import { describe, expect, it } from 'vitest'
import { normalizePlaceCategory } from '../client/features/plan/api/trip-domain.js'

describe('normalizePlaceCategory', () => {
  it('keeps supported product categories', () => {
    expect(normalizePlaceCategory('Food', 'restaurant')).toBe('Food')
    expect(normalizePlaceCategory('Museums', 'museum')).toBe('Museums')
  })

  it('falls back safely when a provider returns a wider category', () => {
    expect(normalizePlaceCategory('Stay', 'accommodation')).toBe('Sights')
    expect(normalizePlaceCategory('hotel', 'accommodation')).toBe('Sights')
  })
})
