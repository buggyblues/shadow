// ECS Content System — Position Card
// Displays a geographic location with lat/lng, address and map placeholder.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { positionMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

export function positionSystem(eid: number): boolean {
  const meta = positionMetaStore[eid]
  if (!meta) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  // ── Map placeholder ─────────────────────────────────
  const mapH = Math.min(60, remainingH(layout) * 0.45)
  if (mapH > 20) {
    const mapX = padX
    const mapY = layout.cursorY
    const mapW = contentW
    // Background
    ctx.fillStyle = hexAlpha(accentColor, 0.08)
    ctx.beginPath()
    ctx.roundRect(mapX, mapY, mapW, mapH, 5)
    ctx.fill()
    // Grid lines
    ctx.strokeStyle = hexAlpha(accentColor, 0.12)
    ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(mapX, mapY + (mapH * i) / 4)
      ctx.lineTo(mapX + mapW, mapY + (mapH * i) / 4)
      ctx.stroke()
    }
    for (let i = 1; i < 5; i++) {
      ctx.beginPath()
      ctx.moveTo(mapX + (mapW * i) / 5, mapY)
      ctx.lineTo(mapX + (mapW * i) / 5, mapY + mapH)
      ctx.stroke()
    }
    // Pin
    const pinX = mapX + mapW * 0.5
    const pinY = mapY + mapH * 0.45
    ctx.fillStyle = accentColor
    ctx.beginPath()
    ctx.arc(pinX, pinY, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(pinX, pinY, 3, 0, Math.PI * 2)
    ctx.fillStyle = hexAlpha('#ffffff', 0.9)
    ctx.fill()
    // Drop shadow line
    ctx.strokeStyle = hexAlpha(accentColor, 0.4)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(pinX, pinY + 5)
    ctx.lineTo(pinX, pinY + 9)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(pinX, pinY + 10, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = hexAlpha(accentColor, 0.3)
    ctx.fill()

    // Provider label
    const providerLabel =
      meta.provider === 'amap' ? 'AMap' : meta.provider === 'google' ? 'Google' : 'OSM'
    ctx.font = fontStr(6.5, '', '', 'monospace')
    ctx.fillStyle = hexAlpha(accentColor, 0.4)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(providerLabel, mapX + mapW - 3, mapY + mapH - 2)

    advance(layout, mapH + 5)
  }

  // ── Name ──────────────────────────────────────────────
  if (meta.name && remainingH(layout) > 10) {
    ctx.font = fontStr(9.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.name.slice(0, 22), padX, layout.cursorY)
    advance(layout, 13)
  }

  // ── Address ────────────────────────────────────────────
  if (meta.address && remainingH(layout) > 9) {
    ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.7)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.address.slice(0, 30), padX, layout.cursorY)
    advance(layout, 11)
  }

  // ── Coordinates ────────────────────────────────────────
  if (remainingH(layout) > 8) {
    const coordStr = `${meta.lat.toFixed(4)}, ${meta.lng.toFixed(4)}`
    ctx.font = fontStr(7, '', '', 'monospace')
    ctx.fillStyle = hexAlpha(accentColor, 0.45)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(coordStr, padX, layout.cursorY)
    advance(layout, 10)
  }

  return true
}
