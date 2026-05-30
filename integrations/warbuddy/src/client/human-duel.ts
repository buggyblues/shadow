import type {
  BattleBombState,
  BattleBulletState,
  BattleExplosionState,
  BattleFrameState,
  BattleSpeechState,
  Direction,
  RuntimeEngineerState,
  RuntimeTankState,
  SkillType,
  TankProfile,
  Tile,
  UnitDeathState,
} from '../types.js'

export type DuelAction =
  | { type: 'go' }
  | { type: 'drive'; x: number; y: number; target?: boolean }
  | { type: 'move'; direction: Direction }
  | { type: 'engineerDrive'; x: number; y: number; target?: boolean }
  | { type: 'engineerMove'; direction: Direction }
  | { type: 'engineerBomb' }
  | { type: 'turn'; side: 'left' | 'right' }
  | { type: 'aim'; angle: number }
  | { type: 'fire' }
  | { type: 'skill' }
  | { type: 'tankSpeak'; text: string }
  | { type: 'engineerSpeak'; text: string }

export type DuelRole = 'tank' | 'engineer'

interface DuelTank {
  id: string
  name: string
  skillType: SkillType
  position: [number, number]
  lastPosition: [number, number]
  velocity: [number, number]
  heading: number
  direction: Direction
  driveIntent: boolean
  crashed: boolean
  stars: number
  shotgunLevel: number
  armor: number
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
  stuckFrames: number
}

interface DuelBullet {
  id: string
  owner: number
  position: [number, number]
  heading: number
  direction: Direction
  alive: boolean
  age: number
}

interface DuelEngineer {
  id: string
  owner: 0 | 1
  name: string
  position: [number, number]
  velocity: [number, number]
  heading: number
  direction: Direction
  driveIntent: boolean
  alive: boolean
  bombRange: number
  maxBombs: number
  starUpgrades: number
  bombCooldown: number
  powerGlowRemaining: number
  death: UnitDeathState | null
}

interface DuelBomb {
  id: string
  owner: 0 | 1
  position: [number, number]
  range: number
  remainingFrames: number
}

interface DuelExplosion {
  id: string
  owner: 0 | 1
  positions: Array<[number, number]>
  remainingFrames: number
}

interface DuelSpeech {
  id: string
  owner: 0 | 1
  unitKind: 'tank' | 'engineer'
  unitName: string
  text: string
  remainingFrames: number
}

export interface HumanDuelState {
  id: string
  mapId: string
  mapName: string
  map: Tile[][]
  frame: number
  maxFrames: number
  status: 'running' | 'settled'
  result: {
    winner: 'human' | 'agent' | 'draw' | null
    reason: 'hit' | 'crashed' | 'flags' | 'draw'
  }
  tanks: [DuelTank, DuelTank]
  engineers: [DuelEngineer, DuelEngineer]
  bullets: DuelBullet[]
  bombs: DuelBomb[]
  explosions: DuelExplosion[]
  speeches: DuelSpeech[]
  star: [number, number] | null
  flag: [number, number] | null
  flagScores: [number, number]
  bulletClashes: number
  log: string[]
  state: BattleFrameState
  agentTankId: string
  agentCode: string
}

export const HUMAN_DUEL_MAX_FRAMES = 900

const STAR_FIRST_FRAME = 240
const STAR_SPAWN_INTERVAL = 310
const FLAG_TARGET = 3
const FLAG_FIRST_FRAME = 360
const FLAG_SPAWN_INTERVAL = 430
const TANK_RADIUS = 0.34
const TANK_SPEED = 0.102
const TANK_BOOST_MULTIPLIER = 1.58
const BULLET_SPEED = 0.24
const BULLET_RADIUS = 0.12
const BULLET_TTL = 150
const STAR_PICKUP_RADIUS = 0.54
const FLAG_PICKUP_RADIUS = 0.58
const GRASS_REVEAL_RADIUS = 1.45
const FIRE_LOCK_FRAMES = 18
const SHOT_ALIGNMENT_DEGREES = 13
const TANK_ACCELERATION_BLEND = 0.84
const TANK_INERTIA_FRICTION = 0.48
const TANK_STOP_SPEED = 0.006
const ENGINEER_RADIUS = 0.23
const ENGINEER_SPEED = 0.092
const ENGINEER_ACCELERATION_BLEND = 0.82
const ENGINEER_INERTIA_FRICTION = 0.42
const ENGINEER_STOP_SPEED = 0.005
const ENGINEER_BOMB_COOLDOWN = 26
const BOMB_FUSE_FRAMES = 58
const EXPLOSION_TTL = 15
const SPEECH_TTL = 96
const STAR_POWER_GLOW_FRAMES = 180
const INITIAL_BOMB_RANGE = 2
const MAX_BOMB_RANGE = 5
const MAX_ENGINEER_BOMBS = 3
const TANK_CRUSH_RADIUS = TANK_RADIUS + ENGINEER_RADIUS + 0.08
const BOMB_TILE_DANGER = 100
const BOMB_NEAR_DANGER_RADIUS = 1.04
const PICKUP_MIN_SEPARATION = 4.2
const PICKUP_MIN_UNIT_DISTANCE = 2.4
const TANK_DODGE_LOOKAHEAD_FRAMES = 9
const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left']
const DIR_DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}
const SKILL_COOLDOWNS: Record<SkillType, number> = {
  shield: 72,
  freeze: 90,
  stun: 78,
  overload: 96,
  cloak: 102,
  poison: 84,
  teleport: 108,
  boost: 90,
}
const BLOCKED_SCRIPT_TOKENS =
  /\b(?:constructor|document|eval|fetch|Function|global|globalThis|import|localStorage|location|navigator|process|prototype|require|sessionStorage|WebSocket|window|Worker|XMLHttpRequest)\b|__proto__/u

export function createHumanDuel(input: {
  mapId: string
  mapName: string
  mapRaw: string
  humanName: string
  humanSkillType: SkillType
  agent: Pick<TankProfile, 'id' | 'name' | 'skillType' | 'code'>
}) {
  const parsed = parseMap(input.mapRaw)
  const duel: Omit<HumanDuelState, 'state'> = {
    id: `duel_${Date.now().toString(36)}`,
    mapId: input.mapId,
    mapName: input.mapName,
    map: parsed.map,
    frame: 0,
    maxFrames: HUMAN_DUEL_MAX_FRAMES,
    status: 'running',
    result: { winner: null, reason: 'draw' },
    tanks: [
      createTank({
        id: 'human',
        name: input.humanName.trim() || 'Human Pilot',
        skillType: input.humanSkillType,
        position: parsed.spawns[0].position,
        direction: parsed.spawns[0].direction,
      }),
      createTank({
        id: input.agent.id,
        name: input.agent.name,
        skillType: input.agent.skillType,
        position: parsed.spawns[1].position,
        direction: parsed.spawns[1].direction,
      }),
    ],
    engineers: [
      createEngineer({
        id: 'human_engineer',
        owner: 0,
        name: 'Human Engineer',
        position: findEngineerSpawn(parsed.map, parsed.spawns[0].position, 0),
        direction: 'right',
      }),
      createEngineer({
        id: `${input.agent.id}_engineer`,
        owner: 1,
        name: `${input.agent.name} Engineer`,
        position: findEngineerSpawn(parsed.map, parsed.spawns[1].position, 1),
        direction: 'left',
      }),
    ],
    bullets: [],
    bombs: [],
    explosions: [],
    speeches: [],
    star: null,
    flag: null,
    flagScores: [0, 0],
    bulletClashes: 0,
    log: [`Human Pilot entered ${input.mapName}`],
    agentTankId: input.agent.id,
    agentCode: input.agent.code,
  }
  return withFrameState(duel)
}

export function keyToDuelAction(key: string): DuelAction | null {
  const normalized = key.toLowerCase()
  if (normalized === 'arrowup' || normalized === 'w') return { type: 'move', direction: 'up' }
  if (normalized === 'arrowdown' || normalized === 's') return { type: 'move', direction: 'down' }
  if (normalized === 'arrowleft' || normalized === 'a') return { type: 'move', direction: 'left' }
  if (normalized === 'arrowright' || normalized === 'd') return { type: 'move', direction: 'right' }
  if (normalized === 'i') return { type: 'engineerMove', direction: 'up' }
  if (normalized === 'k') return { type: 'engineerMove', direction: 'down' }
  if (normalized === 'j') return { type: 'engineerMove', direction: 'left' }
  if (normalized === 'l') return { type: 'engineerMove', direction: 'right' }
  if (normalized === 'u' || normalized === 'o') return { type: 'engineerBomb' }
  if (normalized === ' ' || normalized === 'spacebar' || normalized === 'q') return { type: 'fire' }
  if (normalized === 'e' || normalized === 'shift') return { type: 'skill' }
  return null
}

export function heldKeysToDuelActions(keys: Iterable<string>): DuelAction[] {
  let x = 0
  let y = 0
  let engineerX = 0
  let engineerY = 0
  for (const key of keys) {
    const action = keyToDuelAction(key)
    if (action?.type === 'move') {
      x += DIR_DELTA[action.direction][0]
      y += DIR_DELTA[action.direction][1]
    }
    if (action?.type === 'engineerMove') {
      engineerX += DIR_DELTA[action.direction][0]
      engineerY += DIR_DELTA[action.direction][1]
    }
  }
  return [
    ...(x || y ? ([{ type: 'drive', x, y }] satisfies DuelAction[]) : []),
    ...(engineerX || engineerY
      ? ([{ type: 'engineerDrive', x: engineerX, y: engineerY }] satisfies DuelAction[])
      : []),
  ]
}

export function actionsForRole(actions: DuelAction[], role: DuelRole): DuelAction[] {
  return actions.filter((action) =>
    role === 'tank' ? isTankDuelAction(action) : isEngineerDuelAction(action),
  )
}

export function companionActionsForRole(
  state: HumanDuelState,
  side: 0 | 1,
  humanRole: DuelRole,
): DuelAction[] {
  if (humanRole === 'tank') {
    const engineerAction = fallbackEngineerAction(state, side)
    return engineerAction ? [engineerAction] : []
  }
  return fallbackTankActions(state, side)
}

function isTankDuelAction(action: DuelAction) {
  return (
    action.type === 'go' ||
    action.type === 'drive' ||
    action.type === 'move' ||
    action.type === 'turn' ||
    action.type === 'aim' ||
    action.type === 'fire' ||
    action.type === 'skill'
  )
}

function isEngineerDuelAction(action: DuelAction) {
  return (
    action.type === 'engineerDrive' ||
    action.type === 'engineerMove' ||
    action.type === 'engineerBomb'
  )
}

