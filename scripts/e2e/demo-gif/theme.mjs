/**
 * Shadow (虾豆) Brand Theme for Demo GIF Engine
 *
 * Contains all product-specific visual identity:
 *   - Design tokens (colours, grid, fonts)
 *   - Cat logo SVG
 *   - Title card backgrounds (dot grid + colour blobs)
 *   - Halo ring glow effect
 *   - Title card text + typography
 *
 * This file is the ONLY place that references Shadow branding.
 * Swap it out with a different theme to produce GIFs for another product.
 */

import { esc } from './engine/effects.mjs'

// ── Design Tokens ───────────────────────────────────────

export const BRAND = {
  bg: '#0f1117',
  cyan: '#00f3ff',
  cyanLight: '#9df7ff',
  cyanMuted: 'rgba(0,243,255,0.6)',
  yellow: '#f8e71c',
  yellowLight: '#fde68a',
  pink: '#ff8db6',
  dotColor: '#1c1d24',
  gridSize: 40,
  dotR: 1.0,
  font: "'Avenir Next','Avenir','Helvetica Neue',Helvetica,sans-serif",
  fontCJK: "'PingFang SC','Avenir Next','Hiragino Sans GB','Noto Sans CJK SC',sans-serif",
}

function font(lang) {
  return lang === 'zh' ? BRAND.fontCJK : BRAND.font
}

// ── Cat Logo (100×100 viewBox) ──────────────────────────

function logoSvg(cx, cy, size) {
  const s = size / 100
  return `<g transform="translate(${cx - 50 * s}, ${cy - 52 * s}) scale(${s})">
    <defs>
      <radialGradient id="lb" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#5a5a5e"/><stop offset="50%" stop-color="#3d3d40"/><stop offset="100%" stop-color="#18181a"/>
      </radialGradient>
      <radialGradient id="ley" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#ffffcc"/><stop offset="35%" stop-color="#f8e71c"/><stop offset="100%" stop-color="#b3a100"/>
      </radialGradient>
      <radialGradient id="lec" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#ccffff"/><stop offset="35%" stop-color="#00f3ff"/><stop offset="100%" stop-color="#0099aa"/>
      </radialGradient>
    </defs>
    <g transform="translate(0,-2)">
      <path d="M22,47 Q15,24 28,24 Q34,24 40,40" fill="url(#lb)" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M78,47 Q85,24 72,24 Q66,24 60,40" fill="url(#lb)" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="50" cy="62" rx="38" ry="26" fill="url(#lb)" stroke="#1a1a1c" stroke-width="2.5"/>
      <ellipse cx="50" cy="61" rx="35" ry="23" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
      <circle cx="32" cy="57" r="6.5" fill="url(#ley)" stroke="#1a1a1c" stroke-width="1.5"/>
      <circle cx="30" cy="54.5" r="2.2" fill="#fff"/><circle cx="34" cy="60" r="1.2" fill="#fff" opacity="0.6"/>
      <circle cx="68" cy="57" r="6.5" fill="url(#lec)" stroke="#1a1a1c" stroke-width="1.5"/>
      <circle cx="66" cy="54.5" r="2.2" fill="#fff"/><circle cx="70" cy="60" r="1.2" fill="#fff" opacity="0.6"/>
      <ellipse cx="50" cy="64" rx="4" ry="2.5" fill="#3a2a26"/>
      <ellipse cx="49.5" cy="63.2" rx="1.5" ry="0.8" fill="#8c7772"/>
      <path d="M40,69 Q45,74.5 50,69" fill="none" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M50,69 Q55,74.5 60,69" fill="none" stroke="#1a1a1c" stroke-width="2.5" stroke-linecap="round"/>
    </g>
  </g>`
}

// ── Title Card Background ───────────────────────────────

const _bgCache = new Map()

function bgSvg(w, h) {
  const { bg, dotColor, gridSize, dotR } = BRAND
  const cols = Math.ceil(w / gridSize) + 1
  const rows = Math.ceil(h / gridSize) + 1
  let dots = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots += `<circle cx="${c * gridSize}" cy="${r * gridSize}" r="${dotR}" fill="${dotColor}"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${dots}
  <defs><filter id="bl"><feGaussianBlur stdDeviation="55"/></filter></defs>
  <circle cx="${w * 0.20}" cy="${h * 0.28}" r="${h * 0.26}" fill="${BRAND.cyan}" opacity="0.10" filter="url(#bl)"/>
  <circle cx="${w * 0.80}" cy="${h * 0.52}" r="${h * 0.20}" fill="${BRAND.yellow}" opacity="0.08" filter="url(#bl)"/>
  <circle cx="${w * 0.42}" cy="${h * 0.78}" r="${h * 0.18}" fill="${BRAND.pink}" opacity="0.07" filter="url(#bl)"/>
</svg>`
}

async function getBg(sharp, w, h) {
  const key = `${w}x${h}`
  if (!_bgCache.has(key)) {
    _bgCache.set(key, await sharp(Buffer.from(bgSvg(w, h))).png().toBuffer())
  }
  return _bgCache.get(key)
}

