/**
 * Rental ↔ Friendship Integration E2E Tests
 *
 * Tests the integration between rental contracts and the friend list:
 *   1. Rented Buddies appear in the tenant's friend list
 *   2. Rented Buddies are tagged with source='rented_agent' and rentalExpiresAt
 *   3. After contract termination, rented Buddy disappears from friend list
 *   4. Contract APIs return agentUserId when listing has an agentId
 *   5. Direct channel can be created with the rented Buddy's bot user (the "use" flow)
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { asValue } from 'awilix'
import { and, eq, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createChannelHandler } from '../src/handlers/channel.handler'
import { createFriendshipHandler } from '../src/handlers/friendship.handler'
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
let ioToMock: ReturnType<typeof vi.fn>
let ioEmitMock: ReturnType<typeof vi.fn>

// Test identities
let ownerUserId: string
let tenantUserId: string
let ownerToken: string
let tenantToken: string

// Agent & bot user for the listing
let agentId: string
let buddyUserId: string

// IDs tracked across tests
let listingId: string
let contractId: string

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
  ioEmitMock = vi.fn()
  ioToMock = vi.fn(() => ({ emit: ioEmitMock }))
  container.register({ io: asValue({ to: ioToMock }) })

  app = new Hono()
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500
    return c.json({ error: message }, status as 400)
  })
  app.route('/api', createRentalHandler(container))
  app.route('/api/friends', createFriendshipHandler(container))
  app.route('/api', createChannelHandler(container))

  // Create test users
  const userDao = container.resolve('userDao')
  const agentDao = container.resolve('agentDao')
  const ts = Date.now()

  const owner = await userDao.create({
    email: `rf-owner-${ts}@test.local`,
    username: `rfowner${ts}`,
    passwordHash: 'not-used',
  })
  ownerUserId = owner!.id

  const tenant = await userDao.create({
    email: `rf-tenant-${ts}@test.local`,
    username: `rftenant${ts}`,
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

  // Create a bot user and agent for the owner
  const botUser = await agentDao.createBotUser({
    username: `rfbot${ts}`,
    displayName: `Test Bot ${ts}`,
  })
  buddyUserId = botUser!.id

  const agent = await agentDao.create({
    userId: buddyUserId,
    kernelType: 'test',
    config: { buddyMode: 'shareable', allowedServerIds: [] },
    ownerId: ownerUserId,
  })
  agentId = agent!.id

  // Give the tenant balance for deposits and rental
  const walletService = container.resolve('walletService')
  await walletService.topUp(tenantUserId, 10000, 'Test balance for rental-friendship E2E')
}, 30_000)

afterAll(async () => {
  try {
    const { eq, inArray } = await import('drizzle-orm')
    const { agentListings, rentalContracts, rentalUsageRecords, rentalViolations, wallets, users } =
      schema
    const { agents } = schema

    // Clean rental data
    if (contractId) {
      await db.delete(rentalViolations).where(eq(rentalViolations.contractId, contractId))
      await db.delete(rentalUsageRecords).where(eq(rentalUsageRecords.contractId, contractId))
      await db.delete(rentalContracts).where(eq(rentalContracts.id, contractId))
    }

    // Delete all listings by owner
    if (ownerUserId) {
      await db.delete(agentListings).where(eq(agentListings.ownerId, ownerUserId))
    }

    // Clean direct channel data
    const { channels, messages } = schema
    if (tenantUserId && buddyUserId) {
      const directChannels = await db
        .select()
        .from(channels)
        .where(
          and(
            eq(channels.kind, 'dm'),
            or(
              and(eq(channels.dmUserAId, tenantUserId), eq(channels.dmUserBId, buddyUserId)),
              and(eq(channels.dmUserAId, buddyUserId), eq(channels.dmUserBId, tenantUserId)),
            ),
          ),
        )
      for (const ch of directChannels) {
        await db.delete(messages).where(eq(messages.channelId, ch.id))
        await db.delete(channels).where(eq(channels.id, ch.id))
      }
    }

    // Delete agent
    if (agentId) {
      await db.delete(agents).where(eq(agents.id, agentId))
    }

    // Delete wallets
    if (tenantUserId) await db.delete(wallets).where(eq(wallets.userId, tenantUserId))
    if (ownerUserId) await db.delete(wallets).where(eq(wallets.userId, ownerUserId))

    // Delete users (bot user + test users)
    const userIds = [ownerUserId, tenantUserId, buddyUserId].filter(Boolean)
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

describe('Rental ↔ Friendship Integration E2E', () => {
  /* ─────── 1. Create listing with agentId ─────── */

  it('should create a listing with an agentId', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      token: ownerToken,
      body: {
        agentId,
        title: 'Test Bot with Agent',
        description: 'An agent listing with a linked agent',
        skills: ['Testing'],
        deviceTier: 'mid_range',
        osType: 'linux',
        hourlyRate: 10,
        dailyRate: 200,
        depositAmount: 50,
        listingStatus: 'active',
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{ id: string }>(res)
    expect(data.id).toBeDefined()
    listingId = data.id
  })

  /* ─────── 2. Tenant's friend list before renting ─────── */

  it('should NOT show the Buddy in tenant friend list before renting', async () => {
    const res = await req('GET', '/api/friends', { token: tenantToken })
    expect(res.status).toBe(200)

    const friends = await json<{ source: string; user: { id: string } }[]>(res)
    const rentedBuddy = friends.find(
      (f) => f.source === 'rented_agent' && f.user.id === buddyUserId,
    )
    expect(rentedBuddy).toBeUndefined()
  })

  /* ─────── 3. Sign rental contract ─────── */

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
    const data = await json<{ id: string; tenantId: string; ownerId: string; status: string }>(res)
    expect(data.tenantId).toBe(tenantUserId)
    expect(data.ownerId).toBe(ownerUserId)
    contractId = data.id
  })

  /* ─────── 4. Rented Buddy appears in tenant's friend list ─────── */

  it('should show the rented Buddy in tenant friend list after renting', async () => {
    const res = await req('GET', '/api/friends', { token: tenantToken })
    expect(res.status).toBe(200)

    const friends =
      await json<
        {
          friendshipId: string
          source: string
          user: { id: string; username: string; isBot: boolean }
          rentalExpiresAt?: string | null
        }[]
      >(res)

    const rentedBuddy = friends.find(
      (f) => f.source === 'rented_agent' && f.user.id === buddyUserId,
    )
    expect(rentedBuddy).toBeDefined()
    expect(rentedBuddy!.user.isBot).toBe(true)
    expect(rentedBuddy!.friendshipId).toMatch(/^agent:rented:/)
    // rentalExpiresAt should be set since we used durationHours=24
    expect(rentedBuddy!.rentalExpiresAt).toBeDefined()
    expect(rentedBuddy!.rentalExpiresAt).not.toBeNull()
  })

  it('should NOT show the rented Buddy in owner friend list as rented_agent', async () => {
    const res = await req('GET', '/api/friends', { token: ownerToken })
    expect(res.status).toBe(200)

    const friends = await json<{ source: string; user: { id: string } }[]>(res)
    // The owner should see it as owned_agent, not rented_agent
    const asRented = friends.find((f) => f.source === 'rented_agent' && f.user.id === buddyUserId)
    expect(asRented).toBeUndefined()

    const asOwned = friends.find((f) => f.source === 'owned_agent' && f.user.id === buddyUserId)
    expect(asOwned).toBeDefined()
  })

  /* ─────── 5. Contract APIs include resolved agentUserId ─────── */

  it('should include non-null agentUserId in contract list', async () => {
    const res = await req('GET', '/api/marketplace/contracts', {
      token: tenantToken,
      query: { role: 'tenant' },
    })
    expect(res.status).toBe(200)

    const data = await json<{ contracts: { id: string; agentUserId: string | null }[] }>(res)
    const contract = data.contracts.find((c) => c.id === contractId)
    expect(contract).toBeDefined()
    expect(contract!.agentUserId).toBe(buddyUserId)
  })

  it('should include non-null agentUserId in contract detail', async () => {
    const res = await req('GET', `/api/marketplace/contracts/${contractId}`, {
      token: tenantToken,
    })
    expect(res.status).toBe(200)

    const data = await json<{ id: string; agentUserId: string | null }>(res)
    expect(data.id).toBe(contractId)
    expect(data.agentUserId).toBe(buddyUserId)
  })

  /* ─────── 6. "Use Buddy" flow: create direct channel with bot ─────── */

  it('should create a direct channel with the rented Buddy bot user', async () => {
    ioToMock.mockClear()
    ioEmitMock.mockClear()

    const res = await req('POST', '/api/channels/dm', {
      token: tenantToken,
      body: { userId: buddyUserId },
    })
    expect(res.status).toBe(201)

    const data = await json<{
      id: string
      kind: string
      serverId: string | null
      dmUserAId: string
      dmUserBId: string
    }>(res)
    expect(data.id).toBeDefined()
    expect(data.kind).toBe('dm')
    expect(data.serverId).toBeNull()
    const participants = [data.dmUserAId, data.dmUserBId]
    expect(participants).toContain(tenantUserId)
    expect(participants).toContain(buddyUserId)
    expect(ioToMock).toHaveBeenCalledWith(`user:${buddyUserId}`)
    expect(ioEmitMock).toHaveBeenCalledWith('channel:member-added', { channelId: data.id })
  })

  it('should return the same direct channel on repeated creation', async () => {
    ioToMock.mockClear()
    ioEmitMock.mockClear()

    const res1 = await req('POST', '/api/channels/dm', {
      token: tenantToken,
      body: { userId: buddyUserId },
    })
    const data1 = await json<{ id: string }>(res1)

    const res2 = await req('POST', '/api/channels/dm', {
      token: tenantToken,
      body: { userId: buddyUserId },
    })
    const data2 = await json<{ id: string }>(res2)

    expect(data1.id).toBe(data2.id)
    expect(ioToMock).not.toHaveBeenCalled()
    expect(ioEmitMock).not.toHaveBeenCalled()
  })

  /* ─────── 7. Owner sees Buddy as rented_out in their friend list ─────── */

  it('should show owned Buddy with rented_out status in owner friend list', async () => {
    const res = await req('GET', '/api/friends', { token: ownerToken })
    expect(res.status).toBe(200)

    const friends =
      await json<{ source: string; user: { id: string }; agentStatus?: string }[]>(res)
    const ownedBuddy = friends.find((f) => f.source === 'owned_agent' && f.user.id === buddyUserId)
    expect(ownedBuddy).toBeDefined()
    expect(ownedBuddy!.agentStatus).toBe('rented_out')
  })

  /* ─────── 8. Terminate contract ─────── */

  it('should terminate the contract', async () => {
    const res = await req('POST', `/api/marketplace/contracts/${contractId}/terminate`, {
      token: tenantToken,
      body: { reason: 'E2E test termination' },
    })
    expect(res.status).toBe(200)

    const data = await json<{ status: string }>(res)
    expect(['completed', 'cancelled']).toContain(data.status)
  })

  /* ─────── 9. Buddy disappears from tenant friend list after termination ─────── */

  it('should NOT show the rented Buddy in tenant friend list after termination', async () => {
    const res = await req('GET', '/api/friends', { token: tenantToken })
    expect(res.status).toBe(200)

    const friends = await json<{ source: string; user: { id: string } }[]>(res)
    const rentedBuddy = friends.find(
      (f) => f.source === 'rented_agent' && f.user.id === buddyUserId,
    )
    expect(rentedBuddy).toBeUndefined()
  })

  it('should show owned Buddy as available after termination in owner friend list', async () => {
    const res = await req('GET', '/api/friends', { token: ownerToken })
    expect(res.status).toBe(200)

    const friends =
      await json<{ source: string; user: { id: string }; agentStatus?: string }[]>(res)
    const ownedBuddy = friends.find((f) => f.source === 'owned_agent' && f.user.id === buddyUserId)
    expect(ownedBuddy).toBeDefined()
    // After termination, no active contracts → status should not be rented_out
    // It will be 'listed' if still listed, or 'available' if no active listing
    expect(ownedBuddy!.agentStatus).not.toBe('rented_out')
  })
})