export function stepHumanDuel(
  state: HumanDuelState,
  humanActions: DuelAction[],
  agentActions: DuelAction[],
) {
  if (state.status === 'settled') return state

  const next = cloneDuel(state)
  next.frame += 1
  next.tanks.forEach((tank) => {
    tank.driveIntent = false
  })
  next.engineers.forEach((engineer) => {
    engineer.driveIntent = false
  })
  tickSpeeches(next)
  if (
    !next.star &&
    next.frame >= STAR_FIRST_FRAME &&
    (next.frame - STAR_FIRST_FRAME) % STAR_SPAWN_INTERVAL === 0
  )
    next.star = spawnStar(next)
  if (
    !next.flag &&
    next.frame >= FLAG_FIRST_FRAME &&
    (next.frame - FLAG_FIRST_FRAME) % FLAG_SPAWN_INTERVAL === 0
  )
    next.flag = spawnFlag(next)

  for (const action of humanActions.slice(0, 4)) executeAction(next, 0, action)
  for (const action of agentActions.slice(0, 4)) executeAction(next, 1, action)

  applyTankMotion(next)
  triggerBombsUnderTanks(next)
  applyEngineerMotion(next)
  crushEnemyEngineers(next)
  moveBullets(next)
  tickBombsAndExplosions(next)
  collectStar(next)
  collectFlag(next)
  settleIfNeeded(next)
  tickDown(next)
  updateTankStuckCounters(next)
  return withFrameState(next)
}

export async function decideAgentActions(state: HumanDuelState): Promise<DuelAction[]> {
  if (!hasStrategyCode(state.agentCode)) return fallbackAgentActions(state)
  if (typeof Worker === 'undefined') return []
  if (BLOCKED_SCRIPT_TOKENS.test(state.agentCode)) return []

  const snapshot = createAgentSnapshot(state)
  const workerSource = `
const BLOCKED = ${BLOCKED_SCRIPT_TOKENS.toString()};
const DIRECTIONS = ["up", "right", "down", "left"];
const VECTOR_BY_DIRECTION = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const ANGLE_BY_DIRECTION = { up: -90, right: 0, down: 90, left: 180 };
function finiteVector(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0);
}
function coordinateTarget(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && (Math.abs(x) > 1 || Math.abs(y) > 1);
}
self.onmessage = (event) => {
  const { code, snapshot } = event.data;
  const actions = [];
  const queue = (action) => {
    if (actions.length < 3) actions.push(action);
  };
  const tank = {
    ...snapshot.me.tank,
    drive(x, y) {
      if (DIRECTIONS.includes(x)) {
        const vector = VECTOR_BY_DIRECTION[x];
        queue({ type: 'drive', x: vector[0], y: vector[1] });
      } else if (finiteVector(x, y)) {
        queue({ type: 'drive', x, y, target: coordinateTarget(x, y) });
      }
    },
    aim(angle) {
      if (DIRECTIONS.includes(angle)) queue({ type: 'aim', angle: ANGLE_BY_DIRECTION[angle] });
      else if (Number.isFinite(angle)) queue({ type: 'aim', angle });
    },
    fire() {
      if (snapshot.me.bullet || snapshot.me.status.fireLocked) return;
      queue({ type: 'fire' });
    },
    speak(text) {
      if (typeof text === 'string' && text.trim()) queue({ type: 'tankSpeak', text });
    },
  };
  const engineer = snapshot.me.engineer
    ? {
        ...snapshot.me.engineer,
        move(x, y) {
          if (DIRECTIONS.includes(x)) queue({ type: 'engineerMove', direction: x });
          else if (finiteVector(x, y)) queue({ type: 'engineerDrive', x, y, target: coordinateTarget(x, y) });
        },
        bomb() {
          queue({ type: 'engineerBomb' });
        },
        speak(text) {
          if (typeof text === 'string' && text.trim()) queue({ type: 'engineerSpeak', text });
        },
      }
    : null;
  const castSkill = () => queue({ type: 'skill' });
  tank[snapshot.me.skill.type] = castSkill;
  const me = {
    tank,
    engineer,
    stars: snapshot.me.stars,
    bullet: snapshot.me.bullet,
    skill: snapshot.me.skill,
    effects: snapshot.me.effects,
    status: snapshot.me.status,
  };
  try {
    if (BLOCKED.test(code)) throw new Error('blocked_token');
    const factory = new Function('"use strict";\\n' + code + '\\n; return typeof onIdle === "function" ? onIdle : null;');
    const onIdle = factory();
    if (typeof onIdle === 'function') onIdle(me, snapshot.enemy, snapshot.game);
    self.postMessage({ actions });
  } catch {
    self.postMessage({ actions: [] });
  }
};`

  return new Promise((resolve) => {
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    const cleanup = () => {
      URL.revokeObjectURL(workerUrl)
      worker.terminate()
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve([])
    }, 30)
    worker.onmessage = (event: MessageEvent<{ actions?: DuelAction[] }>) => {
      window.clearTimeout(timeout)
      cleanup()
      const actions = sanitizeActions(event.data.actions ?? [])
      resolve(scriptedAgentActions(state, actions))
    }
    worker.onerror = () => {
      window.clearTimeout(timeout)
      cleanup()
      resolve([])
    }
    worker.postMessage({ code: state.agentCode, snapshot })
  })
}

function createTank(input: {
  id: string
  name: string
  skillType: SkillType
  position: [number, number]
  direction: Direction
}): DuelTank {
  const heading = angleFromDirection(input.direction)
  return {
    id: input.id,
    name: input.name,
    skillType: input.skillType,
    position: [...input.position],
    lastPosition: [...input.position],
    velocity: [0, 0],
    heading,
    direction: input.direction,
    driveIntent: false,
    crashed: false,
    stars: 0,
    shotgunLevel: 0,
    armor: 1,
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
    stuckFrames: 0,
  }
}

function createEngineer(input: {
  id: string
  owner: 0 | 1
  name: string
  position: [number, number]
  direction: Direction
}): DuelEngineer {
  const heading = angleFromDirection(input.direction)
  return {
    id: input.id,
    owner: input.owner,
    name: input.name,
    position: [...input.position],
    velocity: [0, 0],
    heading,
    direction: input.direction,
    driveIntent: false,
    alive: true,
    bombRange: INITIAL_BOMB_RANGE,
    maxBombs: 1,
    starUpgrades: 0,
    bombCooldown: 0,
    powerGlowRemaining: 0,
    death: null,
  }
}

function findEngineerSpawn(map: Tile[][], tankPosition: [number, number], owner: 0 | 1) {
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
  const tankCell = cellAt(tankPosition)
  for (const delta of preferred) {
    const cell: [number, number] = [tankCell[0] + delta[0], tankCell[1] + delta[1]]
    if (isOpenTile(map, cell)) return centerOf(cell)
  }
  return [...tankPosition] as [number, number]
}

function parseMap(raw: string) {
  const rows = raw
    .split('|')
    .map((row) => row.trim())
    .filter(Boolean)
  const width = Math.max(...rows.map((row) => row.length))
  const height = rows.length
  const map: Tile[][] = Array.from({ length: width }, () => Array<Tile>(height).fill('x'))
  const spawns: Array<{ position: [number, number]; direction: Direction }> = []
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      const char = row[x] ?? 'x'
      if (char === 'A' || char === 'B') {
        spawns[char === 'A' ? 0 : 1] = {
          position: [x + 0.5, y + 0.5],
          direction: char === 'A' ? 'right' : 'left',
        }
        map[x]![y] = '.'
      } else {
        map[x]![y] = char === 'm' || char === 'o' || char === 'w' || char === '.' ? char : 'x'
      }
    }
  })
  if (!spawns[0] || !spawns[1]) throw new Error('human_duel_map_missing_spawns')
  return { map, spawns: spawns as [(typeof spawns)[number], (typeof spawns)[number]] }
}

function executeAction(state: Omit<HumanDuelState, 'state'>, index: 0 | 1, action: DuelAction) {
  if (action.type === 'tankSpeak') {
    const tank = state.tanks[index]
    if (!tank.crashed) addSpeech(state, index, 'tank', tank.name, action.text)
    return
  }
  if (action.type === 'engineerSpeak') {
    const engineer = state.engineers[index]
    if (engineer.alive) addSpeech(state, index, 'engineer', engineer.name, action.text)
    return
  }
  if (
    action.type === 'engineerMove' ||
    action.type === 'engineerDrive' ||
    action.type === 'engineerBomb'
  ) {
    executeEngineerAction(state, index, action)
    return
  }

  const tank = state.tanks[index]
  if (tank.crashed || tank.freezeRemaining > 0) return
  if (tank.poisonRemaining > 0 && state.frame % 2 === 0) return

  if (action.type === 'turn') {
    setHeading(tank, tank.heading + (action.side === 'right' ? 90 : -90))
    return
  }
  if (action.type === 'aim') {
    setHeading(tank, action.angle)
    return
  }
  if (action.type === 'move') {
    moveTankVector(state, index, DIR_DELTA[action.direction])
    return
  }
  if (action.type === 'drive') {
    moveTankVector(state, index, [action.x, action.y])
    return
  }
  if (action.type === 'go') {
    moveTankVector(state, index, vectorFromAngle(tank.heading))
    return
  }
  if (action.type === 'fire') fire(state, index)
  if (action.type === 'skill') castSkill(state, index)
}

function executeEngineerAction(
  state: Omit<HumanDuelState, 'state'>,
  index: 0 | 1,
  action: Extract<
    DuelAction,
    { type: 'engineerMove' | 'engineerDrive' | 'engineerBomb' | 'engineerSpeak' }
  >,
) {
  const engineer = state.engineers[index]
  if (!engineer.alive) return

  if (action.type === 'engineerMove') {
    moveEngineerVector(state, index, DIR_DELTA[action.direction])
    return
  }
  if (action.type === 'engineerDrive') {
    moveEngineerVector(state, index, [action.x, action.y])
    return
  }
  placeEngineerBomb(state, index)
}

function moveTankVector(
  state: Omit<HumanDuelState, 'state'>,
  index: 0 | 1,
  rawVector: [number, number],
) {
  const tank = state.tanks[index]
  const opponent = state.tanks[otherIndex(index)]
  const vector = normalizeVector(rawVector)
  if (!vector) return

  const speed = tankMoveSpeed(tank)
  const targetVelocity: [number, number] = [vector[0] * speed, vector[1] * speed]
  tank.velocity = [
    tank.velocity[0] + (targetVelocity[0] - tank.velocity[0]) * TANK_ACCELERATION_BLEND,
    tank.velocity[1] + (targetVelocity[1] - tank.velocity[1]) * TANK_ACCELERATION_BLEND,
  ]
  tank.driveIntent = true
  setHeading(tank, angleFromVector(vector))
}

function tankMoveSpeed(tank: DuelTank) {
  const stunMultiplier = tank.stunRemaining > 0 ? 0.62 : 1
  return TANK_SPEED * (tank.boostRemaining > 0 ? TANK_BOOST_MULTIPLIER : 1) * stunMultiplier
}

function moveWithCollision(
  state: Pick<HumanDuelState, 'map'>,
  tank: DuelTank,
  opponent: DuelTank,
  dx: number,
  dy: number,
) {
  const before = [...tank.position] as [number, number]
  const nextX: [number, number] = [tank.position[0] + dx, tank.position[1]]
  if (canTankOccupy(state, nextX, opponent.position)) tank.position = nextX

  const nextY: [number, number] = [tank.position[0], tank.position[1] + dy]
  if (canTankOccupy(state, nextY, opponent.position)) tank.position = nextY
  return subtract(tank.position, before)
}

