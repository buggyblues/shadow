// ══════════════════════════════════════════════════════════════
// System — Frustum Culling (bitECS, per-entity EID)
// ══════════════════════════════════════════════════════════════

import { Transform } from '../../components/transformComponent'
import type { ViewportData } from '../../components/viewportComponent'
import { Visibility } from '../../components/visibilityComponent'

const PADDING = 48

/** Test one entity EID against the viewport. */
export function frustumCullSystem(eid: number, viewport: ViewportData): void {
  const screenX = (Transform.x[eid] - viewport.offsetX) * viewport.zoom
  const screenY = (Transform.y[eid] - viewport.offsetY) * viewport.zoom
  const margin = Math.max(Transform.width[eid], Transform.height[eid]) * viewport.zoom + PADDING * 2

  Visibility.screenX[eid] = screenX
  Visibility.screenY[eid] = screenY
  Visibility.visible[eid] =
    screenX >= -margin &&
    screenX <= viewport.screenW + margin &&
    screenY >= -margin &&
    screenY <= viewport.screenH + margin
      ? 1
      : 0
}
