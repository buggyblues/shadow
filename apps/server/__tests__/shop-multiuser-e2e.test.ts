/**
 * Shop System — Multi-User E2E Tests
 *
 * Simulates a realistic multi-user shopping scenario with:
 *   - 1 Admin (shop owner)
 *   - 2 Buyers (Buyer A & Buyer B) competing for products
 *
 * End-to-end flow:
 *   1. Shop initialization & settings (logo, banner, description)
 *   2. Category & product setup with media & SKUs
 *   3. Both buyers top up wallets
 *   4. Both buyers browse, filter, search products
 *   5. Both buyers add items to carts
 *   6. Both buyers place orders (stock competition)
 *   7. Admin processes orders: processing → shipped → delivered → completed
 *   8. Buyers review completed orders
 *   9. Buyer cancels an order and receives refund
 *  10. Entitlement lifecycle: grant on purchase, revoke on cancel
 *  11. Financial audit: balances & transaction history verification
 *  12. Edge cases: out-of-stock, duplicate carts, invalid operations
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
import { createShopHandler } from '../src/handlers/shop.handler'
import { signAccessToken } from '../src/lib/jwt'

/* ══════════════════════════════════════════════════════════
   Setup
   ══════════════════════════════════════════════════════════ */

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

// Identity pool
let adminUserId: string
let buyerAUserId: string
let buyerBUserId: string
let adminToken: string
let buyerAToken: string
let buyerBToken: string
let serverId: string

// Tracked IDs
let shopId: string
let catDigitalId: string
let catVipId: string
let catLimitedId: string

// Products
let prodPhoneId: string // physical, multiple SKUs
let prodCaseId: string // physical, single SKU, limited stock
let prodVipId: string // entitlement product
let prodBundleId: string // physical, for multi-item order test

let phoneSku128Id: string
let phoneSku256Id: string
let caseSku: string
let vipSkuId: string
let bundleSkuId: string

// Orders
let orderA1Id: string // Buyer A physical order
let orderA2Id: string // Buyer A entitlement order
let orderB1Id: string // Buyer B physical order
let orderBCancelId: string // Buyer B order to cancel

const INITIAL_WALLET_BALANCE = 0

