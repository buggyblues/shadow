// ECS Content System — Live2D Virtual Character Card
//
// Draws a static poster/stage for a Live2D model. Runtime loading is owned by
// ECS runtimePrepareSystem, and active frames are composited as a GPU layer.
//
// Interaction: when the card is hovered, the model tracks the pointer
// position using interaction.mouseLocalX/Y → animationManager.focusLive2D().
//
// The card renders the model directly — no extra background/border unless
// the meta explicitly sets `background`.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { Interaction } from '../components/interactionComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { live2dMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

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

  const autoplay = (meta as { autoplay?: boolean }).autoplay === true
  animationManager.setAutoplay(card.id, autoplay)
  animationManager.setLayerRect(card.id, {
    x: vX,
    y: vY,
    w: viewW,
    h: viewH,
    radius: 8,
    fit: 'fill',
  })

  // ── Runtime canvas is prepared by ECS runtimePrepareSystem ──────────────
  const live2dCanvas = animationManager.getLive2DCanvas(card.id)

  if (!live2dCanvas) {
    // Show loading skeleton on first frame
    const isLoading = animationManager.isLive2DLoading(card.id)

    if (isLoading) {
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
    } else {
      drawLive2DIdlePreview(
        ctx,
        vX,
        vY,
        viewW,
        viewH,
        accentColor,
        safeStr(meta.name) || card.title,
      )
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

  drawLive2DPoster(ctx, live2dCanvas, vX, vY, viewW, viewH)

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

function drawLive2DIdlePreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accentColor: string,
  label: string,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.clip()

  const cx = x + w / 2
  const cy = y + h * 0.46
  const r = Math.min(w, h) * 0.22
  ctx.lineWidth = 2
  ctx.strokeStyle = hexAlpha(accentColor, 0.42)
  ctx.beginPath()
  ctx.arc(cx, cy, r, -0.25, Math.PI * 1.36)
  ctx.stroke()

  ctx.strokeStyle = hexAlpha(accentColor, 0.16)
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.66, Math.PI * 0.15, Math.PI * 1.82)
  ctx.stroke()

  ctx.fillStyle = hexAlpha(accentColor, 0.28)
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(2, r * 0.06), 0, Math.PI * 2)
  ctx.fill()

  ctx.font = fontStr(7, 700, '', '"Noto Sans SC", sans-serif')
  ctx.fillStyle = hexAlpha(accentColor, 0.56)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label.slice(0, 22), cx, y + h - 18)
  ctx.restore()
}

function drawLive2DPoster(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.clip()
  ctx.drawImage(canvas, x, y, w, h)
  ctx.restore()
}
