import { describe, expect, it } from 'vitest'
import { BATTLE_MAPS, parseBattleMap, runBattle } from '../src/game'
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
      code: 'function onIdle(me, enemy, game) { if (game.star) me.tank.drive(); else me.tank.aim("right"); }',
    })
    const hunter = tank({
      id: 'b',
      name: 'Hunter',
      skillType: 'overload',
      code: 'function onIdle(me, enemy) { if (enemy.tank) me.tank.fire(); else me.tank.aim("left"); }',
    })

    const first = runBattle({ challenger: scout, defender: hunter, seed: 1234, mapId: 'classic' })
    const second = runBattle({ challenger: scout, defender: hunter, seed: 1234, mapId: 'classic' })

    expect(second.meta.result).toEqual(first.meta.result)
    expect(second.events.slice(0, 20)).toEqual(first.events.slice(0, 20))
    expect(first.frames.length).toBeGreaterThan(0)
    expect(first.summary.framesTotal).toBe(first.frames.length)
    expect(first.frames[0]!.state.flagScores).toEqual([0, 0])
    expect(
      first.frames.some((frame) => frame.state.flag || frame.state.flagScores.some(Boolean)),
    ).toBe(true)
  })

  it('delays pickup drops and exposes unit speech in server simulations', () => {
    const talker = tank({
      id: 'talker',
      name: 'Talker',
      code: 'function onIdle(me) { me.tank.speak("tank ready"); me.engineer.speak("planting soon"); me.tank.aim("right"); }',
    })
    const quiet = tank({
      id: 'quiet',
      name: 'Quiet',
      code: 'function onIdle(me) { me.tank.aim("left"); }',
    })

    const replay = runBattle({
      challenger: talker,
      defender: quiet,
      seed: 42,
      mapId: 'classic',
      maxFrames: 80,
    })

    expect(replay.frames.every((frame) => !frame.state.star && !frame.state.flag)).toBe(true)
    expect(
      replay.frames.some((frame) =>
        frame.state.speeches?.some((speech) => speech.text === 'tank ready'),
      ),
    ).toBe(true)
    expect(
      replay.frames.some((frame) =>
        frame.state.speeches?.some((speech) => speech.text === 'planting soon'),
      ),
    ).toBe(true)
    expect(replay.frames[0]!.state.scoreboard?.sides[0]).toMatchObject({
      owner: 0,
      flags: 0,
      tankAlive: true,
      engineerAlive: true,
    })
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
      code: 'function onIdle(me) { me.tank.aim("right"); }',
    })

    const replay = runBattle({ challenger: unsafe, defender: safe, seed: 7, mapId: 'classic' })

    expect(replay.meta.result.reason).toBe('crashed')
    expect(replay.meta.result.winner).toBe(1)
  })

  it('exposes WarBuddy tile vocabulary on every bundled map', () => {
    const allowed = new Set(['x', 'm', 'o', 'w', '.'])
    let waterTiles = 0
    for (const map of BATTLE_MAPS) {
      expect(map.players).toHaveLength(2)
      for (const column of map.map) {
        for (const tile of column) {
          expect(allowed.has(tile)).toBe(true)
          if (tile === 'w') waterTiles += 1
        }
      }
    }
    expect(waterTiles).toBeGreaterThan(0)
  })

  it('does not inject system movement when Buddy scripts only turn in place', () => {
    const spinnerA = tank({
      id: 'spin-a',
      name: 'Spinner A',
      code: 'function onIdle(me) { me.tank.aim("right"); }',
    })
    const spinnerB = tank({
      id: 'spin-b',
      name: 'Spinner B',
      code: 'function onIdle(me) { me.tank.aim("left"); }',
    })

    const replay = runBattle({
      challenger: spinnerA,
      defender: spinnerB,
      seed: 99,
      mapId: 'classic',
      maxFrames: 80,
    })
    const totalMoves = Object.values(replay.summary.tanks).reduce((sum, row) => sum + row.moves, 0)

    expect(totalMoves).toBe(0)
    expect(
      replay.events.some((event) => event.type === 'runtime' && event.action === 'assist'),
    ).toBe(false)
  })

  it('keeps scripted tank drive commands literal instead of rerouting them', () => {
    const wallDriver = tank({
      id: 'wall-driver',
      name: 'Wall Driver',
      code: 'function onIdle(me) { me.tank.drive("right"); }',
    })
    const sentry = tank({
      id: 'sentry',
      name: 'Sentry',
      code: 'function onIdle(me) { me.tank.aim("left"); }',
    })

    const replay = runBattle({
      challenger: wallDriver,
      defender: sentry,
      seed: 11,
      mapId: 'classic',
      maxFrames: 40,
    })

    expect(replay.summary.tanks['Wall Driver']!.moves).toBeGreaterThan(0)
    expect(
      replay.events.some(
        (event) =>
          event.type === 'tank' && event.action === 'blocked_move' && event.tank === 'Wall Driver',
      ),
    ).toBe(true)
  })

  it('allows Buddy tank drive vectors to move diagonally in server replays', () => {
    const diagonalMap = parseBattleMap({
      id: 'diagonal-drive',
      name: 'Diagonal drive',
      raw: ['xxxxxxx', 'xA....x', 'x.....x', 'x....Bx', 'xxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(diagonalMap)
    try {
      const replay = runBattle({
        challenger: tank({
          id: 'diagonal-driver',
          name: 'Diagonal Driver',
          code: 'function onIdle(me) { me.tank.drive(1, 1); }',
        }),
        defender: tank({
          id: 'diagonal-sentry',
          name: 'Diagonal Sentry',
          code: 'function onIdle(me) { me.tank.aim("left"); }',
        }),
        seed: 13,
        mapId: 'diagonal-drive',
        maxFrames: 4,
      })

      expect(
        replay.events.some(
          (event) =>
            event.type === 'tank' &&
            event.action === 'go' &&
            event.tank === 'Diagonal Driver' &&
            event.position?.[0] === 2 &&
            event.position?.[1] === 2,
        ),
      ).toBe(true)
    } finally {
      BATTLE_MAPS.pop()
    }
  })

  it('routes Buddy tank coordinate drive commands through map corridors', () => {
    const routeMap = parseBattleMap({
      id: 'coordinate-drive',
      name: 'Coordinate drive',
      raw: ['xxxxxxxx', 'xAxx..Bx', 'x......x', 'x......x', 'xxxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(routeMap)
    try {
      const replay = runBattle({
        challenger: tank({
          id: 'coordinate-driver',
          name: 'Coordinate Driver',
          code: 'function onIdle(me) { me.tank.drive(5, 1); }',
        }),
        defender: tank({
          id: 'coordinate-sentry',
          name: 'Coordinate Sentry',
          code: 'function onIdle(me) { me.tank.aim("left"); }',
        }),
        seed: 17,
        mapId: 'coordinate-drive',
        maxFrames: 8,
      })

      expect(
        replay.events.some(
          (event) =>
            event.type === 'tank' &&
            event.action === 'go' &&
            event.tank === 'Coordinate Driver' &&
            event.position?.[0] === 1 &&
            event.position?.[1] === 2,
        ),
      ).toBe(true)
      expect(
        replay.events.some(
          (event) =>
            event.type === 'tank' &&
            event.action === 'blocked_move' &&
            event.tank === 'Coordinate Driver',
        ),
      ).toBe(false)
    } finally {
      BATTLE_MAPS.pop()
    }
  })

  it('includes engineer units and bomb play in agent-vs-agent simulations', () => {
    const bomberA = tank({
      id: 'bomber-a',
      name: 'Bomber A',
      code: 'function onIdle(me, enemy, game) { if (game.frames < 2) me.engineer.move("right"); else me.engineer.bomb(); me.tank.aim("right"); }',
    })
    const bomberB = tank({
      id: 'bomber-b',
      name: 'Bomber B',
      code: 'function onIdle(me, enemy, game) { if (game.frames < 2) me.engineer.move("left"); else me.engineer.bomb(); me.tank.aim("left"); }',
    })

    const replay = runBattle({
      challenger: bomberA,
      defender: bomberB,
      seed: 42,
      mapId: 'classic',
      maxFrames: 70,
    })

    expect(replay.frames[0]!.state.engineers).toHaveLength(2)
    expect(replay.frames[0]!.state.tanks.every((tank) => tank.headingDegrees !== undefined)).toBe(
      true,
    )
    expect(
      replay.frames[0]!.state.engineers.every((engineer) => engineer.headingDegrees !== undefined),
    ).toBe(true)
    expect(
      replay.frames.some(
        (frame) =>
          frame.state.engineers.some((engineer) => engineer.maxBombs >= 1) &&
          (frame.state.bombs.length > 0 || frame.state.explosions.length > 0),
      ),
    ).toBe(true)
  })

  it('uses system combined-arms tactics when no Buddy strategy exists', () => {
    const idleTankA = tank({
      id: 'idle-a',
      name: 'Idle A',
      code: '',
    })
    const idleTankB = tank({
      id: 'idle-b',
      name: 'Idle B',
      code: '',
    })

    const replay = runBattle({
      challenger: idleTankA,
      defender: idleTankB,
      seed: 77,
      mapId: 'classic',
      maxFrames: 140,
    })
    const totalMoves = Object.values(replay.summary.tanks).reduce((sum, row) => sum + row.moves, 0)

    expect(totalMoves).toBeGreaterThan(0)
    expect(
      replay.events.some((event) => event.type === 'tank' && event.action === 'bomb_planted'),
    ).toBe(true)
  })

  it('keeps system fallback battles moving without friendly bomb traps', () => {
    const systemA = tank({ id: 'system-a', name: 'A', code: '' })
    const systemB = tank({ id: 'system-b', name: 'B', code: '' })
    const regressionSeeds: Array<[number, string]> = [
      [6, 'classic'],
      [19, 'dirt-maze'],
      [48, 'classic'],
      [198, 'classic'],
      [339, 'classic'],
    ]

    for (const [seed, mapId] of regressionSeeds) {
      const replay = runBattle({
        challenger: systemA,
        defender: systemB,
        seed,
        mapId,
        maxFrames: 180,
      })
      const friendlyEngineerBombHits = replay.events.filter(
        (event) =>
          event.type === 'tank' &&
          event.action === 'engineer_bomb_hit' &&
          ((event.by === 0 && event.tank === 'A Engineer') ||
            (event.by === 1 && event.tank === 'B Engineer')),
      )
      const friendlyTankBombHits = replay.events.filter(
        (event) =>
          event.type === 'tank' &&
          event.action === 'bomb_hit' &&
          ((event.by === 0 && event.tank === 'A') || (event.by === 1 && event.tank === 'B')),
      )
      const fires = replay.events.filter(
        (event) => event.type === 'bullet' && event.action === 'fire',
      )
      const totalMoves = Object.values(replay.summary.tanks).reduce(
        (sum, row) => sum + row.moves,
        0,
      )

      expect(totalMoves).toBeGreaterThan(20)
      expect(fires.length).toBeGreaterThan(0)
      expect(friendlyEngineerBombHits).toHaveLength(0)
      expect(friendlyTankBombHits).toHaveLength(0)
    }
  })

  it('cancels opposing shells when they collide in agent-vs-agent simulations', () => {
    const shooterA = tank({
      id: 'shooter-a',
      name: 'Shooter A',
      code: 'function onIdle(me) { me.tank.fire(); }',
    })
    const shooterB = tank({
      id: 'shooter-b',
      name: 'Shooter B',
      code: 'function onIdle(me) { me.tank.fire(); }',
    })

    const replay = runBattle({
      challenger: shooterA,
      defender: shooterB,
      seed: 11,
      mapId: 'grass-cross',
      maxFrames: 50,
    })

    expect(replay.events.some((event) => event.type === 'bullet' && event.action === 'clash')).toBe(
      true,
    )
    expect(replay.frames.some((frame) => frame.state.bulletClashes > 0)).toBe(true)
  })

  it('lets system fallback tanks keep shooting face to face', () => {
    const duelMap = parseBattleMap({
      id: 'face-to-face-duel',
      name: 'Face to face duel',
      raw: ['xxxxxxx', 'x.....x', 'xA...Bx', 'x.....x', 'xxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(duelMap)
    try {
      const replay = runBattle({
        challenger: tank({ id: 'fallback-a', name: 'Fallback A', code: '' }),
        defender: tank({ id: 'fallback-b', name: 'Fallback B', code: '' }),
        seed: 9,
        mapId: 'face-to-face-duel',
        maxFrames: 40,
      })
      const fireOwners = [
        ...new Set(
          replay.events
            .filter((event) => event.type === 'bullet' && event.action === 'fire')
            .map((event) => event.by),
        ),
      ].sort()
      const clashes = replay.events.filter(
        (event) => event.type === 'bullet' && event.action === 'clash',
      )
      const hits = replay.events.filter(
        (event) => event.type === 'bullet' && event.action === 'hit',
      )

      expect(fireOwners).toEqual([0, 1])
      expect(clashes.length + hits.length).toBeGreaterThan(0)
    } finally {
      BATTLE_MAPS.pop()
    }
  })

  it('does not expose legacy root action APIs to strategy scripts', () => {
    const legacyFire = ['me', 'fire'].join('.')
    const legacy = tank({
      id: 'legacy',
      name: 'Legacy',
      code: `function onIdle(me) { ${legacyFire}(); }`,
    })
    const modern = tank({
      id: 'modern',
      name: 'Modern',
      code: 'function onIdle(me) { me.tank.aim("left"); }',
    })

    const replay = runBattle({
      challenger: legacy,
      defender: modern,
      seed: 17,
      mapId: 'classic',
      maxFrames: 30,
    })

    expect(
      replay.events.some(
        (event) =>
          event.type === 'runtime' &&
          event.action === 'crashed' &&
          event.tank === 'Legacy' &&
          String(event.reason).includes('me.fire'),
      ),
    ).toBe(true)
  })

  it('prevents scripts from planting bombs that their own tank would immediately detonate', () => {
    const recklessA = tank({
      id: 'reckless-a',
      name: 'Reckless A',
      code: 'function onIdle(me) { me.tank.fire(); if (me.engineer) me.engineer.bomb(); }',
    })
    const recklessB = tank({
      id: 'reckless-b',
      name: 'Reckless B',
      code: 'function onIdle(me) { me.tank.fire(); if (me.engineer) me.engineer.bomb(); }',
    })

    const replay = runBattle({
      challenger: recklessA,
      defender: recklessB,
      seed: 1148,
      mapId: 'grass-cross',
      maxFrames: 20,
    })

    expect(
      replay.events.some(
        (event) => event.type === 'tank' && event.action === 'bomb_planted' && event.frame === 0,
      ),
    ).toBe(false)
    expect(
      replay.events.some(
        (event) => event.type === 'tank' && event.action === 'bomb_hit' && event.frame <= 8,
      ),
    ).toBe(false)
  })

  it('does not move scripted fire-only tanks with system tactics', () => {
    const reckless = tank({
      id: 'reckless-shooter',
      name: 'Reckless Shooter',
      code: 'function onIdle(me) { me.tank.fire(); }',
    })
    const sentry = tank({
      id: 'cover-sentry',
      name: 'Cover Sentry',
      code: 'function onIdle(me) { me.tank.aim("left"); }',
    })

    const replay = runBattle({
      challenger: reckless,
      defender: sentry,
      seed: 4034,
      mapId: 'classic',
      maxFrames: 80,
    })

    expect(
      replay.events.filter(
        (event) =>
          event.type === 'bullet' && event.action === 'fire_blocked' && event.reason === 'no_line',
      ).length,
    ).toBeGreaterThan(0)
    expect(replay.summary.tanks['Reckless Shooter']!.moves).toBe(0)
  })
})
