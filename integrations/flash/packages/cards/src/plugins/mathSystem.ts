// ECS Content System — Math Card (KaTeX rendered)
// Renders LaTeX formulae using KaTeX → DOM tree-walker → canvas fillText.
// Rendering is synchronous; no async rebake needed.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { mathMetaStore } from '../components/metaComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'
import { drawKatex } from '../utils/katexRenderer'

export function mathSystem(eid: number): boolean {
  const meta = mathMetaStore[eid]
  if (!meta) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout

  // ── Formula name / category ─────────────────────────
  if ((meta.name || meta.category) && remainingH(layout) > 10) {
    ctx.font = fontStr(7, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = '#666666'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const label = [meta.name, meta.category ? `[${meta.category}]` : ''].filter(Boolean).join('  ')
    ctx.fillText(label.slice(0, 40), padX, layout.cursorY + 1)
    advance(layout, 11)
  }

  // ── Main formula block ──────────────────────────────
  if (remainingH(layout) > 20) {
    const blockH = Math.min(remainingH(layout) - 16, 64)
    const blockX = padX - 2
    const blockW = contentW + 4

    // Background
    ctx.fillStyle = 'rgba(245, 240, 230, 0.6)'
    fillRoundRect(ctx, blockX, layout.cursorY + 2, blockW, blockH, 5)
    ctx.strokeStyle = 'rgba(138, 122, 90, 0.25)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.roundRect(blockX, layout.cursorY + 2, blockW, blockH, 5)
    ctx.stroke()

    // Sigma symbol on left edge (decorative)
    ctx.font = fontStr(18, '', '', '"STIX Two Math", "Latin Modern Math", "Times New Roman", serif')
    ctx.fillStyle = 'rgba(100, 85, 60, 0.25)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('∑', blockX + 4, layout.cursorY + 2 + blockH / 2)

    const formula = safeStr(meta.formula)
    if (formula) {
      const formulaMaxW = blockW - 32 // leave room for sigma icon
      const cx = blockX + 16 + (blockW - 16) / 2 + 4
      const katexY = layout.cursorY + 2 + (blockH - 20) / 2

      drawKatex(ctx, formula, cx, katexY, formulaMaxW, 14, '#1a1510')
    }

    advance(layout, blockH + 8)
  }

  // ── Steps ─────────────────────────────────────────────
  if (meta.steps && meta.steps.length > 0) {
    const maxSteps = Math.floor(remainingH(layout) / 14)
    for (const step of meta.steps.slice(0, maxSteps)) {
      if (remainingH(layout) < 11) break
      const stepFormula = safeStr(step.formula)
      const label = step.label ? `${step.label}: ` : ''
      const cx = padX + contentW / 2
      const stepY = layout.cursorY + 1
      if (stepFormula) {
        const { height } = drawKatex(ctx, label + stepFormula, cx, stepY, contentW, 8, '#333333')
        advance(layout, height)
      } else {
        ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
        ctx.fillStyle = '#444444'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(truncText(ctx, label, contentW, ctx.font), padX, stepY)
        advance(layout, 11)
      }
    }
  }

  // ── Description ───────────────────────────────────────
  const desc = safeStr(meta.description)
  if (desc && remainingH(layout) > 10) {
    ctx.font = fontStr(7.5, '', 'italic', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = '#555555'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncText(ctx, desc, contentW, ctx.font), padX, layout.cursorY + 1)
    advance(layout, 10)
  }

  void width
  return true
}
