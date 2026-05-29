import type {
  BattleBombState,
  BattleBulletState,
  BattleExplosionState,
  BattleFrameState,
  Direction,
  RuntimeEngineerState,
  RuntimeTankState,
  SkillType,
  TankProfile,
  Tile,
} from '../types.js'

export type DuelAction =
  | { type: 'go' }
  | { type: 'drive'; x: number; y: number }
  | { type: 'move'; direction: Direction }
  | { type: 'engineerDrive'; x: number; y: number }
  | { type: 'engineerMove'; direction: Direction }
  | { type: 'engineerBomb' }
  | { type: 'turn'; side: 'left' | 'right' }
  | { type: 'aim'; angle: number }
  | { type: 'fire' }
  | { type: 'skill' }

interface DuelTank {
  id: string
  name: string
  skillType: SkillType
  position: [number, number]
  velocity: [number, number]
  heading: number
  direction: Direction
  driveIntent: boolean
  crashed: boolean
  stars: number
  cooldown: number
  shieldRemaining: number
  freezeRemaining: number
  stunRemaining: number
  overloadRemaining: number
  cloakRemaining: number
  poisonRemaining: number
  boostRemaining: number
  fireLocked: number
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
  bombCooldown: number
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
    reason: 'hit' | 'crashed' | 'stars' | 'draw'
  }
  tanks: [DuelTank, DuelTank]
  engineers: [DuelEngineer, DuelEngineer]
  bullets: DuelBullet[]
  bombs: DuelBomb[]
  explosions: DuelExplosion[]
  star: [number, number] | null
  log: string[]
  state: BattleFrameState
  agentTankId: string
  agentCode: string
}

export const HUMAN_DUEL_MAX_FRAMES = 900

const STAR_TARGET = 3
const STAR_SPAWN_INTERVAL = 115
const TANK_RADIUS = 0.34
const TANK_SPEED = 0.102
const TANK_BOOST_MULTIPLIER = 1.58
const BULLET_SPEED = 0.24
const BULLET_RADIUS = 0.12
const BULLET_TTL = 150
const STAR_PICKUP_RADIUS = 0.54
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
const INITIAL_BOMB_RANGE = 2
const MAX_BOMB_RANGE = 5
const TANK_CRUSH_RADIUS = TANK_RADIUS + ENGINEER_RADIUS * 0.72
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
    star: null,
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
  if (!next.star && next.frame % STAR_SPAWN_INTERVAL === 1) next.star = spawnStar(next)

  for (const action of humanActions.slice(0, 4)) executeAction(next, 0, action)
  for (const action of agentActions.slice(0, 4)) executeAction(next, 1, action)

  applyTankMotion(next)
  applyEngineerMotion(next)
  crushEnemyEngineers(next)
  moveBullets(next)
  tickBombsAndExplosions(next)
  collectStar(next)
  settleIfNeeded(next)
  tickDown(next)
  return withFrameState(next)
}

