import { terrainRule } from './rules.js'
import type { BattleMap, Tile } from './types.js'

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
          direction: 'right',
        }
        map[x]![y] = '.'
      } else {
        const tile = char as Tile
        map[x]![y] = terrainRule(tile) ? tile : 'x'
      }
    }
  })

  if (!players[0] || !players[1]) {
    throw new Error(`Battle map ${input.id} must include A and B spawn points`)
  }
  players[0].direction = spawnDirection(players[0].position, players[1].position)
  players[1].direction = spawnDirection(players[1].position, players[0].position)
  return { ...input, map, players }
}

function spawnDirection(position: [number, number], enemy: [number, number]) {
  const dx = enemy[0] - position[0]
  const dy = enemy[1] - position[1]
  if (Math.abs(dx) >= Math.abs(dy)) return dy >= 0 ? 'down' : 'up'
  return dx >= 0 ? 'right' : 'left'
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
      'xA......ooo.......x',
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
      'x.......ooo......Bx',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
  parseBattleMap({
    id: 'river-forks',
    name: 'River forks',
    raw: [
      'xxxxxxxxxxxxxxxxxxx',
      'xA....o....ww.....x',
      'x.xxx.o.xx.ww.xxx.x',
      'x...x....m....x...x',
      'x.m.x.ooooooo.x.m.x',
      'x...x....w....x...x',
      'xxx...xx.w.xx...xxx',
      'x.....m..w..m.....x',
      'xxx...xx.w.xx...xxx',
      'x...x....w....x...x',
      'x.m.x.ooooooo.x.m.x',
      'x...x....m....x...x',
      'x.xxx.ww.xx.o.xxx.x',
      'x.....ww....o....Bx',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
  parseBattleMap({
    id: 'scrap-switchbacks',
    name: 'Scrap switchbacks',
    raw: [
      'xxxxxxxxxxxxxxxxxxx',
      'xA..m....x....m...x',
      'x.xx.mxx.x.xx.mxx.x',
      'x....m...o...m....x',
      'xxx.xxxxxmxxxxx.x.x',
      'x...o...m.m...o...x',
      'x.xxxxx.x.x.xxxxx.x',
      'x...m...w.w...m...x',
      'x.xxxxx.x.x.xxxxx.x',
      'x...o...m.m...o...x',
      'x.x.xxxxxmxxxxx.xxx',
      'x....m...o...m....x',
      'x.xx.mxx.x.xx.mxx.x',
      'x...m....x....m..Bx',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
  parseBattleMap({
    id: 'quarry-rings',
    name: 'Quarry rings',
    raw: [
      'xxxxxxxxxxxxxxxxxxx',
      'xA....m.....m.....x',
      'x.xxx.m.xxx.m.xxx.x',
      'x.x...m.o.m...x...x',
      'x.x.xxxxxmxxxxx.x.x',
      'x...x...o.o...x...x',
      'xxx.x.xxw.wxx.x.xxx',
      'x...m...w.w...m...x',
      'xxx.x.xxw.wxx.x.xxx',
      'x...x...o.o...x...x',
      'x.x.xxxxxmxxxxx.x.x',
      'x...x...m.o.m...x.x',
      'x.xxx.m.xxx.m.xxx.x',
      'x.....m.....m....Bx',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
  parseBattleMap({
    id: 'orchard-ambush',
    name: 'Orchard ambush',
    raw: [
      'xxxxxxxxxxxxxxxxxxx',
      'xA...ooo...m......x',
      'x.xxx.o.xxx.m.xxx.x',
      'x.....o.....m.....x',
      'x.mmmmm.ooo.mmmmm.x',
      'x.......o.........x',
      'xxx.xx..w..xx.xxx.x',
      'x...o...w...o.....x',
      'x.xxx.xxw..xx.xxx.x',
      'x.........o.......x',
      'x.mmmmm.o.oo.mmmmmx',
      'x.....m.....o.....x',
      'x.xxx.m.xxx.o.xxx.x',
      'x......m...ooo...Bx',
      'xxxxxxxxxxxxxxxxxxx',
    ].join('|'),
  }),
]

export function chooseMap(mapId: string | undefined, rng: () => number) {
  if (!mapId || mapId === 'random') return BATTLE_MAPS[Math.floor(rng() * BATTLE_MAPS.length)]!
  return BATTLE_MAPS.find((map) => map.id === mapId) ?? BATTLE_MAPS[0]!
}
