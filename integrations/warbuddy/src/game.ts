import vm from 'node:vm'
import type {
  BattleBulletState,
  BattleEvent,
  BattleFrame,
  BattleFrameState,
  BattleMap,
  BattleReplay,
  BattleResultReason,
  BattleSummary,
  Direction,
  SkillType,
  TankProfile,
  Tile,
} from './types.js'

const MAX_FRAMES = 180
const MAX_ACTION_QUEUE = 12
const MAX_SPEECH_PER_TANK = 32
const MAX_SCRIPT_BYTES = 24_000
const SCRIPT_TIMEOUT_MS = 25
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
  | { type: 'turn'; side: 'left' | 'right' }
  | { type: 'fire' }
  | { type: 'skill'; skill: Exclude<SkillType, 'teleport'> }
  | { type: 'teleport'; x: number; y: number }

interface InternalBullet {
  id: string
  owner: number
  position: [number, number]
  direction: Direction
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
  speechCount: number
  runTime: number
  brain: ScriptBrain
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
      'xA....x.....o.....x',
      'x....x............x',
      'x...m........x....x',
      'xm..m..ox...mx....x',
      'x......o......o.x.x',
      'x...x.........o..xx',
      'xxo.ooo.....ooo.oxx',
      'xx..o.........x...x',
      'x.x.o......o......x',
      'x....xm...xo..m..mx',
      'x....x........m...x',
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
      'x.......oxo.......x',
      'xxx.x.x..o..x.x.xxx',
      'x...o....o....o...x',
      'xxx.x.x..o..x.x.xxx',
      'x.......oxo.......x',
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
      'x......ooooo......x',
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
        map[x]![y] = char === 'm' || char === 'o' || char === '.' ? char : 'x'
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
      speechCount: 0,
      runTime: 0,
      brain: undefined as unknown as ScriptBrain,
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
    tank.brain = new ScriptBrain(
      profile.code,
      (text) => speak(tank, currentFrameEvents, text),
      (args) => print(tank, currentFrameEvents, args),
    )
    if (tank.brain.compileError) {
      tank.crashed = true
      tank.stats.crashes += 1
      currentFrameEvents.push({
        type: 'runtime',
        action: 'compile_error',
        by: index,
        tank: tank.profile.name,
        reason: tank.brain.compileError,
      })
    }
    return tank
  })

  let star: [number, number] | null = null
  let result: BattleReplay['meta']['result'] | null = null
  const maxFrames = clampInt(input.maxFrames ?? MAX_FRAMES, 40, 500)

  for (let frame = 0; frame < maxFrames; frame += 1) {
    currentFrameEvents = []
    if (!star && frame % 26 === 0) {
      star = spawnStar(runtimeMap, tanks, bullets, rng)
      if (star) currentFrameEvents.push({ type: 'star', action: 'created', position: star })
    }

    for (let index = 0; index < tanks.length; index += 1) {
      const tank = tanks[index]!
      const opponent = tanks[1 - index]!
      if (tank.crashed) continue
      const canActThisFrame = canTankActThisFrame(tank, frame)
      if (canActThisFrame && tank.queue.length === 0) {
        const unstuck = tank.stalledFrames >= 6
        const fallback = unstuck
          ? fallbackAction({
              tankIndex: index,
              tank,
              opponent,
              bullets,
              map: runtimeMap,
              star,
            })
          : null
        if (fallback) {
          queueAction(tank, fallback)
          currentFrameEvents.push({
            type: 'runtime',
            action: 'assist',
            by: index,
            tank: tank.profile.name,
            reason: 'unstuck',
          })
        } else {
          runOnIdle({
            frame,
            tankIndex: index,
            tank,
            opponent,
            tanks,
            bullets,
            map: runtimeMap,
            star,
            events: currentFrameEvents,
          })
        }
      }
    }

    for (let index = 0; index < tanks.length; index += 1) {
      const tank = tanks[index]!
      if (tank.crashed || !canTankActThisFrame(tank, frame)) continue
      const action = tank.queue.shift()
      if (action)
        executeAction({
          frame,
          tankIndex: index,
          tank,
          opponent: tanks[1 - index]!,
          tanks,
          bullets,
          map: runtimeMap,
          action,
          rng,
          events: currentFrameEvents,
        })
    }

    moveBullets({ bullets, tanks, map: runtimeMap, events: currentFrameEvents })
    star = collectStar(star, tanks, currentFrameEvents)
    result = resolveImmediateResult(tanks, currentFrameEvents)
    recordFrame(frame, frames, currentFrameEvents, tanks, bullets, runtimeMap, star)
    for (const event of currentFrameEvents) events.push({ ...event, frame })
    if (result) break
    updateStallCounters(tanks)
    tickDown(tanks)
  }

  if (!result) result = resolveEndResult(tanks)
  const excitementScore = calculateExcitement(tanks, events, frames.length, result)
  const summary = summarize(tanks, frames.length, result)
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
  bullets: InternalBullet[]
  map: Tile[][]
  star: [number, number] | null
  events: BattleEvent[]
}) {
  const me = createMeApi(input)
  const enemy = buildEnemySnapshot(
    input.tankIndex,
    input.tank,
    input.opponent,
    input.bullets,
    input.map,
  )
  const game = {
    map: cloneMap(input.map),
    star: input.star ? [...input.star] : null,
    frames: input.frame,
  }
  const result = input.tank.brain.run(me, enemy, game)
  input.tank.runTime += result.runtimeMs
  if (!result.ok) {
    input.tank.crashed = true
    input.tank.stats.crashes += 1
    input.tank.stats.runtimeErrors += 1
    input.events.push({
      type: 'runtime',
      action: 'crashed',
      by: input.tankIndex,
      tank: input.tank.profile.name,
      reason: result.error,
    })
  }
}

