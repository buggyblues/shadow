// ECS Content System — Example Card

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { exampleMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function exampleSystem(eid: number): boolean {
  const meta = exampleMetaStore[eid]
  const subject = safeStr(meta?.subject)
  const scenario = safeStr(meta?.scenario)
  if (!subject && !scenario) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  const availH = remainingH(layout)

  // Subject + industry badge — LARGE
  if (subject) {
    const subFs = Math.min(13, Math.max(10, subject.length <= 6 ? 13 : 10))
    const subFont = fontStr(subFs, 'bold')
    ctx.font = subFont
    ctx.fillStyle = accentColor
    ctx.fillText(truncText(ctx, subject, contentW * 0.55, subFont), padX, layout.cursorY)
    if (meta?.industry) {
      ctx.font = subFont
      const subW = ctx.measureText(truncText(ctx, subject, contentW * 0.55, subFont)).width
      const indFont = fontStr(7)
      ctx.font = indFont
      ctx.fillStyle = hexAlpha(accentColor, 0.1)
      const indW = ctx.measureText(safeStr(meta.industry)).width + 7
      fillRoundRect(ctx, padX + subW + 4, layout.cursorY, indW, 10, 3)
      ctx.fillStyle = accentColor
      ctx.fillText(safeStr(meta.industry), padX + subW + 7, layout.cursorY + 1)
    }
    advance(layout, subFs + 5)
  }

  // Sections — LARGER adaptive
  const sections: [string, string, string][] = [
    ['Scenario', '○', scenario],
    ['Challenge', '△', safeStr(meta?.challenge)],
    ['Method', '◇', safeStr(meta?.approach)],
  ].filter(([, , text]) => !!text) as [string, string, string][]

  const sectionAvailH =
    remainingH(layout) - (Array.isArray(meta?.results) && meta.results.length > 0 ? 26 : 0)
  const sectionH = Math.max(
    18,
    Math.min(26, Math.floor(sectionAvailH / Math.max(sections.length, 1))),
  )
  const secLblFs = Math.max(7, Math.min(9, Math.round(sectionH * 0.33)))
  const secValFs = Math.max(9, Math.min(12, Math.round(sectionH * 0.45)))

  for (const [label, icon, text] of sections) {
    if (layout.cursorY + sectionH * 0.6 > contentBottom - 14) break
    const secFont = fontStr(secLblFs)
    ctx.font = secFont
    ctx.fillStyle = accentColor
    ctx.fillText(`${icon} ${label}`, padX, layout.cursorY)
    const sFont = fontStr(secValFs)
    ctx.font = sFont
    ctx.fillStyle = '#4a4030'
    ctx.fillText(truncText(ctx, text, contentW - 3, sFont), padX + 2, layout.cursorY + secLblFs + 3)
    advance(layout, sectionH)
  }

  // Results — larger
  if (Array.isArray(meta?.results) && meta.results.length > 0 && hasSpace(layout, 14)) {
    const results = meta.results.slice(0, 2).filter((r) => r && (r.metric || r.value))
    if (results.length > 0) {
      ctx.fillStyle = hexAlpha(accentColor, 0.05)
      fillRoundRect(ctx, padX, layout.cursorY, contentW, results.length * 11 + 4, 3)
      const resFont = fontStr(8)
      for (let i = 0; i < results.length; i++) {
        const rMetric = safeStr(results[i].metric) || 'Metric'
        const rValue = safeStr(results[i].value) || '-'
        ctx.font = resFont
        ctx.fillStyle = '#8a7a5a'
        ctx.fillText(rMetric + ':', padX + 3, layout.cursorY + 2 + i * 11)
        ctx.fillStyle = accentColor
        ctx.font = fontStr(8, 'bold')
        const mw = ctx.measureText(rMetric + ': ').width
        ctx.fillText(
          truncText(ctx, rValue, contentW - mw - 8, fontStr(8, 'bold')),
          padX + 3 + mw,
          layout.cursorY + 2 + i * 11,
        )
      }
    }
  }

  // Takeaway — larger
  if (meta?.takeaway && hasSpace(layout, 14)) {
    advance(layout, 2)
    const tkFont = fontStr(8, '', 'italic')
    ctx.font = tkFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(
      truncText(ctx, `💡 ${safeStr(meta.takeaway)}`, contentW, tkFont),
      padX,
      layout.cursorY,
    )
  }

  return true
}
