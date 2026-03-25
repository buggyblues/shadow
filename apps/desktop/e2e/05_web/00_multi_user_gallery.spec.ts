import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, request, test } from '@playwright/test'

type UserCredentials = {
  email: string
  password: string
  displayName: string
}

type Session = {
  origin: string
  appBaseUrl: string
  owner: UserCredentials
  viewer: UserCredentials
  server: {
    id: string
    slug: string
    name: string
    inviteCode: string
  }
  channels: {
    generalId: string
    announcementsId: string
  }
  shop?: {
    categoryId: string
    categoryName: string
    productNames: string[]
  }
  apps?: {
    names: string[]
  }
}

const repoRoot = process.cwd().endsWith(path.join('apps', 'desktop'))
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()
const sessionPath = process.env.E2E_SESSION_PATH
  ? path.resolve(process.env.E2E_SESSION_PATH)
  : path.resolve(repoRoot, 'docs/e2e/session.json')
const screenshotDir = process.env.E2E_SCREENSHOT_DIR
  ? path.resolve(process.env.E2E_SCREENSHOT_DIR)
  : path.resolve(repoRoot, 'docs/e2e/screenshots')

async function readSession(): Promise<Session> {
  const raw = await fs.readFile(sessionPath, 'utf8')
  return JSON.parse(raw) as Session
}

async function ensureScreenshotDir() {
  await fs.mkdir(screenshotDir, { recursive: true })
}

async function loginViaUi(page: import('@playwright/test').Page, user: UserCredentials) {
  await page.goto('login')
  await page.locator('input[autocomplete="username"]').fill(user.email)
  await page.locator('input[autocomplete="current-password"]').fill(user.password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/app\/settings/)
}

async function registerViaUi(
  page: import('@playwright/test').Page,
  user: UserCredentials,
  inviteCode: string,
) {
  await page.goto('register')
  await page.getByPlaceholder('you@shadowob.com').fill(user.email)
  await page.locator('input[autocomplete="nickname"]').fill(user.displayName)
  await page.locator('input[autocomplete="new-password"]').fill(user.password)
  await page.locator('input.font-mono').fill(inviteCode)
  await page.locator('form button[type="submit"]').click()

  try {
    await page.waitForURL(/\/app\/settings/, { timeout: 10_000 })
    return
  } catch {
    const emailExists = page.getByText(/email already in use/i).first()
    if (await emailExists.isVisible().catch(() => false)) {
      await loginViaUi(page, user)
      return
    }
    throw new Error('Viewer registration did not complete successfully')
  }
}

async function screenshot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotDir, name),
    fullPage: false,
  })
}

test.describe
