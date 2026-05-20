// ECS Content System — Countdown Timer Card
// Large segmented-display style day/hour/min countdown + target label.
// Uses AnimationManager.registerCountdown() to invalidate the texture
// cache every second, triggering a fresh Canvas 2D bake each tick.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { countdownMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

function calcCountdown(targetDate: string | undefined): {
  days: number
  hours: number
  mins: number
  secs: number
  expired: boolean
} {
  if (!targetDate) return { days: 0, hours: 0, mins: 0, secs: 0, expired: true }
  const target = new Date(targetDate).getTime()
  if (isNaN(target)) return { days: 0, hours: 0, mins: 0, secs: 0, expired: true }
  const now = Date.now()
  const diff = target - now
  if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0, expired: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  return { days, hours, mins, secs, expired: false }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function countdownSystem(eid: number): boolean {
  const meta = countdownMetaStore[eid]
  if (!meta) return false

  // Register with AnimationManager for 1-second live ticks
  const { card } = cardDataStore[eid]!
  animationManager.registerCountdown(card.id)

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const { days, hours, mins, secs, expired } = calcCountdown(meta.targetDate)

  // ── Label ──────────────────────────────────────────────
  if (meta.label && remainingH(layout) > 12) {
    ctx.font = fontStr(7.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.75)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.label.slice(0, 24), padX + contentW / 2, layout.cursorY + 2)
    advance(layout, 13)
  }

  if (expired) {
    // Expired state
    ctx.font = fontStr(12, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.5)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Ended', padX + contentW / 2, layout.cursorY + 20)
    advance(layout, 40)
    return true
  }

  // ── Digit blocks ─────────────────────────────────────
  // precision: 'days'|'hours'|'minutes'|'seconds' or auto
  const precision = (meta as { precision?: string }).precision
  let units: { v: string; u: string }[]
  if (precision === 'days') {
    units = [
      { v: pad2(days), u: 'd' },
      { v: pad2(hours), u: 'h' },
      { v: pad2(mins), u: 'm' },
    ]
  } else if (precision === 'hours') {
    units = [
      { v: pad2(days), u: 'd' },
      { v: pad2(hours), u: 'h' },
      { v: pad2(mins), u: 'm' },
    ]
  } else if (precision === 'minutes') {
    units = [
      { v: pad2(hours), u: 'h' },
      { v: pad2(mins), u: 'm' },
      { v: pad2(secs), u: 's' },
    ]
  } else if (precision === 'seconds') {
    units = [
      { v: pad2(hours), u: 'h' },
      { v: pad2(mins), u: 'm' },
      { v: pad2(secs), u: 's' },
    ]
  } else {
    // auto: show days/hours/mins when remaining > 2 days, else hours/mins/secs
    units =
      days > 0
        ? [
            { v: pad2(days), u: 'd' },
            { v: pad2(hours), u: 'h' },
            { v: pad2(mins), u: 'm' },
          ]
        : [
            { v: pad2(hours), u: 'h' },
            { v: pad2(mins), u: 'm' },
            { v: pad2(secs), u: 's' },
          ]
  }

  const blockW = Math.floor((contentW - 8) / units.length)
  const blockH = Math.min(remainingH(layout) - 24, blockW * 0.85)
  const totalW = blockW * units.length
  const startX = padX + (contentW - totalW) / 2
  const blockY = layout.cursorY + 4

  units.forEach(({ v, u }, i) => {
    const bx = startX + i * blockW
    const bInner = blockW - 6

    // Block background
    ctx.fillStyle = hexAlpha(accentColor, 0.08)
    fillRoundRect(ctx, bx + 3, blockY, bInner, blockH, 4)

    // Top/bottom separator lines (LCD segment aesthetic)
    ctx.strokeStyle = hexAlpha(accentColor, 0.15)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(bx + 5, blockY + blockH * 0.45)
    ctx.lineTo(bx + 3 + bInner - 2, blockY + blockH * 0.45)
    ctx.stroke()

    // Digit
    const digitFs = Math.floor(blockH * 0.52)
    ctx.font = fontStr(digitFs, 'bold', '', '"Courier New", monospace')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(v, bx + blockW / 2, blockY + blockH * 0.42)

    // Unit label
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.55)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(u, bx + blockW / 2, blockY + blockH * 0.72)

    // Colon separator
    if (i < units.length - 1) {
      ctx.font = fontStr(Math.floor(digitFs * 0.7), 'bold', '', 'monospace')
      ctx.fillStyle = hexAlpha(accentColor, 0.45)
      ctx.fillText(':', bx + blockW - 1, blockY + blockH * 0.38)
    }
  })

  advance(layout, blockH + 12)

  // ── Target date ───────────────────────────────────────
  if (remainingH(layout) > 10) {
    const d = new Date(meta.targetDate)
    const dateStr = isNaN(d.getTime())
      ? meta.targetDate
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.4)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(dateStr, padX + contentW / 2, layout.cursorY + 2)
    advance(layout, 11)
  }

  return true
}
