import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
})

test.afterAll(async () => {
  await app?.close()
})

test('desktopAPI is exposed to renderer', async () => {
  const hasAPI = await page.evaluate(() => 'desktopAPI' in window)
  expect(hasAPI).toBe(true)
})

test('desktopAPI.isDesktop is true', async () => {
  // biome-ignore lint/suspicious/noExplicitAny: accessing Electron preload API
  const isDesktop = await page.evaluate(() => (window as any).desktopAPI.isDesktop)
  expect(isDesktop).toBe(true)
})

test('desktopAPI.platform is valid', async () => {
  // biome-ignore lint/suspicious/noExplicitAny: accessing Electron preload API
  const platform = await page.evaluate(() => (window as any).desktopAPI.platform)
  expect(['darwin', 'win32', 'linux']).toContain(platform)
})

test('desktopAPI exposes notification methods', async () => {
  const methods = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing Electron preload API
    const api = (window as any).desktopAPI
    return {
      showNotification: typeof api.showNotification,
      setBadgeCount: typeof api.setBadgeCount,
      setNotificationMode: typeof api.setNotificationMode,
    }
  })
  expect(methods.showNotification).toBe('function')
  expect(methods.setBadgeCount).toBe('function')
  expect(methods.setNotificationMode).toBe('function')
})

test('desktopAPI exposes window methods', async () => {
  const methods = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing Electron preload API
    const api = (window as any).desktopAPI
    return {
      minimizeToTray: typeof api.minimizeToTray,
    }
  })
  expect(methods.minimizeToTray).toBe('function')
})

test('desktopAPI exposes agent management methods', async () => {
  const methods = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing Electron preload API
    const api = (window as any).desktopAPI
    return {
      startAgent: typeof api.startAgent,
      stopAgent: typeof api.stopAgent,
      getAgentStatus: typeof api.getAgentStatus,
      listAgents: typeof api.listAgents,
    }
  })
  expect(methods.startAgent).toBe('function')
  expect(methods.stopAgent).toBe('function')
  expect(methods.getAgentStatus).toBe('function')
  expect(methods.listAgents).toBe('function')
})

test('desktopAPI exposes event listener methods', async () => {
  const methods = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing Electron preload API
    const api = (window as any).desktopAPI
    return {
      onNavigateToChannel: typeof api.onNavigateToChannel,
      onAgentMessage: typeof api.onAgentMessage,
      onAgentExited: typeof api.onAgentExited,
    }
  })
  expect(methods.onNavigateToChannel).toBe('function')
  expect(methods.onAgentMessage).toBe('function')
  expect(methods.onAgentExited).toBe('function')
})
