// ECS Content System — Social Card
// Displays a social media post with author, content, stats and hashtags.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { socialMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1d9bf0',
  weibo: '#e6162d',
  linkedin: '#0077b5',
  instagram: '#e1306c',
  tiktok: '#010101',
  youtube: '#ff0000',
  other: '#888',
}

const PLATFORM_LABELS: Record<string, string> = {
  twitter: 'X / Twitter',
  weibo: 'Weibo',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  other: 'Social',
}

export function socialSystem(eid: number): boolean {
  const meta = socialMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const platformColor = PLATFORM_COLORS[meta.platform] || accentColor

  // ── Platform badge ─────────────────────────────────────
  if (remainingH(layout) > 10) {
    ctx.fillStyle = hexAlpha(platformColor, 0.15)
    const label = PLATFORM_LABELS[meta.platform] || meta.platform
    const badgeW = label.length * 5 + 10
    ctx.beginPath()
    ctx.roundRect(padX, layout.cursorY, badgeW, 12, 3)
    ctx.fill()
    ctx.font = fontStr(7, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = platformColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, padX + badgeW / 2, layout.cursorY + 6)
    advance(layout, 15)
  }

  // ── Author row ─────────────────────────────────────────
  if (remainingH(layout) > 12) {
    const avatarR = 7
    ctx.fillStyle = hexAlpha(platformColor, 0.25)
    ctx.beginPath()
    ctx.arc(padX + avatarR, layout.cursorY + avatarR, avatarR, 0, Math.PI * 2)
    ctx.fill()
    const initials = (meta.author.name ?? '?').slice(0, 1)
    ctx.font = fontStr(8, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = platformColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, padX + avatarR, layout.cursorY + avatarR)

    ctx.font = fontStr(8.5, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let authorName = meta.author.name.slice(0, 16)
    if (meta.author.verified) authorName += ' ✓'
    ctx.fillText(authorName, padX + avatarR * 2 + 4, layout.cursorY)

    if (meta.author.handle) {
      ctx.font = fontStr(7, '', '', 'monospace')
      ctx.fillStyle = hexAlpha(accentColor, 0.45)
      ctx.fillText(meta.author.handle.slice(0, 18), padX + avatarR * 2 + 4, layout.cursorY + 9)
    }
    advance(layout, avatarR * 2 + 3)
  }

  // ── Content ────────────────────────────────────────────
  const content = safeStr(meta.content)
  if (content && remainingH(layout) > 12) {
    const charsPerLine = Math.floor(contentW / 5.2)
    const maxLines = Math.min(4, Math.floor(remainingH(layout) / 10))
    ctx.font = fontStr(8, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.82)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (let i = 0; i < maxLines && i * charsPerLine < content.length; i++) {
      ctx.fillText(
        content.slice(i * charsPerLine, (i + 1) * charsPerLine),
        padX,
        layout.cursorY + i * 10,
      )
    }
    advance(layout, maxLines * 10 + 4)
  }

  // ── Hashtags ───────────────────────────────────────────
  if (meta.hashtags && meta.hashtags.length > 0 && remainingH(layout) > 9) {
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = platformColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(
      meta.hashtags
        .slice(0, 4)
        .map((h) => `#${h}`)
        .join(' '),
      padX,
      layout.cursorY,
    )
    advance(layout, 11)
  }

  // ── Stats bar ──────────────────────────────────────────
  if (meta.stats && remainingH(layout) > 10) {
    const statParts: string[] = []
    if (meta.stats.likes != null) statParts.push(`♥ ${meta.stats.likes}`)
    if (meta.stats.reposts != null) statParts.push(`↺ ${meta.stats.reposts}`)
    if (meta.stats.comments != null) statParts.push(`💬 ${meta.stats.comments}`)
    if (meta.stats.views != null) statParts.push(`👁 ${meta.stats.views}`)
    if (statParts.length > 0) {
      ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.45)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(statParts.join('  '), padX, layout.cursorY)
      advance(layout, 11)
    }
  }

  return true
}
