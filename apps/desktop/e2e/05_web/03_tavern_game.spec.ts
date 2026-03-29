import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

type Session = {
  origin: string
  appBaseUrl: string
  owner: { email: string; password: string; displayName: string }
  viewer: { email: string; password: string; displayName: string }
  server: { id: string; slug: string; name: string; inviteCode: string }
  channels: { generalId: string; announcementsId: string }
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
  await page.locator('input[autocomplete="username"]').fill(user.email)
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

async function apiLogin(origin: string, email: string, password: string) {
  const res = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  return (await res.json()) as { accessToken: string }
}

async function apiRequest<T = unknown>(
  origin: string,
  urlPath: string,
  opts: { method?: string; token: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${origin}${urlPath}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`API ${opts.method ?? 'GET'} ${urlPath} failed: ${res.status} — ${text}`)
  }
  return text ? JSON.parse(text) : null
}

// ─── Tavern Game NPC Definitions ────────────────────

const TAVERN_NPCS = [
  {
    name: '酒保 · Barkeep',
    description: 'The innkeeper who runs the tavern, serving drinks and gossip.',
  },
  { name: '吟游诗人 · Bard', description: 'A traveling musician who sings tales of adventure.' },
  { name: '铁匠 · Blacksmith', description: 'The village blacksmith, forging weapons and armor.' },
]

const TAVERN_CHANNELS = [
  {
    name: '大厅',
    type: 'text',
    topic: 'The main hall of the tavern — all adventurers gather here.',
  },
  {
    name: '酒吧',
    type: 'text',
    topic: 'The bar counter — order drinks and chat with the barkeep.',
  },
  { name: '竞技场', type: 'text', topic: 'The arena — duel other adventurers for glory.' },
  { name: '铁匠铺', type: 'text', topic: 'The smithy — buy, sell, and repair equipment.' },
  {
    name: '公告板',
    type: 'announcement',
    topic: 'Quest board — check available quests and bounties.',
  },
]

// NPC → channel assignment: which NPCs are present in which channels
const NPC_CHANNEL_MAP: Record<string, string[]> = {
  大厅: ['酒保 · Barkeep', '吟游诗人 · Bard', '铁匠 · Blacksmith'],
  酒吧: ['酒保 · Barkeep', '吟游诗人 · Bard'],
  铁匠铺: ['铁匠 · Blacksmith'],
}

// Welcome messages NPCs send in their channels
const NPC_MESSAGES: Record<string, { channel: string; content: string }[]> = {
  '酒保 · Barkeep': [
    { channel: '大厅', content: '欢迎来到龙息酒馆！坐下来喝一杯吧，冒险者。🍺' },
    { channel: '酒吧', content: '今天推荐龙息特酿，只要 5 金币！' },
  ],
  '吟游诗人 · Bard': [
    { channel: '大厅', content: '🎵 听说最近有条巨龙出没在北方山脉，谁想去看看？' },
  ],
  '铁匠 · Blacksmith': [
    { channel: '铁匠铺', content: '⚒️ 新到一批精铁，可以打造传说级武器了。有需要的来找我！' },
  ],
}