export async function decideAgentActions(state: HumanDuelState): Promise<DuelAction[]> {
  if (typeof Worker === 'undefined') return fallbackAgentActions(state)
  if (BLOCKED_SCRIPT_TOKENS.test(state.agentCode)) return fallbackAgentActions(state)

  const snapshot = createAgentSnapshot(state)
  const workerSource = `
const BLOCKED = ${BLOCKED_SCRIPT_TOKENS.toString()};
const DIRECTIONS = ["up", "right", "down", "left"];
self.onmessage = (event) => {
  const { code, snapshot } = event.data;
  const actions = [];
  const queue = (action) => {
    if (actions.length < 3) actions.push(action);
  };
  const me = {
    tank: snapshot.me.tank,
    engineer: snapshot.me.engineer,
    stars: snapshot.me.stars,
    bullet: snapshot.me.bullet,
    skill: snapshot.me.skill,
    effects: snapshot.me.effects,
    status: snapshot.me.status,
    go(count) {
      const amount = Math.max(1, Math.min(2, Number.isFinite(count) ? Math.trunc(count) : 1));
      for (let i = 0; i < amount; i += 1) queue({ type: 'go' });
    },
    turn(side) {
      if (side === 'left' || side === 'right') queue({ type: 'turn', side });
    },
    move(direction) {
      if (DIRECTIONS.includes(direction)) queue({ type: 'move', direction });
    },
    drive(x, y) {
      if (Number.isFinite(x) && Number.isFinite(y)) queue({ type: 'drive', x, y });
    },
    aim(angle) {
      if (Number.isFinite(angle)) queue({ type: 'aim', angle });
    },
    fire() {
      queue({ type: 'fire' });
    },
    engineerMove(direction) {
      if (DIRECTIONS.includes(direction)) queue({ type: 'engineerMove', direction });
    },
    engineerDrive(x, y) {
      if (Number.isFinite(x) && Number.isFinite(y)) queue({ type: 'engineerDrive', x, y });
    },
    bomb() {
      queue({ type: 'engineerBomb' });
    },
    speak() {},
  };
  me[snapshot.me.skill.type] = () => queue({ type: 'skill' });
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
      resolve(fallbackAgentActions(state))
    }, 30)
    worker.onmessage = (event: MessageEvent<{ actions?: DuelAction[] }>) => {
      window.clearTimeout(timeout)
      cleanup()
      const actions = sanitizeActions(event.data.actions ?? [])
      resolve(assistAgentActions(state, actions))
    }
    worker.onerror = () => {
      window.clearTimeout(timeout)
      cleanup()
      resolve(fallbackAgentActions(state))
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
    velocity: [0, 0],
    heading,
    direction: input.direction,
    driveIntent: false,
    crashed: false,
    stars: 0,
    cooldown: 0,
    shieldRemaining: 0,
    freezeRemaining: 0,
    stunRemaining: 0,
    overloadRemaining: 0,
    cloakRemaining: 0,
    poisonRemaining: 0,
    boostRemaining: 0,
    fireLocked: 0,
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
    bombCooldown: 0,
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
        map[x]![y] = char === 'm' || char === 'o' || char === '.' ? char : 'x'
      }
    }
  })
  if (!spawns[0] || !spawns[1]) throw new Error('human_duel_map_missing_spawns')
  return { map, spawns: spawns as [(typeof spawns)[number], (typeof spawns)[number]] }
}

function executeAction(state: Omit<HumanDuelState, 'state'>, index: 0 | 1, action: DuelAction) {
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
  action: Extract<DuelAction, { type: 'engineerMove' | 'engineerDrive' | 'engineerBomb' }>,
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
  state: Pick<HumanDuelState, 'map' | 'engineers'>,
  engineer: DuelEngineer,
  index: 0 | 1,
  dx: number,
  dy: number,
) {
  const before = [...engineer.position] as [number, number]
  const nextX: [number, number] = [engineer.position[0] + dx, engineer.position[1]]
  if (canEngineerOccupy(state, nextX, index)) engineer.position = nextX

  const nextY: [number, number] = [engineer.position[0], engineer.position[1] + dy]
  if (canEngineerOccupy(state, nextY, index)) engineer.position = nextY
  return subtract(engineer.position, before)
}

function crushEnemyEngineers(state: Omit<HumanDuelState, 'state'>) {
  state.tanks.forEach((tank, tankIndex) => {
    if (tank.crashed) return
    const enemyEngineer = state.engineers[otherIndex(tankIndex as 0 | 1)]
    if (!enemyEngineer.alive) return
    if (distance(tank.position, enemyEngineer.position) <= TANK_CRUSH_RADIUS) {
      enemyEngineer.alive = false
      enemyEngineer.velocity = [0, 0]
      addLog(state, `${tank.name} crushed ${enemyEngineer.name}`)
    }
  })
}

function placeEngineerBomb(state: Omit<HumanDuelState, 'state'>, index: 0 | 1) {
  const engineer = state.engineers[index]
  if (!engineer.alive || engineer.bombCooldown > 0) return
  if (state.bombs.some((bomb) => bomb.owner === index)) return
  const position = centerOf(cellAt(engineer.position))
  if (state.bombs.some((bomb) => sameCell(cellAt(bomb.position), cellAt(position)))) return
  if (!isOpenTile(state.map, cellAt(position))) return

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
  for (const bomb of exploding) explodeBomb(state, bomb)
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
    if (!tank.crashed && positions.some((position) => distance(position, tank.position) <= 0.58)) {
      tank.crashed = true
      tank.velocity = [0, 0]
      addLog(state, `${tank.name} was caught in the blast`)
    }
  }

  for (const engineer of state.engineers) {
    if (
      engineer.alive &&
      positions.some((position) => distance(position, engineer.position) <= 0.52)
    ) {
      engineer.alive = false
      engineer.velocity = [0, 0]
      addLog(state, `${engineer.name} was caught in the blast`)
    }
  }
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
      if (tile === 'm') {
        map[cell[0]]![cell[1]] = '.'
        break
      }
    }
  }
  return positions
}

function fire(state: Omit<HumanDuelState, 'state'>, index: 0 | 1) {
  const tank = state.tanks[index]
  if (tank.fireLocked > 0 || state.bullets.some((bullet) => bullet.owner === index && bullet.alive))
    return

  const headings = [tank.heading]
  if (tank.overloadRemaining > 0) headings.push(tank.heading - 18, tank.heading + 18)
  for (const heading of headings) {
    const vector = vectorFromAngle(heading)
    state.bullets.push({
      id: `bullet_${state.frame}_${index}_${Math.round(heading)}`,
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
    bullet.position = next
    const targetIndex = bullet.owner === 0 ? 1 : 0
    const target = state.tanks[targetIndex]
    if (!target.crashed && distance(target.position, next) <= TANK_RADIUS + BULLET_RADIUS) {
      bullet.alive = false
      if (target.shieldRemaining > 0) {
        target.shieldRemaining = 0
        addLog(state, `${target.name}'s shield blocked a shell`)
      } else {
        target.crashed = true
        addLog(state, `${state.tanks[bullet.owner === 0 ? 0 : 1].name} landed a direct hit`)
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
    addLog(state, `${tank.name} collected a star`)
    state.star = null
    if (tank.stars >= STAR_TARGET) {
      state.status = 'settled'
      state.result = { winner: index === 0 ? 'human' : 'agent', reason: 'stars' }
    }
  })
  state.engineers.forEach((engineer) => {
    if (
      !state.star ||
      !engineer.alive ||
      distance(engineer.position, state.star) > STAR_PICKUP_RADIUS
    )
      return
    engineer.bombRange = Math.min(MAX_BOMB_RANGE, engineer.bombRange + 1)
    addLog(state, `${engineer.name} upgraded bomb range to ${engineer.bombRange}`)
    state.star = null
  })
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
    const [human, agent] = state.tanks
    const winner =
      human.stars === agent.stars ? 'draw' : human.stars > agent.stars ? 'human' : 'agent'
    state.result = { winner, reason: winner === 'draw' ? 'draw' : 'stars' }
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
  }
  for (const engineer of state.engineers) {
    engineer.bombCooldown = Math.max(0, engineer.bombCooldown - 1)
  }
}

