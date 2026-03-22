#!/usr/bin/env node

/**
 * Orchestrate the full demo GIF pipeline:
 *
 *   1. Run the demo-flow Playwright spec (captures key frames)
 *   2. Run the GIF renderer (annotates frames + assembles animated GIF)
 *
 * Usage:
 *   pnpm e2e:demo-gif
 *
 * Prerequisites:
 *   - E2E session seeded (pnpm e2e:screenshots:seed)
 *   - App running locally (pnpm dev or docker compose up)
 *   - Playwright browsers installed
 *   - ffmpeg installed (brew install ffmpeg)
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const desktopDir = path.resolve(repoRoot, 'apps/desktop')

function run(label, command, cwd) {
  console.log(`\n── ${label} ──\n`)
  try {
    execSync(command, { stdio: 'inherit', cwd })
  } catch {
    console.error(`\n✗ ${label} failed.`)
    process.exit(1)
  }
}

// Step 1: Capture demo-flow frames via Playwright
run(
  'Capturing demo flow frames',
  'npx playwright test -c playwright.demo.config.ts',
  desktopDir,
)

// Step 2: Annotate + assemble GIF
run(
  'Rendering annotated GIF',
  `node ${path.resolve(__dirname, 'render.mjs')}`,
  repoRoot,
)

console.log('\n✓ Demo GIF pipeline complete.\n')
