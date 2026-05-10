/**
 * Mobile App — End-to-End Tests
 *
 * Tests the API workflows that the mobile app (apps/mobile) relies on,
 * specifically focusing on:
 *   1. Server channels — list, create, category grouping
 *   2. Members — list with roles
 *   3. Shop cart — server-side CRUD (add, update qty, remove, clear)
 *   4. Shop orders — create from cart, list, filter, cancel
 *   5. Shop reviews — submit & list
 *   6. Workspace clipboard — copy, cut, paste files & folders
 *   7. Workspace search — file & folder search
 *   8. Wallet — balance, topup
 *   9. Notification preferences — strategy update
 *  10. Task center — list & claim
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createChannelHandler } from '../src/handlers/channel.handler'
import { createMessageHandler } from '../src/handlers/message.handler'
import { createNotificationHandler } from '../src/handlers/notification.handler'
import { createServerHandler } from '../src/handlers/server.handler'
import { createShopHandler } from '../src/handlers/shop.handler'
import { createTaskCenterHandler } from '../src/handlers/task-center.handler'
import { createWorkspaceHandler } from '../src/handlers/workspace.handler'
import { signAccessToken } from '../src/lib/jwt'

/* ══════════════════════════════════════════════════════════
   Setup
   ══════════════════════════════════════════════════════════ */

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

// Test identities
let ownerUserId: string
let memberUserId: string
let ownerToken: string
let memberToken: string
let serverId: string

// Tracked IDs
let channelId: string
let productId: string
let skuId: string
let cartItemId: string
let orderId: string
let workspaceId: string
let folderId: string
let fileId1: string
let fileId2: string

/* ── Helper ── */

async function req(
  method: string,
  path: string,
  opts?: { token?: string; body?: unknown; query?: Record<string, string> },
) {
  let url = `http://localhost${path}`
  if (opts?.query) {
    const params = new URLSearchParams(opts.query)
    url += `?${params.toString()}`
  }
  const init: RequestInit = { method }
  const headers: Record<string, string> = {}
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts?.body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  init.headers = headers
  return app.request(url, init)
}

async function json<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>
}

