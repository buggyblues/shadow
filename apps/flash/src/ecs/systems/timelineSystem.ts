// ECS Content System — Timeline Card

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { timelineMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function timelineSystem(eid: number): boolean {
  const meta = timelineMetaStore[eid]
  const rawEvents = Array.isArray(meta?.events) ? meta.events : []
  const allEvents = rawEvents.filter((ev) => ev && (ev.date || ev.title))
  if (allEvents.length === 0) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  const sigColors: Record<string, string> = { high: '#f59e0b', medium: accentColor, low: '#9ca3af' }

  // Span badge — larger
  if (meta?.span) {
    const spanFont = fontStr(8)
    ctx.font = spanFont
    ctx.fillStyle = hexAlpha(accentColor, 0.1)
    const spanText = truncText(ctx, safeStr(meta.span), contentW * 0.5, spanFont)
    const sw = ctx.measureText(spanText).width + 7
    fillRoundRect(ctx, padX, layout.cursorY, sw, 11, 3)
    ctx.fillStyle = accentColor
    ctx.fillText(spanText, padX + 3, layout.cursorY + 1)
    advance(layout, 14)
  }

  const dotX = padX + 6
  const textX = dotX + 12
  const availH = remainingH(layout)

  // Adaptive: LARGER event height
  const maxEv = Math.min(allEvents.length, 7)
  const evH = Math.max(20, Math.min(30, Math.floor(availH / maxEv)))
  const displayCount = Math.min(maxEv, Math.max(2, Math.floor(availH / evH)))
  const events = allEvents.slice(0, displayCount)

  const dateFs = Math.max(7, Math.min(10, Math.round(evH * 0.35)))
  const titleFs = Math.max(9, Math.min(12, Math.round(evH * 0.4)))

  for (let i = 0; i < events.length && layout.cursorY + evH * 0.6 < contentBottom; i++) {
    const ev = events[i]
    const dotColor = sigColors[safeStr(ev.significance) || 'medium'] || accentColor

    // Connector line
    if (i < events.length - 1) {
      ctx.strokeStyle = hexAlpha(accentColor, 0.15)
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(dotX, layout.cursorY + 5)
      ctx.lineTo(dotX, layout.cursorY + evH)
      ctx.stroke()
    }

    // Dot — larger
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(dotX, layout.cursorY + 3, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = hexAlpha(dotColor, 0.25)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(dotX, layout.cursorY + 3, 5, 0, Math.PI * 2)
    ctx.stroke()

    // Date
    const dateFont = fontStr(dateFs, 'bold')
    ctx.font = dateFont
    ctx.fillStyle = dotColor
    ctx.fillText(
      truncText(ctx, safeStr(ev.date), contentW - textX + padX, dateFont),
      textX,
      layout.cursorY - 1,
    )

    // Title
    const titleFont = fontStr(titleFs)
    ctx.font = titleFont
    ctx.fillStyle = '#2a2318'
    ctx.fillText(
      truncText(ctx, safeStr(ev.title), contentW - textX + padX, titleFont),
      textX,
      layout.cursorY + dateFs + 3,
    )

    advance(layout, evH)
  }

  if (allEvents.length > events.length) {
    ctx.font = fontStr(8)
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(`+${allEvents.length - events.length} more`, textX, layout.cursorY)
  }

  return true
}
