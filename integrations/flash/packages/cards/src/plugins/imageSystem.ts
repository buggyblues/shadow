// ECS Content System — Image Card
// The static card face draws framing/caption only. The image itself is a
// separate GPU art layer so large pictures do not force full-card rebakes.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { imageMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { artLayerManager } from '../resources/artLayerManager'
import { resolveImageAssetSource } from '../resources/compressedTexturePipeline'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

export function imageSystem(eid: number): boolean {
  const meta = imageMetaStore[eid]
  if (!meta) return false
  const { card } = cardDataStore[eid]!
  const imageAsset = resolveImageAssetSource(card.id, meta, meta.src)
  const src = imageAsset.canvasUrl
  if (!src) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const availH = remainingH(layout)
  const imgH = Math.min(availH - 20, contentW * 0.85)
  const imgW = contentW
  const imgX = padX
  const imgY = layout.cursorY + 2

  artLayerManager.setLayerRect(
    card.id,
    {
      x: imgX,
      y: imgY,
      w: imgW,
      h: imgH,
      radius: 6,
      fit: meta.objectFit ?? 'cover',
    },
    card.kind,
  )
  artLayerManager.registerImage(card.id, src)

  ctx.fillStyle = hexAlpha(accentColor, 0.06)
  fillRoundRect(ctx, imgX, imgY, imgW, imgH, 6)
  ctx.strokeStyle = hexAlpha(accentColor, 0.18)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(imgX + 0.5, imgY + 0.5, imgW - 1, imgH - 1, 6)
  ctx.stroke()

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