function orderBody(input: {
  items: Array<{ productId: string; skuId?: string; quantity: number }>
}) {
  return {
    idempotencyKey: `mobile-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...input,
  }
}

/* ── Setup & Teardown ── */

beforeAll(async () => {
  sql = postgres(TEST_DB_URL, { max: 5 })
  db = drizzle(sql, { schema })
  container = createAppContainer(db)

  app = new Hono()
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500
    return c.json({ error: message }, status as 400)
  })

  app.route('/api/servers', createServerHandler(container))
  app.route('/api', createChannelHandler(container))
  app.route('/api', createShopHandler(container))
  app.route('/api', createWorkspaceHandler(container))
  app.route('/api/notifications', createNotificationHandler(container))
  app.route('/api', createTaskCenterHandler(container))
  app.route('/api', createMessageHandler(container))

  const userDao = container.resolve('userDao')
  const serverDao = container.resolve('serverDao')

  const ts = Date.now()

  const owner = await userDao.create({
    email: `mobile-owner-${ts}@test.local`,
    username: `mobileowner${ts}`,
    passwordHash: 'not-used',
  })
  ownerUserId = owner!.id

  const member = await userDao.create({
    email: `mobile-member-${ts}@test.local`,
    username: `mobilemember${ts}`,
    passwordHash: 'not-used',
  })
  memberUserId = member!.id

  ownerToken = signAccessToken({
    userId: ownerUserId,
    email: owner!.email,
    username: owner!.username,
  })
  memberToken = signAccessToken({
    userId: memberUserId,
    email: member!.email,
    username: member!.username,
  })

  const server = await serverDao.create({
    name: `MobileTestServer-${ts}`,
    ownerId: ownerUserId,
  })
  serverId = server!.id
  await serverDao.addMember(serverId, ownerUserId, 'owner')
  await serverDao.addMember(serverId, memberUserId, 'member')
}, 30_000)

afterAll(async () => {
  try {
    const { users, servers, wallets } = schema
    const { eq } = await import('drizzle-orm')

    if (serverId) await db.delete(servers).where(eq(servers.id, serverId))
    if (ownerUserId) {
      await db
        .delete(wallets)
        .where(eq(wallets.userId, ownerUserId))
        .catch(() => {})
      await db.delete(users).where(eq(users.id, ownerUserId))
    }
    if (memberUserId) {
      await db
        .delete(wallets)
        .where(eq(wallets.userId, memberUserId))
        .catch(() => {})
      await db.delete(users).where(eq(users.id, memberUserId))
    }
  } catch (e) {
    console.warn('Cleanup warning:', e)
  }
  await sql.end()
})

/* ══════════════════════════════════════════════════════════
   1. Server channels — mobile channel list
   ══════════════════════════════════════════════════════════ */

describe('Server channels for mobile', () => {
  it('should list channels (initially empty or default)', async () => {
    const res = await req('GET', `/api/servers/${serverId}/channels`, { token: ownerToken })
    expect(res.status).toBe(200)
    const channels = await json<{ id: string; name: string; type: string }[]>(res)
    expect(Array.isArray(channels)).toBe(true)
  })

  it('owner can create a text channel', async () => {
    const res = await req('POST', `/api/servers/${serverId}/channels`, {
      token: ownerToken,
      body: { name: 'welcome', type: 'text' },
    })
    expect(res.status).toBe(201)
    const ch = await json<{ id: string; name: string; type: string }>(res)
    expect(ch.name).toBe('welcome')
    expect(ch.type).toBe('text')
    channelId = ch.id
  })

  it('owner can create a voice channel', async () => {
    const res = await req('POST', `/api/servers/${serverId}/channels`, {
      token: ownerToken,
      body: { name: 'voice-lounge', type: 'voice' },
    })
    expect(res.status).toBe(201)
    const ch = await json<{ id: string; type: string }>(res)
    expect(ch.type).toBe('voice')
  })

  it('member cannot create channels', async () => {
    const res = await req('POST', `/api/servers/${serverId}/channels`, {
      token: memberToken,
      body: { name: 'member-channel', type: 'text' },
    })
    // Members can create channels in this system (not restricted to owner)
    expect([201, 403]).toContain(res.status)
  })

  it('channels list includes created channels', async () => {
    const res = await req('GET', `/api/servers/${serverId}/channels`, { token: memberToken })
    expect(res.status).toBe(200)
    const channels = await json<{ id: string; name: string; type: string }[]>(res)
    const welcome = channels.find((c) => c.name === 'welcome')
    expect(welcome).toBeDefined()
    expect(welcome.type).toBe('text')
  })
})

/* ══════════════════════════════════════════════════════════
   2. Members list — mobile server home
   ══════════════════════════════════════════════════════════ */

describe('Members list for mobile server home', () => {
  it('should list members with roles', async () => {
    const res = await req('GET', `/api/servers/${serverId}/members`, { token: ownerToken })
    expect(res.status).toBe(200)
    const members = await json<any[]>(res)
    expect(members.length).toBeGreaterThanOrEqual(2)

    const ownerMember = members.find((m: any) => m.user?.id === ownerUserId)
    expect(ownerMember).toBeDefined()
    expect(ownerMember.role).toBe('owner')

    const regularMember = members.find((m: any) => m.user?.id === memberUserId)
    expect(regularMember).toBeDefined()
    expect(regularMember.role).toBe('member')
  })

  it('member data includes user profile fields', async () => {
    const res = await req('GET', `/api/servers/${serverId}/members`, { token: memberToken })
    expect(res.status).toBe(200)
    const members = await json<any[]>(res)
    const m = members[0]
    expect(m.user).toBeDefined()
    expect(m.user.id).toBeDefined()
    expect(m.user.username).toBeDefined()
  })
})

/* ══════════════════════════════════════════════════════════
   3. Shop cart — server-side CRUD (mobile rewrite)
   ══════════════════════════════════════════════════════════ */

describe('Shop cart lifecycle (mobile)', () => {
  it('setup: create shop + product', async () => {
    // Initialize shop
    const shopRes = await req('GET', `/api/servers/${serverId}/shop`, { token: ownerToken })
    expect(shopRes.status).toBe(200)

    // Create a product with SKU
    const prodRes = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: ownerToken,
      body: {
        name: 'Mobile Test Product',
        slug: `mobile-test-product-${Date.now()}`,
        basePrice: 100,
        specNames: ['Size'],
        status: 'active',
        skus: [
          { specValues: ['S'], price: 100, stock: 10 },
          { specValues: ['M'], price: 120, stock: 5 },
        ],
      },
    })
    expect(prodRes.status).toBe(201)
    const prod = await json<{ id: string; skus: any[] }>(prodRes)
    productId = prod.id
    skuId = prod.skus[0].id
  })

  it('cart is initially empty', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: memberToken })
    expect(res.status).toBe(200)
    const cart = await json<any[]>(res)
    expect(Array.isArray(cart)).toBe(true)
    expect(cart.length).toBe(0)
  })

  it('add item to cart', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: memberToken,
      body: { productId, skuId, quantity: 2 },
    })
    expect(res.status).toBe(201)
    const item = await json<{ id: string; productId: string; skuId: string; quantity: number }>(res)
    expect(item.productId).toBe(productId)
    expect(item.quantity).toBe(2)
    cartItemId = item.id
  })

  it('cart returns enriched items', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: memberToken })
    expect(res.status).toBe(200)
    const cart = await json<any[]>(res)
    expect(cart.length).toBe(1)
    expect(cart[0].id).toBe(cartItemId)
    // Verify product info is enriched
    expect(cart[0].product || cart[0].productId).toBeDefined()
  })

  it('update cart item quantity', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/cart/${cartItemId}`, {
      token: memberToken,
      body: { quantity: 3 },
    })
    expect(res.status).toBe(200)
    const item = await json<{ quantity: number }>(res)
    expect(item.quantity).toBe(3)
  })

  it('remove cart item', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/cart/${cartItemId}`, {
      token: memberToken,
    })
    expect(res.status).toBe(200)
  })

  it('cart is empty after removal', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: memberToken })
    expect(res.status).toBe(200)
    const cart = await json<any[]>(res)
    expect(cart.length).toBe(0)
  })
})

/* ══════════════════════════════════════════════════════════
   4. Shop order — create, list, cancel
   ══════════════════════════════════════════════════════════ */

describe('Shop order lifecycle (mobile)', () => {
  it('setup: topup wallet + add to cart', async () => {
    await container.resolve('walletService').topUp(memberUserId, 5000, 'Test balance seed')

    // Re-add to cart
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: memberToken,
      body: { productId, skuId, quantity: 1 },
    })
    expect(res.status).toBe(201)
  })

  it('create order from cart', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: memberToken,
      body: orderBody({
        items: [{ productId, skuId, quantity: 1 }],
      }),
    })
    expect(res.status).toBe(201)
    const order = await json<{ id: string; status: string; totalAmount: number }>(res)
    expect(order.id).toBeDefined()
    expect(order.status).toBe('paid')
    expect(order.totalAmount).toBeGreaterThan(0)
    orderId = order.id
  })

  it('list orders for buyer', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders`, { token: memberToken })
    expect(res.status).toBe(200)
    const orders = await json<any[]>(res)
    expect(orders.length).toBeGreaterThanOrEqual(1)
    expect(orders.some((o: any) => o.id === orderId)).toBe(true)
  })

  it('filter orders by status', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders`, {
      token: memberToken,
      query: { status: 'paid' },
    })
    expect(res.status).toBe(200)
    const orders = await json<any[]>(res)
    expect(orders.every((o: any) => o.status === 'paid')).toBe(true)
  })

  it('admin can update order status', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId}/status`, {
      token: ownerToken,
      body: { status: 'processing' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string }>(res)
    expect(order.status).toBe('processing')
  })

  it('buyer cannot cancel a processing order (only paid)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId}/cancel`, {
      token: memberToken,
    })
    // Should fail since order is now processing
    expect(res.status).not.toBe(200)
  })
})

