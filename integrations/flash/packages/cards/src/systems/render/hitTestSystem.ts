// ══════════════════════════════════════════════════════════════
// System — Hit Test (bitECS, per-entity EID)
// ══════════════════════════════════════════════════════════════

import { Transform } from '../../components/transformComponent'

/** Test if a world-space point is inside the entity's card. */
export function hitTestPoint(
  eid: number,
  worldX: number,
  worldY: number,
  cardW: number,
  cardH: number,
): boolean {
  const dx = worldX - Transform.x[eid]
  const dy = worldY - Transform.y[eid]
  const cos = Math.cos(-Transform.angle[eid])
  const sin = Math.sin(-Transform.angle[eid])
  const lx = dx * cos - dy * sin
  const ly = dx * sin + dy * cos
  return Math.abs(lx) <= cardW / 2 && Math.abs(ly) <= cardH / 2
}

/** Test if the entity's centre is within a world-space AABB. */
export function hitTestRect(
  eid: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  return (
    Transform.x[eid] >= minX &&
    Transform.x[eid] <= maxX &&
    Transform.y[eid] >= minY &&
    Transform.y[eid] <= maxY
  )
}
