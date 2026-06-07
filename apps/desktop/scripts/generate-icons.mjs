// Generate production-grade app icons from SVG source
// Usage: node scripts/generate-icons.mjs
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '..', 'assets')
const iconSvg = readFileSync(join(assetsDir, 'icon.svg'))

// Apple HIG: macOS icon content should occupy ~80% of the canvas.
// At 1024×1024 the visible shape is 824×824, centered with 100px padding.
const MACOS_CONTENT_RATIO = 824 / 1024

/**
 * Render the icon SVG at the given target size with macOS-style transparent
 * padding so the background squircle doesn't fill the full icon grid.
 */
async function renderMacOSIcon(targetSize) {
  const contentSize = Math.round(targetSize * MACOS_CONTENT_RATIO)
  const padding = Math.round((targetSize - contentSize) / 2)

  const content = await sharp(iconSvg).resize(contentSize, contentSize).png().toBuffer()

  return sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: content, left: padding, top: padding }])
    .png()
}

/** Render the icon SVG at the given size with no padding (Windows / generic). */
function renderFullBleedIcon(targetSize) {
  return sharp(iconSvg).resize(targetSize, targetSize).png()
}

// macOS .iconset sizes (filename → pixel size)
const ICONSET_ENTRIES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

async function generateAppIcons() {
  // 1024×1024 master PNG with macOS padding
  await (await renderMacOSIcon(1024)).toFile(join(assetsDir, 'icon.png'))
  console.log('✓ icon.png (1024×1024, macOS padded)')

  // macOS .iconset → .icns
  if (process.platform === 'darwin') {
    const iconsetDir = join(assetsDir, 'icon.iconset')
    mkdirSync(iconsetDir, { recursive: true })

    for (const [name, size] of ICONSET_ENTRIES) {
      await (await renderMacOSIcon(size)).toFile(join(iconsetDir, name))
    }

    execSync(`iconutil -c icns -o "${join(assetsDir, 'icon.icns')}" "${iconsetDir}"`)
    rmSync(iconsetDir, { recursive: true })
    console.log('✓ icon.icns (macOS)')
  }

  // Windows .ico — full-bleed (no padding)
  const icoSizes = [16, 32, 48, 256]
  const pngBuffers = await Promise.all(icoSizes.map((s) => renderFullBleedIcon(s).toBuffer()))
  writeFileSync(join(assetsDir, 'icon.ico'), buildIco(pngBuffers, icoSizes))
  console.log('✓ icon.ico (Windows)')
}

async function generateTrayIcons() {
  const states = [
    { state: 'idle', macBase: 'trayTemplate', winBase: 'tray', badge: 'none' },
    { state: 'active', macBase: 'trayTemplateActive', winBase: 'trayActive', badge: 'active' },
    {
      state: 'attention',
      macBase: 'trayTemplateAttention',
      winBase: 'trayAttention',
      badge: 'attention',
    },
  ]

  for (const entry of states) {
    const macSvg = Buffer.from(createMacTraySvg(entry.badge))
    await sharp(macSvg)
      .resize(18, 18)
      .png()
      .toFile(join(assetsDir, `${entry.macBase}.png`))
    await sharp(macSvg)
      .resize(36, 36)
      .png()
      .toFile(join(assetsDir, `${entry.macBase}@2x.png`))

    const winSvg = Buffer.from(createWindowsTraySvg(entry.badge))
    await sharp(winSvg)
      .resize(16, 16)
      .png()
      .toFile(join(assetsDir, `${entry.winBase}.png`))
    await sharp(winSvg)
      .resize(32, 32)
      .png()
      .toFile(join(assetsDir, `${entry.winBase}@2x.png`))
  }

  console.log('✓ tray icons (macOS template + Windows color, idle/active/attention)')
}

function createMacTraySvg(_badge) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g transform="translate(0,-4) scale(1.18) translate(-7.6,-3)">
    <path d="M22,47 Q15,24 28,24 Q34,24 40,40" fill="black"/>
    <path d="M78,47 Q85,24 72,24 Q66,24 60,40" fill="black"/>
    <ellipse cx="50" cy="62" rx="38" ry="26" fill="black"/>
  </g>
</svg>`
}

function createWindowsTraySvg(badge) {
  const badgeColor = badge === 'active' ? '#22c55e' : badge === 'attention' ? '#f59e0b' : '#7a7d85'
  const badgeShape =
    badge === 'none'
      ? ''
      : `<circle cx="78" cy="78" r="15" fill="${badgeColor}" stroke="#0b0b0d" stroke-width="5"/>
        ${
          badge === 'attention'
            ? '<rect x="75" y="67" width="6" height="14" rx="3" fill="#1b1200"/><circle cx="78" cy="86" r="3" fill="#1b1200"/>'
            : ''
        }`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="catBody" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#5a5a5e"/>
      <stop offset="50%" stop-color="#3d3d40"/>
      <stop offset="100%" stop-color="#18181a"/>
    </radialGradient>
    <radialGradient id="eyeYellow" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffcc"/>
      <stop offset="35%" stop-color="#f8e71c"/>
      <stop offset="100%" stop-color="#b3a100"/>
    </radialGradient>
    <radialGradient id="eyeCyan" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ccffff"/>
      <stop offset="35%" stop-color="#00f3ff"/>
      <stop offset="100%" stop-color="#0099aa"/>
    </radialGradient>
  </defs>
  <g transform="translate(0,-3)">
    <path d="M22,47 Q15,24 28,24 Q34,24 40,40" fill="url(#catBody)" stroke="#0b0b0d" stroke-width="5" stroke-linejoin="round"/>
    <path d="M78,47 Q85,24 72,24 Q66,24 60,40" fill="url(#catBody)" stroke="#0b0b0d" stroke-width="5" stroke-linejoin="round"/>
    <ellipse cx="50" cy="62" rx="38" ry="26" fill="url(#catBody)" stroke="#0b0b0d" stroke-width="5"/>
    <circle cx="33" cy="58" r="6" fill="url(#eyeYellow)" stroke="#0b0b0d" stroke-width="2"/>
    <circle cx="67" cy="58" r="6" fill="url(#eyeCyan)" stroke="#0b0b0d" stroke-width="2"/>
  </g>
  ${badgeShape}
</svg>`
}

// Build ICO file format (multi-resolution PNG container)
function buildIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length
  const headerSize = 6
  const entrySize = 16
  const dataOffset = headerSize + entrySize * numImages

  let totalSize = dataOffset
  for (const buf of pngBuffers) totalSize += buf.length

  const ico = Buffer.alloc(totalSize)
  ico.writeUInt16LE(0, 0) // Reserved
  ico.writeUInt16LE(1, 2) // Type: ICO
  ico.writeUInt16LE(numImages, 4)

  let offset = dataOffset
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i]
    const buf = pngBuffers[i]
    const pos = headerSize + i * entrySize

    ico.writeUInt8(size < 256 ? size : 0, pos) // Width
    ico.writeUInt8(size < 256 ? size : 0, pos + 1) // Height
    ico.writeUInt8(0, pos + 2) // Color palette
    ico.writeUInt8(0, pos + 3) // Reserved
    ico.writeUInt16LE(1, pos + 4) // Color planes
    ico.writeUInt16LE(32, pos + 6) // Bits per pixel
    ico.writeUInt32LE(buf.length, pos + 8) // Image size
    ico.writeUInt32LE(offset, pos + 12) // Data offset

    buf.copy(ico, offset)
    offset += buf.length
  }

  return ico
}

console.log('Generating icons from SVG sources...\n')
await generateAppIcons()
await generateTrayIcons()
console.log('\n✅ All icons generated!')
