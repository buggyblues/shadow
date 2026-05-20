// ══════════════════════════════════════════════════════════════
// Card Content Texture — Public API
//
// Thin dispatcher: wires ECS cache + canvas manager + pipeline.
// Exports stay identical so WebGLCardRenderer needs zero changes.
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import { bootstrapCards } from '../core/bootstrap'
import { runPipeline } from '../core/world'
import { cardAssetPipeline } from './assetPipeline'
import { setupCanvas } from './canvasManager'
import {
  type CardTextureInfo,
  cardHash,
  clearAllTextures,
  getCachedTexture,
  removeCachedTexture,
  setCachedTexture,
} from './textureCache'

// Ensure built-in plugins are always registered before any texture render,
// regardless of whether CardRenderer has been instantiated yet.
// bootstrapCards() is idempotent (no-op after first call).
bootstrapCards()

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
  const backend = cardAssetPipeline.getFaceBackend(card.kind).id
  const frame = cardAssetPipeline.currentFrame()

  if (cached && cached.cardVersion === version && cached.lodScale === requestedLod) {
    cached.needsUpdate = false
    cached.lastTouchedFrame = frame.frameId
    cached.lastUsedAt = performance.now()
    return cached
  }

  const { canvas, ctx, texScale } = setupCanvas(cached?.canvas, width, height, requestedLod)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.scale(texScale, texScale)
  runPipeline(ctx, card, width, height)
  ctx.restore()

  const byteSize = canvas.width * canvas.height * 4
  cardAssetPipeline.recordCardFaceBake({
    cardId: card.id,
    backend,
    version,
    lodScale: requestedLod,
    bytes: byteSize,
  })

  const info: CardTextureInfo = {
    canvas,
    needsUpdate: true,
    cardVersion: version,
    lodScale: requestedLod,
    byteSize,
    lastTouchedFrame: frame.frameId,
    lastUsedAt: performance.now(),
    backend,
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