test.describe
  .serial('Tavern Game — OAuth Platform App E2E', () => {
    test('full tavern game scenario: authorize → create server → NPCs → channels → messages', async ({
      browser,
    }) => {
      await ensureScreenshotDir()
      const session = await readSession()
      test.setTimeout(120_000)

      // ── Phase 1: Setup OAuth App via API ──

      const { accessToken } = await apiLogin(
        session.origin,
        session.owner.email,
        session.owner.password,
      )

      const CALLBACK_URL = 'https://tavern-game.example.com/callback'
      const app = await apiRequest<{
        id: string
        clientId: string
        clientSecret: string
      }>(session.origin, '/api/oauth/apps', {
        method: 'POST',
        token: accessToken,
        body: {
          name: '龙息酒馆 · Dragon Breath Tavern',
          description: 'A channel-based tavern RPG game with NPC Buddies',
          redirectUris: [CALLBACK_URL],
          homepageUrl: 'https://tavern-game.example.com',
        },
      })

      try {
        // ── Phase 2: UI Authorization Flow ──

        // Set locale to zh-CN so i18n renders Chinese text for assertions/screenshots
        const ctx = await browser.newContext({ locale: 'zh-CN' })
        const page = await ctx.newPage()
        await loginViaUi(page, session.owner)

        // Navigate to authorize page with all necessary scopes
        const scopes =
          'user:read servers:read servers:write channels:read channels:write messages:read messages:write buddies:create buddies:manage'
        const authorizeUrl = `oauth/authorize?response_type=code&client_id=${encodeURIComponent(app.clientId)}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${encodeURIComponent(scopes)}&state=tavern_setup`

        await page.goto(authorizeUrl)

        // Screenshot: OAuth authorize page with all scope groups
        await expect(page.getByText('授权应用')).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText('龙息酒馆 · Dragon Breath Tavern')).toBeVisible()
        await screenshot(page, '30-tavern-authorize-page.png')

        // Set up route intercept AFTER page loads (must not intercept the
        // initial navigation — the redirect_uri in the query string would match)
        let capturedCode = ''
        await page.route('**/tavern-game.example.com/**', async (route) => {
          const url = new URL(route.request().url())
          capturedCode = url.searchParams.get('code') ?? ''
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `<html><body style="background:#1a1a2e;color:#e0def4;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh">
            <div style="text-align:center"><div style="font-size:64px;margin-bottom:16px">🐉</div>
            <h1>龙息酒馆已授权</h1><p style="color:#908caa">正在准备您的冒险旅程...</p></div>
          </body></html>`,
          })
        })

        // Click Authorize
        await page.getByRole('button', { name: '授权' }).click()
        await page.waitForURL(/tavern-game\.example\.com\/callback/, { timeout: 15_000 })
        await page.waitForTimeout(500)
        await screenshot(page, '31-tavern-authorize-success.png')

        expect(capturedCode).toBeTruthy()

        // ── Phase 3: Exchange code for OAuth token ──

        const tokenRes = await fetch(`${session.origin}/api/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: capturedCode,
            client_id: app.clientId,
            client_secret: app.clientSecret,
            redirect_uri: CALLBACK_URL,
          }),
        })
        expect(tokenRes.ok).toBeTruthy()
        const { access_token: oauthToken } = (await tokenRes.json()) as { access_token: string }
        expect(oauthToken).toBeTruthy()

        // ── Phase 4: Create Tavern Server via OAuth API ──

        const tavernServer = await apiRequest<{ id: string; name: string; slug: string }>(
          session.origin,
          '/api/oauth/servers',
          {
            method: 'POST',
            token: oauthToken,
            body: { name: '龙息酒馆', description: 'A tavern RPG game world with NPC Buddies' },
          },
        )
        expect(tavernServer.id).toBeTruthy()

        // ── Phase 5: Create NPC Buddies via OAuth API ──

        const buddies: Record<string, { id: string; userId: string; agentId: string }> = {}
        for (const npc of TAVERN_NPCS) {
          const buddy = await apiRequest<{ id: string; userId: string; agentId: string }>(
            session.origin,
            '/api/oauth/buddies',
            {
              method: 'POST',
              token: oauthToken,
              body: { name: npc.name, kernelType: 'buddy' },
            },
          )
          buddies[npc.name] = buddy

          // Invite buddy to the tavern server
          await apiRequest(session.origin, `/api/oauth/servers/${tavernServer.id}/invite`, {
            method: 'POST',
            token: oauthToken,
            body: { userId: buddy.userId },
          })
        }

        // ── Phase 6: Create Tavern Channels via OAuth API ──

        const channels: Record<string, { id: string; name: string }> = {}
        for (const ch of TAVERN_CHANNELS) {
          const channel = await apiRequest<{ id: string; name: string }>(
            session.origin,
            '/api/oauth/channels',
            {
              method: 'POST',
              token: oauthToken,
              body: { serverId: tavernServer.id, name: ch.name, type: ch.type },
            },
          )
          channels[ch.name] = channel
        }

        // ── Phase 7: NPCs send welcome messages in their channels ──

        for (const [npcName, messages] of Object.entries(NPC_MESSAGES)) {
          const buddy = buddies[npcName]
          if (!buddy) continue
          for (const msg of messages) {
            const channel = channels[msg.channel]
            if (!channel) continue
            await apiRequest(session.origin, `/api/oauth/buddies/${buddy.id}/messages`, {
              method: 'POST',
              token: oauthToken,
              body: { channelId: channel.id, content: msg.content },
            })
          }
        }

        // ── Phase 8: UI Verification — Browse the tavern ──

        // Navigate to the tavern server
        await page.goto(`servers/${tavernServer.slug ?? tavernServer.id}`)
        await page.waitForTimeout(2000)
        await screenshot(page, '32-tavern-server-home.png')

        // Navigate to 大厅 channel
        const lobbyChannel = channels['大厅']
        if (lobbyChannel) {
          await page.goto(
            `servers/${tavernServer.slug ?? tavernServer.id}/channels/${lobbyChannel.id}`,
          )
          await page.waitForTimeout(2000)
          await screenshot(page, '33-tavern-lobby-channel.png')
        }

        // Navigate to 酒吧 channel
        const barChannel = channels['酒吧']
        if (barChannel) {
          await page.goto(
            `servers/${tavernServer.slug ?? tavernServer.id}/channels/${barChannel.id}`,
          )
          await page.waitForTimeout(2000)
          await screenshot(page, '34-tavern-bar-channel.png')
        }

        // Navigate to 铁匠铺 channel
        const smithyChannel = channels['铁匠铺']
        if (smithyChannel) {
          await page.goto(
            `servers/${tavernServer.slug ?? tavernServer.id}/channels/${smithyChannel.id}`,
          )
          await page.waitForTimeout(2000)
          await screenshot(page, '35-tavern-smithy-channel.png')
        }

        // Navigate to 竞技场 channel
        const arenaChannel = channels['竞技场']
        if (arenaChannel) {
          await page.goto(
            `servers/${tavernServer.slug ?? tavernServer.id}/channels/${arenaChannel.id}`,
          )
          await page.waitForTimeout(2000)
          await screenshot(page, '36-tavern-arena-channel.png')
        }

        // Navigate to 公告板 channel
        const questChannel = channels['公告板']
        if (questChannel) {
          await page.goto(
            `servers/${tavernServer.slug ?? tavernServer.id}/channels/${questChannel.id}`,
          )
          await page.waitForTimeout(2000)
          await screenshot(page, '37-tavern-quest-board.png')
        }

        await ctx.close()
      } finally {
        // Cleanup: delete the OAuth app (cascades to buddies, consents, etc.)
        await apiRequest(session.origin, `/api/oauth/apps/${app.id}`, {
          method: 'DELETE',
          token: accessToken,
        })
      }
    })
  })
