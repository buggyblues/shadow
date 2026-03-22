/**
 * Rental Lifecycle E2E Tests
 *
 * Tests the contract completion → listing delist flow and agent-chat-status
 * access control against a real PostgreSQL database.
 *
 * Covers:
 *   1. Contract termination auto-delists the listing
 *   2. Expired contract auto-termination delists the listing
 *   3. agent-chat-status blocks expired/terminated tenants
 *   4. agent-chat-status allows owners to chat freely
 *   5. my-listings returns ALL owner listings with correct status enrichment
 *   6. Delisted listing does not appear in marketplace browse
 *   7. Owner can relist after contract ends
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

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@127.0.0.1:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

// Test identities
let ownerUserId: string
let tenantUserId: string
let thirdUserId: string
let ownerToken: string
let tenantToken: string
let thirdToken: string

// Agent + listing IDs
let agentBotUserId: string
let agentId: string
let listingId: string

// Contract IDs
let contractId: string

/* ── Helper: HTTP request through Hono ── */

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

  const userDao = container.resolve('userDao')
  const agentDao = container.resolve('agentDao')
  const ts = Date.now()

  // Create owner user
  const owner = await userDao.create({
    email: `lifecycle-owner-${ts}@test.local`,
    username: `lcowner${ts}`,
    passwordHash: 'not-used',
  })
  ownerUserId = owner!.id

  // Create tenant user
  const tenant = await userDao.create({
    email: `lifecycle-tenant-${ts}@test.local`,
    username: `lctenant${ts}`,
    passwordHash: 'not-used',
  })
  tenantUserId = tenant!.id

  // Create unrelated third user
  const third = await userDao.create({
    email: `lifecycle-third-${ts}@test.local`,
    username: `lcthird${ts}`,
    passwordHash: 'not-used',
  })
  thirdUserId = third!.id

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
  thirdToken = signAccessToken({
    userId: thirdUserId,
    email: third!.email,
    username: third!.username,
  })

  // Give tenant balance for deposit
  const walletService = container.resolve('walletService')
  await walletService.topUp(tenantUserId, 50000, 'Lifecycle test balance')

  // Create a bot user + agent (for agent-chat-status tests)
  const botUser = await agentDao.createBotUser({
    username: `lcbot${ts}`,
    displayName: 'Lifecycle Test Bot',
  })
  agentBotUserId = botUser!.id

  const agent = await agentDao.create({
    userId: agentBotUserId,
    kernelType: 'docker',
    config: {},
    ownerId: ownerUserId,
  })
  agentId = agent!.id
}, 30_000)

