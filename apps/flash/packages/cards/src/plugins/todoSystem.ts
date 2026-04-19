// ECS Content System — Todo Card
// Renders a checklist with progress bar, priority indicators, and tags.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { todoMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#94a3b8',
}

export function todoSystem(eid: number): boolean {
  const meta = todoMetaStore[eid]
  if (!meta || !meta.items || meta.items.length === 0) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const items = meta.items
  const doneCount = items.filter((it) => it.done).length
  const totalCount = items.length
  const progress = totalCount > 0 ? doneCount / totalCount : 0

  // ── Progress bar ──────────────────────────────────────
  if (remainingH(layout) > 10) {
    const barH = 4
    const barX = padX
    const barW = contentW
    const barY = layout.cursorY + 2

    // Background
    ctx.fillStyle = hexAlpha(accentColor, 0.12)
    fillRoundRect(ctx, barX, barY, barW, barH, barH / 2)

    // Fill
    if (progress > 0) {
      ctx.fillStyle = accentColor
      fillRoundRect(ctx, barX, barY, barW * progress, barH, barH / 2)
    }

    // Progress label
    ctx.font = fontStr(6.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.65)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const progressLabel = meta.progress || `${doneCount}/${totalCount}`
    ctx.fillText(progressLabel, padX + contentW, barY + barH / 2)

    advance(layout, barH + 5)
  }

  // ── Todo items ────────────────────────────────────────
  const itemH = 13
  const maxItems = Math.floor(remainingH(layout) / itemH)

  for (const item of items.slice(0, maxItems)) {
    if (remainingH(layout) < itemH) break

    const itemY = layout.cursorY + 1
    const checkSize = 8
    const checkX = padX + 1
    const checkY = itemY

    // Checkbox
    ctx.strokeStyle = hexAlpha(item.done ? accentColor : '#64748b', 0.7)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(checkX, itemY, checkSize, checkSize, 2)
    ctx.stroke()

    if (item.done) {
      // Checkmark
      ctx.strokeStyle = accentColor
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(checkX + 1.5, itemY + checkSize / 2)
      ctx.lineTo(checkX + checkSize * 0.38, itemY + checkSize - 2)
      ctx.lineTo(checkX + checkSize - 1.5, itemY + 1.5)
      ctx.stroke()
    }

    // Priority dot
    const pColor = item.priority ? PRIORITY_COLOR[item.priority] || '#94a3b8' : null
    const dotX = checkX + checkSize + 4
    if (pColor) {
      ctx.fillStyle = pColor
      ctx.beginPath()
      ctx.arc(dotX + 2, itemY + checkSize / 2, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Text
    const textX = dotX + (pColor ? 8 : 2)
    const textW = contentW - (textX - padX) - 2
    ctx.font = fontStr(
      8,
      item.done ? '' : '',
      item.done ? 'italic' : '',
      '"Noto Sans SC", sans-serif',
    )
    ctx.fillStyle = hexAlpha(accentColor, item.done ? 0.38 : 0.85)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const text = truncText(ctx, safeStr(item.text), textW)
    ctx.fillText(text, textX, itemY + checkSize / 2)

    // Strikethrough for done items
    if (item.done) {
      const m = ctx.measureText(text)
      ctx.strokeStyle = hexAlpha(accentColor, 0.3)
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(textX, itemY + checkSize / 2)
      ctx.lineTo(textX + m.width, itemY + checkSize / 2)
      ctx.stroke()
    }

    // Tag badge
    if (item.tag && remainingH(layout) > itemH) {
      const tagLabel = `#${item.tag}`
      ctx.font = fontStr(5.5, '', '', 'sans-serif')
      const tagW = ctx.measureText(tagLabel).width + 4
      const tagX2 = padX + contentW - tagW
      ctx.fillStyle = hexAlpha(accentColor, 0.08)
      ctx.beginPath()
      ctx.roundRect(tagX2, itemY + 1, tagW, 7, 1.5)
      ctx.fill()
      ctx.fillStyle = hexAlpha(accentColor, 0.4)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(tagLabel, tagX2 + 2, itemY + 1)
    }

    advance(layout, itemH)
  }

  if (items.length > maxItems && remainingH(layout) > 8) {
    ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.35)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`+${items.length - maxItems} items…`, padX, layout.cursorY + 1)
    advance(layout, 8)
  }

  void width
  return true
}
