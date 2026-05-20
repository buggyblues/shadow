// ECS Content System — Code Card

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { codeMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

export function codeSystem(eid: number): boolean {
  const meta = codeMetaStore[eid]
  const code = safeStr(meta?.code)
  if (!code) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  // Language badge — larger
  if (meta?.language) {
    const langFont = fontStr(7, 'bold', '', 'monospace')
    ctx.font = langFont
    ctx.fillStyle = hexAlpha(accentColor, 0.12)
    const langW = ctx.measureText(safeStr(meta.language)).width + 7
    fillRoundRect(ctx, padX, layout.cursorY, langW, 11, 3)
    ctx.fillStyle = accentColor
    ctx.fillText(safeStr(meta.language), padX + 3, layout.cursorY + 2)
    advance(layout, 14)
  }

  // Code block — LARGE, fill available space
  const availH = remainingH(layout)
  const codeTop = layout.cursorY
  const codeBottom = Math.min(contentBottom - 2, codeTop + availH)
  const codeBlockH = codeBottom - codeTop
  ctx.fillStyle = 'rgba(15, 15, 20, 0.85)'
  fillRoundRect(ctx, padX - 2, codeTop, contentW + 4, codeBlockH, 3)

  // LARGE adaptive line height
  const codeLh = Math.max(10, Math.min(14, Math.floor(codeBlockH / 7)))
  const codeFs = Math.max(7, Math.min(10, Math.round(codeLh * 0.75)))
  const maxCodeLines = Math.max(3, Math.floor((codeBlockH - 6) / codeLh))
  const codeLines = code.split('\n').slice(0, maxCodeLines)
  const codeFont = fontStr(codeFs, '', '', '"Courier New", monospace')
  const lineNumFont = fontStr(Math.max(5, codeFs - 1), '', '', 'monospace')
  ctx.font = codeFont
  const hlLines = new Set(Array.isArray(meta?.highlight) ? meta.highlight : [])
  let codeY = codeTop + 4

  const maxChars = Math.max(16, Math.floor((contentW - 18) / (codeFs * 0.6)))

  for (let i = 0; i < codeLines.length && codeY + codeLh < codeBottom; i++) {
    // Line number
    ctx.font = lineNumFont
    ctx.fillStyle = '#555'
    ctx.fillText(`${i + 1}`, padX + 2, codeY)

    // Highlight
    if (hlLines.has(i + 1)) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.06)'
      fillRoundRect(ctx, padX + 14, codeY - 1, contentW - 16, codeLh, 1)
    }

    // Code text
    ctx.font = codeFont
    ctx.fillStyle = '#c9d1d9'
    ctx.fillText(codeLines[i].slice(0, maxChars), padX + 16, codeY)
    codeY += codeLh
  }

  layout.cursorY = codeBottom

  return true
}
