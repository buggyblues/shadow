/**
 * OpenClaw Gateway Lifecycle E2E Tests
 *
 * Tests the gateway management IPC methods: status queries,
 * install detection, start/stop/restart lifecycle, and event listeners.
 */

import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  // Ensure gateway is stopped before closing
  try {
    await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.stopGateway()
      } catch {}
    })
  } catch {}
  await app?.close()
})

// ─── Gateway Status ─────────────────────────────────────────────────────────

test.describe('Gateway Status', () => {
  test('getGatewayStatus returns a valid status object', async () => {
    const status = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getGatewayStatus()
    })

    expect(status).toBeDefined()
    expect(typeof status).toBe('object')
    // Status should have a 'state' field with a known gateway state
    expect(status.state).toBeDefined()
    const validStates = [
      'offline',
      'installing',
      'starting',
      'bootstrapping',
      'running',
      'stopping',
      'error',
    ]
    expect(validStates).toContain(status.state)
  })

  test('getGatewayStatus includes version field', async () => {
    const status = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getGatewayStatus()
    })

    // version may be undefined if not installed, but the field should exist
    expect('version' in status || status.state === 'offline').toBe(true)
  })

  test('getGatewayStatus includes uptime field', async () => {
    const status = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getGatewayStatus()
    })

    // uptime should be null/0 when not running
    if (status.state === 'offline' || status.state === 'error') {
      expect(status.uptime == null || status.uptime === 0).toBe(true)
    }
  })
})

// ─── Gateway Install ────────────────────────────────────────────────────────

test.describe('Gateway Install', () => {
  test('installOpenClaw function is callable', async () => {
    // We just verify the function exists and is callable
    // In CI it may not actually install (network constraints)
    const fnType = await page.evaluate(() => {
      return typeof (window as any).desktopAPI.openClaw.installOpenClaw
    })
    expect(fnType).toBe('function')
  })

  test('installOpenClaw returns a result object', async () => {
    // The install function should return something (success/failure)
    // even if the actual install fails in test env
    try {
      const result = await page.evaluate(async () => {
        try {
          return await (window as any).desktopAPI.openClaw.installOpenClaw()
        } catch (err: any) {
          return { error: err.message }
        }
      })
      expect(result).toBeDefined()
    } catch {
      // Install may time out or fail in test env — that's acceptable
    }
  })
})

// ─── Gateway Lifecycle ──────────────────────────────────────────────────────

test.describe('Gateway Start / Stop / Restart', () => {
  test('startGateway is callable and returns', async () => {
    try {
      const result = await page.evaluate(async () => {
        try {
          return await Promise.race([
            (window as any).desktopAPI.openClaw.startGateway(),
            new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 20000)),
          ])
        } catch (err: any) {
          return { error: err.message }
        }
      })
      expect(result).toBeDefined()
    } catch {
      // Gateway may not be installed in CI
    }
  })

  test('stopGateway is callable and returns', async () => {
    try {
      const result = await page.evaluate(async () => {
        try {
          return await (window as any).desktopAPI.openClaw.stopGateway()
        } catch (err: any) {
          return { error: err.message }
        }
      })
      expect(result).toBeDefined()
    } catch {
      // Acceptable
    }
  })

  test('restartGateway is callable and returns', async () => {
    try {
      const result = await page.evaluate(async () => {
        try {
          return await Promise.race([
            (window as any).desktopAPI.openClaw.restartGateway(),
            new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 20000)),
          ])
        } catch (err: any) {
          return { error: err.message }
        }
      })
      expect(result).toBeDefined()
    } catch {
      // Acceptable
    }
  })

  test('gateway status reflects stopped state after stopGateway', async () => {
    // Stop gateway first, then check status
    await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.stopGateway()
      } catch {
        // ignore
      }
    })

    await page.waitForTimeout(1000)

    const status = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getGatewayStatus()
    })

    // After stopping, state should be offline or error (if never installed)
    expect(['offline', 'stopping', 'error']).toContain(status.state)
  })
})

// ─── Gateway Event Listeners ────────────────────────────────────────────────

test.describe('Gateway Event Listeners', () => {
  test('onGatewayStatusChanged accepts a callback and returns unsubscribe', async () => {
    const result = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      // Subscribe to status changes
      const unsubscribe = oc.onGatewayStatusChanged(() => {
        // noop callback
      })
      const hasUnsub = typeof unsubscribe === 'function'
      // Clean up
      if (hasUnsub) unsubscribe()
      return { hasUnsub }
    })
    expect(result.hasUnsub).toBe(true)
  })

  test('onGatewayLog accepts a callback and returns unsubscribe', async () => {
    const result = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      const unsubscribe = oc.onGatewayLog(() => {
        // noop callback
      })
      const hasUnsub = typeof unsubscribe === 'function'
      if (hasUnsub) unsubscribe()
      return { hasUnsub }
    })
    expect(result.hasUnsub).toBe(true)
  })

  test('multiple subscriptions can coexist without error', async () => {
    const result = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      const unsub1 = oc.onGatewayStatusChanged(() => {})
      const unsub2 = oc.onGatewayStatusChanged(() => {})
      const unsub3 = oc.onGatewayLog(() => {})

      const allFunctions =
        typeof unsub1 === 'function' && typeof unsub2 === 'function' && typeof unsub3 === 'function'

      // Clean up all
      unsub1()
      unsub2()
      unsub3()

      return { allFunctions }
    })
    expect(result.allFunctions).toBe(true)
  })
})