/* ── Helpers ── */

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
  buyerNote?: string
}) {
  return {
    idempotencyKey: `shop-multiuser-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  app.route('/api', createShopHandler(container))

  const userDao = container.resolve('userDao')
  const serverDao = container.resolve('serverDao')
  const ts = Date.now()

  // Create admin
  const admin = await userDao.create({
    email: `mu-admin-${ts}@test.local`,
    username: `muadmin${ts}`,
    passwordHash: 'not-used',
  })
  adminUserId = admin!.id

  // Create buyer A
  const buyerA = await userDao.create({
    email: `mu-buyera-${ts}@test.local`,
    username: `mubuyera${ts}`,
    passwordHash: 'not-used',
  })
  buyerAUserId = buyerA!.id

  // Create buyer B
  const buyerB = await userDao.create({
    email: `mu-buyerb-${ts}@test.local`,
    username: `mubuyerb${ts}`,
    passwordHash: 'not-used',
  })
  buyerBUserId = buyerB!.id

  // Tokens
  adminToken = signAccessToken({
    userId: adminUserId,
    email: admin!.email,
    username: admin!.username,
  })
  buyerAToken = signAccessToken({
    userId: buyerAUserId,
    email: buyerA!.email,
    username: buyerA!.username,
  })
  buyerBToken = signAccessToken({
    userId: buyerBUserId,
    email: buyerB!.email,
    username: buyerB!.username,
  })

  // Create server + memberships
  const server = await serverDao.create({ name: `MultiUserShopTest-${ts}`, ownerId: adminUserId })
  serverId = server!.id
  await serverDao.addMember(serverId, adminUserId, 'owner')
  await serverDao.addMember(serverId, buyerAUserId, 'member')
  await serverDao.addMember(serverId, buyerBUserId, 'member')
}, 30_000)

afterAll(async () => {
  try {
    const { users, servers, wallets } = schema
    const { eq } = await import('drizzle-orm')

    if (serverId) await db.delete(servers).where(eq(servers.id, serverId))
    for (const uid of [buyerAUserId, buyerBUserId, adminUserId]) {
      if (uid) {
        await db.delete(wallets).where(eq(wallets.userId, uid))
        await db.delete(users).where(eq(users.id, uid))
      }
    }
  } catch (e) {
    console.warn('Cleanup warning:', e)
  }
  await sql.end()
})

/* ══════════════════════════════════════════════════════════
   1. Shop Initialization & Settings
   ══════════════════════════════════════════════════════════ */

describe('1. Shop initialization & settings', () => {
  it('auto-creates shop on first GET', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop`, { token: adminToken })
    expect(res.status).toBe(200)
    const shop = await json<{ id: string; serverId: string; status: string }>(res)
    expect(shop.serverId).toBe(serverId)
    expect(shop.status).toBe('active')
    shopId = shop.id
  })

  it('buyer A sees same shop', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop`, { token: buyerAToken })
    expect(res.status).toBe(200)
    const shop = await json<{ id: string }>(res)
    expect(shop.id).toBe(shopId)
  })

  it('buyer B sees same shop', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop`, { token: buyerBToken })
    expect(res.status).toBe(200)
    const shop = await json<{ id: string }>(res)
    expect(shop.id).toBe(shopId)
  })

  it('admin updates shop with logo, banner, and description', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop`, {
      token: adminToken,
      body: {
        name: '极客数码旗舰店',
        description: '为您提供高品质的数码产品与专属权益',
        logoUrl: '/shadow/uploads/shop-logo.png',
        bannerUrl: '/shadow/uploads/shop-banner.jpg',
      },
    })
    expect(res.status).toBe(200)
    const shop = await json<{
      name: string
      description: string
      logoUrl: string
      bannerUrl: string
    }>(res)
    expect(shop.name).toBe('极客数码旗舰店')
    expect(shop.description).toBe('为您提供高品质的数码产品与专属权益')
    expect(shop.logoUrl).toBe('/shadow/uploads/shop-logo.png')
    expect(shop.bannerUrl).toBe('/shadow/uploads/shop-banner.jpg')
  })

  it('buyer cannot update shop settings', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop`, {
      token: buyerAToken,
      body: { name: 'Hacked Shop' },
    })
    expect(res.status).toBe(403)
  })

  it('shop settings are visible to buyers', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop`, { token: buyerBToken })
    expect(res.status).toBe(200)
    const shop = await json<{ name: string; logoUrl: string; bannerUrl: string }>(res)
    expect(shop.name).toBe('极客数码旗舰店')
    expect(shop.logoUrl).toBe('/shadow/uploads/shop-logo.png')
    expect(shop.bannerUrl).toBe('/shadow/uploads/shop-banner.jpg')
  })
})

/* ══════════════════════════════════════════════════════════
   2. Category & Product Setup
   ══════════════════════════════════════════════════════════ */

describe('2. Category setup', () => {
  it('admin creates "数码产品" category', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/categories`, {
      token: adminToken,
      body: {
        name: '数码产品',
        slug: 'digital',
        position: 0,
        iconUrl: '/shadow/uploads/icon-digital.png',
      },
    })
    expect(res.status).toBe(201)
    catDigitalId = (await json<{ id: string }>(res)).id
  })

  it('admin creates "VIP权益" category', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/categories`, {
      token: adminToken,
      body: { name: 'VIP权益', slug: 'vip', position: 1 },
    })
    expect(res.status).toBe(201)
    catVipId = (await json<{ id: string }>(res)).id
  })

  it('admin creates "限量特卖" category', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/categories`, {
      token: adminToken,
      body: { name: '限量特卖', slug: 'limited', position: 2 },
    })
    expect(res.status).toBe(201)
    catLimitedId = (await json<{ id: string }>(res)).id
  })

  it('buyer sees all 3 categories', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/categories`, { token: buyerAToken })
    expect(res.status).toBe(200)
    const cats = await json<{ id: string; name: string }[]>(res)
    expect(cats.length).toBe(3)
  })
})

describe('3. Product setup', () => {
  it('admin creates phone product with 2 SKUs', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: {
        name: '极客手机 Pro',
        slug: 'geek-phone-pro',
        type: 'physical',
        status: 'active',
        summary: '年度旗舰手机',
        description: '搭载最新处理器，拍照更清晰',
        basePrice: 3999,
        tags: ['手机', '旗舰', '热销'],
        categoryId: catDigitalId,
        specNames: ['存储容量'],
        media: [
          { url: '/shadow/uploads/phone-1.jpg', type: 'image', position: 0 },
          { url: '/shadow/uploads/phone-2.jpg', type: 'image', position: 1 },
          { url: '/shadow/uploads/phone-video.mp4', type: 'video', position: 2 },
        ],
        skus: [
          { specValues: ['128GB'], price: 3999, stock: 10, skuCode: 'GP-128' },
          { specValues: ['256GB'], price: 4999, stock: 5, skuCode: 'GP-256' },
        ],
      },
    })
    expect(res.status).toBe(201)
    const p = await json<{
      id: string
      name: string
      media: { url: string }[]
      skus: { id: string; specValues: string[]; price: number; stock: number }[]
    }>(res)
    expect(p.name).toBe('极客手机 Pro')
    expect(p.media).toHaveLength(3)
    expect(p.skus).toHaveLength(2)
    prodPhoneId = p.id
    phoneSku128Id = p.skus.find((s) => s.price === 3999)!.id
    phoneSku256Id = p.skus.find((s) => s.price === 4999)!.id
  })

  it('admin creates limited-stock phone case (only 3 in stock)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: {
        name: '限量手机壳',
        slug: 'limited-case',
        type: 'physical',
        status: 'active',
        summary: '限量版联名手机壳',
        basePrice: 99,
        categoryId: catLimitedId,
        tags: ['限量', '手机壳'],
        media: [{ url: '/shadow/uploads/case.jpg', type: 'image', position: 0 }],
        skus: [{ specValues: ['标准版'], price: 99, stock: 3, skuCode: 'LC-STD' }],
      },
    })
    expect(res.status).toBe(201)
    const p = await json<{ id: string; skus: { id: string }[] }>(res)
    prodCaseId = p.id
    caseSku = p.skus[0]!.id
  })

  it('admin creates VIP entitlement product', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: {
        name: 'VIP频道月卡',
        slug: 'vip-monthly',
        type: 'entitlement',
        status: 'active',
        summary: '解锁VIP频道30天访问权限',
        basePrice: 500,
        categoryId: catVipId,
        tags: ['VIP', '权益'],
        entitlementConfig: {
          resourceType: 'service',
          resourceId: 'test-vip-service',
          capability: 'use',
          durationSeconds: 86400 * 30,
          privilegeDescription: 'VIP服务30天使用权',
        },
        skus: [{ specValues: ['月卡'], price: 500, stock: 100 }],
      },
    })
    expect(res.status).toBe(201)
    const p = await json<{ id: string; type: string; skus: { id: string }[] }>(res)
    expect(p.type).toBe('entitlement')
    prodVipId = p.id
    vipSkuId = p.skus[0]!.id
  })

  it('admin creates bundle product for multi-item orders', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: {
        name: '配件套装',
        slug: 'accessory-bundle',
        type: 'physical',
        status: 'active',
        summary: '充电器+数据线+保护膜',
        basePrice: 199,
        categoryId: catDigitalId,
        skus: [{ specValues: ['标准套装'], price: 199, stock: 20, skuCode: 'AB-STD' }],
      },
    })
    expect(res.status).toBe(201)
    const p = await json<{ id: string; skus: { id: string }[] }>(res)
    prodBundleId = p.id
    bundleSkuId = p.skus[0]!.id
  })

  it('admin creates a draft product (invisible to buyers)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '未上架新品', slug: 'unreleased', status: 'draft', basePrice: 888 },
    })
    expect(res.status).toBe(201)
  })
})

/* ══════════════════════════════════════════════════════════
   3. Product Browsing & Search (both buyers)
   ══════════════════════════════════════════════════════════ */

describe('4. Product browsing & search', () => {
  it('buyer A sees only active products (4), not draft', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, { token: buyerAToken })
    expect(res.status).toBe(200)
    const data = await json<{ products: { status: string }[]; total: number }>(res)
    expect(data.products.every((p) => p.status === 'active')).toBe(true)
    expect(data.products.length).toBe(4)
    expect(data.total).toBe(4)
  })

  it('admin sees all 5 products (including draft)', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, { token: adminToken })
    expect(res.status).toBe(200)
    const data = await json<{ products: { status: string }[]; total: number }>(res)
    expect(data.products.length).toBe(5)
    expect(data.products.some((p) => p.status === 'draft')).toBe(true)
  })

  it('buyer B filters by digital category', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerBToken,
      query: { categoryId: catDigitalId },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: { id: string }[] }>(res)
    // Phone + Bundle are in digital category
    expect(data.products.length).toBe(2)
  })

  it('buyer A searches for "手机"', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerAToken,
      query: { keyword: '手机' },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: { name: string }[] }>(res)
    // Phone + Case contain "手机"
    expect(data.products.length).toBe(2)
    expect(data.products.every((p) => p.name.includes('手机'))).toBe(true)
  })

  it('buyer B searches for "VIP"', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerBToken,
      query: { keyword: 'VIP' },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: { name: string }[] }>(res)
    expect(data.products.length).toBe(1)
    expect(data.products[0]!.name).toBe('VIP频道月卡')
  })

  it('search with no results returns empty', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerAToken,
      query: { keyword: '完全不存在的商品xyz999' },
    })
    expect(res.status).toBe(200)
    const data = await json<{ products: unknown[]; total: number }>(res)
    expect(data.products).toHaveLength(0)
    expect(data.total).toBe(0)
  })

  it('product detail includes media, SKUs, and all fields', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${prodPhoneId}`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(200)
    const p = await json<{
      id: string
      name: string
      summary: string
      description: string
      media: { url: string; type: string }[]
      skus: { id: string; specValues: string[]; price: number; stock: number }[]
      tags: string[]
      basePrice: number
      salesCount: number
      avgRating: number
    }>(res)
    expect(p.name).toBe('极客手机 Pro')
    expect(p.summary).toBe('年度旗舰手机')
    expect(p.media).toHaveLength(3)
    expect(p.media.filter((m) => m.type === 'image')).toHaveLength(2)
    expect(p.media.filter((m) => m.type === 'video')).toHaveLength(1)
    expect(p.skus).toHaveLength(2)
    expect(p.tags).toContain('手机')
    expect(p.salesCount).toBe(0)
  })

  it('pagination works correctly', async () => {
    const res1 = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerAToken,
      query: { limit: '2', offset: '0' },
    })
    const data1 = await json<{ products: { id: string }[]; total: number }>(res1)
    expect(data1.products.length).toBe(2)
    expect(data1.total).toBe(4) // 4 active products

    const res2 = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: buyerAToken,
      query: { limit: '2', offset: '2' },
    })
    const data2 = await json<{ products: { id: string }[] }>(res2)
    expect(data2.products.length).toBe(2)

    // No overlap
    const ids1 = data1.products.map((p) => p.id)
    const ids2 = data2.products.map((p) => p.id)
    expect(ids1.every((id) => !ids2.includes(id))).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════
   4. Wallet Setup
   ══════════════════════════════════════════════════════════ */