function applyTankMotion(state: Omit<HumanDuelState, 'state'>) {
  state.tanks.forEach((tank, index) => {
    tank.lastPosition = [...tank.position]
    if (tank.crashed || tank.freezeRemaining > 0) {
      tank.velocity = [0, 0]
      return
    }

    const speed = Math.hypot(tank.velocity[0], tank.velocity[1])
    if (speed < TANK_STOP_SPEED) {
      tank.velocity = [0, 0]
      return
    }

    const opponent = state.tanks[otherIndex(index as 0 | 1)]
    const applied = moveWithCollision(state, tank, opponent, tank.velocity[0], tank.velocity[1])
    const appliedVector = normalizeVector(applied)
    if (appliedVector) setHeading(tank, angleFromVector(appliedVector))

    const retain = tank.driveIntent ? 1 : TANK_INERTIA_FRICTION
    tank.velocity = [applied[0] * retain, applied[1] * retain]
    if (Math.hypot(tank.velocity[0], tank.velocity[1]) < TANK_STOP_SPEED) tank.velocity = [0, 0]
  })
}

function moveEngineerVector(
  state: Omit<HumanDuelState, 'state'>,
  index: 0 | 1,
  rawVector: [number, number],
) {
  const engineer = state.engineers[index]
  const vector = normalizeVector(rawVector)
  if (!vector) return

  const targetVelocity: [number, number] = [vector[0] * ENGINEER_SPEED, vector[1] * ENGINEER_SPEED]
  engineer.velocity = [
    engineer.velocity[0] + (targetVelocity[0] - engineer.velocity[0]) * ENGINEER_ACCELERATION_BLEND,
    engineer.velocity[1] + (targetVelocity[1] - engineer.velocity[1]) * ENGINEER_ACCELERATION_BLEND,
  ]
  engineer.driveIntent = true
  setEngineerHeading(engineer, angleFromVector(vector))
}

function applyEngineerMotion(state: Omit<HumanDuelState, 'state'>) {
  state.engineers.forEach((engineer, index) => {
    if (!engineer.alive) {
      engineer.velocity = [0, 0]
      return
    }

    const speed = Math.hypot(engineer.velocity[0], engineer.velocity[1])
    if (speed < ENGINEER_STOP_SPEED) {
      engineer.velocity = [0, 0]
      return
    }

    const applied = moveEngineerWithCollision(
      state,
      engineer,
      index as 0 | 1,
      engineer.velocity[0],
      engineer.velocity[1],
    )
    const appliedVector = normalizeVector(applied)
    if (appliedVector) setEngineerHeading(engineer, angleFromVector(appliedVector))

    const retain = engineer.driveIntent ? 1 : ENGINEER_INERTIA_FRICTION
    engineer.velocity = [applied[0] * retain, applied[1] * retain]
    if (Math.hypot(engineer.velocity[0], engineer.velocity[1]) < ENGINEER_STOP_SPEED) {
      engineer.velocity = [0, 0]
    }
  })
}

function moveEngineerWithCollision(
  state: Pick<HumanDuelState, 'map' | 'engineers' | 'bombs'>,
  engineer: DuelEngineer,
  index: 0 | 1,
  dx: number,
  dy: number,
) {
  const before = [...engineer.position] as [number, number]
  const nextX: [number, number] = [engineer.position[0] + dx, engineer.position[1]]
  if (canEngineerOccupy(state, nextX, index, before)) engineer.position = nextX

  const nextY: [number, number] = [engineer.position[0], engineer.position[1] + dy]
  if (canEngineerOccupy(state, nextY, index, before)) engineer.position = nextY
  return subtract(engineer.position, before)
}

function crushEnemyEngineers(state: Omit<HumanDuelState, 'state'>) {
  state.tanks.forEach((tank, tankIndex) => {
    if (tank.crashed) return
    const enemyEngineer = state.engineers[otherIndex(tankIndex as 0 | 1)]
    if (!enemyEngineer.alive) return
    if (
      sweptCircleHit(tank.lastPosition, tank.position, enemyEngineer.position, TANK_CRUSH_RADIUS)
    ) {
      killEngineer(enemyEngineer, {
        cause: 'crush',
        by: tankIndex,
        frame: state.frame,
        detail: tank.name,
      })
      addLog(state, `${tank.name} crushed ${enemyEngineer.name}`)
    }
  })
}

function triggerBombsUnderTanks(state: Omit<HumanDuelState, 'state'>) {
  const triggered = state.bombs.filter((bomb) =>
    state.tanks.some(
      (tank) =>
        !tank.crashed &&
        (sameCell(cellAt(tank.position), cellAt(bomb.position)) ||
          sweptCircleHit(tank.lastPosition, tank.position, bomb.position, TANK_RADIUS + 0.18)),
    ),
  )
  if (triggered.length) detonateBombs(state, triggered)
}

function placeEngineerBomb(state: Omit<HumanDuelState, 'state'>, index: 0 | 1) {
  const engineer = state.engineers[index]
  if (!engineer.alive || engineer.bombCooldown > 0) return
  const activeBombs = state.bombs.filter((bomb) => bomb.owner === index).length
  if (activeBombs >= engineer.maxBombs) return
  const position = centerOf(cellAt(engineer.position))
  if (state.bombs.some((bomb) => sameCell(cellAt(bomb.position), cellAt(position)))) return
  if (!canPlaceBombOnTile(state.map, cellAt(position))) return

  state.bombs.push({
    id: `bomb_${state.frame}_${index}_${state.bombs.length}`,
    owner: index,
    position,
    range: engineer.bombRange,
    remainingFrames: BOMB_FUSE_FRAMES,
  })
  engineer.bombCooldown = ENGINEER_BOMB_COOLDOWN
  addLog(state, `${engineer.name} planted a bomb`)
}

function tickBombsAndExplosions(state: Omit<HumanDuelState, 'state'>) {
  state.explosions = state.explosions
    .map((explosion) => ({ ...explosion, remainingFrames: explosion.remainingFrames - 1 }))
    .filter((explosion) => explosion.remainingFrames > 0)

  const exploding: DuelBomb[] = []
  for (const bomb of state.bombs) {
    bomb.remainingFrames -= 1
    if (bomb.remainingFrames <= 0) exploding.push(bomb)
  }
  state.bombs = state.bombs.filter((bomb) => bomb.remainingFrames > 0)
  detonateBombs(state, exploding)
}

function detonateBombs(state: Omit<HumanDuelState, 'state'>, initial: DuelBomb[]) {
  const queue = [...initial]
  const detonated = new Set<string>()
  while (queue.length) {
    const bomb = queue.shift()!
    if (detonated.has(bomb.id)) continue
    detonated.add(bomb.id)
    state.bombs = state.bombs.filter((item) => item.id !== bomb.id)
    const positions = explodeBomb(state, bomb)
    for (const chained of state.bombs) {
      if (positions.some((position) => positionInExplosionTile(chained.position, position))) {
        queue.push(chained)
      }
    }
  }
}

function explodeBomb(state: Omit<HumanDuelState, 'state'>, bomb: DuelBomb) {
  const positions = explosionPositions(state.map, bomb.position, bomb.range)
  const explosion: DuelExplosion = {
    id: `explosion_${state.frame}_${bomb.id}`,
    owner: bomb.owner,
    positions,
    remainingFrames: EXPLOSION_TTL,
  }
  state.explosions.push(explosion)
  addLog(state, `Bomb detonated`)

  for (const tank of state.tanks) {
    if (
      !tank.crashed &&
      positions.some((position) => positionInExplosionTile(tank.position, position))
    ) {
      damageTank(state, tank, `${tank.name} was caught in the blast`, {
        cause: 'bomb',
        by: bomb.owner,
        frame: state.frame,
        detail: bomb.id,
      })
    }
  }

  for (const engineer of state.engineers) {
    if (
      engineer.alive &&
      positions.some((position) => positionInExplosionTile(engineer.position, position))
    ) {
      killEngineer(engineer, {
        cause: 'bomb',
        by: bomb.owner,
        frame: state.frame,
        detail: bomb.id,
      })
      addLog(state, `${engineer.name} was caught in the blast`)
    }
  }
  return positions
}

function explosionPositions(map: Tile[][], origin: [number, number], range: number) {
  const originCell = cellAt(origin)
  const positions: Array<[number, number]> = [centerOf(originCell)]
  for (const direction of DIRECTIONS) {
    const delta = DIR_DELTA[direction]
    for (let step = 1; step <= range; step += 1) {
      const cell: [number, number] = [
        originCell[0] + delta[0] * step,
        originCell[1] + delta[1] * step,
      ]
      const tile = map[cell[0]]?.[cell[1]]
      if (!tile || tile === 'x') break
      positions.push(centerOf(cell))
      if (tile === 'o') map[cell[0]]![cell[1]] = '.'
      if (tile === 'm') {
        map[cell[0]]![cell[1]] = '.'
        break
      }
    }
  }
  return positions
}

function positionInExplosionTile(position: [number, number], explosionCenter: [number, number]) {
  return (
    sameCell(cellAt(position), cellAt(explosionCenter)) ||
    distance(position, explosionCenter) <= 0.86
  )
}

function damageTank(
  state: Omit<HumanDuelState, 'state'>,
  tank: DuelTank,
  crashLog: string,
  death: UnitDeathState,
) {
  if (tank.shieldRemaining > 0) {
    tank.shieldRemaining = 0
    addLog(state, `${tank.name}'s shield blocked a hit`)
    return false
  }
  if (tank.armor > 1) {
    tank.armor -= 1
    addLog(state, `${tank.name}'s armor absorbed a hit`)
    return false
  }
  tank.crashed = true
  tank.velocity = [0, 0]
  tank.death = death
  addLog(state, crashLog)
  return true
}

function killEngineer(engineer: DuelEngineer, death: UnitDeathState) {
  engineer.alive = false
  engineer.velocity = [0, 0]
  engineer.death = death
}

function addSpeech(
  state: Omit<HumanDuelState, 'state'>,
  owner: 0 | 1,
  unitKind: 'tank' | 'engineer',
  unitName: string,
  text: string,
) {
  const body = text.trim().slice(0, 42)
  if (!body) return
  state.speeches = state.speeches.filter(
    (speech) => !(speech.owner === owner && speech.unitKind === unitKind),
  )
  state.speeches.push({
    id: `speech_${state.frame}_${owner}_${unitKind}`,
    owner,
    unitKind,
    unitName,
    text: body,
    remainingFrames: SPEECH_TTL,
  })
}

function fire(state: Omit<HumanDuelState, 'state'>, index: 0 | 1) {
  const tank = state.tanks[index]
  if (tank.fireLocked > 0 || state.bullets.some((bullet) => bullet.owner === index && bullet.alive))
    return

  const headings = [tank.heading]
  if (tank.shotgunLevel > 0) headings.push(tank.heading - 45, tank.heading + 45)
  if (tank.overloadRemaining > 0) headings.push(tank.heading - 18, tank.heading + 18)
  const uniqueHeadings = [
    ...new Set(headings.map((heading) => Math.round(normalizeAngle(heading) * 10) / 10)),
  ]
  for (const heading of uniqueHeadings) {
    const vector = vectorFromAngle(heading)
    state.bullets.push({
      id: `bullet_${state.frame}_${index}_${Math.round(heading * 10)}`,
      owner: index,
      position: [tank.position[0] + vector[0] * 0.42, tank.position[1] + vector[1] * 0.42],
      heading: normalizeAngle(heading),
      direction: directionFromAngle(heading),
      alive: true,
      age: 0,
    })
  }
  tank.fireLocked = FIRE_LOCK_FRAMES
}

