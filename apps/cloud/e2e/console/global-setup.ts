/**
 * Playwright Global Setup — starts the cloud serve process before all E2E tests.
 *
 * Responsibilities:
 * 1. Build the cloud CLI + console if not already built
 * 2. Start `shadowob-cloud serve` on SERVE_PORT (API + SPA)
 *    - Sets XCLOUD_OUTPUT_DIR so deploy calls run `generate manifests`
 *      instead of `up` (no Kubernetes required for E2E)
 * 3. Wait for the server to be healthy
 * 4. Write process IDs + manifest output dir to a temp file for teardown
 */

import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SERVE_PORT } from '../../playwright.config.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const CLOUD_ROOT = join(__dir, '..')
const CLI_BIN = join(CLOUD_ROOT, 'dist', 'index.js')
const CONSOLE_DIST = join(CLOUD_ROOT, 'dist', 'console')
const STATE_FILE = join(CLOUD_ROOT, '.playwright-pids.json')

const procs: ChildProcess[] = []

async function waitForPort(port: number, path = '/', timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}${path}`, {
        signal: AbortSignal.timeout(1000),
      })
      if (res.status < 500) return
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Port ${port} did not become ready within ${timeoutMs}ms`)
}

export default async function globalSetup() {
  console.log('[e2e:setup] Checking build artifacts...')

  // 1. Build CLI + console if needed
  if (!existsSync(CLI_BIN) || !existsSync(join(CONSOLE_DIST, 'index.html'))) {
    console.log('[e2e:setup] Building cloud CLI + console...')
    execSync('pnpm build', { cwd: CLOUD_ROOT, stdio: 'inherit' })
  }

  // 2. Start serve (API + SPA on same port)
  const manifestsOutputDir = mkdtempSync(join(tmpdir(), 'xcloud-e2e-manifests-'))
  console.log(`[e2e:setup] Manifests output dir: ${manifestsOutputDir}`)
  console.log(`[e2e:setup] Starting serve on :${SERVE_PORT}...`)

  // Stub env vars so `generate manifests` can resolve all ${env:VAR} placeholders
  const STUB_API_KEYS: NodeJS.ProcessEnv = {
    ANTHROPIC_API_KEY: 'e2e-stub-anthropic',
    OPENAI_API_KEY: 'e2e-stub-openai',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? 'e2e-stub-deepseek',
    STRIPE_SECRET_KEY: 'e2e-stub-stripe',
    GA4_PROPERTY_ID: 'e2e-stub-ga4',
    GOOGLE_CREDENTIALS_B64: 'e2e-stub-gcreds',
    GSC_SITE_URL: 'https://example.com',
    NOTION_TOKEN: 'e2e-stub-notion',
    NOTION_CONTENT_DB_ID: 'e2e-stub',
    NOTION_SOCIAL_DB_ID: 'e2e-stub',
    NOTION_DIGEST_DB_ID: 'e2e-stub',
    NOTION_RESEARCH_DB_ID: 'e2e-stub',
    NOTION_COMPETITOR_DB_ID: 'e2e-stub',
    NOTION_BUGS_DB_ID: 'e2e-stub',
    NOTION_TICKETS_DB_ID: 'e2e-stub',
    SLACK_BOT_TOKEN: 'e2e-stub-slack-bot',
    SLACK_APP_TOKEN: 'e2e-stub-slack-app',
    TELEGRAM_BOT_TOKEN: 'e2e-stub-telegram',
    GITHUB_TOKEN: 'e2e-stub-github',
    GITHUB_REPO: 'e2e-org/e2e-repo',
    DATABASE_URL: 'postgres://localhost/e2e',
    KUBECONFIG_B64: 'e2e-stub-kubeconfig',
    MIXPANEL_PROJECT_ID: 'e2e-stub',
    MIXPANEL_SECRET: 'e2e-stub',
    MIXPANEL_USERNAME: 'e2e-stub',
    COMPETITOR_URLS: 'https://competitor.example.com',
    VAR: 'e2e-stub',
  }

  const serveProc = spawn('node', [CLI_BIN, 'serve', '--port', String(SERVE_PORT)], {
    cwd: CLOUD_ROOT,
    stdio: 'pipe',
    env: {
      ...process.env,
      ...STUB_API_KEYS,
      XCLOUD_OUTPUT_DIR: manifestsOutputDir,
      KUBECONFIG: process.env.KUBECONFIG ?? '',
    },
  })
  procs.push(serveProc)

  // Log server output for debugging
  serveProc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[serve] ${d}`))
  serveProc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[serve:err] ${d}`))

  // 3. Wait for server to be healthy
  await waitForPort(SERVE_PORT, '/api/health')

  // 4. Persist PIDs + manifest dir for teardown
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ pids: procs.map((p) => p.pid), manifestsOutputDir }),
    'utf-8',
  )

  console.log('[e2e:setup] Server ready ✓')
}

export { procs }
