/**
 * Demo GIF Engine — Visual Effects
 *
 * Reusable animation primitives for product preview GIFs:
 *   - Crossfade transitions
 *   - Centre-based zoom (preserves canvas aspect ratio)
 *   - Highlight ring callouts (SVG overlay)
 *   - Label badge captions (SVG overlay)
 *
 * All functions accept a `sharp` instance as their first param so the
 * caller controls which sharp version is used (workspace dependency).
 */

// ── Easing ──────────────────────────────────────────────

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

// ── SVG helpers ─────────────────────────────────────────

export function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Crossfade ───────────────────────────────────────────

/**
 * Pixel-level crossfade between two same-size PNG buffers.
 * @param {Function} sharp — sharp constructor
 * @param {Buffer} srcBuf — source PNG buffer
 * @param {Buffer} dstBuf — destination PNG buffer
 * @param {number} t — blend factor (0 = src, 1 = dst)
 * @param {number} w — canvas width
 * @param {number} h — canvas height
 */
export async function crossfade(sharp, srcBuf, dstBuf, t, w, h) {
  const [srcRaw, dstRaw] = await Promise.all([
    sharp(srcBuf).ensureAlpha().raw().toBuffer(),
    sharp(dstBuf).ensureAlpha().raw().toBuffer(),
  ])
  const len = Math.min(srcRaw.length, dstRaw.length)
  const out = Buffer.allocUnsafe(len)
  const inv = 1 - t
  for (let i = 0; i < len; i++) {
    out[i] = (srcRaw[i] * inv + dstRaw[i] * t + 0.5) | 0
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

// ── Zoom ────────────────────────────────────────────────

/**
 * Calculate crop rect from {cx, cy, scale} preserving canvas aspect ratio.
 * @param {{ cx: number, cy: number, scale: number }} z — normalised centre + scale
 * @param {number} scale — current zoom level (1 = full, >1 = zoomed)
 * @param {number} w — canvas width
 * @param {number} h — canvas height
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
export function zoomRect(z, scale, w, h) {
  const cropW = Math.round(w / scale)
  const cropH = Math.round(h / scale)
  let left = Math.round(z.cx * w - cropW / 2)
  let top = Math.round(z.cy * h - cropH / 2)
  left = Math.max(0, Math.min(left, w - cropW))
  top = Math.max(0, Math.min(top, h - cropH))
  return { left, top, width: cropW, height: cropH }
}

/**
 * Crop-zoom a frame to a region and resize back to canvas size.
 */
export async function zoomCrop(sharp, baseBuf, z, scale, w, h) {
  const rect = zoomRect(z, scale, w, h)
  return sharp(baseBuf).extract(rect).resize(w, h).png().toBuffer()
}

/**
 * Produce a zoomed frame at interpolation t (0 = full, 1 = fully zoomed).
 */
export async function zoomAtT(sharp, baseBuf, z, t, w, h) {
  const scale = lerp(1, z.scale, t)
  return zoomCrop(sharp, baseBuf, z, scale, w, h)
}

// ── Highlight ring ──────────────────────────────────────

/**
 * Generate an SVG overlay with a highlight ring callout.
 * @param {{ x: number, y: number, r: number }} hl — normalised position
 * @param {number} w — canvas width
 * @param {number} h — canvas height
 * @param {string} color — ring colour (CSS)
 */
export function highlightSvg(hl, w, h, color = '#00f3ff') {
  const cx = Math.round(hl.x * w)
  const cy = Math.round(hl.y * h)
  const r = Math.round(hl.r * Math.max(w, h))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><filter id="hg"><feGaussianBlur stdDeviation="3"/></filter></defs>
  <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none"
    stroke="${color}" stroke-width="2" opacity="0.25" filter="url(#hg)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
    stroke="${color}" stroke-width="1.5" opacity="0.55"/>
</svg>`
}

// ── Label badge ─────────────────────────────────────────

/**
 * Generate an SVG overlay with a label badge at the bottom of the frame.
 * @param {string} text — badge text
 * @param {number} w — canvas width
 * @param {number} h — canvas height
 * @param {{ font: string, accentColor: string, accentMuted: string }} style
 */
export function labelBadgeSvg(text, w, h, style = {}) {
  const fontFamily = style.font ?? 'sans-serif'
  const accent = style.accentColor ?? '#00f3ff'
  const accentMuted = style.accentMuted ?? 'rgba(0,243,255,0.6)'

  const charW = [...text].reduce((s, c) => s + (c.charCodeAt(0) > 0x2e80 ? 14 : 8), 0)
  const pad = 24
  const bw = Math.round(charW + pad * 2)
  const bh = 28
  const bx = Math.round((w - bw) / 2)
  const by = h - bh - 14

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><filter id="lbs"><feGaussianBlur stdDeviation="6"/></filter></defs>
  <rect x="${bx - 2}" y="${by - 2}" width="${bw + 4}" height="${bh + 4}"
    rx="16" fill="${accent}" opacity="0.08" filter="url(#lbs)"/>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}"
    rx="14" fill="rgba(12,13,18,0.82)"/>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}"
    rx="14" fill="none" stroke="${accentMuted}" stroke-width="0.6"/>
  <text x="${Math.round(w / 2)}" y="${by + 18}"
    text-anchor="middle" fill="rgba(255,255,255,0.92)"
    font-size="12" font-family="${fontFamily}"
    font-weight="600" letter-spacing="0.4">
    ${esc(text)}
  </text>
</svg>`
}