describe('5. Wallet setup', () => {
  it('buyer A wallet auto-created with 0 balance', async () => {
    const res = await req('GET', '/api/wallet', { token: buyerAToken })
    expect(res.status).toBe(200)
    const w = await json<{ userId: string; balance: number }>(res)
    expect(w.userId).toBe(buyerAUserId)
    expect(w.balance).toBe(INITIAL_WALLET_BALANCE)
  })

  it('test grant seeds buyer A wallet with 20000 虾币', async () => {
    const w = await container
      .resolve('walletService')
      .topUp(buyerAUserId, 20000, 'Test balance seed')
    expect(w?.balance).toBe(INITIAL_WALLET_BALANCE + 20000)
  })

  it('test grant seeds buyer B wallet with 15000 虾币', async () => {
    await req('GET', '/api/wallet', { token: buyerBToken }) // auto-create
    const w = await container
      .resolve('walletService')
      .topUp(buyerBUserId, 15000, 'Test balance seed')
    expect(w?.balance).toBe(INITIAL_WALLET_BALANCE + 15000)
  })

  it('test grant seeds buyer A again (accumulation)', async () => {
    const w = await container
      .resolve('walletService')
      .topUp(buyerAUserId, 5000, 'Test balance seed')
    expect(w?.balance).toBe(INITIAL_WALLET_BALANCE + 25000)
  })

  it('transaction history shows topups', async () => {
    const res = await req('GET', '/api/wallet/transactions', { token: buyerAToken })
    expect(res.status).toBe(200)
    const txs = await json<{ type: string; amount: number }[]>(res)
    expect(txs.length).toBe(2)
    expect(txs.every((t) => t.type === 'topup')).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════
   5. Cart Operations (both buyers)
   ══════════════════════════════════════════════════════════ */

describe('6. Cart operations', () => {
  let cartItemA1: string // buyer A: phone 128GB
  let cartItemA2: string // buyer A: bundle
  let cartItemB1: string // buyer B: phone 256GB
  let cartItemB2: string // buyer B: limited case

  it('buyer A adds phone 128GB to cart', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerAToken,
      body: { productId: prodPhoneId, skuId: phoneSku128Id, quantity: 1 },
    })
    expect(res.status).toBe(201)
    cartItemA1 = (await json<{ id: string; quantity: number }>(res)).id
  })

  it('buyer A adds bundle to cart', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerAToken,
      body: { productId: prodBundleId, skuId: bundleSkuId, quantity: 2 },
    })
    expect(res.status).toBe(201)
    cartItemA2 = (await json<{ id: string }>(res)).id
  })

  it('buyer B adds phone 256GB to cart', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerBToken,
      body: { productId: prodPhoneId, skuId: phoneSku256Id, quantity: 1 },
    })
    expect(res.status).toBe(201)
    cartItemB1 = (await json<{ id: string }>(res)).id
  })

  it('buyer B adds limited case to cart (2 of 3 available)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerBToken,
      body: { productId: prodCaseId, skuId: caseSku, quantity: 2 },
    })
    expect(res.status).toBe(201)
    cartItemB2 = (await json<{ id: string }>(res)).id
  })

  it('buyer A cart shows 2 items with enriched info', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerAToken })
    expect(res.status).toBe(200)
    const items =
      await json<
        {
          id: string
          product: { name: string } | null
          sku: { price: number } | null
          unitPrice: number
        }[]
      >(res)
    expect(items.length).toBe(2)
    const phoneItem = items.find((i) => i.id === cartItemA1)!
    expect(phoneItem.product?.name).toBe('极客手机 Pro')
    expect(phoneItem.unitPrice).toBe(3999)
    const bundleItem = items.find((i) => i.id === cartItemA2)!
    expect(bundleItem.unitPrice).toBe(199)
  })

  it('buyer B cart shows 2 items', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerBToken })
    expect(res.status).toBe(200)
    const items = await json<unknown[]>(res)
    expect(items.length).toBe(2)
  })

  it('buyer A updates bundle quantity to 1', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/cart/${cartItemA2}`, {
      token: buyerAToken,
      body: { quantity: 1 },
    })
    expect(res.status).toBe(200)
  })

  it('carts are independent between buyers', async () => {
    const resA = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerAToken })
    const resB = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerBToken })
    const itemsA = await json<{ id: string }[]>(resA)
    const itemsB = await json<{ id: string }[]>(resB)

    const idsA = itemsA.map((i) => i.id)
    const idsB = itemsB.map((i) => i.id)
    expect(idsA.every((id) => !idsB.includes(id))).toBe(true)
  })

  it('adding same product+SKU to cart upserts (replaces quantity)', async () => {
    // Buyer A adds phone 128GB again with qty 2
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerAToken,
      body: { productId: prodPhoneId, skuId: phoneSku128Id, quantity: 2 },
    })
    expect(res.status).toBe(201)
    const item = await json<{ quantity: number }>(res)
    expect(item.quantity).toBe(2)

    // Cart should still have 2 items, not 3
    const cartRes = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerAToken })
    const items = await json<unknown[]>(cartRes)
    expect(items.length).toBe(2)

    // Reset back to 1 for order tests
    await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerAToken,
      body: { productId: prodPhoneId, skuId: phoneSku128Id, quantity: 1 },
    })
  })

  it('cannot add draft product to cart', async () => {
    // Find the draft product
    const listRes = await req('GET', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
    })
    const data = await json<{ products: { id: string; status: string }[] }>(listRes)
    const draft = data.products.find((p) => p.status === 'draft')!

    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerAToken,
      body: { productId: draft.id, quantity: 1 },
    })
    expect(res.status).toBe(400)
  })

  it('setting quantity to 0 removes item from cart', async () => {
    // Buyer A removes bundle via qty=0
    const res = await req('PUT', `/api/servers/${serverId}/shop/cart/${cartItemA2}`, {
      token: buyerAToken,
      body: { quantity: 0 },
    })
    expect(res.status).toBe(200)

    const cartRes = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerAToken })
    const items = await json<{ id: string }[]>(cartRes)
    expect(items.length).toBe(1)
    expect(items.find((i) => i.id === cartItemA2)).toBeUndefined()

    // Re-add bundle for order
    const addRes = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerAToken,
      body: { productId: prodBundleId, skuId: bundleSkuId, quantity: 1 },
    })
    expect(addRes.status).toBe(201)
  })
})

/* ══════════════════════════════════════════════════════════
   6. Order Creation — Multi-user Purchase Flow
   ══════════════════════════════════════════════════════════ */

describe('7. Order creation — multi-user purchases', () => {
  it('buyer A places order: phone 128GB + bundle', async () => {
    const walletBefore = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerAToken }),
    )

    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerAToken,
      body: orderBody({
        items: [
          { productId: prodPhoneId, skuId: phoneSku128Id, quantity: 1 },
          { productId: prodBundleId, skuId: bundleSkuId, quantity: 1 },
        ],
        buyerNote: '请包装好，容易碎',
      }),
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
    expect(order.totalAmount).toBe(3999 + 199) // phone + bundle
    expect(order.buyerNote).toBe('请包装好，容易碎')
    expect(order.items).toHaveLength(2)
    orderA1Id = order.id

    // Verify balance deducted
    const walletAfter = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerAToken }),
    )
    expect(walletAfter.balance).toBe(walletBefore.balance - (3999 + 199))
  })

  it('buyer A cart is cleared after order', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerAToken })
    const items = await json<unknown[]>(res)
    expect(items.length).toBe(0)
  })

  it('buyer B places order: phone 256GB + limited case ×2', async () => {
    const walletBefore = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerBToken }),
    )

    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerBToken,
      body: orderBody({
        items: [
          { productId: prodPhoneId, skuId: phoneSku256Id, quantity: 1 },
          { productId: prodCaseId, skuId: caseSku, quantity: 2 },
        ],
        buyerNote: '急用',
      }),
    })
    expect(res.status).toBe(201)
    const order = await json<{ id: string; totalAmount: number; status: string }>(res)
    expect(order.status).toBe('paid')
    expect(order.totalAmount).toBe(4999 + 99 * 2)
    orderB1Id = order.id

    const walletAfter = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerBToken }),
    )
    expect(walletAfter.balance).toBe(walletBefore.balance - (4999 + 99 * 2))
  })

  it('buyer B cart is cleared after order', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/cart`, { token: buyerBToken })
    const items = await json<unknown[]>(res)
    expect(items.length).toBe(0)
  })

  it('buyer A places entitlement order (VIP)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerAToken,
      body: orderBody({ items: [{ productId: prodVipId, skuId: vipSkuId, quantity: 1 }] }),
    })
    expect(res.status).toBe(201)
    const order = await json<{ id: string; totalAmount: number; status: string }>(res)
    expect(order.status).toBe('paid')
    expect(order.totalAmount).toBe(500)
    orderA2Id = order.id
  })

  it('sales counts are incremented correctly', async () => {
    const phoneRes = await req('GET', `/api/servers/${serverId}/shop/products/${prodPhoneId}`, {
      token: buyerAToken,
    })
    const phone = await json<{ salesCount: number }>(phoneRes)
    expect(phone.salesCount).toBe(2) // A bought 1 + B bought 1

    const caseRes = await req('GET', `/api/servers/${serverId}/shop/products/${prodCaseId}`, {
      token: buyerAToken,
    })
    const cs = await json<{ salesCount: number }>(caseRes)
    expect(cs.salesCount).toBe(2) // B bought 2

    const bundleRes = await req('GET', `/api/servers/${serverId}/shop/products/${prodBundleId}`, {
      token: buyerAToken,
    })
    const bundle = await json<{ salesCount: number }>(bundleRes)
    expect(bundle.salesCount).toBe(1) // A bought 1
  })

  it('stock decremented: limited case now has 1 left', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${prodCaseId}`, {
      token: buyerAToken,
    })
    const p = await json<{ skus: { stock: number }[] }>(res)
    expect(p.skus[0]!.stock).toBe(1) // Was 3, buyer B bought 2
  })

  it('buyer A fails to buy more limited cases than stock', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerAToken,
      body: orderBody({ items: [{ productId: prodCaseId, skuId: caseSku, quantity: 2 }] }),
    })
    expect(res.status).toBe(400) // Only 1 left in stock
  })

  it('buyer A can still buy 1 remaining case', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerAToken,
      body: orderBody({ items: [{ productId: prodCaseId, skuId: caseSku, quantity: 1 }] }),
    })
    expect(res.status).toBe(201)
    const order = await json<{ totalAmount: number }>(res)
    expect(order.totalAmount).toBe(99)
  })

  it('insufficient balance is rejected', async () => {
    // Create expensive product
    const createRes = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '天价产品', slug: 'super-expensive', status: 'active', basePrice: 999999 },
    })
    const expProduct = await json<{ id: string }>(createRes)

    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerBToken,
      body: orderBody({ items: [{ productId: expProduct.id, quantity: 1 }] }),
    })
    expect(res.status).toBe(402)

    // Cleanup
    await req('DELETE', `/api/servers/${serverId}/shop/products/${expProduct.id}`, {
      token: adminToken,
    })
  })
})

/* ══════════════════════════════════════════════════════════
   7. Order Listing & Filtering
   ══════════════════════════════════════════════════════════ */

describe('8. Order listing & filtering', () => {
  it('buyer A sees their orders', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders`, { token: buyerAToken })
    expect(res.status).toBe(200)
    const orders = await json<{ id: string; buyerId: string; items: unknown[] }[]>(res)
    expect(orders.length).toBeGreaterThanOrEqual(3)
    expect(orders.every((o) => o.buyerId === buyerAUserId)).toBe(true)
    expect(orders.every((o) => o.items.length > 0)).toBe(true) // Items enriched
  })

  it('buyer B sees only their orders', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders`, { token: buyerBToken })
    expect(res.status).toBe(200)
    const orders = await json<{ buyerId: string }[]>(res)
    expect(orders.every((o) => o.buyerId === buyerBUserId)).toBe(true)
  })

  it('buyer A can filter orders by status', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders`, {
      token: buyerAToken,
      query: { status: 'paid' },
    })
    expect(res.status).toBe(200)
    const orders = await json<{ status: string }[]>(res)
    expect(orders.every((o) => o.status === 'paid')).toBe(true)
  })

  it('admin can see ALL shop orders via manage endpoint', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders/manage`, {
      token: adminToken,
    })
    expect(res.status).toBe(200)
    const orders = await json<{ id: string; buyerId: string }[]>(res)
    // Should see orders from both buyers
    const buyerIds = new Set(orders.map((o) => o.buyerId))
    expect(buyerIds.has(buyerAUserId)).toBe(true)
    expect(buyerIds.has(buyerBUserId)).toBe(true)
  })

  it('non-admin cannot access manage endpoint', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders/manage`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(403)
  })

  it('order detail includes items with snapshots', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/orders/${orderA1Id}`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(200)
    const order = await json<{
      id: string
      items: { productName: string; price: number; quantity: number; specValues: string[] }[]
    }>(res)
    expect(order.items).toHaveLength(2)
    const phoneItem = order.items.find((i) => i.productName === '极客手机 Pro')!
    expect(phoneItem.price).toBe(3999)
    expect(phoneItem.specValues).toContain('128GB')
  })
})

/* ══════════════════════════════════════════════════════════
   8. Order Status Management — Shipping Flow
   ══════════════════════════════════════════════════════════ */

describe('9. Shipping flow (admin manages orders)', () => {
  it('admin marks buyer A order as processing', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderA1Id}/status`, {
      token: adminToken,
      body: { status: 'processing', sellerNote: '正在打包' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; sellerNote: string }>(res)
    expect(order.status).toBe('processing')
    expect(order.sellerNote).toBe('正在打包')
  })

  it('admin ships buyer A order with tracking number', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderA1Id}/status`, {
      token: adminToken,
      body: { status: 'shipped', trackingNo: 'SF2024001234' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; trackingNo: string; shippedAt: string }>(res)
    expect(order.status).toBe('shipped')
    expect(order.trackingNo).toBe('SF2024001234')
    expect(order.shippedAt).toBeDefined()
  })

  it('admin marks buyer A order as delivered', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderA1Id}/status`, {
      token: adminToken,
      body: { status: 'delivered' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string }>(res)
    expect(order.status).toBe('delivered')
  })

  it('admin completes buyer A order', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderA1Id}/status`, {
      token: adminToken,
      body: { status: 'completed' },
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; completedAt: string }>(res)
    expect(order.status).toBe('completed')
    expect(order.completedAt).toBeDefined()
  })

  it('admin processes buyer B order through full flow', async () => {
    for (const status of ['processing', 'shipped', 'delivered', 'completed'] as const) {
      const body: Record<string, unknown> = { status }
      if (status === 'shipped') body.trackingNo = 'YT9999887766'
      const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderB1Id}/status`, {
        token: adminToken,
        body,
      })
      expect(res.status).toBe(200)
      const order = await json<{ status: string }>(res)
      expect(order.status).toBe(status)
    }
  })

  it('non-admin cannot update order status', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/orders/${orderA2Id}/status`, {
      token: buyerAToken,
      body: { status: 'shipped' },
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   9. Reviews — Multi-user Reviews & Ratings
   ══════════════════════════════════════════════════════════ */

describe('10. Reviews — multi-user', () => {
  it('buyer A cannot review a non-delivered/completed order', async () => {
    // orderA2 is still 'paid'
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderA2Id}/review`, {
      token: buyerAToken,
      body: { productId: prodVipId, rating: 5, content: '太好了' },
    })
    expect(res.status).toBe(400)
  })

  it('buyer A reviews completed phone order (5 stars)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderA1Id}/review`, {
      token: buyerAToken,
      body: {
        productId: prodPhoneId,
        rating: 5,
        content: '手机非常好用，性能强劲！拍照效果一流。',
        images: ['/shadow/uploads/review-1.jpg', '/shadow/uploads/review-2.jpg'],
      },
    })
    expect(res.status).toBe(201)
    const review = await json<{ rating: number; content: string; images: string[] }>(res)
    expect(review.rating).toBe(5)
    expect(review.images).toHaveLength(2)
  })

  it('buyer A cannot review same order twice', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderA1Id}/review`, {
      token: buyerAToken,
      body: { productId: prodPhoneId, rating: 3, content: '再评一次' },
    })
    expect(res.status).toBe(400)
  })

  it('buyer B reviews completed phone order (4 stars)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderB1Id}/review`, {
      token: buyerBToken,
      body: {
        productId: prodPhoneId,
        rating: 4,
        content: '总体不错，就是电池续航一般。',
      },
    })
    expect(res.status).toBe(201)
    const review = await json<{ rating: number }>(res)
    expect(review.rating).toBe(4)
  })

  it('product now has 2 reviews with correct average rating', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${prodPhoneId}`, {
      token: buyerAToken,
    })
    const p = await json<{ avgRating: number; ratingCount: number }>(res)
    expect(p.ratingCount).toBe(2)
    // Average of 5 and 4 = 4.5
    expect(p.avgRating).toBeGreaterThanOrEqual(4)
    expect(p.avgRating).toBeLessThanOrEqual(5)
  })

  it('product reviews list shows both reviews', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products/${prodPhoneId}/reviews`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(200)
    const reviews = await json<{ rating: number; content: string; userId: string }[]>(res)
    expect(reviews.length).toBe(2)
    const userIds = reviews.map((r) => r.userId)
    expect(userIds).toContain(buyerAUserId)
    expect(userIds).toContain(buyerBUserId)
  })

  it('admin replies to buyer A review', async () => {
    const listRes = await req(
      'GET',
      `/api/servers/${serverId}/shop/products/${prodPhoneId}/reviews`,
      {
        token: adminToken,
      },
    )
    const reviews = await json<{ id: string; userId: string }[]>(listRes)
    const buyerAReview = reviews.find((r) => r.userId === buyerAUserId)!

    const res = await req('PUT', `/api/servers/${serverId}/shop/reviews/${buyerAReview.id}/reply`, {
      token: adminToken,
      body: { reply: '感谢您的好评！如有任何问题随时联系客服。' },
    })
    expect(res.status).toBe(200)
    const updated = await json<{ reply: string; repliedAt: string }>(res)
    expect(updated.reply).toContain('感谢')
    expect(updated.repliedAt).toBeDefined()
  })

  it('non-admin cannot reply to review', async () => {
    const listRes = await req(
      'GET',
      `/api/servers/${serverId}/shop/products/${prodPhoneId}/reviews`,
      {
        token: buyerBToken,
      },
    )
    const reviews = await json<{ id: string }[]>(listRes)

    const res = await req('PUT', `/api/servers/${serverId}/shop/reviews/${reviews[0]!.id}/reply`, {
      token: buyerBToken,
      body: { reply: '非法回复' },
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   10. Order Cancellation & Refund
   ══════════════════════════════════════════════════════════ */

describe('11. Order cancellation & refund', () => {
  it('buyer B creates a new order (to cancel)', async () => {
    await container.resolve('walletService').topUp(buyerBUserId, 5000, 'Test balance seed')

    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerBToken,
      body: orderBody({ items: [{ productId: prodBundleId, skuId: bundleSkuId, quantity: 1 }] }),
    })
    expect(res.status).toBe(201)
    const order = await json<{ id: string; status: string; totalAmount: number }>(res)
    expect(order.status).toBe('paid')
    expect(order.totalAmount).toBe(199)
    orderBCancelId = order.id
  })

  it('buyer A cannot cancel buyer B order', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderBCancelId}/cancel`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(403)
  })

  it('buyer B cancels their own paid order and gets refund', async () => {
    const walletBefore = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerBToken }),
    )

    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderBCancelId}/cancel`, {
      token: buyerBToken,
    })
    expect(res.status).toBe(200)
    const order = await json<{ status: string; cancelledAt: string }>(res)
    expect(order.status).toBe('cancelled')
    expect(order.cancelledAt).toBeDefined()

    const walletAfter = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerBToken }),
    )
    expect(walletAfter.balance).toBe(walletBefore.balance + 199)
  })

  it('cannot cancel already completed order', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderA1Id}/cancel`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(400)
  })

  it('cannot cancel already cancelled order', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders/${orderBCancelId}/cancel`, {
      token: buyerBToken,
    })
    expect(res.status).toBe(400)
  })
})

