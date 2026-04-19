// ══════════════════════════════════════════════════════════════
// ECS — Shared Canvas 2D Utilities
// Includes adaptive typography engine for self-sizing text.
// ══════════════════════════════════════════════════════════════

/** Parse hex color to rgba string with alpha */
export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Draw a filled rounded rect */
export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/** Truncate text to fit within maxW pixels, appending '…' */
export function truncText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  font?: string,
): string {
  if (font) ctx.font = font
  if (ctx.measureText(text).width <= maxW) return text
  for (let i = text.length - 1; i > 0; i--) {
    const t = text.slice(0, i) + '…'
    if (ctx.measureText(t).width <= maxW) return t
  }
  return '…'
}

/** Word-wrap text into lines that fit within maxWidth */
export function wrapText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let remaining = text

  while (remaining.length > 0 && lines.length < maxLines) {
    const metrics = ctx.measureText(remaining)
    if (metrics.width <= maxWidth) {
      lines.push(remaining)
      break
    }

    let lo = 1,
      hi = remaining.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ctx.measureText(remaining.slice(0, mid)).width <= maxWidth) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }

    const isLastLine = lines.length === maxLines - 1
    if (isLastLine && remaining.length > lo) {
      lines.push(remaining.slice(0, Math.max(lo - 1, 1)) + '…')
      break
    }

    lines.push(remaining.slice(0, lo))
    remaining = remaining.slice(lo)
  }

  return lines
}

/** Draw a filled 5-point star */
export function drawMiniStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    const outerX = cx + Math.cos(angle) * r
    const outerY = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(outerX, outerY)
    else ctx.lineTo(outerX, outerY)
    const innerAngle = angle + Math.PI / 5
    const innerX = cx + Math.cos(innerAngle) * r * 0.4
    const innerY = cy + Math.sin(innerAngle) * r * 0.4
    ctx.lineTo(innerX, innerY)
  }
  ctx.closePath()
  ctx.fill()
}

/** Draw a stroked 5-point star outline */
export function drawMiniStarOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    const outerX = cx + Math.cos(angle) * r
    const outerY = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(outerX, outerY)
    else ctx.lineTo(outerX, outerY)
    const innerAngle = angle + Math.PI / 5
    const innerX = cx + Math.cos(innerAngle) * r * 0.4
    const innerY = cy + Math.sin(innerAngle) * r * 0.4
    ctx.lineTo(innerX, innerY)
  }
  ctx.closePath()
  ctx.stroke()
}

// ══════════════════════════════════════════════════════════════
// § Adaptive Typography Engine (large sizes)
// ══════════════════════════════════════════════════════════════

/**
 * Calculate adaptive font size that fits content into available height.
 * Default range is 9–14px (large, readable card text).
 */
export function adaptiveFontSize(
  availableH: number,
  textLength: number,
  contentW: number,
  min = 9,
  max = 14,
): number {
  for (let fs = max; fs >= min; fs--) {
    const charW = fs * 0.85
    const charsPerLine = Math.max(1, Math.floor(contentW / charW))
    const lines = Math.ceil(textLength / charsPerLine)
    const totalH = lines * fs * LH_MULT
    if (totalH <= availableH) return fs
  }
  return min
}

// ── Font constants ────────────────────────────────────────
/** Title font — AlimamaFangHeiti Bold, falls back to Noto Sans SC */
export const FONT_TITLE = '"AlimamaFangHeiti", "Noto Sans SC", "PingFang SC", sans-serif'
/** Body font — Alibaba PuHuiTi Regular, falls back to Noto Sans SC */
export const FONT_BODY = '"AlibabaPuHuiTi", "Noto Sans SC", "PingFang SC", sans-serif'

/**
 * Build a font string with the given size (px) and family.
 */
export function fontStr(
  size: number,
  weight: string | number = '',
  style = '',
  family = FONT_BODY,
): string {
  const parts: string[] = []
  if (style) parts.push(style)
  if (weight) parts.push(String(weight))
  parts.push(`${size}px`)
  parts.push(family)
  return parts.join(' ')
}

/** Build a title font string (uses AlimamaFangHeiti bold) */
export function titleFontStr(size: number): string {
  return `bold ${size}px ${FONT_TITLE}`
}

/** Line height multiplier for body text */
export const LH_MULT = 1.4

/** Bleed value — extra drawing area outside the safe content zone */
export const BLEED = 4

/** Default card padding (inner margin from card edge to content) */
export const CARD_PAD = 12

/**
 * Draw a block of word-wrapped text with adaptive font size.
 * Returns the actual height consumed.
 */
export function drawWrappedBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  availH: number,
  opts: {
    minFs?: number
    maxFs?: number
    weight?: string | number
    style?: string
    family?: string
    color?: string
    maxLines?: number
  } = {},
): number {
  const minFs = opts.minFs ?? 9
  const maxFs = opts.maxFs ?? 14
  const fs = adaptiveFontSize(availH, text.length, maxW, minFs, maxFs)
  const lh = Math.round(fs * LH_MULT)
  const font = fontStr(fs, opts.weight || '', opts.style || '', opts.family)
  ctx.font = font
  if (opts.color) ctx.fillStyle = opts.color
  const maxLines = opts.maxLines ?? Math.max(2, Math.floor(availH / lh))
  const lines = wrapText(ctx, text, maxW, maxLines)
  let dy = 0
  for (const line of lines) {
    if (dy + lh > availH) break
    ctx.fillText(line, x, y + dy)
    dy += lh
  }
  return dy
}

/**
 * Safely coerce any value to a displayable string.
 * Handles numbers, undefined, null, objects.
 */
export function safeStr(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}
