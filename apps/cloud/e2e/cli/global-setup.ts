/**
 * E2E Global Setup — runs once before all E2E tests.
 *
 * Responsibilities:
 * 1. Build the shadowob-cloud CLI if dist/ doesn't exist
 * 2. Build the openclaw-runner Docker image (real production image, not a stub)
 * 3. Start Shadow server via docker-compose if not already running
 * 4. Wait for server to be healthy
 * 5. Seed the Shadow environment (idempotent)
 * 6. Write session credentials to .shadowob/e2e-session.json for tests to read
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

// Path anchors
const CLOUD_ROOT = resolve(__dir, '..', '..') // apps/cloud
const WORKSPACE_ROOT = resolve(CLOUD_ROOT, '..', '..') // monorepo root (shadow/)
const CLI_BIN = join(CLOUD_ROOT, 'dist', 'index.js')
const COMPOSE_FILE = join(WORKSPACE_ROOT, 'docker-compose.yml')
const SEED_SCRIPT = join(WORKSPACE_ROOT, 'scripts', 'e2e', 'seed-screenshot-env.mjs')
const IMAGES_DIR = join(CLOUD_ROOT, 'images')
const SESSION_FILE = join(CLOUD_ROOT, '.shadowob', 'e2e-session.json')
const SESSION_DIR = join(CLOUD_ROOT, '.shadowob')

// Docker-compose project name — isolated from dev environment
const COMPOSE_PROJECT = 'shadowob-cloud-e2e'

// Shadow server URL: direct API access (no web frontend needed)
export const E2E_ORIGIN = 'http://localhost:3002'

// Marker: did THIS setup start docker-compose?
let compositeStartedHere = false

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isServerRunning(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/api/servers/discover`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.status < 500
  } catch {
    return false
  }
}

async function waitForServer(origin: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const lastError = ''

  while (Date.now() < deadline) {
    if (await isServerRunning(origin)) {
      console.log('[setup] Shadow server is ready ✓')
      return
    }
    await new Promise((r) => setTimeout(r, 3000))
  }

  throw new Error(`Shadow server at ${origin} not ready after ${timeoutMs}ms. Last: ${lastError}`)
}

function run(cmd: string, cwd = WORKSPACE_ROOT): void {
  execSync(cmd, { cwd, stdio: 'inherit' })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function globalSetup() {
  console.log('\n═══════════════════════════════════')
  console.log('  E2E Global Setup')
  console.log('═══════════════════════════════════')

  // ── 1. Build CLI ────────────────────────────────────────────────────────────
  if (!existsSync(CLI_BIN)) {
    console.log('\n[setup] Building shadowob-cloud CLI...')
    run('pnpm build', CLOUD_ROOT)
    console.log('[setup] CLI built ✓')
  } else {
    console.log('[setup] CLI already built ✓')
  }

  // ── 2. Build openclaw-runner Docker image ───────────────────────────────────
  //
  // This is the REAL production image used in deployment:
  //   - Installs openclaw from npm
  //   - Installs @shadowob/openclaw-shadowob plugin
  //   - Runs the real entrypoint.mjs that starts the OpenClaw gateway
  //
  const E2E_IMAGE_TAG = process.env.E2E_IMAGE_TAG ?? 'e2e-test'
  const openclawRunnerDir = join(IMAGES_DIR, 'openclaw-runner')
  const openclawRunnerTag = `shadowob/openclaw-runner:${E2E_IMAGE_TAG}`

  if (!existsSync(join(openclawRunnerDir, 'Dockerfile'))) {
    throw new Error(`Dockerfile not found: ${openclawRunnerDir}/Dockerfile`)
  }

  const imageExists =
    spawnSync('docker', ['image', 'inspect', openclawRunnerTag, '--format', '{{.Id}}'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).status === 0

  if (!imageExists || process.env.E2E_BUILD_IMAGE === '1') {
    console.log(`[setup] Building openclaw-runner image (${openclawRunnerTag})...`)
    console.log(
      '[setup] This installs openclaw + @shadowob/openclaw-shadowob from npm — may take a few minutes',
    )
    run(
      `docker build -t ${openclawRunnerTag} -f ${join(openclawRunnerDir, 'Dockerfile')} ${openclawRunnerDir}`,
      WORKSPACE_ROOT,
    )
    console.log('[setup] openclaw-runner image built ✓')
  } else {
    console.log(`[setup] openclaw-runner image already available: ${openclawRunnerTag} ✓`)
  }

  // ── 3. Start Shadow server if not running ───────────────────────────────────
  const alreadyRunning = await isServerRunning(E2E_ORIGIN)
  if (alreadyRunning) {
    console.log('[setup] Shadow server already running at', E2E_ORIGIN, '✓')
  } else {
    console.log('[setup] Starting Shadow server via docker-compose...')
    console.log('[setup]   project:', COMPOSE_PROJECT)
    console.log('[setup]   compose:', COMPOSE_FILE)

    const buildFlag = process.env.E2E_BUILD_SERVER === '1' ? ' --build' : ''
    run(
      `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} up -d${buildFlag} postgres redis minio server`,
    )
    compositeStartedHere = true

    // ── 4. Wait for server to be ready ─────────────────────────────────────
    console.log('[setup] Waiting for Shadow server to be ready (up to 3 min)...')
    await waitForServer(E2E_ORIGIN, 180_000)
  }

  // ── 5. Seed Shadow environment ──────────────────────────────────────────────
  console.log('[setup] Seeding Shadow environment...')
  mkdirSync(SESSION_DIR, { recursive: true })

  const seedSessionPath = join(SESSION_DIR, 'seed-raw.json')
  const seedResult = spawnSync('node', [SEED_SCRIPT], {
    env: {
      ...process.env,
      E2E_ORIGIN,
      E2E_SESSION_PATH: seedSessionPath,
    },
    timeout: 180_000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  if (seedResult.status !== 0) {
    const stderr = seedResult.stderr || ''
    const stdout = seedResult.stdout || ''
    throw new Error(`E2E seed script failed (exit ${seedResult.status}):\n${stderr || stdout}`)
  }
  console.log('[setup] Shadow environment seeded ✓')

  // ── 6. Login and persist session ────────────────────────────────────────────
  const loginRes = await fetch(`${E2E_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner.e2e@shadowob.local',
      password: 'ShadowE2E123!',
    }),
  })

  if (!loginRes.ok) {
    const text = await loginRes.text()
    throw new Error(`E2E login failed: ${loginRes.status} ${text}`)
  }

  const { accessToken } = (await loginRes.json()) as { accessToken: string }

  writeFileSync(
    SESSION_FILE,
    `${JSON.stringify(
      {
        accessToken,
        origin: E2E_ORIGIN,
        startedCompose: compositeStartedHere,
        owner: {
          email: 'owner.e2e@shadowob.local',
          password: 'ShadowE2E123!',
          displayName: 'Ava Owner',
        },
      },
      null,
      2,
    )}\n`,
    'utf-8',
  )

  console.log('[setup] Session saved to', SESSION_FILE)
  console.log('\n[setup] ✓ E2E environment ready\n')
}
