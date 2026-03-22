import fs from 'node:fs'
import path from 'node:path'
import { expect, request, test } from '@playwright/test'

/**
 * Demo Flow — captures the story of building a community from scratch.
 *
 * This spec performs REAL interactions (typing in forms, sending messages,
 * opening dialogs) and captures key-frame screenshots at each milestone.
 * The resulting images are fed into the demo GIF engine which interleaves
 * Apple-style title cards and smooth crossfade transitions.
 *
 * Frame naming: XX-scene-name.png (XX = sequential order)
 *
 * Prerequisites:
 *   - seed-screenshot-env.mjs must have run
 *   - App running locally (docker compose up or pnpm dev)
 */

type Session = {
  origin: string
  appBaseUrl: string
  owner: { email: string; password: string; displayName: string }
  viewer: { email: string; password: string; displayName: string }
  server: { id: string; slug: string; name: string; inviteCode: string }
  channels: { generalId: string; announcementsId: string }
  shop?: { categoryId: string; categoryName: string; productNames: string[] }
}

const repoRoot = process.cwd().endsWith(path.join('apps', 'desktop'))
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()

const sessionPath = process.env.E2E_SESSION_PATH
  ? path.resolve(process.env.E2E_SESSION_PATH)
  : path.resolve(repoRoot, 'docs/e2e/session.json')

const framesDir = process.env.E2E_DEMO_FRAMES_DIR
  ? path.resolve(process.env.E2E_DEMO_FRAMES_DIR)
  : path.resolve(repoRoot, 'docs/readme/showcase/demo-frames')

function readSession(): Session {
  return JSON.parse(fs.readFileSync(sessionPath, 'utf8'))
}

let frameSeq = 0
async function frame(page: import('@playwright/test').Page, name: string) {
  const seq = String(frameSeq++).padStart(2, '0')
  await page.screenshot({
    path: path.join(framesDir, `${seq}-${name}.png`),
    fullPage: false,
  })
}

async function loginViaApi(origin: string, email: string, password: string) {
  const ctx = await request.newContext({ baseURL: origin })
  const resp = await ctx.post('/api/auth/login', { data: { email, password } })
  const body = await resp.json()
  await ctx.dispose()
  return body.accessToken as string
}

