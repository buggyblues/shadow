// ══════════════════════════════════════════════════════════════
// KaTeX → Canvas renderer  (DOM tree-walker approach, no SVG foreignObject)
//
// Rendering pipeline:
//   katex.renderToString → hidden DOM span → getBoundingClientRect per glyph
//   → ctx.fillText with computed font/color → canvas (never tainted)
//
// Why NOT foreignObject: SVG <foreignObject> always taints the canvas,
// causing WebGL texImage2D SecurityError that crashes the GL context.
//
// Results are cached by formula+style key (sync, ready=true immediately).
// ══════════════════════════════════════════════════════════════

import katex from 'katex'

export interface KatexEntry {
  canvas: HTMLCanvasElement
  width: number
  height: number
  ready: boolean
}

const cache = new Map<string, KatexEntry>()
const MAX_CACHE = 200

// Off-screen measurement/render host — kept in the DOM for getBoundingClientRect.
let _host: HTMLDivElement | null = null
function getHost(): HTMLDivElement {
  if (!_host) {
    _host = document.createElement('div')
    _host.style.cssText =
      'position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;overflow:visible;'
    document.body.appendChild(_host)
  }
  return _host
}

function evict() {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
}

/**
 * Walk the rendered KaTeX DOM tree and draw each text node onto `ctx`.
 * Uses computed getBoundingClientRect per text node to get exact positions
 * without any SVG foreignObject (so the canvas stays untainted).
 */
function drawDomToCanvas(
  ctx: CanvasRenderingContext2D,
  root: HTMLElement,
  originX: number,
  originY: number,
  scaleX: number,
  scaleY: number,
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent
    if (!text) continue

    const range = document.createRange()
    range.selectNode(node)
    const rects = range.getClientRects()
    if (!rects.length) continue

    const parent = (node as Text).parentElement
    if (!parent) continue
    const style = window.getComputedStyle(parent)
    const font = style.font || `${style.fontSize} ${style.fontFamily}`
    const color = style.color

    ctx.save()
    ctx.font = font
    ctx.fillStyle = color
    ctx.textBaseline = 'top'

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      const x = (r.left - originX) * scaleX
      const y = (r.top - originY) * scaleY
      ctx.fillText(text, x, y)
    }
    ctx.restore()
  }
}

/**
 * Return a cached canvas entry for `formula`.
 * Rendering is synchronous — ready=true immediately after first call.
 */
export function getKatexEntry(
  formula: string,
  fontSize: number,
  color: string,
  maxW: number,
): KatexEntry | null {
  const key = `${formula}__${fontSize}__${color}__${maxW}`
  const cached = cache.get(key)
  if (cached) return cached

  // ── 1. Render KaTeX HTML ─────────────────────────────────
  let html: string
  try {
    html = katex.renderToString(formula, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
    })
  } catch {
    return null
  }

  // ── 2. Mount to DOM for layout ──────────────────────────
  const host = getHost()
  const wrapper = document.createElement('span')
  wrapper.style.cssText =
    `font-size:${fontSize}px;color:${color};line-height:1.3;` +
    `white-space:nowrap;display:inline-block;`
  wrapper.innerHTML = html
  host.appendChild(wrapper)

  const wrapRect = wrapper.getBoundingClientRect()
  if (wrapRect.width === 0 || wrapRect.height === 0) {
    host.removeChild(wrapper)
    return null
  }

  // ── 3. Scale to fit maxW ─────────────────────────────────
  const scale = wrapRect.width > maxW ? maxW / wrapRect.width : 1
  const W = Math.ceil(wrapRect.width * scale) + 4 // +4px padding
  const H = Math.ceil(wrapRect.height * scale) + 4

  // ── 4. Draw text nodes onto canvas (no foreignObject!) ───
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx2 = canvas.getContext('2d')!

  ctx2.clearRect(0, 0, W, H)
  drawDomToCanvas(
    ctx2,
    wrapper,
    wrapRect.left - 2, // -2 for left padding
    wrapRect.top - 2, // -2 for top  padding
    scale,
    scale,
  )

  host.removeChild(wrapper)

  evict()
  const entry: KatexEntry = { canvas, width: W, height: H, ready: true }
  cache.set(key, entry)
  return entry
}

/**
 * Draw a KaTeX formula horizontally centred at x=`cx`, top at `y`.
 * Returns the vertical space consumed (in canvas px).
 * Rendering is synchronous — no rebake needed.
 */
export function drawKatex(
  ctx: CanvasRenderingContext2D,
  formula: string,
  cx: number,
  y: number,
  maxW: number,
  fontSize = 13,
  color = '#333',
): { height: number; needsRebake: boolean } {
  const entry = getKatexEntry(formula, fontSize, color, maxW)

  if (!entry) {
    // Plain-text fallback if KaTeX fails to parse
    ctx.save()
    ctx.font = `${fontSize}px "Times New Roman", "STIX Two Math", serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(formula, cx, y)
    ctx.restore()
    return { height: fontSize + 6, needsRebake: false }
  }

  ctx.drawImage(
    entry.canvas,
    Math.round(cx - entry.width / 2),
    Math.round(y),
    entry.width,
    entry.height,
  )
  return { height: entry.height + 2, needsRebake: false }
}
