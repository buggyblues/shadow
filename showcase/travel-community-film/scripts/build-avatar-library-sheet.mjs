import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { Client } = require('minio')
const sharp = require('sharp')

const outputPath = resolve(import.meta.dirname, '../assets/avatar-library-sheet.jpg')
const columns = 10
const tileSize = 112
const labelHeight = 24
const limit = 260

const client = new Client({
  endPoint: '127.0.0.1',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
})

const keys = []
const objects = client.listObjectsV2('shadow', 'avatars/', true)
for await (const entry of objects) {
  if (
    entry.name &&
    !entry.name.includes('/variants/') &&
    /\.(?:png|jpe?g|webp)$/i.test(entry.name)
  ) {
    keys.push(entry.name)
    if (keys.length >= limit) break
  }
}

const rows = Math.ceil(keys.length / columns)
const sheet = sharp({
  create: {
    width: columns * tileSize,
    height: rows * (tileSize + labelHeight),
    channels: 3,
    background: '#f3f3f3',
  },
})

const composites = []
for (const [index, key] of keys.entries()) {
  const stream = await client.getObject('shadow', key)
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)

  const x = (index % columns) * tileSize
  const y = Math.floor(index / columns) * (tileSize + labelHeight)
  const label = key.split('/').at(-1)?.slice(0, 8) ?? String(index)
  const image = await sharp(Buffer.concat(chunks))
    .resize(tileSize, tileSize, { fit: 'cover' })
    .jpeg({ quality: 82 })
    .toBuffer()
  const labelImage = await sharp({
    text: {
      text: `<span foreground="#222">${label}</span>`,
      width: tileSize,
      height: labelHeight,
      align: 'center',
      rgba: true,
    },
  })
    .png()
    .toBuffer()

  composites.push({ input: image, left: x, top: y })
  composites.push({ input: labelImage, left: x, top: y + tileSize })
}

await sheet.composite(composites).jpeg({ quality: 88 }).toFile(outputPath)
console.log(`${outputPath}\n${keys.length} avatars`)