function fallbackAction(input: {
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  bullets: InternalBullet[]
  map: Tile[][]
  star: [number, number] | null
}): Action | null {
  const opponentVisible = !isTankHiddenFromServer(input.map, input.opponent, input.tank)
  const shotDirection = opponentVisible
    ? clearGridShotDirection(input.map, input.tank.position, input.opponent.position)
    : null
  const ownBulletActive = input.bullets.some(
    (bullet) => bullet.owner === input.tankIndex && bullet.alive,
  )

  if (shotDirection && input.tank.direction === shotDirection && !ownBulletActive) {
    return { type: 'fire' }
  }

  const target = input.star ?? (opponentVisible ? input.opponent.position : null)
  const nextDirection = target
    ? nextPathDirection(input.map, input.tank.position, target, input.opponent.position)
    : bestRoamDirection(
        input.map,
        input.tank.position,
        input.opponent.position,
        input.tank.direction,
      )

  if (!nextDirection) return null
  if (nextDirection === input.tank.direction) return { type: 'go' }
  return { type: 'turn', side: turnSide(input.tank.direction, nextDirection) }
}

function updateStallCounters(tanks: InternalTank[]) {
  for (const tank of tanks) {
    if (tank.crashed) continue
    if (samePos(tank.position, tank.lastPosition)) {
      tank.stalledFrames += 1
    } else {
      tank.stalledFrames = 0
      tank.lastPosition = [...tank.position]
    }
  }
}

function createMeApi(input: {
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  bullets: InternalBullet[]
  map: Tile[][]
  events: BattleEvent[]
}) {
  const me: Record<string, unknown> = Object.create(null)
  me.tank = publicTank(input.tank)
  me.stars = input.tank.stars
  me.bullet = visibleOwnBullet(input.tankIndex, input.bullets)
  me.skill = publicSkill(input.tank)
  me.effects = publicEffects(input.tank)
  me.status = publicStatus(input.tank, true, input.map)
  me.go = (count?: unknown) => {
    const amount = clampInt(typeof count === 'number' ? count : 1, 1, 2)
    for (let i = 0; i < amount; i += 1) queueAction(input.tank, { type: 'go' })
  }
  me.turn = (side: unknown) => {
    if (side === 'left' || side === 'right') queueAction(input.tank, { type: 'turn', side })
  }
  me.fire = () => queueAction(input.tank, { type: 'fire' })
  me.speak = (text: unknown) => speak(input.tank, input.events, String(text ?? ''))
  me[input.tank.profile.skillType] =
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
  return me
}

