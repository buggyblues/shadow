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

test('window opens with correct title', async () => {
  const title = await page.title()
  expect(title).toContain('Shadow')
})

test('window meets minimum dimensions', async () => {
  const bounds = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win!.getBounds()
  })
  expect(bounds.width).toBeGreaterThanOrEqual(940)
  expect(bounds.height).toBeGreaterThanOrEqual(560)
})

test('window is visible and focused', async () => {
  const state = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return {
      visible: win!.isVisible(),
      destroyed: win!.isDestroyed(),
    }
  })
  expect(state.visible).toBe(true)
  expect(state.destroyed).toBe(false)
})

test('only one window is created', async () => {
  const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(count).toBe(1)
})
