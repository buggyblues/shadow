// ECS Content System — Lottie Animation Card
// Uses lottie-web canvas renderer via AnimationManager.
// On first bake: initiates load + shows loading skeleton.
// On subsequent bakes (triggered by lottie enterFrame events):
//   blits the live lottie canvas directly onto the card canvas.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { lottieMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

export function lottieSystem(eid: number): boolean {
  const meta = lottieMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  const availH = remainingH(layout)
  const previewH = Math.min(availH - 30, contentW * 0.9)
  const previewW = contentW
  const pX = padX,
    pY = layout.cursorY + 2

  // ── Attempt to get live lottie canvas ──────────────────
  const src = meta.src as string | undefined
  if (src) {
    const lottieCanvas = animationManager.registerLottie(
      card.id,
      src,
      meta.loop !== false,
      meta.autoplay === true,
    )

    if (lottieCanvas) {
      // Live frame available — blit with contain aspect ratio, no background
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(pX, pY, previewW, previewH, 6)
      ctx.clip()
      const sw = lottieCanvas.width || 180,
        sh = lottieCanvas.height || 260
      const scale = Math.min(previewW / sw, previewH / sh)
      const dw = sw * scale,
        dh = sh * scale
      const dx = pX + (previewW - dw) / 2,
        dy = pY + (previewH - dh) / 2
      ctx.drawImage(lottieCanvas, dx, dy, dw, dh)
      ctx.restore()

      advance(layout, previewH + 8)
      return true
    }
  }

  // ── Loading / no-src fallback placeholder ─────────────
  // Spinning arc loader
  const cx = pX + previewW / 2,
    cy = pY + previewH / 2
  const r = Math.min(previewW, previewH) * 0.22
  ctx.strokeStyle = hexAlpha(accentColor, 0.7)
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 1.5)
  ctx.stroke()
  ctx.strokeStyle = hexAlpha(accentColor, 0.2)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // Loading label
  const loadingLabel = animationManager.isLottieLoading(card.id)
    ? 'Loading animation…'
    : safeStr(meta.animationName) || 'Lottie'
  ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
  ctx.fillStyle = hexAlpha(accentColor, 0.6)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(loadingLabel, cx, cy + r + 6)

  if (!src) {
    ctx.font = fontStr(6, '', 'italic', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.35)
    ctx.fillText('No animation source set', cx, cy + r + 18)
  }

  advance(layout, previewH + 8)
  return true
}