function assistAgentActions(state: HumanDuelState, scripted: DuelAction[]): DuelAction[] {
  const assisted = fallbackAgentActions(state)
  const [firstScripted] = scripted
  const [firstAssisted] = assisted
  if (!firstScripted) return assisted
  if (!scriptedActionCanHelp(state, firstScripted)) return assisted
  if (
    firstScripted.type === 'turn' &&
    firstAssisted &&
    (firstAssisted.type === 'drive' ||
      firstAssisted.type === 'aim' ||
      firstAssisted.type === 'fire' ||
      firstAssisted.type === 'skill')
  ) {
    return assisted
  }
  return scripted
}

function scriptedActionCanHelp(state: HumanDuelState, action: DuelAction) {
  const agent = state.tanks[1]
  const human = state.tanks[0]
  const humanVisible = !isTankHiddenFromAgent(state, human, agent)
  if (action.type === 'fire') {
    if (!humanVisible) return false
    const angle = clearShotAngle(state, agent.position, human.position)
    return angle !== null && angleDistance(agent.heading, angle) <= SHOT_ALIGNMENT_DEGREES
  }
  if (action.type === 'aim' && !humanVisible) return false
  if (action.type === 'go') return canMoveVector(state, 1, vectorFromAngle(agent.heading))
  if (action.type === 'move') return canMoveVector(state, 1, DIR_DELTA[action.direction])
  if (action.type === 'drive') return canMoveVector(state, 1, [action.x, action.y])
  if (action.type === 'engineerMove')
    return canMoveEngineerVector(state, 1, DIR_DELTA[action.direction])
  if (action.type === 'engineerDrive') return canMoveEngineerVector(state, 1, [action.x, action.y])
  if (action.type === 'engineerBomb') return state.engineers[1].bombCooldown === 0
  if (action.type === 'skill') {
    if (
      !humanVisible &&
      (agent.skillType === 'freeze' || agent.skillType === 'stun' || agent.skillType === 'poison')
    )
      return false
    return agent.cooldown === 0
  }
  return true
}

