import path from 'node:path'
import { expect, test } from '@playwright/test'

const outputDir = path.resolve(__dirname, '../../../../website/docs/public/readme')
const baseUrl = process.env.README_CAPTURE_BASE_URL ?? 'http://127.0.0.1:4173'

async function preparePage(page: import('@playwright/test').Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await expect(page.locator('body')).toBeVisible()
}

test.describe('README gallery capture', () => {
  test('capture English homepage hero', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1200 })
    await preparePage(page, `${baseUrl}/`)
    await page.screenshot({
      path: path.join(outputDir, 'hero-en.png'),
      fullPage: false,
    })
  })

  test('capture English buddies marketplace', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1400 })
    await preparePage(page, `${baseUrl}/buddies.html`)
    await page.screenshot({
      path: path.join(outputDir, 'buddies-en.png'),
      fullPage: false,
    })
  })

  test('capture English features page', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1400 })
    await preparePage(page, `${baseUrl}/features.html`)
    await page.screenshot({
      path: path.join(outputDir, 'features-en.png'),
      fullPage: false,
    })
  })

  test('capture Chinese homepage hero', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1200 })
    await preparePage(page, `${baseUrl}/zh/`)
    await page.screenshot({
      path: path.join(outputDir, 'hero-zh.png'),
      fullPage: false,
    })
  })

  test('capture Chinese features page', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1400 })
    await preparePage(page, `${baseUrl}/zh/features.html`)
    await page.screenshot({
      path: path.join(outputDir, 'features-zh.png'),
      fullPage: false,
    })
  })
})
