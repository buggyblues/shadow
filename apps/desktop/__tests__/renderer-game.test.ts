import { describe, expect, it } from 'vitest'

import {
  applyPetAction,
  createDefaultPetState,
  parsePetState,
  selectAnimation,
  serializePetState,
  settlePetAction,
  tickPet,
} from '../src/renderer/lib/game'

describe('renderer pet game state', () => {
  it('creates a normalized default state', () => {
    const state = createDefaultPetState(1_700_000_000_000)

    expect(state.stats.level).toBe(1)
    expect(state.game.shells).toBe(12)
    expect(state.inventory.map((item) => item.id)).toEqual([
      'shrimpSnack',
      'moonShell',
      'coralTea',
      'starMap',
    ])
    expect(selectAnimation(state)).toBe('idle')
  })

  it('applies care actions and progresses matching quests', () => {
    const initial = createDefaultPetState(1_700_000_000_000)
    const next = applyPetAction(initial, 'feed', 1_700_000_060_000)
    const snackQuest = next.game.quests.find((quest) => quest.id === 'snackRoutine')

    expect(next.lastAction).toBe('feed')
    expect(next.stats.hunger).toBeGreaterThan(initial.stats.hunger)
    expect(next.inventory.find((item) => item.id === 'shrimpSnack')?.count).toBe(2)
    expect(snackQuest?.progress).toBe(1)
    expect(selectAnimation(next)).toBe('feed')
  })

  it('decays needs on tick and keeps values in bounds', () => {
    const initial = createDefaultPetState(1_700_000_000_000)
    const next = tickPet(initial, 1_700_000_000_000 + 30 * 60_000)

    expect(next.stats.hunger).toBeGreaterThanOrEqual(0)
    expect(next.stats.hunger).toBeLessThan(initial.stats.hunger)
    expect(next.stats.energy).toBeLessThan(initial.stats.energy)
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
