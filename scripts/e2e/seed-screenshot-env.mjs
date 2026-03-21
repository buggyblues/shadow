import fs from 'node:fs/promises'
import path from 'node:path'

const origin = (process.env.E2E_ORIGIN ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const appBaseUrl = (process.env.E2E_APP_BASE_URL ?? `${origin}/app/`).replace(/([^/])$/, '$1/')
const sessionPath = process.env.E2E_SESSION_PATH
  ? path.resolve(process.env.E2E_SESSION_PATH)
  : path.resolve(process.cwd(), 'docs/e2e/session.json')

const admin = {
  email: process.env.ADMIN_EMAIL ?? 'admin@shadowob.app',
  password: process.env.ADMIN_PASSWORD ?? 'admin123456',
}

const runId = process.env.E2E_RUN_ID ?? Date.now().toString(36)

const owner = {
  email: process.env.E2E_OWNER_EMAIL ?? 'owner.e2e@shadowob.local',
  password: process.env.E2E_OWNER_PASSWORD ?? 'ShadowE2E123!',
  displayName: process.env.E2E_OWNER_DISPLAY_NAME ?? 'Ava Owner',
}

const viewer = {
  email: process.env.E2E_VIEWER_EMAIL ?? `viewer.${runId}@shadowob.local`,
  password: process.env.E2E_VIEWER_PASSWORD ?? 'ShadowE2E123!',
  displayName: process.env.E2E_VIEWER_DISPLAY_NAME ?? 'Ben Viewer',
}

const scenario = {
  serverName: process.env.E2E_SERVER_NAME ?? 'E2E Studio',
  serverSlug: process.env.E2E_SERVER_SLUG ?? 'e2e-studio',
  announcementChannelName: process.env.E2E_ANNOUNCEMENT_CHANNEL ?? 'announcements',
}

const showcase = {
  category: {
    name: process.env.E2E_SHOP_CATEGORY_NAME ?? 'Studio Kits',
    slug: process.env.E2E_SHOP_CATEGORY_SLUG ?? 'studio-kits',
  },
  products: [
    {
      name: 'Focus Sprint Bundle',
      slug: 'focus-sprint-bundle',
      summary: 'A ready-to-run sprint pack with templates, prompts, and async rituals.',
      description:
        'Includes sprint checklist, meeting scripts, and reusable collaboration templates for focused teams.',
      basePrice: 12900,
      status: 'active',
      tags: ['teamwork', 'workflow'],
      specNames: ['Plan'],
      skus: [{ specValues: ['Standard'], price: 12900, stock: 48, skuCode: 'FSB-STD' }],
    },
    {
      name: 'Buddy Ops Pass',
      slug: 'buddy-ops-pass',
      summary: 'Operational access for AI-native moderators and response helpers.',
      description:
        'Designed for communities that want Buddy-assisted support, moderation, and member onboarding.',
      basePrice: 29900,
      status: 'active',
      type: 'entitlement',
      tags: ['buddy', 'operations'],
      specNames: ['Tier'],
      entitlementConfig: [
        {
          type: 'custom',
          privilegeDescription: 'Buddy-assisted community operations access',
        },
      ],
      skus: [{ specValues: ['Pro'], price: 29900, stock: 16, skuCode: 'BOP-PRO' }],
    },
  ],
  agents: [
    {
      name: 'CodingCat',
      username: 'coding-cat',
      description:
        'Expert code reviewer and pair-programming buddy. Speaks Python, TypeScript, Go, and Rust.',
      kernelType: 'openclaw',
    },
    {
      name: 'DocuMeow',
      username: 'docu-meow',
      description:
        'Auto-generates documentation, meeting notes, and technical proposals from conversations.',
      kernelType: 'openclaw',
    },
    {
      name: 'GuardianCat',
      username: 'guardian-cat',
      description:
        'Community moderator that monitors channels, enforces rules, and welcomes new members.',
      kernelType: 'openclaw',
    },
  ],
  apps: [
    {
      name: 'Launchpad',
      slug: 'launchpad',
      description: 'A quick-launch board for community rituals, links, and handoff flows.',
      sourceType: 'url',
      sourceUrl: `${origin}/features`,
      status: 'active',
      isHomepage: true,
    },
    {
      name: 'Ops Console',
      slug: 'ops-console',
      description: 'A lightweight operational dashboard wired into the server app center.',
      sourceType: 'url',
      sourceUrl: `${origin}/pricing`,
      status: 'active',
      isHomepage: false,
    },
  ],
}

async function waitForAppReady() {
  const startedAt = Date.now()
  const timeoutMs = 180_000
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/api/servers/discover`)
      if (response.status < 500) {
        return
      }
      lastError = new Error(`Unexpected status ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  throw new Error(
    `Timed out waiting for ${origin}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

async function requestJson(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${origin}${url}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = data?.error ?? data?.message ?? `${response.status} ${response.statusText}`
    const error = new Error(message)
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

async function login(email, password) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

async function register({ email, password, displayName, inviteCode }) {
  return requestJson('/api/auth/register', {
    method: 'POST',
    body: { email, password, displayName, inviteCode },
  })
}

async function createInvite(token, note) {
  const [invite] = await requestJson('/api/invite-codes', {
    method: 'POST',
    token,
    body: { count: 1, note },
  })
  return invite
}

async function ensureOwnerAccount() {
  try {
    return await login(owner.email, owner.password)
  } catch (error) {
    if (error.status !== 401) {
      throw error
    }
  }

  const adminSession = await login(admin.email, admin.password)
  const bootstrapInvite = await createInvite(adminSession.accessToken, 'E2E bootstrap owner invite')
  const ownerSession = await register({
    ...owner,
    inviteCode: bootstrapInvite.code,
  })
  return ownerSession
}

async function ensureServer(token) {
  const memberships = await requestJson('/api/servers', { token })
  let server = memberships
    .map((item) => item.server ?? item)
    .find((item) => item.slug === scenario.serverSlug || item.name === scenario.serverName)

  if (!server) {
    server = await requestJson('/api/servers', {
      method: 'POST',
      token,
      body: {
        name: scenario.serverName,
        slug: scenario.serverSlug,
        description: 'Reusable E2E collaboration studio for screenshot scenarios.',
        isPublic: true,
      },
    })
  }

  const serverDetail = await requestJson(`/api/servers/${server.slug ?? server.id}`, { token })
  const channels = await requestJson(
    `/api/servers/${serverDetail.slug ?? serverDetail.id}/channels`,
    { token },
  )

  let announcements = channels.find((channel) => channel.name === scenario.announcementChannelName)
  if (!announcements) {
    announcements = await requestJson(
      `/api/servers/${serverDetail.slug ?? serverDetail.id}/channels`,
      {
        method: 'POST',
        token,
        body: {
          name: scenario.announcementChannelName,
          type: 'announcement',
          topic: 'E2E updates and release notes.',
        },
      },
    )
  }

  const refreshedChannels = await requestJson(
    `/api/servers/${serverDetail.slug ?? serverDetail.id}/channels`,
    {
      token,
    },
  )
  const general = refreshedChannels.find((channel) => channel.name === 'general')

  if (!general) {
    throw new Error('Expected default general channel to exist after creating E2E server')
  }

  return {
    server: serverDetail,
    channels: {
      general,
      announcements,
    },
  }
}

async function ensureShopShowcase(token, serverId) {
  const categories = await requestJson(`/api/servers/${serverId}/shop/categories`, { token })
  let category = categories.find((item) => item.slug === showcase.category.slug)

  if (!category) {
    category = await requestJson(`/api/servers/${serverId}/shop/categories`, {
      method: 'POST',
      token,
      body: {
        name: showcase.category.name,
        slug: showcase.category.slug,
        position: 0,
      },
    })
  }

  const productsResult = await requestJson(`/api/servers/${serverId}/shop/products`, { token })
  const products = Array.isArray(productsResult) ? productsResult : (productsResult.products ?? [])

  const ensuredProducts = []
  for (const product of showcase.products) {
    let existing = products.find((item) => item.slug === product.slug)
    if (!existing) {
      existing = await requestJson(`/api/servers/${serverId}/shop/products`, {
        method: 'POST',
        token,
        body: {
          ...product,
          categoryId: category.id,
        },
      })
    }
    ensuredProducts.push(existing)
  }

  return {
    category,
    products: ensuredProducts,
  }
}

async function ensureAppShowcase(token, serverId) {
  const appsResult = await requestJson(`/api/servers/${serverId}/apps`, { token })
  const apps = Array.isArray(appsResult) ? appsResult : (appsResult.items ?? [])

  const ensuredApps = []
  for (const app of showcase.apps) {
    let existing = apps.find((item) => item.slug === app.slug || item.name === app.name)
    if (!existing) {
      existing = await requestJson(`/api/servers/${serverId}/apps`, {
        method: 'POST',
        token,
        body: app,
      })
    }
    ensuredApps.push(existing)
  }

  return { apps: ensuredApps }
}

async function ensureAgentShowcase(token, serverId) {
  const agents = await requestJson('/api/agents', { token })

  const ensuredAgents = []
  for (const agent of showcase.agents) {
    let existing = agents.find((item) => item.botUser?.username === agent.username || item.botUser?.displayName === agent.name)
    if (!existing) {
      existing = await requestJson('/api/agents', {
        method: 'POST',
        token,
        body: agent,
      })
    }
    ensuredAgents.push(existing)
  }

  // Add agents to server as members
  for (const agent of ensuredAgents) {
    try {
      await requestJson(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        token,
        body: { agentIds: [agent.id] },
      })
    } catch {
      // Agent may already be a member
    }
  }

  return { agents: ensuredAgents }
}

async function main() {
  await waitForAppReady()

  const ownerSession = await ensureOwnerAccount()
  const { server, channels } = await ensureServer(ownerSession.accessToken)
  const shop = await ensureShopShowcase(ownerSession.accessToken, server.slug ?? server.id)
  const apps = await ensureAppShowcase(ownerSession.accessToken, server.slug ?? server.id)
  const agentsShowcase = await ensureAgentShowcase(ownerSession.accessToken, server.slug ?? server.id)

  const session = {
    generatedAt: new Date().toISOString(),
    runId,
    origin,
    appBaseUrl,
    owner: {
      email: owner.email,
      password: owner.password,
      displayName: owner.displayName,
    },
    viewer: {
      email: viewer.email,
      password: viewer.password,
      displayName: viewer.displayName,
    },
    server: {
      id: server.id,
      slug: server.slug ?? server.id,
      name: server.name,
      inviteCode: server.inviteCode,
    },
    channels: {
      generalId: channels.general.id,
      announcementsId: channels.announcements.id,
    },
    shop: {
      categoryId: shop.category.id,
      categoryName: shop.category.name,
      productNames: shop.products.map((item) => item.name),
    },
    apps: {
      names: apps.apps.map((item) => item.name),
    },
    agents: {
      names: agentsShowcase.agents.map((item) => item.botUser?.displayName ?? item.name),
      ids: agentsShowcase.agents.map((item) => item.id),
    },
  }

  await fs.mkdir(path.dirname(sessionPath), { recursive: true })
  await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8')

  console.log(`Seeded E2E scenario and wrote session to ${sessionPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
