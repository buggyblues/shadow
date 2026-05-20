// ECS Content System — Webpage Preview Card
// Browser chrome mockup: address bar, title, favicon shape, description.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { webpageMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, isDuplicateTitle, safeStr } from '../utils/canvasUtils'

export function webpageSystem(eid: number): boolean {
  const meta = webpageMetaStore[eid]
  if (!meta) return false
  const url = (meta as { url?: string }).url
  if (!url) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  const availH = remainingH(layout)
  const frameH = Math.min(availH - 8, contentW * 1.05)
  const fX = padX - 2,
    fW = contentW + 4
  const fY = layout.cursorY

  // Outer frame
  ctx.fillStyle = '#1e2024'
  fillRoundRect(ctx, fX, fY, fW, frameH, 6)

  // ── Browser chrome (top bar) ──────────────────────────
  const chromeH = 18
  ctx.fillStyle = '#2b2d31'
  fillRoundRect(ctx, fX, fY, fW, chromeH, 6)
  ctx.fillRect(fX, fY + chromeH - 5, fW, 5) // flatten bottom

  // Traffic lights
  const dots = ['#ff5f56', '#ffbd2e', '#27c93f']
  dots.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(fX + 7 + i * 9, fY + chromeH / 2, 2.5, 0, Math.PI * 2)
    ctx.fill()
  })

  // Address bar
  const abX = fX + 34,
    abW = fW - 42,
    abY = fY + 4,
    abH = chromeH - 8
  ctx.fillStyle = '#0d1117'
  fillRoundRect(ctx, abX, abY, abW, abH, 3)

  // Favicon shape (generic globe)
  const faviconCX = abX + 7,
    faviconCY = abY + abH / 2
  ctx.strokeStyle = hexAlpha(accentColor, 0.6)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(faviconCX, faviconCY, 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(faviconCX - 3, faviconCY)
  ctx.lineTo(faviconCX + 3, faviconCY)
  ctx.stroke()

  // URL text
  ctx.font = fontStr(5.5, '', '', '"Noto Sans SC", monospace')
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const urlDisplay = url.replace(/^https?:\/\//, '').slice(0, 32)
  ctx.fillText(urlDisplay, abX + 13, abY + abH / 2)

  // ── Page content area ─────────────────────────────────
  const contentTop = fY + chromeH + 4
  const innerW = fW - 10
  const innerX = fX + 5

  // Screenshot placeholder (gradient)
  const screenshotH = frameH - chromeH - 32
  const grad = ctx.createLinearGradient(innerX, contentTop, innerX, contentTop + screenshotH)
  grad.addColorStop(0, hexAlpha(accentColor, 0.12))
  grad.addColorStop(0.4, hexAlpha(accentColor, 0.05))
  grad.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = grad
  fillRoundRect(ctx, innerX, contentTop, innerW, screenshotH, 3)

  // Simulated content lines
  const lineY = contentTop + 5
  const lineWidths = [0.75, 0.9, 0.6, 0.8, 0.5]
  lineWidths.forEach((lw, i) => {
    if (lineY + i * 9 + 8 < contentTop + screenshotH - 3) {
      ctx.fillStyle = hexAlpha(accentColor, 0.12 + (i === 0 ? 0.08 : 0))
      fillRoundRect(ctx, innerX + 5, lineY + i * 9, innerW * lw - 10, i === 0 ? 8 : 5, 1)
    }
  })

  // Title
  const title = safeStr(meta.title)
  if (title && !isDuplicateTitle(title, card.title)) {
    const titleY = fY + frameH - 24
    ctx.font = fontStr(8, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(title.slice(0, 26), fX + 4, titleY)
  }

  // Description
  const desc = safeStr(meta.description)
  if (desc) {
    ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.55)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(desc.slice(0, 48), fX + 4, fY + frameH - 13)
  }

  advance(layout, frameH + 4)
  return true
}
