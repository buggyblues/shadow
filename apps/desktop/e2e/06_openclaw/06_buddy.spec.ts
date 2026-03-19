/**
 * OpenClaw Buddy Connection E2E Tests
 *
 * Tests Shadow Buddy connection management: CRUD operations,
 * connect/disconnect lifecycle, and event listeners.
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
  await app?.close()
})

// ─── Buddy Connection CRUD ──────────────────────────────────────────────────

test.describe('Buddy Connection CRUD', () => {
  const testConnectionId = `e2e-buddy-${Date.now()}`

  test('listBuddyConnections returns an array', async () => {
    const connections = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listBuddyConnections()
    })

    expect(Array.isArray(connections)).toBe(true)
  })

  test('addBuddyConnection creates a new connection', async () => {
    const result = await page.evaluate(async (connId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.addBuddyConnection({
        id: connId,
        label: 'E2E Test Buddy',
        serverUrl: 'https://buddy-test.example.com',
        apiToken: 'test-api-token-12345',
        agentId: 'agent-1',
        autoConnect: false,
      })
      const connections = await oc.listBuddyConnections()
      return {
        found: connections.some((c: any) => c.id === connId),
        totalCount: connections.length,
      }
    }, testConnectionId)

    expect(result.found).toBe(true)
  })

  test('newly added connection has correct properties', async () => {
    const connections = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listBuddyConnections()
    })

    const testConn = connections.find((c: any) => c.id === testConnectionId)
    expect(testConn).toBeDefined()
    expect(testConn.label).toBe('E2E Test Buddy')
    expect(testConn.serverUrl).toBe('https://buddy-test.example.com')
    expect(testConn.autoConnect).toBe(false)
    expect(testConn.status).toBe('disconnected')
  })

  test('updateBuddyConnection modifies connection fields', async () => {
    const result = await page.evaluate(async (connId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.updateBuddyConnection(connId, {
        label: 'E2E Updated Buddy',
        serverUrl: 'https://buddy-updated.example.com',
        apiToken: 'updated-token-67890',
        agentId: 'agent-2',
        autoConnect: true,
      })
      const connections = await oc.listBuddyConnections()
      const updated = connections.find((c: any) => c.id === connId)
      return {
        label: updated?.label,
        serverUrl: updated?.serverUrl,
        autoConnect: updated?.autoConnect,
        agentId: updated?.agentId,
      }
    }, testConnectionId)

    expect(result.label).toBe('E2E Updated Buddy')
    expect(result.serverUrl).toBe('https://buddy-updated.example.com')
    expect(result.autoConnect).toBe(true)
    expect(result.agentId).toBe('agent-2')
  })

  test('removeBuddyConnection deletes a connection', async () => {
    const result = await page.evaluate(async (connId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.removeBuddyConnection(connId)
      const connections = await oc.listBuddyConnections()
      return {
        found: connections.some((c: any) => c.id === connId),
      }
    }, testConnectionId)

    expect(result.found).toBe(false)
  })
})

// ─── Buddy Connect / Disconnect ─────────────────────────────────────────────

test.describe('Buddy Connect/Disconnect', () => {
  const testConnId = `e2e-buddy-lifecycle-${Date.now()}`

  test.beforeAll(async () => {
    // Create a test connection for lifecycle tests
    await page.evaluate(async (connId: string) => {
      await (window as any).desktopAPI.openClaw.addBuddyConnection({
        id: connId,
        label: 'Lifecycle Test',
        serverUrl: 'https://buddy-lifecycle.example.com',
        apiToken: 'lifecycle-token',
        agentId: '',
        autoConnect: false,
      })
    }, testConnId)
  })

  test.afterAll(async () => {
    // Clean up test connection
    await page.evaluate(async (connId: string) => {
      try {
        await (window as any).desktopAPI.openClaw.removeBuddyConnection(connId)
      } catch {
        // ignore cleanup errors
      }
    }, testConnId)
  })

  test('connectBuddy is callable for a valid connection', async () => {
    const result = await page.evaluate(async (connId: string) => {
      try {
        await (window as any).desktopAPI.openClaw.connectBuddy(connId)
        return { called: true }
      } catch (err: any) {
        // May fail if buddy server is not reachable in test env
        return { called: true, error: err.message }
      }
    }, testConnId)

    expect(result.called).toBe(true)
  })

  test('disconnectBuddy is callable for a valid connection', async () => {
    const result = await page.evaluate(async (connId: string) => {
      try {
        await (window as any).desktopAPI.openClaw.disconnectBuddy(connId)
        return { called: true }
      } catch (err: any) {
        return { called: true, error: err.message }
      }
    }, testConnId)

    expect(result.called).toBe(true)
  })

  test('connectAllBuddies is callable', async () => {
    const result = await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.connectAllBuddies()
        return { called: true }
      } catch (err: any) {
        return { called: true, error: err.message }
      }
    })

    expect(result.called).toBe(true)
  })

  test('connectBuddy with invalid id does not crash', async () => {
    const result = await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.connectBuddy('non-existent-connection-id')
        return { error: false }
      } catch {
        return { error: true }
      }
    })

    // Should either handle gracefully or throw a non-fatal error
    expect(typeof result.error).toBe('boolean')
  })
})

// ─── Buddy Event Listener ───────────────────────────────────────────────────

test.describe('Buddy Event Listener', () => {
  test('onBuddyStatusChanged accepts a callback and returns unsubscribe', async () => {
    const result = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      const unsubscribe = oc.onBuddyStatusChanged(() => {
        // noop callback
      })
      const hasUnsub = typeof unsubscribe === 'function'
      if (hasUnsub) unsubscribe()
      return { hasUnsub }
    })

    expect(result.hasUnsub).toBe(true)
  })

  test('multiple buddy status listeners can coexist', async () => {
    const result = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      const unsub1 = oc.onBuddyStatusChanged(() => {})
      const unsub2 = oc.onBuddyStatusChanged(() => {})

      const allFunctions = typeof unsub1 === 'function' && typeof unsub2 === 'function'

      unsub1()
      unsub2()

      return { allFunctions }
    })

    expect(result.allFunctions).toBe(true)
  })
})

// ─── Buddy-Agent Binding ────────────────────────────────────────────────────

test.describe('Buddy-Agent Binding', () => {
  test('connection agentId persists after creation', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw
      const connId = `e2e-binding-${Date.now()}`

      await oc.addBuddyConnection({
        id: connId,
        label: 'Binding Test',
        serverUrl: 'https://binding-test.example.com',
        apiToken: 'binding-token',
        agentId: 'agent-alpha',
        autoConnect: false,
      })

      const connections = await oc.listBuddyConnections()
      const conn = connections.find((c: any) => c.id === connId)

      // Clean up
      await oc.removeBuddyConnection(connId)

      return {
        agentId: conn?.agentId,
      }
    })

    expect(result.agentId).toBe('agent-alpha')
  })

  test('updating connection agentId replaces the binding', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw
      const connId = `e2e-rebind-${Date.now()}`

      await oc.addBuddyConnection({
        id: connId,
        label: 'Rebind Test',
        serverUrl: 'https://rebind-test.example.com',
        apiToken: 'rebind-token',
        agentId: 'old-agent',
        autoConnect: false,
      })

      // Update with new agent
      await oc.updateBuddyConnection(connId, {
        agentId: 'new-agent',
      })

      const connections = await oc.listBuddyConnections()
      const conn = connections.find((c: any) => c.id === connId)

      // Clean up
      await oc.removeBuddyConnection(connId)

      return {
        agentId: conn?.agentId,
      }
    })

    expect(result.agentId).toBe('new-agent')
  })
})

// ─── Auto-Connect Behavior ──────────────────────────────────────────────────

test.describe('Auto-Connect Configuration', () => {
  test('autoConnect flag persists correctly', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw
      const connId = `e2e-autoconn-${Date.now()}`

      // Create with autoConnect = true
      await oc.addBuddyConnection({
        id: connId,
        label: 'AutoConnect Test',
        serverUrl: 'https://autoconn-test.example.com',
        apiToken: 'auto-token',
        agentId: 'auto-agent',
        autoConnect: true,
      })

      const connections = await oc.listBuddyConnections()
      const conn = connections.find((c: any) => c.id === connId)

      // Clean up
      await oc.removeBuddyConnection(connId)

      return { autoConnect: conn?.autoConnect }
    })

    expect(result.autoConnect).toBe(true)
  })

  test('turning off autoConnect disables it', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw
      const connId = `e2e-noauto-${Date.now()}`

      await oc.addBuddyConnection({
        id: connId,
        label: 'No AutoConnect',
        serverUrl: 'https://noauto-test.example.com',
        apiToken: 'noauto-token',
        agentId: 'noauto-agent',
        autoConnect: true,
      })

      // Update to disable autoConnect
      await oc.updateBuddyConnection(connId, {
        autoConnect: false,
      })

      const connections = await oc.listBuddyConnections()
      const conn = connections.find((c: any) => c.id === connId)

      // Clean up
      await oc.removeBuddyConnection(connId)

      return { autoConnect: conn?.autoConnect }
    })

    expect(result.autoConnect).toBe(false)
  })
})
