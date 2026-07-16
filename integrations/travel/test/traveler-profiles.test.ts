import { describe, expect, it } from 'vitest'
import {
  createEmptyTravelerProfile,
  deleteTravelerProfileState,
} from '../client/features/plan/hooks/use-traveler-profiles.js'

function profile(id: string) {
  return {
    ...createEmptyTravelerProfile(),
    fullName: id,
    id,
    profileName: id,
  }
}

describe('traveler profile sets', () => {
  it('removes a profile and moves every affected trip to the first remaining set', () => {
    const state = deleteTravelerProfileState(
      {
        profiles: [profile('business'), profile('family')],
        tripProfileIds: {
          paris: 'business',
          tokyo: 'family',
        },
      },
      'business',
    )

    expect(state.profiles.map((item) => item.id)).toEqual(['family'])
    expect(state.tripProfileIds).toEqual({ paris: 'family', tokyo: 'family' })
  })

  it('clears trip selections when the last profile is removed', () => {
    const state = deleteTravelerProfileState(
      {
        profiles: [profile('only')],
        tripProfileIds: { paris: 'only' },
      },
      'only',
    )

    expect(state).toEqual({ profiles: [], tripProfileIds: {} })
  })
})
