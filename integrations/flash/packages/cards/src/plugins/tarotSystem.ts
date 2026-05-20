// ECS Content System — Tarot Card
// Renders an authentic tarot card using real Rider-Waite JPG assets (public domain).
// Assets live in public/cards/tarot/ — full bleed, no header/footer.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { layoutStore } from '../components/layoutComponent'
import { tarotMetaStore } from '../components/metaComponent'
import { animationManager } from '../resources/animationManager'

// ── URL helpers ──────────────────────────────────────────────

function tarotUrl(meta: { arcana: string; number: number | string; suit?: string }): string {
  const nn = String(meta.number).padStart(2, '0')
  if (meta.arcana === 'major') {
    return `/cards/tarot/major_${nn}.jpg`
  }
  // minor arcana: suit_nn
  return `/cards/tarot/${meta.suit}_${nn}.jpg`
}

function tarotKey(meta: { arcana: string; number: number | string; suit?: string }): string {
  if (meta.arcana === 'major') return `tarot:major:${meta.number}`
  return `tarot:${meta.suit}:${meta.number}`
}

// ── Skeleton while image loads ───────────────────────────────

function drawSkeleton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // Dark mystical background
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, '#1a1035')
  grad.addColorStop(1, '#0d0820')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.fill()

  // Golden border
  ctx.strokeStyle = 'rgba(212,175,55,0.4)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 6)
  ctx.stroke()

  // Center star placeholder
  ctx.font = `${Math.min(w, h) * 0.22}px sans-serif`
  ctx.fillStyle = 'rgba(212,175,55,0.2)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✦', x + w / 2, y + h / 2)
}

// ── Name overlay ─────────────────────────────────────────────

function drawNameOverlay(
  ctx: CanvasRenderingContext2D,
  name: string,
  reversed: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const overlayH = Math.max(24, h * 0.15)
  const overlayY = y + h - overlayH

  // Gradient strip
  const grad = ctx.createLinearGradient(x, overlayY, x, overlayY + overlayH)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.3, 'rgba(0,0,0,0.72)')
  grad.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.fillStyle = grad
  ctx.fillRect(x, overlayY, w, overlayH)

  const centerX = x + w / 2
  const centerY = overlayY + overlayH * 0.6

  // Card name
  const fontSize = Math.max(7, Math.min(11, w * 0.075))
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, centerX, centerY)

  // Reversed badge
  if (reversed) {
    const badgeW = 22
    const badgeH = 10
    const bx = x + w - badgeW - 4
    const by = y + 4
    ctx.fillStyle = 'rgba(180,30,30,0.85)'
    ctx.beginPath()
    ctx.roundRect(bx, by, badgeW, badgeH, 3)
    ctx.fill()
    ctx.font = `bold ${Math.max(6, badgeH - 2)}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Reversed', bx + badgeW / 2, by + badgeH / 2)
  }
}

// ── Main system ───────────────────────────────────────────────

export function tarotSystem(eid: number): boolean {
  const meta = tarotMetaStore[eid]
  if (!meta) return false

  const { ctx, width, height } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { card } = cardDataStore[eid]!

  // Full bleed — fill entire canvas
  const x = 0
  const y = 0
  const w = width
  const h = height

  const url = tarotUrl(meta)
  // Use card.id as key so dirty tracking works correctly per-card
  const key = card.id
  const reversed = meta.reversed ?? false

  // Dark base fill
  ctx.fillStyle = '#0d0820'
  ctx.fillRect(x, y, w, h)

  const img = animationManager.getImage(key)

  if (!img) {
    animationManager.registerImage(key, url, false)
    drawSkeleton(ctx, x, y, w, h)
  } else {
    // Cover-scale
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const drawX = x + (w - drawW) / 2
    const drawY = y + (h - drawH) / 2

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.clip()

    if (reversed) {
      // Rotate 180° around card center
      ctx.translate(x + w / 2, y + h / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-(x + w / 2), -(y + h / 2))
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.restore()

    // Name overlay (always upright in display coords, placed at bottom)
    const displayName = meta.nameCn ?? meta.name
    drawNameOverlay(ctx, displayName, reversed, x, y, w, h)

    // Thin golden border
    ctx.strokeStyle = 'rgba(212,175,55,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 6)
    ctx.stroke()
  }

  layout.cursorY += h
  return true
}
