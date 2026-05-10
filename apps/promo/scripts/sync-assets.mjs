#!/usr/bin/env node

import { copyFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

const promoRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(promoRoot, '../..')

async function exists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function copyIfExists(source, target) {
  if (!(await exists(source))) {
    console.warn(`Missing source asset: ${path.relative(repoRoot, source)}`)
    return
  }

  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
  console.log(`Copied ${path.relative(repoRoot, source)} -> ${path.relative(promoRoot, target)}`)
}

await copyIfExists(
  path.join(repoRoot, 'apps/web/public/Logo.svg'),
  path.join(promoRoot, 'public/brand/Logo.svg'),
)

const productSources = [
  ['website/docs/public/readme/hero-en.png', 'hero-en.png'],
  ['website/docs/public/readme/hero-zh.png', 'hero-zh.png'],
  ['website/docs/public/screenshots/04-team-general-channel.png', 'channel.png'],
  ['website/docs/public/screenshots/08-buddy-marketplace.png', 'buddy-marketplace.png'],
]

for (const [source, target] of productSources) {
  await copyIfExists(path.join(repoRoot, source), path.join(promoRoot, 'public/product', target))
}
