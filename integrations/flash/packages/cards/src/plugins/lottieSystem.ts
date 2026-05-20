// ECS Content System — Lottie Animation Card
// Draws only the static stage/poster. Runtime loading is owned by ECS
// runtimePrepareSystem, and active frames are composited as a GPU layer.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { lottieMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

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
    const autoplay = meta.autoplay === true
    animationManager.setAutoplay(card.id, autoplay)
    const lottieCanvas = animationManager.getLottieCanvas(card.id)
    animationManager.setLayerRect(card.id, {
      x: pX,
      y: pY,
      w: previewW,
      h: previewH,
      radius: 6,
      fit: 'contain',
    })

    if (lottieCanvas) {
      drawCanvasContain(ctx, lottieCanvas, pX, pY, previewW, previewH, 6)
    } else {
      const palette = Array.isArray(meta.palette)
        ? meta.palette.filter((color): color is string => typeof color === 'string')
        : [accentColor]
      drawLottiePoster(
        ctx,
        pX,
        pY,
        previewW,
        previewH,
        6,
        palette.length > 0 ? palette : [accentColor],
        safeStr(meta.animationName) || card.title,
      )
    }
    advance(layout, previewH + 8)
    return true
  }

  if (!src) {
    const palette = Array.isArray(meta.palette)
      ? meta.palette.filter((color): color is string => typeof color === 'string')
      : [accentColor]
    drawLottiePoster(
      ctx,
      pX,
      pY,
      previewW,
      previewH,
      6,
      palette.length > 0 ? palette : [accentColor],
      safeStr(meta.animationName) || card.title,
    )
    advance(layout, previewH + 8)
    return true
  }

  return false
}

function drawLottiePoster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  palette: string[],
  label: string,
): void {
  const c0 = palette[0] ?? '#a855f7'
  const c1 = palette[1] ?? c0
  const c2 = palette[2] ?? '#ffffff'
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.clip()

  const cx = x + w / 2
  const cy = y + h / 2
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.strokeStyle = hexAlpha(c0, 0.7)
  ctx.beginPath()
  ctx.arc(cx, cy, Math.min(w, h) * 0.23, -0.4, Math.PI * 1.35)
  ctx.stroke()

  ctx.fillStyle = hexAlpha(c1, 0.78)
  ctx.beginPath()
  ctx.arc(cx - w * 0.12, cy - h * 0.08, Math.min(w, h) * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = hexAlpha(c2, 0.72)
  ctx.beginPath()
  ctx.arc(cx + w * 0.14, cy + h * 0.09, Math.min(w, h) * 0.06, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = fontStr(7, 800, '', '"Noto Sans SC", sans-serif')
  ctx.fillStyle = hexAlpha(c0, 0.78)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label.slice(0, 18), cx, y + h - 14)
  ctx.restore()
}

function drawCanvasContain(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.clip()
  const scale = Math.min(w / canvas.width, h / canvas.height)
  const drawW = canvas.width * scale
  const drawH = canvas.height * scale
  ctx.drawImage(canvas, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH)
  ctx.restore()
}
