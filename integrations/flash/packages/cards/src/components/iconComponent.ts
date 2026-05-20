// ══════════════════════════════════════════════════════════════
// Component — Icon (vector icon draw function for each CardKind)
//
// Icon draw functions are resolved from two sources (in priority order):
//   1. Plugin registry (plugin.components.icon)
//   2. Hardcoded fallback table below
// ══════════════════════════════════════════════════════════════

import { registry } from '../registry'

// Re-export from types for backward compat
export type { IconDrawFn } from '../types'

import type { IconDrawFn } from '../types'

export interface IconData {
  readonly draw: IconDrawFn
}

// ── Component key ──

/** bitECS tag object */
export const CIcon = {}

/** AoS data store indexed by EID */
export const iconStore: Array<IconData | undefined> = []

// ── Icon draw functions ──

export function drawQuoteIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.fillStyle = color
  const s = r * 0.45
  for (let i = 0; i < 2; i++) {
    const ox = cx - r * 0.3 + i * r * 0.6
    ctx.beginPath()
    ctx.arc(ox, cy - s * 0.3, s, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(ox + s * 0.2, cy - s * 0.3)
    ctx.quadraticCurveTo(ox + s, cy + s * 0.8, ox - s * 0.3, cy + s * 1.2)
    ctx.lineTo(ox - s * 0.1, cy + s * 0.6)
    ctx.quadraticCurveTo(ox + s * 0.4, cy + s * 0.3, ox + s * 0.2, cy - s * 0.3)
    ctx.fill()
  }
}

export function drawSummaryIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.15
  ctx.lineCap = 'round'
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.6, cy + i * r * 0.45)
    ctx.lineTo(cx + r * 0.6, cy + i * r * 0.45)
    ctx.stroke()
  }
}

export function drawTargetIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  for (let i = 3; i >= 1; i--) {
    ctx.beginPath()
    ctx.arc(cx, cy, r * (i / 3) * 0.8, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2)
  ctx.fill()
}

export function drawBarChartIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.fillStyle = color
  const bw = r * 0.22,
    heights = [0.4, 0.7, 0.5, 0.9]
  const totalW = heights.length * bw + (heights.length - 1) * bw * 0.3
  const startX = cx - totalW / 2,
    bottomY = cy + r * 0.5
  for (let i = 0; i < heights.length; i++) {
    const bh = r * 1.6 * heights[i],
      bx = startX + i * (bw + bw * 0.3)
    ctx.beginPath()
    ctx.roundRect(bx, bottomY - bh, bw, bh, 2)
    ctx.fill()
  }
}

export function drawTableIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.1
  const s = r * 0.7
  ctx.strokeRect(cx - s, cy - s, s * 2, s * 2)
  ctx.beginPath()
  ctx.moveTo(cx, cy - s)
  ctx.lineTo(cx, cy + s)
  ctx.moveTo(cx - s, cy)
  ctx.lineTo(cx + s, cy)
  ctx.stroke()
}

export function drawImageIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  const s = r * 0.65
  ctx.strokeRect(cx - s, cy - s, s * 2, s * 2)
  ctx.fillStyle = color + '60'
  ctx.beginPath()
  ctx.moveTo(cx - s, cy + s)
  ctx.lineTo(cx - s * 0.2, cy - s * 0.2)
  ctx.lineTo(cx + s * 0.3, cy + s * 0.1)
  ctx.lineTo(cx + s, cy + s)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx + s * 0.4, cy - s * 0.4, r * 0.18, 0, Math.PI * 2)
  ctx.fill()
}

export function drawCodeIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.2, cy - r * 0.5)
  ctx.lineTo(cx - r * 0.65, cy)
  ctx.lineTo(cx - r * 0.2, cy + r * 0.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.2, cy - r * 0.5)
  ctx.lineTo(cx + r * 0.65, cy)
  ctx.lineTo(cx + r * 0.2, cy + r * 0.5)
  ctx.stroke()
}

export function drawLineChartIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.14
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.7, cy + r * 0.4)
  ctx.lineTo(cx - r * 0.25, cy - r * 0.1)
  ctx.lineTo(cx + r * 0.15, cy + r * 0.2)
  ctx.lineTo(cx + r * 0.7, cy - r * 0.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.4, cy - r * 0.55)
  ctx.lineTo(cx + r * 0.7, cy - r * 0.5)
  ctx.lineTo(cx + r * 0.55, cy - r * 0.2)
  ctx.stroke()
}

