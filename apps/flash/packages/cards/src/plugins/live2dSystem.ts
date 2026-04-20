// ECS Content System — Live2D Virtual Character Card
//
// Renders a Live2D model (Cubism 4 / .model3.json) onto the card canvas
// via PixiJS + pixi-live2d-display (dynamic import, code-split).
//
// Interaction: when the card is hovered, the model tracks the pointer
// position using interaction.mouseLocalX/Y → animationManager.focusLive2D().
//
// The card renders the model directly — no extra background/border unless
// the meta explicitly sets `background`.
//
// Performance contract:
//  - animationManager.registerLive2D() registers the card as autoplay (once).
//  - animationManager.tick() renders new frames and increments frameVersion.
//  - live2dSystem checks frameVersion: if the model hasn't rendered a new frame
//    since the last card bake, we skip the drawImage + texture re-upload entirely.
//    This prevents a full GL texture upload every frame when there is no new pixel data.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { Interaction } from '../components/interactionComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { live2dMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

/** Per-entity cache of the last live2d frameVersion that was blit into the card canvas. */
const _lastBlitVersion = new Map<number, number>()

export function live2dSystem(eid: number): boolean {
  const meta = live2dMetaStore[eid]
  if (!meta) return false

  const modelUrl = meta.modelUrl
  if (!modelUrl) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!
  const availH = remainingH(layout)
  const viewH = Math.min(availH - 8, contentW * 1.4)
  const viewW = contentW
  const vX = padX,
    vY = layout.cursorY + 2

  // ── Forward pointer to Live2D model for eye/body tracking ──
  if (Interaction.hovered[eid]) {
    animationManager.focusLive2D(
      card.id,
      Interaction.mouseLocalX[eid],
      Interaction.mouseLocalY[eid],
    )
  }

  // NOTE: markAutoplay is NOT called here; it is registered once inside
  // animationManager.registerLive2D() so it doesn't run on every pipeline pass.

  // ── Get or create the Live2D render canvas ──────────────
  let live2dCanvas = animationManager.getLive2DCanvas(card.id)

  if (!live2dCanvas) {
    const px = Math.round(viewW * 2)
    const py = Math.round(viewH * 2)
    animationManager.registerLive2D(card.id, modelUrl, px, py, meta.autoMotion !== false)
    // Show loading skeleton on first frame
    const isLoading = animationManager.isLive2DLoading(card.id)

    if (isLoading) {
      // Skeleton placeholder
      ctx.fillStyle = hexAlpha(accentColor, 0.04)
      fillRoundRect(ctx, vX, vY, viewW, viewH, 8)

      // Animated loading arc
      const cx = vX + viewW / 2,
        cy = vY + viewH / 2
      const r = Math.min(viewW, viewH) * 0.12
      ctx.strokeStyle = hexAlpha(accentColor, 0.5)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 1.5)
      ctx.stroke()
      ctx.strokeStyle = hexAlpha(accentColor, 0.15)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()

      // Label
      ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.45)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('Loading Live2D…', cx, cy + r + 8)
    }

    advance(layout, viewH + 8)

    // Name
    const name = safeStr(meta.name)
    if (name && remainingH(layout) > 10) {
      ctx.font = fontStr(8, 'bold', '', '"Noto Sans SC", sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.85)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(name, padX + viewW / 2, layout.cursorY + 2)
      advance(layout, 12)
    }

    return true
  }

  // ── Blit Live2D canvas if model has a new frame ──
  // frameVersion is incremented by animationManager.tick() after each PIXI render.
  // If unchanged, skip drawImage (the dirty flag already ensures the GL texture
  // won't be re-uploaded, so no work is lost).
  // CRITICAL: always return true regardless — returning false here would let the
  // next content system paint over this card, causing a rendering corruption bug.
  const currentVersion = animationManager.getLive2DFrameVersion(card.id)
  const lastVersion = _lastBlitVersion.get(eid) ?? -1
  if (currentVersion !== lastVersion) {
    _lastBlitVersion.set(eid, currentVersion)

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(vX, vY, viewW, viewH, 8)
    ctx.clip()
    ctx.drawImage(live2dCanvas, vX, vY, viewW, viewH)
    ctx.restore()
  }

  advance(layout, viewH + 8)

  // Name
  const name = safeStr(meta.name)
  if (name && remainingH(layout) > 10) {
    ctx.font = fontStr(8, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.85)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(name, padX + viewW / 2, layout.cursorY + 2)
    advance(layout, 12)
  }

  return true
}
