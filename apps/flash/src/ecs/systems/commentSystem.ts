// ECS Content System — Comment Card
// Displays a discussion thread with author, content, and replies.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { commentMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function commentSystem(eid: number): boolean {
  const meta = commentMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  // ── Author row ─────────────────────────────────────────
  if (remainingH(layout) > 12) {
    const avatarR = 7
    // Avatar circle
    ctx.fillStyle = hexAlpha(accentColor, 0.2)
    ctx.beginPath()
    ctx.arc(padX + avatarR, layout.cursorY + avatarR, avatarR, 0, Math.PI * 2)
    ctx.fill()
    const initials = (meta.author?.name ?? '?').slice(0, 1)
    ctx.font = fontStr(8, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, padX + avatarR, layout.cursorY + avatarR)

    // Author name
    ctx.font = fontStr(8.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(
      safeStr(meta.author?.name).slice(0, 16),
      padX + avatarR * 2 + 4,
      layout.cursorY + 1,
    )

    // Resolved badge
    if (meta.resolved) {
      ctx.font = fontStr(6.5, '', '', 'sans-serif')
      ctx.fillStyle = '#4ade80'
      ctx.textAlign = 'right'
      ctx.fillText('✓ Resolved', padX + contentW, layout.cursorY + 3)
    }

    advance(layout, avatarR * 2 + 4)
  }

  // ── Comment bubble ─────────────────────────────────────
  const content = safeStr(meta.content)
  if (content && remainingH(layout) > 12) {
    const charsPerLine = Math.floor((contentW - 4) / 5.2)
    const maxLines = Math.min(4, Math.floor(remainingH(layout) / 10))
    const lines = []
    for (let i = 0; i < maxLines && i * charsPerLine < content.length; i++) {
      lines.push(content.slice(i * charsPerLine, (i + 1) * charsPerLine))
    }
    const bubbleH = lines.length * 10 + 8
    ctx.fillStyle = hexAlpha(accentColor, 0.07)
    ctx.beginPath()
    ctx.roundRect(padX, layout.cursorY, contentW, bubbleH, 5)
    ctx.fill()
    ctx.strokeStyle = hexAlpha(accentColor, 0.15)
    ctx.lineWidth = 0.5
    ctx.stroke()

    ctx.font = fontStr(8, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.85)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    lines.forEach((line, i) => ctx.fillText(line, padX + 4, layout.cursorY + 4 + i * 10))
    advance(layout, bubbleH + 4)
  }

  // ── Reactions ──────────────────────────────────────────
  if (meta.reactions && meta.reactions.length > 0 && remainingH(layout) > 11) {
    let rx = padX
    meta.reactions.slice(0, 5).forEach((r) => {
      const rw = 24
      ctx.fillStyle = hexAlpha(accentColor, 0.08)
      ctx.beginPath()
      ctx.roundRect(rx, layout.cursorY, rw, 12, 3)
      ctx.fill()
      ctx.font = fontStr(7.5, '', '', 'sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.7)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${r.emoji}${r.count}`, rx + rw / 2, layout.cursorY + 6)
      rx += rw + 3
    })
    advance(layout, 15)
  }

  // ── Replies ────────────────────────────────────────────
  if (meta.replies && meta.replies.length > 0 && remainingH(layout) > 12) {
    ctx.fillStyle = hexAlpha(accentColor, 0.25)
    ctx.fillRect(padX + 2, layout.cursorY, 1.5, 10)
    ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.55)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const reply = meta.replies[0]
    ctx.fillText(`${reply.author}: ${reply.content}`.slice(0, 36), padX + 8, layout.cursorY + 1)
    if (meta.replies.length > 1) {
      ctx.fillStyle = hexAlpha(accentColor, 0.35)
      ctx.fillText(`+${meta.replies.length - 1} replies`, padX + 8, layout.cursorY + 11)
    }
    advance(layout, meta.replies.length > 1 ? 24 : 12)
  }

  return true
}
