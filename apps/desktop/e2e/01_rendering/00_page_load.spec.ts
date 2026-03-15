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

test('HTML document is loaded', async () => {
  const docReady = await page.evaluate(() => document.readyState)
  expect(['interactive', 'complete']).toContain(docReady)
})

test('root div exists', async () => {
  const root = await page.$('#root')
  expect(root).not.toBeNull()
})

test('dark theme class is applied', async () => {
  const htmlClass = await page.evaluate(() => document.documentElement.className)
  expect(htmlClass).toContain('dark')
})

test('CSS stylesheet is loaded', async () => {
  const hasStylesheets = await page.evaluate(() => document.styleSheets.length > 0)
  expect(hasStylesheets).toBe(true)
})

test('page body is not empty', async () => {
  const bodyText = await page.evaluate(() => document.body.innerHTML.trim())
  expect(bodyText.length).toBeGreaterThan(0)
})
