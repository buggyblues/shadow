// ECS Content System — Link Card
// Displays a URL with title, description, source label, and tags.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { linkMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, isDuplicateTitle, safeStr, truncText } from '../utils/canvasUtils'

function drawLinkIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  // Simple link chain icon
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.18
  ctx.lineCap = 'round'
  const gap = r * 0.25
  // Left ring
  ctx.beginPath()
  ctx.arc(x - gap, y, r * 0.38, Math.PI * 0.5, Math.PI * 1.5)
  ctx.stroke()
  // Right ring
  ctx.beginPath()
  ctx.arc(x + gap, y, r * 0.38, -Math.PI * 0.5, Math.PI * 0.5)
  ctx.stroke()
  // Connector bars
  ctx.beginPath()
  ctx.moveTo(x - gap, y - r * 0.38)
  ctx.lineTo(x + gap, y - r * 0.38)
  ctx.moveTo(x - gap, y + r * 0.38)
  ctx.lineTo(x + gap, y + r * 0.38)
  ctx.stroke()
}

export function linkSystem(eid: number): boolean {
  const meta = linkMetaStore[eid]
  if (!meta) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  // ── Title row ─────────────────────────────────────────
  if (remainingH(layout) > 12 && !isDuplicateTitle(meta.title, card.title)) {
    // Small icon
    const iconR = 6
    const iconX = padX + iconR + 1
    const iconY = layout.cursorY + iconR + 2
    drawLinkIcon(ctx, iconX, iconY, iconR, hexAlpha(accentColor, 0.8))

    const title = safeStr(meta.title || meta.url)
    ctx.font = fontStr(9.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      truncText(ctx, title, contentW - iconR * 2 - 10),
      padX + iconR * 2 + 8,
      layout.cursorY + iconR + 2,
    )
    advance(layout, iconR * 2 + 6)
  }

  // ── Source badge ───────────────────────────────────────
  if (meta.source && remainingH(layout) > 10) {
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.55)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.source.slice(0, 24), padX, layout.cursorY + 1)
    advance(layout, 10)
  }

  // ── Description ───────────────────────────────────────
  const desc = safeStr(meta.description)
  if (desc && remainingH(layout) > 12) {
    ctx.font = fontStr(8, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.75)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const maxLines = Math.floor(remainingH(layout) / 11)
    const words = desc
    // Simple word-wrap: split at ~contentW chars
    const charsPerLine = Math.floor(contentW / 5.2)
    for (let i = 0; i < Math.min(maxLines, 3); i++) {
      const chunk = words.slice(i * charsPerLine, (i + 1) * charsPerLine)
      if (!chunk) break
      ctx.fillText(chunk, padX, layout.cursorY + 1)
      advance(layout, 11)
    }
  }

  // ── URL truncated ─────────────────────────────────────
  if (remainingH(layout) > 9) {
    const urlDisplay = meta.url.replace(/^https?:\/\//, '').slice(0, 44)
    ctx.font = fontStr(6.5, '', '', '"Courier New", monospace')
    ctx.fillStyle = hexAlpha(accentColor, 0.4)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(urlDisplay, padX, layout.cursorY + 1)
    advance(layout, 9)
  }

  // ── Tags ──────────────────────────────────────────────
  if (meta.tags && meta.tags.length > 0 && remainingH(layout) > 10) {
    let tx = padX
    const ty = layout.cursorY + 1
    ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
    for (const tag of meta.tags.slice(0, 4)) {
      const tw = ctx.measureText(`#${tag}`).width + 6
      if (tx + tw > padX + contentW) break
      ctx.fillStyle = hexAlpha(accentColor, 0.12)
      ctx.beginPath()
      ctx.roundRect(tx, ty, tw, 9, 2)
      ctx.fill()
      ctx.fillStyle = hexAlpha(accentColor, 0.55)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`#${tag}`, tx + 3, ty + 1)
      tx += tw + 3
    }
    advance(layout, 11)
  }

  void width
  return true
}
