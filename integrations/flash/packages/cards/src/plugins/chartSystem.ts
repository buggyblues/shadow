// ECS Content System — Chart Card (bar / line / area / pie / donut)
// NO grid lines — clean, large charts that fill the available space.

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { chartMetaStore } from '../components/metaComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export function chartSystem(eid: number): boolean {
  const meta = chartMetaStore[eid]
  const rawSeries = Array.isArray(meta?.series) ? meta.series : []
  const series = rawSeries
    .map((s) => ({
      name: safeStr(s?.name),
      data: Array.isArray(s?.data) ? s.data : [],
      color: s?.color,
    }))
    .filter((s) => s.data.length > 0)
  if (series.length === 0) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout

  const chartType = safeStr(meta?.chartType || 'bar').replace('Chart', '')
  const categories = meta?.categories || meta?.labels

  // Chart title — LARGE
  if (meta?.chartTitle) {
    const ctFont = fontStr(11, 'bold')
    ctx.font = ctFont
    ctx.fillStyle = '#3d3528'
    ctx.fillText(truncText(ctx, safeStr(meta.chartTitle), contentW, ctFont), padX, layout.cursorY)
    advance(layout, 15)
  }

  // Adaptive chart dimensions — FILL AVAILABLE SPACE
  const availH = remainingH(layout)
  const chartLeft = padX + 3
  const chartRight = width - padX - 3
  const chartW = chartRight - chartLeft
  const chartTop = layout.cursorY + 2
  const legendReserve = series.length > 1 ? 14 : 0
  const insightReserve = meta?.insight ? 14 : 0
  const chartBottom = Math.min(
    layout.cursorY + Math.max(50, availH - 10 - legendReserve - insightReserve),
    contentBottom - 8 - legendReserve - insightReserve,
  )
  const chartH = chartBottom - chartTop

  if (chartType === 'pie' || chartType === 'donut') {
    const data = series[0]?.data || []
    const total = data.reduce((a, b) => a + b, 0) || 1
    // PIE radius: fill space
    const pieR = Math.min(40, chartH / 2 - 4, chartW / 3)
    const cx = padX + pieR + 6
    const pcy = chartTop + chartH / 2
    let cumAngle = -Math.PI / 2

    for (let i = 0; i < data.length; i++) {
      const angle = (data[i] / total) * Math.PI * 2
      const color = COLORS[i % COLORS.length]
      ctx.fillStyle = color
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(cx, pcy)
      ctx.arc(cx, pcy, pieR, cumAngle, cumAngle + angle)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      cumAngle += angle
    }

    if (chartType === 'donut') {
      ctx.fillStyle = '#f5f0e8'
      ctx.beginPath()
      ctx.arc(cx, pcy, pieR * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }

    // Legend — LARGER
    const legendX = cx + pieR + 10
    const legendFs = Math.max(7, Math.min(10, Math.round(chartH / data.length / 1.6)))
    const legendFont = fontStr(legendFs)
    for (let i = 0; i < Math.min(data.length, 6); i++) {
      const ly = chartTop + 4 + i * (legendFs + 6)
      if (ly + legendFs > contentBottom) break
      ctx.fillStyle = COLORS[i % COLORS.length]
      ctx.beginPath()
      ctx.arc(legendX + 3, ly + legendFs * 0.4, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = legendFont
      ctx.fillStyle = '#3d3528'
      const pctStr = `${Math.round((data[i] / total) * 100)}%`
      const label = safeStr(categories?.[i])?.slice(0, 6) || `#${i + 1}`
      ctx.fillText(
        truncText(ctx, `${label} ${pctStr}`, chartRight - legendX - 10, legendFont),
        legendX + 9,
        ly,
      )
    }
    layout.cursorY = chartBottom + 3
  } else if (chartType === 'line' || chartType === 'area') {
    // NO GRID LINES — clean chart

    for (let si = 0; si < series.length; si++) {
      const s = series[si]
      const color = s.color || COLORS[si % COLORS.length]
      const allData = s.data
      const maxVal = Math.max(...allData, 1)
      const points: [number, number][] = allData.map((val, i) => {
        const x = chartLeft + (i / Math.max(allData.length - 1, 1)) * chartW
        const y = chartBottom - (val / maxVal) * (chartH - 6)
        return [x, y]
      })

      if (chartType === 'area') {
        ctx.fillStyle = hexAlpha(color, 0.12)
        ctx.beginPath()
        ctx.moveTo(chartLeft, chartBottom)
        points.forEach(([x, y]) => ctx.lineTo(x, y))
        ctx.lineTo(chartRight, chartBottom)
        ctx.closePath()
        ctx.fill()
      }

      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      ctx.stroke()

      ctx.fillStyle = color
      points.forEach(([x, y]) => {
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    layout.cursorY = chartBottom + 3
  } else {
    // Bar chart (default) — NO GRID LINES
    const allData = series.flatMap((s) => s.data)
    const maxVal = Math.max(...allData, 1)
    const dataLen = series[0]?.data.length || 0

    const groupW = chartW / Math.max(dataLen, 1)
    const barsPerGroup = series.length
    const barW = Math.min(16, (groupW * 0.75) / barsPerGroup)

    for (let si = 0; si < series.length; si++) {
      const s = series[si]
      const color = s.color || COLORS[si % COLORS.length]
      for (let di = 0; di < s.data.length; di++) {
        const val = s.data[di]
        const bh = (val / maxVal) * (chartH - 6)
        const gx = chartLeft + di * groupW + groupW * 0.12
        const bx = gx + si * (barW + 1)
        ctx.fillStyle = hexAlpha(color, 0.8)
        fillRoundRect(ctx, bx, chartBottom - bh, barW, bh, 2)
        ctx.fillStyle = color
        fillRoundRect(ctx, bx, chartBottom - bh, barW, Math.min(3, bh), 2)
      }
    }

    // X-axis labels — larger
    if (categories) {
      const xlFs = Math.max(6, Math.min(8, Math.floor(groupW * 0.5)))
      const xlFont = fontStr(xlFs)
      ctx.font = xlFont
      ctx.fillStyle = '#8a7a5a'
      ctx.textAlign = 'center'
      for (let i = 0; i < Math.min(categories.length, dataLen); i++) {
        const lx = chartLeft + i * groupW + groupW / 2
        ctx.fillText(safeStr(categories[i]).slice(0, 5), lx, chartBottom + 2)
      }
      ctx.textAlign = 'left'
    }
    layout.cursorY = chartBottom + (categories ? 14 : 3)
  }

  // Legend for multi-series — larger
  if (series.length > 1 && hasSpace(layout, 12)) {
    let lx = padX
    const lgFont = fontStr(8)
    for (let i = 0; i < Math.min(series.length, 4); i++) {
      const color = series[i].color || COLORS[i % COLORS.length]
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(lx + 3, layout.cursorY + 4, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = lgFont
      ctx.fillStyle = '#8a7a5a'
      const lgText = series[i].name?.slice(0, 6) || ''
      ctx.fillText(lgText, lx + 8, layout.cursorY + 1)
      lx += ctx.measureText(lgText).width + 16
    }
    advance(layout, 12)
  }

  // Insight text — larger
  if (meta?.insight && hasSpace(layout, 14)) {
    const insFont = fontStr(9, '', 'italic')
    ctx.font = insFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(truncText(ctx, safeStr(meta.insight), contentW, insFont), padX, layout.cursorY)
  }

  return true
}