export function drawLightbulbIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  ctx.beginPath()
  ctx.arc(cx, cy - r * 0.15, r * 0.5, Math.PI * 0.8, Math.PI * 0.2, true)
  ctx.lineTo(cx + r * 0.25, cy + r * 0.35)
  ctx.lineTo(cx - r * 0.25, cy + r * 0.35)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.2, cy + r * 0.5)
  ctx.lineTo(cx + r * 0.2, cy + r * 0.5)
  ctx.moveTo(cx - r * 0.15, cy + r * 0.65)
  ctx.lineTo(cx + r * 0.15, cy + r * 0.65)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy - r * 0.15, r * 0.15, 0, Math.PI * 2)
  ctx.fill()
}

export function drawTextIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  const s = r * 0.6
  ctx.strokeRect(cx - s, cy - s * 0.9, s * 1.8, s * 1.8)
  for (let i = 0; i < 3; i++) {
    const w = i === 2 ? s * 0.8 : s * 1.2
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.5, cy - s * 0.3 + i * s * 0.5)
    ctx.lineTo(cx - s * 0.5 + w, cy - s * 0.3 + i * s * 0.5)
    ctx.stroke()
  }
}

export function drawMusicIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = r * 0.12
  ctx.beginPath()
  ctx.ellipse(cx - r * 0.3, cy + r * 0.3, r * 0.22, r * 0.16, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx + r * 0.35, cy + r * 0.15, r * 0.22, r * 0.16, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.12, cy + r * 0.25)
  ctx.lineTo(cx - r * 0.12, cy - r * 0.5)
  ctx.lineTo(cx + r * 0.53, cy - r * 0.65)
  ctx.lineTo(cx + r * 0.53, cy + r * 0.1)
  ctx.stroke()
}

export function drawVideoIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  const s = r * 0.65
  ctx.beginPath()
  ctx.roundRect(cx - s, cy - s * 0.65, s * 2, s * 1.3, r * 0.15)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.2, cy - r * 0.3)
  ctx.lineTo(cx + r * 0.35, cy)
  ctx.lineTo(cx - r * 0.2, cy + r * 0.3)
  ctx.closePath()
  ctx.fill()
}

export function drawStarIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    const ox = cx + Math.cos(angle) * r * 0.75,
      oy = cy + Math.sin(angle) * r * 0.75
    if (i === 0) ctx.moveTo(ox, oy)
    else ctx.lineTo(ox, oy)
    const ia = angle + Math.PI / 5
    ctx.lineTo(cx + Math.cos(ia) * r * 0.3, cy + Math.sin(ia) * r * 0.3)
  }
  ctx.closePath()
  ctx.fill()
}

export function drawBookIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.6)
  ctx.lineTo(cx, cy + r * 0.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.6)
  ctx.quadraticCurveTo(cx - r * 0.8, cy - r * 0.5, cx - r * 0.7, cy + r * 0.5)
  ctx.lineTo(cx, cy + r * 0.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.6)
  ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 0.5, cx + r * 0.7, cy + r * 0.5)
  ctx.lineTo(cx, cy + r * 0.6)
  ctx.stroke()
}

export function drawPenIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  const angle = -Math.PI / 4,
    len = r * 1.2
  const tx = cx + Math.cos(angle) * len * 0.5,
    ty = cy + Math.sin(angle) * len * 0.5
  const bx = cx - Math.cos(angle) * len * 0.5,
    by = cy - Math.sin(angle) * len * 0.5
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.lineTo(tx, ty)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(bx, by, r * 0.1, 0, Math.PI * 2)
  ctx.fill()
}

export function drawLinkIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.14
  ctx.lineCap = 'round'
  const s = r * 0.35
  ctx.beginPath()
  ctx.arc(cx - s * 0.5, cy, s, -Math.PI * 0.6, Math.PI * 0.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx + s * 0.5, cy, s, Math.PI * 0.4, Math.PI * 1.6)
  ctx.stroke()
}

export function drawSparkleIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.fillStyle = color
  const draw4Star = (x: number, y: number, size: number) => {
    ctx.beginPath()
    ctx.moveTo(x, y - size)
    ctx.quadraticCurveTo(x + size * 0.15, y - size * 0.15, x + size, y)
    ctx.quadraticCurveTo(x + size * 0.15, y + size * 0.15, x, y + size)
    ctx.quadraticCurveTo(x - size * 0.15, y + size * 0.15, x - size, y)
    ctx.quadraticCurveTo(x - size * 0.15, y - size * 0.15, x, y - size)
    ctx.closePath()
    ctx.fill()
  }
  draw4Star(cx, cy, r * 0.65)
  draw4Star(cx + r * 0.5, cy - r * 0.5, r * 0.25)
  draw4Star(cx - r * 0.45, cy + r * 0.4, r * 0.2)
}

