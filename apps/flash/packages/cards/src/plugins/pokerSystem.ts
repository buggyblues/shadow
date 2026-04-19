// ECS Content System — Poker Card
// Renders an authentic playing card using real PNG assets (htdebeer/SVG-cards).
// Assets live in public/cards/poker/ — full bleed, no header/footer.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { layoutStore } from '../components/layoutComponent'
import { pokerMetaStore } from '../components/metaComponent'
import { animationManager } from '../resources/animationManager'

// ── URL helpers ──────────────────────────────────────────────

const RANK_FILE: Record<string, string> = {
  A: '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'jack',
  Q: 'queen',
  K: 'king',
}

const SUIT_FILE: Record<string, string> = {
  spades: 'spade',
  hearts: 'heart',
  diamonds: 'diamond',
  clubs: 'club',
}

function cardUrl(rank: string, suit: string): string {
  return `/cards/poker/${SUIT_FILE[suit]}_${RANK_FILE[rank]}.png`
}

function backUrl(style?: string): string {
  if (style === 'red') return '/cards/poker/back-red.png'
  return '/cards/poker/back-blue.png'
}

// ── Skeleton while image loads ───────────────────────────────

function drawSkeleton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#f8f8f8'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.stroke()

  // Placeholder shimmer boxes
  ctx.fillStyle = '#e8e8e8'
  ctx.fillRect(x + 8, y + 10, w * 0.25, 10)
  ctx.fillRect(x + 8, y + h - 22, w * 0.25, 10)
  ctx.beginPath()
  ctx.roundRect(x + w * 0.25, y + h * 0.3, w * 0.5, h * 0.38, 4)
  ctx.fill()

  ctx.font = '9px sans-serif'
  ctx.fillStyle = '#ccc'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('♠', x + w / 2, y + h / 2)
}

// ── Main system ───────────────────────────────────────────────

export function pokerSystem(eid: number): boolean {
  const meta = pokerMetaStore[eid]
  if (!meta) return false

  const { ctx, width, height } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { card } = cardDataStore[eid]!

  // Full bleed — fill entire canvas
  const x = 0
  const y = 0
  const w = width
  const h = height

  const faceDown = meta.faceDown ?? false
  const url = faceDown ? backUrl(meta.backStyle) : cardUrl(meta.rank, meta.suit)

  // Use card.id as the key so dirty tracking triggers a rebake when image loads
  const key = card.id

  // Base fill
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, w, h)

  const img = animationManager.getImage(key)

  if (!img) {
    animationManager.registerImage(key, url, false)
    drawSkeleton(ctx, x, y, w, h)
  } else {
    // Cover-scale: fill canvas, maintain aspect ratio
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const drawX = x + (w - drawW) / 2
    const drawY = y + (h - drawH) / 2

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.clip()
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.restore()

    // Subtle border
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 6)
    ctx.stroke()
  }

  // Optional meaning overlay at bottom
  if (meta.meaning && img && h > 60) {
    const bH = 18
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.roundRect(x, y + h - bH, w, bH, [0, 0, 6, 6])
    ctx.fill()
    ctx.font = '8px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(meta.meaning, x + w / 2, y + h - bH / 2)
  }

  layout.cursorY += h
  return true
}
