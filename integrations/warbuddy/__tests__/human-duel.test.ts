import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  actionsForRole,
  companionActionsForRole,
  createHumanDuel,
  type DuelAction,
  decideAgentActions,
  heldKeysToDuelActions,
  keyToDuelAction,
  resolveDuelScriptActions,
  stepHumanDuel,
} from '../src/client/human-duel'
import { DEFAULT_TANK_STRATEGY_CODE, DEFAULT_WARBUDDY_RULES } from '../src/rules'
import type { Direction } from '../src/types'

const MOVE_MAP = ['xxxxxxx', 'xB....x', 'x.....x', 'x..A..x', 'x.....x', 'xxxxxxx'].join('|')
const BLOCK_MAP = ['xxxxxxx', 'x.....x', 'x..B..x', 'x..A..x', 'x.....x', 'xxxxxxx'].join('|')
const SMART_MAP = ['xxxxxxx', 'xB...xx', 'xxx.x.x', 'x...A.x', 'x.....x', 'xxxxxxx'].join('|')
const SIGHT_MAP = ['xxxxxxx', 'xB...Ax', 'x.....x', 'x.....x', 'xxxxxxx'].join('|')
const GRASS_MAP = ['xxxxxxx', 'xB.o..x', 'x....Ax', 'x.....x', 'xxxxxxx'].join('|')
const WALL_SLIDE_MAP = ['xxxxxxx', 'xB....x', 'x....Ax', 'x.....x', 'xxxxxxx'].join('|')
const WATER_MAP = ['xxxxxxx', 'xB....x', 'x..w..x', 'x..A..x', 'x.....x', 'xxxxxxx'].join('|')
const RADIUS_PATH_MAP = ['xxxxxxx', 'xB....x', 'x..x..x', 'x..A..x', 'x.....x', 'xxxxxxx'].join('|')
const PICKUP_CONTEST_MAP = [
  'xxxxxxxxx',
  'x.......x',
  'x.......x',
  'xB.....Ax',
  'x.......x',
  'x.......x',
  'xxxxxxxxx',
].join('|')
const SOFT_BLOCKED_LANE_MAP = ['xxxxxxx', 'xB.m.Ax', 'x.....x', 'xxxxxxx'].join('|')
const SOFT_TERRAIN_MAP = ['xxxxxxx', 'xB....x', 'x.m...x', 'x..A..x', 'x.....x', 'xxxxxxx'].join(
  '|',
)
const UNSAFE_BOMB_MAP = ['xxxxxxx', 'xA....x', 'x.....x', 'xm...Bx', 'x.....x', 'xxxxxxx'].join('|')
const TANK_UNIT = { kind: 'tank' } as const
const ENGINEER_UNIT = { kind: 'engineer' } as const
const tankMove = (direction: Direction) =>
  ({ type: 'unit.move', unit: TANK_UNIT, direction }) as const
const stepEngineer = (direction: Direction) =>
  ({ type: 'unit.move', unit: ENGINEER_UNIT, direction }) as const
const tankDrive = (x: number, y: number) => ({ type: 'unit.drive', unit: TANK_UNIT, x, y }) as const
const driveEngineer = (x: number, y: number) =>
  ({ type: 'unit.drive', unit: ENGINEER_UNIT, x, y }) as const
const tankFire = () => ({ type: 'unit.fire', unit: TANK_UNIT }) as const
const tankAbility = () => ({ type: 'unit.ability', unit: TANK_UNIT, ability: 'primary' }) as const
const tankTeleport = (x: number, y: number) =>
  ({ type: 'unit.ability', unit: TANK_UNIT, ability: 'teleport', x, y }) as const
const plantBomb = () => ({ type: 'unit.ability', unit: ENGINEER_UNIT, ability: 'bomb' }) as const
const speakTank = (text: string) => ({ type: 'unit.speak', unit: TANK_UNIT, text }) as const
const speakEngineer = (text: string) => ({ type: 'unit.speak', unit: ENGINEER_UNIT, text }) as const
const isTankDrive = (action: DuelAction): action is Extract<DuelAction, { type: 'unit.drive' }> =>
  action.type === 'unit.drive' && action.unit.kind === 'tank'
const isEngineerDrive = (
  action: DuelAction,
): action is Extract<DuelAction, { type: 'unit.drive' }> =>
  action.type === 'unit.drive' && action.unit.kind === 'engineer'

