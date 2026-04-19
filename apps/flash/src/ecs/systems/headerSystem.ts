// ECS Decorator System — Card Header (bitECS, eid-based)

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { layoutStore } from '../components/layoutComponent'
import { styleStore } from '../components/styleComponent'
import {
  drawMiniStar,
  drawMiniStarOutline,
  FONT_BODY,
  FONT_TITLE,
  fontStr,
  hexAlpha,
  wrapText,
} from '../utils/canvasUtils'

export function headerSystem(eid: number): void {
  const canvasData = canvasStore[eid]!
  const styleData = styleStore[eid]!
  const layout = layoutStore[eid]!
  const cardData = cardDataStore[eid]!
  const { ctx, width } = canvasData
  const { accentColor, kindLabel } = styleData
  const { card } = cardData
  const { padX, contentW } = layout

  // ── 1. Kind label (small caps, generous top spacing) ──
  ctx.font = fontStr(8, 600, '', FONT_BODY)
  ctx.fillStyle = hexAlpha(accentColor, 0.55)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(kindLabel, width / 2, layout.cursorY)
  layout.cursorY += 12

  // ── 2. Title (SUPER LARGE — 14-18px, adaptive) ──
  const titleText = card.title || 'Untitled'
  // Scale font size inversely with text length; keep generous sizes
  const titleFs =
    titleText.length <= 4 ? 26 : titleText.length <= 8 ? 22 : titleText.length <= 14 ? 19 : 17
  const titleFont = fontStr(titleFs, 900, '', FONT_TITLE)
  ctx.font = titleFont
  ctx.fillStyle = '#1a1510'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  const titleMaxW = contentW - 4
  const titleLines = wrapText(ctx, titleText, titleMaxW, 2)
  const titleLh = Math.round(titleFs * 1.25)
  for (const line of titleLines) {
    // No glow — just crisp solid text
    ctx.fillText(line, width / 2, layout.cursorY)
    layout.cursorY += titleLh
  }

  // ── 3. Rating stars (only if rated) ──
  if (card.rating > 0) {
    layout.cursorY += 3
    const starCount = Math.min(card.rating, 5)
    const starR = 4
    const starGap = 10
    const totalStarW = (starCount - 1) * starGap
    const starStartX = width / 2 - totalStarW / 2

    for (let i = 0; i < starCount; i++) {
      const sx = starStartX + i * starGap
      ctx.fillStyle = '#daa520'
      drawMiniStar(ctx, sx, layout.cursorY, starR)
      ctx.strokeStyle = '#8b6914'
      ctx.lineWidth = 0.3
      drawMiniStarOutline(ctx, sx, layout.cursorY, starR)
    }
    layout.cursorY += starR + 4
  }

  // ── 4. Ornamental separator ──
  layout.cursorY += 3
  ctx.strokeStyle = hexAlpha(accentColor, 0.2)
  ctx.lineWidth = 0.4
  ctx.beginPath()
  ctx.moveTo(padX + 8, layout.cursorY)
  ctx.lineTo(width / 2 - 4, layout.cursorY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(width / 2 + 4, layout.cursorY)
  ctx.lineTo(width - padX - 8, layout.cursorY)
  ctx.stroke()
  // Center diamond
  ctx.fillStyle = hexAlpha(accentColor, 0.35)
  ctx.beginPath()
  ctx.moveTo(width / 2, layout.cursorY - 2)
  ctx.lineTo(width / 2 + 2.5, layout.cursorY)
  ctx.lineTo(width / 2, layout.cursorY + 2)
  ctx.lineTo(width / 2 - 2.5, layout.cursorY)
  ctx.closePath()
  ctx.fill()

  layout.cursorY += 6

  // Reset text state for body rendering
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}
