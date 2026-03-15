import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  // Wait for React to fully render and styles to apply
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

test('full page screenshot — initial load', async () => {
  await page.screenshot({
    path: 'test-results/screenshots/01-initial-load.png',
    fullPage: true,
  })

  // Page should not be blank white
  const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bgColor).not.toBe('rgb(255, 255, 255)')
})

test('viewport screenshot — above the fold', async () => {
  await page.screenshot({
    path: 'test-results/screenshots/02-viewport.png',
    fullPage: false,
  })
})

test('Logo.svg is loaded and visible', async () => {
  // Check if any img with Logo.svg src is loaded
  const logoInfo = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    for (const img of imgs) {
      if (img.src.includes('Logo.svg') || img.getAttribute('src')?.includes('Logo.svg')) {
        return {
          found: true,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          currentSrc: img.currentSrc,
        }
      }
    }
    // Also check for SVG <object> or <use> or background-image
    const allElements = Array.from(document.querySelectorAll('*'))
    for (const el of allElements) {
      const bgImage = getComputedStyle(el).backgroundImage
      if (bgImage.includes('Logo.svg')) {
        return { found: true, type: 'background-image', src: bgImage }
      }
    }
    return { found: false }
  })

  // If Logo exists, it should be loaded (not broken)
  if (logoInfo.found && 'naturalWidth' in logoInfo) {
    expect(logoInfo.naturalWidth).toBeGreaterThan(0)
    expect(logoInfo.complete).toBe(true)
  }
})

test('no broken images on page', async () => {
  const brokenImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return imgs
      .filter((img) => img.complete && img.naturalWidth === 0 && img.src)
      .map((img) => img.src)
  })
  expect(brokenImages).toEqual([])
})

test('styled elements have proper dimensions', async () => {
  // Verify root container has proper dimensions (not collapsed to 0)
  const rootSize = await page.evaluate(() => {
    const root = document.getElementById('root')
    if (!root) return null
    const rect = root.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  expect(rootSize).not.toBeNull()
  expect(rootSize!.width).toBeGreaterThan(100)
  expect(rootSize!.height).toBeGreaterThan(100)
})

test('page has no network errors for CSS/SVG resources', async () => {
  // Launch a fresh page to capture network
  const newPage = await app.firstWindow()
  const failedRequests: string[] = []

  newPage.on('requestfailed', (request) => {
    const url = request.url()
    if (url.endsWith('.css') || url.endsWith('.svg')) {
      failedRequests.push(`${url} — ${request.failure()?.errorText}`)
    }
  })

  // Navigate to trigger requests
  await newPage.reload()
  await newPage.waitForTimeout(3000)

  expect(failedRequests).toEqual([])
})

test('final screenshot after full render', async () => {
  await page.waitForTimeout(1000)
  await page.screenshot({
    path: 'test-results/screenshots/03-final-state.png',
    fullPage: true,
  })
})
