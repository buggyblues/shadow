/**
 * Multi-Agent Shadow Channel Connection E2E Test
 *
 * Verifies the gateway correctly attempts to connect multiple Shadow accounts:
 *   1. Write config with multiple fake accounts under channels.shadowob
 *   2. Start the gateway
 *   3. Collect logs for a window
 *   4. Assert connection attempt logs appear for each account
 *
 * The accounts use fake tokens, so connections will fail — but the logs should
 * show the gateway attempted to start each account. This validates:
 *   - Channel ID "shadowob" is properly recognized
 *   - Multi-account enumeration works (listAccountIds)
 *   - The gateway iterates all configured accounts
 */

import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
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

test.describe('Multi-Agent Shadow Connection', () => {
  test('gateway starts all configured shadowob accounts and logs connection attempts', async () => {
    test.setTimeout(120_000)

    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw

      // 1. Stop any running gateway
      try {
        await oc.stopGateway()
      } catch {}
      await new Promise((r) => setTimeout(r, 1000))

      // 2. Read config, inject multi-account shadowob channel with fake tokens
      const config = await oc.getConfig()

      config.channels = {
        ...config.channels,
        shadowob: {
          accounts: {
            'buddy-alpha': {
              token: 'fake-token-alpha-e2e',
              serverUrl: 'http://127.0.0.1:19999',
              enabled: true,
            },
            'buddy-beta': {
              token: 'fake-token-beta-e2e',
              serverUrl: 'http://127.0.0.1:19998',
              enabled: true,
            },
            'buddy-gamma': {
              token: 'fake-token-gamma-e2e',
              serverUrl: 'http://127.0.0.1:19997',
              enabled: true,
            },
          },
        },
      }

      // Ensure the shadowob plugin is allowed
      config.plugins = {
        ...config.plugins,
        allow: [...new Set([...(config.plugins?.allow ?? []), 'shadowob'])],
        entries: {
          ...config.plugins?.entries,
          shadowob: { enabled: true },
        },
      }

      await oc.saveConfig(config)
      await new Promise((r) => setTimeout(r, 500))

      // 3. Collect logs
      const logs: string[] = []
      const states: string[] = []

      const unsubLog = oc.onGatewayLog((entry: { message: string; level?: string }) => {
        const msg = typeof entry === 'string' ? entry : (entry?.message ?? JSON.stringify(entry))
        logs.push(msg)
      })

      const unsubStatus = oc.onGatewayStatusChanged((status: { state: string }) => {
        states.push(status.state)
      })

      // 4. Start gateway
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

      // 5. Wait for the gateway to attempt connections (fake tokens → fast failure)
      await new Promise((r) => setTimeout(r, 15_000))

      let finalStatus: any
      try {
        finalStatus = await oc.getGatewayStatus()
      } catch (err: any) {
        finalStatus = { state: 'unknown', error: err.message }
      }

      unsubLog()
      unsubStatus()

      // 6. Clean up — remove fake accounts to not affect other tests
      try {
        const cleanConfig = await oc.getConfig()
        if (cleanConfig.channels?.shadowob?.accounts) {
          delete cleanConfig.channels.shadowob.accounts['buddy-alpha']
          delete cleanConfig.channels.shadowob.accounts['buddy-beta']
          delete cleanConfig.channels.shadowob.accounts['buddy-gamma']
        }
        await oc.saveConfig(cleanConfig)
      } catch {}

      return {
        states,
        finalState: finalStatus.state,
        logs: logs.slice(-100),
      }
    })

    // ── Assertions ──────────────────────────────────────────────────────

    const allLogs = result.logs.join('\n').toLowerCase()

    // 1. Gateway should have progressed beyond offline
    const progressStates = ['starting', 'bootstrapping', 'running']
    const madeProgress =
      result.states.some((s: string) => progressStates.includes(s)) ||
      progressStates.includes(result.finalState)

    expect(madeProgress, `Gateway never started — states: ${JSON.stringify(result.states)}`).toBe(
      true,
    )

    // 2. The shadowob channel should appear in logs (plugin loaded)
    const channelMentioned = allLogs.includes('shadowob') || allLogs.includes('shadow')

    if (!channelMentioned) {
      console.error('\n🔴 No shadowob channel mention in gateway logs')
      console.error(`  Last 20 logs:\n${result.logs.slice(-20).join('\n')}`)
    }

    expect(
      channelMentioned,
      `shadowob channel not mentioned in logs. Last 20:\n${result.logs.slice(-20).join('\n')}`,
    ).toBe(true)

    // 3. Connection attempt for each account should appear in logs
    //    The gateway calls startAccount per account — logs should mention account IDs
    const accountIds = ['buddy-alpha', 'buddy-beta', 'buddy-gamma']
    const foundAccounts: string[] = []
    const missingAccounts: string[] = []

    for (const accountId of accountIds) {
      if (allLogs.includes(accountId)) {
        foundAccounts.push(accountId)
      } else {
        missingAccounts.push(accountId)
      }
    }

    if (missingAccounts.length > 0) {
      console.warn(`\n⚠️  Missing account logs: ${missingAccounts.join(', ')}`)
      console.warn(`  Found accounts: ${foundAccounts.join(', ')}`)
      console.warn(`  All logs:\n${result.logs.join('\n')}`)
    }

    // At least one account should have a connection attempt logged
    expect(
      foundAccounts.length,
      `No account connection attempts found in logs. Expected: ${accountIds.join(', ')}\nLogs:\n${result.logs.slice(-30).join('\n')}`,
    ).toBeGreaterThan(0)

    // Ideally all 3 should appear
    expect(
      foundAccounts.length,
      `Only ${foundAccounts.length}/3 accounts found in logs. Missing: ${missingAccounts.join(', ')}`,
    ).toBe(accountIds.length)

    console.log(
      `\n✅ Multi-agent connection test passed — ${foundAccounts.length}/${accountIds.length} accounts logged`,
    )
  })
})
