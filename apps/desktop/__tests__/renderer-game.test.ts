import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyPetAction,
  createDefaultPetState,
  getPetDayPhase,
  parsePetState,
  selectAnimation,
  selectPetEmotion,
  selectRuntimeAnimation,
  serializePetState,
  settlePetAction,
  tickPet,
} from '../src/renderer/lib/game'

describe('renderer pet game state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 31, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a normalized default state', () => {
    const state = createDefaultPetState(1_700_000_000_000)

    expect(state.stats.level).toBe(1)
    expect(state.game.shells).toBe(0)
    expect(state.inventory).toEqual([])
    expect(state.game.achievements).toEqual([])
    expect(selectAnimation(state)).toBe('idle')
  })

  it('applies care actions and progresses matching habits without item rewards', () => {
    const initial = createDefaultPetState(1_700_000_000_000)
    const next = applyPetAction(initial, 'feed', 1_700_000_060_000)
    const snackQuest = next.game.quests.find((quest) => quest.id === 'snackRoutine')

    expect(next.lastAction).toBe('feed')
    expect(next.stats.hunger).toBeGreaterThan(initial.stats.hunger)
    expect(next.inventory).toEqual([])
    expect(next.game.shells).toBe(0)
    expect(snackQuest?.progress).toBe(1)
    expect(selectAnimation(next)).toBe('waving')
  })

  it('decays needs on tick and keeps values in bounds', () => {
    const noon = new Date(2026, 4, 31, 12, 0, 0).getTime()
    const initial = createDefaultPetState(noon)
    const next = tickPet(initial, noon + 30 * 60_000)

    expect(next.stats.hunger).toBeGreaterThanOrEqual(0)
    expect(next.stats.hunger).toBeLessThan(initial.stats.hunger)
    expect(next.stats.energy).toBeLessThan(initial.stats.energy)
  })

  it('uses local day phases and lets the pet sleep at night', () => {
    const morning = new Date(2026, 4, 31, 8, 0, 0).getTime()
    const bedtime = new Date(2026, 4, 31, 22, 0, 0).getTime()
    const night = new Date(2026, 4, 31, 23, 0, 0).getTime()
    const state = createDefaultPetState(bedtime)
    state.stats.energy = 20

    const next = tickPet(state, night)

    expect(getPetDayPhase(morning)).toBe('morning')
    expect(getPetDayPhase(night)).toBe('night')
    expect(next.stats.energy).toBeGreaterThan(state.stats.energy)
    expect(selectAnimation(next)).toBe('waiting')
  })

  it('maps runtime session states to Codex pet animations', () => {
    expect(selectRuntimeAnimation(['streaming'])).toBe('review')
    expect(selectRuntimeAnimation(['thinking'])).toBe('review')
    expect(selectRuntimeAnimation(['running'])).toBe('running')
    expect(selectRuntimeAnimation(['editing'])).toBe('running')
    expect(selectRuntimeAnimation(['testing'])).toBe('waiting')
    expect(selectRuntimeAnimation(['waiting_for_approval'])).toBe('waiting')
    expect(selectRuntimeAnimation(['failed'])).toBe('failed')
    expect(selectRuntimeAnimation(['completed'])).toBe('jumping')
    expect(selectRuntimeAnimation(['success'])).toBe('jumping')
    expect(selectRuntimeAnimation([])).toBeNull()
  })

  it('generates a daily random event and resolves it through the matching action', () => {
    const now = new Date(2026, 4, 31, 11, 0, 0).getTime()
    const state = tickPet(createDefaultPetState(now - 60_000), now)
    const event = state.game.todayEvent
    expect(event).toBeTruthy()

    const next = applyPetAction(state, event?.action ?? 'pet', now + 60_000)

    expect(next.game.todayEvent?.resolved).toBe(true)
    expect(next.stats.xp).toBeGreaterThanOrEqual(state.stats.xp)
  })

  it('derives emotion without exposing raw stats as a separate stored field', () => {
    const state = createDefaultPetState(1_700_000_000_000)
    state.stats.hunger = 12
    const emotion = selectPetEmotion(state, 1_700_000_060_000)

    expect(emotion.state).toBe('hungry')
    expect('emotion' in state).toBe(false)
  })

  it('round-trips serialized state through parser', () => {
    const initial = applyPetAction(
      createDefaultPetState(1_700_000_000_000),
      'pet',
      1_700_000_060_000,
    )
    const parsed = parsePetState(serializePetState(initial), 1_700_000_120_000)

    expect(parsed.stats.loyalty).toBe(initial.stats.loyalty)
    expect(parsed.lastAction).toBe('pet')
    expect(settlePetAction(parsed).lastAction).toBe('idle')
  })

  it('falls back to defaults for malformed storage data', () => {
    const state = parsePetState('{not valid json}', 1_700_000_000_000)

    expect(state.stats.level).toBe(1)
    expect(state.game.quests).toHaveLength(4)
    expect(state.lastAction).toBe('idle')
  })
})
