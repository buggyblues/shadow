// ECS Content System — Event Card
// Displays a calendar event with time, location, and attendees.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { eventMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

function formatEventTime(isoStr?: string): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}/${d.getDate()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return isoStr
  }
}

export function eventSystem(eid: number): boolean {
  const meta = eventMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  // ── Calendar dot decoration ────────────────────────────
  if (remainingH(layout) > 8) {
    const dotColor = meta.color || accentColor
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(padX + 5, layout.cursorY + 6, 5, 0, Math.PI * 2)
    ctx.fill()
    // Title next to dot
    ctx.font = fontStr(10, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(truncText(ctx, meta.title, contentW - 16), padX + 14, layout.cursorY + 6)
    advance(layout, 16)
  }

  // ── Date/time bar ──────────────────────────────────────
  if (remainingH(layout) > 10) {
    ctx.fillStyle = hexAlpha(accentColor, 0.07)
    ctx.beginPath()
    ctx.roundRect(padX, layout.cursorY, contentW, 18, 4)
    ctx.fill()

    const startStr = formatEventTime(meta.startAt)
    const endStr = formatEventTime(meta.endAt)
    const timeStr = meta.allDay ? 'All day' : endStr ? `${startStr} → ${endStr}` : startStr

    ctx.font = fontStr(8, '', '', '"Noto Sans SC", monospace')
    ctx.fillStyle = hexAlpha(accentColor, 0.8)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(timeStr, padX + contentW / 2, layout.cursorY + 9)
    advance(layout, 22)
  }

  // ── Location ───────────────────────────────────────────
  if (meta.location && remainingH(layout) > 10) {
    ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.65)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`📍 ${meta.location}`.slice(0, 34), padX, layout.cursorY)
    advance(layout, 11)
  }

  // ── Attendees avatars (initials) ───────────────────────
  if (meta.attendees && meta.attendees.length > 0 && remainingH(layout) > 14) {
    const avatarR = 7
    meta.attendees.slice(0, 5).forEach((a, i) => {
      const ax = padX + i * (avatarR * 2 + 2) + avatarR
      const ay = layout.cursorY + avatarR
      ctx.fillStyle = hexAlpha(accentColor, 0.2 + i * 0.05)
      ctx.beginPath()
      ctx.arc(ax, ay, avatarR, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = fontStr(7, 'bold', '', '"Noto Sans SC", sans-serif')
      ctx.fillStyle = accentColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(a.name.charAt(0), ax, ay)
    })
    if (meta.attendees.length > 5) {
      ctx.font = fontStr(6.5, '', '', 'sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.45)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        `+${meta.attendees.length - 5}`,
        padX + 5 * (avatarR * 2 + 2),
        layout.cursorY + avatarR,
      )
    }
    advance(layout, avatarR * 2 + 5)
  }

  // ── Recurrence ────────────────────────────────────────
  if (meta.recurrence && remainingH(layout) > 9) {
    const labels: Record<string, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly',
      custom: 'Custom',
    }
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.4)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`↺ ${labels[meta.recurrence] || meta.recurrence}`, padX, layout.cursorY)
    advance(layout, 10)
  }

  return true
}
