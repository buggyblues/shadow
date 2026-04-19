// ECS Content System — Comparison Card

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { comparisonMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function comparisonSystem(eid: number): boolean {
  const meta = comparisonMetaStore[eid]
  const dims = Array.isArray(meta?.dimensions)
    ? meta.dimensions.filter(
        (d) => d && (d.label || (Array.isArray(d.values) && d.values.length > 0)),
      )
    : []
  if (dims.length === 0) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const subjects = Array.isArray(meta?.subjects) ? meta.subjects.map(safeStr) : ['A', 'B']

  // VS Header — LARGE
  const subFont = fontStr(11, 'bold')
  const subA = truncText(ctx, subjects[0] || 'A', contentW * 0.35, subFont)
  const subB = truncText(ctx, subjects[1] || 'B', contentW * 0.35, subFont)
  ctx.font = subFont
  ctx.fillStyle = '#3b82f6'
  ctx.textAlign = 'left'
  ctx.fillText(subA, padX, layout.cursorY)
  ctx.fillStyle = '#ef4444'
  ctx.textAlign = 'right'
  ctx.fillText(subB, width - padX, layout.cursorY)
  ctx.textAlign = 'center'
  ctx.fillStyle = hexAlpha(accentColor, 0.1)
  fillRoundRect(ctx, width / 2 - 9, layout.cursorY - 2, 18, 13, 3)
  ctx.font = fontStr(8, 'bold', '', 'sans-serif')
  ctx.fillStyle = accentColor
  ctx.fillText('VS', width / 2, layout.cursorY + 1)
  ctx.textAlign = 'left'
  advance(layout, 16)

  ctx.strokeStyle = hexAlpha(accentColor, 0.15)
  ctx.lineWidth = 0.4
  ctx.beginPath()
  ctx.moveTo(padX, layout.cursorY)
  ctx.lineTo(width - padX, layout.cursorY)
  ctx.stroke()
  advance(layout, 4)

  // LARGER adaptive dimension rows
  const availH = remainingH(layout) - (meta?.conclusion ? 16 : 4)
  const maxDims = Math.min(dims.length, 7)
  const dimRowH = Math.max(20, Math.min(30, Math.floor(availH / maxDims)))
  const displayCount = Math.min(maxDims, Math.max(1, Math.floor(availH / dimRowH)))
  const displayDims = dims.slice(0, displayCount)

  const dimFs = Math.max(7, Math.min(9, Math.round(dimRowH * 0.33)))
  const valFs = Math.max(9, Math.min(12, Math.round(dimRowH * 0.4)))

  for (let i = 0; i < displayDims.length; i++) {
    const d = displayDims[i]
    const rowStartY = layout.cursorY

    // Dimension label
    const dimFont = fontStr(dimFs)
    ctx.font = dimFont
    ctx.fillStyle = '#8a7a5a'
    ctx.textAlign = 'center'
    ctx.fillText(truncText(ctx, safeStr(d.label), contentW * 0.4, dimFont), width / 2, rowStartY)
    ctx.textAlign = 'left'

    // Values
    const valY = rowStartY + dimFs + 4
    const vals = Array.isArray(d.values) ? d.values.map(safeStr) : []
    const valFontA = fontStr(valFs, d.winner === 0 ? 'bold' : '')
    ctx.font = valFontA
    ctx.fillStyle = d.winner === 0 ? '#3b82f6' : '#4a4030'
    ctx.fillText(truncText(ctx, vals[0] ?? '-', contentW / 2 - 10, valFontA), padX, valY)

    const valFontB = fontStr(valFs, d.winner === 1 ? 'bold' : '')
    ctx.font = valFontB
    ctx.fillStyle = d.winner === 1 ? '#ef4444' : '#4a4030'
    ctx.textAlign = 'right'
    ctx.fillText(truncText(ctx, vals[1] ?? '-', contentW / 2 - 10, valFontB), width - padX, valY)
    ctx.textAlign = 'left'

    // Winner highlight
    if (d.winner !== undefined) {
      const barColor = d.winner === 0 ? '#3b82f6' : '#ef4444'
      ctx.fillStyle = hexAlpha(barColor, 0.06)
      if (d.winner === 0) fillRoundRect(ctx, padX, valY - 3, contentW / 2 - 6, valFs + 6, 2)
      else fillRoundRect(ctx, width / 2 + 6, valY - 3, contentW / 2 - 6, valFs + 6, 2)
    }

    // Row separator
    if (i < displayDims.length - 1) {
      ctx.strokeStyle = '#e0d8c815'
      ctx.lineWidth = 0.3
      ctx.beginPath()
      ctx.moveTo(padX, rowStartY + dimRowH - 1)
      ctx.lineTo(width - padX, rowStartY + dimRowH - 1)
      ctx.stroke()
    }

    advance(layout, dimRowH)
  }

  if (dims.length > displayDims.length) {
    ctx.font = fontStr(8)
    ctx.fillStyle = '#8a7a5a'
    ctx.textAlign = 'center'
    ctx.fillText(`+${dims.length - displayDims.length} more dims`, width / 2, layout.cursorY)
    ctx.textAlign = 'left'
    advance(layout, 10)
  }

  // Conclusion — larger
  if (meta?.conclusion && hasSpace(layout, 14)) {
    ctx.fillStyle = hexAlpha(accentColor, 0.05)
    fillRoundRect(ctx, padX, layout.cursorY, contentW, 12, 3)
    const conFont = fontStr(8)
    ctx.font = conFont
    ctx.fillStyle = '#3d3528'
    ctx.fillText(
      truncText(ctx, safeStr(meta.conclusion), contentW - 6, conFont),
      padX + 3,
      layout.cursorY + 2,
    )
  }

  return true
}
