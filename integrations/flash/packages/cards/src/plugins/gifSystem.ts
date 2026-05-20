// ECS Content System — GIF / Animated Image Card
// Draws only the static film stage/poster. Runtime loading is owned by ECS
// runtimePrepareSystem, and active frames are composited as a GPU layer.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { gifMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

export function gifSystem(eid: number): boolean {
  const meta = gifMetaStore[eid]
  if (!meta) return false
  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  const availH = remainingH(layout)
  const frameH = Math.min(availH - 20, contentW * 0.65)
  const frameW = contentW
  const frameX = padX
  const frameY = layout.cursorY + 4

  // ── If src is provided, try to load and animate the GIF ──
  const src = (meta as { src?: string }).src
  if (src) {
    const autoplay = meta.autoplay === true
    animationManager.setAutoplay(card.id, autoplay)
    const active = animationManager.isActive(card.id)
    const img = animationManager.getImage(card.id)
    const stage = active ? drawGifStage(ctx, frameX, frameY, frameW, frameH, accentColor) : null
    const layerRect = stage ?? filmInnerRect(frameX, frameY, frameW, frameH)
    animationManager.setLayerRect(card.id, {
      x: layerRect.innerX,
      y: layerRect.innerY,
      w: layerRect.innerW,
      h: layerRect.innerH,
      radius: 3,
      fit: 'contain',
    })

    if (img) drawGifPoster(ctx, img, frameX, frameY, frameW, frameH, accentColor)
    else if (!active) {
      drawGifPlaceholder(
        ctx,
        frameX,
        frameY,
        frameW,
        frameH,
        accentColor,
        safeStr(meta?.alt || meta?.caption || card.title),
      )
    }

    advance(layout, frameH + 8)

    // Caption + tags
    const caption = safeStr(meta?.caption || meta?.alt)
    if (caption && remainingH(layout) > 12) {
      ctx.font = fontStr(7.5, '', 'italic', '"Noto Sans SC", sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.7)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(caption.slice(0, 40), width / 2, layout.cursorY + 2)
      advance(layout, 12)
    }
    if (meta?.tags && meta.tags.length > 0 && remainingH(layout) > 10) {
      const tagFont = fontStr(6.5, 'bold', '', '"Noto Sans SC", sans-serif')
      ctx.font = tagFont
      let tx = padX
      for (const tag of meta.tags.slice(0, 4)) {
        const tw = ctx.measureText('#' + tag).width + 6
        if (tx + tw > padX + contentW) break
        ctx.fillStyle = hexAlpha(accentColor, 0.15)
        fillRoundRect(ctx, tx, layout.cursorY + 2, tw, 10, 2)
        ctx.fillStyle = accentColor
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('#' + tag, tx + 3, layout.cursorY + 3)
        tx += tw + 4
      }
      advance(layout, 14)
    }
    return true
  }

  // ── Fallback: static filmstrip placeholder ──────────────

  drawGifPlaceholder(
    ctx,
    frameX,
    frameY,
    frameW,
    frameH,
    accentColor,
    safeStr(meta?.alt || meta?.caption || card.title),
  )

  advance(layout, frameH + 8)

  // Caption
  const caption = safeStr(meta?.caption || meta?.alt)
  if (caption && remainingH(layout) > 12) {
    ctx.font = fontStr(7.5, '', 'italic', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.7)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(caption.slice(0, 40), width / 2, layout.cursorY + 2)
    advance(layout, 12)
  }

  // Tags
  if (meta?.tags && meta.tags.length > 0 && remainingH(layout) > 10) {
    const tagFont = fontStr(6.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.font = tagFont
    let tx = padX
    for (const tag of meta.tags.slice(0, 4)) {
      const tw = ctx.measureText('#' + tag).width + 6
      if (tx + tw > padX + contentW) break
      ctx.fillStyle = hexAlpha(accentColor, 0.15)
      fillRoundRect(ctx, tx, layout.cursorY + 2, tw, 10, 2)
      ctx.fillStyle = accentColor
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('#' + tag, tx + 3, layout.cursorY + 3)
      tx += tw + 4
    }
    advance(layout, 14)
  }

  return true
}

function drawFilmShell(
  ctx: CanvasRenderingContext2D,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
): { innerX: number; innerY: number; innerW: number; innerH: number } {
  ctx.fillStyle = 'rgba(15,15,25,0.88)'
  fillRoundRect(ctx, frameX, frameY, frameW, frameH, 6)

  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  const perfH = 6
  const perfGap = 10
  const perfW = 5
  for (let py = frameY + 8; py < frameY + frameH - 8; py += perfGap) {
    fillRoundRect(ctx, frameX + 3, py, perfW, perfH, 1)
    fillRoundRect(ctx, frameX + frameW - perfW - 3, py, perfW, perfH, 1)
  }

  return filmInnerRect(frameX, frameY, frameW, frameH)
}

function filmInnerRect(
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
): { innerX: number; innerY: number; innerW: number; innerH: number } {
  const perfW = 5
  return {
    innerX: frameX + perfW + 7,
    innerY: frameY + 8,
    innerW: frameW - (perfW + 7) * 2,
    innerH: frameH - 16,
  }
}

function drawGifPoster(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  accentColor: string,
): void {
  const { innerX, innerY, innerW, innerH } = drawFilmShell(ctx, frameX, frameY, frameW, frameH)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(innerX, innerY, innerW, innerH, 3)
  ctx.clip()
  const scale = Math.min(innerW / img.naturalWidth, innerH / img.naturalHeight)
  const drawW = img.naturalWidth * scale
  const drawH = img.naturalHeight * scale
  ctx.fillStyle = hexAlpha(accentColor, 0.08)
  ctx.fillRect(innerX, innerY, innerW, innerH)
  ctx.drawImage(img, innerX + (innerW - drawW) / 2, innerY + (innerH - drawH) / 2, drawW, drawH)
  ctx.restore()
}

function drawGifStage(
  ctx: CanvasRenderingContext2D,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  accentColor: string,
): { innerX: number; innerY: number; innerW: number; innerH: number } {
  const inner = drawFilmShell(ctx, frameX, frameY, frameW, frameH)
  ctx.fillStyle = hexAlpha(accentColor, 0.08)
  fillRoundRect(ctx, inner.innerX, inner.innerY, inner.innerW, inner.innerH, 3)
  return inner
}

function drawGifPlaceholder(
  ctx: CanvasRenderingContext2D,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  accentColor: string,
  label: string,
): void {
  const { innerX, innerY, innerW, innerH } = drawFilmShell(ctx, frameX, frameY, frameW, frameH)

  const grad = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH)
  grad.addColorStop(0, hexAlpha(accentColor, 0.5))
  grad.addColorStop(0.52, hexAlpha(accentColor, 0.12))
  grad.addColorStop(1, 'rgba(255,255,255,0.62)')
  ctx.fillStyle = grad
  fillRoundRect(ctx, innerX, innerY, innerW, innerH, 3)

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(innerX, innerY, innerW, innerH, 3)
  ctx.clip()
  ctx.globalAlpha = 0.42
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  for (let i = 0; i < 5; i++) {
    const y = innerY + 8 + i * (innerH / 5)
    ctx.beginPath()
    ctx.moveTo(innerX + 10, y)
    ctx.bezierCurveTo(
      innerX + innerW * 0.38,
      y - 16,
      innerX + innerW * 0.58,
      y + 24,
      innerX + innerW - 12,
      y + 2,
    )
    ctx.stroke()
  }
  ctx.restore()

  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2)

  ctx.fillStyle = hexAlpha(accentColor, 0.9)
  const badgeR = Math.min(innerW, innerH) * 0.2
  fillRoundRect(
    ctx,
    innerX + innerW / 2 - badgeR,
    innerY + innerH / 2 - badgeR * 0.5,
    badgeR * 2,
    badgeR,
    badgeR * 0.25,
  )
  ctx.fillStyle = '#000'
  ctx.font = fontStr(Math.round(badgeR * 0.52), 900, '', 'monospace')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials || 'GIF', innerX + innerW / 2, innerY + innerH / 2)

  ctx.font = fontStr(6, '', '', 'monospace')
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText('24fps', frameX + frameW - 6, frameY + 3)
}