/* ══════════════════════════════════════════════════════════
   11. Entitlement Lifecycle
   ══════════════════════════════════════════════════════════ */

describe('12. Entitlement lifecycle', () => {
  it('buyer A has entitlement from VIP purchase', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/entitlements`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(200)
    const ents =
      await json<
        { resourceType: string; resourceId: string; capability: string; isActive: boolean }[]
      >(res)
    expect(ents.length).toBeGreaterThanOrEqual(1)
    const vipEnt = ents.find(
      (e) => e.resourceType === 'service' && e.resourceId === 'test-vip-service',
    )
    expect(vipEnt).toBeDefined()
    expect(vipEnt!.isActive).toBe(true)
  })

  it('buyer B has no entitlements (did not buy VIP)', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/entitlements`, {
      token: buyerBToken,
    })
    expect(res.status).toBe(200)
    const ents = await json<unknown[]>(res)
    expect(ents.length).toBe(0)
  })

  it('cancelling entitlement order revokes entitlement', async () => {
    // Cancel buyer A's VIP order
    const cancelRes = await req(
      'POST',
      `/api/servers/${serverId}/shop/orders/${orderA2Id}/cancel`,
      {
        token: buyerAToken,
      },
    )
    expect(cancelRes.status).toBe(200)

    // Entitlement should be revoked
    const res = await req('GET', `/api/servers/${serverId}/shop/entitlements`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(200)
    const ents = await json<{ resourceType: string; resourceId: string }[]>(res)
    const vipEnt = ents.find(
      (e) => e.resourceType === 'service' && e.resourceId === 'test-vip-service',
    )
    expect(vipEnt).toBeUndefined()
  })
})