function castSkill(state: Omit<HumanDuelState, 'state'>, index: 0 | 1) {
  const tank = state.tanks[index]
  const enemy = state.tanks[otherIndex(index)]
  if (tank.cooldown > 0) return
  tank.cooldown = SKILL_COOLDOWNS[tank.skillType]
  addLog(state, `${tank.name} used ${tank.skillType}`)
  switch (tank.skillType) {
    case 'shield':
      tank.shieldRemaining = 54
      break
    case 'freeze':
      enemy.freezeRemaining = 30
      break
    case 'stun':
      enemy.stunRemaining = 42
      break
    case 'overload':
      tank.overloadRemaining = 54
      break
    case 'cloak':
      tank.cloakRemaining = 54
      break
    case 'poison':
      enemy.poisonRemaining = 54
      break
    case 'teleport':
      teleport(state, index)
      break
    case 'boost':
      tank.boostRemaining = 42
      break
  }
}

function teleport(state: Omit<HumanDuelState, 'state'>, index: 0 | 1) {
  const tank = state.tanks[index]
  const enemy = state.tanks[otherIndex(index)]
  const candidates = [
    state.flag,
    state.star,
    add(enemy.position, [1.8, 0]),
    add(enemy.position, [-1.8, 0]),
    add(enemy.position, [0, 1.8]),
    add(enemy.position, [0, -1.8]),
  ].filter(Boolean) as [number, number][]
  const target = candidates.find((position) => canTankOccupy(state, position, enemy.position))
  if (target) tank.position = [...target]
}

function moveBullets(state: Omit<HumanDuelState, 'state'>) {
  for (const bullet of state.bullets) {
    if (!bullet.alive) continue
    bullet.age += 1
    const from = [...bullet.position] as [number, number]
    const vector = vectorFromAngle(bullet.heading)
    const next: [number, number] = [
      bullet.position[0] + vector[0] * BULLET_SPEED,
      bullet.position[1] + vector[1] * BULLET_SPEED,
    ]
    const tile = tileAt(state.map, next)
    if (!tile || tile === 'x' || bullet.age > BULLET_TTL) {
      bullet.alive = false
      continue
    }
    if (tile === 'm') {
      const cell = cellAt(next)
      if (state.map[cell[0]]?.[cell[1]]) state.map[cell[0]]![cell[1]] = '.'
      bullet.alive = false
      continue
    }
    const triggeredBomb = state.bombs.find(
      (bomb) => pointToSegmentDistance(bomb.position, from, next) <= 0.42,
    )
    if (triggeredBomb) {
      bullet.alive = false
      detonateBombs(state, [triggeredBomb])
      continue
    }
    const targetIndex = bullet.owner === 0 ? 1 : 0
    const target = state.tanks[targetIndex]
    if (
      !target.crashed &&
      sweptCircleHit(from, next, target.position, TANK_RADIUS + BULLET_RADIUS)
    ) {
      bullet.alive = false
      damageTank(
        state,
        target,
        `${state.tanks[bullet.owner === 0 ? 0 : 1].name} landed a direct hit`,
        {
          cause: 'bullet',
          by: bullet.owner,
          frame: state.frame,
          detail: bullet.id,
        },
      )
      continue
    }
    const engineer = state.engineers[targetIndex]
    if (
      engineer.alive &&
      sweptCircleHit(from, next, engineer.position, ENGINEER_RADIUS + BULLET_RADIUS + 0.05)
    ) {
      killEngineer(engineer, {
        cause: 'bullet',
        by: bullet.owner,
        frame: state.frame,
        detail: bullet.id,
      })
      bullet.alive = false
      addLog(state, `${state.tanks[bullet.owner]!.name} hit ${engineer.name}`)
      continue
    }
    bullet.position = next
  }
  for (let i = 0; i < state.bullets.length; i += 1) {
    const a = state.bullets[i]!
    if (!a.alive) continue
    for (let j = i + 1; j < state.bullets.length; j += 1) {
      const b = state.bullets[j]!
      if (!b.alive || a.owner === b.owner) continue
      if (distance(a.position, b.position) <= BULLET_RADIUS * 2.2) {
        a.alive = false
        b.alive = false
        state.bulletClashes += 1
        addLog(state, `Shells canceled each other out`)
      }
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.alive)
}

function collectStar(state: Omit<HumanDuelState, 'state'>) {
  if (!state.star) return
  state.tanks.forEach((tank, index) => {
    if (!state.star || tank.crashed || distance(tank.position, state.star) > STAR_PICKUP_RADIUS)
      return
    tank.stars += 1
    if (tank.stars === 1) {
      tank.shotgunLevel = 1
      addLog(state, `${tank.name} collected a star and unlocked shotgun shells`)
    } else {
      tank.armor += 1
      addLog(state, `${tank.name} collected a star and reinforced armor`)
    }
    tank.powerGlowRemaining = STAR_POWER_GLOW_FRAMES
    state.star = null
  })
  state.engineers.forEach((engineer) => {
    if (
      !state.star ||
      !engineer.alive ||
      distance(engineer.position, state.star) > STAR_PICKUP_RADIUS
    )
      return
    engineer.starUpgrades += 1
    if (engineer.starUpgrades % 2 === 1) {
      engineer.maxBombs = Math.min(MAX_ENGINEER_BOMBS, engineer.maxBombs + 1)
      addLog(state, `${engineer.name} upgraded bomb count to ${engineer.maxBombs}`)
    } else {
      engineer.bombRange = Math.min(MAX_BOMB_RANGE, engineer.bombRange + 1)
      addLog(state, `${engineer.name} upgraded bomb range to ${engineer.bombRange}`)
    }
    engineer.powerGlowRemaining = STAR_POWER_GLOW_FRAMES
    state.star = null
  })
}

function collectFlag(state: Omit<HumanDuelState, 'state'>) {
  if (!state.flag) return
  state.tanks.forEach((tank, index) => {
    if (!state.flag || tank.crashed || distance(tank.position, state.flag) > FLAG_PICKUP_RADIUS)
      return
    scoreFlag(state, index as 0 | 1, tank.name)
  })
  state.engineers.forEach((engineer) => {
    if (
      !state.flag ||
      !engineer.alive ||
      distance(engineer.position, state.flag) > FLAG_PICKUP_RADIUS
    )
      return
    scoreFlag(state, engineer.owner, engineer.name)
  })
}

function scoreFlag(state: Omit<HumanDuelState, 'state'>, side: 0 | 1, collectorName: string) {
  state.flagScores[side] += 1
  state.flag = null
  addLog(state, `${collectorName} captured a flag`)
  if (state.flagScores[side] >= FLAG_TARGET) {
    state.status = 'settled'
    state.result = { winner: side === 0 ? 'human' : 'agent', reason: 'flags' }
  }
}

function settleIfNeeded(state: Omit<HumanDuelState, 'state'>) {
  if (state.status === 'settled') return
  const humanDefeated = sideDefeated(state, 0)
  const agentDefeated = sideDefeated(state, 1)
  if (humanDefeated || agentDefeated) {
    if (humanDefeated && agentDefeated) state.result = { winner: 'draw', reason: 'crashed' }
    else state.result = { winner: humanDefeated ? 'agent' : 'human', reason: 'crashed' }
    state.status = 'settled'
    return
  }
  if (state.frame >= state.maxFrames) {
    const [humanFlags, agentFlags] = state.flagScores
    const winner = humanFlags === agentFlags ? 'draw' : humanFlags > agentFlags ? 'human' : 'agent'
    state.result = { winner, reason: winner === 'draw' ? 'draw' : 'flags' }
    state.status = 'settled'
  }
}

function sideDefeated(state: Omit<HumanDuelState, 'state'>, side: 0 | 1) {
  return state.tanks[side].crashed && !state.engineers[side].alive
}

function tickDown(state: Omit<HumanDuelState, 'state'>) {
  for (const tank of state.tanks) {
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
  for (const engineer of state.engineers) {
    engineer.bombCooldown = Math.max(0, engineer.bombCooldown - 1)
    engineer.powerGlowRemaining = Math.max(0, engineer.powerGlowRemaining - 1)
  }
}

function tickSpeeches(state: Omit<HumanDuelState, 'state'>) {
  state.speeches = state.speeches
    .map((speech) => ({ ...speech, remainingFrames: speech.remainingFrames - 1 }))
    .filter((speech) => speech.remainingFrames > 0)
}

function updateTankStuckCounters(state: Omit<HumanDuelState, 'state'>) {
  for (const tank of state.tanks) {
    if (tank.crashed) {
      tank.stuckFrames = 0
      continue
    }
    if (distance(tank.lastPosition, tank.position) < 0.018 && tank.driveIntent) {
      tank.stuckFrames += 1
    } else if (distance(tank.lastPosition, tank.position) > 0.03) {
      tank.stuckFrames = 0
    }
  }
}

function hasStrategyCode(code: string) {
  return code.trim().length > 0
}

function scriptedAgentActions(state: HumanDuelState, scripted: DuelAction[]): DuelAction[] {
  return scripted
    .map((action) => resolveScriptedTargetAction(state, action))
    .filter((action): action is DuelAction => Boolean(action))
    .filter((action) => scriptedActionCanExecute(state, action))
    .slice(0, 4)
}

function resolveScriptedTargetAction(state: HumanDuelState, action: DuelAction): DuelAction | null {
  if (action.type === 'drive' && action.target) {
    const tank = state.tanks[1]
    const target: [number, number] = [Math.trunc(action.x), Math.trunc(action.y)]
    const pathPoint = nextPathPoint(state, tank.position, target, state.tanks[0].position, 1)
    if (!pathPoint) return null
    const vector = subtract(pathPoint, tank.position)
    return { type: 'drive', x: vector[0], y: vector[1] }
  }
  if (action.type === 'engineerDrive' && action.target) {
    const engineer = state.engineers[1]
    if (!engineer.alive) return null
    const target: [number, number] = [Math.trunc(action.x), Math.trunc(action.y)]
    const pathPoint = nextEngineerPathPoint(
      state,
      engineer.position,
      target,
      state.engineers[0].position,
    )
    if (!pathPoint) return null
    const vector = subtract(pathPoint, engineer.position)
    return { type: 'engineerDrive', x: vector[0], y: vector[1] }
  }
  return action
}

function scriptedActionCanExecute(state: HumanDuelState, action: DuelAction) {
  const agent = state.tanks[1]
  if (action.type === 'fire') {
    return agent.fireLocked === 0 && !state.bullets.some((bullet) => bullet.owner === 1)
  }
  if (action.type === 'aim' || action.type === 'turn') return true
  if (action.type === 'go') return canMoveVector(state, 1, vectorFromAngle(agent.heading))
  if (action.type === 'move') return canMoveVector(state, 1, DIR_DELTA[action.direction])
  if (action.type === 'drive') return canMoveVector(state, 1, [action.x, action.y])
  if (action.type === 'engineerMove')
    return canMoveEngineerVector(state, 1, DIR_DELTA[action.direction])
  if (action.type === 'engineerDrive') return canMoveEngineerVector(state, 1, [action.x, action.y])
  if (action.type === 'engineerBomb') {
    const engineer = state.engineers[1]
    const activeBombs = state.bombs.filter((bomb) => bomb.owner === 1).length
    return (
      engineer.bombCooldown === 0 &&
      activeBombs < engineer.maxBombs &&
      canPlaceBombOnTile(state.map, cellAt(engineer.position))
    )
  }
  if (action.type === 'skill') {
    return agent.cooldown === 0
  }
  if (action.type === 'tankSpeak' || action.type === 'engineerSpeak') return true
  return true
}

function fallbackAgentActions(state: HumanDuelState): DuelAction[] {
  return combineActions(fallbackTankActions(state, 1), fallbackEngineerAction(state, 1))
}

function fallbackTankActions(state: HumanDuelState, index: 0 | 1): DuelAction[] {
  const tank = state.tanks[index]
  const enemy = state.tanks[otherIndex(index)]
  if (tank.crashed) return []

  const dodgeBomb = dodgeBombAction(state, index)
  if (dodgeBomb) return [dodgeBomb]

  const dodge = dodgeBulletAction(state, index)
  if (dodge) return [dodge]

  const enemyVisible = !isTankHiddenFromAgent(state, enemy, tank)
  const enemyEngineer = state.engineers[otherIndex(index)]
  const engineerVisible =
    enemyEngineer.alive && !isEngineerHiddenFromAgent(state, enemyEngineer, tank)

  const enemyShotAngle = enemyVisible ? clearShotAngle(state, tank.position, enemy.position) : null
  const engineerShotAngle = engineerVisible
    ? clearShotAngle(state, tank.position, enemyEngineer.position)
    : null
  const objectiveTarget = state.flag ?? state.star
  if (objectiveTarget) return [driveTowardPoint(state, index, objectiveTarget)]

  const pressureEngineer =
    engineerVisible &&
    (!enemyVisible ||
      (enemyShotAngle === null &&
        engineerShotAngle !== null &&
        distance(tank.position, enemyEngineer.position) < 6) ||
      distance(tank.position, enemyEngineer.position) + 1.4 <
        distance(tank.position, enemy.position))
  const combatTarget = pressureEngineer
    ? enemyEngineer.position
    : enemyVisible
      ? enemy.position
      : null
  const shotAngle = pressureEngineer ? engineerShotAngle : enemyShotAngle
  const skill = tacticalSkillAction(state, index, enemyVisible)
  if (skill) return [skill]
  if (shotAngle !== null) {
    const canFireNow =
      tank.fireLocked === 0 &&
      !state.bullets.some((bullet) => bullet.owner === index && bullet.alive)
    if (tank.cooldown === 0 && tank.skillType === 'overload' && enemy.shieldRemaining <= 0)
      return [{ type: 'skill' }]
    if (
      angleDistance(tank.heading, shotAngle) <= SHOT_ALIGNMENT_DEGREES &&
      canFireNow &&
      enemy.shieldRemaining <= 0
    )
      return [{ type: 'fire' }]
    return [{ type: 'aim', angle: shotAngle }]
  }

  if (combatTarget) return [driveTowardPoint(state, index, combatTarget)]

  const roam = bestOpenNeighborVector(state, index, tank.position, enemy.position)
  return roam ? [{ type: 'drive', x: roam[0], y: roam[1] }] : [{ type: 'turn', side: 'right' }]
}

function combineActions(tankActions: DuelAction[], engineerAction: DuelAction | null) {
  return engineerAction ? [...tankActions, engineerAction] : tankActions
}

function fallbackEngineerAction(state: HumanDuelState, index: 0 | 1): DuelAction | null {
  const engineer = state.engineers[index]
  if (!engineer.alive) return null
  const enemyTank = state.tanks[otherIndex(index)]
  const enemyEngineer = state.engineers[otherIndex(index)]
  const visibleEnemy = !isTankHiddenFromAgent(state, enemyTank, state.tanks[index])
  const activeBombs = state.bombs.filter((bomb) => bomb.owner === index).length
  const combatTarget =
    visibleEnemy && !enemyTank.crashed
      ? enemyTank.position
      : enemyEngineer.alive
        ? enemyEngineer.position
        : null
  const target = state.flag ?? state.star ?? combatTarget
  const bombPosition = centerOf(cellAt(engineer.position))
  const plannedBlast = explosionPositions(
    state.map.map((column) => [...column]),
    bombPosition,
    engineer.bombRange,
  )
  const canPlantBomb =
    !state.tanks[index].crashed &&
    engineer.bombCooldown === 0 &&
    activeBombs < engineer.maxBombs &&
    canPlaceBombOnTile(state.map, cellAt(engineer.position)) &&
    !bombWouldThreatenOwnTank(state, index, engineer.position, engineer.bombRange) &&
    !plannedBombCanBeTriggeredBeforeEscape(state, index, bombPosition)
  const combatBomb = combatTarget
    ? plannedBlast.some((position) => positionInExplosionTile(combatTarget, position))
    : false
  const terrainBomb = bombWouldOpenSoftTerrain(state, engineer.position, engineer.bombRange)

  if (canPlantBomb && (combatBomb || terrainBomb)) {
    return { type: 'engineerBomb' }
  }
  if (!target) return null
  return driveEngineerTowardPoint(state, index, target)
}

function bombWouldOpenSoftTerrain(
  state: Pick<HumanDuelState, 'map'>,
  origin: [number, number],
  range: number,
) {
  const originCell = cellAt(origin)
  for (const direction of DIRECTIONS) {
    const delta = DIR_DELTA[direction]
    for (let step = 1; step <= range; step += 1) {
      const cell: [number, number] = [
        originCell[0] + delta[0] * step,
        originCell[1] + delta[1] * step,
      ]
      const tile = state.map[cell[0]]?.[cell[1]]
      if (!tile || tile === 'x') break
      if (tile === 'm') return true
    }
  }
  return false
}

function bombWouldThreatenOwnTank(
  state: HumanDuelState,
  index: 0 | 1,
  origin: [number, number],
  range: number,
) {
  const positions = explosionPositions(
    state.map.map((column) => [...column]),
    centerOf(cellAt(origin)),
    range,
  )
  return positions.some((position) =>
    positionInExplosionTile(state.tanks[index].position, position),
  )
}

function plannedBombCanBeTriggeredBeforeEscape(
  state: HumanDuelState,
  index: 0 | 1,
  position: [number, number],
) {
  const enemyIndex = otherIndex(index)
  if (
    state.bullets.some((bullet) => bullet.alive && bulletWillReachPosition(state, bullet, position))
  ) {
    return true
  }

  const enemy = state.tanks[enemyIndex]
  const contactAngle = clearShotAngle(state, enemy.position, position)
  if (
    !enemy.crashed &&
    contactAngle !== null &&
    distance(enemy.position, position) <= 2.2 &&
    angleDistance(enemy.heading, contactAngle) <= SHOT_ALIGNMENT_DEGREES
  ) {
    return true
  }

  if (enemy.crashed || enemy.fireLocked > 0) return false
  if (state.bullets.some((bullet) => bullet.owner === enemyIndex && bullet.alive)) return false

  const shotAngle = clearShotAngle(state, enemy.position, position)
  return shotAngle !== null && angleDistance(enemy.heading, shotAngle) <= SHOT_ALIGNMENT_DEGREES
}

function bulletWillReachPosition(
  state: HumanDuelState,
  bullet: DuelBullet,
  target: [number, number],
) {
  const vector = vectorFromAngle(bullet.heading)
  const toTarget = subtract(target, bullet.position)
  const along = dot(toTarget, vector)
  const lateral = Math.abs(cross(toTarget, vector))
  if (along <= 0 || lateral > 0.38 || !lineOfFireClear(state.map, bullet.position, target)) {
    return false
  }
  return sampleLine(bullet.position, target, 0.2)
    .slice(1, -1)
    .every((point) => !state.bombs.some((bomb) => distance(bomb.position, point) <= 0.42))
}

function nearestSafeTarget(state: HumanDuelState, index: 0 | 1, target: [number, number]) {
  if (canTankOccupySafely(state, index, target)) return target

  const targetCell = cellAt(target)
  const candidates: [number, number][] = []
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
        candidates.push(centerOf([targetCell[0] + dx, targetCell[1] + dy]))
      }
    }
    const safe = candidates
      .filter((position) => canTankOccupySafely(state, index, position))
      .sort(
        (a, b) =>
          distance(state.tanks[index].position, a) +
          distance(target, a) * 0.4 -
          (distance(state.tanks[index].position, b) + distance(target, b) * 0.4),
      )[0]
    if (safe) return safe
  }
  return target
}

