// ECS Content System — GIF / Animated Image Card
// Loads a GIF <img> via AnimationManager (browser natively animates it),
// then blits the current frame into the card canvas each dirty tick.
// Falls back to filmstrip placeholder when no src or still loading.

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
  const { padX, contentW, contentBottom } = layout
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
    const img = animationManager.getImage(card.id)
    if (!img) {
      animationManager.registerImage(card.id, src, true, true)
    }
    // Always keep GIFs in autoplay set so they animate without hover
    animationManager.markAutoplay(card.id)

    if (img) {
      // Blit the current GIF frame directly — contain aspect ratio, no background
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(frameX, frameY, frameW, frameH, 6)
      ctx.clip()
      const scale = Math.min(frameW / img.naturalWidth, frameH / img.naturalHeight)
      const drawW = img.naturalWidth * scale,
        drawH = img.naturalHeight * scale
      ctx.drawImage(img, frameX + (frameW - drawW) / 2, frameY + (frameH - drawH) / 2, drawW, drawH)
      ctx.restore()

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
  }

  // ── Fallback: static filmstrip placeholder ──────────────

  // Film frame background
  ctx.fillStyle = 'rgba(15,15,25,0.88)'
  fillRoundRect(ctx, frameX, frameY, frameW, frameH, 6)

  // Film-strip perforations (left + right)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  const perfH = 6,
    perfGap = 10,
    perfW = 5
  for (let py = frameY + 8; py < frameY + frameH - 8; py += perfGap) {
    fillRoundRect(ctx, frameX + 3, py, perfW, perfH, 1)
    fillRoundRect(ctx, frameX + frameW - perfW - 3, py, perfW, perfH, 1)
  }

  // Content area (inner frame)
  const innerX = frameX + perfW + 7,
    innerW = frameW - (perfW + 7) * 2
  const innerY = frameY + 8,
    innerH = frameH - 16

  // Placeholder gradient (animated frame hint)
  const grad = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH)
  grad.addColorStop(0, hexAlpha(accentColor, 0.35))
  grad.addColorStop(0.5, hexAlpha(accentColor, 0.12))
  grad.addColorStop(1, hexAlpha(accentColor, 0.3))
  ctx.fillStyle = grad
  fillRoundRect(ctx, innerX, innerY, innerW, innerH, 3)

  // Play/GIF badge
  ctx.fillStyle = hexAlpha(accentColor, 0.9)
  const badgeR = Math.min(innerW, innerH) * 0.22
  fillRoundRect(
    ctx,
    innerX + innerW / 2 - badgeR,
    innerY + innerH / 2 - badgeR * 0.5,
    badgeR * 2,
    badgeR,
    badgeR * 0.25,
  )
  ctx.fillStyle = '#000'
  ctx.font = fontStr(Math.round(badgeR * 0.55), 900, '', 'monospace')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('GIF', innerX + innerW / 2, innerY + innerH / 2)

  // Frame counter hint
  ctx.font = fontStr(6, '', '', 'monospace')
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText('24fps', frameX + frameW - 6, frameY + 3)

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