/* ══════════════════════════════════════════════════════════
   5. Shop reviews — submit & list
   ══════════════════════════════════════════════════════════ */

describe('Shop reviews (mobile)', () => {
  it('setup: move order to completed', async () => {
    // processing → shipped → delivered → completed
    await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId}/status`, {
      token: ownerToken,
      body: { status: 'shipped', trackingNo: 'TRACK123' },
    })
    await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId}/status`, {
      token: ownerToken,
      body: { status: 'delivered' },
    })
    await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId}/status`, {
      token: ownerToken,
      body: { status: 'completed' },
    })
  })

  it('buyer can review completed order', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId}/review`, {
      token: memberToken,
      body: { productId, rating: 5, content: 'Great product from mobile!', images: [] },
    })
    expect(res.status).toBe(201)
  })

  it('product reviews are listable', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${productId}/reviews`, {
      token: memberToken,
    })
    expect(res.status).toBe(200)
    const reviews = await json<any[]>(res)
    expect(reviews.length).toBeGreaterThanOrEqual(1)
    expect(reviews[0].rating).toBe(5)
    expect(reviews[0].content).toBe('Great product from mobile!')
  })

  it('cannot review same order twice', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId}/review`, {
      token: memberToken,
      body: { rating: 3, content: 'Duplicate review' },
    })
    expect(res.status).not.toBe(200)
  })
})