function canTankOccupySafely(state: HumanDuelState, index: 0 | 1, position: [number, number]) {
  return (
    canTankOccupy(state, position, state.tanks[otherIndex(index)].position) &&
    !tankBombDangerAt(state, position)
  )
}

function tankBombDangerAt(state: HumanDuelState, position: [number, number]) {
  return tankBombDangerScore(state, position) > 0
}

function tankBombDangerScore(state: HumanDuelState, position: [number, number]) {
  let score = 0
  for (const explosion of state.explosions) {
    const nearest = nearestPositionDistance(explosion.positions, position)
    if (explosion.positions.some((point) => positionInExplosionTile(position, point))) {
      score += BOMB_TILE_DANGER * 2 + Math.max(0, BOMB_NEAR_DANGER_RADIUS - nearest) * 12
    }
  }

  for (const bomb of state.bombs) {
    const positions = bombBlastPositions(state, bomb)
    const nearest = nearestPositionDistance(positions, position)
    const inBlast = positions.some((point) => positionInExplosionTile(position, point))
    if (inBlast) {
      const urgency =
        bomb.remainingFrames <= TANK_DODGE_LOOKAHEAD_FRAMES
          ? 55
          : Math.max(0, BOMB_FUSE_FRAMES - bomb.remainingFrames) * 0.45
      score += BOMB_TILE_DANGER + urgency + Math.max(0, BOMB_NEAR_DANGER_RADIUS - nearest) * 10
    } else if (nearest < BOMB_NEAR_DANGER_RADIUS) {
      score += (BOMB_NEAR_DANGER_RADIUS - nearest) * 8
    }
  }
  return score
}

function distanceToNearestBombHazard(state: HumanDuelState, position: [number, number]) {
  const hazardPositions = [
    ...state.explosions.flatMap((explosion) => explosion.positions),
    ...state.bombs.flatMap((bomb) => bombBlastPositions(state, bomb)),
  ]
  if (!hazardPositions.length) return 8
  return nearestPositionDistance(hazardPositions, position)
}

function nearestPositionDistance(positions: Array<[number, number]>, position: [number, number]) {
  return Math.min(...positions.map((point) => distance(point, position)))
}

function bombBlastPositions(state: Pick<HumanDuelState, 'map'>, bomb: DuelBomb) {
  return explosionPositions(
    state.map.map((column) => [...column]),
    bomb.position,
    bomb.range,
  )
}

function candidateDriveVectors(): [number, number][] {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]
}

