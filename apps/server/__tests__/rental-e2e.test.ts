/**
 * P2P Rental System — End-to-End Tests
 *
 * Tests the complete rental lifecycle against a real PostgreSQL database:
 *   1. Listing CRUD (create, browse, update, toggle, delete)
 *   2. Contract signing & lifecycle
 *   3. Usage recording & billing
 *   4. Cost estimation
 *   5. Contract termination
 *   6. Violation reporting
 *   7. My Rentals queries (as tenant & owner)
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
import { createRentalHandler } from '../src/handlers/rental.handler'
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
let tenantUserId: string
let ownerToken: string
let tenantToken: string

// IDs tracked across tests
let listingId: string
let draftListingId: string
let contractId: string
let contractNo: string

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

  app = new Hono()
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500
    return c.json({ error: message }, status as 400)
  })
  app.route('/api', createRentalHandler(container))

  // Create test users directly in DB
  const userDao = container.resolve('userDao')
  const ts = Date.now()

  const owner = await userDao.create({
    email: `rental-owner-${ts}@test.local`,
    username: `rentalowner${ts}`,
    passwordHash: 'not-used',
  })
  ownerUserId = owner!.id

  const tenant = await userDao.create({
    email: `rental-tenant-${ts}@test.local`,
    username: `rentaltenant${ts}`,
    passwordHash: 'not-used',
  })
  tenantUserId = tenant!.id

  ownerToken = signAccessToken({
    userId: ownerUserId,
    email: owner!.email,
    username: owner!.username,
  })
  tenantToken = signAccessToken({
    userId: tenantUserId,
    email: tenant!.email,
    username: tenant!.username,
  })

  // Give the tenant some balance for deposits and rental
  const walletService = container.resolve('walletService')
  await walletService.topUp(tenantUserId, 10000, 'Test balance for rental E2E')
}, 30_000)

afterAll(async () => {
  try {
    const { users } = schema
    const { eq, inArray } = await import('drizzle-orm')

    // Clean rental data
    const { clawListings, rentalContracts, rentalUsageRecords, rentalViolations } = schema
    if (contractId) {
      await db.delete(rentalViolations).where(eq(rentalViolations.contractId, contractId))
      await db.delete(rentalUsageRecords).where(eq(rentalUsageRecords.contractId, contractId))
      await db.delete(rentalContracts).where(eq(rentalContracts.id, contractId))
    }

    // Delete all listings by owner
    if (ownerUserId) {
      await db.delete(clawListings).where(eq(clawListings.ownerId, ownerUserId))
    }

    // Delete wallets
    const { wallets } = schema
    if (tenantUserId) await db.delete(wallets).where(eq(wallets.userId, tenantUserId))
    if (ownerUserId) await db.delete(wallets).where(eq(wallets.userId, ownerUserId))

    // Delete users
    const userIds = [ownerUserId, tenantUserId].filter(Boolean)
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds))
    }
  } catch (e) {
    console.warn('Cleanup warning:', e)
  }
  await sql.end()
})

/* ══════════════════════════════════════════════════════════
   Tests
   ══════════════════════════════════════════════════════════ */