function fallbackAgentActions(state: HumanDuelState): DuelAction[] {
  const agent = state.tanks[1]
  const human = state.tanks[0]
  const engineerAction = fallbackEngineerAction(state, 1)
  const dodge = dodgeBulletAction(state)
  if (dodge) return combineActions([dodge], engineerAction)

  const humanVisible = !isTankHiddenFromAgent(state, human, agent)
  const skill = tacticalSkillAction(state, humanVisible)
  if (skill) return combineActions([skill], engineerAction)

  if (state.star) return combineActions([driveTowardPoint(state, 1, state.star)], engineerAction)

  const shotAngle = humanVisible ? clearShotAngle(state, agent.position, human.position) : null
  if (shotAngle !== null) {
    if (agent.cooldown === 0 && agent.skillType === 'overload' && human.shieldRemaining <= 0)
      return combineActions([{ type: 'skill' }], engineerAction)
    if (
      angleDistance(agent.heading, shotAngle) <= SHOT_ALIGNMENT_DEGREES &&
      human.shieldRemaining <= 0
    )
      return combineActions([{ type: 'fire' }], engineerAction)
    return combineActions([{ type: 'aim', angle: shotAngle }], engineerAction)
  }

  const target = humanVisible ? human.position : null
  if (target) return combineActions([driveTowardPoint(state, 1, target)], engineerAction)

  const roam = bestOpenNeighborVector(state, agent.position, human.position)
  return combineActions(
    roam ? [{ type: 'drive', x: roam[0], y: roam[1] }] : [{ type: 'turn', side: 'right' }],
    engineerAction,
  )
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
  const target =
    state.star ??
    (visibleEnemy && !enemyTank.crashed
      ? enemyTank.position
      : enemyEngineer.alive
        ? enemyEngineer.position
        : null)

  if (
    engineer.bombCooldown === 0 &&
    target &&
    distance(engineer.position, target) <= engineer.bombRange + 0.4
  ) {
    return { type: 'engineerBomb' }
  }
  if (!target) return null
  return driveEngineerTowardPoint(state, index, target)
}

