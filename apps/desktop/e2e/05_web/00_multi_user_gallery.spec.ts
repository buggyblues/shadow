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
  await page.getByPlaceholder('you@shadowob.com').fill(user.email)
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

async function openInviteTab(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Invite Links', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Invite Links', exact: true })).toBeVisible()
}

async function screenshot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotDir, name),
    fullPage: false,
  })
}

async function getAccessToken(page: import('@playwright/test').Page) {
  return page.evaluate(() => localStorage.getItem('accessToken'))
}

test.describe
  .serial('web multi-user screenshot scenarios', () => {
    test('captures real invite-gated multi-user flow', async ({ browser }) => {
      await ensureScreenshotDir()
      const session = await readSession()

      const ownerContext = await browser.newContext()
      const viewerContext = await browser.newContext()
      const ownerPage = await ownerContext.newPage()
      const viewerPage = await viewerContext.newPage()

      const inviteNote = `E2E viewer invite ${Date.now()}`

      await loginViaUi(ownerPage, session.owner)
      await openInviteTab(ownerPage)

      await ownerPage.getByRole('button', { name: /create link|创建链接/i }).click()
      await ownerPage.getByPlaceholder(/note|备注/i).fill(inviteNote)
      await ownerPage.getByRole('button', { name: /generate|生成/i }).click()

      const inviteRow = ownerPage
        .locator('div.bg-bg-secondary.rounded-xl.p-4')
        .filter({ hasText: inviteNote })
        .first()
      await expect(inviteRow).toBeVisible()
      const viewerInviteCode = (await inviteRow.locator('span.font-mono').innerText()).trim()

      await screenshot(ownerPage, '01-owner-invite-created.png')

      await registerViaUi(viewerPage, session.viewer, viewerInviteCode)

      await ownerPage.reload()
      await openInviteTab(ownerPage)
      const usedInviteRow = ownerPage
        .locator('div.bg-bg-secondary.rounded-xl.p-4')
        .filter({ hasText: inviteNote })
        .first()
      await expect(usedInviteRow).toBeVisible()
      await screenshot(ownerPage, '02-owner-invite-used.png')

      await viewerPage.goto(`invite/${session.server.inviteCode}`)
      await expect(
        viewerPage.getByRole('button', { name: /accept invitation|接受邀请/i }),
      ).toBeVisible()
      await screenshot(viewerPage, '03-viewer-server-invite.png')
      await viewerPage.getByRole('button', { name: /accept invitation|接受邀请/i }).click()
      await viewerPage.waitForURL(new RegExp(`/app/servers/${session.server.slug}`))

      const ownerToken = await getAccessToken(ownerPage)
      const viewerToken = await getAccessToken(viewerPage)
      if (!ownerToken || !viewerToken) {
        throw new Error('Expected both owner and viewer sessions to have access tokens')
      }

      const ownerApi = await request.newContext({
        baseURL: session.origin,
        extraHTTPHeaders: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
      })
      const viewerApi = await request.newContext({
        baseURL: session.origin,
        extraHTTPHeaders: {
          Authorization: `Bearer ${viewerToken}`,
          'Content-Type': 'application/json',
        },
      })

      const viewerMeResponse = await viewerApi.get('/api/auth/me')
      const viewerMe = await viewerMeResponse.json()

      await ownerApi.post(`/api/channels/${session.channels.generalId}/messages`, {
        data: {
          content:
            'Welcome to the E2E Studio — this channel is generated for reusable screenshots.',
        },
      })
      await viewerApi.post(`/api/channels/${session.channels.generalId}/messages`, {
        data: {
          content:
            'Joined successfully via invite. Real users, real flow, zero cardboard cut-outs.',
        },
      })
      await ownerApi.post(`/api/channels/${session.channels.announcementsId}/messages`, {
        data: {
          content:
            'Tonight: screenshot pipeline, invite-only onboarding, and collaboration capture.',
        },
      })

      const dmChannelResponse = await ownerApi.post('/api/dm/channels', {
        data: { userId: viewerMe.id },
      })
      const dmChannel = await dmChannelResponse.json()

      await ownerApi.post(`/api/dm/channels/${dmChannel.id}/messages`, {
        data: { content: 'Hey Ben — can you confirm the onboarding screenshots look authentic?' },
      })
      await viewerApi.post(`/api/dm/channels/${dmChannel.id}/messages`, {
        data: {
          content:
            'Confirmed. Invite gate worked, server join worked, and the screenshots look delightfully lived-in.',
        },
      })

      await viewerPage.goto(`servers/${session.server.slug}/channels/${session.channels.generalId}`)
      await expect(viewerPage.getByText(/Welcome to the E2E Studio/i).first()).toBeVisible()
      await screenshot(viewerPage, '04-team-general-channel.png')

      await viewerPage.goto(`servers/${session.server.slug}`)
      await viewerPage.waitForURL(new RegExp(`/app/servers/${session.server.slug}$`))
      await expect(viewerPage.getByText(session.server.name).first()).toBeVisible()
      await screenshot(viewerPage, '06-server-home.png')

      await viewerPage.goto('discover')
      await viewerPage.waitForURL(/\/app\/discover/)
      await expect(viewerPage.getByText(session.server.name).first()).toBeVisible()
      await screenshot(viewerPage, '07-discover-communities.png')

      await ownerPage.goto('buddies')
      await ownerPage.waitForURL(/\/app\/buddies/)
      await expect(ownerPage.locator('img[alt="Buddy"]').first()).toBeVisible()
      await screenshot(ownerPage, '08-buddy-marketplace.png')

      await viewerPage.goto(`servers/${session.server.slug}/shop`)
      await viewerPage.waitForURL(new RegExp(`/app/servers/${session.server.slug}/shop`))
      await expect(
        viewerPage.getByText(session.shop?.productNames?.[0] ?? 'Focus Sprint Bundle').first(),
      ).toBeVisible()
      await screenshot(viewerPage, '10-shop-storefront.png')

      await ownerPage.goto(`servers/${session.server.slug}/shop/admin`)
      await ownerPage.waitForURL(new RegExp(`/app/servers/${session.server.slug}/shop/admin`))
      await expect(ownerPage.getByText(/店铺管理|商品管理/i).first()).toBeVisible()
      await expect(
        ownerPage.getByText(session.shop?.productNames?.[1] ?? 'Buddy Ops Pass').first(),
      ).toBeVisible()
      await screenshot(ownerPage, '11-shop-admin.png')

      await ownerPage.goto(`servers/${session.server.slug}/apps`)
      await ownerPage.waitForURL(new RegExp(`/app/servers/${session.server.slug}/apps`))
      await expect(
        ownerPage.getByText(session.apps?.names?.[0] ?? 'Launchpad').first(),
      ).toBeVisible()
      await screenshot(ownerPage, '12-app-center.png')

      await viewerPage.goto(`servers/${session.server.slug}/workspace`)
      await viewerPage.waitForURL(new RegExp(`/app/servers/${session.server.slug}/workspace`))
      await expect(viewerPage.getByText(/工作区|workspace|文件|folder/i).first()).toBeVisible()
      await screenshot(viewerPage, '09-workspace.png')

      await ownerPage.goto(`dm/${dmChannel.id}`)
      await ownerPage.waitForURL(new RegExp(`/app/dm/${dmChannel.id}`))
      await expect(ownerPage.getByText(session.viewer.displayName).first()).toBeVisible()
      await screenshot(ownerPage, '05-owner-dm-thread.png')

      await ownerApi.dispose()
      await viewerApi.dispose()
      await ownerContext.close()
      await viewerContext.close()
    })
  })
