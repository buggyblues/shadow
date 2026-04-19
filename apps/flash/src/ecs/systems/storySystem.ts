// ECS Content System — Story Card
// Displays a narrative/blog post with title, body, reading time, and chapters.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { storyMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

export function storySystem(eid: number): boolean {
  const meta = storyMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  // ── Title ──────────────────────────────────────────────
  if (remainingH(layout) > 13) {
    ctx.font = fontStr(10.5, 'bold', '', '"Noto Sans SC", serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncText(ctx, meta.title, contentW), padX, layout.cursorY)
    advance(layout, 14)
  }

  // ── Author + reading time ──────────────────────────────
  const authorParts: string[] = []
  if (meta.author) authorParts.push(meta.author)
  if (meta.readingTime) authorParts.push(`${meta.readingTime} min read`)
  if (authorParts.length > 0 && remainingH(layout) > 9) {
    ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.5)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(authorParts.join('  ·  '), padX, layout.cursorY)
    advance(layout, 11)
  }

  // ── Divider ────────────────────────────────────────────
  if (remainingH(layout) > 4) {
    ctx.strokeStyle = hexAlpha(accentColor, 0.2)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(padX, layout.cursorY + 1)
    ctx.lineTo(padX + contentW * 0.4, layout.cursorY + 1)
    ctx.stroke()
    advance(layout, 4)
  }

  // ── Body excerpt ──────────────────────────────────────
  const body = safeStr(meta.body)
  if (body && remainingH(layout) > 12) {
    const charsPerLine = Math.floor(contentW / 5)
    const maxLines = Math.min(5, Math.floor(remainingH(layout) / 9))
    ctx.font = fontStr(8, '', '', '"Noto Sans SC", serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.75)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (let i = 0; i < maxLines && i * charsPerLine < body.length; i++) {
      const chunk = body.slice(i * charsPerLine, (i + 1) * charsPerLine)
      ctx.fillText(chunk, padX, layout.cursorY + i * 9)
    }
    advance(layout, maxLines * 9 + 4)
  }

  // ── Chapters ──────────────────────────────────────────
  if (meta.chapters && meta.chapters.length > 0 && remainingH(layout) > 10) {
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    meta.chapters.slice(0, 3).forEach((ch, i) => {
      if (remainingH(layout) < 10) return
      ctx.fillStyle = hexAlpha(accentColor, 0.4)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${i + 1}. ${ch.title}`.slice(0, 30), padX + 4, layout.cursorY)
      advance(layout, 10)
    })
    if (meta.chapters.length > 3) {
      ctx.fillStyle = hexAlpha(accentColor, 0.25)
      ctx.fillText(`…${meta.chapters.length} chapters total`, padX + 4, layout.cursorY)
      advance(layout, 10)
    }
  }

  // ── Tags ──────────────────────────────────────────────
  if (meta.tags && meta.tags.length > 0 && remainingH(layout) > 10) {
    let tx = padX
    meta.tags.slice(0, 4).forEach((tag) => {
      const w = Math.min(tag.length * 5.5 + 8, 60)
      ctx.fillStyle = hexAlpha(accentColor, 0.1)
      ctx.beginPath()
      ctx.roundRect(tx, layout.cursorY, w, 11, 3)
      ctx.fill()
      ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.55)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(tag.slice(0, 8), tx + w / 2, layout.cursorY + 5.5)
      tx += w + 3
    })
    advance(layout, 14)
  }

  return true
}
