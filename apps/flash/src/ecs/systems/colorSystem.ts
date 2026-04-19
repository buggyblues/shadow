// ECS Content System — Color Card
// Displays a color swatch with hex/rgb/hsl values and optional palette.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { colorMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function isLight(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return false
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 128
}

export function colorSystem(eid: number): boolean {
  const meta = colorMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout

  // ── Main swatch ────────────────────────────────────────
  const swatchH = Math.min(55, remainingH(layout) * 0.45)
  if (swatchH > 16) {
    ctx.fillStyle = meta.hex
    ctx.beginPath()
    ctx.roundRect(padX, layout.cursorY, contentW, swatchH, 6)
    ctx.fill()
    // Hex label on swatch
    const textColor = isLight(meta.hex) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)'
    ctx.font = fontStr(11, 'bold', '', 'monospace')
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(meta.hex.toUpperCase(), padX + contentW / 2, layout.cursorY + swatchH / 2)
    advance(layout, swatchH + 5)
  }

  // ── Color name ─────────────────────────────────────────
  if (meta.name && remainingH(layout) > 11) {
    ctx.font = fontStr(9.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = meta.hex
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.name, padX, layout.cursorY)
    advance(layout, 13)
  }

  // ── RGB / HSL values ───────────────────────────────────
  const rgb = meta.rgb || hexToRgb(meta.hex)
  if (rgb && remainingH(layout) > 9) {
    const rgbStr = `R${rgb.r} G${rgb.g} B${rgb.b}`
    ctx.font = fontStr(7, '', '', 'monospace')
    ctx.fillStyle = hexAlpha(meta.hex, 0.7)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(rgbStr, padX, layout.cursorY)
    advance(layout, 10)
  }

  if (meta.hsl && remainingH(layout) > 9) {
    const { h, s, l } = meta.hsl
    const hslStr = `H${h}° S${s}% L${l}%`
    ctx.font = fontStr(7, '', '', 'monospace')
    ctx.fillStyle = hexAlpha(meta.hex, 0.55)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(hslStr, padX, layout.cursorY)
    advance(layout, 10)
  }

  // ── Palette chips ──────────────────────────────────────
  if (meta.palette && meta.palette.length > 0 && remainingH(layout) > 14) {
    const chipW = Math.min(16, (contentW - 2) / meta.palette.length - 2)
    const chipH = 12
    meta.palette.slice(0, 8).forEach((chip, i) => {
      ctx.fillStyle = chip.hex
      ctx.beginPath()
      ctx.roundRect(padX + i * (chipW + 2), layout.cursorY, chipW, chipH, 2)
      ctx.fill()
    })
    advance(layout, chipH + 4)
  }

  // ── Usage / system ─────────────────────────────────────
  const usage = safeStr(meta.usage || meta.system)
  if (usage && remainingH(layout) > 9) {
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(meta.hex, 0.5)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(usage.slice(0, 32), padX, layout.cursorY)
    advance(layout, 9)
  }

  return true
}
