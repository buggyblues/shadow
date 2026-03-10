/**
 * Shop System — End-to-End Tests
 *
 * Tests the complete shop lifecycle against a real PostgreSQL database:
 *   1. Shop creation & settings
 *   2. Category CRUD
 *   3. Product CRUD, filtering, search
 *   4. Product detail with media & SKU
 *   5. Wallet top-up & balance
 *   6. Cart operations
 *   7. Order creation & payment flow
 *   8. Order management (admin)
 *   9. Order cancellation & refund
 *  10. Review & rating
 *  11. Entitlement provisioning
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAppContainer, type AppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createShopHandler } from '../src/handlers/shop.handler'
import { signAccessToken } from '../src/lib/jwt'

/* ══════════════════════════════════════════════════════════
   Setup — connects to real Postgres, creates test users/server
   ══════════════════════════════════════════════════════════ */

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

// Test identities
let adminUserId: string
let buyerUserId: string
let adminToken: string
let buyerToken: string
let serverId: string

// IDs tracked across tests
let shopId: string
let categoryId1: string
let categoryId2: string
let productId1: string  // physical product
let productId2: string  // entitlement product
let skuId1: string
let skuId2: string
let cartItemId: string
let orderId1: string
let orderId2: string // for cancel test
let orderNo1: string

/* ── Helper: make HTTP request through Hono ── */

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

/* ── Setup & Teardown ── */

beforeAll(async () => {
  sql = postgres(TEST_DB_URL, { max: 5 })
  db = drizzle(sql, { schema })
  container = createAppContainer(db)

  // Build Hono app with shop routes + global error handler
  app = new Hono()

  // Mirror the global onError from app.ts so thrown errors get proper status codes
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500
    return c.json({ error: message }, status as 400)
  })

  app.route('/api', createShopHandler(container))

  // Create test users directly in DB
  const userDao = container.resolve('userDao')
  const serverDao = container.resolve('serverDao')

  const ts = Date.now()
  const admin = await userDao.create({
    email: `shop-admin-${ts}@test.local`,
    username: `shopadmin${ts}`,
    passwordHash: 'not-used',
  })
  adminUserId = admin!.id

  const buyer = await userDao.create({
    email: `shop-buyer-${ts}@test.local`,
    username: `shopbuyer${ts}`,
    passwordHash: 'not-used',
  })
  buyerUserId = buyer!.id

  adminToken = signAccessToken({ userId: adminUserId, email: admin!.email, username: admin!.username })
  buyerToken = signAccessToken({ userId: buyerUserId, email: buyer!.email, username: buyer!.username })

  // Create a server + admin membership
  const server = await serverDao.create({ name: `ShopTestServer-${ts}`, ownerId: adminUserId })
  serverId = server!.id
  await serverDao.addMember(serverId, adminUserId, 'owner')
  await serverDao.addMember(serverId, buyerUserId, 'member')
}, 30_000)

afterAll(async () => {
  // Cleanup: remove test data in reverse FK order
  try {
    const { users, members, servers } = schema
    const { eq } = await import('drizzle-orm')

    // Clean shop-related data via cascade from server deletion
    if (serverId) {
      await db.delete(servers).where(eq(servers.id, serverId))
    }

    // Delete wallets
    if (buyerUserId) {
      const { wallets } = schema
      await db.delete(wallets).where(eq(wallets.userId, buyerUserId))
    }
    if (adminUserId) {
      const { wallets } = schema
      await db.delete(wallets).where(eq(wallets.userId, adminUserId))
    }

    // Delete users
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId))
    if (buyerUserId) await db.delete(users).where(eq(users.id, buyerUserId))
  } catch (e) {
    console.warn('Cleanup warning:', e)
  }
  await sql.end()
})

/* ══════════════════════════════════════════════════════════
   1. Shop — auto-creation & settings
   ══════════════════════════════════════════════════════════ */

