// ECS Content System — Table Card

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { tableMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function tableSystem(eid: number): boolean {
  const meta = tableMetaStore[eid]
  const hasColumns = Array.isArray(meta?.columns) && meta.columns.length > 0
  const hasHeaders = Array.isArray(meta?.headers) && meta.headers.length > 0
  const hasRows = Array.isArray(meta?.rows) && meta.rows.length > 0
  if (!meta || (!hasColumns && !hasHeaders && !hasRows)) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  const cols = hasColumns ? meta.columns : undefined
  const headers = cols
    ? cols.map((c) => safeStr(c.label || c.key))
    : (meta.headers || []).map(safeStr)
  const colKeys = cols ? cols.map((c) => safeStr(c.key)) : headers
  const rows = meta.rows || []
  const displayCols = Math.min(
    headers.length ||
      (Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : Object.keys(rows[0] || {}).length),
    3,
  )
  const colW2 = contentW / Math.max(displayCols, 1)

  // Caption — larger
  if (meta.caption) {
    const capFont = fontStr(8)
    ctx.font = capFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(truncText(ctx, safeStr(meta.caption), contentW, capFont), padX, layout.cursorY)
    advance(layout, 12)
  }

  // LARGER adaptive row height
  const hdrH = 14
  const totalRows = rows.length
  const bodyAvailH = remainingH(layout) - hdrH - 4
  const rowH = Math.max(12, Math.min(18, Math.floor(bodyAvailH / Math.max(totalRows, 1))))
  const cellFs = Math.max(7, Math.min(10, Math.round(rowH * 0.6)))
  const hdrFs = Math.max(7, Math.min(10, cellFs))

  // Header row
  if (headers.length > 0) {
    ctx.fillStyle = hexAlpha(accentColor, 0.08)
    fillRoundRect(ctx, padX, layout.cursorY, contentW, hdrH, 3)
    const hdrFont = fontStr(hdrFs, 'bold')
    ctx.font = hdrFont
    ctx.fillStyle = '#3d3528'
    for (let ci = 0; ci < displayCols; ci++) {
      ctx.fillText(
        truncText(ctx, headers[ci] || '', colW2 - 4, hdrFont),
        padX + ci * colW2 + 3,
        layout.cursorY + 2,
      )
    }
    advance(layout, hdrH + 2)
  }

  const maxRows = Math.min(
    totalRows,
    Math.max(2, Math.floor((contentBottom - layout.cursorY - 10) / rowH)),
  )
  const cellFont = fontStr(cellFs)
  ctx.font = cellFont

  for (let ri = 0; ri < maxRows && layout.cursorY + rowH - 1 < contentBottom; ri++) {
    const row = rows[ri]
    if (ri % 2 === 0) {
      ctx.fillStyle = hexAlpha(accentColor, 0.03)
      fillRoundRect(ctx, padX, layout.cursorY, contentW, rowH, 1)
    }
    if (meta.highlightRow === ri) {
      ctx.fillStyle = hexAlpha(accentColor, 0.06)
      fillRoundRect(ctx, padX, layout.cursorY, contentW, rowH, 1)
    }

    ctx.fillStyle = '#4a4030'
    for (let ci = 0; ci < displayCols; ci++) {
      let cellVal = ''
      if (Array.isArray(row)) {
        cellVal = safeStr((row as unknown as (string | number)[])[ci])
      } else if (row && typeof row === 'object') {
        cellVal = safeStr((row as Record<string, string | number>)[colKeys[ci]])
      }
      ctx.font = cellFont
      ctx.fillText(
        truncText(ctx, cellVal, colW2 - 4, cellFont),
        padX + ci * colW2 + 3,
        layout.cursorY + 2,
      )
    }
    advance(layout, rowH)
  }

  if (totalRows > maxRows) {
    ctx.font = fontStr(7)
    ctx.fillStyle = '#8a7a5a'
    ctx.textAlign = 'right'
    ctx.fillText(`+${totalRows - maxRows} more rows`, width - padX, layout.cursorY)
    ctx.textAlign = 'left'
  }

  return true
}