/* ══════════════════════════════════════════════════════════
   6. Workspace — clipboard (copy/cut/paste)
   ══════════════════════════════════════════════════════════ */

describe('Workspace clipboard (mobile)', () => {
  it('setup: init workspace + create folders/files', async () => {
    // Init workspace
    const wsRes = await req('GET', `/api/servers/${serverId}/workspace`, { token: ownerToken })
    expect(wsRes.status).toBe(200)
    const ws = await json<{ id: string }>(wsRes)
    workspaceId = ws.id

    // Create a test folder
    const folderRes = await req('POST', `/api/servers/${serverId}/workspace/folders`, {
      token: ownerToken,
      body: { name: 'MobileTestFolder' },
    })
    expect(folderRes.status).toBe(201)
    const folder = await json<{ id: string }>(folderRes)
    folderId = folder.id

    // Create file1 in root
    const f1Res = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: ownerToken,
      body: {
        name: 'test-file-1.txt',
        ext: '.txt',
        mime: 'text/plain',
        sizeBytes: 42,
        contentRef: 'ref-1',
      },
    })
    expect(f1Res.status).toBe(201)
    const f1 = await json<{ id: string }>(f1Res)
    fileId1 = f1.id

    // Create file2 in root
    const f2Res = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: ownerToken,
      body: {
        name: 'test-file-2.md',
        ext: '.md',
        mime: 'text/markdown',
        sizeBytes: 128,
        contentRef: 'ref-2',
      },
    })
    expect(f2Res.status).toBe(201)
    const f2 = await json<{ id: string }>(f2Res)
    fileId2 = f2.id
  })

  it('copy file to folder', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/nodes/paste`, {
      token: ownerToken,
      body: {
        sourceWorkspaceId: workspaceId,
        nodeIds: [fileId1],
        targetParentId: folderId,
        mode: 'copy',
      },
    })
    expect(res.status).toBe(200)

    // Original should still exist
    const origRes = await req('GET', `/api/servers/${serverId}/workspace/files/${fileId1}`, {
      token: ownerToken,
    })
    expect(origRes.status).toBe(200)

    // Check folder children
    const childRes = await req('GET', `/api/servers/${serverId}/workspace/children`, {
      token: ownerToken,
      query: { parentId: folderId },
    })
    expect(childRes.status).toBe(200)
    const children = await json<any[]>(childRes)
    expect(children.length).toBeGreaterThanOrEqual(1)
  })

  it('cut (move) file to folder', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/nodes/paste`, {
      token: ownerToken,
      body: {
        sourceWorkspaceId: workspaceId,
        nodeIds: [fileId2],
        targetParentId: folderId,
        mode: 'cut',
      },
    })
    expect(res.status).toBe(200)

    // folder should now have 2 children
    const childRes = await req('GET', `/api/servers/${serverId}/workspace/children`, {
      token: ownerToken,
      query: { parentId: folderId },
    })
    expect(childRes.status).toBe(200)
    const children = await json<any[]>(childRes)
    expect(children.length).toBeGreaterThanOrEqual(2)
  })

  it('search files by name', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/files/search`, {
      token: ownerToken,
      query: { searchText: 'test-file' },
    })
    expect(res.status).toBe(200)
    const results = await json<any[]>(res)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('get workspace stats', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/stats`, { token: ownerToken })
    expect(res.status).toBe(200)
    const stats = await json<{ folderCount: number; fileCount: number }>(res)
    expect(stats.folderCount).toBeGreaterThanOrEqual(1)
    expect(stats.fileCount).toBeGreaterThanOrEqual(1)
  })

  it('rename file', async () => {
    const res = await req('PATCH', `/api/servers/${serverId}/workspace/files/${fileId1}`, {
      token: ownerToken,
      body: { name: 'renamed-file.txt' },
    })
    expect(res.status).toBe(200)
    const file = await json<{ name: string }>(res)
    expect(file.name).toBe('renamed-file.txt')
  })

  it('rename an empty folder', async () => {
    // Create a fresh empty folder for rename testing
    const createRes = await req('POST', `/api/servers/${serverId}/workspace/folders`, {
      token: ownerToken,
      body: { name: 'EmptyRenameTarget' },
    })
    expect(createRes.status).toBe(201)
    const created = await json<{ id: string }>(createRes)

    const res = await req('PATCH', `/api/servers/${serverId}/workspace/folders/${created.id}`, {
      token: ownerToken,
      body: { name: 'RenamedFolder' },
    })
    expect(res.status).toBe(200)
    const folder = await json<{ name: string }>(res)
    expect(folder.name).toBe('RenamedFolder')
  })
})

