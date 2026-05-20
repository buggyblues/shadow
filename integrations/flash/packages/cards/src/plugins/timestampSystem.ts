// ECS Content System — Timestamp Card
// Displays a formatted date/time with optional lunar calendar.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { timestampMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

function parseDate(isoStr: string): Date | null {
  try {
    const d = new Date(isoStr)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const MONTH_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function timestampSystem(eid: number): boolean {
  const meta = timestampMetaStore[eid]
  if (!meta) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const d = parseDate(meta.datetime)
  const avail = remainingH(layout)
  const cx = padX + contentW / 2

  if (!d) {
    // Fallback: just show the raw string
    ctx.font = fontStr(10, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(safeStr(meta.datetime) || '—', cx, layout.cursorY + avail / 2)
    advance(layout, avail)
    return true
  }

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const precision = meta.precision || 'minute'
  const isTimePrecision = precision === 'minute' || precision === 'hour' || precision === 'second'

  // ── Calendar-card layout ─────────────────────────────
  // Month banner (accent strip)
  const bannerH = Math.min(22, avail * 0.22)
  if (avail > 50) {
    ctx.fillStyle = hexAlpha(accentColor, 0.85)
    ctx.beginPath()
    ctx.roundRect(padX, layout.cursorY, contentW, bannerH, [4, 4, 0, 0])
    ctx.fill()
    const monthIdx = d.getMonth()
    const monthStr = MONTH_EN[monthIdx]
    ctx.font = fontStr(Math.round(bannerH * 0.52), 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = 'rgba(15,10,5,0.85)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${d.getFullYear()}  ${monthStr}`, padX + 8, layout.cursorY + bannerH / 2)
    // Weekday on right
    ctx.font = fontStr(Math.round(bannerH * 0.45), '600', '', '"Noto Sans SC", sans-serif')
    ctx.textAlign = 'right'
    ctx.fillText(WEEKDAY_EN[d.getDay()], padX + contentW - 8, layout.cursorY + bannerH / 2)
    advance(layout, bannerH)
  }

  // ── Day number (giant) ───────────────────────────────
  const remainAfterBanner = remainingH(layout)
  const dayFontSize = Math.min(52, remainAfterBanner * 0.65)
  if (precision === 'day' || precision === 'month' || precision === 'year' || isTimePrecision) {
    if (precision !== 'year' && precision !== 'month' && dayFontSize > 18) {
      ctx.font = fontStr(dayFontSize, '900', '', '"Cinzel", Georgia, serif')
      ctx.fillStyle = accentColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(String(d.getDate()), cx, layout.cursorY + 2)
      advance(layout, dayFontSize + 6)
    } else if (precision === 'month' || precision === 'year') {
      // No day: show year big
      const yearFont = Math.min(36, remainAfterBanner * 0.55)
      ctx.font = fontStr(yearFont, '900', '', '"Cinzel", Georgia, serif')
      ctx.fillStyle = accentColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(String(d.getFullYear()), cx, layout.cursorY + 4)
      advance(layout, yearFont + 8)
      if (precision === 'month' && remainingH(layout) > 12) {
        ctx.font = fontStr(11, 'bold', '', '"Noto Sans SC", sans-serif')
        ctx.fillStyle = hexAlpha(accentColor, 0.75)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(MONTH_EN[d.getMonth()], cx, layout.cursorY)
        advance(layout, 14)
      }
    }
  }

  // ── Time strip (if time precision) ───────────────────
  if (isTimePrecision && remainingH(layout) > 14) {
    let timeStr = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    if (precision === 'second') timeStr += `:${pad2(d.getSeconds())}`
    const timeFontSize = Math.min(16, remainingH(layout) * 0.55)
    ctx.font = fontStr(timeFontSize, 'bold', '', 'monospace')
    ctx.fillStyle = hexAlpha(accentColor, 0.9)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(timeStr, cx, layout.cursorY)
    advance(layout, timeFontSize + 4)
  }

  // ── Label ────────────────────────────────────────────
  const label = safeStr(meta.label)
  if (label && remainingH(layout) > 10) {
    ctx.font = fontStr(8, '600', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.8)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(label.slice(0, 26), cx, layout.cursorY + 1)
    advance(layout, 11)
  }

  // ── Note / timezone ──────────────────────────────────
  const note = safeStr(meta.note)
  if (note && remainingH(layout) > 9) {
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.45)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(note.slice(0, 30), cx, layout.cursorY)
    advance(layout, 10)
  }
  if (meta.timezone && remainingH(layout) > 8) {
    ctx.font = fontStr(6.5, '', '', 'monospace')
    ctx.fillStyle = hexAlpha(accentColor, 0.35)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.timezone, cx, layout.cursorY)
    advance(layout, 9)
  }

  return true
}
