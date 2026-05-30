#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const sourceDir = resolve(root, 'assets/pet/source')
const outDir = resolve(root, 'assets/pet/animations')
const tmpDir = resolve(root, 'assets/pet/tmp')
const keyColor = '#ff00ff'
const frameCount = 6
const helper = resolve(
  process.env.CODEX_HOME || resolve(process.env.HOME || '', '.codex'),
  'skills/.system/imagegen/scripts/remove_chroma_key.py',
)
const pythonBin = process.env.PYTHON || 'python3'

const actions = [
  { key: 'idle', loop: true, fps: 8 },
  { key: 'pet', loop: false, fps: 10 },
  { key: 'feed', loop: false, fps: 10 },
  { key: 'play', loop: false, fps: 11 },
  { key: 'rest', loop: true, fps: 7 },
  { key: 'explore', loop: false, fps: 10 },
  { key: 'tea', loop: false, fps: 10 },
  { key: 'sick', loop: true, fps: 7 },
  { key: 'level-up', loop: false, fps: 11 },
]

if (!existsSync(helper)) {
  throw new Error(`Chroma-key helper not found: ${helper}`)
}

rmSync(outDir, { recursive: true, force: true })
rmSync(tmpDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
mkdirSync(tmpDir, { recursive: true })

const manifest = {
  schemaVersion: 1,
  keyColor,
  frameCount,
  actions: {},
}

for (const action of actions) {
  const input = resolve(sourceDir, `${action.key}-sheet-chroma.png`)
  if (!existsSync(input)) {
    throw new Error(`Missing sprite sheet for ${action.key}: ${input}`)
  }

  const actionOutDir = resolve(outDir, action.key)
  mkdirSync(actionOutDir, { recursive: true })
  const metadata = await sharp(input).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read sprite sheet dimensions for ${action.key}`)
  }

  const frames = []
  for (let index = 0; index < frameCount; index += 1) {
    const leftEdge = Math.round((metadata.width * index) / frameCount)
    const rightEdge = Math.round((metadata.width * (index + 1)) / frameCount)
    const inset = 6
    const extract = {
      left: leftEdge + inset,
      top: inset,
      width: Math.max(1, rightEdge - leftEdge - inset * 2),
      height: Math.max(1, metadata.height - inset * 2),
    }
    const rawCell = resolve(tmpDir, `${action.key}-${String(index).padStart(2, '0')}.png`)
    const out = resolve(actionOutDir, `${String(index).padStart(2, '0')}.png`)
    await sharp(input).extract(extract).png().toFile(rawCell)
    execFileSync(
      pythonBin,
      [
        helper,
        '--input',
        rawCell,
        '--out',
        out,
        '--key-color',
        keyColor,
        '--soft-matte',
        '--transparent-threshold',
        '12',
        '--opaque-threshold',
        '190',
        '--despill',
        '--force',
      ],
      { stdio: 'inherit' },
    )
    frames.push(`animations/${action.key}/${String(index).padStart(2, '0')}.png`)
  }

  manifest.actions[action.key] = {
    loop: action.loop,
    fps: action.fps,
    frames,
  }
}

writeFileSync(resolve(root, 'assets/pet/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
rmSync(tmpDir, { recursive: true, force: true })
console.log(`Processed ${actions.length} pet animations into ${outDir}`)
