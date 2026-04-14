/**
 * Serve helper — starts and stops `shadowob-cloud serve` for E2E tests.
 *
 * The serve command exposes the same API the cloud-dashboard uses:
 *   GET /api/templates
 *   GET /api/templates/:name
 *   POST /api/deploy   (SSE)
 *   etc.
 *
 * Usage:
 *   const { origin, stop } = await startServe(4747)
 *   // ... make requests to origin ...
 *   await stop()
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const CLOUD_ROOT = join(__dir, '..', '..')
const CLI_BIN = join(CLOUD_ROOT, 'dist', 'index.js')

export interface ServeHandle {
  origin: string
  port: number
  stop: () => Promise<void>
}

/** Wait for the serve API to respond on the given port. */
async function waitForServe(port: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/templates`, {
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`shadowob-cloud serve did not become ready on port ${port} within ${timeoutMs}ms`)
}

/**
 * Starts `shadowob-cloud serve` on the given port and returns a handle.
 * Resolves once the /api/templates endpoint responds.
 */
export async function startServe(port = 4747): Promise<ServeHandle> {
  if (!existsSync(CLI_BIN)) {
    throw new Error(`CLI binary not found at ${CLI_BIN}. Run 'pnpm build' in apps/cloud first.`)
  }

  let proc: ChildProcess | null = null

  proc = spawn('node', [CLI_BIN, 'serve', '--port', String(port)], {
    cwd: CLOUD_ROOT,
    stdio: 'pipe',
    env: {
      ...process.env,
      // Disable K8s connectivity warnings in test output
      KUBECONFIG: process.env.KUBECONFIG ?? '',
    },
  })

  // Collect stderr for debugging if needed
  const stderr: string[] = []
  proc.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))

  // Kill on process exit
  const cleanup = () => proc?.kill('SIGTERM')
  process.on('exit', cleanup)

  await waitForServe(port)

  return {
    origin: `http://localhost:${port}`,
    port,
    stop: () =>
      new Promise((resolve) => {
        process.off('exit', cleanup)
        if (!proc || proc.exitCode !== null) {
          resolve()
          return
        }
        proc.once('close', () => resolve())
        proc.kill('SIGTERM')
      }),
  }
}