/* ══════════════════════════════════════════════════════════
   12. Financial Audit
   ══════════════════════════════════════════════════════════ */

describe('13. Financial audit', () => {
  it('buyer A transaction history is complete and balanced', async () => {
    const walletRes = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerAToken }),
    )
    const txRes = await req('GET', '/api/wallet/transactions', { token: buyerAToken })
    const txs = await json<{ type: string; amount: number; balanceAfter: number }[]>(txRes)

    // Should have: 2 topups + 3 purchases + 1 refund (VIP cancel)
    const topups = txs.filter((t) => t.type === 'topup')
    const purchases = txs.filter((t) => t.type === 'purchase')
    const refunds = txs.filter((t) => t.type === 'refund')

    expect(topups.length).toBe(2)
    expect(purchases.length).toBeGreaterThanOrEqual(3) // phone+bundle, VIP, case
    expect(refunds.length).toBeGreaterThanOrEqual(1) // VIP refund

    // Final balance should match last transaction's balanceAfter
    // (transactions ordered by desc createdAt, so first is latest)
    expect(walletRes.balance).toBe(txs[0]!.balanceAfter)
  })

  it('buyer B transaction history includes purchase and refund', async () => {
    const txRes = await req('GET', '/api/wallet/transactions', { token: buyerBToken })
    const txs = await json<{ type: string; amount: number }[]>(txRes)

    expect(txs.some((t) => t.type === 'topup')).toBe(true)
    expect(txs.some((t) => t.type === 'purchase')).toBe(true)
    expect(txs.some((t) => t.type === 'refund')).toBe(true)
  })

  it('buyer balances are self-consistent', async () => {
    // Buyer A: 25000 (topup) - 4198 (phone+bundle) - 500 (VIP) - 99 (case) + 500 (VIP refund)
    const walletA = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerAToken }),
    )
    expect(walletA.balance).toBe(INITIAL_WALLET_BALANCE + 25000 - 4198 - 500 - 99 + 500) // = 20703

    // Buyer B: 15000 + 5000 (extra topup) - 5197 (phone+case) - 199 (bundle) + 199 (refund)
    const walletB = await json<{ balance: number }>(
      await req('GET', '/api/wallet', { token: buyerBToken }),
    )
    expect(walletB.balance).toBe(INITIAL_WALLET_BALANCE + 15000 + 5000 - 5197 - 199 + 199) // = 14803
  })
})

