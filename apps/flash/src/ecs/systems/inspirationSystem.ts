// ECS Content System — Inspiration / Idea Card

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { inspirationMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import {
  adaptiveFontSize,
  fillRoundRect,
  fontStr,
  hexAlpha,
  LH_MULT,
  safeStr,
  truncText,
  wrapText,
} from '../utils/canvasUtils'

export function inspirationSystem(eid: number): boolean {
  const { card } = cardDataStore[eid]!
  if (card.kind !== 'inspiration' && card.kind !== 'idea') return false
  const meta = inspirationMetaStore[eid]
  if (!meta || (!meta.body && !meta.ideaType && !meta.impact)) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  // Type & difficulty badges — larger
  const typeLabels: Record<string, string> = {
    concept: 'New Concept',
    improvement: 'Improvement',
    alternative: 'Alternative',
    expansion: 'Expansion',
  }
  const diffLabels: Record<string, { text: string; color: string }> = {
    easy: { text: 'Easy', color: '#16a34a' },
    medium: { text: 'Medium', color: '#ca8a04' },
    hard: { text: 'Hard', color: '#dc2626' },
  }
  let tx = padX
  const badgeFont = fontStr(7)
  if (meta.ideaType) {
    const tLabel = typeLabels[safeStr(meta.ideaType)] || safeStr(meta.ideaType)
    ctx.font = badgeFont
    const tw = ctx.measureText(tLabel).width + 7
    ctx.fillStyle = hexAlpha(accentColor, 0.1)
    fillRoundRect(ctx, tx, layout.cursorY, tw, 10, 3)
    ctx.fillStyle = accentColor
    ctx.fillText(tLabel, tx + 3, layout.cursorY + 1)
    tx += tw + 3
  }
  if (meta.difficulty) {
    const dl = diffLabels[safeStr(meta.difficulty)]
    if (dl) {
      ctx.font = badgeFont
      const dw = ctx.measureText(dl.text).width + 7
      ctx.fillStyle = hexAlpha(dl.color, 0.1)
      fillRoundRect(ctx, tx, layout.cursorY, dw, 10, 3)
      ctx.fillStyle = dl.color
      ctx.fillText(dl.text, tx + 3, layout.cursorY + 1)
    }
  }
  advance(layout, 14)

  // Body text — LARGE adaptive
  const bodyText = safeStr(
    ((meta as Record<string, unknown>).concept as string) || meta.body,
  ).replace(/\n/g, ' ')
  if (bodyText) {
    const bodyAvailH = remainingH(layout) - (meta.impact ? 16 : 4)
    const fs = adaptiveFontSize(bodyAvailH, bodyText.length, contentW, 10, 14)
    const lh = Math.round(fs * LH_MULT)
    const bodyFont = fontStr(fs)
    ctx.font = bodyFont
    ctx.fillStyle = '#3d3528'
    const bodyLines = wrapText(ctx, bodyText, contentW, Math.max(3, Math.floor(bodyAvailH / lh)))
    for (const line of bodyLines) {
      if (layout.cursorY + lh > contentBottom - (meta.impact ? 14 : 4)) break
      ctx.fillText(line, padX, layout.cursorY)
      advance(layout, lh)
    }
  }

  // Impact — larger
  if (meta.impact && hasSpace(layout, 14)) {
    ctx.fillStyle = hexAlpha('#f59e0b', 0.05)
    fillRoundRect(ctx, padX, layout.cursorY, contentW, 12, 3)
    const impFont = fontStr(8)
    ctx.font = impFont
    ctx.fillStyle = '#ca8a04'
    ctx.fillText(
      truncText(ctx, safeStr(meta.impact), contentW - 10, impFont),
      padX + 3,
      layout.cursorY + 2,
    )
  }

  return true
}