function tacticalSkillAction(
  state: HumanDuelState,
  index: 0 | 1,
  enemyVisible: boolean,
): DuelAction | null {
  const tank = state.tanks[index]
  const enemy = state.tanks[otherIndex(index)]
  if (tank.cooldown > 0) return null
  if (tank.skillType === 'boost' && (state.flag || state.star)) return { type: 'skill' }
  if (
    enemyVisible &&
    (tank.skillType === 'freeze' || tank.skillType === 'stun' || tank.skillType === 'poison') &&
    distance(tank.position, enemy.position) <= 4.8
  ) {
    return { type: 'skill' }
  }
  return null
}

function driveTowardPoint(
  state: HumanDuelState,
  index: 0 | 1,
  target: [number, number],
): DuelAction {
  const tank = state.tanks[index]
  const safeTarget = nearestSafeTarget(state, index, target)
  const directVector = subtract(safeTarget, tank.position)
  if (
    tankLineWalkable(state, index, tank.position, safeTarget) &&
    canMoveTankVectorSafely(state, index, directVector)
  ) {
    return { type: 'drive', x: directVector[0], y: directVector[1] }
  }

  const pathPoint = nextPathPoint(
    state,
    tank.position,
    safeTarget,
    state.tanks[otherIndex(index)].position,
    index,
  )
  const vector = pathPoint
    ? routedTankVector(state, index, pathPoint)
    : (bestOpenNeighborVector(state, index, tank.position, safeTarget) ?? directVector)
  return { type: 'drive', x: vector[0], y: vector[1] }
}

function routedTankVector(
  state: HumanDuelState,
  index: 0 | 1,
  pathPoint: [number, number],
): [number, number] {
  const tank = state.tanks[index]
  const primary = dominantAxisVector(tank.position, pathPoint)
  if (primary && canMoveTankVectorSafely(state, index, primary)) return primary

  const centerVector = subtract(centerOf(cellAt(tank.position)), tank.position)
  if (
    Math.hypot(centerVector[0], centerVector[1]) > 0.04 &&
    canMoveTankVectorSafely(state, index, centerVector)
  ) {
    return centerVector
  }

  const waypointVector = subtract(pathPoint, tank.position)
  if (canMoveTankVectorSafely(state, index, waypointVector)) return waypointVector
  return bestOpenNeighborVector(state, index, tank.position, pathPoint) ?? waypointVector
}

function dominantAxisVector(from: [number, number], to: [number, number]): [number, number] | null {
  const delta = subtract(to, from)
  if (Math.abs(delta[0]) < 0.04 && Math.abs(delta[1]) < 0.04) return null
  if (Math.abs(delta[0]) >= Math.abs(delta[1])) return [Math.sign(delta[0]), 0]
  return [0, Math.sign(delta[1])]
}

function driveEngineerTowardPoint(
  state: HumanDuelState,
  index: 0 | 1,
  target: [number, number],
): DuelAction {
  const engineer = state.engineers[index]
  const directVector = subtract(target, engineer.position)
  if (engineerLineWalkable(state, engineer.position, target)) {
    return { type: 'engineerDrive', x: directVector[0], y: directVector[1] }
  }

  const pathPoint = nextEngineerPathPoint(
    state,
    engineer.position,
    target,
    state.engineers[otherIndex(index)].position,
  )
  const vector = pathPoint ? subtract(pathPoint, engineer.position) : directVector
  return { type: 'engineerDrive', x: vector[0], y: vector[1] }
}

