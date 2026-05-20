// ECS Content System — Process Card

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { processMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function processSystem(eid: number): boolean {
  const meta = processMetaStore[eid]
  const rawSteps = Array.isArray(meta?.steps) ? meta.steps : []
  const allSteps = rawSteps.filter((s) => s && (s.label || s.detail))
  if (allSteps.length === 0) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  const nodeX = padX + 8
  const availH = remainingH(layout)

  // LARGER adaptive step height
  const maxSteps = Math.min(allSteps.length, 7)
  const hasDetails = allSteps.some((s) => s.detail)
  const baseStepH = hasDetails ? 24 : 18
  const stepH = Math.max(baseStepH, Math.min(34, Math.floor(availH / maxSteps)))
  const displayCount = Math.min(maxSteps, Math.max(2, Math.floor(availH / stepH)))
  const steps = allSteps.slice(0, displayCount)

  const lblFs = Math.max(9, Math.min(12, Math.round(stepH * 0.38)))
  const dtlFs = Math.max(7, Math.min(10, Math.round(stepH * 0.3)))
  const nodeR = Math.max(6, Math.min(8, Math.round(stepH * 0.24)))

  for (let i = 0; i < steps.length && layout.cursorY + stepH * 0.6 < contentBottom; i++) {
    const step = steps[i]

    // Connector
    if (i < steps.length - 1) {
      ctx.strokeStyle = hexAlpha(accentColor, 0.2)
      ctx.lineWidth = 0.8
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(nodeX, layout.cursorY + nodeR + 3)
      ctx.lineTo(nodeX, layout.cursorY + stepH)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Node circle — larger
    ctx.fillStyle = hexAlpha(accentColor, 0.12)
    ctx.beginPath()
    ctx.arc(nodeX, layout.cursorY + nodeR - 1, nodeR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = accentColor
    ctx.beginPath()
    ctx.arc(nodeX, layout.cursorY + nodeR - 1, nodeR * 0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = fontStr(Math.round(nodeR * 1.1), 'bold', '', 'sans-serif')
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText(`${step.order || i + 1}`, nodeX, layout.cursorY + nodeR * 0.4)
    ctx.textAlign = 'left'

    // Label — LARGE
    const textX = nodeX + nodeR + 7
    const lblFont = fontStr(lblFs, 'bold')
    ctx.font = lblFont
    ctx.fillStyle = '#2a2318'
    ctx.fillText(
      truncText(ctx, safeStr(step.label), contentW - textX + padX, lblFont),
      textX,
      layout.cursorY,
    )

    // Detail — larger
    if (step.detail && hasDetails && layout.cursorY + stepH < contentBottom) {
      const dtlFont = fontStr(dtlFs)
      ctx.font = dtlFont
      ctx.fillStyle = '#8a7a5a'
      ctx.fillText(
        truncText(ctx, safeStr(step.detail), contentW - textX + padX, dtlFont),
        textX,
        layout.cursorY + lblFs + 3,
      )
    }

    advance(layout, stepH)
  }

  if (allSteps.length > steps.length) {
    ctx.font = fontStr(8)
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(`+${allSteps.length - steps.length} more`, padX, layout.cursorY)
  }

  return true
}
