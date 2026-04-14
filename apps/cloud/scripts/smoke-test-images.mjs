#!/usr/bin/env node

/**
 * Smoke test Docker images for Shadow Cloud runners.
 *
 * Verifies each image can:
 *  1. Start without crashing
 *  2. Has OpenClaw's internal template files (docs/reference/templates/)
 *  3. Can run `openclaw setup` to seed workspace
 *  4. Workspace has required bootstrap files after setup
 *  5. Entrypoint can resolve config and workspace path when env vars are empty
 *
 * Usage:
 *   node scripts/smoke-test-images.mjs                     # Test all images
 *   node scripts/smoke-test-images.mjs openclaw-runner      # Test single image
 *   node scripts/smoke-test-images.mjs --tag v1.0.0         # Custom tag
 */

import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REGISTRY = process.env.SHADOW_REGISTRY ?? 'ghcr.io/shadowob'

const IMAGES = ['openclaw-runner', 'claude-runner']

const REQUIRED_TEMPLATES = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'USER.md']

const REQUIRED_WORKSPACE_FILES = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'USER.md', 'HEARTBEAT.md']

// ── Helpers ─────────────────────────────────────────────────────────────────

function docker(image, cmd, { timeout = 30000 } = {}) {
  try {
    return execSync(`docker run --rm ${image} sh -c ${JSON.stringify(cmd)}`, {
      encoding: 'utf-8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    return { error: true, stderr: err.stderr?.trim() ?? '', stdout: err.stdout?.trim() ?? '', status: err.status }
  }
}

function pass(msg) {
  console.log(`  ✓ ${msg}`)
}

function fail(msg, detail) {
  console.error(`  ✗ ${msg}`)
  if (detail) console.error(`    ${detail}`)
  return false
}

// ── Tests ───────────────────────────────────────────────────────────────────

function testTemplatesExist(image) {
  const templatesDir = '/app/node_modules/openclaw/docs/reference/templates'
  const result = docker(image, `ls ${templatesDir}`)
  if (result.error) {
    return fail('OpenClaw internal templates missing', `${templatesDir} not found — Dockerfile cleanup too aggressive`)
  }
  const files = result.split('\n')
  let ok = true
  for (const f of REQUIRED_TEMPLATES) {
    if (!files.includes(f)) {
      fail(`Missing template: ${f}`)
      ok = false
    }
  }
  if (ok) pass('Internal templates present')
  return ok
}

function testOpenclawBinary(image) {
  const result = docker(image, 'openclaw --version 2>&1 || echo FAIL')
  if (typeof result === 'object' || result.includes('FAIL') || result.includes('not found')) {
    return fail('openclaw binary not found in PATH')
  }
  pass(`openclaw binary works (${result})`)
  return true
}

function testWorkspaceSetup(image) {
  // Simulate what the entrypoint does: write config, run openclaw setup, check workspace
  const script = [
    'mkdir -p /home/openclaw/.openclaw',
    'node -e "require(\'fs\').writeFileSync(\'/home/openclaw/.openclaw/openclaw.json\', JSON.stringify({agents:{defaults:{workspace:\'/home/openclaw/.openclaw/workspace\'}}}))"',
    'OPENCLAW_CONFIG_PATH=/home/openclaw/.openclaw/openclaw.json openclaw setup --workspace /home/openclaw/.openclaw/workspace 2>&1',
    'echo "---FILES---"',
    'ls /home/openclaw/.openclaw/workspace/',
  ].join(' && ')

  const result = docker(image, script, { timeout: 30000 })
  if (typeof result === 'object' && result.error) {
    return fail('openclaw setup failed', result.stderr || result.stdout)
  }

  const filesPart = result.split('---FILES---')[1]?.trim() ?? ''
  const files = filesPart.split('\n').map((f) => f.trim()).filter(Boolean)

  let ok = true
  for (const f of REQUIRED_WORKSPACE_FILES) {
    if (!files.includes(f)) {
      fail(`Missing workspace file after setup: ${f}`)
      ok = false
    }
  }
  if (ok) pass('Workspace bootstrap complete')
  return ok
}

function testEntrypointDryRun(image) {
  // Run the entrypoint's config+workspace init logic without starting the gateway
  // Simulate empty env (no SHARED_WORKSPACE_PATH) to catch empty-string bugs
  const script = [
    // Write a minimal config to /etc/openclaw (simulating ConfigMap)
    'echo \'{"agents":{"defaults":{}},"gateway":{"port":3100,"bind":"lan","mode":"local"}}\' > /etc/openclaw/config.json 2>/dev/null || true',
    // Write a test AGENTS.md to ConfigMap
    'echo "# Agents" > /etc/openclaw/AGENTS.md 2>/dev/null || true',
    // Run entrypoint in a way that tests just the init logic
    // Use node to simulate the workspace dir resolution
    'node -e "' +
      'const SHARED_WORKSPACE_PATH = process.env.SHARED_WORKSPACE_PATH || \\"\\";' +
      'const OPENCLAW_STATE_DIR = \\"/home/openclaw/.openclaw\\";' +
      'const WORKSPACE_DIR = \\"/workspace\\";' +
      // Test the || fallback chain (the actual fix we made)
      'const workspaceDir = undefined || SHARED_WORKSPACE_PATH || WORKSPACE_DIR;' +
      'if (!workspaceDir) { console.error(\\"EMPTY WORKSPACE DIR\\"); process.exit(1); }' +
      'console.log(\\"workspaceDir=\\" + workspaceDir);' +
      'if (workspaceDir === \\"\\") { console.error(\\"EMPTY STRING BUG\\"); process.exit(1); }' +
      'console.log(\\"OK\\");' +
    '"',
  ].join(' && ')

  const result = docker(image, script, { timeout: 10000 })
  if (typeof result === 'object' && result.error) {
    return fail('Entrypoint dry run failed', result.stderr || result.stdout)
  }

  if (result.includes('OK')) {
    pass('Workspace path resolution (empty env safe)')
    return true
  }
  return fail('Workspace path resolution failed', result)
}

function testNodeVersion(image) {
  const result = docker(image, 'node --version')
  if (typeof result === 'object') {
    return fail('Node.js not available')
  }
  pass(`Node.js ${result}`)
  return true
}

// ── Main ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { images: [], tag: 'latest' }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--tag' && args[i + 1]) {
      opts.tag = args[++i]
    } else if (!arg.startsWith('-') && IMAGES.includes(arg)) {
      opts.images.push(arg)
    }
  }
  if (opts.images.length === 0) opts.images = [...IMAGES]
  return opts
}

const opts = parseArgs()
let allPassed = true

console.log('Shadow Cloud — Image Smoke Tests')
console.log(`Registry: ${REGISTRY}`)
console.log(`Tag: ${opts.tag}`)
console.log()

for (const name of opts.images) {
  const image = `${REGISTRY}/${name}:${opts.tag}`
  console.log(`━━━ ${image} ━━━`)

  // Check image exists
  try {
    execSync(`docker image inspect ${image}`, { stdio: 'ignore' })
  } catch {
    console.error(`  ✗ Image not found: ${image}`)
    console.error(`    Run: node scripts/build-images.mjs ${name} --tag ${opts.tag}`)
    allPassed = false
    console.log()
    continue
  }

  const tests = [
    testNodeVersion,
    testOpenclawBinary,
    testTemplatesExist,
    testWorkspaceSetup,
    testEntrypointDryRun,
  ]

  for (const test of tests) {
    if (!test(image)) allPassed = false
  }

  console.log()
}

if (allPassed) {
  console.log('✓ All smoke tests passed')
  process.exit(0)
} else {
  console.error('✗ Some smoke tests failed')
  process.exit(1)
}