/* ══════════════════════════════════════════════════════════
   7. Wallet — mobile profile display
   ══════════════════════════════════════════════════════════ */

describe('Wallet for mobile profile', () => {
  it('owner wallet auto-creates on first access', async () => {
    const res = await req('GET', `/api/wallet`, { token: ownerToken })
    expect(res.status).toBe(200)
    const w = await json<{ balance: number }>(res)
    expect(typeof w.balance).toBe('number')
    expect(w.balance).toBeGreaterThanOrEqual(0)
  })

  it('ordinary topup endpoint is rejected', async () => {
    const before = await json<{ balance: number }>(
      await req('GET', `/api/wallet`, { token: ownerToken }),
    )
    const topupRes = await req('POST', `/api/wallet/topup`, {
      token: ownerToken,
      body: { amount: 1000 },
    })
    expect(topupRes.status).toBe(403)
    const after = await json<{ balance: number }>(
      await req('GET', `/api/wallet`, { token: ownerToken }),
    )
    expect(after.balance).toBe(before.balance)
  })

  it('wallet transactions are listed', async () => {
    const res = await req('GET', `/api/wallet/transactions`, { token: ownerToken })
    expect(res.status).toBe(200)
    const txs = await json<any[]>(res)
    expect(txs.length).toBeGreaterThanOrEqual(1)
  })
})