function executeAction(input: {
  frame: number
  tankIndex: number
  tank: InternalTank
  opponent: InternalTank
  tanks: InternalTank[]
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
    case 'turn':
      turnTank(input, input.action)
      return
    case 'fire':
      fire(input)
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
  for (let step = 0; step < steps; step += 1) {
    const next = add(tank.position, DIR_DELTA[direction])
    if (!canEnter(input.map, next, input.opponent.position)) {
      if (step === 0) crashTank(input.tankIndex, tank, input.events, 'blocked_move')
      break
    }
    tank.position = next
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
  bullets: InternalBullet[]
  map: Tile[][]
  rng: () => number
  events: BattleEvent[]
}) {
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
  const bulletsToCreate: InternalBullet[] = [
    {
      id: randomId(input.rng, 'bullet'),
      owner: input.tankIndex,
      position: [...input.tank.position],
      direction: input.tank.direction,
      alive: true,
    },
  ]
  if (input.tank.overloadRemaining > 0) {
    bulletsToCreate.push({
      id: randomId(input.rng, 'bullet'),
      owner: input.tankIndex,
      position: [...input.tank.position],
      direction: turn(input.tank.direction, input.rng() < 0.5 ? 'left' : 'right'),
      alive: true,
    })
    input.tank.overloadRemaining = 0
  }
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
    details: bulletsToCreate.length > 1 ? { overloaded: true } : undefined,
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
  const valid = canEnter(input.map, target, input.opponent.position) && !occupiedByBullet
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
  bullets: InternalBullet[]
  tanks: InternalTank[]
  map: Tile[][]
  events: BattleEvent[]
}) {
  for (const bullet of input.bullets) {
    if (!bullet.alive) continue
    const next = add(bullet.position, DIR_DELTA[bullet.direction])
    if (!inBounds(input.map, next)) {
      bullet.alive = false
      input.events.push({
        type: 'bullet',
        action: 'shot_wall',
        by: bullet.owner,
        objectId: bullet.id,
        position: next,
      })
      input.tanks[bullet.owner]!.stats.shotsWall += 1
      continue
    }
    const tile = input.map[next[0]]![next[1]]!
    if (tile === 'x' || tile === 'm') {
      bullet.alive = false
      input.tanks[bullet.owner]!.stats.shotsWall += 1
      if (tile === 'm') input.map[next[0]]![next[1]] = '.'
      input.events.push({
        type: 'bullet',
        action: tile === 'm' ? 'dirt_destroyed' : 'shot_wall',
        by: bullet.owner,
        objectId: bullet.id,
        position: next,
      })
      continue
    }
    const targetIndex = bullet.owner === 0 ? 1 : 0
    const target = input.tanks[targetIndex]!
    if (!target.crashed && samePos(target.position, next)) {
      bullet.alive = false
      if (target.shieldRemaining > 0) {
        target.shieldRemaining = 0
        input.events.push({
          type: 'skill',
          action: 'shield_blocked',
          by: targetIndex,
          tank: target.profile.name,
          skill: 'shield',
          position: next,
        })
      } else {
        target.crashed = true
        target.stats.crashes += 1
        input.tanks[bullet.owner]!.stats.shotsHit += 1
        input.events.push({
          type: 'bullet',
          action: 'hit',
          by: bullet.owner,
          tank: input.tanks[bullet.owner]!.profile.name,
          objectId: bullet.id,
          position: next,
          details: { target: target.profile.name },
        })
      }
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
    })
  }
}