function apiCtx(baseURL: string, token: string) {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe
  .serial('demo flow — building a community', () => {
    test('captures the creation journey', async ({ browser }) => {
      fs.mkdirSync(framesDir, { recursive: true })
      const s = readSession()

      // Obtain API tokens for both users
      const ownerToken = await loginViaApi(s.origin, s.owner.email, s.owner.password)
      const viewerToken = await loginViaApi(s.origin, s.viewer.email, s.viewer.password)
      const ownerApi = await apiCtx(s.origin, ownerToken)
      const viewerApi = await apiCtx(s.origin, viewerToken)

      // Single browser context — owner perspective, dark mode
      const ctx = await browser.newContext({ colorScheme: 'dark' })
      const page = await ctx.newPage()

      // Inject owner auth into localStorage
      await page.goto('/')
      await page.evaluate((t) => localStorage.setItem('accessToken', t), ownerToken)

      // ═══════════════════════════════════════════════════════════
      // ACT 1 — CREATE
      // ═══════════════════════════════════════════════════════════

      // Navigate to a server page first so the sidebar is loaded
      await page.goto(`servers/${s.server.slug}`)
      await page.waitForURL(new RegExp(`/app/servers/${s.server.slug}`))
      await page.waitForLoadState('networkidle')

      // ── f00: Create Server dialog ──
      // Open the Create Server dialog and type a server name
      await page.getByTitle('Create Server').click()
      await page.waitForTimeout(400)
      const serverNameInput = page.getByPlaceholder('Server Name')
      await expect(serverNameInput).toBeVisible()
      await serverNameInput.pressSequentially('Creators Studio', { delay: 75 })
      await page.waitForTimeout(200)
      await frame(page, 'create-server')

      // Dismiss — we show the experience, not actually create another server
      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.waitForTimeout(300)

      // ── f01: Server home page ──
      await page.goto(`servers/${s.server.slug}`)
      await page.waitForURL(new RegExp(`/app/servers/${s.server.slug}`))
      await expect(page.getByText(s.server.name).first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      await frame(page, 'server-home')

      // ── f02: Create Channel dialog ──
      // Make sure channel sidebar is visible by navigating to a channel
      await page.goto(`servers/${s.server.slug}/channels/${s.channels.generalId}`)
      await page.waitForLoadState('networkidle')

      const createChBtn = page.getByRole('button', { name: 'Create Channel' })
      const chBtnVisible = await createChBtn
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
      if (chBtnVisible) {
        await createChBtn.first().click()
        await page.waitForTimeout(400)
        const chNameInput = page.getByPlaceholder('Channel Name')
        await expect(chNameInput).toBeVisible()
        await chNameInput.pressSequentially('product-launch', { delay: 75 })
        await page.waitForTimeout(200)
        await frame(page, 'create-channel')
        await page.getByRole('button', { name: 'Cancel' }).click()
        await page.waitForTimeout(300)
      } else {
        // Fallback: screenshot the channel page as-is
        await frame(page, 'create-channel')
      }

      // ═══════════════════════════════════════════════════════════
      // ACT 2 — CONVERSE
      // ═══════════════════════════════════════════════════════════

      // Create a fresh channel via API so we get a truly empty canvas
      let freshChannelId: string
      try {
        const chResp = await ownerApi.post(`/api/servers/${s.server.id}/channels`, {
          data: { name: `demo-${Date.now().toString(36)}`, type: 'text' },
        })
        if (!chResp.ok()) throw new Error('channel create failed')
        const ch = await chResp.json()
        freshChannelId = ch.id
      } catch {
        // Fallback: use announcements channel (likely empty)
        freshChannelId = s.channels.announcementsId
      }

      // ── f03: Empty channel ──
      await page.goto(`servers/${s.server.slug}/channels/${freshChannelId}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)
      await frame(page, 'channel-empty')

      // ── f04: Typing a message ──
      const msgInput = page.getByPlaceholder(/^Message #/)
      await msgInput.click()
      await msgInput.pressSequentially('Hey everyone — our community is officially live! 🚀', {
        delay: 40,
      })
      await page.waitForTimeout(200)
      await frame(page, 'channel-typing')

      // ── f05: Message sent ──
      await msgInput.press('Enter')
      await expect(page.getByText(/community is officially live/).first()).toBeVisible({
        timeout: 5_000,
      })
      await frame(page, 'channel-sent')

      // ── f06: Active conversation (general channel) ──
      // Seed multiple messages to simulate a lively discussion
      await ownerApi.post(`/api/channels/${s.channels.generalId}/messages`, {
        data: { content: 'CodingCat shipped 3 new review templates — check workspace.' },
      })
      await viewerApi.post(`/api/channels/${s.channels.generalId}/messages`, {
        data: { content: 'Just joined via invite link. This community looks amazing!' },
      })
      await ownerApi.post(`/api/channels/${s.channels.generalId}/messages`, {
        data: { content: 'Sprint v2.4 release notes pushed to announcements 🚀' },
      })
      await viewerApi.post(`/api/channels/${s.channels.generalId}/messages`, {
        data: { content: 'The Focus Sprint Bundle went live in the shop — looks clean.' },
      })
      await ownerApi.post(`/api/channels/${s.channels.generalId}/messages`, {
        data: { content: 'Ahead of schedule. Great start everyone 🎉' },
      })

      await page.goto(`servers/${s.server.slug}/channels/${s.channels.generalId}`)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/Sprint v2.4/).first()).toBeVisible({ timeout: 5_000 })
      await frame(page, 'channel-active')

      // ═══════════════════════════════════════════════════════════
      // ACT 3 — CONNECT
      // ═══════════════════════════════════════════════════════════

      // Set up DM channel + seed messages
      const viewerMeResp = await viewerApi.get('/api/auth/me')
      const viewerMe = await viewerMeResp.json()
      const dmResp = await ownerApi.post('/api/dm/channels', {
        data: { userId: viewerMe.id },
      })
      const dmChannel = await dmResp.json()

      await ownerApi.post(`/api/dm/channels/${dmChannel.id}/messages`, {
        data: { content: 'Hey — can you review the launch screenshots before we ship?' },
      })
      await viewerApi.post(`/api/dm/channels/${dmChannel.id}/messages`, {
        data: { content: 'On it. Invite flow and onboarding both look solid 👍' },
      })

      // Navigate to DM and wait for messages
      await page.goto(`dm/${dmChannel.id}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(800)

      const dmLoaded = await page
        .getByText(/launch screenshots|onboarding/i)
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
      if (!dmLoaded) {
        await page.reload()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(800)
      }

      // ── f07: DM — typing a reply ──
      const dmInput = page.getByPlaceholder(/Send a message/i)
      await dmInput.click()
      await dmInput.pressSequentially('Ship schedule updated — see you in standup!', {
        delay: 40,
      })
      await page.waitForTimeout(200)
      await frame(page, 'dm-typing')

      // Send the typed message + inject more via API
      await dmInput.press('Enter')
      await viewerApi.post(`/api/dm/channels/${dmChannel.id}/messages`, {
        data: { content: 'Sounds good. Already reviewed the workspace docs 👍' },
      })
      await page.waitForTimeout(300)
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)

      // ── f08: DM conversation ──
      await frame(page, 'dm-conversation')

      // ═══════════════════════════════════════════════════════════
      // ACT 4 — EXPLORE
      // ═══════════════════════════════════════════════════════════

      // ── f09: AI Agents — buddy marketplace ──
      await page.goto('buddies')
      await page.waitForURL(/\/app\/buddies/)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      await frame(page, 'buddies')

      // ── f10: Shop storefront ──
      await page.goto(`servers/${s.server.slug}/shop`)
      await page.waitForURL(new RegExp(`/app/servers/${s.server.slug}/shop`))
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      await frame(page, 'shop')

      // ── f11: Workspace ──
      await page.goto(`servers/${s.server.slug}/workspace`)
      await page.waitForURL(new RegExp(`/app/servers/${s.server.slug}/workspace`))
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      await frame(page, 'workspace')

      // ── f12: Discover ──
      await page.goto('discover')
      await page.waitForURL(/\/app\/discover/)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      await frame(page, 'discover')

      // Cleanup
      await ownerApi.dispose()
      await viewerApi.dispose()
      await ctx.close()
    })
  })
