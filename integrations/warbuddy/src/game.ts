import vm from 'node:vm'
import type {
  BattleBombState,
  BattleBulletState,
  BattleEvent,
  BattleExplosionState,
  BattleFrame,
  BattleFrameState,
  BattleMap,
  BattleReplay,
  BattleResultReason,
  BattleSpeechState,
  BattleSummary,
  Direction,
  RuntimeEngineerState,
  SkillType,
  TankProfile,
  Tile,
  UnitDeathState,
} from './types.js'

const MAX_FRAMES = 300
const MAX_ACTION_QUEUE = 12
const MAX_SPEECH_PER_TANK = 32
const MAX_SCRIPT_BYTES = 24_000
const SCRIPT_TIMEOUT_MS = 25
const ENGINEER_BOMB_COOLDOWN = 12
const BOMB_FUSE_FRAMES = 18
const EXPLOSION_TTL = 6
const STAR_FIRST_FRAME = 120
const STAR_SPAWN_INTERVAL = 150
const FLAG_FIRST_FRAME = 180
const FLAG_SPAWN_INTERVAL = 210
const MIN_PICKUP_SEPARATION = 5
const MIN_PICKUP_UNIT_DISTANCE = 3
const TANK_HIT_RADIUS = 0.68
const ENGINEER_HIT_RADIUS = 0.58
const TANK_CRUSH_RADIUS = 0.82
const SPEECH_TTL = 18
const STAR_POWER_GLOW_FRAMES = 36
const INITIAL_BOMB_RANGE = 2
const MAX_BOMB_RANGE = 5
const MAX_ENGINEER_BOMBS = 3
const FLAG_TARGET = 3
const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left']
const DIR_DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}

const SKILL_COOLDOWNS: Record<SkillType, number> = {
  shield: 30,
  freeze: 34,
  stun: 25,
  overload: 32,
  cloak: 35,
  poison: 25,
  teleport: 40,
  boost: 31,
}

const BLOCKED_SCRIPT_TOKENS =
  /\b(?:constructor|document|eval|fetch|Function|global|globalThis|import|process|prototype|require|WebSocket|window|Worker|XMLHttpRequest)\b|__proto__/u

type Action =
  | { type: 'go' }
  | { type: 'drive'; x: number; y: number }
  | { type: 'turn'; side: 'left' | 'right' }
  | { type: 'fire' }
  | { type: 'engineerMove'; direction: Direction }
  | { type: 'engineerBomb' }
  | { type: 'skill'; skill: Exclude<SkillType, 'teleport'> }
  | { type: 'teleport'; x: number; y: number }

interface InternalBullet {
  id: string
  owner: number
  position: [number, number]
  direction: Direction
  headingDegrees?: number
  alive: boolean
}

interface InternalTank {
  profile: Pick<TankProfile, 'id' | 'name' | 'skillType' | 'code' | 'codeHash'>
  objectId: string
  position: [number, number]
  direction: Direction
  lastPosition: [number, number]
  stalledFrames: number
  crashed: boolean
  stars: number
  shotgunLevel: number
  armor: number
  queue: Action[]
  cooldown: number
  shieldRemaining: number
  freezeRemaining: number
  stunRemaining: number
  overloadRemaining: number
  cloakRemaining: number
  poisonRemaining: number
  boostRemaining: number
  fireLocked: number
  powerGlowRemaining: number
  death: UnitDeathState | null
  speechCount: number
  runTime: number
  brain: ScriptBrain | null
  stats: {
    shotsFired: number
    shotsHit: number
    shotsWall: number
    moves: number
    turns: number
    skillUsed: number
    crashes: number
    runtimeErrors: number
  }
}

function hasStrategyCode(code: string) {
  return code.trim().length > 0
}

interface InternalEngineer {
  id: string
  owner: number
  name: string
  objectId: string
  position: [number, number]
  direction: Direction
  heading: number
  alive: boolean
  bombRange: number
  maxBombs: number
  starUpgrades: number
  bombCooldown: number
  powerGlowRemaining: number
  speechCount: number
  death: UnitDeathState | null
}

interface InternalBomb {
  id: string
  owner: number
  position: [number, number]
  range: number
  remainingFrames: number
}

interface InternalSpeech {
  id: string
  owner: number
  unitKind: 'tank' | 'engineer'
  unitName: string
  text: string
  remainingFrames: number
}

interface InternalExplosion {
  id: string
  owner: number
  positions: Array<[number, number]>
  remainingFrames: number
}

export interface RunBattleInput {
  challenger: Pick<TankProfile, 'id' | 'name' | 'skillType' | 'code' | 'codeHash'>
  defender: Pick<TankProfile, 'id' | 'name' | 'skillType' | 'code' | 'codeHash'>
  mapId?: string
  seed?: number
  maxFrames?: number
}

