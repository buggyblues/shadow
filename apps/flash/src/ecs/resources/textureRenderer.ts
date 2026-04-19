// ══════════════════════════════════════════════════════════════
// Card Content Texture — Public API
//
// Thin dispatcher: wires ECS cache + canvas manager + pipeline.
// Exports stay identical so WebGLCardRenderer needs zero changes.
// ══════════════════════════════════════════════════════════════

import type { Card } from '../../types'
import { bootstrapECS } from '../bootstrap'
import { runPipeline } from '../world'
import { setupCanvas } from './canvasManager'
import {
  type CardTextureInfo,
  cardHash,
  clearAllTextures,
  getCachedTexture,
  removeCachedTexture,
  setCachedTexture,
} from './textureCache'

bootstrapECS()

export type { CardTextureInfo }

// ════════════════════════════════════════
// ── Public API ──
// ════════════════════════════════════════

export function renderCardTexture(
  card: Card,
  width: number,
  height: number,
  lodScale?: number,
): CardTextureInfo {
  const cached = getCachedTexture(card.id)
  const version = cardHash(card)
  const requestedLod = lodScale ?? Math.min(Math.ceil(window.devicePixelRatio || 1), 2)

  if (cached && cached.cardVersion === version && cached.lodScale === requestedLod) {
    cached.needsUpdate = false
    return cached
  }

  const { canvas, ctx, texScale } = setupCanvas(cached?.canvas, width, height, requestedLod)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.scale(texScale, texScale)
  runPipeline(ctx, card, width, height)
  ctx.restore()

  const info: CardTextureInfo = {
    canvas,
    needsUpdate: true,
    cardVersion: version,
    lodScale: requestedLod,
  }
  setCachedTexture(card.id, info)
  return info
}

export function removeCardTexture(cardId: string) {
  removeCachedTexture(cardId)
}

export function clearTextureCache() {
  clearAllTextures()
}
