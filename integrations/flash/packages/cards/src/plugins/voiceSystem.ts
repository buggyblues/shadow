// ECS Content System — Voice Card
// Displays a waveform visualization with transcript and duration.

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { Interaction } from '../components/interactionComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { voiceMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function voiceSystem(eid: number): boolean {
  const meta = voiceMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!
  const isHovered = !!Interaction.hovered[eid]
  const now = Date.now()

  // ── Waveform visualization ─────────────────────────────
  const waveH = Math.min(40, remainingH(layout) * 0.35)
  if (waveH > 12) {
    const waveY = layout.cursorY + waveH / 2
    const bars = 40
    const barW = (contentW - 4) / bars - 1

    // Background track
    ctx.fillStyle = hexAlpha(accentColor, 0.06)
    ctx.beginPath()
    ctx.roundRect(padX, layout.cursorY, contentW, waveH, 4)
    ctx.fill()

    for (let i = 0; i < bars; i++) {
      const t = i / bars
      let amp: number
      if (meta.waveform && meta.waveform.length > 0) {
        const idx = Math.floor(t * meta.waveform.length)
        amp = meta.waveform[idx] ?? 0.5
      } else {
        // Pseudo-random waveform from bar index
        const timeOffset = isHovered ? now * 0.003 : 0
        amp =
          0.2 +
          0.8 * Math.abs(Math.sin(i * 1.3 + 2 + timeOffset) * Math.cos(i * 0.7 + timeOffset * 0.4))
      }
      const barH = Math.max(2, amp * waveH * 0.9)
      ctx.fillStyle = hexAlpha(accentColor, 0.5 + amp * 0.4)
      ctx.beginPath()
      ctx.roundRect(padX + 2 + i * (barW + 1), waveY - barH / 2, barW, barH, 1)
      ctx.fill()
    }

    // Keep rebaking each frame while hovered to animate waveform
    if (isHovered) animationManager.markDirty(card.id)

    // Play button overlay (filled when hovered)
    const playR = 10
    const playX = padX + contentW / 2
    const playY = layout.cursorY + waveH + playR + 3
    ctx.fillStyle = isHovered ? hexAlpha(accentColor, 0.35) : hexAlpha(accentColor, 0.15)
    ctx.beginPath()
    ctx.arc(playX, playY, playR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = accentColor
    ctx.beginPath()
    ctx.moveTo(playX - 3, playY - 5)
    ctx.lineTo(playX + 6, playY)
    ctx.lineTo(playX - 3, playY + 5)
    ctx.closePath()
    ctx.fill()

    const durationStr = meta.duration ? formatDuration(meta.duration) : ''
    if (durationStr) {
      ctx.font = fontStr(7, '', '', 'monospace')
      ctx.fillStyle = hexAlpha(accentColor, 0.5)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(durationStr, padX + contentW, layout.cursorY + waveH + playR + 3)
    }

    advance(layout, waveH + playR * 2 + 7)
  }

  // ── Transcript ─────────────────────────────────────────
  const transcript = safeStr(meta.transcript || meta.summary)
  if (transcript && remainingH(layout) > 12) {
    ctx.font = fontStr(8, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.7)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const charsPerLine = Math.floor(contentW / 5.2)
    const maxLines = Math.min(3, Math.floor(remainingH(layout) / 10))
    const text = transcript.slice(0, charsPerLine * maxLines)
    let offset = 0
    for (let line = 0; line < maxLines && offset < text.length; line++) {
      const chunk = text.slice(offset, offset + charsPerLine)
      ctx.fillText(chunk, padX, layout.cursorY + line * 10)
      offset += charsPerLine
    }
    advance(layout, maxLines * 10 + 4)
  }

  // ── Tags ───────────────────────────────────────────────
  if (meta.tags && meta.tags.length > 0 && remainingH(layout) > 10) {
    let tx = padX
    meta.tags.slice(0, 4).forEach((tag) => {
      const w = Math.min(tag.length * 5.8 + 8, 60)
      ctx.fillStyle = hexAlpha(accentColor, 0.1)
      ctx.beginPath()
      ctx.roundRect(tx, layout.cursorY, w, 11, 3)
      ctx.fill()
      ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
      ctx.fillStyle = hexAlpha(accentColor, 0.6)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(tag.slice(0, 8), tx + w / 2, layout.cursorY + 5.5)
      tx += w + 3
    })
    advance(layout, 14)
  }

  return true
}