export const BATTLE_MAPS: BattleMap[] = [
  parseBattleMap({
    id: 'classic',
    name: 'Classic lanes',
    raw: [
      'xxxxxxxxxxxxxxxxxxx',
      'xA....x..ww.o.....x',
      'x....x............x',
      'x...m........x....x',
      'xm..m..ox...mx....x',
      'x......o......o.x.x',
      'x...x.........o..xx',
      'xxo.ooo.....ooo.oxx',
      'xx..o.........x...x',
      'x.x.o......o......x',
      'x....xm...xo..m..mx',
      'x....x....ww..m...x',
      'x............x..B.x',
      'x.....o.....xx....x',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
  parseBattleMap({
    id: 'dirt-maze',
    name: 'Dirt maze',
    raw: [
      'xxxxxxxxxxxxxxxxxxx',
      'xA....m.....m.....x',
      'x.xxx.m.xxx.m.xxx.x',
      'x.....m.....m.....x',
      'x.mmmmm..x..mmmm..x',
      'x......woxo.......x',
      'xxx.x.x..o..x.x.xxx',
      'x...o....o....o...x',
      'xxx.x.x..o..x.x.xxx',
      'x.......oxow......x',
      'x..mmmm..x..mmmmm.x',
      'x.....m.....m.....x',
      'x.xxx.m.xxx.m.xxx.x',
      'x.....m.....m....Bx',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
  parseBattleMap({
    id: 'grass-cross',
    name: 'Grass cross',
    raw: [
      'xxxxxxxxxxxxxxxxxxx',
      'xA......ooo......Bx',
      'x.xxx....o....xxx.x',
      'x...x....o....x...x',
      'x.m.x..mmomm..x.m.x',
      'x...x....o....x...x',
      'x......oowoo......x',
      'xooooooo...ooooooox',
      'x......ooooo......x',
      'x...x....o....x...x',
      'x.m.x..mmomm..x.m.x',
      'x...x....o....x...x',
      'x.xxx....o....xxx.x',
      'x.......ooo.......x',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
]

class ScriptBrain {
  private readonly context: vm.Context
  private readonly callScript = new vm.Script('onIdle(__me, __enemy, __game);')
  readonly compileError: string | null

  constructor(
    code: string,
    private readonly onSpeech: (text: string) => void,
    private readonly onPrint: (args: unknown[]) => void,
  ) {
    const raw = Buffer.byteLength(code, 'utf8') > MAX_SCRIPT_BYTES ? '' : code
    this.context = vm.createContext({
      Math,
      Number,
      String,
      Boolean,
      Array,
      Object,
      JSON,
      Date: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      print: (...args: unknown[]) => this.onPrint(args),
      speak: (text: unknown) => this.onSpeech(String(text ?? '')),
    })

    if (!raw) {
      this.compileError = 'script_too_large'
      return
    }
    if (BLOCKED_SCRIPT_TOKENS.test(raw)) {
      this.compileError = 'script_uses_blocked_global'
      return
    }

    try {
      new vm.Script(
        `"use strict";\n${raw}\n;if (typeof onIdle !== "function") throw new Error("missing_onIdle");`,
      ).runInContext(this.context, { timeout: SCRIPT_TIMEOUT_MS })
      this.compileError = null
    } catch (error) {
      this.compileError = error instanceof Error ? error.message : String(error)
    }
  }

  run(me: unknown, enemy: unknown, game: unknown) {
    ;(this.context as Record<string, unknown>).__me = me
    ;(this.context as Record<string, unknown>).__enemy = enemy
    ;(this.context as Record<string, unknown>).__game = game
    const started = performance.now()
    try {
      this.callScript.runInContext(this.context, { timeout: SCRIPT_TIMEOUT_MS })
      return { ok: true as const, runtimeMs: performance.now() - started }
    } catch (error) {
      return {
        ok: false as const,
        runtimeMs: performance.now() - started,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

export function parseBattleMap(input: { id: string; name: string; raw: string }): BattleMap {
  const rows = input.raw
    .split('|')
    .map((row) => row.trim())
    .filter(Boolean)
  const height = rows.length
  const width = Math.max(...rows.map((row) => row.length))
  const map: Tile[][] = Array.from({ length: width }, () => Array<Tile>(height).fill('x'))
  const players: BattleMap['players'] = []

  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      const char = row[x] ?? 'x'
      if (char === 'A' || char === 'B') {
        players[char === 'A' ? 0 : 1] = {
          position: [x, y],
          direction: char === 'A' ? 'right' : 'left',
        }
        map[x]![y] = '.'
      } else {
        map[x]![y] = char === 'm' || char === 'o' || char === 'w' || char === '.' ? char : 'x'
      }
    }
  })

  if (!players[0] || !players[1]) {
    throw new Error(`Battle map ${input.id} must include A and B spawn points`)
  }
  return { ...input, map, players }
}

export function runBattle(input: RunBattleInput): BattleReplay {
  const seed = normalizeSeed(input.seed)
  const rng = createRng(seed)
  const map = chooseMap(input.mapId, rng)
  const runtimeMap = cloneMap(map.map)
  const events: Array<BattleEvent & { frame: number }> = []
  const frames: BattleFrame[] = []
  const bullets: InternalBullet[] = []
  const bombs: InternalBomb[] = []
  const explosions: InternalExplosion[] = []
  let speeches: InternalSpeech[] = []

  let currentFrameEvents: BattleEvent[] = []
  const tanks = [input.challenger, input.defender].map((profile, index): InternalTank => {
    const spawn = map.players[index]!
    const tank: InternalTank = {
      profile,
      objectId: randomId(rng, 'tank'),
      position: [...spawn.position],
      direction: spawn.direction,
      lastPosition: [...spawn.position],
      stalledFrames: 0,
      crashed: false,
      stars: 0,
      shotgunLevel: 0,
      armor: 1,
      queue: [],
      cooldown: 0,
      shieldRemaining: 0,
      freezeRemaining: 0,
      stunRemaining: 0,
      overloadRemaining: 0,
      cloakRemaining: 0,
      poisonRemaining: 0,
      boostRemaining: 0,
      fireLocked: 0,
      powerGlowRemaining: 0,
      death: null,
      speechCount: 0,
      runTime: 0,
      brain: null,
      stats: {
        shotsFired: 0,
        shotsHit: 0,
        shotsWall: 0,
        moves: 0,
        turns: 0,
        skillUsed: 0,
        crashes: 0,
        runtimeErrors: 0,
      },
    }
    if (hasStrategyCode(profile.code)) {
      tank.brain = new ScriptBrain(
        profile.code,
        (text) =>
          speak({
            unit: tank,
            tankIndex: index,
            unitKind: 'tank',
            unitName: tank.profile.name,
            events: currentFrameEvents,
            speeches,
            text,
          }),
        (args) => print(tank, currentFrameEvents, args),
      )
      if (tank.brain.compileError) {
        tank.crashed = true
        tank.death = {
          cause: 'runtime',
          by: null,
          frame: 0,
          detail: tank.brain.compileError,
        }
        tank.stats.crashes += 1
        currentFrameEvents.push({
          type: 'runtime',
          action: 'compile_error',
          by: index,
          tank: tank.profile.name,
          reason: tank.brain.compileError,
        })
      }
    }
    return tank
  })
  const engineers = tanks.map(
    (tank, index): InternalEngineer => ({
      id: `${tank.profile.id}:engineer`,
      owner: index,
      name: `${tank.profile.name} Engineer`,
      objectId: randomId(rng, 'engineer'),
      position: findEngineerSpawn(runtimeMap, tank.position, index),
      direction: tank.direction,
      heading: angleFromDirection(tank.direction),
      alive: !tank.crashed,
      bombRange: INITIAL_BOMB_RANGE,
      maxBombs: 1,
      starUpgrades: 0,
      bombCooldown: 0,
      powerGlowRemaining: 0,
      speechCount: 0,
      death: null,
    }),
  )

  let star: [number, number] | null = null
  let flag: [number, number] | null = null
  const flagScores: [number, number] = [0, 0]
  let bulletClashes = 0
  let result: BattleReplay['meta']['result'] | null = null
  const maxFrames = clampInt(input.maxFrames ?? MAX_FRAMES, 40, 500)

  for (let frame = 0; frame < maxFrames; frame += 1) {
    currentFrameEvents = []
    tickSpeeches(speeches)
    if (
      !star &&
      frame >= STAR_FIRST_FRAME &&
      (frame - STAR_FIRST_FRAME) % STAR_SPAWN_INTERVAL === 0
    ) {
      star = spawnStar(runtimeMap, tanks, engineers, bullets, bombs, rng, flag)
      if (star) currentFrameEvents.push({ type: 'star', action: 'created', position: star })
    }
    if (
      !flag &&
      frame >= FLAG_FIRST_FRAME &&
      (frame - FLAG_FIRST_FRAME) % FLAG_SPAWN_INTERVAL === 0
    ) {
      flag = spawnFlag(runtimeMap, tanks, engineers, bullets, bombs, rng, star)
      if (flag) currentFrameEvents.push({ type: 'flag', action: 'created', position: flag })
    }

    for (let index = 0; index < tanks.length; index += 1) {
      const tank = tanks[index]!
      const opponent = tanks[1 - index]!
      if (tank.crashed && !engineers[index]?.alive) continue
      const canActThisFrame = tank.crashed ? true : canTankActThisFrame(tank, frame)
      if (canActThisFrame && !tank.brain) tank.queue = []
      if (canActThisFrame && tank.queue.length === 0) {
        if (tank.brain) {
          runOnIdle({
            frame,
            tankIndex: index,
            tank,
            opponent,
            tanks,
            engineers,
            bombs,
            bullets,
            map: runtimeMap,
            star,
            flag,
            flagScores,
            events: currentFrameEvents,
            speeches,
          })
        } else {
          const fallback = fallbackAction({
            tankIndex: index,
            tank,
            opponent,
            engineers,
            bombs,
            bullets,
            map: runtimeMap,
            star,
            flag,
            rng,
          })
          if (fallback) {
            queueAction(tank, fallback)
          }
        }
      }
    }

    for (let index = 0; index < tanks.length; index += 1) {
      const tank = tanks[index]!
      if (tank.crashed && !engineers[index]?.alive) continue
      if (!tank.crashed && !canTankActThisFrame(tank, frame)) continue
      const actions = tank.queue.splice(0, 2)
      for (const action of actions) {
        if (tank.crashed && !isEngineerAction(action)) continue
        executeAction({
          frame,
          tankIndex: index,
          tank,
          opponent: tanks[1 - index]!,
          tanks,
          engineers,
          bombs,
          explosions,
          bullets,
          map: runtimeMap,
          action,
          rng,
          events: currentFrameEvents,
        })
      }
    }

    moveBullets({
      frame,
      bullets,
      tanks,
      engineers,
      bombs,
      explosions,
      map: runtimeMap,
      events: currentFrameEvents,
    })
    bulletClashes += currentFrameEvents.filter(
      (event) => event.type === 'bullet' && event.action === 'clash',
    ).length
    tickBombsAndExplosions({
      frame,
      map: runtimeMap,
      tanks,
      engineers,
      bombs,
      explosions,
      events: currentFrameEvents,
    })
    star = collectStar(star, tanks, engineers, currentFrameEvents)
    flag = collectFlag(flag, flagScores, tanks, engineers, currentFrameEvents)
    result = resolveImmediateResult(tanks, engineers, flagScores, currentFrameEvents)
    recordFrame(
      frame,
      frames,
      currentFrameEvents,
      tanks,
      engineers,
      bullets,
      bombs,
      explosions,
      runtimeMap,
      star,
      flag,
      flagScores,
      bulletClashes,
      speeches,
    )
    for (const event of currentFrameEvents) events.push({ ...event, frame })
    if (result) break
    updateStallCounters(tanks, currentFrameEvents)
    tickDown(tanks, engineers)
  }

  if (!result) result = resolveEndResult(flagScores)
  const excitementScore = calculateExcitement(tanks, events, frames.length, result)
  const summary = summarize(tanks, engineers, frames.length, result)
  return {
    meta: {
      mapId: map.id,
      mapName: map.name,
      matchSeed: seed,
      players: tanks.map((tank) => ({
        tankId: tank.profile.id,
        name: tank.profile.name,
        skillType: tank.profile.skillType,
        codeHash: tank.profile.codeHash,
        runTime: Math.round(tank.runTime),
      })),
      result,
      excitementScore,
    },
    frames,
    events,
    summary,
  }
}

function runOnIdle(input: {
  frame: number
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  tanks: InternalTank[]
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  bullets: InternalBullet[]
  map: Tile[][]
  star: [number, number] | null
  flag: [number, number] | null
  flagScores: [number, number]
  events: BattleEvent[]
  speeches: InternalSpeech[]
}) {
  if (!input.tank.brain) return
  const me = createMeApi(input)
  const enemy = buildEnemySnapshot(
    input.tankIndex,
    input.tank,
    input.opponent,
    input.engineers,
    input.bullets,
    input.map,
  )
  const game = {
    map: cloneMap(input.map),
    star: input.star ? [...input.star] : null,
    flag: input.flag ? [...input.flag] : null,
    flagScores: [...input.flagScores] as [number, number],
    frames: input.frame,
  }
  const result = input.tank.brain.run(me, enemy, game)
  input.tank.runTime += result.runtimeMs
  if (!result.ok) {
    input.tank.crashed = true
    input.tank.death = {
      cause: 'runtime',
      by: null,
      frame: input.frame,
      detail: result.error,
    }
    input.tank.stats.crashes += 1
    input.tank.stats.runtimeErrors += 1
    input.events.push({
      type: 'runtime',
      action: 'crashed',
      by: input.tankIndex,
      tank: input.tank.profile.name,
      reason: result.error,
    })
    return
  }
}

function fallbackAction(
  input: {
    tankIndex: number
    tank: InternalTank
    opponent: InternalTank
    engineers: InternalEngineer[]
    bombs: InternalBomb[]
    bullets: InternalBullet[]
    map: Tile[][]
    star: [number, number] | null
    flag: [number, number] | null
    rng: () => number
  },
  options: { queueEngineer?: boolean } = {},
): Action | null {
  if (input.tank.crashed) return fallbackEngineerAction(input)
  const enemyEngineer = input.engineers[1 - input.tankIndex]
  const opponentVisible =
    !input.opponent.crashed && !isTankHiddenFromServer(input.map, input.opponent, input.tank)
  const engineerVisible =
    Boolean(enemyEngineer?.alive) &&
    !isEngineerHiddenFromServer(input.map, enemyEngineer!, input.tank)
  const opponentShot = opponentVisible
    ? clearGridShotDirection(input.map, input.tank.position, input.opponent.position)
    : null
  const engineerShot =
    engineerVisible && enemyEngineer
      ? clearGridShotDirection(input.map, input.tank.position, enemyEngineer.position)
      : null
  const shouldPressureEngineer =
    engineerVisible &&
    enemyEngineer &&
    (!opponentVisible ||
      Boolean(engineerShot) ||
      manhattan(input.tank.position, enemyEngineer.position) + 2 <
        manhattan(input.tank.position, input.opponent.position))
  const combatTarget = shouldPressureEngineer
    ? enemyEngineer!.position
    : opponentVisible
      ? input.opponent.position
      : null
  const shotDirection = shouldPressureEngineer ? engineerShot : opponentShot
  const engineerAction = fallbackEngineerAction(input)
  const engineer = input.engineers[input.tankIndex]
  if (
    engineerAction &&
    engineer?.alive &&
    tankDangerAvoider(input.map, input.bombs)(engineer.position)
  ) {
    return engineerAction
  }
  const shouldQueueEngineer = options.queueEngineer ?? true
  const dodgeDirection = defensiveTankDirection(input)
  const blockedTank = blockingTankPosition(input.opponent)
  const canFireNow =
    input.tank.fireLocked === 0 &&
    !input.bullets.some((bullet) => bullet.owner === input.tankIndex && bullet.alive)
  if (dodgeDirection) {
    if (shouldQueueEngineer && engineerAction) queueAction(input.tank, engineerAction)
    if (dodgeDirection === input.tank.direction) return { type: 'go' }
    return { type: 'turn', side: turnSide(input.tank.direction, dodgeDirection) }
  }

  if (shotDirection && input.tank.direction === shotDirection && canFireNow) {
    if (shouldQueueEngineer && engineerAction) queueAction(input.tank, engineerAction)
    return { type: 'fire' }
  }

  const avoidDanger = tankDangerAvoider(input.map, input.bombs)
  const attackTarget = combatTarget
    ? nearestAttackPosition(input.map, input.tank.position, combatTarget, avoidDanger)
    : null
  const objectiveTarget = input.flag ?? input.star
  const pressureCombat =
    Boolean(combatTarget) &&
    Boolean(attackTarget) &&
    !input.flag &&
    (manhattan(input.tank.position, combatTarget!) <= 8 || !objectiveTarget)
  const targetCandidates = [
    input.flag,
    pressureCombat ? attackTarget : null,
    input.star,
    attackTarget,
    combatTarget,
  ].filter(Boolean) as [number, number][]
  const nextDirection =
    input.tank.stalledFrames >= 3
      ? (bestRoamDirection(
          input.map,
          input.tank.position,
          blockedTank,
          input.tank.direction,
          avoidDanger,
          input.rng,
          input.tank.stalledFrames,
        ) ??
        firstReachableDirection(input.map, input.tank.position, targetCandidates, blockedTank, {
          avoid: avoidDanger,
        }))
      : (firstReachableDirection(input.map, input.tank.position, targetCandidates, blockedTank, {
          avoid: avoidDanger,
        }) ??
        bestRoamDirection(
          input.map,
          input.tank.position,
          blockedTank,
          input.tank.direction,
          avoidDanger,
          input.rng,
          input.tank.stalledFrames,
        ))

  if (!nextDirection) return null
  if (shouldQueueEngineer && engineerAction) queueAction(input.tank, engineerAction)
  if (nextDirection === input.tank.direction) return { type: 'go' }
  return { type: 'turn', side: turnSide(input.tank.direction, nextDirection) }
}

function isEngineerAction(action: Action) {
  return action.type === 'engineerMove' || action.type === 'engineerBomb'
}

function fallbackEngineerAction(input: {
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  bullets: InternalBullet[]
  map: Tile[][]
  star: [number, number] | null
  flag: [number, number] | null
}): Action | null {
  const engineer = input.engineers[input.tankIndex]
  if (!engineer?.alive) return null
  const enemyEngineer = input.engineers[1 - input.tankIndex]
  const blockedEngineer: [number, number] = enemyEngineer?.alive ? enemyEngineer.position : [-1, -1]
  const activeDanger = tankDangerAvoider(input.map, input.bombs)
  if (activeDanger(engineer.position)) {
    const escape = nextEngineerEscapeDirection(
      input.map,
      input.bombs,
      engineer.position,
      blockedEngineer,
      activeDanger,
    )
    if (escape) return { type: 'engineerMove', direction: escape }
  }
  const opponentVisible =
    !input.opponent.crashed && !isTankHiddenFromServer(input.map, input.opponent, input.tank)
  const engineerVisible =
    Boolean(enemyEngineer?.alive) &&
    !isEngineerHiddenFromServer(input.map, enemyEngineer!, input.tank)
  const activeBombs = input.bombs.filter((bomb) => bomb.owner === input.tankIndex).length
  const combatTarget =
    opponentVisible && !input.opponent.crashed
      ? input.opponent.position
      : engineerVisible && enemyEngineer
        ? enemyEngineer.position
        : null
  const target = input.flag ?? input.star ?? combatTarget
  const plannedBlast = explosionPositions(
    cloneMap(input.map),
    engineer.position,
    engineer.bombRange,
  )
  const plannedBomb: InternalBomb = {
    id: 'planned',
    owner: input.tankIndex,
    position: [...engineer.position],
    range: engineer.bombRange,
    remainingFrames: BOMB_FUSE_FRAMES,
  }
  const canEscapeAfterBomb = Boolean(
    nextEngineerEscapeDirection(
      input.map,
      [...input.bombs, plannedBomb],
      engineer.position,
      blockedEngineer,
      (position) =>
        plannedBlast.some((blastPosition) => samePos(blastPosition, position)) ||
        activeDanger(position),
    ),
  )
  const canPlantBomb =
    !input.tank.crashed &&
    activeBombs < engineer.maxBombs &&
    engineer.bombCooldown === 0 &&
    canPlaceBombOnTile(input.map, engineer.position) &&
    !bombWouldThreatenOwnTank(input.map, input.tank, engineer.position, engineer.bombRange) &&
    canEscapeAfterBomb &&
    !plannedBombCanBeTriggeredBeforeEscape(input, engineer.position)
  const combatBomb = combatTarget
    ? plannedBlast.some((position) => samePos(position, combatTarget))
    : false
  const nextDirection = target
    ? nextEngineerPathDirection(
        input.map,
        input.bombs,
        engineer.position,
        target,
        enemyEngineer?.alive ? enemyEngineer.position : [-1, -1],
        { avoid: activeDanger },
      )
    : null
  const terrainBomb =
    target &&
    !nextDirection &&
    bombWouldOpenUsefulTerrain(input.map, engineer.position, engineer.bombRange)
  if (canPlantBomb && (combatBomb || terrainBomb)) {
    return { type: 'engineerBomb' }
  }
  if (!target) return null
  return nextDirection ? { type: 'engineerMove', direction: nextDirection } : null
}

function nextEngineerEscapeDirection(
  map: Tile[][],
  bombs: InternalBomb[],
  position: [number, number],
  blocked: [number, number],
  danger: (position: [number, number]) => boolean,
) {
  const visited = new Set([positionKey(position)])
  const queue: Array<{ position: [number, number]; first: Direction | null; depth: number }> = [
    { position, first: null, depth: 0 },
  ]
  while (queue.length) {
    const current = queue.shift()!
    const ordered = [...DIRECTIONS].sort((a, b) => {
      const nextA = add(current.position, DIR_DELTA[a])
      const nextB = add(current.position, DIR_DELTA[b])
      return openNeighborCount(map, nextB) - openNeighborCount(map, nextA)
    })
    for (const direction of ordered) {
      const next = add(current.position, DIR_DELTA[direction])
      const key = positionKey(next)
      if (visited.has(key) || !canEngineerEnter(map, next, blocked, bombs)) continue
      const first = current.first ?? direction
      if (!danger(next)) return first
      if (current.depth < 6) {
        visited.add(key)
        queue.push({ position: next, first, depth: current.depth + 1 })
      }
    }
  }
  return null
}

function bombWouldThreatenOwnTank(
  map: Tile[][],
  tank: InternalTank,
  origin: [number, number],
  range: number,
) {
  if (tank.crashed) return false
  return explosionPositions(cloneMap(map), origin, range).some((position) =>
    samePos(position, tank.position),
  )
}

function plannedBombCanBeTriggeredBeforeEscape(
  input: {
    tankIndex: number
    opponent: InternalTank
    bombs: InternalBomb[]
    bullets: InternalBullet[]
    map: Tile[][]
  },
  position: [number, number],
) {
  const enemyIndex = 1 - input.tankIndex
  if (
    input.bullets.some(
      (bullet) => bullet.alive && bulletWillReachPosition(input.map, input.bombs, bullet, position),
    )
  ) {
    return true
  }

  const contactDirection = clearGridShotDirection(input.map, input.opponent.position, position)
  if (
    !input.opponent.crashed &&
    contactDirection === input.opponent.direction &&
    manhattan(input.opponent.position, position) <= 2
  ) {
    return true
  }

  if (input.opponent.crashed || input.opponent.fireLocked > 0) return false
  if (input.bullets.some((bullet) => bullet.owner === enemyIndex && bullet.alive)) return false

  const shotDirection = clearGridShotDirection(input.map, input.opponent.position, position)
  return shotDirection === input.opponent.direction
}

function bulletWillReachPosition(
  map: Tile[][],
  bombs: InternalBomb[],
  bullet: InternalBullet,
  target: [number, number],
) {
  if (clearGridShotDirection(map, bullet.position, target) !== bullet.direction) return false
  let position = add(bullet.position, DIR_DELTA[bullet.direction])
  while (inBounds(map, position)) {
    if (samePos(position, target)) return true
    if (bombs.some((bomb) => samePos(bomb.position, position))) return false
    const tile = tileAt(map, position)
    if (tile === 'x' || tile === 'm') return false
    position = add(position, DIR_DELTA[bullet.direction])
  }
  return false
}

function bombWouldOpenUsefulTerrain(map: Tile[][], origin: [number, number], range: number) {
  return explosionPositions(cloneMap(map), origin, range).some((position) => {
    const tile = tileAt(map, position)
    return tile === 'm'
  })
}

function updateStallCounters(tanks: InternalTank[], events: BattleEvent[]) {
  for (const [index, tank] of tanks.entries()) {
    if (tank.crashed) continue
    if (samePos(tank.position, tank.lastPosition) && !sideMadeProgress(events, index)) {
      tank.stalledFrames += 1
    } else {
      tank.stalledFrames = 0
      tank.lastPosition = [...tank.position]
    }
  }
}

function sideMadeProgress(events: BattleEvent[], index: number) {
  return events.some((event) => {
    if (event.by !== index) return false
    if (event.type === 'bullet') {
      return (
        event.action === 'fire' ||
        event.action === 'hit' ||
        event.action === 'engineer_hit' ||
        event.action === 'dirt_destroyed' ||
        event.action === 'bomb_triggered'
      )
    }
    if (event.type === 'tank') {
      return (
        event.action === 'go' ||
        event.action === 'engineer_go' ||
        event.action === 'bomb_planted' ||
        event.action === 'engineer_crushed'
      )
    }
    if (event.type === 'flag') return event.action.includes('captured')
    if (event.type === 'star') return event.action.includes('collected')
    if (event.type === 'skill') return event.action === 'cast' || event.action === 'shield_blocked'
    return false
  })
}

function createMeApi(input: {
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  bullets: InternalBullet[]
  map: Tile[][]
  star: [number, number] | null
  flag: [number, number] | null
  events: BattleEvent[]
  speeches: InternalSpeech[]
}) {
  const engineer = input.engineers[input.tankIndex]
  const me: Record<string, unknown> = Object.create(null)
  const tankApi = publicTank(input.tank) as Record<string, unknown>
  const engineerApi = engineer
    ? (publicEngineer(engineer, input.map) as unknown as Record<string, unknown>)
    : null
  const tankDrive = (...args: unknown[]) => {
    const target = targetPositionFromDriveArgs(args)
    if (target) {
      const direction = nextPathDirection(
        input.map,
        input.tank.position,
        target,
        blockingTankPosition(input.opponent),
      )
      if (direction) queueTankDirectedMove(input.tank, direction)
      return
    }
    const requestedVector = driveVectorFromArgs(args)
    if (requestedVector) {
      queueAction(input.tank, { type: 'drive', x: requestedVector[0], y: requestedVector[1] })
      return
    }
    const requestedDirection = args.length ? directionFromDriveArgs(args) : input.tank.direction
    if (!requestedDirection) return
    queueTankDirectedMove(input.tank, requestedDirection)
  }
  const tankAim = (...args: unknown[]) => {
    const direction = directionFromAimArgs(args)
    if (direction && direction !== input.tank.direction) {
      queueAction(input.tank, { type: 'turn', side: turnSide(input.tank.direction, direction) })
    }
  }
  const tankFire = () => {
    if (
      input.tank.fireLocked > 0 ||
      input.bullets.some((bullet) => bullet.owner === input.tankIndex && bullet.alive)
    )
      return
    queueAction(input.tank, { type: 'fire' })
  }
  const tankSpeak = (text: unknown) =>
    speak({
      unit: input.tank,
      tankIndex: input.tankIndex,
      unitKind: 'tank',
      unitName: input.tank.profile.name,
      events: input.events,
      speeches: input.speeches,
      text: String(text ?? ''),
    })
  const engineerMove = (...args: unknown[]) => {
    const target = targetPositionFromDriveArgs(args)
    if (engineer && target) {
      const otherEngineer = input.engineers[1 - input.tankIndex]
      const direction = nextEngineerPathDirection(
        input.map,
        input.bombs,
        engineer.position,
        target,
        otherEngineer?.position ?? [-1, -1],
      )
      if (direction) queueAction(input.tank, { type: 'engineerMove', direction })
      return
    }
    const direction = directionFromDriveArgs(args)
    if (direction) queueAction(input.tank, { type: 'engineerMove', direction })
  }
  const engineerBomb = () => queueAction(input.tank, { type: 'engineerBomb' })
  const engineerSpeak = (text: unknown) =>
    engineer
      ? speak({
          unit: engineer,
          tankIndex: input.tankIndex,
          unitKind: 'engineer',
          unitName: engineer.name,
          events: input.events,
          speeches: input.speeches,
          text: String(text ?? ''),
        })
      : undefined
  const castSkill =
    input.tank.profile.skillType === 'teleport'
      ? (x: unknown, y: unknown) => {
          if (typeof x === 'number' && typeof y === 'number') {
            queueAction(input.tank, { type: 'teleport', x: Math.trunc(x), y: Math.trunc(y) })
          }
        }
      : () =>
          queueAction(input.tank, {
            type: 'skill',
            skill: input.tank.profile.skillType as Exclude<SkillType, 'teleport'>,
          })
  tankApi.drive = tankDrive
  tankApi.aim = tankAim
  tankApi.fire = tankFire
  tankApi.speak = tankSpeak
  tankApi[input.tank.profile.skillType] = castSkill
  if (engineerApi) {
    engineerApi.move = engineerMove
    engineerApi.bomb = engineerBomb
    engineerApi.speak = engineerSpeak
  }
  me.tank = tankApi
  me.engineer = engineerApi
  me.stars = input.tank.stars
  me.bullet = visibleOwnBullet(input.tankIndex, input.bullets)
  me.skill = publicSkill(input.tank)
  me.effects = publicEffects(input.tank)
  me.status = publicStatus(input.tank, true, input.map)
  return me
}

function queueTankDirectedMove(tank: InternalTank, direction: Direction) {
  if (direction === tank.direction) queueAction(tank, { type: 'go' })
  else queueAction(tank, { type: 'turn', side: turnSide(tank.direction, direction) })
}

function executeAction(input: {
  frame: number
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  tanks: InternalTank[]
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  explosions: InternalExplosion[]
  bullets: InternalBullet[]
  map: Tile[][]
  action: Action
  rng: () => number
  events: BattleEvent[]
}) {
  switch (input.action.type) {
    case 'go':
      moveTank(input)
      return
    case 'drive':
      moveTankVector(input, input.action)
      return
    case 'turn':
      turnTank(input, input.action)
      return
    case 'fire':
      fire(input)
      return
    case 'engineerMove':
      moveEngineer(input, input.action.direction)
      return
    case 'engineerBomb':
      placeEngineerBomb(input)
      return
    case 'skill':
      castSkill(input, input.action.skill)
      return
    case 'teleport':
      teleport(input, input.action.x, input.action.y)
      return
  }
}

function moveTank(input: {
  frame: number
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  tanks: InternalTank[]
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  explosions: InternalExplosion[]
  map: Tile[][]
  rng: () => number
  events: BattleEvent[]
}) {
  const tank = input.tank
  let direction = tank.direction
  let reverse = false
  if (tank.stunRemaining > 0 && input.rng() < 0.5) {
    direction = oppositeDirection(direction)
    reverse = true
  }
  const steps = tank.boostRemaining > 0 ? 2 : 1
  let moved = false
  const blockedTank = blockingTankPosition(input.opponent)
  for (let step = 0; step < steps; step += 1) {
    const previous = [...tank.position] as [number, number]
    const next = add(tank.position, DIR_DELTA[direction])
    if (!canEnter(input.map, next, blockedTank)) {
      if (step === 0) {
        input.events.push({
          type: 'tank',
          action: 'blocked_move',
          by: input.tankIndex,
          tank: tank.profile.name,
          objectId: tank.objectId,
          position: [...tank.position],
          direction,
        })
      }
      break
    }
    tank.position = next
    const triggeredBomb = input.bombs.find(
      (bomb) => pointToSegmentDistance(bomb.position, previous, tank.position) <= 0.72,
    )
    if (triggeredBomb) {
      detonateBombs({
        frame: input.frame,
        map: input.map,
        tanks: input.tanks,
        engineers: input.engineers,
        bombs: input.bombs,
        explosions: input.explosions,
        events: input.events,
        initial: [triggeredBomb],
      })
      if (tank.crashed) break
    }
    const enemyEngineer = input.engineers[1 - input.tankIndex]
    if (
      enemyEngineer?.alive &&
      sweptCircleHit(previous, tank.position, enemyEngineer.position, TANK_CRUSH_RADIUS)
    ) {
      killEngineer(enemyEngineer, {
        cause: 'crush',
        by: input.tankIndex,
        frame: input.frame,
        detail: tank.profile.name,
      })
      input.events.push({
        type: 'tank',
        action: 'engineer_crushed',
        by: input.tankIndex,
        tank: tank.profile.name,
        objectId: tank.objectId,
        position: [...tank.position],
        details: { target: enemyEngineer.name },
      })
    }
    moved = true
    input.events.push({
      type: 'tank',
      action: 'go',
      by: input.tankIndex,
      tank: tank.profile.name,
      objectId: tank.objectId,
      position: [...tank.position],
      details: reverse ? { reverse: true } : undefined,
    })
  }
  if (moved) tank.stats.moves += 1
}

function moveTankVector(
  input: {
    frame: number
    tankIndex: number
    tank: InternalTank
    opponent: InternalTank
    tanks: InternalTank[]
    engineers: InternalEngineer[]
    bombs: InternalBomb[]
    explosions: InternalExplosion[]
    map: Tile[][]
    rng: () => number
    events: BattleEvent[]
  },
  action: Extract<Action, { type: 'drive' }>,
) {
  const tank = input.tank
  const stepVector = gridStepFromVector(action.x, action.y)
  if (!stepVector) return
  let vector = stepVector
  let reverse = false
  if (tank.stunRemaining > 0 && input.rng() < 0.5) {
    vector = [-vector[0], -vector[1]]
    reverse = true
  }
  const steps = tank.boostRemaining > 0 ? 2 : 1
  let moved = false
  const blockedTank = blockingTankPosition(input.opponent)
  for (let step = 0; step < steps; step += 1) {
    const previous = [...tank.position] as [number, number]
    const next: [number, number] = [tank.position[0] + vector[0], tank.position[1] + vector[1]]
    if (!canTankDriveStep(input.map, tank.position, vector, blockedTank)) {
      if (step === 0) {
        input.events.push({
          type: 'tank',
          action: 'blocked_move',
          by: input.tankIndex,
          tank: tank.profile.name,
          objectId: tank.objectId,
          position: [...tank.position],
          direction: directionFromVector(vector[0], vector[1]) ?? tank.direction,
        })
      }
      break
    }
    tank.position = next
    tank.direction = directionFromVector(vector[0], vector[1]) ?? tank.direction
    const triggeredBomb = input.bombs.find((bomb) =>
      sweptCircleHit(previous, tank.position, bomb.position, 0.72),
    )
    if (triggeredBomb) {
      detonateBombs({
        frame: input.frame,
        map: input.map,
        tanks: input.tanks,
        engineers: input.engineers,
        bombs: input.bombs,
        explosions: input.explosions,
        events: input.events,
        initial: [triggeredBomb],
      })
      if (tank.crashed) break
    }
    const enemyEngineer = input.engineers[1 - input.tankIndex]
    if (
      enemyEngineer?.alive &&
      sweptCircleHit(previous, tank.position, enemyEngineer.position, TANK_CRUSH_RADIUS)
    ) {
      killEngineer(enemyEngineer, {
        cause: 'crush',
        by: input.tankIndex,
        frame: input.frame,
        detail: tank.profile.name,
      })
      input.events.push({
        type: 'tank',
        action: 'engineer_crushed',
        by: input.tankIndex,
        tank: tank.profile.name,
        objectId: tank.objectId,
        position: [...tank.position],
        details: { target: enemyEngineer.name },
      })
    }
    moved = true
    input.events.push({
      type: 'tank',
      action: 'go',
      by: input.tankIndex,
      tank: tank.profile.name,
      objectId: tank.objectId,
      position: [...tank.position],
      direction: tank.direction,
      details: reverse ? { reverse: true } : undefined,
    })
  }
  if (moved) tank.stats.moves += 1
}

function moveEngineer(
  input: {
    tankIndex: number
    tank: InternalTank
    engineers: InternalEngineer[]
    bombs: InternalBomb[]
    map: Tile[][]
    events: BattleEvent[]
  },
  direction: Direction,
) {
  const engineer = input.engineers[input.tankIndex]
  if (!engineer?.alive) return
  const other = input.engineers[1 - input.tankIndex]
  const next = add(engineer.position, DIR_DELTA[direction])
  if (!canEngineerEnter(input.map, next, other?.position ?? [-1, -1], input.bombs)) return
  engineer.position = next
  engineer.direction = direction
  engineer.heading = angleFromDirection(direction)
  input.events.push({
    type: 'tank',
    action: 'engineer_go',
    by: input.tankIndex,
    tank: input.tank.profile.name,
    objectId: engineer.objectId,
    position: [...engineer.position],
    direction,
  })
}

function placeEngineerBomb(input: {
  frame: number
  tankIndex: number
  tank: InternalTank
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  map: Tile[][]
  events: BattleEvent[]
}) {
  const engineer = input.engineers[input.tankIndex]
  if (!engineer?.alive || engineer.bombCooldown > 0) return
  const activeBombs = input.bombs.filter((bomb) => bomb.owner === input.tankIndex).length
  if (activeBombs >= engineer.maxBombs) return
  if (input.bombs.some((bomb) => samePos(bomb.position, engineer.position))) return
  if (!canPlaceBombOnTile(input.map, engineer.position)) return
  if (bombWouldThreatenOwnTank(input.map, input.tank, engineer.position, engineer.bombRange)) return
  const bomb: InternalBomb = {
    id: `bomb_${input.frame}_${input.tankIndex}_${input.bombs.length}`,
    owner: input.tankIndex,
    position: [...engineer.position],
    range: engineer.bombRange,
    remainingFrames: BOMB_FUSE_FRAMES,
  }
  input.bombs.push(bomb)
  engineer.bombCooldown = ENGINEER_BOMB_COOLDOWN
  input.events.push({
    type: 'tank',
    action: 'bomb_planted',
    by: input.tankIndex,
    tank: input.tank.profile.name,
    objectId: bomb.id,
    position: [...bomb.position],
  })
}

function turnTank(
  input: {
    tankIndex: number
    tank: InternalTank
    rng: () => number
    events: BattleEvent[]
  },
  action: Extract<Action, { type: 'turn' }>,
) {
  let side = action.side
  let stunReversed = false
  if (input.tank.stunRemaining > 0 && input.rng() < 0.5) {
    side = side === 'left' ? 'right' : 'left'
    stunReversed = true
  }
  input.tank.direction = turn(input.tank.direction, side)
  input.tank.stats.turns += 1
  input.events.push({
    type: 'tank',
    action: 'turn',
    by: input.tankIndex,
    tank: input.tank.profile.name,
    objectId: input.tank.objectId,
    direction: input.tank.direction,
    details: stunReversed ? { stunReversed: true } : undefined,
  })
}

function fire(input: {
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  bullets: InternalBullet[]
  map: Tile[][]
  rng: () => number
  events: BattleEvent[]
}) {
  if (shotWouldTriggerOwnBombHazard(input)) {
    input.events.push({
      type: 'bullet',
      action: 'fire_blocked',
      by: input.tankIndex,
      tank: input.tank.profile.name,
      reason: 'friendly_bomb',
    })
    return
  }
  if (!shotHasUsefulTarget(input)) {
    input.events.push({
      type: 'bullet',
      action: 'fire_blocked',
      by: input.tankIndex,
      tank: input.tank.profile.name,
      reason: 'no_line',
    })
    return
  }
  const active = input.bullets.some((bullet) => bullet.owner === input.tankIndex && bullet.alive)
  if (active || input.tank.fireLocked > 0) {
    input.events.push({
      type: 'bullet',
      action: 'fire_blocked',
      by: input.tankIndex,
      tank: input.tank.profile.name,
      reason: active ? 'bullet_in_flight' : 'fire_locked',
    })
    return
  }
  const spawn = add(input.tank.position, DIR_DELTA[input.tank.direction])
  if (!inBounds(input.map, spawn)) return
  const baseHeading = angleFromDirection(input.tank.direction)
  const bulletHeadings: number[] = [baseHeading]
  const wasOverloaded = input.tank.overloadRemaining > 0
  if (input.tank.shotgunLevel > 0) {
    bulletHeadings.push(baseHeading - 45, baseHeading + 45)
  }
  if (wasOverloaded) {
    bulletHeadings.push(baseHeading + (input.rng() < 0.5 ? -18 : 18))
    input.tank.overloadRemaining = 0
  }
  const uniqueHeadings = [
    ...new Set(bulletHeadings.map((heading) => Math.round(normalizeAngle(heading) * 10) / 10)),
  ]
  const bulletsToCreate = uniqueHeadings.map(
    (heading): InternalBullet => ({
      id: randomId(input.rng, 'bullet'),
      owner: input.tankIndex,
      position: [...input.tank.position],
      direction: directionFromAngle(heading),
      headingDegrees: heading,
      alive: true,
    }),
  )
  input.bullets.push(...bulletsToCreate)
  input.tank.stats.shotsFired += 1
  input.events.push({
    type: 'bullet',
    action: 'fire',
    by: input.tankIndex,
    tank: input.tank.profile.name,
    objectId: bulletsToCreate[0]!.id,
    direction: input.tank.direction,
    position: spawn,
    details:
      bulletsToCreate.length > 1
        ? { shotgun: input.tank.shotgunLevel > 0, overloaded: wasOverloaded }
        : undefined,
  })
}

function castSkill(
  input: {
    tankIndex: number
    tank: InternalTank
    opponent: InternalTank
    events: BattleEvent[]
  },
  skill: Exclude<SkillType, 'teleport'>,
) {
  if (input.tank.profile.skillType !== skill || input.tank.cooldown > 0) return
  input.tank.cooldown = SKILL_COOLDOWNS[skill]
  input.tank.stats.skillUsed += 1
  switch (skill) {
    case 'shield':
      input.tank.shieldRemaining = 4
      break
    case 'freeze':
      input.opponent.freezeRemaining = Math.max(input.opponent.freezeRemaining, 2)
      break
    case 'stun':
      input.opponent.stunRemaining = Math.max(input.opponent.stunRemaining, 6)
      break
    case 'overload':
      input.tank.overloadRemaining = 10
      break
    case 'cloak':
      input.tank.cloakRemaining = 6
      break
    case 'poison':
      input.opponent.poisonRemaining = Math.max(input.opponent.poisonRemaining, 4)
      break
    case 'boost':
      input.tank.boostRemaining = 6
      break
  }
  input.events.push({
    type: 'skill',
    action: 'cast',
    by: input.tankIndex,
    tank: input.tank.profile.name,
    skill,
  })
}

function teleport(
  input: {
    tankIndex: number
    tank: InternalTank
    opponent: InternalTank
    bullets: InternalBullet[]
    map: Tile[][]
    events: BattleEvent[]
  },
  x: number,
  y: number,
) {
  if (input.tank.profile.skillType !== 'teleport' || input.tank.cooldown > 0) return
  input.tank.cooldown = SKILL_COOLDOWNS.teleport
  input.tank.stats.skillUsed += 1
  const target: [number, number] = [x, y]
  const occupiedByBullet = input.bullets.some(
    (bullet) => bullet.alive && samePos(bullet.position, target),
  )
  const valid =
    canEnter(input.map, target, blockingTankPosition(input.opponent)) && !occupiedByBullet
  if (valid) {
    input.tank.position = target
    if (manhattan(target, input.opponent.position) <= 4) input.tank.fireLocked = 2
  }
  input.events.push({
    type: 'skill',
    action: valid ? 'teleport' : 'failed',
    by: input.tankIndex,
    tank: input.tank.profile.name,
    skill: 'teleport',
    position: target,
    reason: valid ? undefined : 'invalid_target',
  })
}

function moveBullets(input: {
  frame: number
  bullets: InternalBullet[]
  tanks: InternalTank[]
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  explosions: InternalExplosion[]
  map: Tile[][]
  events: BattleEvent[]
}) {
  const nextPositions = new Map<InternalBullet, [number, number]>()
  for (const bullet of input.bullets) {
    if (bullet.alive) nextPositions.set(bullet, nextBulletPosition(bullet))
  }
  for (let i = 0; i < input.bullets.length; i += 1) {
    const a = input.bullets[i]!
    if (!a.alive) continue
    for (let j = i + 1; j < input.bullets.length; j += 1) {
      const b = input.bullets[j]!
      if (!b.alive || a.owner === b.owner) continue
      const nextA = nextPositions.get(a)
      const nextB = nextPositions.get(b)
      if (
        nextA &&
        nextB &&
        (bulletPointsCollide(nextA, nextB) ||
          (bulletPointsCollide(nextA, b.position) && bulletPointsCollide(nextB, a.position)))
      ) {
        a.alive = false
        b.alive = false
        input.events.push({
          type: 'bullet',
          action: 'clash',
          by: a.owner,
          objectId: a.id,
          position: bulletPointsCollide(nextA, nextB) ? bulletCell(nextA) : bulletCell(a.position),
          details: { target: b.id },
        })
      }
    }
  }

  for (const bullet of input.bullets) {
    if (!bullet.alive) continue
    const from = [...bullet.position] as [number, number]
    const next = nextPositions.get(bullet) ?? nextBulletPosition(bullet)
    const nextCell = bulletCell(next)
    if (!inBounds(input.map, nextCell)) {
      bullet.alive = false
      input.events.push({
        type: 'bullet',
        action: 'shot_wall',
        by: bullet.owner,
        objectId: bullet.id,
        position: nextCell,
      })
      input.tanks[bullet.owner]!.stats.shotsWall += 1
      continue
    }
    const tile = input.map[nextCell[0]]![nextCell[1]]!
    if (tile === 'x' || tile === 'm') {
      bullet.alive = false
      input.tanks[bullet.owner]!.stats.shotsWall += 1
      if (tile === 'm') input.map[nextCell[0]]![nextCell[1]] = '.'
      input.events.push({
        type: 'bullet',
        action: tile === 'm' ? 'dirt_destroyed' : 'shot_wall',
        by: bullet.owner,
        objectId: bullet.id,
        position: nextCell,
      })
      continue
    }
    const bomb = input.bombs.find(
      (item) => samePos(item.position, nextCell) || sweptCircleHit(from, next, item.position, 0.55),
    )
    if (bomb) {
      bullet.alive = false
      detonateBombs({
        frame: input.frame,
        map: input.map,
        tanks: input.tanks,
        engineers: input.engineers,
        bombs: input.bombs,
        explosions: input.explosions,
        events: input.events,
        initial: [bomb],
      })
      input.events.push({
        type: 'bullet',
        action: 'bomb_triggered',
        by: bullet.owner,
        objectId: bullet.id,
        position: nextCell,
      })
      continue
    }
    const targetIndex = bullet.owner === 0 ? 1 : 0
    const target = input.tanks[targetIndex]!
    if (
      !target.crashed &&
      (samePos(target.position, nextCell) ||
        sweptCircleHit(from, next, target.position, TANK_HIT_RADIUS))
    ) {
      bullet.alive = false
      input.tanks[bullet.owner]!.stats.shotsHit += 1
      if (target.shieldRemaining > 0) {
        target.shieldRemaining = 0
        input.events.push({
          type: 'skill',
          action: 'shield_blocked',
          by: targetIndex,
          tank: target.profile.name,
          skill: 'shield',
          position: nextCell,
        })
      } else if (target.armor > 1) {
        target.armor -= 1
        input.events.push({
          type: 'bullet',
          action: 'armor_hit',
          by: bullet.owner,
          tank: input.tanks[bullet.owner]!.profile.name,
          objectId: bullet.id,
          position: nextCell,
          details: { target: target.profile.name, armor: target.armor },
        })
      } else {
        target.crashed = true
        target.death = {
          cause: 'bullet',
          by: bullet.owner,
          frame: input.frame,
          detail: bullet.id,
        }
        target.stats.crashes += 1
        input.events.push({
          type: 'bullet',
          action: 'hit',
          by: bullet.owner,
          tank: input.tanks[bullet.owner]!.profile.name,
          objectId: bullet.id,
          position: nextCell,
          details: { target: target.profile.name },
        })
      }
      continue
    }
    const engineer = input.engineers[targetIndex]
    if (
      engineer?.alive &&
      (samePos(engineer.position, nextCell) ||
        sweptCircleHit(from, next, engineer.position, ENGINEER_HIT_RADIUS))
    ) {
      killEngineer(engineer, {
        cause: 'bullet',
        by: bullet.owner,
        frame: input.frame,
        detail: bullet.id,
      })
      bullet.alive = false
      input.tanks[bullet.owner]!.stats.shotsHit += 1
      input.events.push({
        type: 'bullet',
        action: 'engineer_hit',
        by: bullet.owner,
        tank: input.tanks[bullet.owner]!.profile.name,
        objectId: bullet.id,
        position: nextCell,
        details: { target: engineer.name },
      })
      continue
    }
    bullet.position = next
    input.events.push({
      type: 'bullet',
      action: 'go',
      by: bullet.owner,
      objectId: bullet.id,
      position: [...bullet.position],
      direction: bullet.direction,
      details:
        bullet.headingDegrees === undefined ? undefined : { headingDegrees: bullet.headingDegrees },
    })
  }
}

function tickBombsAndExplosions(input: {
  frame: number
  map: Tile[][]
  tanks: InternalTank[]
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  explosions: InternalExplosion[]
  events: BattleEvent[]
}) {
  for (const explosion of input.explosions) explosion.remainingFrames -= 1
  removeWhere(input.explosions, (explosion) => explosion.remainingFrames <= 0)

  const due: InternalBomb[] = []
  for (const bomb of input.bombs) {
    bomb.remainingFrames -= 1
    if (bomb.remainingFrames <= 0) due.push(bomb)
  }
  if (due.length) detonateBombs({ ...input, initial: due })
}

function detonateBombs(input: {
  frame: number
  map: Tile[][]
  tanks: InternalTank[]
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  explosions: InternalExplosion[]
  events: BattleEvent[]
  initial: InternalBomb[]
}) {
  const queue = [...input.initial]
  const detonated = new Set<string>()
  while (queue.length) {
    const bomb = queue.shift()!
    if (detonated.has(bomb.id)) continue
    const bombIndex = input.bombs.findIndex((item) => item.id === bomb.id)
    if (bombIndex === -1) continue
    input.bombs.splice(bombIndex, 1)
    detonated.add(bomb.id)

    const positions = explosionPositions(input.map, bomb.position, bomb.range)
    input.explosions.push({
      id: `explosion_${input.frame}_${bomb.id}`,
      owner: bomb.owner,
      positions,
      remainingFrames: EXPLOSION_TTL,
    })
    input.events.push({
      type: 'tank',
      action: 'bomb_detonated',
      by: bomb.owner,
      objectId: bomb.id,
      position: [...bomb.position],
    })

    for (const chained of input.bombs) {
      if (positions.some((position) => samePos(position, chained.position))) queue.push(chained)
    }

    for (const tank of input.tanks) {
      if (
        tank.crashed ||
        !positions.some((position) => positionInExplosionTile(tank.position, position))
      )
        continue
      if (tank.shieldRemaining > 0) {
        tank.shieldRemaining = 0
        input.events.push({
          type: 'skill',
          action: 'shield_blocked',
          by: input.tanks.indexOf(tank),
          tank: tank.profile.name,
          skill: 'shield',
          position: [...tank.position],
        })
      } else if (tank.armor > 1) {
        tank.armor -= 1
        input.events.push({
          type: 'tank',
          action: 'armor_bomb_hit',
          by: bomb.owner,
          tank: tank.profile.name,
          objectId: bomb.id,
          position: [...tank.position],
          details: { armor: tank.armor },
        })
      } else {
        tank.crashed = true
        tank.death = {
          cause: 'bomb',
          by: bomb.owner,
          frame: input.frame,
          detail: bomb.id,
        }
        tank.stats.crashes += 1
        input.events.push({
          type: 'tank',
          action: 'bomb_hit',
          by: bomb.owner,
          tank: tank.profile.name,
          objectId: bomb.id,
          position: [...tank.position],
        })
      }
    }
    for (const engineer of input.engineers) {
      if (
        !engineer.alive ||
        !positions.some((position) => positionInExplosionTile(engineer.position, position))
      )
        continue
      killEngineer(engineer, {
        cause: 'bomb',
        by: bomb.owner,
        frame: input.frame,
        detail: bomb.id,
      })
      input.events.push({
        type: 'tank',
        action: 'engineer_bomb_hit',
        by: bomb.owner,
        tank: engineer.name,
        objectId: bomb.id,
        position: [...engineer.position],
      })
    }
  }
}

function explosionPositions(map: Tile[][], origin: [number, number], range: number) {
  const positions: Array<[number, number]> = [[...origin]]
  for (const direction of DIRECTIONS) {
    const delta = DIR_DELTA[direction]
    for (let step = 1; step <= range; step += 1) {
      const cell: [number, number] = [origin[0] + delta[0] * step, origin[1] + delta[1] * step]
      const tile = tileAt(map, cell)
      if (!tile || tile === 'x') break
      positions.push(cell)
      if (tile === 'o') map[cell[0]]![cell[1]] = '.'
      if (tile === 'm') {
        map[cell[0]]![cell[1]] = '.'
        break
      }
    }
  }
  return positions
}

function collectStar(
  star: [number, number] | null,
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  events: BattleEvent[],
) {
  if (!star) return null
  for (let index = 0; index < tanks.length; index += 1) {
    const tank = tanks[index]!
    if (!tank.crashed && samePos(tank.position, star)) {
      tank.stars += 1
      if (tank.stars === 1) tank.shotgunLevel = 1
      else tank.armor += 1
      tank.powerGlowRemaining = STAR_POWER_GLOW_FRAMES
      events.push({
        type: 'star',
        action: 'collected',
        by: index,
        tank: tank.profile.name,
        position: star,
      })
      return null
    }
  }
  for (const engineer of engineers) {
    if (engineer.alive && samePos(engineer.position, star)) {
      engineer.starUpgrades += 1
      if (engineer.starUpgrades % 2 === 1) {
        engineer.maxBombs = Math.min(MAX_ENGINEER_BOMBS, engineer.maxBombs + 1)
      } else {
        engineer.bombRange = Math.min(MAX_BOMB_RANGE, engineer.bombRange + 1)
      }
      engineer.powerGlowRemaining = STAR_POWER_GLOW_FRAMES
      events.push({
        type: 'star',
        action: 'engineer_collected',
        by: engineer.owner,
        tank: engineer.name,
        position: star,
      })
      return null
    }
  }
  return star
}

function collectFlag(
  flag: [number, number] | null,
  flagScores: [number, number],
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  events: BattleEvent[],
) {
  if (!flag) return null
  for (let index = 0; index < tanks.length; index += 1) {
    const tank = tanks[index]!
    if (!tank.crashed && samePos(tank.position, flag)) {
      flagScores[index as 0 | 1] += 1
      events.push({
        type: 'flag',
        action: 'captured',
        by: index,
        tank: tank.profile.name,
        position: flag,
      })
      return null
    }
  }
  for (const engineer of engineers) {
    if (engineer.alive && samePos(engineer.position, flag)) {
      flagScores[engineer.owner as 0 | 1] += 1
      events.push({
        type: 'flag',
        action: 'engineer_captured',
        by: engineer.owner,
        tank: engineer.name,
        position: flag,
      })
      return null
    }
  }
  return flag
}

function resolveImmediateResult(
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  flagScores: [number, number],
  events: BattleEvent[],
): BattleReplay['meta']['result'] | null {
  if (flagScores[0] >= FLAG_TARGET || flagScores[1] >= FLAG_TARGET) {
    const winner = flagScores[0] >= FLAG_TARGET ? 0 : 1
    events.push({ type: 'game', action: 'end', winner, reason: 'flags' })
    return { type: 'game', action: 'end', reason: 'flags', winner }
  }
  const defeated = [0, 1].map((index) => sideDefeated(tanks, engineers, index))
  if (defeated[0] && defeated[1]) {
    events.push({ type: 'game', action: 'end', winner: null, reason: 'draw' })
    return { type: 'game', action: 'end', reason: 'draw', winner: null }
  }
  if (defeated[0] || defeated[1]) {
    const winner = defeated[0] ? 1 : 0
    const reason = events.some((event) => event.type === 'bullet' && event.action.includes('hit'))
      ? 'hit'
      : 'crashed'
    events.push({ type: 'game', action: 'end', winner, reason })
    return { type: 'game', action: 'end', reason, winner }
  }
  return null
}

function sideDefeated(tanks: InternalTank[], engineers: InternalEngineer[], index: number) {
  return Boolean(tanks[index]?.crashed && !engineers[index]?.alive)
}

function resolveEndResult(flagScores: [number, number]): BattleReplay['meta']['result'] {
  if (flagScores[0] !== flagScores[1]) {
    return {
      type: 'game',
      action: 'end',
      reason: 'flags',
      winner: flagScores[0] > flagScores[1] ? 0 : 1,
    }
  }
  return { type: 'game', action: 'end', reason: 'draw', winner: null }
}

function recordFrame(
  frame: number,
  frames: BattleFrame[],
  events: BattleEvent[],
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  bullets: InternalBullet[],
  bombs: InternalBomb[],
  explosions: InternalExplosion[],
  map: Tile[][],
  star: [number, number] | null,
  flag: [number, number] | null,
  flagScores: [number, number],
  bulletClashes: number,
  speeches: InternalSpeech[],
) {
  frames.push({
    frame,
    events: events.map((event) => ({ ...event })),
    state: buildFrameState(
      tanks,
      engineers,
      bullets,
      bombs,
      explosions,
      map,
      star,
      flag,
      flagScores,
      bulletClashes,
      speeches,
    ),
  })
}

function buildFrameState(
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  bullets: InternalBullet[],
  bombs: InternalBomb[],
  explosions: InternalExplosion[],
  map: Tile[][],
  star: [number, number] | null,
  flag: [number, number] | null,
  flagScores: [number, number],
  bulletClashes: number,
  speeches: InternalSpeech[] = [],
): BattleFrameState {
  return {
    tanks: tanks.map((tank) => ({
      id: tank.profile.id,
      name: tank.profile.name,
      position: [...tank.position],
      direction: tank.direction,
      headingDegrees: angleFromDirection(tank.direction),
      crashed: tank.crashed,
      stars: tank.stars,
      shotgunLevel: tank.shotgunLevel,
      armor: tank.armor,
      skillType: tank.profile.skillType,
      status: publicStatus(tank, true, map),
      death: tank.death,
    })),
    engineers: engineers.map((engineer) => publicEngineer(engineer, map)),
    bullets: bullets.filter((bullet) => bullet.alive).map(publicBullet),
    bombs: bombs.map(publicBomb),
    explosions: explosions.map(publicExplosion),
    star: star ? [...star] : null,
    flag: flag ? [...flag] : null,
    flagScores: [...flagScores] as [number, number],
    bulletClashes,
    speeches: publicSpeeches(speeches, tanks, engineers),
    scoreboard: buildScoreboard(tanks, engineers, flagScores),
    map: cloneMap(map),
  }
}

function publicTank(tank: InternalTank) {
  return {
    id: tank.profile.id,
    position: [...tank.position],
    direction: tank.direction,
    crashed: tank.crashed,
    stars: tank.stars,
    shotgunLevel: tank.shotgunLevel,
    armor: tank.armor,
  }
}

function publicSpeeches(
  speeches: InternalSpeech[],
  tanks: InternalTank[],
  engineers: InternalEngineer[],
): BattleSpeechState[] {
  return speeches.map((speech) => {
    const unit = speech.unitKind === 'tank' ? tanks[speech.owner] : engineers[speech.owner]
    return {
      ...speech,
      position: unit ? ([...unit.position] as [number, number]) : ([0, 0] as [number, number]),
    }
  })
}

function buildScoreboard(
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  flagScores: [number, number],
): BattleFrameState['scoreboard'] {
  return {
    sides: [0, 1].map((owner) => {
      const tank = tanks[owner]!
      const engineer = engineers[owner]!
      const enemyTank = tanks[1 - owner]!
      const enemyEngineer = engineers[1 - owner]!
      const kills = [enemyTank.death, enemyEngineer.death].filter(
        (death) => death?.by === owner,
      ).length
      const losses = [tank.death, engineer.death].filter(Boolean).length
      return {
        owner,
        flags: flagScores[owner as 0 | 1],
        tankAlive: !tank.crashed,
        engineerAlive: engineer.alive,
        kills,
        losses,
      }
    }),
  }
}

function publicBullet(bullet: InternalBullet): BattleBulletState {
  return {
    id: bullet.id,
    owner: bullet.owner,
    position:
      bullet.headingDegrees === undefined
        ? [...bullet.position]
        : ([bullet.position[0] + 0.5, bullet.position[1] + 0.5] as [number, number]),
    direction: bullet.direction,
    headingDegrees: bullet.headingDegrees,
    alive: bullet.alive,
  }
}

function publicEngineer(engineer: InternalEngineer, map: Tile[][]): RuntimeEngineerState {
  return {
    id: engineer.id,
    owner: engineer.owner,
    name: engineer.name,
    position: [...engineer.position],
    direction: engineer.direction,
    headingDegrees: engineer.heading,
    alive: engineer.alive,
    bombRange: engineer.bombRange,
    maxBombs: engineer.maxBombs,
    status: {
      cloaked: engineer.alive && tileAt(map, engineer.position) === 'o',
      fireLocked: engineer.bombCooldown > 0,
      swimming: engineer.alive && tileAt(map, engineer.position) === 'w',
      powered: engineer.powerGlowRemaining > 0,
    },
    death: engineer.death,
  }
}

function publicBomb(bomb: InternalBomb): BattleBombState {
  return {
    id: bomb.id,
    owner: bomb.owner,
    position: [...bomb.position],
    range: bomb.range,
    remainingFrames: bomb.remainingFrames,
  }
}

function publicExplosion(explosion: InternalExplosion): BattleExplosionState {
  return {
    id: explosion.id,
    owner: explosion.owner,
    positions: explosion.positions.map((position) => [...position] as [number, number]),
    remainingFrames: explosion.remainingFrames,
  }
}

function visibleOwnBullet(owner: number, bullets: InternalBullet[]) {
  const bullet = bullets.find((item) => item.owner === owner && item.alive)
  return bullet ? publicBullet(bullet) : null
}

function buildEnemySnapshot(
  meIndex: number,
  me: InternalTank,
  enemy: InternalTank,
  engineers: InternalEngineer[],
  bullets: InternalBullet[],
  map: Tile[][],
) {
  const enemyHidden = enemy.crashed || isTankHiddenFromServer(map, enemy, me)
  const enemyEngineer = engineers[1 - meIndex]
  const engineerHidden = enemyEngineer ? isEngineerHiddenFromServer(map, enemyEngineer, me) : true
  const enemyBullet = bullets.find((bullet) => bullet.owner !== meIndex && bullet.alive)
  return {
    tank: enemyHidden ? null : publicTank(enemy),
    engineer: !enemyEngineer || engineerHidden ? null : publicEngineer(enemyEngineer, map),
    bullet:
      enemyBullet && hasLineOfSight(map, me.position, enemyBullet.position)
        ? publicBullet(enemyBullet)
        : null,
    skill: enemyHidden ? null : publicSkill(enemy),
    effects: enemyHidden ? { self: null, debuff: null } : publicEffects(enemy),
    status: enemyHidden ? hiddenStatus() : publicStatus(enemy, true, map),
  }
}

function publicSkill(tank: InternalTank) {
  return {
    type: tank.profile.skillType,
    cooldownFrames: SKILL_COOLDOWNS[tank.profile.skillType],
    remainingCooldownFrames: tank.cooldown,
    activeRemainingFrames: Math.max(
      tank.shieldRemaining,
      tank.freezeRemaining,
      tank.stunRemaining,
      tank.overloadRemaining,
      tank.cloakRemaining,
      tank.poisonRemaining,
      tank.boostRemaining,
    ),
    activeType:
      (tank.shieldRemaining > 0 && 'shield') ||
      (tank.freezeRemaining > 0 && 'freeze') ||
      (tank.stunRemaining > 0 && 'stun') ||
      (tank.overloadRemaining > 0 && 'overload') ||
      (tank.cloakRemaining > 0 && 'cloak') ||
      (tank.poisonRemaining > 0 && 'poison') ||
      (tank.boostRemaining > 0 && 'boost') ||
      null,
  }
}

function publicEffects(tank: InternalTank) {
  return {
    self:
      (tank.shieldRemaining > 0 && { type: 'shield', remainingFrames: tank.shieldRemaining }) ||
      (tank.cloakRemaining > 0 && { type: 'cloak', remainingFrames: tank.cloakRemaining }) ||
      (tank.overloadRemaining > 0 && {
        type: 'overload',
        remainingFrames: tank.overloadRemaining,
      }) ||
      (tank.boostRemaining > 0 && { type: 'boost', remainingFrames: tank.boostRemaining }) ||
      null,
    debuff:
      (tank.freezeRemaining > 0 && { type: 'freeze', remainingFrames: tank.freezeRemaining }) ||
      (tank.stunRemaining > 0 && { type: 'stun', remainingFrames: tank.stunRemaining }) ||
      (tank.poisonRemaining > 0 && { type: 'poison', remainingFrames: tank.poisonRemaining }) ||
      null,
  }
}

function hiddenStatus() {
  return {
    shielded: false,
    cloaked: false,
    boosted: false,
    overloaded: false,
    frozen: false,
    stunned: false,
    poisoned: false,
    fireLocked: false,
    actionSpeed: 0,
    canActThisFrame: false,
    powered: false,
  }
}

function publicStatus(tank: InternalTank, canActThisFrame: boolean, map?: Tile[][]) {
  return {
    shielded: tank.shieldRemaining > 0,
    cloaked: tank.cloakRemaining > 0 || (map ? tileAt(map, tank.position) === 'o' : false),
    boosted: tank.boostRemaining > 0,
    overloaded: tank.overloadRemaining > 0,
    frozen: tank.freezeRemaining > 0,
    stunned: tank.stunRemaining > 0,
    poisoned: tank.poisonRemaining > 0,
    fireLocked: tank.fireLocked > 0,
    actionSpeed: canActThisFrame ? 1 : 0,
    canActThisFrame,
    powered: tank.powerGlowRemaining > 0,
  }
}

function canTankActThisFrame(tank: InternalTank, frame: number) {
  if (tank.freezeRemaining > 0) return false
  if (tank.poisonRemaining > 0 && frame % 2 === 0) return false
  return true
}

function tickDown(tanks: InternalTank[], engineers: InternalEngineer[]) {
  for (const tank of tanks) {
    tank.cooldown = Math.max(0, tank.cooldown - 1)
    tank.shieldRemaining = Math.max(0, tank.shieldRemaining - 1)
    tank.freezeRemaining = Math.max(0, tank.freezeRemaining - 1)
    tank.stunRemaining = Math.max(0, tank.stunRemaining - 1)
    tank.overloadRemaining = Math.max(0, tank.overloadRemaining - 1)
    tank.cloakRemaining = Math.max(0, tank.cloakRemaining - 1)
    tank.poisonRemaining = Math.max(0, tank.poisonRemaining - 1)
    tank.boostRemaining = Math.max(0, tank.boostRemaining - 1)
    tank.fireLocked = Math.max(0, tank.fireLocked - 1)
    tank.powerGlowRemaining = Math.max(0, tank.powerGlowRemaining - 1)
  }
  for (const engineer of engineers) {
    engineer.bombCooldown = Math.max(0, engineer.bombCooldown - 1)
    engineer.powerGlowRemaining = Math.max(0, engineer.powerGlowRemaining - 1)
  }
}

function tickSpeeches(speeches: InternalSpeech[]) {
  for (let index = speeches.length - 1; index >= 0; index -= 1) {
    speeches[index]!.remainingFrames -= 1
    if (speeches[index]!.remainingFrames <= 0) speeches.splice(index, 1)
  }
}

function killEngineer(engineer: InternalEngineer, death: UnitDeathState) {
  if (!engineer.alive) return
  engineer.alive = false
  engineer.death = death
}

function summarize(
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  framesTotal: number,
  result: BattleReplay['meta']['result'],
): BattleSummary {
  return {
    framesTotal,
    result: {
      winner: result.winner === null ? null : tanks[result.winner]!.profile.name,
      reason: result.reason,
    },
    tanks: Object.fromEntries(
      tanks.map((tank, index) => [
        tank.profile.name,
        {
          shotsFired: tank.stats.shotsFired,
          shotsHit: tank.stats.shotsHit,
          shotsWall: tank.stats.shotsWall,
          moves: tank.stats.moves,
          turns: tank.stats.turns,
          stars: tank.stars,
          skillUsed: tank.stats.skillUsed,
          crashes: tank.stats.crashes,
          deaths: {
            tank: tank.death,
            engineer: engineers[index]?.death ?? null,
          },
          runtimeMs: Math.round(tank.runTime),
          diagnosis: diagnosis(tank, result),
        },
      ]),
    ),
  }
}

function calculateExcitement(
  tanks: InternalTank[],
  events: Array<BattleEvent & { frame: number }>,
  framesTotal: number,
  result: BattleReplay['meta']['result'],
) {
  const shots = tanks.reduce((sum, tank) => sum + tank.stats.shotsFired, 0)
  const skills = tanks.reduce((sum, tank) => sum + tank.stats.skillUsed, 0)
  const stars = tanks.reduce((sum, tank) => sum + tank.stars, 0)
  const close = Math.abs(tanks[0]!.stars - tanks[1]!.stars) <= 1 ? 10 : 0
  const finish = result.reason === 'hit' ? 24 : result.reason === 'crashed' ? 12 : 6
  const late = Math.min(20, Math.round(framesTotal / 8))
  const tactical =
    events.filter((event) => event.action === 'dirt_destroyed' || event.action === 'shield_blocked')
      .length * 5
  return clampInt(shots * 5 + skills * 4 + stars * 6 + close + finish + late + tactical, 1, 99)
}

function diagnosis(tank: InternalTank, result: BattleReplay['meta']['result']) {
  if (tank.stats.runtimeErrors > 0)
    return 'script crashed; inspect runtime events before tuning tactics'
  if (tank.stats.crashes > 0)
    return 'movement drove into a blocker or got destroyed; add wall and bullet checks'
  if (tank.stats.shotsFired > 0 && tank.stats.shotsHit === 0)
    return 'shots missed or hit cover; improve line-of-sight and timing'
  if (tank.stars === 0 && result.reason === 'stars') return 'star routing lost objective pressure'
  return 'no obvious single failure pattern; inspect key events for timing and positioning'
}

function spawnStar(
  map: Tile[][],
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  bullets: InternalBullet[],
  bombs: InternalBomb[],
  rng: () => number,
  avoid: [number, number] | null = null,
): [number, number] | null {
  const candidates: Array<[number, number]> = []
  for (let x = 0; x < map.length; x += 1) {
    for (let y = 0; y < (map[x]?.length ?? 0); y += 1) {
      const pos: [number, number] = [x, y]
      const tile = tileAt(map, pos)
      if (tile === 'x' || tile === 'm' || tile === 'w') continue
      if (tanks.some((tank) => samePos(tank.position, pos))) continue
      if (engineers.some((engineer) => engineer.alive && samePos(engineer.position, pos))) continue
      if (bullets.some((bullet) => bullet.alive && samePos(bulletCell(bullet.position), pos)))
        continue
      if (bombs.some((bomb) => samePos(bomb.position, pos))) continue
      if (avoid && manhattan(avoid, pos) < MIN_PICKUP_SEPARATION) continue
      if (
        tanks.some((tank) => manhattan(tank.position, pos) < MIN_PICKUP_UNIT_DISTANCE) ||
        engineers.some(
          (engineer) =>
            engineer.alive && manhattan(engineer.position, pos) < MIN_PICKUP_UNIT_DISTANCE,
        )
      )
        continue
      candidates.push(pos)
    }
  }
  if (!candidates.length) return null
  return candidates[Math.floor(rng() * candidates.length)]!
}

function spawnFlag(
  map: Tile[][],
  tanks: InternalTank[],
  engineers: InternalEngineer[],
  bullets: InternalBullet[],
  bombs: InternalBomb[],
  rng: () => number,
  avoid: [number, number] | null = null,
) {
  return spawnStar(map, tanks, engineers, bullets, bombs, rng, avoid)
}

function queueAction(tank: InternalTank, action: Action) {
  if (tank.queue.length >= MAX_ACTION_QUEUE) return
  tank.queue.push(action)
}

function speak(input: {
  unit: { speechCount: number }
  tankIndex: number
  unitKind: 'tank' | 'engineer'
  unitName: string
  events: BattleEvent[]
  speeches: InternalSpeech[]
  text: string
}) {
  if (input.unit.speechCount >= MAX_SPEECH_PER_TANK) return
  const body = input.text.trim().slice(0, 40)
  if (!body) return
  input.unit.speechCount += 1
  const existing = input.speeches.find(
    (speech) => speech.owner === input.tankIndex && speech.unitKind === input.unitKind,
  )
  if (existing) {
    existing.unitName = input.unitName
    existing.text = body
    existing.remainingFrames = SPEECH_TTL
  } else {
    input.speeches.push({
      id: `speech_${input.tankIndex}_${input.unitKind}_${input.events.length}_${input.speeches.length}`,
      owner: input.tankIndex,
      unitKind: input.unitKind,
      unitName: input.unitName,
      text: body,
      remainingFrames: SPEECH_TTL,
    })
  }
  input.events.push({
    type: 'speech',
    action: 'say',
    by: input.tankIndex,
    tank: input.unitName,
    text: body,
    details: { unitKind: input.unitKind },
  })
}

function print(tank: InternalTank, events: BattleEvent[], args: unknown[]) {
  const text = args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
    .slice(0, 160)
  if (!text) return
  events.push({
    type: 'runtime',
    action: 'print',
    tank: tank.profile.name,
    objectId: tank.objectId,
    text,
  })
}

function crashTank(index: number, tank: InternalTank, events: BattleEvent[], reason: string) {
  tank.crashed = true
  tank.stats.crashes += 1
  events.push({
    type: 'tank',
    action: 'crashed',
    by: index,
    tank: tank.profile.name,
    objectId: tank.objectId,
    position: [...tank.position],
    reason,
  })
}

function chooseMap(mapId: string | undefined, rng: () => number) {
  if (!mapId || mapId === 'random') return BATTLE_MAPS[Math.floor(rng() * BATTLE_MAPS.length)]!
  return BATTLE_MAPS.find((map) => map.id === mapId) ?? BATTLE_MAPS[0]!
}

function hasLineOfSight(map: Tile[][], from: [number, number], to: [number, number]) {
  if (from[0] !== to[0] && from[1] !== to[1]) return false
  const dx = Math.sign(to[0] - from[0])
  const dy = Math.sign(to[1] - from[1])
  let current = add(from, [dx, dy])
  while (!samePos(current, to)) {
    const tile = tileAt(map, current)
    if (tile === 'x' || tile === 'm') return false
    current = add(current, [dx, dy])
  }
  return true
}

function clearGridShotDirection(
  map: Tile[][],
  from: [number, number],
  to: [number, number],
): Direction | null {
  if (!hasLineOfSight(map, from, to)) return null
  if (to[0] > from[0]) return 'right'
  if (to[0] < from[0]) return 'left'
  if (to[1] > from[1]) return 'down'
  if (to[1] < from[1]) return 'up'
  return null
}

function defensiveTankDirection(input: {
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  bombs: InternalBomb[]
  bullets: InternalBullet[]
  map: Tile[][]
}): Direction | null {
  const avoidDanger = tankDangerAvoider(input.map, input.bombs)
  const blockedTank = blockingTankPosition(input.opponent)
  const incoming = incomingBulletThreat(input)
  if (incoming) {
    return bestPerpendicularDirection(input.map, input.tank, blockedTank, incoming, avoidDanger)
  }
  if (avoidDanger(input.tank.position)) {
    return bestRoamDirection(
      input.map,
      input.tank.position,
      blockedTank,
      input.tank.direction,
      avoidDanger,
    )
  }
  return null
}

function incomingBulletThreat(input: {
  tankIndex: number
  tank: InternalTank
  bullets: InternalBullet[]
  map: Tile[][]
}): Direction | null {
  for (const bullet of input.bullets) {
    if (!bullet.alive || bullet.owner === input.tankIndex) continue
    if (!hasLineOfSight(input.map, bullet.position, input.tank.position)) continue
    if (bullet.direction === 'right' && bullet.position[0] < input.tank.position[0])
      return bullet.direction
    if (bullet.direction === 'left' && bullet.position[0] > input.tank.position[0])
      return bullet.direction
    if (bullet.direction === 'down' && bullet.position[1] < input.tank.position[1])
      return bullet.direction
    if (bullet.direction === 'up' && bullet.position[1] > input.tank.position[1])
      return bullet.direction
  }
  return null
}

function bestPerpendicularDirection(
  map: Tile[][],
  tank: InternalTank,
  blocked: [number, number],
  laneDirection: Direction,
  avoid?: (position: [number, number]) => boolean,
): Direction | null {
  const candidates: Direction[] =
    laneDirection === 'left' || laneDirection === 'right' ? ['up', 'down'] : ['left', 'right']
  return (
    candidates
      .map((direction) => {
        const next = add(tank.position, DIR_DELTA[direction])
        return {
          direction,
          score:
            canEnter(map, next, blocked) && !avoid?.(next)
              ? openNeighborCount(map, next) + manhattan(next, blocked) * 0.1
              : -1,
        }
      })
      .filter((candidate) => candidate.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.direction ?? null
  )
}

function tankDangerAvoider(map: Tile[][], bombs: InternalBomb[]) {
  const dangerKeys = new Set<string>()
  for (const bomb of bombs) {
    for (const position of explosionPositions(cloneMap(map), bomb.position, bomb.range)) {
      dangerKeys.add(positionKey(position))
    }
  }
  return (position: [number, number]) => dangerKeys.has(positionKey(position))
}

function shotWouldTriggerOwnBombHazard(input: {
  tankIndex: number
  tank: InternalTank
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  map: Tile[][]
}) {
  const bomb = firstBombInShotLine(
    input.map,
    input.tank.position,
    input.tank.direction,
    input.bombs,
  )
  if (!bomb || bomb.owner !== input.tankIndex) return false
  const blast = explosionPositions(cloneMap(input.map), bomb.position, bomb.range)
  const engineer = input.engineers[input.tankIndex]
  return (
    blast.some((position) => samePos(position, input.tank.position)) ||
    Boolean(engineer?.alive && blast.some((position) => samePos(position, engineer.position)))
  )
}

function firstBombInShotLine(
  map: Tile[][],
  from: [number, number],
  direction: Direction,
  bombs: InternalBomb[],
) {
  let position = add(from, DIR_DELTA[direction])
  while (inBounds(map, position)) {
    const bomb = bombs.find((item) => samePos(item.position, position))
    if (bomb) return bomb
    const tile = tileAt(map, position)
    if (tile === 'x' || tile === 'm') return null
    position = add(position, DIR_DELTA[direction])
  }
  return null
}

function shotHasUsefulTarget(input: {
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  engineers: InternalEngineer[]
  bombs: InternalBomb[]
  map: Tile[][]
}) {
  const enemyEngineer = input.engineers[1 - input.tankIndex]
  let position = add(input.tank.position, DIR_DELTA[input.tank.direction])
  while (inBounds(input.map, position)) {
    if (!input.opponent.crashed && samePos(position, input.opponent.position)) return true
    if (enemyEngineer?.alive && samePos(position, enemyEngineer.position)) return true
    const bomb = input.bombs.find((item) => samePos(item.position, position))
    if (bomb) return !shotWouldTriggerOwnBombHazard(input)
    const tile = tileAt(input.map, position)
    if (tile === 'm') return true
    if (tile === 'x') return false
    position = add(position, DIR_DELTA[input.tank.direction])
  }
  return false
}

function nearestAttackPosition(
  map: Tile[][],
  from: [number, number],
  opponent: [number, number],
  avoid?: (position: [number, number]) => boolean,
): [number, number] | null {
  const candidates: Array<{ position: [number, number]; score: number }> = []
  for (let x = 0; x < map.length; x += 1) {
    for (let y = 0; y < (map[x]?.length ?? 0); y += 1) {
      const position: [number, number] = [x, y]
      if (!isOpenTile(map, position) || samePos(position, opponent) || avoid?.(position)) continue
      if (!hasLineOfSight(map, position, opponent)) continue
      const range = manhattan(position, opponent)
      if (range < 2) continue
      candidates.push({
        position,
        score: manhattan(from, position) + Math.abs(range - 5) * 0.35,
      })
    }
  }
  return candidates.sort((a, b) => a.score - b.score)[0]?.position ?? null
}

function firstReachableDirection(
  map: Tile[][],
  start: [number, number],
  targets: Array<[number, number]>,
  blocked: [number, number],
  options: { avoid?: (position: [number, number]) => boolean } = {},
) {
  for (const target of targets) {
    const direction = nextPathDirection(map, start, target, blocked, options)
    if (direction) return direction
  }
  if (options.avoid) {
    for (const target of targets) {
      const direction = nextPathDirection(map, start, target, blocked)
      if (direction) return direction
    }
  }
  return null
}

function nextPathDirection(
  map: Tile[][],
  start: [number, number],
  target: [number, number],
  blocked: [number, number],
  options: { avoid?: (position: [number, number]) => boolean } = {},
): Direction | null {
  const targetPositions = pathTargetPositions(map, target, blocked, options)
  if (!targetPositions.length) return null
  const targetKeys = new Set(targetPositions.map(positionKey))
  const visited = new Set([positionKey(start)])
  const queue: Array<{ position: [number, number]; first: Direction | null }> = [
    { position: start, first: null },
  ]

  while (queue.length) {
    const current = queue.shift()!
    for (const direction of orderedDirections(current.position, target)) {
      const next = add(current.position, DIR_DELTA[direction])
      const key = positionKey(next)
      if (
        visited.has(key) ||
        samePos(next, blocked) ||
        options.avoid?.(next) ||
        !isOpenTile(map, next)
      )
        continue
      const first = current.first ?? direction
      if (targetKeys.has(key)) return first
      visited.add(key)
      queue.push({ position: next, first })
    }
  }

  return null
}

function pathTargetPositions(
  map: Tile[][],
  target: [number, number],
  blocked: [number, number],
  options: { avoid?: (position: [number, number]) => boolean } = {},
): [number, number][] {
  if (isOpenTile(map, target) && !samePos(target, blocked) && !options.avoid?.(target))
    return [target]
  return DIRECTIONS.map((direction) => add(target, DIR_DELTA[direction]))
    .filter(
      (position) =>
        isOpenTile(map, position) && !samePos(position, blocked) && !options.avoid?.(position),
    )
    .sort((a, b) => manhattan(a, target) - manhattan(b, target))
}

function nextEngineerPathDirection(
  map: Tile[][],
  bombs: InternalBomb[],
  start: [number, number],
  target: [number, number],
  blocked: [number, number],
  options: { avoid?: (position: [number, number]) => boolean } = {},
): Direction | null {
  if (!isEngineerOpenTile(map, target, bombs, start)) return null
  const targetKey = positionKey(target)
  const visited = new Set([positionKey(start)])
  const queue: Array<{ position: [number, number]; first: Direction | null }> = [
    { position: start, first: null },
  ]

  while (queue.length) {
    const current = queue.shift()!
    for (const direction of orderedDirections(current.position, target)) {
      const next = add(current.position, DIR_DELTA[direction])
      const key = positionKey(next)
      if (
        visited.has(key) ||
        samePos(next, blocked) ||
        options.avoid?.(next) ||
        !isEngineerOpenTile(map, next, bombs, start)
      )
        continue
      const first = current.first ?? direction
      if (key === targetKey) return first
      visited.add(key)
      queue.push({ position: next, first })
    }
  }

  return null
}

function bestRoamDirection(
  map: Tile[][],
  position: [number, number],
  blocked: [number, number],
  currentDirection: Direction,
  avoid?: (position: [number, number]) => boolean,
  rng?: () => number,
  stalledFrames = 0,
): Direction | null {
  const reverse = oppositeDirection(currentDirection)
  return (
    DIRECTIONS.map((direction) => {
      const next = add(position, DIR_DELTA[direction])
      const repeatedPenalty =
        stalledFrames >= 3 && direction === currentDirection
          ? Math.min(1.8, stalledFrames * 0.18)
          : 0
      return {
        direction,
        score:
          canEnter(map, next, blocked) && !avoid?.(next)
            ? openNeighborCount(map, next) +
              (direction === currentDirection ? 1.4 : 0) -
              repeatedPenalty -
              (direction === reverse ? (stalledFrames >= 3 ? 0.2 : 0.9) : 0) +
              (rng ? rng() * (stalledFrames >= 3 ? 1.2 : 0.25) : 0)
            : -1,
      }
    })
      .filter((candidate) => candidate.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.direction ?? null
  )
}

function orderedDirections(from: [number, number], target: [number, number]) {
  return [...DIRECTIONS].sort((a, b) => {
    const nextA = add(from, DIR_DELTA[a])
    const nextB = add(from, DIR_DELTA[b])
    return manhattan(nextA, target) - manhattan(nextB, target)
  })
}

function openNeighborCount(map: Tile[][], position: [number, number]) {
  return DIRECTIONS.filter((direction) => isOpenTile(map, add(position, DIR_DELTA[direction])))
    .length
}

function blockingTankPosition(tank: InternalTank): [number, number] {
  return tank.crashed ? [-1, -1] : tank.position
}

function canEnter(map: Tile[][], position: [number, number], opponentPosition: [number, number]) {
  const tile = tileAt(map, position)
  return (tile === '.' || tile === 'o') && !samePos(position, opponentPosition)
}

function canTankDriveStep(
  map: Tile[][],
  position: [number, number],
  vector: [number, number],
  opponentPosition: [number, number],
) {
  const next: [number, number] = [position[0] + vector[0], position[1] + vector[1]]
  if (!canEnter(map, next, opponentPosition)) return false
  if (vector[0] === 0 || vector[1] === 0) return true
  return (
    canEnter(map, [position[0] + vector[0], position[1]], opponentPosition) &&
    canEnter(map, [position[0], position[1] + vector[1]], opponentPosition)
  )
}

function canEngineerEnter(
  map: Tile[][],
  position: [number, number],
  otherEngineerPosition: [number, number],
  bombs: InternalBomb[],
) {
  return isEngineerOpenTile(map, position, bombs) && !samePos(position, otherEngineerPosition)
}

function isOpenTile(map: Tile[][], position: [number, number]) {
  const tile = tileAt(map, position)
  return tile === '.' || tile === 'o'
}

function isEngineerOpenTile(
  map: Tile[][],
  position: [number, number],
  bombs: InternalBomb[],
  fromPosition?: [number, number],
) {
  const tile = tileAt(map, position)
  if (tile !== '.' && tile !== 'o' && tile !== 'w') return false
  return !bombs.some(
    (bomb) =>
      samePos(bomb.position, position) && (!fromPosition || !samePos(fromPosition, bomb.position)),
  )
}

function canPlaceBombOnTile(map: Tile[][], position: [number, number]) {
  const tile = tileAt(map, position)
  return tile === '.' || tile === 'o'
}

function isTankHiddenFromServer(map: Tile[][], tank: InternalTank, observer: InternalTank) {
  return (
    tank.cloakRemaining > 0 ||
    (tileAt(map, tank.position) === 'o' && !samePos(tank.position, observer.position))
  )
}

function isEngineerHiddenFromServer(
  map: Tile[][],
  engineer: InternalEngineer,
  observer: InternalTank,
) {
  return (
    engineer.alive &&
    tileAt(map, engineer.position) === 'o' &&
    !samePos(engineer.position, observer.position)
  )
}

function findEngineerSpawn(map: Tile[][], tankPosition: [number, number], owner: number) {
  const preferred: Array<[number, number]> =
    owner === 0
      ? [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ]
      : [
          [0, -1],
          [-1, 0],
          [0, 1],
          [1, 0],
        ]
  for (const delta of preferred) {
    const cell = add(tankPosition, delta)
    if (isOpenTile(map, cell)) return cell
  }
  return [...tankPosition] as [number, number]
}

function tileAt(map: Tile[][], position: [number, number]): Tile | null {
  return map[position[0]]?.[position[1]] ?? null
}

function inBounds(map: Tile[][], position: [number, number]) {
  return Boolean(map[position[0]]?.[position[1]])
}

function cloneMap(map: Tile[][]): Tile[][] {
  return map.map((column) => [...column])
}

function removeWhere<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) items.splice(index, 1)
  }
}

function samePos(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1]
}

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function pointToSegmentDistance(
  point: [number, number],
  from: [number, number],
  to: [number, number],
) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distance(point, from)
  const progress = Math.max(
    0,
    Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / lengthSquared),
  )
  return distance(point, [from[0] + dx * progress, from[1] + dy * progress])
}

function sweptCircleHit(
  from: [number, number],
  to: [number, number],
  center: [number, number],
  radius: number,
) {
  return pointToSegmentDistance(center, from, to) <= radius
}

function positionInExplosionTile(position: [number, number], explosionCenter: [number, number]) {
  return (
    Math.abs(position[0] - explosionCenter[0]) <= 0.86 &&
    Math.abs(position[1] - explosionCenter[1]) <= 0.86
  )
}

function bulletPointsCollide(a: [number, number], b: [number, number]) {
  return samePos(bulletCell(a), bulletCell(b)) || distance(a, b) <= 0.62
}

function bulletCell(position: [number, number]): [number, number] {
  return [Math.round(position[0]), Math.round(position[1])]
}

function nextBulletPosition(bullet: InternalBullet): [number, number] {
  if (bullet.headingDegrees === undefined) return add(bullet.position, DIR_DELTA[bullet.direction])
  const radians = (normalizeAngle(bullet.headingDegrees) * Math.PI) / 180
  return [bullet.position[0] + Math.cos(radians), bullet.position[1] + Math.sin(radians)]
}

function positionKey(position: [number, number]) {
  return `${position[0]}:${position[1]}`
}

function add(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]]
}

function manhattan(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
}

function turn(direction: Direction, side: 'left' | 'right') {
  const index = DIRECTIONS.indexOf(direction)
  const next = side === 'left' ? index + 3 : index + 1
  return DIRECTIONS[next % DIRECTIONS.length]!
}

function angleFromDirection(direction: Direction) {
  switch (direction) {
    case 'up':
      return -90
    case 'down':
      return 90
    case 'left':
      return 180
    case 'right':
      return 0
  }
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360
}

function directionFromDriveArgs(args: unknown[]): Direction | null {
  const [first, second] = args
  if (DIRECTIONS.includes(first as Direction)) return first as Direction
  if (typeof first === 'number' && typeof second === 'number') {
    return directionFromVector(first, second)
  }
  return null
}

function driveVectorFromArgs(args: unknown[]): [number, number] | null {
  const [first, second] = args
  if (typeof first !== 'number' || typeof second !== 'number') return null
  return gridStepFromVector(first, second)
}

function targetPositionFromDriveArgs(args: unknown[]): [number, number] | null {
  const [first, second] = args
  if (typeof first !== 'number' || typeof second !== 'number') return null
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null
  if (Math.abs(first) <= 1 && Math.abs(second) <= 1) return null
  return [Math.trunc(first), Math.trunc(second)]
}

function gridStepFromVector(x: number, y: number): [number, number] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return null
  const dx = Math.abs(x) > 0.2 ? Math.sign(x) : 0
  const dy = Math.abs(y) > 0.2 ? Math.sign(y) : 0
  return dx === 0 && dy === 0 ? null : [dx, dy]
}

function directionFromAimArgs(args: unknown[]): Direction | null {
  const [first, second] = args
  if (DIRECTIONS.includes(first as Direction)) return first as Direction
  if (typeof first === 'number' && typeof second === 'number') {
    return directionFromVector(first, second)
  }
  if (typeof first === 'number' && Number.isFinite(first)) return directionFromAngle(first)
  return null
}

function directionFromVector(x: number, y: number): Direction | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return null
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}

function directionFromAngle(angle: number): Direction {
  const normalized = ((angle % 360) + 360) % 360
  if (normalized >= 45 && normalized < 135) return 'down'
  if (normalized >= 135 && normalized < 225) return 'left'
  if (normalized >= 225 && normalized < 315) return 'up'
  return 'right'
}

function turnSide(current: Direction, target: Direction): 'left' | 'right' {
  const clockwise = (DIRECTIONS.indexOf(target) - DIRECTIONS.indexOf(current) + 4) % 4
  return clockwise === 3 ? 'left' : 'right'
}

function oppositeDirection(direction: Direction) {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % DIRECTIONS.length]!
}

function normalizeSeed(seed?: number) {
  return Number.isInteger(seed) ? Math.abs(seed!) : Math.floor(Math.random() * 0x7fffffff)
}

function createRng(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function randomId(rng: () => number, prefix: string) {
  return `${prefix}_${Math.floor(rng() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')}`
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export function battleResultReasonLabel(reason: BattleResultReason) {
  switch (reason) {
    case 'hit':
      return 'knockout'
    case 'crashed':
      return 'crashed'
    case 'stars':
      return 'star control'
    case 'flags':
      return 'flag control'
    case 'runtime':
      return 'runtime advantage'
    case 'draw':
      return 'draw'
  }
}
