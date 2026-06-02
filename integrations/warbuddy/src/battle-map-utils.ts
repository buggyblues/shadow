import type { Tile } from './types.js'

export function tileAt(map: Tile[][], position: [number, number]): Tile | null {
  return map[position[0]]?.[position[1]] ?? null
}

export function inBounds(map: Tile[][], position: [number, number]) {
  return Boolean(map[position[0]]?.[position[1]])
}

export function cloneMap(map: Tile[][]): Tile[][] {
  return map.map((column) => [...column])
}
