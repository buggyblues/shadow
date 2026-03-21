import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from '@playwright/test'

type Session = {
  origin: string
  appBaseUrl: string
  owner: { email: string; password: string; displayName: string }
  viewer: { email: string; password: string; displayName: string }
  server: { id: string; slug: string; name: string; inviteCode: string }
  channels: { generalId: string; announcementsId: string }
  agents?: { names: string[]; ids: string[] }
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

async function loginViaUi(page: import('@playwright/test').Page, user: Session['owner']) {
  await page.goto('login')
  await page.getByPlaceholder('you@shadowob.com').fill(user.email)
  await page.locator('input[autocomplete="current-password"]').fill(user.password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/app\/settings/)
}

async function screenshot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotDir, name),
    fullPage: false,
  })
}

test.describe
  .serial('buddy & agent screenshot scenarios', () => {
    test('captures agent management and buddy marketplace views', async ({ browser }) => {
      await ensureScreenshotDir()
      const session = await readSession()

      const ownerContext = await browser.newContext()
      const ownerPage = await ownerContext.newPage()

      await loginViaUi(ownerPage, session.owner)

      // Buddy management page — shows created agents with status badges
      await ownerPage.goto('buddies')
      await ownerPage.waitForURL(/\/app\/buddies/)
      await ownerPage.waitForTimeout(1000)
      await screenshot(ownerPage, '13-buddy-agent-management.png')

      // If agents were seeded, click the first agent to show details
      if (session.agents?.names?.length) {
        // Wait for the agent list to render in the sidebar
        const agentCard = ownerPage.getByText(session.agents.names[0]).first()
        try {
          await agentCard.waitFor({ state: 'visible', timeout: 5000 })
          await agentCard.click()
          await ownerPage.waitForTimeout(500)
          await screenshot(ownerPage, '14-agent-detail-view.png')
        } catch {
          // Agent card may not be visible — skip detail screenshot
        }
      }

      // Settings page — buddy tab
      await ownerPage.goto('settings?tab=buddy')
      await ownerPage.waitForURL(/\/app\/settings/)
      await ownerPage.waitForTimeout(1000)
      await screenshot(ownerPage, '15-settings-buddy-tab.png')

      await ownerContext.close()
    })
  })