function collectStar(star: [number, number] | null, tanks: InternalTank[], events: BattleEvent[]) {
  if (!star) return null
  for (let index = 0; index < tanks.length; index += 1) {
    const tank = tanks[index]!
    if (!tank.crashed && samePos(tank.position, star)) {
      tank.stars += 1
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
  return star
}

function resolveImmediateResult(
  tanks: InternalTank[],
  events: BattleEvent[],
): BattleReplay['meta']['result'] | null {
  const crashed = tanks.map((tank) => tank.crashed)
  if (crashed[0] && crashed[1]) {
    events.push({ type: 'game', action: 'end', winner: null, reason: 'draw' })
    return { type: 'game', action: 'end', reason: 'draw', winner: null }
  }
  if (crashed[0] || crashed[1]) {
    const winner = crashed[0] ? 1 : 0
    const reason = events.some((event) => event.type === 'bullet' && event.action === 'hit')
      ? 'hit'
      : 'crashed'
    events.push({ type: 'game', action: 'end', winner, reason })
    return { type: 'game', action: 'end', reason, winner }
  }
  return null
}

function resolveEndResult(tanks: InternalTank[]): BattleReplay['meta']['result'] {
  if (tanks[0]!.stars !== tanks[1]!.stars) {
    return {
      type: 'game',
      action: 'end',
      reason: 'stars',
      winner: tanks[0]!.stars > tanks[1]!.stars ? 0 : 1,
    }
  }
  return { type: 'game', action: 'end', reason: 'draw', winner: null }
}

function recordFrame(
  frame: number,
  frames: BattleFrame[],
  events: BattleEvent[],
  tanks: InternalTank[],
  bullets: InternalBullet[],
  map: Tile[][],
  star: [number, number] | null,
) {
  frames.push({
    frame,
    events: events.map((event) => ({ ...event })),
    state: buildFrameState(tanks, bullets, map, star),
  })
}

function buildFrameState(
  tanks: InternalTank[],
  bullets: InternalBullet[],
  map: Tile[][],
  star: [number, number] | null,
): BattleFrameState {
  return {
    tanks: tanks.map((tank) => ({
      id: tank.profile.id,
      name: tank.profile.name,
      position: [...tank.position],
      direction: tank.direction,
      crashed: tank.crashed,
      stars: tank.stars,
      skillType: tank.profile.skillType,
      status: publicStatus(tank, true, map),
    })),
    engineers: [],
    bullets: bullets.filter((bullet) => bullet.alive).map(publicBullet),
    bombs: [],
    explosions: [],
    star: star ? [...star] : null,
    map: cloneMap(map),
  }
}

function publicTank(tank: InternalTank) {
  return {
    id: tank.profile.id,
    position: [...tank.position],
    direction: tank.direction,
    crashed: tank.crashed,
  }
}

function publicBullet(bullet: InternalBullet): BattleBulletState {
  return {
    id: bullet.id,
    owner: bullet.owner,
    position: [...bullet.position],
    direction: bullet.direction,
    alive: bullet.alive,
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
  bullets: InternalBullet[],
  map: Tile[][],
) {
  const enemyHidden = isTankHiddenFromServer(map, enemy, me)
  const enemyBullet = bullets.find((bullet) => bullet.owner !== meIndex && bullet.alive)
  return {
    tank: enemyHidden ? null : publicTank(enemy),
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
  }
}

function canTankActThisFrame(tank: InternalTank, frame: number) {
  if (tank.freezeRemaining > 0) return false
  if (tank.poisonRemaining > 0 && frame % 2 === 0) return false
  return true
}

function tickDown(tanks: InternalTank[]) {
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
  }
}

function summarize(
  tanks: InternalTank[],
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
      tanks.map((tank) => [
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
  bullets: InternalBullet[],
  rng: () => number,
): [number, number] | null {
  const candidates: Array<[number, number]> = []
  for (let x = 0; x < map.length; x += 1) {
    for (let y = 0; y < (map[x]?.length ?? 0); y += 1) {
      const pos: [number, number] = [x, y]
      if (tileAt(map, pos) === 'x' || tileAt(map, pos) === 'm') continue
      if (tanks.some((tank) => samePos(tank.position, pos))) continue
      if (bullets.some((bullet) => bullet.alive && samePos(bullet.position, pos))) continue
      candidates.push(pos)
    }
  }
  if (!candidates.length) return null
  return candidates[Math.floor(rng() * candidates.length)]!
}

function queueAction(tank: InternalTank, action: Action) {
  if (tank.queue.length >= MAX_ACTION_QUEUE) return
  tank.queue.push(action)
}

function speak(tank: InternalTank, events: BattleEvent[], text: string) {
  if (tank.speechCount >= MAX_SPEECH_PER_TANK) return
  const body = text.trim().slice(0, 40)
  if (!body) return
  tank.speechCount += 1
  events.push({
    type: 'speech',
    action: 'say',
    tank: tank.profile.name,
    objectId: tank.objectId,
    position: [...tank.position],
    text: body,
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

function nextPathDirection(
  map: Tile[][],
  start: [number, number],
  target: [number, number],
  blocked: [number, number],
): Direction | null {
  if (!isOpenTile(map, target)) return null
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
      if (visited.has(key) || samePos(next, blocked) || !isOpenTile(map, next)) continue
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
): Direction | null {
  const reverse = oppositeDirection(currentDirection)
  return (
    DIRECTIONS.map((direction) => {
      const next = add(position, DIR_DELTA[direction])
      return {
        direction,
        score:
          isOpenTile(map, next) && !samePos(next, blocked)
            ? openNeighborCount(map, next) +
              (direction === currentDirection ? 1.4 : 0) -
              (direction === reverse ? 0.9 : 0)
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

function canEnter(map: Tile[][], position: [number, number], opponentPosition: [number, number]) {
  const tile = tileAt(map, position)
  return (tile === '.' || tile === 'o') && !samePos(position, opponentPosition)
}

function isOpenTile(map: Tile[][], position: [number, number]) {
  const tile = tileAt(map, position)
  return tile === '.' || tile === 'o'
}

function isTankHiddenFromServer(map: Tile[][], tank: InternalTank, observer: InternalTank) {
  return (
    tank.cloakRemaining > 0 ||
    (tileAt(map, tank.position) === 'o' && !samePos(tank.position, observer.position))
  )
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

function samePos(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1]
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
    case 'runtime':
      return 'runtime advantage'
    case 'draw':
      return 'draw'
  }
}
