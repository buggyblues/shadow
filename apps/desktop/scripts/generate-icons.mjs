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

    await (await renderWindowsTrayIcon(16)).toFile(join(assetsDir, `${entry.winBase}.png`))
    await (await renderWindowsTrayIcon(32)).toFile(join(assetsDir, `${entry.winBase}@2x.png`))
  }

  console.log('✓ tray icons (macOS template + Windows transparent cat head)')
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

function createWindowsTraySvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="catBody" cx="50%" cy="32%" r="72%">
      <stop offset="0%" stop-color="#66666b" />
      <stop offset="48%" stop-color="#3d3d40" />
      <stop offset="100%" stop-color="#151517" />
    </radialGradient>
    <radialGradient id="eyeYellow" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffcf" />
      <stop offset="38%" stop-color="#f8e71c" />
      <stop offset="100%" stop-color="#b3a100" />
    </radialGradient>
    <radialGradient id="eyeCyan" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#d2ffff" />
      <stop offset="38%" stop-color="#00f3ff" />
      <stop offset="100%" stop-color="#0099aa" />
    </radialGradient>
  </defs>
  <g transform="translate(0 -0.5)">
    <path d="M14.5 30.5C10.5 17 12.2 7.5 20.3 7.5c4.6 0 8.4 4.3 11.7 14.5" fill="url(#catBody)" stroke="#111113" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M49.5 30.5C53.5 17 51.8 7.5 43.7 7.5c-4.6 0-8.4 4.3-11.7 14.5" fill="url(#catBody)" stroke="#111113" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="32" cy="38.5" rx="27.5" ry="19.5" fill="url(#catBody)" stroke="#111113" stroke-width="3.2"/>
    <ellipse cx="32" cy="37.5" rx="24.4" ry="16.4" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.4"/>
    <circle cx="19.9" cy="35.3" r="5.6" fill="url(#eyeYellow)" stroke="#111113" stroke-width="1.7"/>
    <circle cx="18.3" cy="33.2" r="1.8" fill="#fff"/>
    <circle cx="44.1" cy="35.3" r="5.6" fill="url(#eyeCyan)" stroke="#111113" stroke-width="1.7"/>
    <circle cx="42.5" cy="33.2" r="1.8" fill="#fff"/>
    <ellipse cx="32" cy="41.5" rx="3.6" ry="2.2" fill="#3a2a26"/>
    <ellipse cx="31.5" cy="40.8" rx="1.3" ry="0.6" fill="#8c7772"/>
    <path d="M25.6 46.8C28.2 50.1 30.2 50.1 32 46.8C33.8 50.1 35.8 50.1 38.4 46.8" fill="none" stroke="#111113" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`
}

async function renderWindowsTrayIcon(size) {
  return sharp(Buffer.from(createWindowsTraySvg(size)))
    .sharpen({ sigma: size === 16 ? 0.45 : 0.32 })
    .png()
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
