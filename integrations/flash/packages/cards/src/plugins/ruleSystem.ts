// ECS Content System — Rule Card
// Shows worker-executed rule metadata or human-facing rule/principle content.

import type { RuleCardMeta } from '@shadowob/flash-types'
import { canvasStore } from '../components/canvasComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { styleStore } from '../components/styleComponent'
import { registry } from '../registry'
import {
  fillRoundRect,
  fontStr,
  hexAlpha,
  safeStr,
  truncText,
  wrapText,
} from '../utils/canvasUtils'

const ruleMetaStore = registry.getMetaStoreArray<RuleCardMeta>('rule')

function drawPrinciples(
  ctx: CanvasRenderingContext2D,
  layout: NonNullable<(typeof layoutStore)[number]>,
  padX: number,
  contentW: number,
  accentColor: string,
  principles: NonNullable<RuleCardMeta['principles']>,
): void {
  const rowH = 21
  const rows = principles.slice(0, Math.max(1, Math.floor(remainingH(layout) / rowH)))
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (let index = 0; index < rows.length; index++) {
    const item = rows[index]!
    if (remainingH(layout) < 14) break
    const y = layout.cursorY
    ctx.fillStyle = hexAlpha(accentColor, 0.07)
    fillRoundRect(ctx, padX, y, contentW, Math.min(rowH - 3, remainingH(layout)), 5)
    ctx.font = fontStr(7, 'bold')
    ctx.fillStyle = accentColor
    ctx.fillText(`${index + 1}`, padX + 6, y + 4)
    ctx.font = fontStr(7.5, 'bold')
    ctx.fillStyle = '#2a2318'
    ctx.fillText(truncText(ctx, safeStr(item.label), contentW - 24), padX + 18, y + 3)
    ctx.font = fontStr(6.5)
    ctx.fillStyle = hexAlpha('#2a2318', 0.58)
    ctx.fillText(truncText(ctx, safeStr(item.detail), contentW - 24), padX + 18, y + 12)
    advance(layout, rowH)
  }
}

function drawDescription(
  ctx: CanvasRenderingContext2D,
  layout: NonNullable<(typeof layoutStore)[number]>,
  padX: number,
  contentW: number,
  description: string,
): void {
  if (!description || remainingH(layout) < 12) return
  ctx.font = fontStr(7.5)
  ctx.fillStyle = 'rgba(42,35,24,0.72)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const lines = wrapText(
    ctx,
    description,
    contentW,
    Math.max(1, Math.floor(remainingH(layout) / 9)),
  )
  for (const line of lines) {
    if (remainingH(layout) < 9) break
    ctx.fillText(line, padX, layout.cursorY)
    advance(layout, 9)
  }
}

function drawScriptSnippet(
  ctx: CanvasRenderingContext2D,
  layout: NonNullable<(typeof layoutStore)[number]>,
  padX: number,
  contentW: number,
  accentColor: string,
  script: string,
): void {
  const boxH = Math.max(34, Math.min(remainingH(layout) - 4, 70))
  if (boxH < 18) return
  ctx.fillStyle = 'rgba(15,23,42,0.82)'
  fillRoundRect(ctx, padX, layout.cursorY, contentW, boxH, 5)
  ctx.font = fontStr(6.5, '', '', '"Courier New", monospace')
  ctx.fillStyle = '#cbd5e1'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const snippet = script || '// conceptual rule: add script to make it executable'
  const lines = snippet.split('\n').slice(0, Math.max(2, Math.floor((boxH - 8) / 9)))
  lines.forEach((line, index) => {
    ctx.fillText(
      truncText(ctx, line.trim() || ' ', contentW - 12),
      padX + 6,
      layout.cursorY + 5 + index * 9,
    )
  })
  ctx.strokeStyle = hexAlpha(accentColor, 0.22)
  ctx.lineWidth = 0.7
  ctx.strokeRect(padX + 0.5, layout.cursorY + 0.5, contentW - 1, boxH - 1)
  advance(layout, boxH + 2)
}

export function ruleSystem(eid: number): boolean {
  const meta = ruleMetaStore[eid]
  if (!meta) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const trigger = safeStr(meta.trigger ?? 'manual')
  const enabled = meta.enabled === true
  const priority = typeof meta.priority === 'number' ? meta.priority : 100
  const script = safeStr(meta.script ?? '')
  const principles = Array.isArray(meta.principles) ? meta.principles : []
  const description = safeStr(meta.description ?? '')

  const headerH = 22
  ctx.fillStyle = hexAlpha(accentColor, enabled ? 0.14 : 0.08)
  fillRoundRect(ctx, padX, layout.cursorY, contentW, headerH, 6)
  ctx.font = fontStr(8, 'bold')
  ctx.fillStyle = enabled ? accentColor : 'rgba(71,85,105,0.72)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(enabled ? 'EXECUTABLE RULE' : 'CONCEPTUAL RULE', padX + 8, layout.cursorY + 4)

  ctx.font = fontStr(6, 'bold', '', 'monospace')
  ctx.fillStyle = 'rgba(15,23,42,0.56)'
  ctx.textAlign = 'right'
  ctx.fillText(`#${priority}`, padX + contentW - 8, layout.cursorY + 6)
  advance(layout, headerH + 7)

  const scopeLabel =
    Array.isArray(meta.arenaIds) && meta.arenaIds.length > 0 ? 'arena' : meta.scope || 'arena'
  const chips = [`trigger:${trigger}`, `scope:${scopeLabel}`]
  let chipX = padX
  ctx.font = fontStr(6, 'bold', '', 'monospace')
  for (const chip of chips) {
    const chipW = Math.min(contentW, ctx.measureText(chip).width + 10)
    if (chipX + chipW > padX + contentW) break
    ctx.fillStyle = hexAlpha(accentColor, 0.09)
    fillRoundRect(ctx, chipX, layout.cursorY, chipW, 13, 4)
    ctx.fillStyle = accentColor
    ctx.textAlign = 'left'
    ctx.fillText(chip, chipX + 5, layout.cursorY + 3)
    chipX += chipW + 5
  }
  advance(layout, 20)

  if (principles.length > 0) {
    drawPrinciples(ctx, layout, padX, contentW, accentColor, principles)
    return true
  }

  if (description && !script) {
    drawDescription(ctx, layout, padX, contentW, description)
    return true
  }

  drawScriptSnippet(ctx, layout, padX, contentW, accentColor, script)
  return true
}
