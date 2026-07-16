import { describe, expect, it } from 'vitest'
import { distanceFromRouteMeters } from '../client/services/navigation-gateway.js'

describe('Travel navigation geometry', () => {
  it('detects events near a planned route without flagging distant places', () => {
    const route = [
      { latitude: 48.85, longitude: 2.34 },
      { latitude: 48.86, longitude: 2.35 },
    ]
    expect(distanceFromRouteMeters({ latitude: 48.85505, longitude: 2.34505 }, route)).toBeLessThan(
      20,
    )
    expect(distanceFromRouteMeters({ latitude: 48.87, longitude: 2.37 }, route)).toBeGreaterThan(
      1_000,
    )
  })
})
