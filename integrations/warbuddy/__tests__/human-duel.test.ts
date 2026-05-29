import { describe, expect, it } from 'vitest'
import {
  createHumanDuel,
  decideAgentActions,
  heldKeysToDuelActions,
  keyToDuelAction,
  stepHumanDuel,
} from '../src/client/human-duel'

const MOVE_MAP = ['xxxxxxx', 'xB....x', 'x.....x', 'x..A..x', 'x.....x', 'xxxxxxx'].join('|')
const BLOCK_MAP = ['xxxxxxx', 'x.....x', 'x..B..x', 'x..A..x', 'x.....x', 'xxxxxxx'].join('|')
const SMART_MAP = ['xxxxxxx', 'xB...xx', 'xxx.x.x', 'x...A.x', 'x.....x', 'xxxxxxx'].join('|')
const SIGHT_MAP = ['xxxxxxx', 'xB...Ax', 'x.....x', 'x.....x', 'xxxxxxx'].join('|')
const GRASS_MAP = ['xxxxxxx', 'xB.o..x', 'x....Ax', 'x.....x', 'xxxxxxx'].join('|')
const WALL_SLIDE_MAP = ['xxxxxxx', 'xB....x', 'x....Ax', 'x.....x', 'xxxxxxx'].join('|')

describe('human duel controls', () => {
  it('maps keyboard input to live tank actions', () => {
    expect(keyToDuelAction('w')).toEqual({ type: 'move', direction: 'up' })
    expect(keyToDuelAction('ArrowDown')).toEqual({ type: 'move', direction: 'down' })
    expect(keyToDuelAction('a')).toEqual({ type: 'move', direction: 'left' })
    expect(keyToDuelAction('ArrowRight')).toEqual({ type: 'move', direction: 'right' })
    expect(keyToDuelAction('i')).toEqual({ type: 'engineerMove', direction: 'up' })
    expect(keyToDuelAction('u')).toEqual({ type: 'engineerBomb' })
    expect(keyToDuelAction('q')).toEqual({ type: 'fire' })
    expect(keyToDuelAction(' ')).toEqual({ type: 'fire' })
    expect(keyToDuelAction('e')).toEqual({ type: 'skill' })
    expect(heldKeysToDuelActions(['w', 'd', 'i', 'l'])).toEqual([
      { type: 'drive', x: 1, y: -1 },
      { type: 'engineerDrive', x: 1, y: -1 },
    ])
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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })

    const start = duel.state.tanks[0]!.position
    const up = stepHumanDuel(duel, [{ type: 'move', direction: 'up' }], [])
    const left = stepHumanDuel(up, [{ type: 'move', direction: 'left' }], [])
    const down = stepHumanDuel(left, [{ type: 'move', direction: 'down' }], [])
    const right = stepHumanDuel(down, [{ type: 'move', direction: 'right' }], [])

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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })

    let enemyBlocked = duel
    for (let i = 0; i < 16; i += 1) {
      enemyBlocked = stepHumanDuel(enemyBlocked, [{ type: 'move', direction: 'up' }], [])
    }
    let wallBlocked = duel
    for (let i = 0; i < 40; i += 1) {
      wallBlocked = stepHumanDuel(wallBlocked, [{ type: 'move', direction: 'right' }], [])
    }

    expect(enemyBlocked.state.tanks[0]!.position[1]).toBeGreaterThan(3.05)
    expect(wallBlocked.state.tanks[0]!.position[0]).toBeLessThan(5.75)
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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })

    duel = stepHumanDuel(duel, [{ type: 'move', direction: 'right' }], [])
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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })
    duel = { ...duel, star: [4.5, 1.5] as [number, number] }

    for (let i = 0; i < 55 && duel.star; i += 1) {
      duel = stepHumanDuel(duel, [], await decideAgentActions(duel))
    }

    expect(duel.star).toBeNull()
    expect(
      (duel.state.tanks[1]?.stars ?? 0) > 0 || (duel.state.engineers[1]?.bombRange ?? 0) > 2,
    ).toBe(true)
  })

  it('lets the engineer move, collect stars for bomb range, and plant delayed bombs', () => {
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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })
    const start = duel.state.engineers[0]!.position

    duel = stepHumanDuel(duel, [{ type: 'engineerMove', direction: 'right' }], [])
    expect(duel.state.engineers[0]!.position[0]).toBeGreaterThan(start[0])

    duel = { ...duel, star: [...duel.engineers[0].position] as [number, number] }
    duel = stepHumanDuel(duel, [], [])
    expect(duel.state.engineers[0]!.bombRange).toBe(3)
    expect(duel.star).toBeNull()

    duel = stepHumanDuel(duel, [{ type: 'engineerBomb' }], [])
    expect(duel.state.bombs).toHaveLength(1)
    expect(duel.state.bombs[0]?.range).toBe(3)

    for (let i = 0; i < 30; i += 1) duel = stepHumanDuel(duel, [], [])
    duel = stepHumanDuel(duel, [{ type: 'engineerBomb' }], [])
    expect(duel.state.bombs).toHaveLength(1)
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
        code: 'function onIdle(me) { me.turn("right"); }',
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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })
    duel.tanks[0].position = [1.5, 1.5]
    duel.engineers[0].position = [3.5, 3.5]
    duel.tanks[1].position = [5.5, 3.5]
    duel.engineers[1].position = [4.5, 3.5]

    duel = stepHumanDuel(duel, [{ type: 'engineerBomb' }], [])
    for (let i = 0; i < 70 && duel.status === 'running'; i += 1) {
      duel = stepHumanDuel(duel, [], [])
    }

    expect(duel.state.engineers[0]!.alive).toBe(false)
    expect(duel.state.tanks[1]!.crashed).toBe(true)
    expect(duel.state.engineers[1]!.alive).toBe(false)
    expect(duel.result.winner).toBe('human')
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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })
    const ready = structuredClone(duel)
    ready.tanks[1].direction = 'right'
    ready.tanks[1].heading = 0

    const actions = await decideAgentActions(ready)
    expect(actions).toContainEqual({ type: 'fire' })
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
        code: 'function onIdle(me) { me.fire(); }',
      },
    })
    const hidden = structuredClone(duel)
    hidden.tanks[0].position = [3.5, 1.5]
    hidden.tanks[1].heading = 0
    hidden.tanks[1].direction = 'right'

    await expect(decideAgentActions(hidden)).resolves.not.toEqual([{ type: 'fire' }])

    const visible = structuredClone(hidden)
    visible.tanks[0].position = [4.5, 1.5]
    const actions = await decideAgentActions(visible)
    expect(actions).toContainEqual({ type: 'fire' })
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
        code: 'function onIdle(me, enemy) { if (enemy.status && enemy.status.cloaked) me.fire(); }',
      },
    })
    const hidden = structuredClone(duel)
    hidden.tanks[0].position = [3.5, 1.5]
    hidden.tanks[1].heading = 0
    hidden.tanks[1].direction = 'right'

    await expect(decideAgentActions(hidden)).resolves.not.toEqual([{ type: 'fire' }])
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
        code: 'function onIdle(me) { me.turn("right"); }',
      },
    })
    duel.tanks[0].position = [5.65, 2.5]

    duel = stepHumanDuel(duel, [{ type: 'drive', x: 1, y: 1 }], [])

    expect(duel.state.tanks[0]!.position[0]).toBeCloseTo(5.65, 2)
    expect(duel.state.tanks[0]!.position[1]).toBeGreaterThan(2.5)
    expect(duel.state.tanks[0]!.direction).toBe('down')
    expect(duel.state.tanks[0]!.headingDegrees).toBeCloseTo(90, 0)
  })
})
