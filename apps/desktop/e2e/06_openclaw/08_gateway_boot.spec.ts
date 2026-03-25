/**
 * OpenClaw Gateway Boot E2E Test
 *
 * Verifies the built-in OpenClaw gateway starts cleanly:
 *   1. Launch Electron app
 *   2. Start the gateway via IPC
 *   3. Collect gateway logs
 *   4. Assert the gateway reaches "running" state without fatal errors
 *
 * This test catches bundling issues (e.g. missing/broken node_modules)
 * that manifest as "Gateway process exited with code 1".
 */

import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  // Wait for renderer to settle
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  try {
    await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.stopGateway()
      } catch {}
    })
  } catch {}
  await page?.close().catch(() => {})
  await app?.close().catch(() => {})
})

test.describe('Gateway Boot Smoke Test', () => {
  test('gateway starts without fatal errors and reaches running state', async () => {
    test.setTimeout(90_000)

    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw

      // Ensure gateway is stopped before we begin
      try {
        await oc.stopGateway()
      } catch {}

      // Wait a moment for cleanup
      await new Promise((r) => setTimeout(r, 1000))

      // Collect logs and status transitions
      const logs: string[] = []
      const states: string[] = []

      const unsubLog = oc.onGatewayLog((entry: { message: string; level?: string }) => {
        const msg = typeof entry === 'string' ? entry : (entry?.message ?? JSON.stringify(entry))
        logs.push(msg)
      })

      const unsubStatus = oc.onGatewayStatusChanged((status: { state: string }) => {
        states.push(status.state)
      })

      // Start the gateway
      try {
        await Promise.race([
          oc.startGateway(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Start timed out after 60s')), 60_000),
          ),
        ])
      } catch (err: any) {
        logs.push(`[start-error] ${err.message}`)
      }

      // Give it time to bootstrap and emit logs
      await new Promise((r) => setTimeout(r, 10_000))

      // Grab final status
      let finalStatus: any
      try {
        finalStatus = await oc.getGatewayStatus()
      } catch (err: any) {
        finalStatus = { state: 'unknown', error: err.message }
      }

      unsubLog()
      unsubStatus()

      return {
        states,
        finalState: finalStatus.state,
        finalError: finalStatus.error ?? null,
        pid: finalStatus.pid ?? null,
        // Return last 50 log lines to keep payload reasonable
        logs: logs.slice(-50),
      }
    })

    // ── Assertions ────────────────────────────────────────────────────────

    // 1. No fatal CLI startup errors in logs
    const fatalPatterns = [
      'Failed to start CLI',
      'is not a constructor',
      'Cannot find module',
      'MODULE_NOT_FOUND',
      'SyntaxError',
      'TypeError:',
      'ReferenceError:',
      'exited with code 1',
      'channel startup failed',
      'Cannot read properties of undefined',
      'Cannot read properties of null',
      'refresh failed',
    ]

    const fatalLogs = result.logs.filter((log: string) =>
      fatalPatterns.some((pattern) => log.includes(pattern)),
    )

    if (fatalLogs.length > 0) {
      console.error('\n🔴 Fatal gateway logs detected:')
      for (const log of fatalLogs) {
        console.error(`  ${log}`)
      }
    }

    expect(fatalLogs, `Fatal errors in gateway logs:\n${fatalLogs.join('\n')}`).toHaveLength(0)

    // 2. Gateway should have progressed beyond 'offline'
    const progressStates = ['starting', 'bootstrapping', 'running']
    const madeProgress =
      result.states.some((s: string) => progressStates.includes(s)) ||
      progressStates.includes(result.finalState)

    if (!madeProgress) {
      console.error('\n🔴 Gateway never progressed beyond offline')
      console.error(`  State transitions: ${JSON.stringify(result.states)}`)
      console.error(`  Final state: ${result.finalState}`)
      console.error(`  Last logs:\n${result.logs.slice(-10).join('\n')}`)
    }

    expect(
      madeProgress,
      `Gateway stuck — states: ${JSON.stringify(result.states)}, final: ${result.finalState}`,
    ).toBe(true)

    // 3. Ideally the gateway should be running or bootstrapping
    const healthyStates = ['running', 'bootstrapping']
    const isHealthy = healthyStates.includes(result.finalState)

    if (!isHealthy) {
      console.warn(`\n⚠️  Gateway final state is '${result.finalState}', expected 'running'`)
      console.warn(`  States: ${JSON.stringify(result.states)}`)
      console.warn(`  Last logs:\n${result.logs.slice(-15).join('\n')}`)
    }

    expect(
      isHealthy,
      `Gateway final state: '${result.finalState}', expected one of ${healthyStates.join('/')}`,
    ).toBe(true)

    // 4. If running, should have a PID
    if (result.finalState === 'running') {
      expect(result.pid).toBeGreaterThan(0)
    }

    console.log(`\n✅ Gateway boot OK — state: ${result.finalState}, PID: ${result.pid}`)
  })
})
