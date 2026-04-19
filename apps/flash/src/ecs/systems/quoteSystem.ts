// ECS Content System — Quote Card (decorative quote + attribution)

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { quoteMetaStore } from '../components/metaComponent'
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

export function quoteSystem(eid: number): boolean {
  const meta = quoteMetaStore[eid]
  const quoteText = safeStr(meta?.text).replace(/\n/g, ' ')
  if (!quoteText) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  const availH = remainingH(layout)

  // If the text already starts with a quote mark, suppress decorative glyphs and border
  const startsWithQuote = /^[\u201c\u2018\u201e\u300c\u300e"']/.test(quoteText)

  if (!startsWithQuote) {
    // Decorative opening quote — LARGE
    ctx.font = 'bold 28px Georgia, serif'
    ctx.fillStyle = hexAlpha(accentColor, 0.12)
    ctx.fillText('"', padX - 2, layout.cursorY - 4)

    // Left accent border
    const borderH = Math.min(availH - 24, 70)
    ctx.fillStyle = hexAlpha(accentColor, 0.35)
    fillRoundRect(ctx, padX, layout.cursorY + 2, 2, borderH, 1)
  }

  // Quote text — LARGE adaptive
  advance(layout, 4)
  const bodyAvailH = availH - 30 // reserve for attribution
  const fs = adaptiveFontSize(bodyAvailH, quoteText.length, contentW - 10, 10, 14)
  const lh = Math.round(fs * LH_MULT)
  const quoteFont = fontStr(fs, '', 'italic', '"Noto Sans SC", serif')
  ctx.font = quoteFont
  ctx.fillStyle = '#2a2318'
  const maxQLn = Math.max(3, Math.floor(bodyAvailH / lh))
  const quoteLines = wrapText(ctx, quoteText, contentW - 10, maxQLn)
  const textIndent = startsWithQuote ? 0 : 8
  for (const line of quoteLines) {
    if (layout.cursorY + lh > contentBottom - 20) break
    ctx.fillText(line, padX + textIndent, layout.cursorY)
    advance(layout, lh)
  }

  // Closing quote — LARGE (skip if text already has quote marks)
  if (!startsWithQuote) {
    ctx.font = 'bold 22px Georgia, serif'
    ctx.fillStyle = hexAlpha(accentColor, 0.1)
    ctx.textAlign = 'right'
    ctx.fillText('"', width - padX, layout.cursorY - 6)
    ctx.textAlign = 'left'
  }

  advance(layout, 3)

  // Attribution
  const attrParts: string[] = []
  if (meta?.author) attrParts.push(safeStr(meta.author))
  if (meta?.role) attrParts.push(safeStr(meta.role))
  if (meta?.source) attrParts.push(`《${safeStr(meta.source)}》`)
  if (attrParts.length > 0 && hasSpace(layout, 12)) {
    const attrFont = fontStr(9)
    ctx.font = attrFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(
      truncText(ctx, '— ' + attrParts.join(' · '), contentW - 10, attrFont),
      padX + textIndent,
      layout.cursorY,
    )
    advance(layout, 12)
  }

  // Emphasis tags
  if (Array.isArray(meta?.emphasis) && meta.emphasis.length > 0 && hasSpace(layout, 12)) {
    let tx = padX
    const tagFont = fontStr(7)
    for (const word of meta.emphasis.slice(0, 4)) {
      ctx.font = tagFont
      const tw = ctx.measureText(safeStr(word)).width + 7
      if (tx + tw > width - padX) break
      ctx.fillStyle = hexAlpha(accentColor, 0.08)
      fillRoundRect(ctx, tx, layout.cursorY, tw, 10, 3)
      ctx.fillStyle = accentColor
      ctx.fillText(safeStr(word), tx + 3, layout.cursorY + 1)
      tx += tw + 3
    }
  }

  return true
}
