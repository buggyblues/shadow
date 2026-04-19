// ══════════════════════════════════════════════════════════════
// System — GL Texture (bitECS, per-entity EID)
// ══════════════════════════════════════════════════════════════

import { cardDataStore } from '../components/cardDataComponent'
import { glStateStore } from '../components/glStateComponent'
import { animationManager } from '../resources/animationManager'
import { removeCachedTexture } from '../resources/textureCache'
import { renderCardTexture } from '../resources/textureRenderer'
import { createTexture, updateTexture } from '../utils/glUtils'

function zoomToLodScale(zoom: number, dpr: number): number {
  const needed = zoom * dpr
  if (needed <= 1) return 1
  if (needed <= 2) return 2
  if (needed <= 4) return 4
  return 6
}

export function glTextureSystem(
  eid: number,
  gl: WebGLRenderingContext,
  cardW: number,
  cardH: number,
  zoom: number,
  dpr: number,
  zoomSettled: boolean,
): void {
  const cardData = cardDataStore[eid]
  if (!cardData) return
  const { card } = cardData

  if (animationManager.isDirty(card.id)) {
    removeCachedTexture(card.id)
    animationManager.clearDirty(card.id)
  }

  const lodScale = zoomToLodScale(zoom, dpr)
  const texInfo = renderCardTexture(card, cardW, cardH, lodScale)
  let glState = glStateStore[eid]

  if (!glState) {
    const texture = createTexture(gl, texInfo.canvas as HTMLCanvasElement)
    const glErr = gl.getError()
    if (glErr !== gl.NO_ERROR) {
      console.warn(`[GL] texImage2D error ${glErr} for ${card.id.slice(-6)} (${card.kind})`)
    }
    glState = { texture, lastVersion: texInfo.cardVersion, lastLod: lodScale }
    glStateStore[eid] = glState
  } else if (
    (texInfo.needsUpdate ||
      glState.lastVersion !== texInfo.cardVersion ||
      glState.lastLod !== lodScale) &&
    zoomSettled
  ) {
    updateTexture(gl, glState.texture, texInfo.canvas as HTMLCanvasElement)
    const glErr = gl.getError()
    if (glErr !== gl.NO_ERROR) {
      console.warn(`[GL] updateTexture error ${glErr} for ${card.id.slice(-6)}`)
    }
    glState.lastVersion = texInfo.cardVersion
    glState.lastLod = lodScale
  }
}
