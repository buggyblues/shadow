// ECS Content System — QR Code Card
// Uses the 'qrcode' npm package synchronously (QRCode.create)
// for ISO 18004-compliant QR generation.

import QRCode from 'qrcode'
import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { qrcodeMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

// Cache per-URL module arrays to avoid regenerating on each frame
const _matrixCache = new Map<string, { size: number; data: Uint8Array }>()

function getQrMatrix(url: string) {
  if (_matrixCache.has(url)) return _matrixCache.get(url)!
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
    const result = { size: qr.modules.size, data: qr.modules.data as unknown as Uint8Array }
    _matrixCache.set(url, result)
    return result
  } catch (e) {
    console.warn('[qrcodeSystem] QRCode.create failed:', e, 'url:', url)
    return null
  }
}

export function qrcodeSystem(eid: number): boolean {
  const meta = qrcodeMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const availH = remainingH(layout)
  const qrSize = Math.min(contentW - 8, availH - 32)
  const qrX = padX + (contentW - qrSize) / 2
  const qrY = layout.cursorY + 4

  // Real QR code (draw module matrix directly on card canvas)
  if (!meta.url) return false
  const qr = getQrMatrix(meta.url)
  if (qr) {
    const { size, data } = qr
    const cell = qrSize / size
    ctx.fillStyle = '#ffffff'
    fillRoundRect(ctx, qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 6)
    ctx.fillStyle = '#0f172a'
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (data[r * size + c]) {
          ctx.fillRect(qrX + c * cell, qrY + r * cell, cell, cell)
        }
      }
    }
  } else {
    // Fallback box
    ctx.fillStyle = '#ffffff'
    fillRoundRect(ctx, qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 6)
    ctx.fillStyle = hexAlpha(accentColor, 0.5)
    ctx.font = fontStr(7, '', '', 'monospace')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('QR generation failed', qrX + qrSize / 2, qrY + qrSize / 2)
  }

  advance(layout, qrSize + 12)

  // URL label
  const label = safeStr(meta.label || meta.url)
  if (label && remainingH(layout) > 10) {
    ctx.font = fontStr(7, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const display = label.replace(/^https?:\/\//, '').slice(0, 36)
    ctx.fillText(display, padX + contentW / 2, layout.cursorY + 2)
    advance(layout, 12)
  }

  // Description
  const desc = safeStr(meta.description)
  if (desc && remainingH(layout) > 10) {
    ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.6)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(desc.slice(0, 48), padX + contentW / 2, layout.cursorY + 2)
    advance(layout, 11)
  }

  return true
}