describe('human duel controls', () => {
  it('maps keyboard input to live tank actions', () => {
    expect(keyToDuelAction('w')).toEqual(tankMove('up'))
    expect(keyToDuelAction('ArrowDown')).toEqual(tankMove('down'))
    expect(keyToDuelAction('a')).toEqual(tankMove('left'))
    expect(keyToDuelAction('ArrowRight')).toEqual(tankMove('right'))
    expect(keyToDuelAction('i')).toEqual(stepEngineer('up'))
    expect(keyToDuelAction('u')).toEqual(plantBomb())
    expect(keyToDuelAction('q')).toEqual(tankFire())
    expect(keyToDuelAction(' ')).toEqual(tankFire())
    expect(keyToDuelAction('e')).toEqual(tankAbility())
    expect(heldKeysToDuelActions(['w', 'd', 'i', 'l'])).toEqual([
      tankDrive(1, -1),
      driveEngineer(1, -1),
    ])
  })

  it('filters live inputs by chosen human role and supplies companion actions', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    const mixed = [tankDrive(1, 0), tankFire(), driveEngineer(0, 1), plantBomb()] as const

    expect(actionsForRole([...mixed], 'tank')).toEqual([tankDrive(1, 0), tankFire()])
    expect(actionsForRole([...mixed], 'engineer')).toEqual([driveEngineer(0, 1), plantBomb()])
    const companionEngineerActions = companionActionsForRole(duel, 0, 'tank')
    const companionTankActions = companionActionsForRole(duel, 0, 'engineer')
    expect(companionEngineerActions.length).toBeGreaterThan(0)
    expect(companionEngineerActions.every((action) => action.unit.kind === 'engineer')).toBe(true)
    expect(companionTankActions.length).toBeGreaterThan(0)
    expect(companionTankActions.every((action) => action.unit.kind === 'tank')).toBe(true)
  })

  it('moves the human tank continuously in all four keyboard directions', () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })

    const start = duel.state.tanks[0]!.position
    const up = stepHumanDuel(duel, [tankMove('up')], [])
    const left = stepHumanDuel(up, [tankMove('left')], [])
    const down = stepHumanDuel(left, [tankMove('down')], [])
    const right = stepHumanDuel(down, [tankMove('right')], [])

    expect(up.state.tanks[0]!.position[1]).toBeLessThan(start[1])
    expect(up.state.tanks[0]?.direction).toBe('up')
    expect(left.state.tanks[0]!.position[0]).toBeLessThan(up.state.tanks[0]!.position[0])
    expect(left.state.tanks[0]?.direction).toBe('left')
    expect(down.state.tanks[0]!.position[1]).toBeGreaterThan(left.state.tanks[0]!.position[1])
    expect(down.state.tanks[0]?.direction).toBe('down')
    expect(right.state.tanks[0]!.position[0]).toBeGreaterThan(down.state.tanks[0]!.position[0])
    expect(right.state.tanks[0]?.direction).toBe('right')
    expect(right.frame).toBe(4)
    expect(right.state.tanks).toHaveLength(2)
  })

  it('uses doubled live movement speed rules for tanks and engineers', () => {
    expect(DEFAULT_WARBUDDY_RULES.units.tank.moveCooldownFrames).toBe(5)
    expect(DEFAULT_WARBUDDY_RULES.units.engineer.moveCooldownFrames).toBe(6)
  })

  it('does not let crashed tank corpses block movement', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.tanks[0].position = [2.2, 3.5]
    duel.tanks[1].position = [3.5, 3.5]
    duel.tanks[1].crashed = true

    for (let i = 0; i < 12; i += 1) {
      duel = stepHumanDuel(duel, [tankMove('right')], [])
    }

    expect(duel.state.tanks[0]!.position[0]).toBeGreaterThan(3.7)
  })

  it('does not let dead engineer corpses block movement', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.engineers[0].position = [2.2, 3.5]
    duel.engineers[1].position = [3.5, 3.5]
    duel.engineers[1].alive = false

    for (let i = 0; i < 12; i += 1) {
      duel = stepHumanDuel(duel, [stepEngineer('right')], [])
    }

    expect(duel.state.engineers[0]!.position[0]).toBeGreaterThan(3.7)
  })

  it('slides units off sticky wall corners instead of pinning them in place', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: WALL_SLIDE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.tanks[0].position = [2.5, 1.31]
    duel.tanks[1].position = [5.5, 3.5]
    duel.engineers[0].position = [2.5, 1.2]
    duel.engineers[1].position = [5.5, 1.5]

    for (let i = 0; i < 4; i += 1) {
      duel = stepHumanDuel(duel, [tankMove('right'), stepEngineer('right')], [])
    }

    expect(duel.state.tanks[0]!.position[0]).toBeGreaterThan(2.85)
    expect(duel.state.tanks[0]!.position[1]).toBeGreaterThan(1.34)
    expect(duel.state.engineers[0]!.position[0]).toBeGreaterThan(2.75)
    expect(duel.state.engineers[0]!.position[1]).toBeGreaterThan(1.22)
  })

  it('blocks human movement into walls and enemy tanks', () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: BLOCK_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })

    let enemyBlocked = duel
    for (let i = 0; i < 16; i += 1) {
      enemyBlocked = stepHumanDuel(enemyBlocked, [tankMove('up')], [])
    }
    let wallBlocked = duel
    for (let i = 0; i < 40; i += 1) {
      wallBlocked = stepHumanDuel(wallBlocked, [tankMove('right')], [])
    }

    expect(enemyBlocked.state.tanks[0]!.position[1]).toBeGreaterThan(3.05)
    expect(wallBlocked.state.tanks[0]!.position[0]).toBeLessThan(5.75)
  })

  it('keeps scripted teleport tied to explicit valid targets', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'teleport',
        code: 'function onTankIdle(tank) { tank.teleport(2, 1); }',
      },
    })

    duel = stepHumanDuel(duel, [], [tankTeleport(2, 1)])
    expect(duel.state.tanks[1]!.position).toEqual([2.5, 1.5])
    expect(duel.state.tanks[1]!.status.fireLocked).toBe(true)

    const afterCooldownBlocked = stepHumanDuel(duel, [], [tankTeleport(5, 1)])
    expect(afterCooldownBlocked.state.tanks[1]!.position).toEqual([2.5, 1.5])
  })

  it('keeps a very small amount of inertia after releasing movement', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })

    duel = stepHumanDuel(duel, [tankMove('right')], [])
    const pressed = duel.state.tanks[0]!.position[0]
    duel = stepHumanDuel(duel, [], [])
    const released = duel.state.tanks[0]!.position[0]

    for (let i = 0; i < 10; i += 1) duel = stepHumanDuel(duel, [], [])

    expect(released).toBeGreaterThan(pressed)
    expect(duel.state.tanks[0]!.position[0] - released).toBeLessThan(0.09)
  })

  it('drives the fallback agent into a star and collects it instead of circling', async () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: SMART_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'shield',
        code: '',
      },
    })
    duel = { ...duel, star: [4.5, 1.5] as [number, number] }

    for (let i = 0; i < 55 && duel.star; i += 1) {
      duel = stepHumanDuel(duel, [], await decideAgentActions(duel))
      duel = { ...duel, flag: null }
    }

    expect(duel.star).toBeNull()
    expect(
      (duel.state.tanks[1]?.stars ?? 0) > 0 ||
        (duel.state.engineers[1]?.maxBombs ?? 0) > 1 ||
        (duel.state.engineers[1]?.bombRange ?? 0) > 2,
    ).toBe(true)
  })

  it('lets the engineer move, upgrade bomb count then range, and plant delayed bombs', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    const start = duel.state.engineers[0]!.position

    duel = stepHumanDuel(duel, [stepEngineer('right')], [])
    expect(duel.state.engineers[0]!.position[0]).toBeGreaterThan(start[0])

    duel = { ...duel, star: [...duel.engineers[0].position] as [number, number] }
    duel = stepHumanDuel(duel, [], [])
    expect(duel.state.engineers[0]!.maxBombs).toBe(2)
    expect(duel.state.engineers[0]!.bombRange).toBe(2)
    expect(duel.star).toBeNull()

    duel = { ...duel, star: [...duel.engineers[0].position] as [number, number] }
    duel = stepHumanDuel(duel, [], [])
    expect(duel.state.engineers[0]!.bombRange).toBe(3)
    expect(duel.star).toBeNull()

    duel = stepHumanDuel(duel, [plantBomb()], [])
    expect(duel.state.bombs).toHaveLength(1)
    expect(duel.state.bombs[0]?.range).toBe(3)

    for (let i = 0; i < 12; i += 1) {
      duel = stepHumanDuel(duel, [stepEngineer('right')], [])
    }
    duel = stepHumanDuel(duel, [plantBomb()], [])
    expect(duel.state.bombs).toHaveLength(2)
  })

  it('upgrades tanks with shotgun first and armor second', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })

    duel = { ...duel, star: [...duel.tanks[0].position] as [number, number] }
    duel = stepHumanDuel(duel, [], [])
    expect(duel.state.tanks[0]!.shotgunLevel).toBe(1)
    expect(duel.state.tanks[0]!.armor).toBe(1)

    duel = { ...duel, star: [...duel.tanks[0].position] as [number, number] }
    duel = stepHumanDuel(duel, [], [])
    expect(duel.state.tanks[0]!.armor).toBe(2)

    duel = stepHumanDuel(duel, [tankFire()], [])
    const shotgunBullets = duel.state.bullets.filter((bullet) => bullet.owner === 0)
    expect(shotgunBullets).toHaveLength(3)
    expect(
      shotgunBullets.map((bullet) => Math.round(bullet.headingDegrees ?? 0)).sort((a, b) => a - b),
    ).toEqual([0, 45, 315])

    duel.bullets = [
      {
        id: 'armor-test-shell',
        owner: 1,
        position: [duel.tanks[0].position[0] - 0.4, duel.tanks[0].position[1]],
        heading: 0,
        direction: 'right',
        alive: true,
        age: 0,
      },
    ]
    duel = stepHumanDuel(duel, [], [])
    expect(duel.state.tanks[0]!.armor).toBe(1)
    expect(duel.state.tanks[0]!.crashed).toBe(false)
  })

  it('allows tanks to crush enemy engineers without hurting friendly engineers', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.engineers[0].position = [...duel.tanks[0].position]
    duel.engineers[1].position = [...duel.tanks[0].position]

    duel = stepHumanDuel(duel, [], [])

    expect(duel.state.engineers[0]!.alive).toBe(true)
    expect(duel.state.engineers[1]!.alive).toBe(false)
  })

  it('lets delayed bombs eliminate all enemy units with friendly fire enabled', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.tanks[0].position = [1.5, 1.5]
    duel.engineers[0].position = [3.5, 3.5]
    duel.tanks[1].position = [5.5, 3.5]
    duel.engineers[1].position = [4.5, 3.5]

    duel = stepHumanDuel(duel, [plantBomb()], [])
    for (let i = 0; i < 70 && duel.status === 'running'; i += 1) {
      duel = stepHumanDuel(duel, [], [])
    }

    expect(duel.state.engineers[0]!.alive).toBe(false)
    expect(duel.state.tanks[1]!.crashed).toBe(true)
    expect(duel.state.engineers[1]!.alive).toBe(false)
    expect(duel.result.winner).toBe('human')
  })

  it('lets shells cancel out and lets tank shells kill enemy engineers', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.bullets = [
      {
        id: 'human-shell',
        owner: 0,
        position: [2.95, 2.5],
        heading: 0,
        direction: 'right',
        alive: true,
        age: 0,
      },
      {
        id: 'agent-shell',
        owner: 1,
        position: [3.45, 2.5],
        heading: 180,
        direction: 'left',
        alive: true,
        age: 0,
      },
    ]

    duel = stepHumanDuel(duel, [], [])

    expect(duel.state.bullets).toHaveLength(0)
    expect(duel.state.bulletClashes).toBe(1)

    duel.bullets = [
      {
        id: 'engineer-shot',
        owner: 0,
        position: [2.95, 2.5],
        heading: 0,
        direction: 'right',
        alive: true,
        age: 0,
      },
    ]
    duel.engineers[1].position = [3.2, 2.5]

    duel = stepHumanDuel(duel, [], [])

    expect(duel.state.engineers[1]!.alive).toBe(false)
    expect(duel.state.bullets).toHaveLength(0)
  })

  it('uses swept bullet collision for grazing engineer hits and records the death cause', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.bullets = [
      {
        id: 'grazing-shell',
        owner: 0,
        position: [2.0, 2.5],
        heading: 0,
        direction: 'right',
        alive: true,
        age: 0,
      },
    ]
    duel.engineers[1].position = [2.06, 2.89]

    duel = stepHumanDuel(duel, [], [])

    expect(duel.state.engineers[1]!.alive).toBe(false)
    expect(duel.state.engineers[1]!.death?.cause).toBe('bullet')
    expect(duel.state.engineers[1]!.death?.by).toBe(0)
  })

  it('delays pickup drops and exposes speech, power highlights, and scoreboard state', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })

    for (let i = 0; i < 80; i += 1) duel = stepHumanDuel(duel, [], [])
    expect(duel.state.star).toBeNull()
    expect(duel.state.flag).toBeNull()

    duel = { ...duel, star: [...duel.tanks[0].position] as [number, number] }
    duel = stepHumanDuel(duel, [speakTank('push left'), speakEngineer('covering')], [])

    expect(duel.state.speeches?.map((speech) => speech.text)).toEqual(
      expect.arrayContaining(['push left', 'covering']),
    )
    expect(duel.state.tanks[0]!.status.powered).toBe(true)
    expect(duel.state.scoreboard?.sides[0]).toMatchObject({
      owner: 0,
      flags: 0,
      tankAlive: true,
      engineerAlive: true,
    })
  })

  it('spawns pickups around the current contest point before expanding outward', () => {
    const originalRandom = Math.random
    Math.random = () => 0
    try {
      let duel = createHumanDuel({
        mapId: 'test',
        mapName: 'Test Map',
        mapRaw: PICKUP_CONTEST_MAP,
        humanName: 'Human',
        humanSkillType: 'shield',
        agent: {
          id: 'agent',
          name: 'Agent',
          skillType: 'boost',
          code: '',
        },
      })
      duel = {
        ...duel,
        frame: DEFAULT_WARBUDDY_RULES.pickups.starFirstFrame - 1,
      }

      duel = stepHumanDuel(duel, [], [])

      expect(duel.state.star).toEqual([4.5, 3.5])
    } finally {
      Math.random = originalRandom
    }
  })

  it('makes the fallback tank attack visible enemy engineers', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.tanks[1].position = [1.5, 1.5]
    duel.tanks[1].heading = 0
    duel.tanks[0].position = [5.5, 4.5]
    duel.map[5]![4] = 'o'
    duel.engineers[0].position = [4.5, 1.5]

    const actions = await decideAgentActions(duel)

    expect(actions).toContainEqual(tankFire())
  })

  it('lets shells trigger bombs, chain bombs, and burn grass', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.tanks[0].position = [1.5, 1.5]
    duel.tanks[1].position = [5.5, 4.5]
    duel.engineers[0].position = [1.5, 4.5]
    duel.engineers[1].position = [5.5, 1.5]
    duel.map[4]![2] = 'o'
    duel.bombs = [
      { id: 'first-bomb', owner: 0, position: [2.5, 2.5], range: 2, remainingFrames: 50 },
      { id: 'chain-bomb', owner: 1, position: [3.5, 2.5], range: 2, remainingFrames: 50 },
    ]
    duel.bullets = [
      {
        id: 'trigger-shell',
        owner: 0,
        position: [1.9, 2.5],
        heading: 0,
        direction: 'right',
        alive: true,
        age: 0,
      },
    ]

    duel = stepHumanDuel(duel, [], [])

    expect(duel.state.bombs).toHaveLength(0)
    expect(duel.state.explosions).toHaveLength(2)
    expect(duel.state.map[4]![2]).toBe('.')
  })

  it('blocks engineers on bombs while tanks trigger bombs by rolling over them', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.engineers[0].position = [3.5, 3.5]
    duel.bombs = [
      { id: 'blocking-bomb', owner: 1, position: [4.5, 3.5], range: 1, remainingFrames: 50 },
    ]

    for (let i = 0; i < 20; i += 1) {
      duel = stepHumanDuel(duel, [stepEngineer('right')], [])
    }

    expect(duel.state.engineers[0]!.position[0]).toBeLessThan(4)

    duel.tanks[0].position = [3.25, 3.5]
    duel.tanks[1].position = [5.5, 1.5]
    for (let i = 0; i < 14 && duel.bombs.length > 0; i += 1) {
      duel = stepHumanDuel(duel, [tankMove('right')], [])
    }

    expect(duel.state.bombs).toHaveLength(0)
    expect(duel.state.explosions.length).toBeGreaterThan(0)
  })

  it('falls back to movement when a scripted engineer bomb is rejected as unsafe', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: UNSAFE_BOMB_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    const start = duel.state.engineers[0]!.position
    const actions = resolveDuelScriptActions(duel, [plantBomb()], 0)

    expect(actions.some((action) => action.type === 'unit.ability')).toBe(false)
    expect(actions.some(isEngineerDrive)).toBe(true)

    duel = stepHumanDuel(duel, actions, [])

    expect(
      Math.hypot(
        duel.state.engineers[0]!.position[0] - start[0],
        duel.state.engineers[0]!.position[1] - start[1],
      ),
    ).toBeGreaterThan(0.01)
  })

  it('applies bomb damage to the whole covered tile, including the edge', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.tanks[1].position = [3.92, 3.92]
    duel.engineers[1].position = [5.5, 1.5]
    duel.bombs = [{ id: 'edge-bomb', owner: 0, position: [3.5, 3.5], range: 1, remainingFrames: 1 }]

    duel = stepHumanDuel(duel, [], [])

    expect(duel.state.tanks[1]!.crashed).toBe(true)
  })

  it('ends the live duel when a side captures three flags', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })

    for (let i = 0; i < 3; i += 1) {
      duel = { ...duel, flag: [...duel.tanks[0].position] as [number, number] }
      duel = stepHumanDuel(duel, [], [])
    }

    expect(duel.state.flagScores).toEqual([3, 0])
    expect(duel.status).toBe('settled')
    expect(duel.result).toEqual({ winner: 'human', reason: 'flags' })
  })

  it('blocks water for tanks while engineers and shells can cross it', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Water Map',
      mapRaw: WATER_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })

    for (let i = 0; i < 20; i += 1) {
      duel = stepHumanDuel(duel, [tankMove('up')], [])
    }
    expect(duel.state.tanks[0]!.position[1]).toBeGreaterThan(3.25)

    duel.engineers[0].position = [2.5, 2.5]
    for (let i = 0; i < 6; i += 1) {
      duel = stepHumanDuel(duel, [stepEngineer('right')], [])
    }
    expect(duel.state.engineers[0]!.position[0]).toBeGreaterThan(3.25)
    expect(duel.state.engineers[0]!.status.swimming).toBe(true)

    duel = stepHumanDuel(duel, [plantBomb()], [])
    expect(duel.state.bombs).toHaveLength(0)

    for (let i = 0; i < 8; i += 1) {
      duel = stepHumanDuel(duel, [stepEngineer('right')], [])
    }
    expect(duel.state.engineers[0]!.position[0]).toBeGreaterThan(4.25)
    expect(duel.state.engineers[0]!.status.swimming).toBe(false)

    duel.tanks[0].position = [1.5, 1.5]
    duel.tanks[1].position = [5.5, 4.5]
    duel.bullets = [
      {
        id: 'water-shell',
        owner: 0,
        position: [2.9, 2.5],
        heading: 0,
        direction: 'right',
        alive: true,
        age: 0,
      },
    ]
    for (let i = 0; i < 3; i += 1) duel = stepHumanDuel(duel, [], [])
    expect(duel.state.bullets[0]?.position[0]).toBeGreaterThan(3.4)
  })

  it('lets the fallback agent fire when it has a clear shot', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: SIGHT_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'shield',
        code: '',
      },
    })
    const ready = structuredClone(duel)
    ready.tanks[1].direction = 'right'
    ready.tanks[1].heading = 0

    const actions = await decideAgentActions(ready)
    expect(actions).toContainEqual(tankFire())
  })

  it('hides tanks in grass from the fallback agent until they are close', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: GRASS_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'shield',
        code: '',
      },
    })
    const hidden = structuredClone(duel)
    hidden.tanks[0].position = [3.5, 1.5]
    hidden.tanks[1].heading = 0
    hidden.tanks[1].direction = 'right'

    await expect(decideAgentActions(hidden)).resolves.not.toEqual([tankFire()])

    const visible = structuredClone(hidden)
    visible.tanks[0].position = [4.5, 1.5]
    const actions = await decideAgentActions(visible)
    expect(actions).toContainEqual(tankFire())
  })

  it('does not leak grass-hidden tank status to scripts', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: GRASS_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'shield',
        code: 'function onIdle(me, enemy) { if (enemy.status && enemy.status.cloaked) me.tank.fire(); }',
      },
    })
    const hidden = structuredClone(duel)
    hidden.tanks[0].position = [3.5, 1.5]
    hidden.tanks[1].heading = 0
    hidden.tanks[1].direction = 'right'

    await expect(decideAgentActions(hidden)).resolves.not.toEqual([tankFire()])
  })

  it('keeps the practice system AI moving both tank and engineer when no Buddy strategy exists', async () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel = { ...duel, flag: [2.5, 1.5] as [number, number] }
    const tankStart = duel.state.tanks[1]!.position
    const engineerStart = duel.state.engineers[1]!.position

    for (let i = 0; i < 80; i += 1) {
      duel = stepHumanDuel(duel, [], await decideAgentActions(duel))
    }

    expect(
      Math.hypot(
        duel.state.tanks[1]!.position[0] - tankStart[0],
        duel.state.tanks[1]!.position[1] - tankStart[1],
      ),
    ).toBeGreaterThan(0.5)
    expect(
      Math.hypot(
        duel.state.engineers[1]!.position[0] - engineerStart[0],
        duel.state.engineers[1]!.position[1] - engineerStart[1],
      ),
    ).toBeGreaterThan(0.5)
    expect(duel.state.flagScores[1]).toBeGreaterThan(0)
  })

  it('does not mix system fallback into a Buddy strategy in practice mode', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    const actions = await decideAgentActions({
      ...duel,
      flag: [2.5, 1.5] as [number, number],
    })

    expect(actions).toEqual([])
  })

  it('runs split Buddy handlers through the live Worker sandbox', async () => {
    const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    let workerBlob: Blob | null = null
    URL.createObjectURL = ((blob: Blob) => {
      workerBlob = blob
      return 'blob:warbuddy-worker-test'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL

    class TestWorker {
      onmessage: ((event: { data: { actions?: unknown[] } }) => void) | null = null
      onerror: (() => void) | null = null

      terminate() {}

      postMessage(data: unknown) {
        void (async () => {
          try {
            const source = await workerBlob?.text()
            if (!source) throw new Error('missing_worker_source')
            const workerSelf = {
              onmessage: null as ((event: { data: unknown }) => void) | null,
              postMessage: (payload: { actions?: unknown[] }) => {
                this.onmessage?.({ data: payload })
              },
            }
            runInNewContext(source, {
              self: workerSelf,
              Number,
              Math,
              Error,
            })
            workerSelf.onmessage?.({ data })
          } catch {
            this.onerror?.()
          }
        })()
      }
    }

    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: TestWorker,
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        setTimeout,
        clearTimeout,
      },
    })

    try {
      const duel = createHumanDuel({
        mapId: 'test',
        mapName: 'Test Map',
        mapRaw: MOVE_MAP,
        humanName: 'Human',
        humanSkillType: 'shield',
        agent: {
          id: 'agent',
          name: 'Agent',
          skillType: 'boost',
          code: [
            'function onTankIdle(tank) { tank.moveTo(5, 1); }',
            'function onEngineerIdle(engineer) { engineer.moveTo(5, 1); }',
          ].join('\n'),
        },
      })
      const actions = await decideAgentActions(duel)

      expect(actions.some((action) => isTankDrive(action) && action.x > 0)).toBe(true)
      expect(actions.some(isEngineerDrive)).toBe(true)

      const aggressive = createHumanDuel({
        mapId: 'test',
        mapName: 'Test Map',
        mapRaw: MOVE_MAP,
        humanName: 'Human',
        humanSkillType: 'shield',
        agent: {
          id: 'agent',
          name: 'Agent',
          skillType: 'shield',
          code: DEFAULT_TANK_STRATEGY_CODE,
        },
      })
      aggressive.tanks[1].position = [1.5, 1.58]
      aggressive.tanks[1].heading = 0
      aggressive.tanks[1].direction = 'right'
      aggressive.tanks[0].position = [5.5, 1.5]

      expect(await decideAgentActions(aggressive)).toContainEqual(tankFire())
    } finally {
      if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker)
      else delete (globalThis as { Worker?: unknown }).Worker
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
      else delete (globalThis as { window?: unknown }).window
      URL.createObjectURL = originalCreateObjectUrl
      URL.revokeObjectURL = originalRevokeObjectUrl
    }
  })

  it('drives the practice system tank out of bomb blast lanes', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.tanks[1].position = [1.5, 1.5]
    duel.bombs = [
      { id: 'lane-bomb', owner: 0, position: [2.5, 1.5], range: 2, remainingFrames: 30 },
    ]
    duel.star = [5.5, 1.5]

    const actions = await decideAgentActions(duel)
    const drive = actions.find(isTankDrive)

    expect(drive).toEqual(expect.objectContaining({ type: 'unit.drive', unit: TANK_UNIT }))
    expect(drive?.y ?? 0).toBeGreaterThan(0)
  })

  it('makes the practice system tank shoot soft obstacles blocking an objective', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: SOFT_BLOCKED_LANE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.tanks[1].heading = 0
    duel.tanks[1].direction = 'right'
    duel.star = [5.5, 1.5]

    const actions = await decideAgentActions(duel)

    expect(actions).toContainEqual(tankFire())
  })

  it('drives the practice engineer sideways out of enemy shell lanes', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.engineers[1].position = [3.5, 1.5]
    duel.tanks[0].position = [1.5, 1.5]
    duel.tanks[1].position = [5.5, 4.5]
    duel.bullets = [
      {
        id: 'danger-shell',
        owner: 0,
        position: [1.5, 1.5],
        heading: 0,
        direction: 'right',
        alive: true,
        age: 0,
      },
    ]

    const actions = await decideAgentActions(duel)
    const drive = actions.find(isEngineerDrive)
    const next = stepHumanDuel(duel, [], actions)

    expect(drive).toEqual(expect.objectContaining({ type: 'unit.drive', unit: ENGINEER_UNIT }))
    expect(Math.abs(drive?.y ?? 0)).toBeGreaterThan(0.4)
    expect(next.state.engineers[1]!.alive).toBe(true)
  })

  it('keeps the practice engineer off enemy tank crush paths', async () => {
    const duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.engineers[1].position = [3.5, 1.5]
    duel.tanks[0].position = [1.5, 1.5]
    duel.tanks[0].heading = 0
    duel.tanks[0].direction = 'right'
    duel.tanks[0].velocity = [0.1, 0]
    duel.tanks[1].position = [5.5, 4.5]

    const actions = await decideAgentActions(duel)
    const drive = actions.find(isEngineerDrive)
    const next = stepHumanDuel(duel, [], actions)

    expect(drive).toEqual(expect.objectContaining({ type: 'unit.drive', unit: ENGINEER_UNIT }))
    expect(Math.abs(drive?.y ?? 0)).toBeGreaterThan(0.4)
    expect(next.state.engineers[1]!.alive).toBe(true)
  })

  it('lets the practice engineer mine predicted enemy tank paths when it has an escape route', async () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: MOVE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.engineers[1].position = [3.5, 3.5]
    duel.tanks[0].position = [4.5, 1.5]
    duel.tanks[0].heading = 180
    duel.tanks[0].direction = 'left'
    duel.tanks[0].velocity = [-0.08, 0]
    duel.tanks[1].position = [5.5, 4.5]

    let planted = false
    for (let frame = 0; frame < 30 && !planted; frame += 1) {
      const actions = await decideAgentActions(duel)
      planted = actions.some(
        (action) =>
          action.type === 'unit.ability' &&
          action.unit.kind === 'engineer' &&
          action.ability === 'bomb',
      )
      duel = stepHumanDuel(duel, [], actions)
    }

    expect(planted).toBe(true)
    expect(duel.state.engineers[1]!.alive).toBe(true)
  })

  it('uses radius-aware A* routing instead of driving into a wall corner', async () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: RADIUS_PATH_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'shield',
        code: '',
      },
    })
    duel = { ...duel, flag: [5.5, 2.5] as [number, number] }

    const actions = await decideAgentActions(duel)
    const drive = actions.find(isTankDrive)

    expect(drive).toEqual(expect.objectContaining({ type: 'unit.drive', unit: TANK_UNIT }))
    expect(drive?.x ?? 0).toBeGreaterThan(0.8)
    expect(drive ? Math.abs(drive.y) : 1).toBeLessThan(0.1)

    for (let i = 0; i < 150 && duel.state.flagScores[1] === 0; i += 1) {
      duel = stepHumanDuel(duel, [], await decideAgentActions(duel))
    }

    expect(duel.state.flagScores[1]).toBeGreaterThan(0)
  })

  it('recenters before following an A* waypoint that would scrape a wall corner', async () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: RADIUS_PATH_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'shield',
        code: '',
      },
    })
    duel.tanks[1].position = [2.67, 2.02]
    duel = { ...duel, flag: [5.5, 2.5] as [number, number] }
    const start = [...duel.tanks[1].position] as [number, number]

    const actions = await decideAgentActions(duel)
    const drive = actions.find(isTankDrive)

    expect(drive).toEqual(expect.objectContaining({ type: 'unit.drive', unit: TANK_UNIT }))
    expect(drive?.y ?? 0).toBeLessThan(0)

    const next = stepHumanDuel(duel, [], actions)
    expect(next.state.tanks[1]!.crashed).toBe(false)
    expect(next.state.tanks[1]!.position[1]).toBeLessThan(start[1])
  })

  it('lets the practice engineer plant bombs to open soft terrain', async () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: SOFT_TERRAIN_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.tanks[1].position = [5.5, 4.5]
    duel.engineers[1].position = [1.5, 2.5]
    duel.map[2]![2] = 'm'

    let planted = false
    for (let frame = 0; frame < 40 && !planted; frame += 1) {
      const actions = await decideAgentActions(duel)
      planted = actions.some(
        (action) =>
          action.type === 'unit.ability' &&
          action.unit.kind === 'engineer' &&
          action.ability === 'bomb',
      )
      if (!planted) duel = stepHumanDuel(duel, [], actions)
    }

    expect(planted).toBe(true)
  })

  it('moves the practice engineer out of its own bomb blast before the fuse expires', async () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: SOFT_TERRAIN_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'boost',
        code: '',
      },
    })
    duel.tanks[1].position = [5.5, 4.5]
    duel.engineers[1].position = [1.5, 2.5]
    duel.map[2]![2] = 'm'

    let planted = false
    for (let frame = 0; frame < 40 && !planted; frame += 1) {
      const actions = await decideAgentActions(duel)
      planted = actions.some(
        (action) =>
          action.type === 'unit.ability' &&
          action.unit.kind === 'engineer' &&
          action.ability === 'bomb',
      )
      duel = stepHumanDuel(duel, [], actions)
    }
    expect(planted).toBe(true)

    for (
      let i = 0;
      i < DEFAULT_WARBUDDY_RULES.units.engineer.bombFuseFrames + 4 && duel.status === 'running';
      i += 1
    ) {
      duel = stepHumanDuel(duel, [], await decideAgentActions(duel))
    }

    expect(duel.state.engineers[1]!.alive).toBe(true)
    expect(duel.state.engineers[1]!.death).toBeNull()
  })

  it('aligns the tank heading to the wall-parallel slide direction', () => {
    let duel = createHumanDuel({
      mapId: 'test',
      mapName: 'Test Map',
      mapRaw: WALL_SLIDE_MAP,
      humanName: 'Human',
      humanSkillType: 'shield',
      agent: {
        id: 'agent',
        name: 'Agent',
        skillType: 'shield',
        code: 'function onIdle(me) { me.tank.aim("right"); }',
      },
    })
    duel.tanks[0].position = [5.65, 2.5]

    duel = stepHumanDuel(duel, [tankDrive(1, 1)], [])

    expect(duel.state.tanks[0]!.position[0]).toBeCloseTo(5.65, 2)
    expect(duel.state.tanks[0]!.position[1]).toBeGreaterThan(2.5)
    expect(duel.state.tanks[0]!.direction).toBe('down')
    expect(duel.state.tanks[0]!.headingDegrees).toBeCloseTo(90, 0)
  })
})