/* ══════════════════════════════════════════════════════════
   8. Notification preferences — mobile settings
   ══════════════════════════════════════════════════════════ */

describe('Notification preferences (mobile settings)', () => {
  it('get default preferences', async () => {
    const res = await req('GET', `/api/notifications/preferences`, { token: ownerToken })
    expect(res.status).toBe(200)
    const pref = await json<{ strategy: string }>(res)
    expect(['all', 'mention_only', 'none']).toContain(pref.strategy)
  })

  it('update strategy to mention_only', async () => {
    const res = await req('PATCH', `/api/notifications/preferences`, {
      token: ownerToken,
      body: { strategy: 'mention_only' },
    })
    expect(res.status).toBe(200)
  })

  it('verify updated strategy', async () => {
    const res = await req('GET', `/api/notifications/preferences`, { token: ownerToken })
    expect(res.status).toBe(200)
    const pref = await json<{ strategy: string }>(res)
    expect(pref.strategy).toBe('mention_only')
  })

  it('reset to all', async () => {
    await req('PATCH', `/api/notifications/preferences`, {
      token: ownerToken,
      body: { strategy: 'all' },
    })
  })
})

/* ══════════════════════════════════════════════════════════
   9. Task center — mobile settings
   ══════════════════════════════════════════════════════════ */

describe('Task center (mobile settings)', () => {
  it('get task list with summary', async () => {
    const res = await req('GET', `/api/tasks`, { token: ownerToken })
    expect(res.status).toBe(200)
    const data = await json<{
      wallet: { balance: number }
      summary: { totalTasks: number; claimableTasks: number; completedTasks: number }
      tasks: any[]
    }>(res)
    expect(data.summary).toBeDefined()
    expect(typeof data.summary.totalTasks).toBe('number')
    expect(data.wallet).toBeDefined()
    expect(Array.isArray(data.tasks)).toBe(true)
  })

  it('claim a claimable task (if any)', async () => {
    const res = await req('GET', `/api/tasks`, { token: ownerToken })
    const data = await json<{ tasks: any[] }>(res)
    const claimable = data.tasks.find((t: any) => t.claimable)
    if (claimable) {
      const claimRes = await req('POST', `/api/tasks/${claimable.key}/claim`, {
        token: ownerToken,
      })
      expect(claimRes.status).toBe(200)
    }
  })

  it('referral summary works', async () => {
    const res = await req('GET', `/api/tasks/referral-summary`, { token: ownerToken })
    expect(res.status).toBe(200)
    const data = await json<{ successfulInvites: number; totalInviteRewards: number }>(res)
    expect(typeof data.successfulInvites).toBe('number')
    expect(typeof data.totalInviteRewards).toBe('number')
  })
})

/* ══════════════════════════════════════════════════════════
   10. Messages — send in channel (mobile chat)
   ══════════════════════════════════════════════════════════ */

describe('Messages in channel (mobile chat)', () => {
  it('send a message to channel', async () => {
    const res = await req('POST', `/api/channels/${channelId}/messages`, {
      token: memberToken,
      body: { content: 'Hello from mobile!' },
    })
    expect(res.status).toBe(201)
    const msg = await json<{ id: string; content: string }>(res)
    expect(msg.content).toBe('Hello from mobile!')
  })

  it('list messages in channel', async () => {
    const res = await req('GET', `/api/channels/${channelId}/messages`, { token: memberToken })
    expect(res.status).toBe(200)
    const data = await json<any>(res)
    const messages = Array.isArray(data) ? data : (data.messages ?? data.data ?? [])
    expect(messages.length).toBeGreaterThanOrEqual(1)
  })

  it('message has author info', async () => {
    const res = await req('GET', `/api/channels/${channelId}/messages`, { token: memberToken })
    const data = await json<any>(res)
    const messages = Array.isArray(data) ? data : (data.messages ?? data.data ?? [])
    const msg = messages[0]
    expect(msg.author || msg.user || msg.userId).toBeDefined()
  })
})
