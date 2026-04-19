// ECS Content System — Image Card
// Loads an image via AnimationManager and blits it onto the card canvas.
// Shows a styled skeleton while loading, then the actual image when ready.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { imageMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

export function imageSystem(eid: number): boolean {
  const meta = imageMetaStore[eid]
  if (!meta) return false
  // Must have a src URL to render as image card
  const src = (meta as { src?: string }).src
  if (!src) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  const availH = remainingH(layout)
  const imgH = Math.min(availH - 20, contentW * 0.85)
  const imgW = contentW
  const imgX = padX
  const imgY = layout.cursorY + 2

  const img = animationManager.getImage(card.id)

  if (!img) {
    // Still loading: register and draw skeleton
    animationManager.registerImage(card.id, src, false)

    // Skeleton background
    ctx.fillStyle = hexAlpha(accentColor, 0.06)
    fillRoundRect(ctx, imgX, imgY, imgW, imgH, 6)

    // Skeleton shimmer lines
    const lineWidths = [0.6, 0.8, 0.5, 0.7]
    lineWidths.forEach((lw, i) => {
      ctx.fillStyle = hexAlpha(accentColor, 0.08)
      fillRoundRect(ctx, imgX + 10, imgY + 10 + i * 14, imgW * lw - 20, 8, 2)
    })

    // Loading indicator
    ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.35)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Loading image…', imgX + imgW / 2, imgY + imgH / 2)
  } else {
    // Image loaded: blit with clipping, no background fill
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(imgX, imgY, imgW, imgH, 6)
    ctx.clip()

    // Letterbox/pillarbox to fit image proportionally
    const scale = Math.min(imgW / img.naturalWidth, imgH / img.naturalHeight)
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const drawX = imgX + (imgW - drawW) / 2
    const drawY = imgY + (imgH - drawH) / 2

    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.restore()
  }

  advance(layout, imgH + 6)

  // Caption
  const caption = safeStr((meta as { caption?: string }).caption || (meta as { alt?: string }).alt)
  if (caption && remainingH(layout) > 10) {
    ctx.font = fontStr(7, '', 'italic', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.6)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(caption.slice(0, 48), padX + contentW / 2, layout.cursorY + 2)
    advance(layout, 11)
  }

  return true
}