describe('P2P Rental E2E', () => {
  /* ─────── 1. Create Listing ─────── */

  it('should create an active listing', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      token: ownerToken,
      body: {
        title: 'High-end Mac Studio Dev Environment',
        description: 'Full-stack development with M2 Ultra',
        skills: ['Web Development', 'Python', 'DevOps'],
        guidelines: 'No crypto mining, no web scraping',
        deviceTier: 'high_end',
        osType: 'macos',
        hourlyRate: 15,
        dailyRate: 300,
        monthlyRate: 7000,
        premiumMarkup: 10,
        depositAmount: 200,
        listingStatus: 'active',
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{ id: string; title: string; listingStatus: string }>(res)
    expect(data.id).toBeDefined()
    expect(data.title).toBe('High-end Mac Studio Dev Environment')
    listingId = data.id
  })

  it('should create a draft listing', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      token: ownerToken,
      body: {
        title: 'Budget Linux Server',
        description: 'Basic development environment',
        deviceTier: 'low_end',
        osType: 'linux',
        hourlyRate: 5,
        listingStatus: 'draft',
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{ id: string }>(res)
    draftListingId = data.id
  })

  it('should reject listing creation without authentication', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      body: {
        title: 'Should fail',
        hourlyRate: 10,
      },
    })
    expect(res.status).toBe(401)
  })

  /* ─────── 2. Browse & Search Listings ─────── */

  it('should browse marketplace listings', async () => {
    const res = await req('GET', '/api/marketplace/listings', {
      token: ownerToken,
      query: { limit: '10' },
    })

    expect(res.status).toBe(200)
    const data = await json<{ listings: unknown[]; total: number }>(res)
    expect(data.listings).toBeDefined()
    expect(data.total).toBeGreaterThanOrEqual(1)
  })

  it('should filter by device tier', async () => {
    const res = await req('GET', '/api/marketplace/listings', {
      token: ownerToken,
      query: { deviceTier: 'high_end', limit: '10' },
    })

    expect(res.status).toBe(200)
    const data = await json<{ listings: { deviceTier: string }[] }>(res)
    for (const l of data.listings) {
      expect(l.deviceTier).toBe('high_end')
    }
  })

  it('should search by keyword', async () => {
    const res = await req('GET', '/api/marketplace/listings', {
      token: ownerToken,
      query: { keyword: 'Mac Studio', limit: '10' },
    })

    expect(res.status).toBe(200)
    const data = await json<{ listings: { title: string }[] }>(res)
    expect(data.listings.length).toBeGreaterThanOrEqual(1)
  })

  /* ─────── 3. Get Listing Detail ─────── */

  it('should get listing detail and increment view count', async () => {
    const res = await req('GET', `/api/marketplace/listings/${listingId}`, {
      token: tenantToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ id: string; viewCount: number; title: string }>(res)
    expect(data.id).toBe(listingId)
    expect(data.viewCount).toBeGreaterThanOrEqual(1)
  })

  /* ─────── 4. Update Listing ─────── */

  it('should update a listing', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${listingId}`, {
      token: ownerToken,
      body: {
        description: 'Updated: Full-stack M2 Ultra with 192GB RAM',
        hourlyRate: 18,
      },
    })

    expect(res.status).toBe(200)
    const data = await json<{ hourlyRate: number }>(res)
    expect(data.hourlyRate).toBe(18)
  })

  it('should reject update from non-owner', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${listingId}`, {
      token: tenantToken,
      body: { hourlyRate: 1 },
    })
    expect(res.status).toBe(403)
  })

  /* ─────── 5. Toggle Listing ─────── */

  it('should pause a listing', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${listingId}/toggle`, {
      token: ownerToken,
      body: { isListed: false },
    })

    expect(res.status).toBe(200)
  })

  it('should resume a listing', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${listingId}/toggle`, {
      token: ownerToken,
      body: { isListed: true },
    })

    expect(res.status).toBe(200)
  })

  /* ─────── 5b. Delist own listing (toggle isListed false) ─────── */

  it('should delist own active listing', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${listingId}/toggle`, {
      token: ownerToken,
      body: { isListed: false },
    })
    expect(res.status).toBe(200)
    const data = await json<{ isListed: boolean }>(res)
    expect(data.isListed).toBe(false)

    // Verify it no longer appears in browse results
    const browseRes = await req('GET', '/api/marketplace/listings', {
      query: { limit: '100' },
    })
    expect(browseRes.status).toBe(200)
    const browseData = await json<{ listings: { id: string }[] }>(browseRes)
    const found = browseData.listings.find((l) => l.id === listingId)
    expect(found).toBeUndefined()

    // Re-list it for subsequent tests
    const relistRes = await req('PUT', `/api/marketplace/listings/${listingId}/toggle`, {
      token: ownerToken,
      body: { isListed: true },
    })
    expect(relistRes.status).toBe(200)
  })

  it('should reject delist from non-owner', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${listingId}/toggle`, {
      token: tenantToken,
      body: { isListed: false },
    })
    expect(res.status).toBe(403)
  })

  /* ─────── 5c. Browse pagination ─────── */

  it('should paginate browse results with limit and offset', async () => {
    const res1 = await req('GET', '/api/marketplace/listings', {
      query: { limit: '1', offset: '0' },
    })
    expect(res1.status).toBe(200)
    const page1 = await json<{ listings: { id: string }[]; total: number }>(res1)
    expect(page1.listings.length).toBeLessThanOrEqual(1)
    expect(page1.total).toBeGreaterThanOrEqual(1)

    // With offset beyond total, should return empty
    const res2 = await req('GET', '/api/marketplace/listings', {
      query: { limit: '10', offset: '9999' },
    })
    expect(res2.status).toBe(200)
    const page2 = await json<{ listings: unknown[]; total: number }>(res2)
    expect(page2.listings.length).toBe(0)
    expect(page2.total).toBeGreaterThanOrEqual(1)
  })

  /* ─────── 6. Cost Estimation ─────── */

  it('should estimate rental cost', async () => {
    const res = await req('GET', `/api/marketplace/listings/${listingId}/estimate`, {
      token: tenantToken,
      query: { hours: '10' },
    })

    expect(res.status).toBe(200)
    const data = await json<{
      rentalCost: number
      electricityCost: number
      platformFee: number
      deposit: number
      totalEstimate: number
    }>(res)
    expect(data.rentalCost).toBeGreaterThan(0)
    expect(data.electricityCost).toBeGreaterThan(0)
    expect(data.platformFee).toBeGreaterThan(0)
    expect(data.deposit).toBeGreaterThan(0)
    expect(data.totalEstimate).toBeGreaterThan(0)
  })

  it('should reject estimate with invalid hours', async () => {
    const res = await req('GET', `/api/marketplace/listings/${listingId}/estimate`, {
      token: tenantToken,
      query: { hours: '0' },
    })
    expect(res.status).toBe(400)
  })

  /* ─────── 7. Sign Contract ─────── */

  it('should sign a rental contract', async () => {
    const res = await req('POST', '/api/marketplace/contracts', {
      token: tenantToken,
      body: {
        listingId,
        durationHours: 24,
        agreedToTerms: true,
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{
      id: string
      contractNo: string
      tenantId: string
      ownerId: string
      status: string
    }>(res)
    expect(data.contractNo).toBeDefined()
    expect(data.tenantId).toBe(tenantUserId)
    expect(data.ownerId).toBe(ownerUserId)
    contractId = data.id
    contractNo = data.contractNo
  })

  it('should reject renting own listing', async () => {
    const res = await req('POST', '/api/marketplace/contracts', {
      token: ownerToken,
      body: {
        listingId,
        durationHours: 10,
      },
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  /* ─────── 8. Get Contracts ─────── */

  it('should get contracts as tenant', async () => {
    const res = await req('GET', '/api/marketplace/contracts', {
      token: tenantToken,
      query: { role: 'tenant' },
    })

    expect(res.status).toBe(200)
    const data = await json<{ contracts?: unknown[]; length?: number }>(res)
    // The response might be an array or an object with a contracts field
    const contracts = Array.isArray(data) ? data : (data.contracts ?? [])
    expect(contracts.length).toBeGreaterThanOrEqual(1)
  })

  it('should get contracts as owner', async () => {
    const res = await req('GET', '/api/marketplace/contracts', {
      token: ownerToken,
      query: { role: 'owner' },
    })

    expect(res.status).toBe(200)
  })

  it('should get contract detail', async () => {
    const res = await req('GET', `/api/marketplace/contracts/${contractId}`, {
      token: tenantToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ id: string; contractNo: string }>(res)
    expect(data.id).toBe(contractId)
  })

  it('should reject contract detail for unrelated user', async () => {
    // Create a third user
    const userDao = container.resolve('userDao')
    const ts = Date.now()
    const third = await userDao.create({
      email: `rental-third-${ts}@test.local`,
      username: `rentalthird${ts}`,
      passwordHash: 'not-used',
    })
    const thirdToken = signAccessToken({
      userId: third!.id,
      email: third!.email,
      username: third!.username,
    })

    const res = await req('GET', `/api/marketplace/contracts/${contractId}`, {
      token: thirdToken,
    })
    expect(res.status).toBe(403)

    // Cleanup
    const { users } = schema
    const { eq } = await import('drizzle-orm')
    await db.delete(users).where(eq(users.id, third!.id))
  })

  /* ─────── 9. Record Usage ─────── */

  it('should record a usage session', async () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const res = await req('POST', `/api/marketplace/contracts/${contractId}/usage`, {
      token: ownerToken,
      body: {
        startedAt: oneHourAgo.toISOString(),
        endedAt: now.toISOString(),
        durationMinutes: 60,
        tokensConsumed: 5000,
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{
      rentalCost: number
      tokenCost: number
      electricityCost: number
      totalCost: number
    }>(res)
    expect(data.totalCost).toBeGreaterThan(0)
    expect(data.rentalCost).toBeGreaterThan(0)
  })

  /* ─────── 10. My Listings ─────── */

  it('should get my listings as owner', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ listings?: unknown[]; length?: number }>(res)
    const listings = Array.isArray(data) ? data : (data.listings ?? [])
    expect(listings.length).toBeGreaterThanOrEqual(2)
  })

  /* ─────── 11. Report Violation ─────── */

  it('should report a contract violation', async () => {
    const res = await req('POST', `/api/marketplace/contracts/${contractId}/violate`, {
      token: ownerToken,
      body: {
        violationType: 'terms_violation',
        description: 'E2E test violation',
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{ id: string; violationType: string }>(res)
    expect(data.violationType).toBe('terms_violation')
  })

  /* ─────── 12. Terminate Contract ─────── */

  it('should terminate a contract', async () => {
    const res = await req('POST', `/api/marketplace/contracts/${contractId}/terminate`, {
      token: tenantToken,
      body: {
        reason: 'E2E test termination',
      },
    })

    expect(res.status).toBe(200)
    const data = await json<{ status: string }>(res)
    // After termination the status should change
    expect(['completed', 'cancelled']).toContain(data.status)
  })

  /* ─────── 13. Delete Listing ─────── */

  it('should delete a draft listing', async () => {
    const res = await req('DELETE', `/api/marketplace/listings/${draftListingId}`, {
      token: ownerToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ ok: boolean }>(res)
    expect(data.ok).toBe(true)
  })

  it('should reject delete from non-owner', async () => {
    const res = await req('DELETE', `/api/marketplace/listings/${listingId}`, {
      token: tenantToken,
    })
    expect(res.status).toBe(403)
  })
})