function dodgeBulletAction(state: HumanDuelState, index: 0 | 1): DuelAction | null {
  const tank = state.tanks[index]
  const threat = state.bullets
    .filter((bullet) => bullet.owner === otherIndex(index) && bullet.alive)
    .map((bullet) => ({ bullet, score: bulletThreatScore(bullet, tank.position) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]
  if (!threat) return null

  const bulletVector = vectorFromAngle(threat.bullet.heading)
  const candidates: [number, number][] = [
    [-bulletVector[1], bulletVector[0]],
    [bulletVector[1], -bulletVector[0]],
  ]
  const safe = candidates.find((vector) => canMoveTankVectorSafely(state, index, vector))
  return safe ? { type: 'drive', x: safe[0], y: safe[1] } : null
}

function dodgeBombAction(state: HumanDuelState, index: 0 | 1): DuelAction | null {
  const tank = state.tanks[index]
  const currentDanger = tankBombDangerScore(state, tank.position)
  if (currentDanger <= 0) return null

  const candidates = candidateDriveVectors()
    .map((vector) => {
      const nextPosition = projectedTankPosition(state, index, vector)
      if (!canTankOccupy(state, nextPosition, state.tanks[otherIndex(index)].position)) return null
      const nextDanger = tankBombDangerScore(state, nextPosition)
      if (nextDanger >= currentDanger && nextDanger > 0) return null
      return {
        vector,
        score:
          currentDanger -
          nextDanger +
          distanceToNearestBombHazard(state, nextPosition) * 0.35 +
          openNeighborCount(state.map, cellAt(nextPosition)) * 0.08,
      }
    })
    .filter((item): item is { vector: [number, number]; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)

  const best = candidates[0]?.vector
  return best ? { type: 'drive', x: best[0], y: best[1] } : null
}

function bulletThreatScore(bullet: DuelBullet, target: [number, number]) {
  const vector = vectorFromAngle(bullet.heading)
  const toTarget = subtract(target, bullet.position)
  const along = dot(toTarget, vector)
  const lateral = Math.abs(cross(toTarget, vector))
  if (along <= 0 || along > 3.8 || lateral > TANK_RADIUS + BULLET_RADIUS) return 0
  return 4 - along + (TANK_RADIUS + BULLET_RADIUS - lateral)
}

function canMoveVector(state: HumanDuelState, index: 0 | 1, rawVector: [number, number]) {
  const tank = state.tanks[index]
  const opponent = state.tanks[otherIndex(index)]
  const vector = normalizeVector(rawVector)
  if (!vector) return false
  const speed = tankMoveSpeed(tank)
  return canTankOccupy(
    state,
    [tank.position[0] + vector[0] * speed, tank.position[1] + vector[1] * speed],
    opponent.position,
  )
}

function canMoveTankVectorSafely(state: HumanDuelState, index: 0 | 1, rawVector: [number, number]) {
  const vector = normalizeVector(rawVector)
  if (!vector) return false
  return canTankOccupySafely(state, index, projectedTankPosition(state, index, vector))
}

function projectedTankPosition(
  state: HumanDuelState,
  index: 0 | 1,
  vector: [number, number],
): [number, number] {
  const tank = state.tanks[index]
  const speed = tankMoveSpeed(tank)
  return [tank.position[0] + vector[0] * speed, tank.position[1] + vector[1] * speed]
}

function canMoveEngineerVector(state: HumanDuelState, index: 0 | 1, rawVector: [number, number]) {
  const engineer = state.engineers[index]
  const vector = normalizeVector(rawVector)
  if (!engineer.alive || !vector) return false
  return canEngineerOccupy(
    state,
    [
      engineer.position[0] + vector[0] * ENGINEER_SPEED,
      engineer.position[1] + vector[1] * ENGINEER_SPEED,
    ],
    index,
    engineer.position,
  )
}

function clearShotAngle(
  state: Pick<HumanDuelState, 'map'>,
  from: [number, number],
  to: [number, number],
) {
  if (distance(from, to) < 0.8) return null
  return lineOfFireClear(state.map, from, to) ? angleFromVector(subtract(to, from)) : null
}

function tankLineWalkable(
  state: HumanDuelState,
  index: 0 | 1,
  from: [number, number],
  to: [number, number],
) {
  const opponent = state.tanks[otherIndex(index)]
  const targetCell = cellAt(to)
  const opponentCell = cellAt(opponent.position)
  return sampleLine(from, to, 0.18).every((point, pointIndex, points) => {
    if (pointIndex === points.length - 1 && sameCell(targetCell, opponentCell)) return false
    return canTankOccupySafely(state, index, point)
  })
}

function nextPathPoint(
  state: HumanDuelState,
  start: [number, number],
  target: [number, number],
  blocked: [number, number],
  index: 0 | 1,
): [number, number] | null {
  return nextAStarPathPoint({
    state,
    start,
    target,
    blocked,
    canEnterCell: (cell, startCell) => canTankEnterPathCell(state, index, cell, blocked, startCell),
  })
}

function nextEngineerPathPoint(
  state: HumanDuelState,
  start: [number, number],
  target: [number, number],
  blocked: [number, number],
): [number, number] | null {
  return nextAStarPathPoint({
    state,
    start,
    target,
    blocked,
    canEnterCell: (cell, startCell) => isEngineerOpenCell(state, cell, startCell),
  })
}

function nextAStarPathPoint(input: {
  state: HumanDuelState
  start: [number, number]
  target: [number, number]
  blocked: [number, number]
  canEnterCell: (cell: [number, number], startCell: [number, number]) => boolean
}): [number, number] | null {
  const { state, start, target, blocked, canEnterCell } = input
  const startCell = cellAt(start)
  const targetCell = cellAt(target)
  const targetCells = pathTargetCells(state, targetCell, cellAt(blocked), startCell, canEnterCell)
  if (!targetCells.length) return null
  const targetKeys = new Set(targetCells.map(positionKey))
  const startKey = positionKey(startCell)
  const bestCost = new Map([[startKey, 0]])
  const open: Array<{
    cell: [number, number]
    first: [number, number] | null
    g: number
    h: number
  }> = [{ cell: startCell, first: null, g: 0, h: pathHeuristic(startCell, targetCells) }]

  while (open.length) {
    open.sort((a, b) => a.g + a.h - (b.g + b.h) || a.h - b.h)
    const current = open.shift()!
    if (targetKeys.has(positionKey(current.cell)))
      return current.first ? centerOf(current.first) : null

    for (const direction of DIRECTIONS) {
      const delta = DIR_DELTA[direction]
      const next: [number, number] = [current.cell[0] + delta[0], current.cell[1] + delta[1]]
      const key = positionKey(next)
      if (!canEnterCell(next, startCell)) continue
      const g = current.g + 1
      if ((bestCost.get(key) ?? Number.POSITIVE_INFINITY) <= g) continue
      bestCost.set(key, g)
      const first = current.first ?? next
      open.push({ cell: next, first, g, h: pathHeuristic(next, targetCells) })
    }
  }
  return null
}

function pathTargetCells(
  state: HumanDuelState,
  targetCell: [number, number],
  blockedCell: [number, number],
  startCell: [number, number],
  canEnterCell: (cell: [number, number], startCell: [number, number]) => boolean,
) {
  if (!sameCell(targetCell, blockedCell) && canEnterCell(targetCell, startCell)) {
    return [targetCell]
  }
  return DIRECTIONS.map((direction) => {
    const delta = DIR_DELTA[direction]
    return [targetCell[0] + delta[0], targetCell[1] + delta[1]] as [number, number]
  })
    .filter((cell) => !sameCell(cell, blockedCell) && canEnterCell(cell, startCell))
    .sort(
      (a, b) =>
        distance(centerOf(a), centerOf(targetCell)) - distance(centerOf(b), centerOf(targetCell)),
    )
}

function pathHeuristic(cell: [number, number], targets: [number, number][]) {
  return Math.min(
    ...targets.map((target) => Math.abs(cell[0] - target[0]) + Math.abs(cell[1] - target[1])),
  )
}

function canTankEnterPathCell(
  state: HumanDuelState,
  index: 0 | 1,
  cell: [number, number],
  blocked: [number, number],
  startCell: [number, number],
) {
  return (
    isOpenTile(state.map, cell) &&
    !sameCell(cell, cellAt(blocked)) &&
    canTankOccupy(state, centerOf(cell), blocked) &&
    (sameCell(cell, startCell) || !tankBombDangerAt(state, centerOf(cell)))
  )
}

function bestOpenNeighborVector(
  state: HumanDuelState,
  index: 0 | 1,
  position: [number, number],
  target: [number, number],
): [number, number] | null {
  const current = cellAt(position)
  const blocked = state.tanks[otherIndex(index)].position
  const options = candidateDriveVectors()
    .map((vector) => {
      const nextPosition = projectedTankPosition(state, index, vector)
      const cell = cellAt(nextPosition)
      if (!isOpenTile(state.map, cell) || sameCell(cell, cellAt(blocked))) return null
      if (!canTankOccupySafely(state, index, nextPosition)) return null
      const nextDistance = distance(nextPosition, target)
      const currentDistance = distance(position, target)
      const tank = state.tanks[index]
      const heading = vectorFromAngle(tank.heading)
      const repeatPenalty =
        tank.stuckFrames >= 8 && dot(vector, heading) > 0.7
          ? Math.min(1.4, tank.stuckFrames * 0.08)
          : 0
      const stuckJitter = tank.stuckFrames >= 8 ? Math.random() * 0.42 : 0
      return {
        vector,
        score:
          (currentDistance - nextDistance) * 4.8 +
          openNeighborCount(state.map, cell) * 0.18 +
          dot(vector, heading) * 0.12 -
          tankBombDangerScore(state, nextPosition) * 1.4 -
          (sameCell(cell, current) ? 0.22 : 0) -
          repeatPenalty +
          stuckJitter,
      }
    })
    .filter((option): option is { vector: [number, number]; score: number } => Boolean(option))
    .sort((a, b) => b.score - a.score)
  return options[0]?.vector ?? null
}

function createAgentSnapshot(state: HumanDuelState) {
  const agent = state.tanks[1]
  const human = state.tanks[0]
  const agentEngineer = state.engineers[1]
  const humanEngineer = state.engineers[0]
  const humanHidden = isTankHiddenFromAgent(state, human, agent)
  const humanEngineerHidden = isEngineerHiddenFromAgent(state, humanEngineer, agent)
  return {
    me: {
      tank: publicTank(agent),
      engineer: publicEngineer(agentEngineer, state.map),
      stars: agent.stars,
      bullet: visibleBullet(state.bullets, 1),
      skill: publicSkill(agent),
      effects: publicEffects(agent),
      status: publicStatus(agent, state.map),
    },
    enemy: {
      tank: humanHidden ? null : publicTank(human),
      engineer: humanEngineerHidden ? null : publicEngineer(humanEngineer, state.map),
      bullet: visibleBullet(state.bullets, 0),
      skill: humanHidden ? null : publicSkill(human),
      effects: humanHidden ? { self: null, debuff: null } : publicEffects(human),
      status: humanHidden ? hiddenStatus() : publicStatus(human, state.map),
    },
    game: {
      map: state.map.map((column) => [...column]),
      star: state.star ? [...state.star] : null,
      flag: state.flag ? [...state.flag] : null,
      flagScores: [...state.flagScores] as [number, number],
      frames: state.frame,
    },
  }
}

function hiddenStatus(): RuntimeTankState['status'] {
  return {
    shielded: false,
    cloaked: false,
    boosted: false,
    overloaded: false,
    frozen: false,
    stunned: false,
    poisoned: false,
    fireLocked: false,
    actionSpeed: 1,
    canActThisFrame: false,
  }
}

function sanitizeActions(actions: DuelAction[]) {
  return actions
    .filter((action): action is DuelAction => {
      if (!action || typeof action !== 'object') return false
      if (
        action.type === 'go' ||
        action.type === 'fire' ||
        action.type === 'skill' ||
        action.type === 'engineerBomb'
      )
        return true
      if (action.type === 'move') return DIRECTIONS.includes(action.direction)
      if (action.type === 'engineerMove') return DIRECTIONS.includes(action.direction)
      if (action.type === 'drive')
        return (
          Number.isFinite(action.x) &&
          Number.isFinite(action.y) &&
          Boolean(normalizeVector([action.x, action.y]))
        )
      if (action.type === 'engineerDrive')
        return (
          Number.isFinite(action.x) &&
          Number.isFinite(action.y) &&
          Boolean(normalizeVector([action.x, action.y]))
        )
      if (action.type === 'aim') return Number.isFinite(action.angle)
      if (action.type === 'tankSpeak' || action.type === 'engineerSpeak') {
        return typeof action.text === 'string' && action.text.trim().length > 0
      }
      return action.type === 'turn' && (action.side === 'left' || action.side === 'right')
    })
    .slice(0, 3)
}

function withFrameState(state: Omit<HumanDuelState, 'state'>): HumanDuelState {
  return { ...state, state: buildFrameState(state) }
}

function buildFrameState(state: Omit<HumanDuelState, 'state'>): BattleFrameState {
  return {
    tanks: state.tanks.map((tank) => ({
      id: tank.id,
      name: tank.name,
      position: [...tank.position],
      direction: tank.direction,
      headingDegrees: tank.heading,
      crashed: tank.crashed,
      stars: tank.stars,
      shotgunLevel: tank.shotgunLevel,
      armor: tank.armor,
      skillType: tank.skillType,
      status: publicStatus(tank, state.map),
      death: tank.death,
    })),
    engineers: state.engineers.map((engineer) => publicEngineer(engineer, state.map)),
    bullets: state.bullets.map(publicBullet),
    bombs: state.bombs.map(publicBomb),
    explosions: state.explosions.map(publicExplosion),
    star: state.star ? [...state.star] : null,
    flag: state.flag ? [...state.flag] : null,
    flagScores: [...state.flagScores] as [number, number],
    bulletClashes: state.bulletClashes,
    speeches: publicSpeeches(state),
    scoreboard: buildScoreboard(state),
    map: state.map.map((column) => [...column]),
  }
}

function cloneDuel(state: HumanDuelState): Omit<HumanDuelState, 'state'> {
  return {
    ...state,
    map: state.map.map((column) => [...column]),
    result: { ...state.result },
    tanks: state.tanks.map((tank) => ({
      ...tank,
      position: [...tank.position],
      lastPosition: [...tank.lastPosition],
      velocity: [...tank.velocity],
      driveIntent: false,
      death: tank.death ? { ...tank.death } : null,
    })) as [DuelTank, DuelTank],
    engineers: state.engineers.map((engineer) => ({
      ...engineer,
      position: [...engineer.position],
      velocity: [...engineer.velocity],
      driveIntent: false,
      death: engineer.death ? { ...engineer.death } : null,
    })) as [DuelEngineer, DuelEngineer],
    bullets: state.bullets.map((bullet) => ({ ...bullet, position: [...bullet.position] })),
    bombs: state.bombs.map((bomb) => ({ ...bomb, position: [...bomb.position] })),
    explosions: state.explosions.map((explosion) => ({
      ...explosion,
      positions: explosion.positions.map((position) => [...position] as [number, number]),
    })),
    speeches: state.speeches.map((speech) => ({ ...speech })),
    star: state.star ? [...state.star] : null,
    flag: state.flag ? [...state.flag] : null,
    flagScores: [...state.flagScores] as [number, number],
    bulletClashes: state.bulletClashes,
    log: [...state.log],
  }
}

function publicTank(tank: DuelTank) {
  return {
    id: tank.id,
    position: [...tank.position],
    headingDegrees: tank.heading,
    direction: tank.direction,
    crashed: tank.crashed,
    stars: tank.stars,
    shotgunLevel: tank.shotgunLevel,
    armor: tank.armor,
  }
}

function publicBullet(bullet: DuelBullet): BattleBulletState {
  return {
    id: bullet.id,
    owner: bullet.owner,
    position: [...bullet.position],
    headingDegrees: bullet.heading,
    direction: bullet.direction,
    alive: bullet.alive,
  }
}

function publicEngineer(engineer: DuelEngineer, map: Tile[][]): RuntimeEngineerState {
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
      cloaked: engineer.alive && isGrassAt(map, engineer.position),
      fireLocked: engineer.bombCooldown > 0,
      swimming: engineer.alive && tileAt(map, engineer.position) === 'w',
      powered: engineer.powerGlowRemaining > 0,
    },
    death: engineer.death,
  }
}

function publicBomb(bomb: DuelBomb): BattleBombState {
  return {
    id: bomb.id,
    owner: bomb.owner,
    position: [...bomb.position],
    range: bomb.range,
    remainingFrames: bomb.remainingFrames,
  }
}

function publicExplosion(explosion: DuelExplosion): BattleExplosionState {
  return {
    id: explosion.id,
    owner: explosion.owner,
    positions: explosion.positions.map((position) => [...position] as [number, number]),
    remainingFrames: explosion.remainingFrames,
  }
}

function visibleBullet(bullets: DuelBullet[], owner: number) {
  const bullet = bullets.find((item) => item.owner === owner && item.alive)
  return bullet ? publicBullet(bullet) : null
}

function publicSkill(tank: DuelTank) {
  return {
    type: tank.skillType,
    cooldownFrames: SKILL_COOLDOWNS[tank.skillType],
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
  }
}

function publicEffects(tank: DuelTank) {
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

function publicStatus(tank: DuelTank, map: Tile[][]): RuntimeTankState['status'] {
  return {
    shielded: tank.shieldRemaining > 0,
    cloaked: tank.cloakRemaining > 0 || isGrassAt(map, tank.position),
    boosted: tank.boostRemaining > 0,
    overloaded: tank.overloadRemaining > 0,
    frozen: tank.freezeRemaining > 0,
    stunned: tank.stunRemaining > 0,
    poisoned: tank.poisonRemaining > 0,
    fireLocked: tank.fireLocked > 0,
    actionSpeed: tank.freezeRemaining > 0 ? 0 : tank.boostRemaining > 0 ? TANK_BOOST_MULTIPLIER : 1,
    canActThisFrame: tank.freezeRemaining <= 0,
    powered: tank.powerGlowRemaining > 0,
  }
}

function publicSpeeches(state: Omit<HumanDuelState, 'state'>): BattleSpeechState[] {
  return state.speeches.map((speech) => {
    const unit =
      speech.unitKind === 'tank' ? state.tanks[speech.owner] : state.engineers[speech.owner]
    return {
      ...speech,
      position: unit ? ([...unit.position] as [number, number]) : ([0, 0] as [number, number]),
    }
  })
}

function buildScoreboard(state: Omit<HumanDuelState, 'state'>): BattleFrameState['scoreboard'] {
  return {
    sides: [0, 1].map((owner) => {
      const tank = state.tanks[owner as 0 | 1]
      const engineer = state.engineers[owner as 0 | 1]
      const enemyTank = state.tanks[otherIndex(owner as 0 | 1)]
      const enemyEngineer = state.engineers[otherIndex(owner as 0 | 1)]
      const kills = [enemyTank.death, enemyEngineer.death].filter(
        (death) => death?.by === owner,
      ).length
      const losses = [tank.death, engineer.death].filter(Boolean).length
      return {
        owner,
        flags: state.flagScores[owner as 0 | 1],
        tankAlive: !tank.crashed,
        engineerAlive: engineer.alive,
        kills,
        losses,
      }
    }),
  }
}

function spawnStar(state: Omit<HumanDuelState, 'state'>): [number, number] | null {
  return spawnPickup(state, state.flag)
}

function spawnFlag(state: Omit<HumanDuelState, 'state'>): [number, number] | null {
  return spawnPickup(state, state.star)
}

function spawnPickup(
  state: Omit<HumanDuelState, 'state'>,
  avoid: [number, number] | null,
): [number, number] | null {
  const open: [number, number][] = []
  for (let x = 0; x < state.map.length; x += 1) {
    for (let y = 0; y < (state.map[x]?.length ?? 0); y += 1) {
      const position = centerOf([x, y])
      if (
        isOpenTile(state.map, [x, y]) &&
        !state.tanks.some((tank) => distance(tank.position, position) < 1.1) &&
        !state.engineers.some(
          (engineer) => engineer.alive && distance(engineer.position, position) < 0.8,
        ) &&
        !state.bombs.some((bomb) => distance(bomb.position, position) < 0.8) &&
        (!avoid || distance(avoid, position) >= PICKUP_MIN_SEPARATION) &&
        !state.tanks.some((tank) => distance(tank.position, position) < PICKUP_MIN_UNIT_DISTANCE) &&
        !state.engineers.some(
          (engineer) =>
            engineer.alive && distance(engineer.position, position) < PICKUP_MIN_UNIT_DISTANCE,
        )
      ) {
        open.push(position)
      }
    }
  }
  return open[Math.floor(Math.random() * open.length)] ?? null
}

function isTankHiddenFromAgent(
  state: Pick<HumanDuelState, 'map'>,
  tank: DuelTank,
  agent: DuelTank,
) {
  if (tank.cloakRemaining > 0) return true
  return (
    isGrassAt(state.map, tank.position) &&
    distance(tank.position, agent.position) > GRASS_REVEAL_RADIUS
  )
}

function isEngineerHiddenFromAgent(
  state: Pick<HumanDuelState, 'map'>,
  engineer: DuelEngineer,
  agent: DuelTank,
) {
  return (
    engineer.alive &&
    isGrassAt(state.map, engineer.position) &&
    distance(engineer.position, agent.position) > GRASS_REVEAL_RADIUS
  )
}

function canTankOccupy(
  state: Pick<HumanDuelState, 'map'>,
  position: [number, number],
  opponentPosition: [number, number],
) {
  const width = state.map.length
  const height = state.map[0]?.length ?? 0
  if (
    position[0] < TANK_RADIUS ||
    position[1] < TANK_RADIUS ||
    position[0] > width - TANK_RADIUS ||
    position[1] > height - TANK_RADIUS
  ) {
    return false
  }
  if (distance(position, opponentPosition) < TANK_RADIUS * 1.75) return false

  const samples: [number, number][] = [
    position,
    [position[0] + TANK_RADIUS, position[1]],
    [position[0] - TANK_RADIUS, position[1]],
    [position[0], position[1] + TANK_RADIUS],
    [position[0], position[1] - TANK_RADIUS],
    [position[0] + TANK_RADIUS * 0.72, position[1] + TANK_RADIUS * 0.72],
    [position[0] - TANK_RADIUS * 0.72, position[1] + TANK_RADIUS * 0.72],
    [position[0] + TANK_RADIUS * 0.72, position[1] - TANK_RADIUS * 0.72],
    [position[0] - TANK_RADIUS * 0.72, position[1] - TANK_RADIUS * 0.72],
  ]
  return samples.every((sample) => {
    const tile = tileAt(state.map, sample)
    return tile === '.' || tile === 'o'
  })
}

function canEngineerOccupy(
  state: Pick<HumanDuelState, 'map' | 'engineers' | 'bombs'>,
  position: [number, number],
  index: 0 | 1,
  fromPosition?: [number, number],
) {
  const width = state.map.length
  const height = state.map[0]?.length ?? 0
  if (
    position[0] < ENGINEER_RADIUS ||
    position[1] < ENGINEER_RADIUS ||
    position[0] > width - ENGINEER_RADIUS ||
    position[1] > height - ENGINEER_RADIUS
  ) {
    return false
  }

  const other = state.engineers[otherIndex(index)]
  if (other.alive && distance(position, other.position) < ENGINEER_RADIUS * 1.8) return false

  const samples: [number, number][] = [
    position,
    [position[0] + ENGINEER_RADIUS, position[1]],
    [position[0] - ENGINEER_RADIUS, position[1]],
    [position[0], position[1] + ENGINEER_RADIUS],
    [position[0], position[1] - ENGINEER_RADIUS],
  ]
  const candidateCell = cellAt(position)
  const fromCell = fromPosition ? cellAt(fromPosition) : null
  const blockedByBomb = state.bombs.some((bomb) => {
    const bombCell = cellAt(bomb.position)
    return sameCell(candidateCell, bombCell) && (!fromCell || !sameCell(fromCell, bombCell))
  })
  if (blockedByBomb) return false

  return samples.every((sample) => {
    const tile = tileAt(state.map, sample)
    return tile === '.' || tile === 'o' || tile === 'w'
  })
}

function lineWalkable(map: Tile[][], from: [number, number], to: [number, number]) {
  return sampleLine(from, to, 0.18).every((point) => {
    const tile = tileAt(map, point)
    return tile === '.' || tile === 'o'
  })
}

function engineerLineWalkable(
  state: Pick<HumanDuelState, 'map' | 'bombs'>,
  from: [number, number],
  to: [number, number],
) {
  const fromCell = cellAt(from)
  return sampleLine(from, to, 0.18).every((point) => {
    const cell = cellAt(point)
    return isEngineerOpenCell(state, cell, fromCell)
  })
}

function lineOfFireClear(map: Tile[][], from: [number, number], to: [number, number]) {
  return sampleLine(from, to, 0.2).every((point, index, samples) => {
    if (index === 0 || index === samples.length - 1) return true
    const tile = tileAt(map, point)
    return tile === '.' || tile === 'o' || tile === 'w'
  })
}

function sampleLine(from: [number, number], to: [number, number], interval: number) {
  const length = distance(from, to)
  const steps = Math.max(1, Math.ceil(length / interval))
  return Array.from({ length: steps + 1 }, (_, step) => {
    const t = step / steps
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t] as [number, number]
  })
}

function add(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]]
}

