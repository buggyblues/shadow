#!/usr/bin/env node

/**
 * Build Docker images for Shadow Cloud runners.
 *
 * Usage:
 *   node scripts/build-images.mjs                  # Build all images
 *   node scripts/build-images.mjs openclaw-runner   # Build single image
 *   node scripts/build-images.mjs --push            # Build and push
 *   node scripts/build-images.mjs --tag v1.0.0      # Custom tag
 *   node scripts/build-images.mjs --kind-load        # Build, smoke, and load into kind
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const WORKSPACE_ROOT = join(ROOT, '..', '..')
const IMAGES_DIR = join(ROOT, 'images')
const REGISTRY = process.env.SHADOWOB_REGISTRY ?? 'ghcr.io/buggyblues'
const DEFAULT_TAG = process.env.SHADOWOB_RUNNER_IMAGE_TAG?.trim() || '20260604-faststart'

const IMAGES = [
  'openclaw-runner',
  'claude-runner',
  'codex-runner',
  'opencode-runner',
  'hermes-runner',
]

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    images: [],
    push: false,
    tag: DEFAULT_TAG,
    platform: '',
    noCache: false,
    skipSmoke: false,
    kindLoad: false,
    kindCluster: '',
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
    } else if (arg === '--skip-smoke') {
      opts.skipSmoke = true
    } else if (arg === '--kind-load') {
      opts.kindLoad = true
      if (args[i + 1] && !args[i + 1].startsWith('-') && !IMAGES.includes(args[i + 1])) {
        opts.kindCluster = args[++i]
      }
    } else if (!arg.startsWith('-') && IMAGES.includes(arg)) {
      opts.images.push(arg)
    }
  }

  if (opts.images.length === 0) {
    opts.images = [...IMAGES]
  }

  return opts
}

function runSmokeTest(name, opts) {
  console.log(`\n━━━ Smoke testing ${name}:${opts.tag} ━━━`)
  try {
    execSync(`node ${join(__dirname, 'smoke-test-images.mjs')} ${name} --tag ${opts.tag}`, {
      stdio: 'inherit',
      env: process.env,
    })
  } catch {
    console.error('\n✗ Smoke tests failed — do NOT deploy this image')
    process.exit(1)
  }
}

function loadKindImage(image, opts) {
  if (!opts.kindLoad) return

  const clusterArg = opts.kindCluster ? ` --name ${opts.kindCluster}` : ''
  console.log(
    `\n━━━ Loading ${image} into kind${opts.kindCluster ? ` (${opts.kindCluster})` : ''} ━━━`,
  )
  try {
    execSync(`kind load docker-image${clusterArg} ${image}`, { stdio: 'inherit' })
    console.log(`✓ Loaded ${image} into kind`)
  } catch {
    console.error(`✗ Failed to load ${image} into kind`)
    process.exit(1)
  }
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

  const buildContext = WORKSPACE_ROOT
  const buildArgs = opts.push
    ? ['docker', 'build', '-t', fullTag, '-f', dockerfilePath]
    : ['docker', 'buildx', 'build', '--load', '-t', fullTag, '-f', dockerfilePath]

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

  if (!opts.skipSmoke) {
    runSmokeTest(name, opts)
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
  } else {
    loadKindImage(fullTag, opts)
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const opts = parseArgs()

console.log('Shadow Cloud — Image Builder')
console.log(`Registry: ${REGISTRY}`)
console.log(`Tag: ${opts.tag}`)
console.log(`Images: ${opts.images.join(', ')}`)
console.log(`Push: ${opts.push}`)
console.log(`Smoke: ${opts.skipSmoke ? 'false' : 'true'}`)
console.log(`Kind load: ${opts.kindLoad ? opts.kindCluster || 'default cluster' : 'false'}`)

for (const image of opts.images) {
  buildImage(image, opts)
}

console.log('\n✓ All images built successfully')
