// ECS Content System — File Card
// Shows filename, type badge, size, modified date, path, description, tags.

import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { fileMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { fillRoundRect, fontStr, hexAlpha, safeStr, truncText } from '../utils/canvasUtils'

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: '#ef4444',
  doc: '#3b82f6',
  docx: '#3b82f6',
  xls: '#22c55e',
  xlsx: '#22c55e',
  csv: '#22c55e',
  zip: '#f59e0b',
  tar: '#f59e0b',
  gz: '#f59e0b',
  mp4: '#a855f7',
  mov: '#a855f7',
  avi: '#a855f7',
  mp3: '#06b6d4',
  wav: '#06b6d4',
  png: '#ec4899',
  jpg: '#ec4899',
  jpeg: '#ec4899',
  gif: '#ec4899',
  svg: '#ec4899',
  ts: '#3b82f6',
  tsx: '#3b82f6',
  js: '#fbbf24',
  jsx: '#fbbf24',
  json: '#34d399',
  md: '#a78bfa',
  txt: '#94a3b8',
  py: '#22c55e',
  rs: '#f97316',
  go: '#06b6d4',
}

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

function getTypeColor(type: string | undefined, filename: string): string {
  const ext = type?.toLowerCase() || getExtension(filename)
  return FILE_TYPE_COLORS[ext] || '#94a3b8'
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export function fileSystem(eid: number): boolean {
  const meta = fileMetaStore[eid]
  if (!meta) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!

  const ext = (meta.type || getExtension(meta.filename)).toUpperCase()
  const typeColor = getTypeColor(meta.type, meta.filename)

  // ── File icon + name ──────────────────────────────────
  if (remainingH(layout) > 24) {
    const iconW = 24,
      iconH = 28
    const iconX = padX + 2,
      iconY = layout.cursorY + 2

    // File shape
    ctx.fillStyle = hexAlpha(typeColor, 0.15)
    fillRoundRect(ctx, iconX, iconY, iconW, iconH, 3)
    ctx.strokeStyle = hexAlpha(typeColor, 0.4)
    ctx.lineWidth = 1
    strokeRoundRect(ctx, iconX, iconY, iconW, iconH, 3)

    // Folded corner
    const foldSize = 6
    ctx.fillStyle = hexAlpha(typeColor, 0.25)
    ctx.beginPath()
    ctx.moveTo(iconX + iconW - foldSize, iconY)
    ctx.lineTo(iconX + iconW, iconY + foldSize)
    ctx.lineTo(iconX + iconW - foldSize, iconY + foldSize)
    ctx.closePath()
    ctx.fill()

    // Extension label
    ctx.font = fontStr(5.5, 'bold', '', 'monospace')
    ctx.fillStyle = typeColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ext.slice(0, 4), iconX + iconW / 2, iconY + iconH * 0.62)

    // Filename
    const nameX = iconX + iconW + 6
    const nameW = contentW - iconW - 10
    ctx.font = fontStr(9, 'bold', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncText(ctx, meta.filename, nameW), nameX, iconY + 3)

    // Size + type badge
    const badgeY = iconY + 14
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.5)
    const sizeStr = meta.size ? `${meta.size}` : ''
    ctx.fillText(sizeStr, nameX, badgeY)

    advance(layout, iconH + 6)
  }

  // ── Path ─────────────────────────────────────────────
  if (meta.path && remainingH(layout) > 9) {
    ctx.font = fontStr(6.5, '', '', '"Courier New", monospace')
    ctx.fillStyle = hexAlpha(accentColor, 0.38)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(meta.path.slice(-40), padX, layout.cursorY + 1)
    advance(layout, 9)
  }

  // ── Description ───────────────────────────────────────
  const desc = safeStr(meta.description)
  if (desc && remainingH(layout) > 11) {
    ctx.font = fontStr(7.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.72)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncText(ctx, desc, contentW), padX, layout.cursorY + 1)
    advance(layout, 11)
  }

  // ── Modified date ─────────────────────────────────────
  if (meta.modified && remainingH(layout) > 9) {
    ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.35)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`Modified ${formatDate(meta.modified)}`, padX, layout.cursorY + 1)
    advance(layout, 9)
  }

  // ── Tags ──────────────────────────────────────────────
  if (meta.tags && meta.tags.length > 0 && remainingH(layout) > 10) {
    let tx = padX
    const ty = layout.cursorY + 1
    ctx.font = fontStr(6.5, '', '', '"Noto Sans SC", sans-serif')
    for (const tag of meta.tags.slice(0, 4)) {
      const tw = ctx.measureText(`#${tag}`).width + 6
      if (tx + tw > padX + contentW) break
      ctx.fillStyle = hexAlpha(typeColor, 0.1)
      ctx.beginPath()
      ctx.roundRect(tx, ty, tw, 9, 2)
      ctx.fill()
      ctx.fillStyle = hexAlpha(typeColor, 0.65)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`#${tag}`, tx + 3, ty + 1)
      tx += tw + 3
    }
    advance(layout, 11)
  }

  void width
  return true
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.stroke()
}