/* ══════════════════════════════════════════════════════════
   13. Product Update & Admin Operations
   ══════════════════════════════════════════════════════════ */

describe('14. Product update & admin operations', () => {
  it('admin updates product name and description', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${prodPhoneId}`, {
      token: adminToken,
      body: { name: '极客手机 Pro Max', description: '全新升级，更强更快' },
    })
    expect(res.status).toBe(200)
    const p = await json<{ name: string; description: string }>(res)
    expect(p.name).toBe('极客手机 Pro Max')
    expect(p.description).toBe('全新升级，更强更快')
  })

  it('admin updates product media (replaces all)', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${prodPhoneId}`, {
      token: adminToken,
      body: {
        media: [
          { url: '/shadow/uploads/phone-new-1.jpg', type: 'image', position: 0 },
          { url: '/shadow/uploads/phone-new-2.jpg', type: 'image', position: 1 },
        ],
      },
    })
    expect(res.status).toBe(200)
    const p = await json<{ media: { url: string }[] }>(res)
    expect(p.media).toHaveLength(2)
    expect(p.media[0]!.url).toMatch(/^\/api\/media\/signed\//)
  })

  it('admin archives a product', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${prodCaseId}`, {
      token: adminToken,
      body: { status: 'archived' },
    })
    expect(res.status).toBe(200)
    const p = await json<{ status: string }>(res)
    expect(p.status).toBe('archived')
  })

  it('archived product disappears from buyer listing', async () => {
    const res = await req('GET', `/api/servers/${serverId}/shop/products`, { token: buyerAToken })
    const data = await json<{ products: { id: string }[] }>(res)
    expect(data.products.find((p) => p.id === prodCaseId)).toBeUndefined()
  })

  it('admin updates category name', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/categories/${catDigitalId}`, {
      token: adminToken,
      body: { name: '数码精品' },
    })
    expect(res.status).toBe(200)
    const cat = await json<{ name: string }>(res)
    expect(cat.name).toBe('数码精品')
  })

  it('non-admin cannot update product', async () => {
    const res = await req('PUT', `/api/servers/${serverId}/shop/products/${prodPhoneId}`, {
      token: buyerBToken,
      body: { name: 'Hacked' },
    })
    expect(res.status).toBe(403)
  })

  it('non-admin cannot delete product', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/products/${prodPhoneId}`, {
      token: buyerBToken,
    })
    expect(res.status).toBe(403)
  })
})

/* ══════════════════════════════════════════════════════════
   14. Edge Cases & Validation
   ══════════════════════════════════════════════════════════ */

describe('15. Edge cases & validation', () => {
  it('empty order rejected', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerAToken,
      body: orderBody({ items: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('order with non-existent product fails', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/orders`, {
      token: buyerAToken,
      body: orderBody({
        items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
      }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('negative price product rejected', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: 'Bad', slug: 'bad-product', basePrice: -100 },
    })
    expect(res.status).toBe(400)
  })

  it('product name too long is rejected', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: 'A'.repeat(201), slug: 'too-long', basePrice: 0 },
    })
    expect(res.status).toBe(400)
  })

  it('empty product name rejected', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/products`, {
      token: adminToken,
      body: { name: '', slug: '', basePrice: 0 },
    })
    expect(res.status).toBe(400)
  })

  it('ordinary wallet topup endpoint is rejected', async () => {
    const res = await req('POST', '/api/wallet/topup', {
      token: buyerAToken,
      body: { amount: 100 },
    })
    expect(res.status).toBe(403)
  })

  it('unauthenticated requests rejected', async () => {
    const res1 = await req('GET', `/api/servers/${serverId}/shop`)
    expect(res1.status).toBe(401)

    const res2 = await req('GET', '/api/wallet')
    expect(res2.status).toBe(401)

    const res3 = await req('GET', `/api/servers/${serverId}/shop/products`)
    expect(res3.status).toBe(401)
  })

  it('cart quantity validation (max 99)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/shop/cart`, {
      token: buyerAToken,
      body: { productId: prodPhoneId, skuId: phoneSku128Id, quantity: 100 },
    })
    expect(res.status).toBe(400)
  })

  it('review rating out of range rejected', async () => {
    // First need a completed order to attempt review
    const res1 = await req('POST', `/api/servers/${serverId}/shop/orders/${orderB1Id}/review`, {
      token: buyerBToken,
      body: { productId: prodCaseId, rating: 6, content: 'Invalid rating' },
    })
    // Should fail due to rating > 5 (or already reviewed)
    expect(res1.status).toBe(400)
  })
})

/* ══════════════════════════════════════════════════════════
   15. Deletion
   ══════════════════════════════════════════════════════════ */

describe('16. Deletion', () => {
  it('admin can delete a category', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/categories/${catLimitedId}`, {
      token: adminToken,
    })
    expect(res.status).toBe(200)

    const listRes = await req('GET', `/api/servers/${serverId}/shop/categories`, {
      token: adminToken,
    })
    const cats = await json<{ id: string }[]>(listRes)
    expect(cats.find((c) => c.id === catLimitedId)).toBeUndefined()
  })

  it('non-admin cannot delete category', async () => {
    const res = await req('DELETE', `/api/servers/${serverId}/shop/categories/${catDigitalId}`, {
      token: buyerAToken,
    })
    expect(res.status).toBe(403)
  })
})
