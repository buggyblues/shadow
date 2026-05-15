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

test('opens a transparent always-on-top pet window', async () => {
  const state = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return {
      title: win?.getTitle(),
      visible: win?.isVisible(),
      alwaysOnTop: win?.isAlwaysOnTop(),
      nodeIntegration: win?.webContents.getLastWebPreferences().nodeIntegration,
      contextIsolation: win?.webContents.getLastWebPreferences().contextIsolation,
      sandbox: win?.webContents.getLastWebPreferences().sandbox,
      bounds: win?.getBounds(),
    }
  })
  const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  expect(state.title).toMatch(/XiaDou|虾豆/)
  expect(state.visible).toBe(true)
  expect(state.alwaysOnTop).toBe(true)
  expect(bodyBackground).toBe('rgba(0, 0, 0, 0)')
  expect(state.nodeIntegration).toBe(false)
  expect(state.contextIsolation).toBe(true)
  expect(state.sandbox).toBe(true)
  expect(state.bounds?.width).toBeGreaterThanOrEqual(300)
  await expect(page.locator('.control-panel')).toHaveCount(0)
})

test('renders only the pet by default and reveals controls on hover', async () => {
  await expect(page.locator('.pet-sprite')).toBeVisible()
  await expect(page.locator('.quick-actions .action')).toHaveCount(7)

  const hiddenOpacity = await page
    .locator('.quick-actions')
    .evaluate((node) => getComputedStyle(node).opacity)
  expect(hiddenOpacity).toBe('0')

  await page.locator('.pet-stage').hover()
  await expect
    .poll(async () =>
      Number(
        await page.locator('.quick-actions').evaluate((node) => getComputedStyle(node).opacity),
      ),
    )
    .toBeGreaterThan(0.9)

  await page.locator('.pet-button').click()
  await expect(page.locator('.messages')).toBeVisible()
})

test('supports dragging the pet window', async () => {
  const before = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win?.getPosition()
  })
  const box = await page.locator('.pet-button').boundingBox()
  expect(box).toBeTruthy()
  if (!box) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 34, box.y + box.height / 2 + 26, { steps: 4 })
  await page.mouse.up()
  const after = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win?.getPosition()
  })
  expect(after?.[0]).not.toBe(before?.[0])
})

test('hides instead of destroying the pet window on close', async () => {
  const state = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.close()
    await new Promise((resolve) => setTimeout(resolve, 120))
    const windows = BrowserWindow.getAllWindows()
    const pet = windows[0]
    const result = {
      count: windows.length,
      visible: pet?.isVisible(),
      destroyed: pet?.isDestroyed(),
    }
    pet?.show()
    return result
  })

  expect(state.count).toBe(1)
  expect(state.visible).toBe(false)
  expect(state.destroyed).toBe(false)
})

test('keeps the renderer sandboxed', async () => {
  const result = await page.evaluate(() => ({
    hasNodeProcess:
      typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions
        ?.node === 'string',
    hasRequire: typeof (globalThis as { require?: unknown }).require === 'function',
    hasBridge: typeof window.shadowPet?.auth?.getSession === 'function',
  }))

  expect(result.hasNodeProcess).toBe(false)
  expect(result.hasRequire).toBe(false)
  expect(result.hasBridge).toBe(true)
})
