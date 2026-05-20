// ECS Content System — Argument Card (claim banner + evidence bars)

import { canvasStore } from '../components/canvasComponent'
import { advance, hasSpace, layoutStore, remainingH } from '../components/layoutComponent'
import { argumentMetaStore } from '../components/metaComponent'
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

export function argumentSystem(eid: number): boolean {
  const meta = argumentMetaStore[eid]
  const claimText = safeStr(meta?.claim).replace(/\n/g, ' ')
  if (!claimText) return false

  const { ctx, width } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW, contentBottom } = layout
  const { accentColor } = styleStore[eid]!

  const availH = remainingH(layout)

  // Claim banner — LARGE adaptive font
  const claimAvailH = Math.min(availH * 0.45, 55)
  const claimFs = adaptiveFontSize(claimAvailH, claimText.length, contentW - 14, 10, 13)
  const claimLh = Math.round(claimFs * LH_MULT)
  const claimFont = fontStr(claimFs)
  ctx.font = claimFont
  const maxClaimLines = Math.max(2, Math.floor(claimAvailH / claimLh))
  const claimLines = wrapText(ctx, claimText, contentW - 14, maxClaimLines)
  const bannerH = claimLines.length * claimLh + 8

  ctx.fillStyle = hexAlpha(accentColor, 0.07)
  fillRoundRect(ctx, padX, layout.cursorY, contentW, bannerH, 4)
  ctx.fillStyle = hexAlpha(accentColor, 0.5)
  fillRoundRect(ctx, padX, layout.cursorY + 3, 2.5, bannerH - 6, 1)

  ctx.fillStyle = '#2a2318'
  ctx.font = fontStr(claimFs, 'bold')
  let ty = layout.cursorY + 5
  for (const line of claimLines) {
    ctx.fillText(line, padX + 8, ty)
    ty += claimLh
  }
  advance(layout, bannerH + 4)

  // Evidence items — LARGER
  const evidence = Array.isArray(meta?.evidence)
    ? meta.evidence.filter((e) => e && (e.text || e.type))
    : []
  if (evidence.length > 0) {
    const evAvailH = remainingH(layout) - 18
    const typeEmoji: Record<string, string> = {
      statistic: '◆',
      example: '◇',
      expert: '○',
      trend: '△',
      analogy: '↻',
    }
    const evFs = Math.max(8, Math.min(11, Math.floor(evAvailH / evidence.length / 1.5)))
    const evLh = Math.round(evFs * LH_MULT)
    const evFont = fontStr(evFs)
    const maxEv = Math.min(evidence.length, Math.max(1, Math.floor(evAvailH / evLh)))

    for (let i = 0; i < maxEv && layout.cursorY + evLh < contentBottom - 14; i++) {
      const ev = evidence[i]
      ctx.font = evFont
      ctx.fillStyle = accentColor
      ctx.fillText(typeEmoji[safeStr(ev.type)] || '•', padX + 2, layout.cursorY + 1)
      ctx.fillStyle = '#4a4030'
      ctx.fillText(
        truncText(ctx, safeStr(ev.text), contentW - 16, evFont),
        padX + 12,
        layout.cursorY + 1,
      )
      advance(layout, evLh)
    }

    if (evidence.length > maxEv && hasSpace(layout, 14)) {
      ctx.font = fontStr(8)
      ctx.fillStyle = '#8a7a5a'
      ctx.fillText(`+${evidence.length - maxEv} more`, padX + 2, layout.cursorY)
      advance(layout, 10)
    }
  }

  // Counterpoint warning
  if (meta?.counterpoint && hasSpace(layout, 14)) {
    ctx.fillStyle = 'rgba(220, 38, 38, 0.05)'
    fillRoundRect(ctx, padX, layout.cursorY, contentW, 12, 3)
    const cpFont = fontStr(8)
    ctx.font = cpFont
    ctx.fillStyle = '#dc2626'
    ctx.fillText(
      truncText(ctx, `⚠ ${safeStr(meta.counterpoint)}`, contentW - 6, cpFont),
      padX + 3,
      layout.cursorY + 2,
    )
  }

  // Strength badge
  if (meta?.strength) {
    const strengthLabels: Record<string, { text: string; color: string }> = {
      strong: { text: 'Strong', color: '#16a34a' },
      moderate: { text: 'Moderate', color: '#ca8a04' },
      weak: { text: 'Weak', color: '#9ca3af' },
    }
    const sl = strengthLabels[safeStr(meta.strength)]
    if (sl) {
      const bFont = fontStr(8, 'bold')
      ctx.font = bFont
      const bw = ctx.measureText(`${sl.text} strength`).width + 7
      ctx.fillStyle = hexAlpha(sl.color, 0.1)
      fillRoundRect(ctx, width - padX - bw, contentBottom - 12, bw, 10, 3)
      ctx.fillStyle = sl.color
      ctx.fillText(`${sl.text} strength`, width - padX - bw + 4, contentBottom - 11)
    }
  }

  return true
}
