import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  // Wait for React and router to fully initialize
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

test('app uses hash-based routing (not browser history)', async () => {
  const _url = page.url()
  // In production Electron, URL is file:// with hash
  // In dev, URL is http://localhost:3100 with hash
  // Either way, after router init the URL should have a hash fragment
  const hash = await page.evaluate(() => window.location.hash)
  // Hash routing means the hash should be set (e.g., #/ or #/login)
  expect(hash.startsWith('#')).toBe(true)
})

test('router resolves to a valid page (not 404)', async () => {
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText).not.toContain('Not Found')
  expect(bodyText).not.toContain('Page Not Found')
})

test('unauthenticated user is redirected to login', async () => {
  const hash = await page.evaluate(() => window.location.hash)
  // Desktop uses basepath '/app', so login is at /app/login
  expect(hash).toContain('#/app/login')

  // Page should render the login form
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText.length).toBeGreaterThan(0)
  expect(bodyText).not.toContain('Not Found')
})

test('hash navigation works for login route', async () => {
  // Navigate to login page via hash (basepath is /app)
  await page.evaluate(() => {
    window.location.hash = '#/app/login'
  })
  await page.waitForTimeout(1500)

  const hash = await page.evaluate(() => window.location.hash)
  expect(hash).toContain('#/app/login')

  // Page should render the login page
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText).not.toContain('Not Found')
})

test('navigation to protected route redirects when unauthenticated', async () => {
  await page.evaluate(() => {
    window.location.hash = '#/app/settings'
  })
  await page.waitForTimeout(1500)

  const hash = await page.evaluate(() => window.location.hash)
  // Should have been redirected away from /app
  expect(hash.includes('#/app/settings')).toBe(false)
})
