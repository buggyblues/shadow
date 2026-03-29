import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'

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

/** Clean up leftover test data from previous E2E runs */
async function cleanupTestData(origin: string, token: string) {
  // Delete OAuth apps created by THIS test (by name) to avoid interfering with parallel tests
  const apps = await apiRequest<{ id: string; name: string }[]>(origin, '/api/oauth/apps', {
    token,
  })
  for (const app of apps ?? []) {
    if (app.name === '龙息酒馆 · Dragon Breath Tavern') {
      try {
        await apiRequest(origin, `/api/oauth/apps/${app.id}`, { method: 'DELETE', token })
      } catch {
        /* best-effort */
      }
    }
  }

  // Delete agents created by this test (NPC agents)
  const agents = await apiRequest<{ id: string; name: string }[]>(origin, '/api/agents', { token })
  for (const agent of agents ?? []) {
    try {
      await apiRequest(origin, `/api/agents/${agent.id}`, { method: 'DELETE', token })
    } catch {
      /* best-effort */
    }
  }
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

      // Clean up leftover data from previous E2E runs
      await cleanupTestData(session.origin, accessToken)

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
          logoUrl: `${session.origin}/Logo.svg`,
        },
      })

      const agents: Record<string, { id: string; userId: string; token: string; name: string }> = {}

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
            contentType: 'text/html; charset=utf-8',
            body: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dragon Breath Tavern</title>
<style>
  @keyframes flicker { 0%,100%{opacity:1} 50%{opacity:0.85} }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  body{margin:0;background:#0a0a12;color:#e8d4a2;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
  .card{text-align:center;max-width:480px;padding:40px;position:relative}
  .dragon{font-size:72px;animation:float 3s ease-in-out infinite;image-rendering:pixelated;line-height:1}
  h1{font-size:20px;letter-spacing:3px;text-transform:uppercase;color:#f0c040;margin:12px 0 4px;text-shadow:0 0 20px rgba(240,192,64,0.4)}
  .subtitle{color:#a08050;font-size:13px;margin-bottom:24px}
  .status-box{background:#12121c;border:2px solid #3a2a10;padding:20px;border-radius:4px;text-align:left;font-size:13px;box-shadow:inset 0 0 30px rgba(240,192,64,0.05)}
  .status-box .label{color:#f0c040;font-weight:bold}
  .status-box .value{color:#60d060}
  .bar{margin-top:20px;height:3px;background:linear-gradient(90deg,transparent,#f0c040,transparent);animation:flicker 2s infinite}
  .stars{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;background:radial-gradient(1px 1px at 20% 30%,#fff3,transparent),radial-gradient(1px 1px at 40% 70%,#fff2,transparent),radial-gradient(1px 1px at 60% 20%,#fff3,transparent),radial-gradient(1px 1px at 80% 50%,#fff2,transparent),radial-gradient(1px 1px at 10% 80%,#fff3,transparent),radial-gradient(1px 1px at 70% 90%,#fff2,transparent)}
</style></head>
<body><div class="stars"></div><div class="card">
  <div class="dragon">&#x1F409;</div>
  <h1>Dragon Breath Tavern</h1>
  <p class="subtitle">Authorization granted. Preparing your adventure...</p>
  <div class="status-box">
    <p style="margin:0 0 4px"><span class="label">&#x2694;&#xFE0F; Quest:</span> <span class="value">Tavern Setup</span></p>
    <p style="margin:0"><span class="label">&#x1F4DC; Status:</span> <span class="value">AUTHORIZED</span></p>
  </div>
  <div class="bar"></div>
</div></body></html>`,
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

        // ── Phase 5: Create NPC Agents via Agent API (real OpenClaw connection) ──

        for (const npc of TAVERN_NPCS) {
          // Create agent using owner's JWT (not OAuth token)
          const agent = await apiRequest<{
            id: string
            userId: string
            botUser: { id: string; username: string }
          }>(session.origin, '/api/agents', {
            method: 'POST',
            token: accessToken,
            body: {
              name: npc.name,
              username:
                npc.name.split(' · ')[1]?.toLowerCase().replace(/\s+/g, '_') ?? `npc_${Date.now()}`,
              kernelType: 'openclaw',
            },
          })

          // Generate agent JWT token for Socket.IO connection
          const tokenRes = await apiRequest<{ token: string }>(
            session.origin,
            `/api/agents/${agent.id}/token`,
            { method: 'POST', token: accessToken },
          )

          agents[npc.name] = {
            id: agent.id,
            userId: agent.botUser?.id ?? agent.userId,
            token: tokenRes.token,
            name: npc.name,
          }
        }

        // Add all agents to the tavern server
        await apiRequest(session.origin, `/api/servers/${tavernServer.id}/agents`, {
          method: 'POST',
          token: accessToken,
          body: { agentIds: Object.values(agents).map((a) => a.id) },
        })

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

        // Add NPC bot users to all channels so they can join via Socket.IO
        for (const agent of Object.values(agents)) {
          for (const channel of Object.values(channels)) {
            await apiRequest(session.origin, `/api/channels/${channel.id}/members`, {
              method: 'POST',
              token: accessToken,
              body: { userId: agent.userId },
            })
          }
        }

        // ── Phase 7: NPCs connect via Socket.IO and send welcome messages ──

        const npcSockets: Socket[] = []
        for (const [npcName, messages] of Object.entries(NPC_MESSAGES)) {
          const agent = agents[npcName]
          if (!agent) continue

          // Connect via Socket.IO with agent JWT token
          const socket = io(session.origin, {
            auth: { token: agent.token },
            transports: ['websocket'],
            autoConnect: false,
          })

          // Wait for connection
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 10_000)
            socket.on('connect', () => {
              clearTimeout(timer)
              resolve()
            })
            socket.on('connect_error', (err) => {
              clearTimeout(timer)
              reject(err)
            })
            socket.connect()
          })
          npcSockets.push(socket)

          // Join channels and send messages
          for (const msg of messages) {
            const channel = channels[msg.channel]
            if (!channel) continue

            // Join channel room
            await new Promise<void>((resolve) => {
              socket.emit('channel:join', { channelId: channel.id }, () => resolve())
            })

            // Send message via Socket.IO
            socket.emit('message:send', {
              channelId: channel.id,
              content: msg.content,
            })

            // Small delay between messages to ensure ordering
            await new Promise((r) => setTimeout(r, 200))
          }
        }

        // Wait for messages to propagate
        await new Promise((r) => setTimeout(r, 1000))

        // Disconnect all NPC sockets
        for (const socket of npcSockets) {
          socket.disconnect()
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
        // Cleanup: delete the OAuth app (cascades to consents, etc.)
        try {
          await apiRequest(session.origin, `/api/oauth/apps/${app.id}`, {
            method: 'DELETE',
            token: accessToken,
          })
        } catch {
          /* may already be deleted by concurrent cleanup */
        }
        // Cleanup: delete created agents
        for (const agent of Object.values(agents ?? {})) {
          try {
            await apiRequest(session.origin, `/api/agents/${agent.id}`, {
              method: 'DELETE',
              token: accessToken,
            })
          } catch {
            /* best-effort cleanup */
          }
        }
      }
    })
  })
