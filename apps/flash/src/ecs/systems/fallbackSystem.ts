// ECS Content System — Fallback (generic text rendering for unmatched kinds)
// This system always returns true — it's the last in the chain.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { rawMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import {
  adaptiveFontSize,
  fillRoundRect,
  fontStr,
  hexAlpha,
  LH_MULT,
  safeStr,
  wrapText,
} from '../utils/canvasUtils'

export function fallbackSystem(eid: number): boolean {
  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!
  const rawMeta = rawMetaStore[eid] || {}

  const getDisplayText = (): string => {
    switch (card.kind) {
      case 'argument':
        return safeStr(rawMeta.claim) || card.content || ''
      case 'quote':
        return safeStr(rawMeta.text) || card.content || ''
      case 'definition':
        return safeStr(rawMeta.definition) || card.content || ''
      case 'example':
        return safeStr(rawMeta.takeaway) || safeStr(rawMeta.scenario) || card.content || ''
      case 'inspiration':
      case 'idea':
      case 'summary':
        return safeStr(rawMeta.body) || card.content || ''
      default:
        return card.content || card.summary || ''
    }
  }

  const displayText = getDisplayText().replace(/\n/g, ' ').slice(0, 500)
  if (displayText.length === 0) return true

  const availH = remainingH(layout)

  // Data/chart kind: extract numbers for mini chart
  if (card.kind === 'data' || card.kind === 'chart') {
    const nums = displayText
      .match(/\d+\.?\d*/g)
      ?.map(Number)
      .filter((n) => n > 0 && n < 1e9)
      .slice(0, 8)
    if (nums && nums.length >= 2) {
      const maxVal = Math.max(...nums)
      const chartH = Math.min(50, availH * 0.45)
      const barW = Math.min(18, (contentW - (nums.length - 1) * 3) / nums.length)
      const chartX = padX + (contentW - nums.length * barW - (nums.length - 1) * 3) / 2

      for (let i = 0; i < nums.length; i++) {
        const bh = (nums[i] / maxVal) * chartH * 0.9
        const bx = chartX + i * (barW + 3)
        ctx.fillStyle = hexAlpha(accentColor, 0.2)
        fillRoundRect(ctx, bx, layout.cursorY + chartH - bh, barW, bh, 2)
        ctx.fillStyle = hexAlpha(accentColor, 0.5)
        fillRoundRect(ctx, bx, layout.cursorY + chartH - bh, barW, Math.min(bh, 3), 2)
      }

      const numFont = fontStr(12, 'bold')
      ctx.font = numFont
      ctx.fillStyle = accentColor
      ctx.textAlign = 'right'
      const displayNum = maxVal >= 1000 ? `${(maxVal / 1000).toFixed(1)}k` : `${maxVal}`
      ctx.fillText(displayNum, width - padX, layout.cursorY + 2)
      ctx.textAlign = 'left'

      const textStartY = layout.cursorY + chartH + 5
      layout.cursorY = textStartY
      const textAvailH = contentBottom - textStartY
      if (textAvailH > 12) {
        const fs = adaptiveFontSize(textAvailH, displayText.length, contentW, 9, 13)
        const lh = Math.round(fs * LH_MULT)
        const font = fontStr(fs)
        ctx.font = font
        ctx.fillStyle = '#3d3528'
        const lines = wrapText(ctx, displayText, contentW, Math.max(2, Math.floor(textAvailH / lh)))
        for (const line of lines) {
          if (layout.cursorY + lh > contentBottom) break
          ctx.fillText(line, padX, layout.cursorY)
          advance(layout, lh)
        }
      }
      return true
    }
  }

  // Generic text rendering — LARGE adaptive
  const fs = adaptiveFontSize(availH, displayText.length, contentW, 10, 14)
  const lh = Math.round(fs * LH_MULT)
  const font = fontStr(fs)
  ctx.font = font
  ctx.fillStyle = '#3d3528'
  const maxLines = Math.max(3, Math.floor(availH / lh))
  const lines = wrapText(ctx, displayText, contentW, maxLines)
  for (const line of lines) {
    if (layout.cursorY + lh > contentBottom) break
    ctx.fillText(line, padX, layout.cursorY)
    advance(layout, lh)
  }

  return true
}
