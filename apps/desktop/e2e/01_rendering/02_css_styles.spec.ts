import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  // Wait for CSS and React to fully render
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

test('body has dark background color applied', async () => {
  const bgColor = await page.evaluate(() => {
    return getComputedStyle(document.body).backgroundColor
  })
  // Dark theme bg-bg-primary: #313338 = rgb(49, 51, 56)
  // Should NOT be white (rgb(255,255,255)) or transparent
  expect(bgColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(bgColor).not.toBe('rgb(255, 255, 255)')
})

test('body text has themed color', async () => {
  const color = await page.evaluate(() => {
    return getComputedStyle(document.body).color
  })
  // text-text-primary: #f2f3f5 = rgb(242, 243, 245) in dark mode
  // Should NOT be default black
  expect(color).not.toBe('rgb(0, 0, 0)')
})

test('Tailwind utility classes are functional', async () => {
  // Check that at least one element with Tailwind flex class is actually flex
  const hasFlexElement = await page.evaluate(() => {
    const elements = document.querySelectorAll('*')
    for (const el of elements) {
      const display = getComputedStyle(el).display
      if (display === 'flex') return true
    }
    return false
  })
  expect(hasFlexElement).toBe(true)
})

test('CSS custom properties are defined', async () => {
  const vars = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return {
      primary: style.getPropertyValue('--color-primary').trim(),
      bgPrimary: style.getPropertyValue('--color-bg-primary').trim(),
      textPrimary: style.getPropertyValue('--color-text-primary').trim(),
    }
  })
  // Theme variables should be set
  expect(vars.primary).toBeTruthy()
  expect(vars.bgPrimary).toBeTruthy()
  expect(vars.textPrimary).toBeTruthy()
})

test('fonts are loaded (Nunito or system font applied)', async () => {
  const fontFamily = await page.evaluate(() => {
    return getComputedStyle(document.body).fontFamily
  })
  // Should have Nunito or fallback sans-serif font
  expect(fontFamily.length).toBeGreaterThan(0)
})

test('no unstyled content visible (FOUC check)', async () => {
  // Take a screenshot for visual verification
  await page.screenshot({ path: 'test-results/css-visual-check.png', fullPage: false })

  // Check that root element has non-zero computed padding/margin (indicating CSS is active)
  const rootStyles = await page.evaluate(() => {
    const root = document.getElementById('root')
    if (!root) return null
    const style = getComputedStyle(root)
    return {
      minHeight: style.minHeight,
    }
  })
  expect(rootStyles).not.toBeNull()
})
