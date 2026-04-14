/**
 * Playwright Global Teardown — kills services started by global-setup.ts.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { procs } from './global-setup.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const STATE_FILE = join(__dir, '..', '.playwright-pids.json')

export default async function globalTeardown() {
  // Kill processes started in this session
  for (const proc of procs) {
    try {
      proc.kill('SIGTERM')
    } catch {
      // already dead
    }
  }

  // Also kill by PID from state file (in case the procs array is empty)
  if (existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as {
        pids: number[]
        manifestsOutputDir?: string
      }
      for (const pid of state.pids ?? []) {
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          // already dead
        }
      }
      // Clean up manifest output dir
      if (state.manifestsOutputDir) {
        rmSync(state.manifestsOutputDir, { recursive: true, force: true })
      }
    } catch {
      // ignore parse errors
    }
    rmSync(STATE_FILE, { force: true })
  }

  console.log('[e2e:teardown] Services stopped ✓')
}
