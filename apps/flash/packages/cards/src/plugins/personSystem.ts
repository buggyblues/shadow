// ECS Content System — Person / Profile Card
// Avatar circle with real photo (pravatar) or initials fallback, name, title, company, bio, tag chips.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { personMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fillRoundRect, fontStr, hexAlpha, safeStr, wrapText } from '../utils/canvasUtils'

export function personSystem(eid: number): boolean {
  const meta = personMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  // ── Avatar circle ──────────────────────────────────────
  const avatarR = Math.min(28, contentW * 0.22)
  const avatarCX = padX + contentW / 2
  const avatarCY = layout.cursorY + avatarR + 4

  // Try to load avatar image
  const avatarSrc = (meta as { avatar?: string }).avatar
  const avatarImg = avatarSrc ? animationManager.getImage(card.id) : null
  if (avatarSrc && !avatarImg) {
    animationManager.registerImage(card.id, avatarSrc, false)
  }

  // Outer glow
  const glowGrad = ctx.createRadialGradient(
    avatarCX,
    avatarCY,
    avatarR * 0.6,
    avatarCX,
    avatarCY,
    avatarR * 1.4,
  )
  glowGrad.addColorStop(0, hexAlpha(accentColor, 0.3))
  glowGrad.addColorStop(1, hexAlpha(accentColor, 0))
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(avatarCX, avatarCY, avatarR * 1.4, 0, Math.PI * 2)
  ctx.fill()

  if (avatarImg) {
    // Real photo — clip to circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2)
    ctx.clip()
    const size = avatarR * 2
    ctx.drawImage(avatarImg, avatarCX - avatarR, avatarCY - avatarR, size, size)
    ctx.restore()
    // Border
    ctx.strokeStyle = accentColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    // Initials fallback
    ctx.fillStyle = hexAlpha(accentColor, 0.18)
    ctx.beginPath()
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = accentColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2)
    ctx.stroke()
    const initials = (meta.name || '?')
      .split(/\s+/)
      .map((w: string) => w[0]?.toUpperCase() || '')
      .slice(0, 2)
      .join('')
    ctx.font = fontStr(Math.round(avatarR * 0.65), 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, avatarCX, avatarCY)
  }

  advance(layout, avatarR * 2 + 12)

  // ── Name ───────────────────────────────────────────────
  if (meta.name && remainingH(layout) > 12) {
    ctx.font = fontStr(11, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.name.slice(0, 20), padX + contentW / 2, layout.cursorY)
    advance(layout, 15)
  }

  // ── Title & Company ────────────────────────────────────
  const titleLine = [safeStr(meta.title), safeStr(meta.company)].filter(Boolean).join(' · ')
  if (titleLine && remainingH(layout) > 10) {
    ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.7)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(titleLine.slice(0, 40), padX + contentW / 2, layout.cursorY)
    advance(layout, 12)
  }

  // ── Divider ────────────────────────────────────────────
  if (remainingH(layout) > 4) {
    ctx.strokeStyle = hexAlpha(accentColor, 0.2)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(padX + contentW * 0.1, layout.cursorY + 2)
    ctx.lineTo(padX + contentW * 0.9, layout.cursorY + 2)
    ctx.stroke()
    advance(layout, 7)
  }

  // ── Bio ────────────────────────────────────────────────
  const bio = safeStr(meta.bio)
  if (bio && remainingH(layout) > 14) {
    const maxBioLines = Math.max(2, Math.floor((remainingH(layout) - 20) / 10))
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    const bioLines = wrapText(ctx, bio, contentW - 2, maxBioLines)
    ctx.fillStyle = hexAlpha(accentColor, 0.65)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let i = 0; i < Math.min(maxBioLines, bioLines.length); i++) {
      ctx.fillText(bioLines[i], padX + contentW / 2, layout.cursorY)
      advance(layout, 10)
    }
  }

  // ── Tag chips ──────────────────────────────────────────
  if (meta.tags && meta.tags.length > 0 && remainingH(layout) > 12) {
    ctx.font = fontStr(6.5, 'bold', '', '"Noto Sans SC", sans-serif')
    let tx = padX
    const chipY = layout.cursorY + 2
    for (const tag of meta.tags.slice(0, 5)) {
      const tw = ctx.measureText(tag).width + 8
      if (tx + tw > padX + contentW) break
      ctx.fillStyle = hexAlpha(accentColor, 0.15)
      fillRoundRect(ctx, tx, chipY, tw, 11, 5)
      ctx.fillStyle = accentColor
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(tag, tx + 4, chipY + 2)
      tx += tw + 4
    }
    advance(layout, 14)
  }

  return true
}
