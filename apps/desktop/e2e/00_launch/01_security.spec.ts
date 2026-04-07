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

test('contextIsolation is enabled', async () => {
  const result = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win!.webContents.getLastWebPreferences()
  })
  expect(result.contextIsolation).toBe(true)
})

test('nodeIntegration is disabled', async () => {
  const result = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win!.webContents.getLastWebPreferences()
  })
  expect(result.nodeIntegration).toBe(false)
})

test('sandbox is enabled', async () => {
  const result = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win!.webContents.getLastWebPreferences()
  })
  expect(result.sandbox).toBe(true)
})

test('renderer cannot access Node.js APIs', async () => {
  const hasProcess = await page.evaluate(() => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing unknown runtime environment
      return typeof (globalThis as any).process?.versions?.node === 'string'
    } catch {
      return false
    }
  })
  // In a properly sandboxed renderer, process.versions.node should not be available
  expect(hasProcess).toBe(false)
})

test('renderer cannot require Node.js modules', async () => {
  const canRequire = await page.evaluate(() => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing unknown runtime environment
      return typeof (globalThis as any).require === 'function'
    } catch {
      return false
    }
  })
  expect(canRequire).toBe(false)
})
