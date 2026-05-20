// ECS Content System — Definition Card

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { definitionMetaStore } from '../components/metaComponent'
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

export function definitionSystem(eid: number): boolean {
  const meta = definitionMetaStore[eid]
  const term = safeStr(meta?.term)
  const definition = safeStr(meta?.definition)
  if (!term && !definition) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  // Term badge — LARGE
  if (term) {
    const termFs = Math.min(14, Math.max(11, term.length <= 6 ? 14 : 11))
    const termFont = fontStr(termFs, 'bold')
    ctx.font = termFont
    ctx.fillStyle = hexAlpha(accentColor, 0.08)
    const termW = ctx.measureText(term.slice(0, 12)).width + 12
    fillRoundRect(ctx, padX, layout.cursorY, Math.min(termW, contentW), termFs + 6, 3)
    ctx.fillStyle = accentColor
    ctx.fillText(truncText(ctx, term, contentW - 10, termFont), padX + 6, layout.cursorY + 3)
    advance(layout, termFs + 10)
  }

  // Meta badges (abbreviation, category) — slightly larger
  if (meta?.abbreviation || meta?.category) {
    let tx = padX
    const badgeFont = fontStr(7)
    if (meta.abbreviation) {
      ctx.font = badgeFont
      const abbrW = ctx.measureText(safeStr(meta.abbreviation)).width + 7
      ctx.fillStyle = hexAlpha(accentColor, 0.06)
      fillRoundRect(ctx, tx, layout.cursorY, abbrW, 10, 3)
      ctx.fillStyle = '#8a7a5a'
      ctx.fillText(safeStr(meta.abbreviation), tx + 3, layout.cursorY + 1)
      tx += abbrW + 3
    }
    if (meta.category) {
      ctx.font = badgeFont
      const catW = ctx.measureText(safeStr(meta.category)).width + 7
      ctx.fillStyle = hexAlpha(accentColor, 0.05)
      fillRoundRect(ctx, tx, layout.cursorY, catW, 10, 3)
      ctx.fillStyle = '#8a7a5a'
      ctx.fillText(safeStr(meta.category), tx + 3, layout.cursorY + 1)
    }
    advance(layout, 13)
  }

  // Definition text — LARGE adaptive
  if (definition) {
    const defAvailH = remainingH(layout) - (meta?.formula ? 18 : 4)
    const defFs = adaptiveFontSize(defAvailH, definition.length, contentW, 9, 13)
    const defLh = Math.round(defFs * LH_MULT)
    const defFont = fontStr(defFs)
    ctx.font = defFont
    ctx.fillStyle = '#3d3528'
    const defLines = wrapText(ctx, definition, contentW, Math.max(2, Math.floor(defAvailH / defLh)))
    for (const line of defLines) {
      if (layout.cursorY + defLh > contentBottom - (meta?.formula ? 16 : 4)) break
      ctx.fillText(line, padX, layout.cursorY)
      advance(layout, defLh)
    }
  }

  // Example
  if (meta?.example && hasSpace(layout, 16)) {
    const exFont = fontStr(8, '', 'italic')
    ctx.font = exFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(
      truncText(ctx, `e.g. ${safeStr(meta.example)}`, contentW, exFont),
      padX,
      layout.cursorY,
    )
    advance(layout, 11)
  }

  // Formula
  if (meta?.formula && hasSpace(layout, 15)) {
    advance(layout, 2)
    ctx.fillStyle = hexAlpha(accentColor, 0.05)
    fillRoundRect(ctx, padX, layout.cursorY, contentW, 13, 3)
    ctx.font = fontStr(9, '', 'italic', '"Courier New", monospace')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'center'
    ctx.fillText(
      truncText(
        ctx,
        safeStr(meta.formula),
        contentW - 8,
        fontStr(9, '', 'italic', '"Courier New", monospace'),
      ),
      width / 2,
      layout.cursorY + 2,
    )
    ctx.textAlign = 'left'
  }

  return true
}
