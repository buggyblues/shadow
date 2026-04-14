/**
 * E2E Global Teardown — runs once after all E2E tests.
 *
 * If docker-compose was started by the setup, this stops it.
 * K8s namespace cleanup is done by the `down` test itself.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

const CLOUD_ROOT = resolve(__dir, '..', '..')
const WORKSPACE_ROOT = resolve(CLOUD_ROOT, '..', '..')
const COMPOSE_FILE = join(WORKSPACE_ROOT, 'docker-compose.yml')
const SESSION_FILE = join(CLOUD_ROOT, '.shadowob', 'e2e-session.json')
const COMPOSE_PROJECT = 'shadowob-cloud-e2e'

export default async function globalTeardown() {
  // Read session to check if we started docker-compose
  let startedCompose = false
  if (existsSync(SESSION_FILE)) {
    try {
      const session = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'))
      startedCompose = Boolean(session.startedCompose)
    } catch {}
  }

  // Only stop if we started it, and cleanup is not disabled
  if (startedCompose && process.env.E2E_NO_CLEANUP !== '1') {
    console.log('\n[teardown] Stopping docker-compose services (shadowob-cloud-e2e)...')
    try {
      execSync(`docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} down -v`, {
        cwd: WORKSPACE_ROOT,
        stdio: 'inherit',
      })
      console.log('[teardown] docker-compose stopped ✓')
    } catch (err) {
      console.warn('[teardown] Failed to stop services:', (err as Error).message)
    }
  }
}
