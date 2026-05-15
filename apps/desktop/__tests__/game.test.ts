import { describe, expect, it } from 'vitest'
import {
  applyPetAction,
  createDefaultPetState,
  levelXpRequirement,
  parsePetState,
  selectAnimation,
  serializePetState,
  settlePetAction,
  tickPet,
} from '../src/renderer/lib/game'

describe('desktop pet game loop', () => {
  it('feeds the pet and consumes a snack', () => {
    const state = createDefaultPetState(1_000)
    const next = applyPetAction(state, 'feed', 2_000)
    expect(next.stats.hunger).toBeGreaterThan(state.stats.hunger)
    expect(next.stats.xp).toBeGreaterThan(state.stats.xp)
    expect(next.inventory.find((item) => item.id === 'shrimpSnack')?.count).toBe(2)
    expect(selectAnimation(next)).toBe('feed')
  })

  it('decays hunger and energy over time', () => {
    const state = createDefaultPetState(0)
    const next = tickPet(state, 5 * 60_000)
    expect(next.stats.hunger).toBeLessThan(state.stats.hunger)
    expect(next.stats.energy).toBeLessThan(state.stats.energy)
  })

  it('levels up when xp crosses the level threshold', () => {
    const state = createDefaultPetState(0)
    state.stats.xp = levelXpRequirement(1) - 5
    const next = applyPetAction(state, 'explore', 1_000)
    expect(next.stats.level).toBe(2)
    expect(next.inventory.find((item) => item.id === 'starMap')?.count).toBe(1)
    expect(next.game.achievements).toContain('levelTwo')
    expect(selectAnimation(next)).toBe('level-up')
  })

  it('tracks quests, shells, and settles action animations', () => {
    const state = createDefaultPetState(0)
    const next = applyPetAction(state, 'pet', 1_000)
    expect(next.game.shells).toBeGreaterThan(state.game.shells)
    expect(next.game.quests.find((quest) => quest.id === 'firstPat')?.completed).toBe(true)
    expect(next.game.achievements).toContain('firstFriend')
    expect(selectAnimation(next)).toBe('pet')
    expect(selectAnimation(settlePetAction(next))).toBe('idle')
  })

  it('round-trips persisted pet state', () => {
    const state = applyPetAction(createDefaultPetState(0), 'pet', 1_000)
    const parsed = parsePetState(serializePetState(state), 2_000)
    expect(parsed.stats.level).toBe(state.stats.level)
    expect(parsed.stats.loyalty).toBe(state.stats.loyalty)
  })
})