function tacticalSkillAction(state: HumanDuelState, humanVisible: boolean): DuelAction | null {
  const agent = state.tanks[1]
  const human = state.tanks[0]
  if (agent.cooldown > 0) return null
  if (agent.skillType === 'boost' && state.star) return { type: 'skill' }
  if (
    humanVisible &&
    (agent.skillType === 'freeze' || agent.skillType === 'stun' || agent.skillType === 'poison') &&
    distance(agent.position, human.position) <= 4.8
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
  const directVector = subtract(target, tank.position)
  if (lineWalkable(state.map, tank.position, target)) {
    return { type: 'drive', x: directVector[0], y: directVector[1] }
  }

  const pathPoint = nextPathPoint(
    state,
    tank.position,
    target,
    state.tanks[otherIndex(index)].position,
  )
  const vector = pathPoint ? subtract(pathPoint, tank.position) : directVector
  return { type: 'drive', x: vector[0], y: vector[1] }
}

function driveEngineerTowardPoint(
  state: HumanDuelState,
  index: 0 | 1,
  target: [number, number],
): DuelAction {
  const engineer = state.engineers[index]
  const directVector = subtract(target, engineer.position)
  if (lineWalkable(state.map, engineer.position, target)) {
    return { type: 'engineerDrive', x: directVector[0], y: directVector[1] }
  }

  const pathPoint = nextPathPoint(
    state,
    engineer.position,
    target,
    state.engineers[otherIndex(index)].position,
  )
  const vector = pathPoint ? subtract(pathPoint, engineer.position) : directVector
  return { type: 'engineerDrive', x: vector[0], y: vector[1] }
}

function dodgeBulletAction(state: HumanDuelState): DuelAction | null {
  const agent = state.tanks[1]
  const threat = state.bullets
    .filter((bullet) => bullet.owner === 0 && bullet.alive)
    .map((bullet) => ({ bullet, score: bulletThreatScore(bullet, agent.position) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]
  if (!threat) return null

  const bulletVector = vectorFromAngle(threat.bullet.heading)
  const candidates: [number, number][] = [
    [-bulletVector[1], bulletVector[0]],
    [bulletVector[1], -bulletVector[0]],
  ]
  const safe = candidates.find((vector) => canMoveVector(state, 1, vector))
  return safe ? { type: 'drive', x: safe[0], y: safe[1] } : null
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

function nextPathPoint(
  state: HumanDuelState,
  start: [number, number],
  target: [number, number],
  blocked: [number, number],
): [number, number] | null {
  const startCell = cellAt(start)
  const targetCell = cellAt(target)
  if (!isOpenTile(state.map, targetCell)) return null

  const targetKey = positionKey(targetCell)
  const visited = new Set([positionKey(startCell)])
  const queue: Array<{ cell: [number, number]; first: [number, number] | null }> = [
    { cell: startCell, first: null },
  ]

  while (queue.length) {
    const current = queue.shift()!
    const nearest = targetCell
    for (const direction of orderedDirections(centerOf(current.cell), centerOf(nearest))) {
      const delta = DIR_DELTA[direction]
      const next: [number, number] = [current.cell[0] + delta[0], current.cell[1] + delta[1]]
      const key = positionKey(next)
      if (visited.has(key) || !isOpenTile(state.map, next) || sameCell(next, cellAt(blocked)))
        continue
      visited.add(key)
      const first = current.first ?? next
      if (key === targetKey) return centerOf(first)
      queue.push({ cell: next, first })
    }
  }
  return null
}

function bestOpenNeighborVector(
  state: HumanDuelState,
  position: [number, number],
  blocked: [number, number],
): [number, number] | null {
  const current = cellAt(position)
  const options = DIRECTIONS.map((direction) => {
    const delta = DIR_DELTA[direction]
    const cell: [number, number] = [current[0] + delta[0], current[1] + delta[1]]
    return {
      cell,
      score:
        isOpenTile(state.map, cell) && !sameCell(cell, cellAt(blocked))
          ? openNeighborCount(state.map, cell)
          : -1,
    }
  })
    .filter((option) => option.score >= 0)
    .sort((a, b) => b.score - a.score)
  return options[0] ? subtract(centerOf(options[0].cell), position) : null
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
      skillType: tank.skillType,
      status: publicStatus(tank, state.map),
    })),
    engineers: state.engineers.map((engineer) => publicEngineer(engineer, state.map)),
    bullets: state.bullets.map(publicBullet),
    bombs: state.bombs.map(publicBomb),
    explosions: state.explosions.map(publicExplosion),
    star: state.star ? [...state.star] : null,
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
      velocity: [...tank.velocity],
      driveIntent: false,
    })) as [DuelTank, DuelTank],
    engineers: state.engineers.map((engineer) => ({
      ...engineer,
      position: [...engineer.position],
      velocity: [...engineer.velocity],
      driveIntent: false,
    })) as [DuelEngineer, DuelEngineer],
    bullets: state.bullets.map((bullet) => ({ ...bullet, position: [...bullet.position] })),
    bombs: state.bombs.map((bomb) => ({ ...bomb, position: [...bomb.position] })),
    explosions: state.explosions.map((explosion) => ({
      ...explosion,
      positions: explosion.positions.map((position) => [...position] as [number, number]),
    })),
    star: state.star ? [...state.star] : null,
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
    status: {
      cloaked: engineer.alive && isGrassAt(map, engineer.position),
      fireLocked: engineer.bombCooldown > 0,
    },
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
  }
}

function spawnStar(state: Omit<HumanDuelState, 'state'>): [number, number] | null {
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
        !state.bombs.some((bomb) => distance(bomb.position, position) < 0.8)
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
  state: Pick<HumanDuelState, 'map' | 'engineers'>,
  position: [number, number],
  index: 0 | 1,
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
  return samples.every((sample) => {
    const tile = tileAt(state.map, sample)
    return tile === '.' || tile === 'o'
  })
}

function lineWalkable(map: Tile[][], from: [number, number], to: [number, number]) {
  return sampleLine(from, to, 0.18).every((point) => {
    const tile = tileAt(map, point)
    return tile === '.' || tile === 'o'
  })
}

function lineOfFireClear(map: Tile[][], from: [number, number], to: [number, number]) {
  return sampleLine(from, to, 0.2).every((point, index, samples) => {
    if (index === 0 || index === samples.length - 1) return true
    const tile = tileAt(map, point)
    return tile === '.' || tile === 'o'
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
