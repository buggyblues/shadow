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
const traySvg = readFileSync(join(assetsDir, 'trayTemplate.svg'))

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
  // 1024x1024 master PNG
  await sharp(iconSvg).resize(1024, 1024).png().toFile(join(assetsDir, 'icon.png'))
  console.log('✓ icon.png (1024x1024)')

  // macOS .iconset → .icns
  if (process.platform === 'darwin') {
    const iconsetDir = join(assetsDir, 'icon.iconset')
    mkdirSync(iconsetDir, { recursive: true })

    for (const [name, size] of ICONSET_ENTRIES) {
      await sharp(iconSvg).resize(size, size).png().toFile(join(iconsetDir, name))
    }

    execSync(`iconutil -c icns -o "${join(assetsDir, 'icon.icns')}" "${iconsetDir}"`)
    rmSync(iconsetDir, { recursive: true })
    console.log('✓ icon.icns (macOS)')
  }

  // Windows .ico (multi-resolution PNG container)
  const icoSizes = [16, 32, 48, 256]
  const pngBuffers = await Promise.all(
    icoSizes.map((s) => sharp(iconSvg).resize(s, s).png().toBuffer()),
  )
  writeFileSync(join(assetsDir, 'icon.ico'), buildIco(pngBuffers, icoSizes))
  console.log('✓ icon.ico (Windows)')
}

async function generateTrayIcons() {
  // macOS tray: 16x16 @1x, 32x32 @2x (template image)
  await sharp(traySvg).resize(16, 16).png().toFile(join(assetsDir, 'trayTemplate.png'))
  await sharp(traySvg).resize(32, 32).png().toFile(join(assetsDir, 'trayTemplate@2x.png'))
  console.log('✓ trayTemplate.png + @2x (macOS menu bar)')

  // Windows tray: 16x16 colored icon from main icon
  await sharp(iconSvg).resize(16, 16).png().toFile(join(assetsDir, 'tray.png'))
  console.log('✓ tray.png (Windows taskbar)')
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