function subtract(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]]
}

function dot(a: [number, number], b: [number, number]) {
  return a[0] * b[0] + a[1] * b[1]
}

function cross(a: [number, number], b: [number, number]) {
  return a[0] * b[1] - a[1] * b[0]
}

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function pointToSegmentDistance(
  point: [number, number],
  from: [number, number],
  to: [number, number],
) {
  const segment = subtract(to, from)
  const lengthSq = dot(segment, segment)
  if (lengthSq <= 0.000001) return distance(point, from)
  const t = Math.max(0, Math.min(1, dot(subtract(point, from), segment) / lengthSq))
  const closest: [number, number] = [from[0] + segment[0] * t, from[1] + segment[1] * t]
  return distance(point, closest)
}

function sweptCircleHit(
  from: [number, number],
  to: [number, number],
  center: [number, number],
  radius: number,
) {
  return pointToSegmentDistance(center, from, to) <= radius
}

function normalizeVector(vector: [number, number]): [number, number] | null {
  const length = Math.hypot(vector[0], vector[1])
  if (!Number.isFinite(length) || length < 0.001) return null
  return [vector[0] / length, vector[1] / length]
}

function vectorFromAngle(angle: number): [number, number] {
  const radians = (normalizeAngle(angle) * Math.PI) / 180
  return [Math.cos(radians), Math.sin(radians)]
}

function angleFromVector(vector: [number, number]) {
  return normalizeAngle((Math.atan2(vector[1], vector[0]) * 180) / Math.PI)
}

function angleFromDirection(direction: Direction) {
  switch (direction) {
    case 'right':
      return 0
    case 'down':
      return 90
    case 'left':
      return 180
    case 'up':
      return 270
  }
}

function directionFromAngle(angle: number): Direction {
  const normalized = normalizeAngle(angle)
  if (normalized >= 315 || normalized < 45) return 'right'
  if (normalized < 135) return 'down'
  if (normalized < 225) return 'left'
  return 'up'
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360
}

function angleDistance(a: number, b: number) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  return Math.min(diff, 360 - diff)
}

function setHeading(tank: DuelTank, angle: number) {
  tank.heading = normalizeAngle(angle)
  tank.direction = directionFromAngle(tank.heading)
}

function setEngineerHeading(engineer: DuelEngineer, angle: number) {
  engineer.heading = normalizeAngle(angle)
  engineer.direction = directionFromAngle(engineer.heading)
}

function cellAt(position: [number, number]): [number, number] {
  return [Math.floor(position[0]), Math.floor(position[1])]
}

function centerOf(cell: [number, number]): [number, number] {
  return [cell[0] + 0.5, cell[1] + 0.5]
}

function sameCell(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1]
}

function positionKey(position: [number, number]) {
  return `${position[0]}:${position[1]}`
}

function isOpenTile(map: Tile[][], cell: [number, number]) {
  const tile = map[cell[0]]?.[cell[1]]
  return tile === '.' || tile === 'o'
}

function isEngineerOpenCell(
  state: Pick<HumanDuelState, 'map' | 'bombs'>,
  cell: [number, number],
  fromCell: [number, number] | null = null,
) {
  const tile = state.map[cell[0]]?.[cell[1]]
  if (tile !== '.' && tile !== 'o' && tile !== 'w') return false
  return !state.bombs.some((bomb) => {
    const bombCell = cellAt(bomb.position)
    return sameCell(cell, bombCell) && (!fromCell || !sameCell(fromCell, bombCell))
  })
}

function canPlaceBombOnTile(map: Tile[][], cell: [number, number]) {
  const tile = map[cell[0]]?.[cell[1]]
  return tile === '.' || tile === 'o'
}

function isGrassAt(map: Tile[][], position: [number, number]) {
  return tileAt(map, position) === 'o'
}

function tileAt(map: Tile[][], position: [number, number]): Tile | null {
  const cell = cellAt(position)
  return map[cell[0]]?.[cell[1]] ?? null
}

function openNeighborCount(map: Tile[][], cell: [number, number]) {
  return DIRECTIONS.filter((direction) => {
    const delta = DIR_DELTA[direction]
    return isOpenTile(map, [cell[0] + delta[0], cell[1] + delta[1]])
  }).length
}

function orderedDirections(position: [number, number], target: [number, number]) {
  return [...DIRECTIONS].sort((a, b) => {
    const nextA = add(position, DIR_DELTA[a])
    const nextB = add(position, DIR_DELTA[b])
    return distance(nextA, target) - distance(nextB, target)
  })
}

function otherIndex(index: 0 | 1): 0 | 1 {
  return index === 0 ? 1 : 0
}

function addLog(state: Omit<HumanDuelState, 'state'>, text: string) {
  state.log = [text, ...state.log].slice(0, 8)
}