function haloSvg(cx, cy, r, w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="hl" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.02"/>
      <stop offset="30%" stop-color="${BRAND.cyanLight}" stop-opacity="0.18"/>
      <stop offset="55%" stop-color="${BRAND.yellow}" stop-opacity="0.10"/>
      <stop offset="76%" stop-color="${BRAND.pink}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="hb"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#hl)" stroke-width="14" filter="url(#hb)"/>
</svg>`
}

// ── Typography ──────────────────────────────────────────

const STYLES = {
  hero:    { size: 52, weight: 700, spacing: 3, lh: 66, fill: '#ffffff' },
  tagline: { size: 21, weight: 500, spacing: 0.3, lh: 34, fill: 'rgba(255,255,255,0.72)' },
  act:     { size: 40, weight: 700, spacing: 8, lh: 52, fill: 'url(#actGrad)' },
  closing: { size: 21, weight: 600, spacing: 0.4, lh: 36, fill: 'rgba(255,255,255,0.82)' },
}

function titleTextSvg(scene, W, H, charCount, lang) {
  const st = STYLES[scene.style] ?? STYLES.tagline
  const allLines = scene.text.split('\n')
  const totalH = st.lh * allLines.length
  const hasLogo = scene.style === 'hero'
  const logoSpace = hasLogo ? 52 : 0
  const baseY = (H - totalH - logoSpace) / 2 + logoSpace + st.size * 0.36

  let remaining = charCount
  const visibleLines = allLines.map((line) => {
    if (remaining <= 0) return ''
    const vis = line.substring(0, remaining)
    remaining -= line.length
    return vis
  })

  const fullText = allLines.join('')
  const showCursor = charCount < fullText.length

  let defs = ''
  let fillAttr = `fill="${st.fill}"`
  if (scene.style === 'act') {
    defs = `<linearGradient id="actGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND.cyan}"/>
      <stop offset="100%" stop-color="${BRAND.cyanLight}"/>
    </linearGradient>`
    fillAttr = 'fill="url(#actGrad)"'
  }

  const texts = visibleLines.map((line, i) => {
    if (!line && !showCursor) return ''
    const y = Math.round(baseY + i * st.lh)
    let display = scene.style === 'act' ? line.toUpperCase() : line
    if (showCursor && i === visibleLines.findLastIndex((l) => l.length > 0)) {
      display += ' |'
    }
    return `<text x="${W / 2}" y="${y}" text-anchor="middle" ${fillAttr}
      font-size="${st.size}" font-weight="${st.weight}" letter-spacing="${st.spacing}"
      font-family="${font(lang)}">${esc(display)}</text>`
  }).filter(Boolean).join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>${defs}</defs>
  ${texts}
</svg>`
}

// ── Title Card Renderer ─────────────────────────────────

/**
 * Render a single title card frame.
 *
 * This is the theme function expected by engine/renderer.mjs.
 *
 * @param {Function} sharp — sharp constructor
 * @param {object} scene — scene descriptor
 * @param {number} W — canvas width
 * @param {number} H — canvas height
 * @param {number} charCount — visible characters (Infinity = all)
 * @param {string} lang — locale code
 */
async function renderTitleFrame(sharp, scene, W, H, charCount = Infinity, lang = 'en') {
  const bg = await getBg(sharp, W, H)
  const text = Buffer.from(titleTextSvg(scene, W, H, charCount, lang))
  const layers = [{ input: text, top: 0, left: 0 }]

  if (scene.style === 'hero') {
    const st = STYLES.hero
    const totalH = st.lh
    const logoSpace = 52
    const baseY = (H - totalH - logoSpace) / 2 + logoSpace + st.size * 0.36
    const logoSize = 56
    const logoCy = baseY - st.size * 0.36 - logoSpace - 6 + logoSize / 2

    layers.unshift({
      input: Buffer.from(haloSvg(W / 2, logoCy, logoSize * 0.85, W, H)),
      top: 0, left: 0,
    })
    layers.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${logoSvg(W / 2, logoCy, logoSize)}</svg>`),
      top: 0, left: 0,
    })
  }

  if (scene.style === 'closing') {
    const st = STYLES.closing
    const allLines = scene.text.split('\n')
    const totalH = st.lh * allLines.length
    const baseY = (H - totalH) / 2 + st.size * 0.36
    const bottomY = baseY + totalH + 16
    const logoSize = 28
    layers.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${logoSvg(W / 2, bottomY + logoSize / 2, logoSize)}</svg>`),
      top: 0, left: 0,
    })
  }

  return sharp(bg).composite(layers).png().toBuffer()
}

// ── Exported Theme Object ───────────────────────────────

/**
 * The theme object consumed by `renderGif()`.
 */
export const shadowTheme = {
  renderTitleFrame,
  style: {
    font: BRAND.font,
    fontCJK: BRAND.fontCJK,
    accentColor: BRAND.cyan,
    accentMuted: BRAND.cyanMuted,
  },
}

/** Clear cached background buffers (useful between locale runs). */
export function clearCache() {
  _bgCache.clear()
}