afterAll(async () => {
  try {
    const { eq, inArray } = await import('drizzle-orm')
    const {
      users,
      clawListings,
      rentalContracts,
      rentalUsageRecords,
      rentalViolations,
      wallets,
      agents: agentsTable,
    } = schema

    // Clean rental data
    if (contractId) {
      await db.delete(rentalViolations).where(eq(rentalViolations.contractId, contractId))
      await db.delete(rentalUsageRecords).where(eq(rentalUsageRecords.contractId, contractId))
      await db.delete(rentalContracts).where(eq(rentalContracts.id, contractId))
    }

    // Delete listings
    if (ownerUserId) {
      await db.delete(clawListings).where(eq(clawListings.ownerId, ownerUserId))
    }

    // Delete agent
    if (agentId) {
      await db.delete(agentsTable).where(eq(agentsTable.id, agentId))
    }

    // Delete wallets & users
    const userIds = [ownerUserId, tenantUserId, thirdUserId, agentBotUserId].filter(Boolean)
    for (const uid of userIds) {
      await db
        .delete(wallets)
        .where(eq(wallets.userId, uid))
        .catch(() => {})
    }
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

describe('Rental Lifecycle E2E', () => {
  /* ─────── 1. Create listing with agent ─────── */

  it('should create an active listing linked to an agent', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      token: ownerToken,
      body: {
        title: 'Lifecycle Test Claw',
        description: 'For lifecycle testing',
        deviceTier: 'mid_range',
        osType: 'macos',
        hourlyRate: 10,
        depositAmount: 100,
        listingStatus: 'active',
        agentId,
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{ id: string; listingStatus: string; isListed: boolean }>(res)
    expect(data.id).toBeDefined()
    expect(data.listingStatus).toBe('active')
    listingId = data.id
  })

  /* ─────── 2. agent-chat-status: listed agent blocks non-owner ─────── */

  it('should block non-owner chat when agent is listed (no contract)', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: tenantToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; reason?: string }>(res)
    expect(data.chatDisabled).toBe(true)
    expect(data.reason).toBe('listed')
  })

  /* ─────── 3. agent-chat-status: owner can always chat ─────── */

  it('should allow owner to chat with their own agent', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: ownerToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean }>(res)
    expect(data.chatDisabled).toBe(false)
  })

  /* ─────── 4. Sign contract ─────── */

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
    const data = await json<{ id: string; status: string }>(res)
    contractId = data.id
  })

  /* ─────── 5. agent-chat-status: active tenant can chat ─────── */

  it('should allow active tenant to chat with rented agent', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: tenantToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; rental?: { contractId: string } }>(res)
    expect(data.chatDisabled).toBe(false)
    expect(data.rental?.contractId).toBe(contractId)
  })

  /* ─────── 6. agent-chat-status: third user blocked (rented out) ─────── */

  it('should block unrelated user when agent is rented out', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: thirdToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; reason?: string }>(res)
    expect(data.chatDisabled).toBe(true)
    expect(data.reason).toBe('rented_out')
  })

  /* ─────── 7. my-listings: shows rented listing with enrichment ─────── */

  it('should return rented listing with isRented=true in my-listings', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{
      listings: { id: string; isRented: boolean; activeTenantId: string | null }[]
    }>(res)
    const listing = data.listings.find((l) => l.id === listingId)
    expect(listing).toBeDefined()
    expect(listing!.isRented).toBe(true)
    expect(listing!.activeTenantId).toBe(tenantUserId)
  })

  /* ─────── 8. Terminate contract → listing auto-delisted ─────── */

  it('should terminate contract and auto-delist the listing', async () => {
    const res = await req('POST', `/api/marketplace/contracts/${contractId}/terminate`, {
      token: tenantToken,
      body: { reason: 'Lifecycle test termination' },
    })

    expect(res.status).toBe(200)
    const data = await json<{ status: string }>(res)
    expect(data.status).toBe('completed')

    // Verify listing is now delisted
    const listingRes = await req('GET', `/api/marketplace/listings/${listingId}`, {
      token: ownerToken,
    })
    expect(listingRes.status).toBe(200)
    const listingData = await json<{ id: string; isListed: boolean }>(listingRes)
    expect(listingData.isListed).toBe(false)
  })

  /* ─────── 9. Delisted listing not in browse ─────── */

  it('should not show delisted listing in marketplace browse', async () => {
    const res = await req('GET', '/api/marketplace/listings', {
      query: { limit: '200' },
    })

    expect(res.status).toBe(200)
    const data = await json<{ listings: { id: string }[] }>(res)
    const found = data.listings.find((l) => l.id === listingId)
    expect(found).toBeUndefined()
  })

  /* ─────── 10. agent-chat-status: expired for former tenant ─────── */

  it('should return expired reason for former tenant after contract ends', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: tenantToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; reason?: string }>(res)
    expect(data.chatDisabled).toBe(true)
    expect(data.reason).toBe('expired')
  })

  /* ─────── 11. agent-chat-status: owner still chats after contract ends ─────── */

  it('should still allow owner to chat after contract ends', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: ownerToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean }>(res)
    expect(data.chatDisabled).toBe(false)
  })

  /* ─────── 12. my-listings: shows delisted listing with isRented=false ─────── */

  it('should show delisted listing with isRented=false after contract ends', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{
      listings: {
        id: string
        isRented: boolean
        isListed: boolean
        activeTenantId: string | null
      }[]
    }>(res)
    const listing = data.listings.find((l) => l.id === listingId)
    expect(listing).toBeDefined()
    expect(listing!.isRented).toBe(false)
    expect(listing!.isListed).toBe(false)
    expect(listing!.activeTenantId).toBeNull()
  })

  /* ─────── 13. Owner relists after contract ends ─────── */

  it('should allow owner to relist after contract ends', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${listingId}/toggle`, {
      token: ownerToken,
      body: { isListed: true },
    })

    expect(res.status).toBe(200)
    const data = await json<{ isListed: boolean }>(res)
    expect(data.isListed).toBe(true)

    // Verify it appears in browse after relisting
    const browseRes = await req('GET', '/api/marketplace/listings', {
      query: { limit: '200' },
    })
    expect(browseRes.status).toBe(200)
    const browseData = await json<{ listings: { id: string }[] }>(browseRes)
    const found = browseData.listings.find((l) => l.id === listingId)
    expect(found).toBeDefined()
  })

  /* ─────── 14. Re-rent and test expired contract auto-termination ─────── */

  it('should sign a short-lived contract for expiration test', async () => {
    // Delist first since signContract requires isListed
    // (Already relisted in test 13, good)

    const res = await req('POST', '/api/marketplace/contracts', {
      token: tenantToken,
      body: {
        listingId,
        durationHours: 1, // 1 hour
        agreedToTerms: true,
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{ id: string }>(res)
    contractId = data.id // Update for cleanup
  })

  it('should auto-terminate expired contracts and delist listings', async () => {
    // Manually set the contract's expiresAt to the past to simulate expiration
    const rentalContractDao = container.resolve('rentalContractDao')
    await rentalContractDao.update(contractId, {
      expiresAt: new Date(Date.now() - 60_000), // 1 minute ago
    })

    // Run the expired contracts termination
    const rentalService = container.resolve('rentalService')
    const results = await rentalService.terminateExpiredContracts()

    // Verify our contract was terminated
    const terminated = results.find((r) => r.contractId === contractId)
    expect(terminated).toBeDefined()
    expect(terminated!.success).toBe(true)

    // Verify listing is now delisted
    const listingRes = await req('GET', `/api/marketplace/listings/${listingId}`, {
      token: ownerToken,
    })
    expect(listingRes.status).toBe(200)
    const listingData = await json<{ id: string; isListed: boolean }>(listingRes)
    expect(listingData.isListed).toBe(false)

    // Verify agent-chat-status returns expired for former tenant
    const chatRes = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: tenantToken,
    })
    expect(chatRes.status).toBe(200)
    const chatData = await json<{ chatDisabled: boolean; reason?: string }>(chatRes)
    expect(chatData.chatDisabled).toBe(true)
    expect(chatData.reason).toBe('expired')
  })

  /* ─────── 15. Status consistency across endpoints ─────── */

  it('should have consistent status across all endpoints after termination', async () => {
    // 1. Contract shows as completed
    const contractRes = await req('GET', `/api/marketplace/contracts/${contractId}`, {
      token: tenantToken,
    })
    expect(contractRes.status).toBe(200)
    const contractData = await json<{ id: string; status: string }>(contractRes)
    expect(contractData.status).toBe('completed')

    // 2. Listing shows as delisted in my-listings
    const myListingsRes = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })
    expect(myListingsRes.status).toBe(200)
    const myListingsData = await json<{
      listings: { id: string; isRented: boolean; isListed: boolean }[]
    }>(myListingsRes)
    const listing = myListingsData.listings.find((l) => l.id === listingId)
    expect(listing).toBeDefined()
    expect(listing!.isRented).toBe(false)
    expect(listing!.isListed).toBe(false)

    // 3. Listing does NOT appear in marketplace browse
    const browseRes = await req('GET', '/api/marketplace/listings', {
      query: { limit: '200' },
    })
    expect(browseRes.status).toBe(200)
    const browseData = await json<{ listings: { id: string }[] }>(browseRes)
    const found = browseData.listings.find((l) => l.id === listingId)
    expect(found).toBeUndefined()

    // 4. Chat is blocked for former tenant
    const chatRes = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: tenantToken,
    })
    expect(chatRes.status).toBe(200)
    const chatData = await json<{ chatDisabled: boolean; reason?: string }>(chatRes)
    expect(chatData.chatDisabled).toBe(true)

    // 5. Owner can still chat
    const ownerChatRes = await req('GET', `/api/marketplace/agent-chat-status/${agentBotUserId}`, {
      token: ownerToken,
    })
    expect(ownerChatRes.status).toBe(200)
    const ownerChatData = await json<{ chatDisabled: boolean }>(ownerChatRes)
    expect(ownerChatData.chatDisabled).toBe(false)
  })
})
