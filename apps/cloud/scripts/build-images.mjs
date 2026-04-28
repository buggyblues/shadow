#!/usr/bin/env node

/**
 * Build Docker images for Shadow Cloud runners.
 *
 * Usage:
 *   node scripts/build-images.mjs                  # Build all images
 *   node scripts/build-images.mjs openclaw-runner   # Build single image
 *   node scripts/build-images.mjs --push            # Build and push
 *   node scripts/build-images.mjs --tag v1.0.0      # Custom tag
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const WORKSPACE_ROOT = join(ROOT, '..', '..')
const IMAGES_DIR = join(ROOT, 'images')
const REGISTRY = process.env.SHADOWOB_REGISTRY ?? process.env.SHADOW_REGISTRY ?? 'ghcr.io/buggyblues'

const IMAGES = ['openclaw-runner', 'claude-runner']

function prepareBuildContext(name) {
  if (name !== 'openclaw-runner') return

  const localShadowobPlugin = join(WORKSPACE_ROOT, 'packages', 'openclaw-shadowob', 'package.json')
  if (!existsSync(localShadowobPlugin)) return

  console.log('Building local @shadowob/openclaw-shadowob package for runner image...')
  execSync('pnpm --filter @shadowob/openclaw-shadowob build', {
    cwd: WORKSPACE_ROOT,
    stdio: 'inherit',
  })
}

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    images: [],
    push: false,
    tag: 'latest',
    platform: '',
    noCache: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--push') {
      opts.push = true
    } else if (arg === '--tag' && args[i + 1]) {
      opts.tag = args[++i]
    } else if (arg === '--platform' && args[i + 1]) {
      opts.platform = args[++i]
    } else if (arg === '--no-cache') {
      opts.noCache = true
    } else if (!arg.startsWith('-') && IMAGES.includes(arg)) {
      opts.images.push(arg)
    }
  }

  if (opts.images.length === 0) {
    opts.images = [...IMAGES]
  }

  return opts
}

function buildImage(name, opts) {
  const imageDir = join(IMAGES_DIR, name)
  const dockerfilePath = join(imageDir, 'Dockerfile')
  if (!existsSync(imageDir)) {
    console.error(`Image directory not found: ${imageDir}`)
    process.exit(1)
  }

  const fullTag = `${REGISTRY}/${name}:${opts.tag}`
  const latestTag = `${REGISTRY}/${name}:latest`

  console.log(`\n━━━ Building ${fullTag} ━━━`)

  prepareBuildContext(name)

  const buildContext = name === 'openclaw-runner' ? WORKSPACE_ROOT : imageDir
  const buildArgs = ['docker', 'build', '-t', fullTag, '-f', dockerfilePath]

  if (opts.tag !== 'latest') {
    buildArgs.push('-t', latestTag)
  }

  if (opts.platform) {
    buildArgs.push('--platform', opts.platform)
  }

  if (opts.noCache) {
    buildArgs.push('--no-cache')
  }

  buildArgs.push(buildContext)

  try {
    execSync(buildArgs.join(' '), {
      cwd: WORKSPACE_ROOT,
      stdio: 'inherit',
    })
    console.log(`✓ Built ${fullTag}`)
  } catch {
    console.error(`✗ Failed to build ${name}`)
    process.exit(1)
  }

  if (opts.push) {
    console.log(`Pushing ${fullTag}...`)
    try {
      execSync(`docker push ${fullTag}`, { stdio: 'inherit' })
      if (opts.tag !== 'latest') {
        execSync(`docker push ${latestTag}`, { stdio: 'inherit' })
      }
      console.log(`✓ Pushed ${fullTag}`)
    } catch {
      console.error(`✗ Failed to push ${name}`)
      process.exit(1)
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const opts = parseArgs()

console.log('Shadow Cloud — Image Builder')
console.log(`Registry: ${REGISTRY}`)
console.log(`Tag: ${opts.tag}`)
console.log(`Images: ${opts.images.join(', ')}`)
console.log(`Push: ${opts.push}`)

for (const image of opts.images) {
  buildImage(image, opts)
}

console.log('\n✓ All images built successfully')

// Run smoke tests automatically after build (unless pushing, to save time on CI)
if (!opts.push) {
  console.log('\n━━━ Running smoke tests ━━━')
  try {
    execSync(
      `node ${join(__dirname, 'smoke-test-images.mjs')} ${opts.images.join(' ')} --tag ${opts.tag}`,
      { stdio: 'inherit' },
    )
  } catch {
    console.error('\n✗ Smoke tests failed — do NOT deploy this image')
    process.exit(1)
  }
}
