import { describe, expect, it } from 'vitest'
import { resolveTravelRuntimeCapabilities } from '../client/services/runtime-mode.js'

describe('Travel runtime modes', () => {
  it('reserves host UI and community context for embedded launches', () => {
    expect(
      resolveTravelRuntimeCapabilities({ bridgeAvailable: true, launchAuthenticated: true }),
    ).toEqual({ bridgeUi: true, communityContext: true, mode: 'embedded' })
  })

  it('keeps standalone business data available without exposing Bridge actions', () => {
    expect(
      resolveTravelRuntimeCapabilities({ bridgeAvailable: false, launchAuthenticated: true }),
    ).toEqual({ bridgeUi: false, communityContext: false, mode: 'standalone' })
  })
})
