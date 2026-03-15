import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  // Wait for React to mount
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

test('React app mounts into #root', async () => {
  const rootChildren = await page.evaluate(() => {
    const root = document.getElementById('root')
    return root ? root.childNodes.length : 0
  })
  // React should render children into #root
  expect(rootChildren).toBeGreaterThan(0)
})

test('no "Not Found" text is displayed', async () => {
  // This is THE critical test — the previous E2E missed this
  const bodyText = await page.evaluate(() => document.body.innerText)
  const hasNotFound =
    bodyText.includes('Not Found') ||
    bodyText.includes('Page Not Found') ||
    bodyText.includes('404')
  expect(hasNotFound).toBe(false)
})

test('no React error messages are rendered', async () => {
  const bodyText = await page.evaluate(() => document.body.innerText)
  const hasReactError =
    bodyText.includes('Minified React error') ||
    bodyText.includes('Something went wrong') ||
    bodyText.includes('application error')
  expect(hasReactError).toBe(false)
})

test('no critical console errors during load', async () => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)

  const criticalErrors = errors.filter(
    (e) =>
      e.includes('import.meta') ||
      e.includes('Minified React error') ||
      e.includes('Cannot read properties of undefined') ||
      e.includes('is not a function') ||
      e.includes('is not defined'),
  )
  expect(criticalErrors).toHaveLength(0)
})

test('#root has visible rendered content (not blank)', async () => {
  const rootRect = await page.evaluate(() => {
    const root = document.getElementById('root')
    if (!root) return null
    const rect = root.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  expect(rootRect).not.toBeNull()
  expect(rootRect!.width).toBeGreaterThan(0)
  expect(rootRect!.height).toBeGreaterThan(0)
})
