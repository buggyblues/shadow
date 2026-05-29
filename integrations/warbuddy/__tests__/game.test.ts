import { describe, expect, it } from 'vitest'
import { BATTLE_MAPS, runBattle } from '../src/game'
import type { TankProfile } from '../src/types'

function tank(input: Partial<TankProfile> & Pick<TankProfile, 'id' | 'name' | 'code'>) {
  return {
    id: input.id,
    name: input.name,
    skillType: input.skillType ?? 'shield',
    code: input.code,
    codeHash: input.codeHash ?? input.id,
  } satisfies Pick<TankProfile, 'id' | 'name' | 'skillType' | 'code' | 'codeHash'>
}

describe('warbuddy battle engine', () => {
  it('runs deterministic frame-sync replays for the same seed', () => {
    const scout = tank({
      id: 'a',
      name: 'Scout',
      code: 'function onIdle(me, enemy, game) { if (game.star) me.go(); else me.turn("right"); }',
    })
    const hunter = tank({
      id: 'b',
      name: 'Hunter',
      skillType: 'overload',
      code: 'function onIdle(me, enemy) { if (enemy.tank) me.fire(); else me.turn("left"); }',
    })

    const first = runBattle({ challenger: scout, defender: hunter, seed: 1234, mapId: 'classic' })
    const second = runBattle({ challenger: scout, defender: hunter, seed: 1234, mapId: 'classic' })

    expect(second.meta.result).toEqual(first.meta.result)
    expect(second.events.slice(0, 20)).toEqual(first.events.slice(0, 20))
    expect(first.frames.length).toBeGreaterThan(0)
    expect(first.summary.framesTotal).toBe(first.frames.length)
  })

  it('crashes scripts that use blocked globals', () => {
    const unsafe = tank({
      id: 'unsafe',
      name: 'Unsafe',
      code: 'function onIdle() { eval("1 + 1"); }',
    })
    const safe = tank({
      id: 'safe',
      name: 'Safe',
      code: 'function onIdle(me) { me.turn("right"); }',
    })

    const replay = runBattle({ challenger: unsafe, defender: safe, seed: 7, mapId: 'classic' })

    expect(replay.meta.result.reason).toBe('crashed')
    expect(replay.meta.result.winner).toBe(1)
  })

  it('exposes WarBuddy tile vocabulary on every bundled map', () => {
    const allowed = new Set(['x', 'm', 'o', '.'])
    for (const map of BATTLE_MAPS) {
      expect(map.players).toHaveLength(2)
      for (const column of map.map) {
        for (const tile of column) expect(allowed.has(tile)).toBe(true)
      }
    }
  })

  it('unsticks agent-vs-agent simulations when scripts only turn in place', () => {
    const spinnerA = tank({
      id: 'spin-a',
      name: 'Spinner A',
      code: 'function onIdle(me) { me.turn("right"); }',
    })
    const spinnerB = tank({
      id: 'spin-b',
      name: 'Spinner B',
      code: 'function onIdle(me) { me.turn("left"); }',
    })

    const replay = runBattle({
      challenger: spinnerA,
      defender: spinnerB,
      seed: 99,
      mapId: 'classic',
      maxFrames: 80,
    })
    const totalMoves = Object.values(replay.summary.tanks).reduce((sum, row) => sum + row.moves, 0)

    expect(totalMoves).toBeGreaterThan(0)
    expect(
      replay.events.some((event) => event.type === 'runtime' && event.action === 'assist'),
    ).toBe(true)
  })
})