describe('Shop metadata', () => {
  it('should auto-create shop on first GET', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop`, { token: adminToken })
    expect(res.status).toBe(200)
    const shop = await json<{ id: string; serverId: string; name: string; status: string }>(res)
    expect(shop.id).toBeDefined()
    expect(shop.serverId).toBe(serverId)
    expect(shop.status).toBe('active')
    shopId = shop.id
  })

  it('should return same shop on subsequent GET', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop`, { token: buyerToken })
    expect(res.status).toBe(200)
    const shop = await json<{ id: string }>(res)
    expect(shop.id).toBe(shopId)
  })

  it('admin can update shop settings', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop`, {
      token: adminToken,
      body: { name: '测试小店', description: '这是一家测试用的虾币商店' },
    })
    expect(res.status).toBe(200)
    const shop = await json<{ name: string; description: string }>(res)
    expect(shop.name).toBe('测试小店')
    expect(shop.description).toBe('这是一家测试用的虾币商店')
  })

  it('non-admin cannot update shop', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop`, {
      token: buyerToken,
      body: { name: 'Hacked' },
    })
    expect(res.status).toBe(403)
  })

  it('unauthenticated request is rejected', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop`)
    expect(res.status).toBe(401)
  })
})

/* ══════════════════════════════════════════════════════════
   2. Categories — CRUD
   ══════════════════════════════════════════════════════════ */

describe('Categories', () => {
  it('admin can create category', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/categories`, {
      token: adminToken,
      body: { name: '数码产品', slug: 'digital', position: 0 },
    })
    expect(res.status).toBe(201)
    const cat = await json<{ id: string; name: string; slug: string }>(res)
    expect(cat.name).toBe('数码产品')
    categoryId1 = cat.id
  })

  it('admin can create second category', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/categories`, {
      token: adminToken,
      body: { name: '权益商品', slug: 'entitlements', position: 1 },
    })
    expect(res.status).toBe(201)
    const cat = await json<{ id: string }>(res)
    categoryId2 = cat.id
  })

  it('lists all categories', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/categories`, { token: buyerToken })
    expect(res.status).toBe(200)
    const cats = await json<{ id: string }[]>(res)
    expect(cats.length).toBeGreaterThanOrEqual(2)
  })

  it('admin can update category', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/categories/${categoryId1}`, {
      token: adminToken,
      body: { name: '数码好物' },
    })
    expect(res.status).toBe(200)
    const cat = await json<{ name: string }>(res)
    expect(cat.name).toBe('数码好物')
  })

  it('non-admin cannot create category', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/categories`, {
      token: buyerToken,
      body: { name: 'Hacked', slug: 'hacked' },
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   3. Products — create, list, filter, search
   ══════════════════════════════════════════════════════════ */

describe('Products — CRUD & listing', () => {
  it('admin creates physical product with media & SKU', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: {
        name: '虾币充值卡A',
        slug: 'recharge-a',
        type: 'physical',
        status: 'active',
        summary: '100 虾币充值卡',
        description: '这是一张充值卡',
        basePrice: 100,
        tags: ['充值', '热销'],
        categoryId: categoryId1,
        specNames: ['面额'],
        media: [
          { url: 'https://img.test/card1.jpg', type: 'image', position: 0 },
          { url: 'https://img.test/card2.jpg', type: 'image', position: 1 },
        ],
        skus: [
          { specValues: ['50虾币'], price: 50, stock: 100, skuCode: 'RC-50' },
          { specValues: ['100虾币'], price: 100, stock: 50, skuCode: 'RC-100' },
        ],
      },
    })
    expect(res.status).toBe(201)
    const product = await json<{
      id: string
      name: string
      type: string
      status: string
      media: { url: string }[]
      skus: { id: string; specValues: string[]; price: number; stock: number }[]
    }>(res)
    expect(product.name).toBe('虾币充值卡A')
    expect(product.type).toBe('physical')
    expect(product.status).toBe('active')
    expect(product.media).toHaveLength(2)
    expect(product.skus).toHaveLength(2)

    productId1 = product.id
    skuId1 = product.skus.find((s) => s.price === 50)!.id
    skuId2 = product.skus.find((s) => s.price === 100)!.id
  })

  it('admin creates entitlement product', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: {
        name: 'VIP会员',
        slug: 'vip-member',
        type: 'entitlement',
        status: 'active',
        summary: '解锁VIP频道权限',
        basePrice: 200,
        tags: ['VIP', '权益'],
        categoryId: categoryId2,
        entitlementConfig: {
          type: 'channel_access',
          targetId: 'fake-channel-id',
          durationSeconds: 86400 * 30,
          privilegeDescription: 'VIP频道30天访问权限',
        },
        skus: [{ specValues: ['30天'], price: 200, stock: 999 }],
      },
    })
    expect(res.status).toBe(201)
    const product = await json<{ id: string; type: string; entitlementConfig: unknown }>(res)
    expect(product.type).toBe('entitlement')
    expect(product.entitlementConfig).toBeDefined()
    productId2 = product.id
  })

  it('admin creates draft product (not visible to buyers)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '草稿商品', slug: 'draft-item', status: 'draft', basePrice: 50 },
    })
    expect(res.status).toBe(201)
  })

  it('non-admin cannot create product', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: buyerToken,
      body: { name: 'Hack', slug: 'hack', basePrice: 0 },
    })
    expect(res.status).toBe(403)
  })

  it('buyer sees only active products', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, { token: buyerToken })
    expect(res.status).toBe(200)
    const data = await json<{ products: { id: string; status: string }[]; total: number }>(res)
    expect(data.products.every((p) => p.status === 'active')).toBe(true)
    expect(data.total).toBe(data.products.length)
    // draft product should not be in this list
    expect(data.products.length).toBeGreaterThanOrEqual(2)
  })

  it('admin sees all products including drafts', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, { token: adminToken })
    expect(res.status).toBe(200)
    const data = await json<{ products: { status: string }[]; total: number }>(res)
    // Admin should see at least 3: 2 active + 1 draft
    expect(data.products.length).toBeGreaterThanOrEqual(3)
    expect(data.products.some((p) => p.status === 'draft')).toBe(true)
  })

  it('filter by category', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerToken,
      query: { categoryId: categoryId1 },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: { id: string }[] }>(res)
    expect(data.products.length).toBe(1)
    expect(data.products[0]!.id).toBe(productId1)
  })

  it('search by keyword', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerToken,
      query: { keyword: '充值' },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: { name: string }[] }>(res)
    expect(data.products.length).toBeGreaterThanOrEqual(1)
    expect(data.products[0]!.name).toContain('充值')
  })

  it('search with no results', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerToken,
      query: { keyword: 'zzzznotexist999' },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: unknown[]; total: number }>(res)
    expect(data.products).toHaveLength(0)
    expect(data.total).toBe(0)
  })
})

