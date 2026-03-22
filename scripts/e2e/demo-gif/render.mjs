#!/usr/bin/env node

/**
 * Shadow Demo GIF — Entry Point
 *
 * Thin orchestrator that wires the generic engine with Shadow-specific
 * theme and scene definitions. Run from repo root:
 *
 *   node scripts/e2e/demo-gif/render.mjs
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderGif } from './engine/index.mjs'
import { shadowTheme } from './theme.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const showcaseDir = path.resolve(repoRoot, 'docs/readme/showcase')
const demoFramesDir = path.resolve(showcaseDir, 'demo-frames')

const desktopPkg = path.resolve(repoRoot, 'apps/desktop/package.json')
const require = createRequire(desktopPkg)
const sharp = require('sharp')

const { config, scenesFor } = await import('./scenes.mjs')

renderGif({
  sharp,
  config,
  scenesFor,
  locales: ['en', 'zh'],
  theme: shadowTheme,
  paths: {
    framesDir: demoFramesDir,
    showcaseDir,
  },
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
