// ECS Content System — Keypoint Card

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { keypointMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function keypointSystem(eid: number): boolean {
  const meta = keypointMetaStore[eid]
  const rawPoints = Array.isArray(meta?.points) ? meta.points : []
  const points = rawPoints.filter((pt) => pt && (pt.label || pt.detail))
  if (points.length === 0) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  // Context text — larger
  if (meta?.context) {
    const ctxFont = fontStr(9)
    ctx.font = ctxFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(truncText(ctx, safeStr(meta.context), contentW, ctxFont), padX, layout.cursorY)
    advance(layout, 13)
  }

  const availH = remainingH(layout)
  const hasDetails = points.some((pt) => pt.detail)

  // Adaptive: calculate item height — LARGER
  const maxPts = Math.min(points.length, 7)
  const baseItemH = hasDetails ? 22 : 16
  const itemH = Math.max(baseItemH, Math.min(30, Math.floor(availH / maxPts)))
  const displayCount = Math.min(maxPts, Math.max(2, Math.floor(availH / itemH)))
  const displayPts = points.slice(0, displayCount)

  // LARGE adaptive font sizes
  const lblFs = Math.max(9, Math.min(12, Math.round(itemH * 0.4)))
  const dtlFs = Math.max(7, Math.min(10, Math.round(itemH * 0.32)))

  for (let i = 0; i < displayPts.length && layout.cursorY + 14 < contentBottom; i++) {
    const pt = displayPts[i]

    // Circle icon — larger
    const circR = Math.max(5, Math.min(7, lblFs * 0.55))
    ctx.fillStyle = hexAlpha(accentColor, 0.1)
    ctx.beginPath()
    ctx.arc(padX + circR, layout.cursorY + circR, circR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = accentColor
    ctx.font = fontStr(Math.round(circR * 1.3), 'bold', '', 'sans-serif')
    ctx.textAlign = 'center'
    ctx.fillText(
      safeStr(pt.icon).slice(0, 1) || `${i + 1}`,
      padX + circR,
      layout.cursorY + circR * 0.45,
    )
    ctx.textAlign = 'left'

    const textX = padX + circR * 2 + 6
    const lblFont = fontStr(lblFs, 'bold')
    ctx.font = lblFont
    ctx.fillStyle = '#2a2318'
    ctx.fillText(
      truncText(ctx, safeStr(pt.label), contentW - textX + padX, lblFont),
      textX,
      layout.cursorY,
    )

    if (pt.detail && hasDetails && layout.cursorY + itemH < contentBottom) {
      const dtlFont = fontStr(dtlFs)
      ctx.font = dtlFont
      ctx.fillStyle = '#8a7a5a'
      ctx.fillText(
        truncText(ctx, safeStr(pt.detail), contentW - textX + padX, dtlFont),
        textX,
        layout.cursorY + lblFs + 3,
      )
    }
    advance(layout, itemH)
  }

  if (points.length > displayPts.length) {
    ctx.font = fontStr(8)
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(`+${points.length - displayPts.length} more`, padX, layout.cursorY)
  }

  return true
}
