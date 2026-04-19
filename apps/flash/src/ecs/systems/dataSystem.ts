// ECS Content System — Data Card (KPI Dashboard + mini bar chart)

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { dataMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function dataSystem(eid: number): boolean {
  const meta = dataMetaStore[eid]
  const rawMetrics = Array.isArray(meta?.metrics) ? meta.metrics : []
  const metrics = rawMetrics.filter((mt) => mt && (mt.key || mt.value !== undefined || mt.unit))
  if (metrics.length === 0) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  const availH = remainingH(layout)

  // Period badge — larger
  if (meta?.period && availH > 40) {
    const periodFont = fontStr(8)
    ctx.font = periodFont
    ctx.fillStyle = hexAlpha(accentColor, 0.12)
    const periodText = truncText(ctx, safeStr(meta.period), contentW - 10, periodFont)
    const tw = ctx.measureText(periodText).width
    fillRoundRect(ctx, padX, layout.cursorY, tw + 8, 12, 3)
    ctx.fillStyle = accentColor
    ctx.fillText(periodText, padX + 4, layout.cursorY + 1)
    advance(layout, 15)
  }

  // Calculate adaptive tile size — LARGER
  const maxMetrics = Math.min(metrics.length, availH < 60 ? 2 : availH < 100 ? 4 : 6)
  const displayMetrics = metrics.slice(0, maxMetrics)
  const rows = Math.ceil(displayMetrics.length / 2)

  const chartReserve = displayMetrics.length >= 2 ? 28 : 0
  const tileAreaH = remainingH(layout) - chartReserve
  const tileGap = 3
  const tileH = Math.max(28, Math.min(45, Math.floor((tileAreaH - (rows - 1) * tileGap) / rows)))

  // LARGE adaptive font sizes
  const valFs = Math.max(12, Math.min(16, Math.round(tileH * 0.35)))
  const keyFs = Math.max(7, Math.min(9, Math.round(tileH * 0.2)))
  const changeFs = Math.max(7, Math.min(9, Math.round(tileH * 0.2)))

  const colGap = 3
  const colW = (contentW - colGap) / 2

  for (let i = 0; i < displayMetrics.length; i++) {
    const mt = displayMetrics[i]
    const col = i % 2
    const row = Math.floor(i / 2)
    const tx = padX + col * (colW + colGap)
    const tileY = layout.cursorY + row * (tileH + tileGap)

    if (tileY + tileH > contentBottom) break

    ctx.fillStyle = hexAlpha(accentColor, 0.05)
    fillRoundRect(ctx, tx, tileY, colW, tileH, 3)

    ctx.fillStyle = hexAlpha(accentColor, 0.4)
    fillRoundRect(ctx, tx, tileY + 3, 2, tileH - 6, 1)

    // Value — LARGE
    const valFont = fontStr(valFs, 'bold')
    const valStr = safeStr(mt.value)
    let unitStr = ''
    if (mt.unit) unitStr = safeStr(mt.unit).slice(0, 4)
    const valUnitMax = colW - 8
    const displayVal = truncText(ctx, valStr, valUnitMax - (unitStr ? 18 : 0), valFont)
    ctx.font = valFont
    ctx.fillStyle = '#1a1510'
    ctx.fillText(displayVal, tx + 5, tileY + 3)

    if (unitStr) {
      const unitFont = fontStr(keyFs)
      ctx.font = valFont
      const valW3 = ctx.measureText(displayVal).width
      ctx.font = unitFont
      ctx.fillStyle = '#8a7a5a'
      ctx.fillText(unitStr, tx + 5 + valW3 + 2, tileY + 6)
    }

    // Change indicator
    if (mt.change) {
      const isUp = mt.changeDirection === 'up'
      const isDown = mt.changeDirection === 'down'
      const arrow = isUp ? '↑' : isDown ? '↓' : ''
      const changeStr = `${arrow}${safeStr(mt.change)}`
      const changeColor = isUp ? '#16a34a' : isDown ? '#dc2626' : '#8a7a5a'
      const changeFont = fontStr(changeFs, 'bold')
      ctx.font = changeFont
      ctx.fillStyle = changeColor
      ctx.fillText(truncText(ctx, changeStr, colW - 10, changeFont), tx + 5, tileY + valFs + 6)
    }

    // Key label
    const keyFont = fontStr(keyFs)
    ctx.font = keyFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(
      truncText(ctx, safeStr(mt.key), colW - 10, keyFont),
      tx + 5,
      tileY + tileH - keyFs - 3,
    )
  }
  advance(layout, rows * (tileH + tileGap) + 2)

  // Mini sparkline bar chart — LARGER
  const numericValues = displayMetrics
    .map((mt) => (typeof mt.value === 'number' ? mt.value : parseFloat(String(mt.value))))
    .filter((n) => !isNaN(n))
  if (numericValues.length >= 2 && hasSpace(layout, 18)) {
    const chartH = Math.min(26, remainingH(layout) - 2)
    const maxV = Math.max(...numericValues)
    const barW = Math.min(18, (contentW - (numericValues.length - 1) * 3) / numericValues.length)
    const chartX =
      padX + (contentW - numericValues.length * barW - (numericValues.length - 1) * 3) / 2

    for (let i = 0; i < numericValues.length; i++) {
      const bh = (numericValues[i] / maxV) * chartH * 0.9
      const bx = chartX + i * (barW + 3)
      ctx.fillStyle = hexAlpha(accentColor, 0.2)
      fillRoundRect(ctx, bx, layout.cursorY + chartH - bh, barW, bh, 2)
      ctx.fillStyle = hexAlpha(accentColor, 0.5)
      fillRoundRect(ctx, bx, layout.cursorY + chartH - bh, barW, Math.min(bh, 3), 2)
    }
  }

  return true
}