/* ══════════════════════════════════════════════════════════
   4. Product detail & update
   ══════════════════════════════════════════════════════════ */

describe('Product detail & update', () => {
  it('get product detail with media and skus', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${productId1}`, { token: buyerToken })
    expect(res.status).toBe(200)
    const p = await json<{
      id: string
      name: string
      media: { url: string }[]
      skus: { id: string; specValues: string[] }[]
    }>(res)
    expect(p.id).toBe(productId1)
    expect(p.name).toBe('虾币充值卡A')
    expect(p.media).toHaveLength(2)
    expect(p.skus).toHaveLength(2)
  })

  it('admin can update product name and price', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${productId1}`, {
      token: adminToken,
      body: { name: '虾币充值卡 Pro', basePrice: 120 },
    })
    expect(res.status).toBe(200)
    const p = await json<{ name: string; basePrice: number }>(res)
    expect(p.name).toBe('虾币充值卡 Pro')
    expect(p.basePrice).toBe(120)
  })

  it('admin can update product media (replace all)', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${productId1}`, {
      token: adminToken,
      body: {
        media: [{ url: 'https://img.test/new-card.jpg', type: 'image', position: 0 }],
      },
    })
    expect(res.status).toBe(200)
    const p = await json<{ media: { url: string }[] }>(res)
    expect(p.media).toHaveLength(1)
    expect(p.media[0]!.url).toBe('https://img.test/new-card.jpg')
  })

  it('admin can change product status to archived', async () => {
    // Create a temp product to archive
    const createRes = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '待归档', slug: 'to-archive', status: 'active', basePrice: 10 },
    })
    const tempProduct = await json<{ id: string }>(createRes)

    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${tempProduct.id}`, {
      token: adminToken,
      body: { status: 'archived' },
    })
    expect(res.status).toBe(200)
    const p = await json<{ status: string }>(res)
    expect(p.status).toBe('archived')

    // Buyer should NOT see archived product
    const listRes = await req('GET', `/api/servers/${serverId}/shop/products`, { token: buyerToken })
    const data = await json<{ products: { id: string }[] }>(listRes)
    expect(data.products.find((pr) => pr.id === tempProduct.id)).toBeUndefined()

    // Cleanup
    await req('DELETE', `/api/servers/${serverId}/shop/products/${tempProduct.id}`, { token: adminToken })
  })

  it('non-admin cannot update product', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${productId1}`, {
      token: buyerToken,
      body: { name: 'Hacked' },
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   5. Wallet — top-up & balance
   ══════════════════════════════════════════════════════════ */

describe('Wallet', () => {
  it('wallet auto-created on first access', async () => {
    const res = await req('GET', '/api/wallet', { token: buyerToken })
    expect(res.status).toBe(200)
    const wallet = await json<{ id: string; balance: number; userId: string }>(res)
    expect(wallet.userId).toBe(buyerUserId)
    expect(wallet.balance).toBe(0)
  })

  it('top up wallet', async () => {
    const res = await req('POST', '/api/wallet/topup', {
      token: buyerToken,
      body: { amount: 5000, note: '测试充值' },
    })
    expect(res.status).toBe(200)
    const wallet = await json<{ balance: number }>(res)
    expect(wallet.balance).toBe(5000)
  })

  it('top up again and verify accumulation', async () => {
    const res = await req('POST', '/api/wallet/topup', {
      token: buyerToken,
      body: { amount: 1000 },
    })
    expect(res.status).toBe(200)
    const wallet = await json<{ balance: number }>(res)
    expect(wallet.balance).toBe(6000)
  })

  it('check transaction history', async () => {
    const res = await req('GET', '/api/wallet/transactions', { token: buyerToken })
    expect(res.status).toBe(200)
    const txs = await json<{ type: string; amount: number }[]>(res)
    expect(txs.length).toBeGreaterThanOrEqual(2)
    expect(txs.every((t) => t.type === 'topup')).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════
   6. Cart — add, update, remove
   ══════════════════════════════════════════════════════════ */

describe('Cart', () => {
  it('add product to cart (with SKU)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerToken,
      body: { productId: productId1, skuId: skuId1, quantity: 2 },
    })
    expect(res.status).toBe(201)
    const item = await json<{ id: string; quantity: number }>(res)
    expect(item.quantity).toBe(2)
    cartItemId = item.id
  })

  it('get cart with enriched product info', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerToken })
    expect(res.status).toBe(200)
    const items = await json<{ id: string; product: { name: string } | null; sku: { price: number } | null; unitPrice: number }[]>(res)
    expect(items.length).toBeGreaterThanOrEqual(1)
    const item = items.find((i) => i.id === cartItemId)!
    expect(item.product?.name).toContain('虾币充值卡')
    expect(item.sku?.price).toBe(50)
    expect(item.unitPrice).toBe(50)
  })

  it('update cart item quantity', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/cart/${cartItemId}`, {
      token: buyerToken,
      body: { quantity: 3 },
    })
    expect(res.status).toBe(200)
  })

  it('add second product item to cart', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerToken,
      body: { productId: productId2, quantity: 1 },
    })
    expect(res.status).toBe(201)
  })

  it('cart should have 2 items now', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerToken })
    expect(res.status).toBe(200)
    const items = await json<unknown[]>(res)
    expect(items.length).toBe(2)
  })

  it('remove first item from cart', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/cart/${cartItemId}`, { token: buyerToken })
    expect(res.status).toBe(200)

    // Verify only 1 item left
    const getRes = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerToken })
    const items = await json<unknown[]>(getRes)
    expect(items.length).toBe(1)
  })

  it('cannot add non-active product to cart', async () => {
    // Create draft product
    const createRes = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '不可加入购物车', slug: 'no-cart', status: 'draft', basePrice: 10 },
    })
    const draftProduct = await json<{ id: string }>(createRes)

    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerToken,
      body: { productId: draftProduct.id, quantity: 1 },
    })
    expect(res.status).toBe(400)

    // Cleanup
    await req('DELETE', `/api/servers/${serverId}/shop/products/${draftProduct.id}`, { token: adminToken })
  })
})

/* ══════════════════════════════════════════════════════════
   7. Order — creation with payment flow
   ══════════════════════════════════════════════════════════ */

describe('Order — creation & payment', () => {
  it('create order for physical product', async () => {
    // Check balance before
    const walletBefore = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerToken }),
    )
    const balanceBefore = walletBefore.balance

    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      body: {
        items: [{ productId: productId1, skuId: skuId1, quantity: 2 }],
        buyerNote: '请尽快发货',
      },
    })
    expect(res.status).toBe(201)
    const order = await json<{
      id: string
      orderNo: string
      status: string
      totalAmount: number
      buyerNote: string
      items: { productName: string; price: number; quantity: number }[]
    }>(res)
    expect(order.status).toBe('paid')
    expect(order.totalAmount).toBe(100) // 50 * 2
    expect(order.buyerNote).toBe('请尽快发货')
    expect(order.items).toHaveLength(1)
    expect(order.items[0]!.quantity).toBe(2)
    expect(order.items[0]!.price).toBe(50)
    orderId1 = order.id
    orderNo1 = order.orderNo

    // Check balance deducted
    const walletAfter = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerToken }),
    )
    expect(walletAfter.balance).toBe(balanceBefore - 100)
  })

  it('create order for entitlement product', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      body: { items: [{ productId: productId2, quantity: 1 }] },
    })
    expect(res.status).toBe(201)
    const order = await json<{ id: string; status: string; totalAmount: number }>(res)
    expect(order.status).toBe('paid')
    expect(order.totalAmount).toBe(200)
    orderId2 = order.id
  })

  it('cart is cleared after order', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerToken })
    expect(res.status).toBe(200)
    const items = await json<unknown[]>(res)
    expect(items.length).toBe(0)
  })

  it('product sales count incremented', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${productId1}`, { token: buyerToken })
    const p = await json<{ salesCount: number }>(res)
    expect(p.salesCount).toBeGreaterThanOrEqual(2)
  })

  it('order details retrievable', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders/${orderId1}`, { token: buyerToken })
    expect(res.status).toBe(200)
    const order = await json<{ id: string; orderNo: string; items: unknown[] }>(res)
    expect(order.id).toBe(orderId1)
    expect(order.orderNo).toBe(orderNo1)
    expect(order.items.length).toBeGreaterThanOrEqual(1)
  })

  it('insufficient balance rejects order', async () => {
    // Drain wallet first
    const walletRes = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerToken }),
    )

    // Try ordering something more expensive than balance
    const createRes = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '超贵商品', slug: 'expensive', status: 'active', basePrice: 999999 },
    })
    const expensiveProduct = await json<{ id: string }>(createRes)

    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      body: { items: [{ productId: expensiveProduct.id, quantity: 1 }] },
    })
    expect(res.status).toBe(400)

    // Cleanup
    await req('DELETE', `/api/servers/${serverId}/shop/products/${expensiveProduct.id}`, { token: adminToken })
  })
})

/* ══════════════════════════════════════════════════════════
   8. Order listing & filtering
   ══════════════════════════════════════════════════════════ */

describe('Order listing & filtering', () => {
  it('buyer can list their orders', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders`, { token: buyerToken })
    expect(res.status).toBe(200)
    const orders = await json<{ id: string; status: string }[]>(res)
    expect(orders.length).toBeGreaterThanOrEqual(2)
  })

  it('buyer can filter by status', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      query: { status: 'paid' },
    })
    expect(res.status).toBe(200)
    const orders = await json<{ status: string }[]>(res)
    expect(orders.every((o) => o.status === 'paid')).toBe(true)
  })

  it('admin can list all shop orders via manage endpoint', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders/manage`, { token: adminToken })
    expect(res.status).toBe(200)
    const orders = await json<{ id: string }[]>(res)
    expect(orders.length).toBeGreaterThanOrEqual(2)
  })

  it('non-admin cannot access manage endpoint', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders/manage`, { token: buyerToken })
    expect(res.status).toBe(403)
  })

  it('admin can filter managed orders by status', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders/manage`, {
      token: adminToken,
      query: { status: 'paid' },
    })
    expect(res.status).toBe(200)
    const orders = await json<{ status: string }[]>(res)
    expect(orders.every((o) => o.status === 'paid')).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════
   9. Order status management (admin)
   ══════════════════════════════════════════════════════════ */

describe('Order status management', () => {
  it('admin can update order to processing', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId1}/status`, {
      token: adminToken,
      body: { status: 'processing', sellerNote: '正在处理' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; sellerNote: string }>(res)
    expect(order.status).toBe('processing')
    expect(order.sellerNote).toBe('正在处理')
  })

  it('admin can ship order with tracking number', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId1}/status`, {
      token: adminToken,
      body: { status: 'shipped', trackingNo: 'SF1234567890' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; trackingNo: string; shippedAt: string }>(res)
    expect(order.status).toBe('shipped')
    expect(order.trackingNo).toBe('SF1234567890')
    expect(order.shippedAt).toBeDefined()
  })

  it('admin can mark order as delivered', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId1}/status`, {
      token: adminToken,
      body: { status: 'delivered' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string }>(res)
    expect(order.status).toBe('delivered')
  })

  it('admin can complete order', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId1}/status`, {
      token: adminToken,
      body: { status: 'completed' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; completedAt: string }>(res)
    expect(order.status).toBe('completed')
    expect(order.completedAt).toBeDefined()
  })

  it('non-admin cannot update order status', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderId1}/status`, {
      token: buyerToken,
      body: { status: 'completed' },
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   10. Order cancellation & refund
   ══════════════════════════════════════════════════════════ */

describe('Order cancellation & refund', () => {
  let cancelOrderId: string

  it('create an order to cancel', async () => {
    // Top up enough balance
    await req('POST', '/api/wallet/topup', {
      token: buyerToken,
      body: { amount: 500 },
    })

    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      body: { items: [{ productId: productId1, skuId: skuId2, quantity: 1 }] },
    })
    expect(res.status).toBe(201)
    const order = await json<{ id: string; status: string; totalAmount: number }>(res)
    expect(order.status).toBe('paid')
    expect(order.totalAmount).toBe(100)
    cancelOrderId = order.id
  })

  it('buyer can cancel paid order and get refund', async () => {
    const walletBefore = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerToken }),
    )

    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${cancelOrderId}/cancel`, {
      token: buyerToken,
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; cancelledAt: string }>(res)
    expect(order.status).toBe('cancelled')
    expect(order.cancelledAt).toBeDefined()

    // Verify refund
    const walletAfter = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerToken }),
    )
    expect(walletAfter.balance).toBe(walletBefore.balance + 100)
  })

  it('cannot cancel already completed order', async () => {
    // orderId1 is already 'completed'
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId1}/cancel`, {
      token: buyerToken,
    })
    expect(res.status).toBe(400)
  })

  it('other user cannot cancel someone else order', async () => {
    // Create a new order as buyer so it's in 'paid' status
    await req('POST', '/api/wallet/topup', { token: buyerToken, body: { amount: 500 } })
    const createRes = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      body: { items: [{ productId: productId1, skuId: skuId1, quantity: 1 }] },
    })
    const newOrder = await json<{ id: string }>(createRes)

    // Admin trying to cancel buyer's order via the cancel endpoint
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${newOrder.id}/cancel`, {
      token: adminToken,
    })
    expect(res.status).toBe(403)

    // Buyer can cancel their own order (cleanup)
    const buyerCancelRes = await req('POST', `/api/servers/${serverId}/shop/orders/${newOrder.id}/cancel`, {
      token: buyerToken,
    })
    expect(buyerCancelRes.status).toBe(200)
  })

  it('wallet transaction history includes purchase and refund', async () => {
    const res = await req('GET', '/api/wallet/transactions', { token: buyerToken })
    expect(res.status).toBe(200)
    const txs = await json<{ type: string; amount: number }[]>(res)
    expect(txs.some((t) => t.type === 'purchase')).toBe(true)
    expect(txs.some((t) => t.type === 'refund')).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════
   11. Reviews & ratings
   ══════════════════════════════════════════════════════════ */

describe('Reviews', () => {
  it('cannot review order that is not completed/delivered', async () => {
    // orderId2 is currently 'paid' — should fail
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId2}/review`, {
      token: buyerToken,
      body: { productId: productId2, rating: 5, content: '太好了' },
    })
    expect(res.status).toBe(400)
  })

  it('review completed order', async () => {
    // First, mark orderId1 review eligible — it's already 'completed'
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId1}/review`, {
      token: buyerToken,
      body: {
        productId: productId1,
        rating: 5,
        content: '商品很棒，发货很快！',
        images: ['https://img.test/review1.jpg'],
      },
    })
    expect(res.status).toBe(201)
    const review = await json<{ id: string; rating: number; content: string }>(res)
    expect(review.rating).toBe(5)
    expect(review.content).toBe('商品很棒，发货很快！')
  })

  it('cannot review same order twice', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId1}/review`, {
      token: buyerToken,
      body: { productId: productId1, rating: 3, content: '重复评价' },
    })
    expect(res.status).toBe(400)
  })

  it('get product reviews', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${productId1}/reviews`, {
      token: buyerToken,
    })
    expect(res.status).toBe(200)
    const reviews = await json<{ rating: number; content: string }[]>(res)
    expect(reviews.length).toBeGreaterThanOrEqual(1)
    expect(reviews[0]!.rating).toBe(5)
  })

  it('product rating stats updated', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${productId1}`, { token: buyerToken })
    const p = await json<{ avgRating: number; ratingCount: number }>(res)
    expect(p.ratingCount).toBeGreaterThanOrEqual(1)
    expect(p.avgRating).toBeGreaterThanOrEqual(1)
  })

  it('admin can reply to review', async () => {
    // Get review id from the product reviews
    const listRes = await req('GET', `/api/servers/${serverId}/shop/products/${productId1}/reviews`, {
      token: adminToken,
    })
    const reviews = await json<{ id: string }[]>(listRes)
    const reviewId = reviews[0]!.id

    const res = await req('PUT', `/api/servers/${serverId}/shop/reviews/${reviewId}/reply`, {
      token: adminToken,
      body: { reply: '感谢您的好评！' },
    })
    expect(res.status).toBe(200)
    const updated = await json<{ reply: string; repliedAt: string }>(res)
    expect(updated.reply).toBe('感谢您的好评！')
    expect(updated.repliedAt).toBeDefined()
  })

  it('non-admin cannot reply to review', async () => {
    const listRes = await req('GET', `/api/servers/${serverId}/shop/products/${productId1}/reviews`, {
      token: buyerToken,
    })
    const reviews = await json<{ id: string }[]>(listRes)

    const res = await req('PUT', `/api/servers/${serverId}/shop/reviews/${reviews[0]!.id}/reply`, {
      token: buyerToken,
      body: { reply: 'Hacked reply' },
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   12. Entitlements
   ══════════════════════════════════════════════════════════ */

describe('Entitlements', () => {
  it('entitlement granted after purchasing entitlement product', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/entitlements`, { token: buyerToken })
    expect(res.status).toBe(200)
    const ents = await json<{ type: string; targetId: string; isActive: boolean }[]>(res)
    expect(ents.length).toBeGreaterThanOrEqual(1)
    const ent = ents.find((e) => e.type === 'channel_access')
    expect(ent).toBeDefined()
    expect(ent!.isActive).toBe(true)
    expect(ent!.targetId).toBe('fake-channel-id')
  })

  it('entitlement revoked when entitlement order is cancelled', async () => {
    // orderId2 was for entitlement product, let's cancel it
    // It's currently 'paid' so cancellation should work
    const cancelRes = await req('POST', `/api/servers/${serverId}/shop/orders/${orderId2}/cancel`, {
      token: buyerToken,
    })
    expect(cancelRes.status).toBe(200)

    // Check entitlement is revoked (findActiveByUser excludes inactive)
    const res = await req('GET', `/api/servers/${serverId}/shop/entitlements`, { token: buyerToken })
    expect(res.status).toBe(200)
    const ents = await json<{ type: string; isActive: boolean }[]>(res)
    // The channel_access entitlement should no longer appear since it's been revoked
    const channelEnt = ents.find((e) => e.type === 'channel_access')
    expect(channelEnt).toBeUndefined()
  })
})

/* ══════════════════════════════════════════════════════════
   13. Product deletion & category deletion
   ══════════════════════════════════════════════════════════ */

describe('Deletion', () => {
  it('admin can delete a category', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/categories/${categoryId2}`, {
      token: adminToken,
    })
    expect(res.status).toBe(200)

    // Verify gone
    const listRes = await req('GET', `/api/servers/${serverId}/shop/categories`, { token: adminToken })
    const cats = await json<{ id: string }[]>(listRes)
    expect(cats.find((c) => c.id === categoryId2)).toBeUndefined()
  })

  it('non-admin cannot delete category', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/categories/${categoryId1}`, {
      token: buyerToken,
    })
    expect(res.status).toBe(403)
  })

  it('non-admin cannot delete product', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/products/${productId1}`, {
      token: buyerToken,
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   14. Edge cases & validation
   ══════════════════════════════════════════════════════════ */

describe('Edge cases & validation', () => {
  it('empty order items rejected', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      body: { items: [] },
    })
    expect(res.status).toBe(400)
  })

  it('order with non-existent product fails', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerToken,
      body: { items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }] },
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('invalid product slug creation fails', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '', slug: '', basePrice: 0 },
    })
    expect(res.status).toBe(400)
  })

  it('negative price rejected', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: 'Bad Product', slug: 'bad', basePrice: -100 },
    })
    expect(res.status).toBe(400)
  })

  it('pagination works for products', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      query: { limit: '1', offset: '0' },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: unknown[]; total: number }>(res)
    expect(data.products.length).toBeLessThanOrEqual(1)
    expect(data.total).toBeGreaterThanOrEqual(1)
  })

  it('pagination offset works', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      query: { limit: '1', offset: '1' },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: unknown[] }>(res)
    // Offset 1 should return second product or empty if only 1 total active
    expect(data.products.length).toBeLessThanOrEqual(1)
  })
})
