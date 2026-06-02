import { describe, expect, it } from 'vitest'
import { createBombObject, createTankObject, WARBUDDY_COMPONENTS } from '../src/archetypes'
import { GameClock, GameEngine, type GameSystem, GameWorld } from '../src/engine'
import { BATTLE_MAPS, BATTLE_SYSTEM_NAMES, parseBattleMap, runRealtimeBattle } from '../src/game'
import { DEFAULT_TANK_STRATEGY_CODE, DEFAULT_WARBUDDY_RULES } from '../src/rules'
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

function oppositeDirection(direction: 'up' | 'right' | 'down' | 'left') {
  return {
    up: 'down',
    right: 'left',
    down: 'up',
    left: 'right',
  }[direction]
}

describe('warbuddy battle engine', () => {
  it('exposes designer-editable rules and object primitives for engine expansion', () => {
    const world = new GameWorld(
      DEFAULT_WARBUDDY_RULES,
      new GameClock({ fps: 20, maxFrames: 500 }),
      () => 0.25,
    )
    const tankObject = world.addObject({ kind: 'tank', owner: 0, createdFrame: 0 })
    const engineerObject = world.addObject({ kind: 'engineer', owner: 0, createdFrame: 0 })
    tankObject.setComponent('transform', { x: 1, y: 2 })
    const archetypeTank = createTankObject(world, {
      owner: 1,
      createdFrame: 4,
      profile: tank({
        id: 'archetype-tank',
        name: 'Archetype Tank',
        code: 'function onTankIdle() {}',
      }),
      position: [2, 3],
      direction: 'left',
      hasBuddyStrategy: true,
      rules: DEFAULT_WARBUDDY_RULES,
    })
    const archetypeBomb = createBombObject(world, {
      owner: 1,
      createdFrame: 5,
      position: [3, 3],
      range: 2,
      fuseFrames: 18,
    })

    expect(tankObject.id).toMatch(/^tank_/)
    expect(engineerObject.id).toMatch(/^engineer_/)
    expect(tankObject.getComponent('transform')).toEqual({ x: 1, y: 2 })
    expect(tankObject.snapshot().componentKeys).toContain('transform')
    expect(archetypeTank.getComponent(WARBUDDY_COMPONENTS.transform)).toMatchObject({
      position: [2, 3],
      direction: 'left',
    })
    expect(archetypeTank.getComponent(WARBUDDY_COMPONENTS.strategy)).toMatchObject({
      skillType: 'shield',
      hasBuddyStrategy: true,
    })
    expect(archetypeBomb.getComponent(WARBUDDY_COMPONENTS.lifetime)).toEqual({
      remainingFrames: 18,
    })
    expect(world.objects.byKind('tank')).toHaveLength(2)
    expect(DEFAULT_WARBUDDY_RULES.terrain.w.tankPassable).toBe(false)
    expect(DEFAULT_WARBUDDY_RULES.terrain.w.engineerPassable).toBe(true)
    expect(DEFAULT_TANK_STRATEGY_CODE).toContain('function onTankIdle')
    expect(DEFAULT_TANK_STRATEGY_CODE).toContain('function onEngineerIdle')
    expect(BATTLE_SYSTEM_NAMES).toEqual([
      'input',
      'strategy',
      'command',
      'motion',
      'combat',
      'objective',
      'settlement',
      'recording',
    ])
  })

  it('runs engine systems in order with per-system enable and stop hooks', () => {
    const order: string[] = []
    const world = {
      clock: new GameClock({ fps: 20, maxFrames: 5 }),
      frame: 0,
      stopped: false,
      beginFrame(frame: number) {
        this.frame = frame
      },
    }
    const systems: Array<GameSystem<typeof world>> = [
      { name: 'decision', tick: (runtime) => order.push(`decision:${runtime.frame}`) },
      {
        name: 'optional',
        enabled: (runtime) => runtime.frame < 2,
        tick: (runtime) => order.push(`optional:${runtime.frame}`),
      },
      {
        name: 'result',
        tick: (runtime) => {
          order.push(`result:${runtime.frame}`)
          runtime.stopped = runtime.frame === 2
        },
        stopAfterTick: (runtime) => runtime.stopped,
      },
      { name: 'maintenance', tick: (runtime) => order.push(`maintenance:${runtime.frame}`) },
    ]

    new GameEngine(systems).run(world)

    expect(order).toEqual([
      'decision:0',
      'optional:0',
      'result:0',
      'maintenance:0',
      'decision:1',
      'optional:1',
      'result:1',
      'maintenance:1',
      'decision:2',
      'result:2',
    ])
  })

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

    const first = runRealtimeBattle({
      challenger: scout,
      defender: hunter,
      seed: 1234,
      mapId: 'classic',
    })
    const second = runRealtimeBattle({
      challenger: scout,
      defender: hunter,
      seed: 1234,
      mapId: 'classic',
    })

    expect(second.meta.result).toEqual(first.meta.result)
    expect(second.events.slice(0, 20)).toEqual(first.events.slice(0, 20))
    expect(first.frames.length).toBeGreaterThan(0)
    expect(first.summary.framesTotal).toBe(first.frames.length)
    expect(first.frames[0]!.state.flagScores).toEqual([0, 0])
    expect(
      first.frames.some((frame) => frame.state.flag || frame.state.flagScores.some(Boolean)),
    ).toBe(true)
  })

  it('routes bundled default strategies through maze maps instead of wall-facing loops', () => {
    const alpha = tank({
      id: 'default-a',
      name: 'Default A',
      code: DEFAULT_TANK_STRATEGY_CODE,
    })
    const bravo = tank({
      id: 'default-b',
      name: 'Default B',
      code: DEFAULT_TANK_STRATEGY_CODE,
    })

    const replay = runRealtimeBattle({
      challenger: alpha,
      defender: bravo,
      seed: 1,
      mapId: 'dirt-maze',
      maxFrames: 220,
    })
    const earlyAlphaPositions = replay.frames
      .slice(0, 180)
      .map((frame) => frame.state.tanks[0]!.position.join(':'))
    const earlyBravoPositions = replay.frames
      .slice(0, 180)
      .map((frame) => frame.state.tanks[1]!.position.join(':'))

    expect(new Set(earlyAlphaPositions).size).toBeGreaterThan(10)
    expect(new Set(earlyBravoPositions).size).toBeGreaterThan(10)
    expect(
      replay.events.filter((event) => event.type === 'tank' && event.action === 'go').length,
    ).toBeGreaterThanOrEqual(20)
  })

  it('uses the published default strategy code as the no-code realtime baseline', () => {
    const implicit = runRealtimeBattle({
      challenger: tank({ id: 'default-a', name: 'Default A', code: '' }),
      defender: tank({ id: 'default-b', name: 'Default B', code: '' }),
      seed: 22,
      mapId: 'dirt-maze',
      maxFrames: 160,
    })
    const explicit = runRealtimeBattle({
      challenger: tank({
        id: 'default-a',
        name: 'Default A',
        code: DEFAULT_TANK_STRATEGY_CODE,
      }),
      defender: tank({
        id: 'default-b',
        name: 'Default B',
        code: DEFAULT_TANK_STRATEGY_CODE,
      }),
      seed: 22,
      mapId: 'dirt-maze',
      maxFrames: 160,
    })

    expect(implicit.events.slice(0, 40)).toEqual(explicit.events.slice(0, 40))
    expect(implicit.frames.at(-1)?.state.tanks).toEqual(explicit.frames.at(-1)?.state.tanks)
  })

  it('keeps no-code default engineers moving when unsafe terrain bombs are rejected', () => {
    const replay = runRealtimeBattle({
      challenger: tank({ id: 'classic-a', name: 'Classic A', skillType: 'boost', code: '' }),
      defender: tank({ id: 'classic-b', name: 'Classic B', skillType: 'boost', code: '' }),
      seed: 7,
      mapId: 'classic',
      maxFrames: 40,
    })
    const start = replay.frames[0]!.state.engineers
    const end = replay.frames.at(-1)!.state.engineers
    const moved = end.map((engineer, index) =>
      Math.hypot(
        engineer.position[0] - start[index]!.position[0],
        engineer.position[1] - start[index]!.position[1],
      ),
    )

    expect(moved[0]).toBeGreaterThan(0.5)
    expect(moved[1]).toBeGreaterThan(0.5)
  })

  it('keeps default engineers from planting edge bombs without a reliable escape route', () => {
    const replay = runRealtimeBattle({
      challenger: tank({ id: 'edge-a', name: 'Edge A', skillType: 'boost', code: '' }),
      defender: tank({ id: 'edge-b', name: 'Edge B', skillType: 'boost', code: '' }),
      seed: 2,
      mapId: 'grass-cross',
      maxFrames: 110,
    })
    const engineers = replay.frames.at(-1)!.state.engineers

    expect(
      engineers.some(
        (engineer) => engineer.death?.cause === 'bomb' && engineer.death.by === engineer.owner,
      ),
    ).toBe(false)
  })

  it('records simulated movement as continuous world-coordinate replay frames', () => {
    const lane = parseBattleMap({
      id: 'continuous-lane',
      name: 'Continuous lane',
      raw: ['xxxxxxx', 'xA...Bx', 'xxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(lane)
    try {
      const replay = runRealtimeBattle({
        challenger: tank({
          id: 'continuous-a',
          name: 'Continuous A',
          code: 'function onIdle(me) { me.tank.drive("right"); }',
        }),
        defender: tank({ id: 'continuous-b', name: 'Continuous B', code: '// no op' }),
        seed: 14,
        mapId: 'continuous-lane',
        maxFrames: 24,
      })
      const interpolatedX = replay.frames
        .slice(0, 12)
        .map((frame) => frame.state.tanks[0]!.position[0])
      const jumps = interpolatedX.slice(1).map((value, index) => value - interpolatedX[index]!)

      expect(replay.meta.coordinateSpace).toBe('world')
      expect(Math.max(...interpolatedX)).toBeGreaterThan(2.4)
      expect(new Set(interpolatedX.map((value) => value.toFixed(2))).size).toBeGreaterThan(5)
      expect(Math.max(...jumps)).toBeLessThanOrEqual(0.21)
    } finally {
      BATTLE_MAPS.splice(BATTLE_MAPS.indexOf(lane), 1)
    }
  })

  it('keeps simulated tank heading aligned with interpolated movement', () => {
    const lane = parseBattleMap({
      id: 'heading-lock-lane',
      name: 'Heading lock lane',
      raw: ['xxxxxxx', 'xA...Bx', 'xxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(lane)
    try {
      const replay = runRealtimeBattle({
        challenger: tank({
          id: 'heading-lock-a',
          name: 'Heading Lock A',
          code: [
            'function onIdle(me) {',
            '  if (me.tank.position[0] < 3) { me.tank.drive("right"); return; }',
            '  me.tank.aim("up");',
            '}',
          ].join('\n'),
        }),
        defender: tank({ id: 'heading-lock-b', name: 'Heading Lock B', code: '// no op' }),
        seed: 15,
        mapId: 'heading-lock-lane',
        maxFrames: 24,
      })
      const movingFrame = replay.frames[11]!.state.tanks[0]!

      expect(movingFrame.position[0]).toBeGreaterThan(2.4)
      expect(movingFrame.position[0]).toBeLessThan(3.3)
      expect(movingFrame.headingDegrees).toBeCloseTo(0, 5)
    } finally {
      BATTLE_MAPS.splice(BATTLE_MAPS.indexOf(lane), 1)
    }
  })

  it('makes bundled default strategies aim and fire when enemies enter a clear lane', () => {
    const duelMap = parseBattleMap({
      id: 'default-face-to-face-duel',
      name: 'Default face to face duel',
      raw: ['xxxxxxx', 'x.....x', 'xA...Bx', 'x.....x', 'xxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(duelMap)
    try {
      const replay = runRealtimeBattle({
        challenger: tank({
          id: 'default-fire-a',
          name: 'Default Fire A',
          code: DEFAULT_TANK_STRATEGY_CODE,
        }),
        defender: tank({
          id: 'default-fire-b',
          name: 'Default Fire B',
          code: DEFAULT_TANK_STRATEGY_CODE,
        }),
        seed: 12,
        mapId: 'default-face-to-face-duel',
        maxFrames: 24,
      })
      const fireOwners = [
        ...new Set(
          replay.events
            .filter((event) => event.type === 'bullet' && event.action === 'fire')
            .map((event) => event.by),
        ),
      ].sort()

      expect(fireOwners).toEqual([0, 1])
    } finally {
      BATTLE_MAPS.pop()
    }
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

    const replay = runRealtimeBattle({
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

  it('rejects scripts that use blocked globals without crashing the battle', () => {
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

    const replay = runRealtimeBattle({
      challenger: unsafe,
      defender: safe,
      seed: 7,
      mapId: 'classic',
    })

    expect(
      replay.events.some(
        (event) =>
          event.type === 'runtime' && event.action === 'compile_error' && event.tank === 'Unsafe',
      ),
    ).toBe(true)
    expect(replay.summary.tanks.Unsafe?.crashes).toBe(0)
  })

  it('treats non-empty scripts without onIdle as no-op strategies', () => {
    const noop = tank({
      id: 'noop',
      name: 'Noop',
      code: '// no op',
    })
    const safe = tank({
      id: 'safe-noop-opponent',
      name: 'Safe Noop Opponent',
      code: 'function onIdle(me) { me.tank.aim("left"); }',
    })

    const replay = runRealtimeBattle({
      challenger: noop,
      defender: safe,
      seed: 7,
      mapId: 'classic',
      maxFrames: 40,
    })

    expect(
      replay.events.some((event) => event.type === 'runtime' && event.action === 'compile_error'),
    ).toBe(false)
    expect(
      replay.events.some(
        (event) => event.type === 'runtime' && event.action === 'crashed' && event.tank === 'Noop',
      ),
    ).toBe(false)
    expect(replay.summary.tanks.Noop?.crashes).toBe(0)
  })

  it('supports split tank and engineer strategy handlers with orthogonal movement APIs', () => {
    const split = tank({
      id: 'split',
      name: 'Split',
      code: [
        'function onTankIdle(tank) { tank.step("right"); tank.face("right"); }',
        'function onEngineerIdle(engineer, enemy, game) { engineer.moveTo(5, 1); engineer.speak("engineer ready"); }',
      ].join('\n'),
    })
    const safe = tank({
      id: 'split-opponent',
      name: 'Split Opponent',
      code: 'function onTankIdle(tank) { tank.face("left"); }',
    })

    const replay = runRealtimeBattle({
      challenger: split,
      defender: safe,
      seed: 8,
      mapId: 'classic',
      maxFrames: 40,
    })

    expect(replay.summary.tanks.Split?.moves).toBeGreaterThan(0)
    expect(
      replay.events.some(
        (event) =>
          event.type === 'tank' &&
          event.action === 'engineer_go' &&
          event.tank === 'Split Engineer',
      ),
    ).toBe(true)
    expect(replay.frames.at(-1)!.state.engineers[0]!.position[1]).toBeLessThan(
      replay.frames[0]!.state.engineers[0]!.position[1],
    )
  })

  it('derives frame limits from fps and battle duration metadata', () => {
    const idleA = tank({ id: 'duration-a', name: 'Duration A', code: '// no op' })
    const idleB = tank({ id: 'duration-b', name: 'Duration B', code: '// no op' })

    const replay = runRealtimeBattle({
      challenger: idleA,
      defender: idleB,
      seed: 10,
      mapId: 'classic',
      fps: 10,
      durationSeconds: 4,
    })

    expect(replay.meta.fps).toBe(10)
    expect(replay.meta.durationSeconds).toBe(4)
    expect(replay.meta.maxFrames).toBe(40)
    expect(replay.summary.framesTotal).toBe(41)
  })

  it('applies injected timing rules through realtime recording', () => {
    const rules = {
      ...DEFAULT_WARBUDDY_RULES,
      timing: {
        ...DEFAULT_WARBUDDY_RULES.timing,
        fps: 5,
        durationSeconds: 1,
        minDurationSeconds: 1,
      },
      pickups: {
        ...DEFAULT_WARBUDDY_RULES.pickups,
        starFirstFrame: 0,
        starSpawnIntervalFrames: 1,
        flagFirstFrame: 100,
      },
    }
    const idleA = tank({ id: 'rules-a', name: 'Rules A', code: '// no op' })
    const idleB = tank({ id: 'rules-b', name: 'Rules B', code: '// no op' })

    const replay = runRealtimeBattle({
      challenger: idleA,
      defender: idleB,
      seed: 12,
      mapId: 'classic',
      rules,
    })

    expect(replay.meta.fps).toBe(5)
    expect(replay.meta.maxFrames).toBe(5)
    expect(replay.meta.durationSeconds).toBe(1)
    expect(replay.frames).toHaveLength(6)
  })

  it('exposes WarBuddy tile vocabulary on every bundled map', () => {
    const allowed = new Set(['x', 'm', 'o', 'w', '.'])
    let waterTiles = 0
    expect(BATTLE_MAPS.length).toBeGreaterThanOrEqual(7)
    for (const map of BATTLE_MAPS) {
      expect(map.players).toHaveLength(2)
      const [alpha, bravo] = map.players
      expect(alpha!.position[0]).not.toBe(bravo!.position[0])
      expect(alpha!.position[1]).not.toBe(bravo!.position[1])
      const sameAxis =
        alpha!.position[0] === bravo!.position[0] || alpha!.position[1] === bravo!.position[1]
      expect(sameAxis && bravo!.direction === oppositeDirection(alpha!.direction)).toBe(false)
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

    const replay = runRealtimeBattle({
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

    const replay = runRealtimeBattle({
      challenger: wallDriver,
      defender: sentry,
      seed: 11,
      mapId: 'classic',
      maxFrames: 80,
    })

    expect(replay.summary.tanks['Wall Driver']!.moves).toBeGreaterThan(0)
    expect(replay.frames.at(-1)!.state.tanks[0]!.position[0]).toBeGreaterThan(
      replay.frames[0]!.state.tanks[0]!.position[0],
    )
    expect(replay.frames.at(-1)!.state.tanks[0]!.position[1]).toBeCloseTo(
      replay.frames[0]!.state.tanks[0]!.position[1],
      5,
    )
  })

  it('allows Buddy tank drive vectors to move diagonally in server replays', () => {
    const diagonalMap = parseBattleMap({
      id: 'diagonal-drive',
      name: 'Diagonal drive',
      raw: ['xxxxxxx', 'xA....x', 'x.....x', 'x....Bx', 'xxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(diagonalMap)
    try {
      const replay = runRealtimeBattle({
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
        maxFrames: 16,
      })

      const start = replay.frames[0]!.state.tanks[0]!.position
      const end = replay.frames.at(-1)!.state.tanks[0]!.position
      expect(end[0]).toBeGreaterThan(start[0])
      expect(end[1]).toBeGreaterThan(start[1])
      expect(end[0] % 1).not.toBe(0)
      expect(end[1] % 1).not.toBe(0)
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
      const replay = runRealtimeBattle({
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
        maxFrames: 32,
      })

      const positions = replay.frames.map((frame) => frame.state.tanks[0]!.position)
      const end = positions.at(-1)!
      expect(end[0]).toBeGreaterThan(3)
      expect(positions.some((position) => position[1] > 2)).toBe(true)
    } finally {
      BATTLE_MAPS.pop()
    }
  })

  it('includes engineer units and bomb play in agent-vs-agent simulations', () => {
    const bombMap = parseBattleMap({
      id: 'bomb-play-test',
      name: 'Bomb play test',
      raw: ['xxxxxxxxx', 'xA.....Bx', 'x.......x', 'x.......x', 'xxxxxxxxx'].join('|'),
    })
    const bomberA = tank({
      id: 'bomber-a',
      name: 'Bomber A',
      code: 'function onIdle(me, enemy, game) { if (game.frames < 8) me.engineer.move(1, 1); else if (game.frames < 10) me.engineer.bomb(); else me.engineer.move(1, 1); me.tank.aim("right"); }',
    })
    const bomberB = tank({
      id: 'bomber-b',
      name: 'Bomber B',
      code: 'function onIdle(me, enemy, game) { if (game.frames < 8) me.engineer.move(-1, 1); else if (game.frames < 10) me.engineer.bomb(); else me.engineer.move(-1, 1); me.tank.aim("left"); }',
    })

    BATTLE_MAPS.push(bombMap)
    try {
      const replay = runRealtimeBattle({
        challenger: bomberA,
        defender: bomberB,
        seed: 42,
        mapId: 'bomb-play-test',
        maxFrames: 70,
      })

      expect(replay.frames[0]!.state.engineers).toHaveLength(2)
      expect(replay.frames[0]!.state.tanks.every((tank) => tank.headingDegrees !== undefined)).toBe(
        true,
      )
      expect(
        replay.frames[0]!.state.engineers.every(
          (engineer) => engineer.headingDegrees !== undefined,
        ),
      ).toBe(true)
      expect(
        replay.frames.some(
          (frame) =>
            frame.state.engineers.some((engineer) => engineer.maxBombs >= 1) &&
            (frame.state.bombs.length > 0 || frame.state.explosions.length > 0),
        ),
      ).toBe(true)
    } finally {
      BATTLE_MAPS.pop()
    }
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

    const replay = runRealtimeBattle({
      challenger: idleTankA,
      defender: idleTankB,
      seed: 77,
      mapId: 'classic',
      maxFrames: 300,
    })
    const totalMoves = Object.values(replay.summary.tanks).reduce((sum, row) => sum + row.moves, 0)

    expect(totalMoves).toBeGreaterThan(0)
    expect(
      replay.events.some(
        (event) =>
          (event.type === 'bullet' && event.action === 'fire') ||
          (event.type === 'flag' && event.action.includes('captured')) ||
          (event.type === 'star' && event.action.includes('collected')),
      ),
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
      const replay = runRealtimeBattle({
        challenger: systemA,
        defender: systemB,
        seed,
        mapId,
        maxFrames: 600,
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
      const objectiveProgress = replay.events.filter(
        (event) =>
          (event.type === 'flag' && event.action.includes('captured')) ||
          (event.type === 'star' && event.action.includes('collected')),
      )
      const totalMoves = Object.values(replay.summary.tanks).reduce(
        (sum, row) => sum + row.moves,
        0,
      )

      expect(totalMoves).toBeGreaterThan(10)
      expect(fires.length + objectiveProgress.length).toBeGreaterThan(0)
      expect(friendlyEngineerBombHits).toHaveLength(0)
      expect(friendlyTankBombHits).toHaveLength(0)
    }
  })

  it('cancels opposing shells when they collide in agent-vs-agent simulations', () => {
    const clashMap = parseBattleMap({
      id: 'shell-clash-test',
      name: 'Shell clash test',
      raw: ['xxxxxxx', 'x.....x', 'xA...Bx', 'x.....x', 'xxxxxxx'].join('|'),
    })
    const shooterA = tank({
      id: 'shooter-a',
      name: 'Shooter A',
      code: 'function onIdle(me) { me.tank.aim(0); me.tank.fire(); }',
    })
    const shooterB = tank({
      id: 'shooter-b',
      name: 'Shooter B',
      code: 'function onIdle(me) { me.tank.aim(180); me.tank.fire(); }',
    })
    BATTLE_MAPS.push(clashMap)
    try {
      const replay = runRealtimeBattle({
        challenger: shooterA,
        defender: shooterB,
        seed: 11,
        mapId: 'shell-clash-test',
        maxFrames: 50,
      })

      expect(
        replay.events.some((event) => event.type === 'bullet' && event.action === 'clash'),
      ).toBe(true)
      expect(replay.frames.some((frame) => frame.state.bulletClashes > 0)).toBe(true)
    } finally {
      BATTLE_MAPS.pop()
    }
  })

  it('lets system fallback tanks keep shooting face to face', () => {
    const duelMap = parseBattleMap({
      id: 'face-to-face-duel',
      name: 'Face to face duel',
      raw: ['xxxxxxx', 'x.....x', 'xA...Bx', 'x.....x', 'xxxxxxx'].join('|'),
    })
    BATTLE_MAPS.push(duelMap)
    try {
      const replay = runRealtimeBattle({
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

    const replay = runRealtimeBattle({
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
          event.action === 'script_error' &&
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

    const replay = runRealtimeBattle({
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

    const replay = runRealtimeBattle({
      challenger: reckless,
      defender: sentry,
      seed: 4034,
      mapId: 'classic',
      maxFrames: 80,
    })

    expect(
      replay.events.filter((event) => event.type === 'bullet' && event.action === 'fire').length,
    ).toBeGreaterThan(0)
    expect(replay.summary.tanks['Reckless Shooter']!.moves).toBe(0)
  })
})
