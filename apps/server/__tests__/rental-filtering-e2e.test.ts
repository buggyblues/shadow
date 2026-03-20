/**
 * P2P Rental System — Filtering & Agent Chat Status E2E Tests
 *
 * Tests:
 *   1. my-listings endpoint filters out rented and unlisted listings
 *   2. agent-chat-status endpoint returns correct disabled state
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
let ownerToken: string
let tenantToken: string

// Agent / bot IDs
let botUserId: string
let agentId: string

// Listing IDs
let activeListingId: string
let draftListingId: string
let agentListingId: string // listing linked to agent

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

  const userDao = container.resolve('userDao')
  const agentDao = container.resolve('agentDao')
  const ts = Date.now()

  // Create owner user
  const owner = await userDao.create({
    email: `filter-owner-${ts}@test.local`,
    username: `filterowner${ts}`,
    passwordHash: 'not-used',
  })
  ownerUserId = owner!.id

  // Create tenant user
  const tenant = await userDao.create({
    email: `filter-tenant-${ts}@test.local`,
    username: `filtertenant${ts}`,
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

  // Give tenant balance for deposits
  const walletService = container.resolve('walletService')
  await walletService.topUp(tenantUserId, 10000, 'Test balance for filtering E2E')

  // Create bot user + agent (owned by owner)
  const botUser = await agentDao.createBotUser({
    username: `filterbot${ts}`,
    displayName: `Filter Test Bot ${ts}`,
  })
  botUserId = botUser!.id

  const agent = await agentDao.create({
    userId: botUserId,
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
      clawListings,
      rentalContracts,
      rentalUsageRecords,
      rentalViolations,
      wallets,
      users,
      agents,
    } = schema

    // Clean rental data (contracts first due to FK)
    if (ownerUserId) {
      // Find all contracts related to owner's listings
      const listings = await db
        .select({ id: clawListings.id })
        .from(clawListings)
        .where(eq(clawListings.ownerId, ownerUserId))
      const listingIds = listings.map((l) => l.id)

      if (listingIds.length > 0) {
        const contracts = await db
          .select({ id: rentalContracts.id })
          .from(rentalContracts)
          .where(inArray(rentalContracts.listingId, listingIds))
        const contractIds = contracts.map((c) => c.id)

        if (contractIds.length > 0) {
          await db.delete(rentalViolations).where(inArray(rentalViolations.contractId, contractIds))
          await db
            .delete(rentalUsageRecords)
            .where(inArray(rentalUsageRecords.contractId, contractIds))
          await db.delete(rentalContracts).where(inArray(rentalContracts.id, contractIds))
        }
      }

      await db.delete(clawListings).where(eq(clawListings.ownerId, ownerUserId))
    }

    // Delete agent
    if (agentId) {
      await db.delete(agents).where(eq(agents.id, agentId))
    }

    // Delete wallets
    if (tenantUserId) await db.delete(wallets).where(eq(wallets.userId, tenantUserId))
    if (ownerUserId) await db.delete(wallets).where(eq(wallets.userId, ownerUserId))

    // Delete users (bot user too)
    const userIds = [ownerUserId, tenantUserId, botUserId].filter(Boolean)
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

describe('Rental Filtering & Agent Chat Status E2E', () => {
  /* ─────── 1. Setup listings ─────── */

  it('should create an active listed listing (no agent)', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      token: ownerToken,
      body: {
        title: 'Filter Test Active Listing',
        description: 'Active listed listing for filter tests',
        deviceTier: 'mid_range',
        osType: 'macos',
        hourlyRate: 10,
        dailyRate: 200,
        depositAmount: 100,
        listingStatus: 'active',
      },
    })
    expect(res.status).toBe(201)
    const data = await json<{ id: string }>(res)
    activeListingId = data.id
  })

  it('should create a draft listing', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      token: ownerToken,
      body: {
        title: 'Filter Test Draft Listing',
        description: 'Draft listing for filter tests',
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

  it('should create an active listing linked to agent', async () => {
    // Create directly in DB since the API might not expose agentId field
    const result = await db
      .insert(schema.clawListings)
      .values({
        ownerId: ownerUserId,
        agentId,
        title: 'Filter Test Agent Listing',
        description: 'Agent-linked listing for chat status tests',
        deviceTier: 'high_end',
        osType: 'macos',
        hourlyRate: 20,
        dailyRate: 400,
        depositAmount: 200,
        listingStatus: 'active',
        isListed: true,
      })
      .returning()
    agentListingId = result[0]!.id
  })

  /* ─────── 2. my-listings filtering ─────── */

  it('should include active listed listing in my-listings', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ listings: { id: string }[] }>(res)
    const found = data.listings.find((l) => l.id === activeListingId)
    expect(found).toBeDefined()
  })

  it('should exclude draft listing from my-listings', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ listings: { id: string }[] }>(res)
    const found = data.listings.find((l) => l.id === draftListingId)
    expect(found).toBeUndefined()
  })

  it('should include agent listing (active & listed) in my-listings', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ listings: { id: string }[] }>(res)
    const found = data.listings.find((l) => l.id === agentListingId)
    expect(found).toBeDefined()
  })

  /* ─────── 3. Agent chat status — listed agent ─────── */

  it('should return chatDisabled: false for unknown user', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000'
    const res = await req('GET', `/api/marketplace/agent-chat-status/${fakeUserId}`, {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; reason?: string }>(res)
    expect(data.chatDisabled).toBe(false)
    expect(data.reason).toBeUndefined()
  })

  it('should return chatDisabled: true with reason "listed" for listed agent', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${botUserId}`, {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; reason?: string }>(res)
    expect(data.chatDisabled).toBe(true)
    expect(data.reason).toBe('listed')
  })

  /* ─────── 4. Rent the agent listing → rented_out ─────── */

  let agentContractId: string

  it('should sign contract on agent listing', async () => {
    const res = await req('POST', '/api/marketplace/contracts', {
      token: tenantToken,
      body: {
        listingId: agentListingId,
        durationHours: 24,
        agreedToTerms: true,
      },
    })
    expect(res.status).toBe(201)
    const data = await json<{ id: string }>(res)
    agentContractId = data.id
  })

  it('should exclude rented agent listing from my-listings', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ listings: { id: string }[] }>(res)
    const found = data.listings.find((l) => l.id === agentListingId)
    expect(found).toBeUndefined()
  })

  it('should return chatDisabled: true with reason "rented_out" for rented agent', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${botUserId}`, {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; reason?: string }>(res)
    expect(data.chatDisabled).toBe(true)
    expect(data.reason).toBe('rented_out')
  })

  /* ─────── 5. Terminate contract & delist → chatDisabled: false ─────── */

  it('should terminate the agent contract', async () => {
    const res = await req('POST', `/api/marketplace/contracts/${agentContractId}/terminate`, {
      token: tenantToken,
      body: { reason: 'Test termination' },
    })
    expect(res.status).toBe(200)
  })

  it('should delist agent listing', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${agentListingId}/toggle`, {
      token: ownerToken,
      body: { isListed: false },
    })
    expect(res.status).toBe(200)
  })

  it('should return chatDisabled: false after termination and delisting', async () => {
    const res = await req('GET', `/api/marketplace/agent-chat-status/${botUserId}`, {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ chatDisabled: boolean; reason?: string }>(res)
    expect(data.chatDisabled).toBe(false)
  })

  it('should exclude delisted agent listing from my-listings', async () => {
    const res = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })
    expect(res.status).toBe(200)
    const data = await json<{ listings: { id: string }[] }>(res)
    const delistedFound = data.listings.find((l) => l.id === agentListingId)
    expect(delistedFound).toBeUndefined()
  })

  /* ─────── 6. Re-list agent listing → back in my-listings ─────── */

  it('should re-list agent listing and see it in my-listings again', async () => {
    const res = await req('PUT', `/api/marketplace/listings/${agentListingId}/toggle`, {
      token: ownerToken,
      body: { isListed: true },
    })
    expect(res.status).toBe(200)

    const myRes = await req('GET', '/api/marketplace/my-listings', {
      token: ownerToken,
    })
    expect(myRes.status).toBe(200)
    const data = await json<{ listings: { id: string }[] }>(myRes)
    const found = data.listings.find((l) => l.id === agentListingId)
    expect(found).toBeDefined()
  })
})