export function drawTimelineIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.7, cy)
  ctx.lineTo(cx + r * 0.7, cy)
  ctx.stroke()
  ctx.fillStyle = color
  for (const px of [-0.5, 0, 0.5]) {
    ctx.beginPath()
    ctx.arc(cx + r * px, cy, r * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const px of [-0.5, 0, 0.5]) {
    ctx.beginPath()
    ctx.moveTo(cx + r * px, cy - r * 0.14)
    ctx.lineTo(cx + r * px, cy - r * 0.4)
    ctx.stroke()
  }
}

export function drawComparisonIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.6)
  ctx.lineTo(cx, cy + r * 0.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.6, cy - r * 0.3)
  ctx.lineTo(cx + r * 0.6, cy - r * 0.3)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx - r * 0.6, cy - r * 0.3, r * 0.06, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.85, cy + r * 0.1)
  ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.3, cx - r * 0.35, cy + r * 0.1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.6, cy - r * 0.24)
  ctx.lineTo(cx - r * 0.85, cy + r * 0.1)
  ctx.moveTo(cx - r * 0.6, cy - r * 0.24)
  ctx.lineTo(cx - r * 0.35, cy + r * 0.1)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx + r * 0.6, cy - r * 0.3, r * 0.06, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.35, cy + r * 0.1)
  ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.3, cx + r * 0.85, cy + r * 0.1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.6, cy - r * 0.24)
  ctx.lineTo(cx + r * 0.35, cy + r * 0.1)
  ctx.moveTo(cx + r * 0.6, cy - r * 0.24)
  ctx.lineTo(cx + r * 0.85, cy + r * 0.1)
  ctx.stroke()
}

export function drawProcessIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = r * 0.1
  ctx.lineCap = 'round'
  const boxW = r * 0.35,
    boxH = r * 0.25,
    positions = [-0.55, 0, 0.55]
  for (const px of positions) ctx.strokeRect(cx + r * px - boxW / 2, cy - boxH / 2, boxW, boxH)
  for (let i = 0; i < positions.length - 1; i++) {
    const fromX = cx + r * positions[i] + boxW / 2 + 1,
      toX = cx + r * positions[i + 1] - boxW / 2 - 1
    ctx.beginPath()
    ctx.moveTo(fromX, cy)
    ctx.lineTo(toX - r * 0.06, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(toX, cy)
    ctx.lineTo(toX - r * 0.1, cy - r * 0.06)
    ctx.lineTo(toX - r * 0.1, cy + r * 0.06)
    ctx.closePath()
    ctx.fill()
  }
}

/** CardKind → Icon draw function registry */
export const KIND_ICON_DRAWERS: Record<string, IconDrawFn> = {
  quote: drawQuoteIcon,
  summary: drawSummaryIcon,
  argument: drawTargetIcon,
  data: drawBarChartIcon,
  table: drawTableIcon,
  image: drawImageIcon,
  code: drawCodeIcon,
  chart: drawLineChartIcon,
  idea: drawLightbulbIcon,
  text: drawTextIcon,
  audio: drawMusicIcon,
  video: drawVideoIcon,
  keypoint: drawStarIcon,
  definition: drawBookIcon,
  example: drawPenIcon,
  reference: drawLinkIcon,
  inspiration: drawSparkleIcon,
  timeline: drawTimelineIcon,
  comparison: drawComparisonIcon,
  process: drawProcessIcon,
  gif: drawImageIcon,
  qrcode: drawTableIcon,
  person: drawSummaryIcon,
  terminal: drawCodeIcon,
  lottie: drawSparkleIcon,
  webpage: drawLinkIcon,
  countdown: drawTimelineIcon,
  threed: drawSparkleIcon,
  live2d: drawSparkleIcon,
  link: drawLinkIcon,
  file: drawTextIcon,
  math: drawSparkleIcon,
  todo: drawStarIcon,
  position: drawTargetIcon,
  timestamp: drawTimelineIcon,
  color: drawSparkleIcon,
  event: drawTimelineIcon,
  voice: drawMusicIcon,
  comment: drawQuoteIcon,
  story: drawBookIcon,
  social: drawLinkIcon,
  poker: drawStarIcon,
  tarot: drawSparkleIcon,
  flash: drawLightbulbIcon,
}

/** Factory: resolve IconData from a card kind string.
 *  Checks plugin registry first, falls back to hardcoded table. */
export function resolveIcon(kind: string): IconData {
  const pluginIcon = registry.getIconDef(kind)
  if (pluginIcon) return { draw: pluginIcon }
  return { draw: KIND_ICON_DRAWERS[kind] || drawTextIcon }
}
