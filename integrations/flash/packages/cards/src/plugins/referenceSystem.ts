// ECS Content System — Reference Card

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { referenceMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import {
  adaptiveFontSize,
  fillRoundRect,
  fontStr,
  hexAlpha,
  LH_MULT,
  safeStr,
  truncText,
  wrapText,
} from '../utils/canvasUtils'

export function referenceSystem(eid: number): boolean {
  const meta = referenceMetaStore[eid]
  const refTitle = safeStr(meta?.refTitle)
  const url = safeStr(meta?.url)
  if (!refTitle && !url) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  // Badges — larger
  const typeLabels: Record<string, string> = {
    paper: 'Paper',
    book: 'Book',
    article: 'Article',
    website: 'Website',
    report: 'Report',
  }
  const credColors: Record<string, string> = { high: '#16a34a', medium: '#ca8a04', low: '#9ca3af' }
  let tx = padX
  const badgeFont = fontStr(7)
  if (meta?.refType) {
    const tLabel = typeLabels[safeStr(meta.refType)] || safeStr(meta.refType)
    ctx.font = badgeFont
    const tw = ctx.measureText(tLabel).width + 7
    ctx.fillStyle = hexAlpha(accentColor, 0.08)
    fillRoundRect(ctx, tx, layout.cursorY, tw, 10, 3)
    ctx.fillStyle = accentColor
    ctx.fillText(tLabel, tx + 3, layout.cursorY + 1)
    tx += tw + 3
  }
  if (meta?.credibility) {
    const cc = credColors[safeStr(meta.credibility)] || '#9ca3af'
    ctx.font = badgeFont
    const credText = `Credibility: ${meta.credibility === 'high' ? 'High' : meta.credibility === 'medium' ? 'Medium' : 'Low'}`
    const cw = ctx.measureText(credText).width + 7
    ctx.fillStyle = hexAlpha(cc, 0.1)
    fillRoundRect(ctx, tx, layout.cursorY, cw, 10, 3)
    ctx.fillStyle = cc
    ctx.fillText(credText, tx + 3, layout.cursorY + 1)
  }
  advance(layout, 14)

  // Title — LARGE adaptive
  if (refTitle) {
    const titleAvailH = remainingH(layout) - 24
    const titleFs = adaptiveFontSize(titleAvailH, refTitle.length, contentW, 10, 13)
    const titleLh = Math.round(titleFs * LH_MULT)
    const rtFont = fontStr(titleFs, 'bold')
    ctx.font = rtFont
    ctx.fillStyle = '#2a2318'
    const titleLines = wrapText(
      ctx,
      refTitle,
      contentW,
      Math.max(2, Math.floor(titleAvailH / titleLh)),
    )
    for (const line of titleLines) {
      if (layout.cursorY + titleLh > contentBottom - 16) break
      ctx.fillText(line, padX, layout.cursorY)
      advance(layout, titleLh)
    }
  }

  // Authors — larger
  if (Array.isArray(meta?.authors) && meta.authors.length > 0 && hasSpace(layout, 12)) {
    const authFont = fontStr(8)
    ctx.font = authFont
    ctx.fillStyle = '#8a7a5a'
    ctx.fillText(
      truncText(ctx, meta.authors.map(safeStr).join(', '), contentW, authFont),
      padX,
      layout.cursorY,
    )
    advance(layout, 11)
  }

  // Date
  if (meta?.publishDate && hasSpace(layout, 10)) {
    const dateFont = fontStr(7)
    ctx.font = dateFont
    ctx.fillStyle = '#9ca3af'
    ctx.fillText(safeStr(meta.publishDate), padX, layout.cursorY)
    advance(layout, 10)
  }

  // URL
  if (url && hasSpace(layout, 10)) {
    const urlFont = fontStr(6, '', '', '"Courier New", monospace')
    ctx.font = urlFont
    ctx.fillStyle = '#6b7280'
    ctx.fillText(truncText(ctx, url, contentW, urlFont), padX, layout.cursorY)
  }

  return true
}
