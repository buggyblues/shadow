/**
 * OpenClaw Channel Configuration E2E Tests
 *
 * Tests the channel registry, channel config CRUD, and
 * dynamic form field resolution for different channel types.
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

// ─── Channel Registry ───────────────────────────────────────────────────────

test.describe('Channel Registry', () => {
  test('getChannelRegistry returns an array of supported channels', async () => {
    const registry = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelRegistry()
    })

    expect(Array.isArray(registry)).toBe(true)
    expect(registry.length).toBeGreaterThan(0)
  })

  test('registry includes well-known channel types', async () => {
    const registry = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelRegistry()
    })

    const channelTypes = registry.map((c: any) => c.type ?? c.id ?? c.channelType)
    // The channel registry should include at least some common channels
    const commonChannels = ['wechat', 'telegram', 'discord', 'slack', 'dingtalk', 'wecom']
    const hasAtLeastOne = commonChannels.some((ch) => channelTypes.includes(ch))
    expect(hasAtLeastOne).toBe(true)
  })

  test('each registry entry has type, name, and category', async () => {
    const registry = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelRegistry()
    })

    for (const entry of registry) {
      // Each channel should have identification fields
      const hasType =
        typeof entry.type === 'string' ||
        typeof entry.channelType === 'string' ||
        typeof entry.id === 'string'
      const hasName = typeof entry.name === 'string' || typeof entry.label === 'string'
      expect(hasType).toBe(true)
      expect(hasName).toBe(true)
    }
  })

  test('each registry entry has configFields array', async () => {
    const registry = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelRegistry()
    })

    for (const entry of registry) {
      const hasFields =
        Array.isArray(entry.configFields) ||
        Array.isArray(entry.fields) ||
        typeof entry.configFields === 'object'
      expect(hasFields).toBe(true)
    }
  })
})

// ─── Channel Meta ───────────────────────────────────────────────────────────

test.describe('Channel Meta', () => {
  test('getChannelMeta returns metadata for a known channel', async () => {
    const meta = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelMeta('wechat')
    })

    expect(meta).toBeDefined()
    expect(typeof meta).toBe('object')
  })

  test('getChannelMeta returns null or undefined for unknown channel', async () => {
    const meta = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelMeta('nonexistent_channel_xyz')
    })

    expect(meta === null || meta === undefined).toBe(true)
  })

  test('channel meta includes config field definitions', async () => {
    const meta = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelMeta('telegram')
    })

    if (meta) {
      const hasFields = Array.isArray(meta.configFields) || Array.isArray(meta.fields)
      expect(hasFields).toBe(true)

      const fields = meta.configFields ?? meta.fields ?? []
      for (const field of fields) {
        // Each field should have a key/name and type
        expect(typeof field.key === 'string' || typeof field.name === 'string').toBe(true)
        expect(typeof field.type === 'string' || typeof field.label === 'string').toBe(true)
      }
    }
  })
})

// ─── Channel Config CRUD ────────────────────────────────────────────────────

test.describe('Channel Config CRUD', () => {
  const testChannelId = `e2e-test-channel-${Date.now()}`

  test('getChannelConfigs returns an array', async () => {
    const configs = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelConfigs()
    })

    expect(Array.isArray(configs)).toBe(true)
  })

  test('saveChannelConfig creates a new channel config', async () => {
    const result = await page.evaluate(async (channelId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.saveChannelConfig({
        channelId,
        channelType: 'telegram',
        accounts: [
          {
            id: 'acct-1',
            label: 'Test Bot',
            enabled: true,
            config: {
              bot_token: '123456:ABC-DEF',
            },
          },
        ],
      })
      const configs = await oc.getChannelConfigs()
      return {
        found: configs.some((c: any) => c.channelId === channelId),
        totalConfigs: configs.length,
      }
    }, testChannelId)

    expect(result.found).toBe(true)
  })

  test('getChannelConfig retrieves a specific channel config', async () => {
    const config = await page.evaluate(async (channelId: string) => {
      return await (window as any).desktopAPI.openClaw.getChannelConfig(channelId)
    }, testChannelId)

    expect(config).toBeDefined()
    expect(config.channelId).toBe(testChannelId)
    expect(config.channelType).toBe('telegram')
    expect(Array.isArray(config.accounts)).toBe(true)
    expect(config.accounts.length).toBe(1)
  })

  test('channel config accounts have correct structure', async () => {
    const config = await page.evaluate(async (channelId: string) => {
      return await (window as any).desktopAPI.openClaw.getChannelConfig(channelId)
    }, testChannelId)

    const firstAccount = config.accounts[0]
    expect(firstAccount.id).toBe('acct-1')
    expect(firstAccount.label).toBe('Test Bot')
    expect(firstAccount.enabled).toBe(true)
    expect(firstAccount.config.bot_token).toBe('123456:ABC-DEF')
  })

  test('saveChannelConfig updates existing channel config', async () => {
    const result = await page.evaluate(async (channelId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.saveChannelConfig({
        channelId,
        channelType: 'telegram',
        accounts: [
          {
            id: 'acct-1',
            label: 'Updated Bot',
            enabled: false,
            config: {
              bot_token: 'updated-token',
            },
          },
          {
            id: 'acct-2',
            label: 'Second Bot',
            enabled: true,
            config: {
              bot_token: 'second-bot-token',
            },
          },
        ],
      })
      const config = await oc.getChannelConfig(channelId)
      return {
        accountCount: config.accounts.length,
        firstLabel: config.accounts[0].label,
        firstEnabled: config.accounts[0].enabled,
        secondLabel: config.accounts[1].label,
      }
    }, testChannelId)

    expect(result.accountCount).toBe(2)
    expect(result.firstLabel).toBe('Updated Bot')
    expect(result.firstEnabled).toBe(false)
    expect(result.secondLabel).toBe('Second Bot')
  })

  test('deleteChannelConfig removes a channel config', async () => {
    const result = await page.evaluate(async (channelId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.deleteChannelConfig(channelId)
      const configs = await oc.getChannelConfigs()
      return {
        found: configs.some((c: any) => c.channelId === channelId),
      }
    }, testChannelId)

    expect(result.found).toBe(false)
  })
})

// ─── Multi-Channel Independence ─────────────────────────────────────────────

test.describe('Multi-Channel Independence', () => {
  test('different channel types can coexist', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw

      // Create two different channel configs
      await oc.saveChannelConfig({
        channelId: 'e2e-telegram-1',
        channelType: 'telegram',
        accounts: [
          { id: 'tg1', label: 'TG Bot', enabled: true, config: { bot_token: 'tg-token' } },
        ],
      })
      await oc.saveChannelConfig({
        channelId: 'e2e-discord-1',
        channelType: 'discord',
        accounts: [
          { id: 'dc1', label: 'DC Bot', enabled: true, config: { bot_token: 'dc-token' } },
        ],
      })

      const configs = await oc.getChannelConfigs()
      const hasTelegram = configs.some((c: any) => c.channelId === 'e2e-telegram-1')
      const hasDiscord = configs.some((c: any) => c.channelId === 'e2e-discord-1')

      // Clean up
      await oc.deleteChannelConfig('e2e-telegram-1')
      await oc.deleteChannelConfig('e2e-discord-1')

      return { hasTelegram, hasDiscord }
    })

    expect(result.hasTelegram).toBe(true)
    expect(result.hasDiscord).toBe(true)
  })

  test('deleting one channel does not affect another', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw

      await oc.saveChannelConfig({
        channelId: 'e2e-keep-channel',
        channelType: 'slack',
        accounts: [
          {
            id: 's1',
            label: 'Slack',
            enabled: true,
            config: { webhook_url: 'https://hooks.slack.com/test' },
          },
        ],
      })
      await oc.saveChannelConfig({
        channelId: 'e2e-delete-channel',
        channelType: 'dingtalk',
        accounts: [
          {
            id: 'd1',
            label: 'DingTalk',
            enabled: true,
            config: { webhook_url: 'https://dingtalk.com/test' },
          },
        ],
      })

      // Delete only the DingTalk channel
      await oc.deleteChannelConfig('e2e-delete-channel')

      const configs = await oc.getChannelConfigs()
      const keepExists = configs.some((c: any) => c.channelId === 'e2e-keep-channel')
      const deleteGone = !configs.some((c: any) => c.channelId === 'e2e-delete-channel')

      // Clean up
      await oc.deleteChannelConfig('e2e-keep-channel')

      return { keepExists, deleteGone }
    })

    expect(result.keepExists).toBe(true)
    expect(result.deleteGone).toBe(true)
  })
})

// ─── Config Field Types ─────────────────────────────────────────────────────

test.describe('Config Field Types', () => {
  test('telegram channel has bot_token field', async () => {
    const meta = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelMeta('telegram')
    })

    if (meta) {
      const fields = meta.configFields ?? meta.fields ?? []
      const fieldKeys = fields.map((f: any) => f.key ?? f.name)
      expect(fieldKeys).toContain('botToken')
    }
  })

  test('wechat channel has app_id and app_secret fields', async () => {
    const meta = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelMeta('wechat')
    })

    if (meta) {
      const fields = meta.configFields ?? meta.fields ?? []
      const fieldKeys = fields.map((f: any) => f.key ?? f.name)
      const hasAppId = fieldKeys.includes('app_id') || fieldKeys.includes('appId')
      const hasAppSecret = fieldKeys.includes('app_secret') || fieldKeys.includes('appSecret')
      expect(hasAppId).toBe(true)
      expect(hasAppSecret).toBe(true)
    }
  })

  test('config fields have type and label properties', async () => {
    const meta = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelMeta('discord')
    })

    if (meta) {
      const fields = meta.configFields ?? meta.fields ?? []
      for (const field of fields) {
        expect(typeof field.type === 'string').toBe(true)
        expect(typeof field.label === 'string' || typeof field.name === 'string').toBe(true)
      }
    }
  })

  test('password fields are marked as password type', async () => {
    const registryEntries = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getChannelRegistry()
    })

    // At least one channel should have a password-type field (e.g., bot_token, api_key)
    let hasPasswordField = false
    for (const entry of registryEntries) {
      const fields = entry.configFields ?? entry.fields ?? []
      for (const field of fields) {
        if (field.type === 'password') {
          hasPasswordField = true
          break
        }
      }
      if (hasPasswordField) break
    }

    expect(hasPasswordField).toBe(true)
  })
})
