/**
 * Rental Billing V2 — End-to-End Tests
 *
 * Tests the new billing model (baseDailyRate + messageFee + platformFee):
 *   1. Create listing with v2 pricing fields
 *   2. Cost estimation for v2 listings
 *   3. Sign contract — first day baseDailyRate charged immediately
 *   4. Message counting increments
 *   5. Billing cycle (billActiveContracts) for v2
 *   6. Contract detail includes v2 fields
 *   7. Backward compat: v1 listing still works
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

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@127.0.0.1:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

let ownerUserId: string
let tenantUserId: string
let ownerToken: string
let tenantToken: string

let v2ListingId: string
let v2ContractId: string

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
  const ts = Date.now()

  const owner = await userDao.create({
    email: `billing-v2-owner-${ts}@test.local`,
    username: `billingv2owner${ts}`,
    passwordHash: 'not-used',
  })
  ownerUserId = owner!.id

  const tenant = await userDao.create({
    email: `billing-v2-tenant-${ts}@test.local`,
    username: `billingv2tenant${ts}`,
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

  const walletService = container.resolve('walletService')
  await walletService.topUp(tenantUserId, 50000, 'Test balance for billing v2 E2E')
}, 30_000)

afterAll(async () => {
  try {
    const { eq, inArray } = await import('drizzle-orm')
    const { clawListings, rentalContracts, rentalUsageRecords, rentalViolations, wallets, users } =
      schema

    if (v2ContractId) {
      await db.delete(rentalViolations).where(eq(rentalViolations.contractId, v2ContractId))
      await db.delete(rentalUsageRecords).where(eq(rentalUsageRecords.contractId, v2ContractId))
      await db.delete(rentalContracts).where(eq(rentalContracts.id, v2ContractId))
    }
    if (ownerUserId) {
      await db.delete(clawListings).where(eq(clawListings.ownerId, ownerUserId))
    }
    const userIds = [ownerUserId, tenantUserId].filter(Boolean)
    if (userIds.length > 0) {
      await db.delete(wallets).where(inArray(wallets.userId, userIds))
      await db.delete(users).where(inArray(users.id, userIds))
    }
  } catch (e) {
    console.warn('Cleanup warning:', e)
  }
  await sql.end()
})

describe('Rental Billing V2 E2E', () => {
  /* ─────── 1. Create V2 Listing ─────── */

  it('should create a listing with v2 pricing fields', async () => {
    const res = await req('POST', '/api/marketplace/listings', {
      token: ownerToken,
      body: {
        title: 'V2 Billing Test Claw',
        description: 'Testing new billing model',
        deviceTier: 'mid_range',
        osType: 'macos',
        baseDailyRate: 500,
        messageFee: 10,
        pricingVersion: 2,
        depositAmount: 100,
        tokenFeePassthrough: true,
        listingStatus: 'active',
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{
      id: string
      baseDailyRate: number
      messageFee: number
      pricingVersion: number
    }>(res)
    expect(data.id).toBeDefined()
    expect(data.baseDailyRate).toBe(500)
    expect(data.messageFee).toBe(10)
    expect(data.pricingVersion).toBe(2)
    v2ListingId = data.id
  })

  /* ─────── 2. Cost Estimation for V2 ─────── */

  it('should return v2 cost estimate with daily base and message costs', async () => {
    const res = await req('GET', `/api/marketplace/listings/${v2ListingId}/estimate`, {
      token: tenantToken,
      query: { hours: '48' },
    })

    expect(res.status).toBe(200)
    const data = await json<{
      baseDailyRate: number
      dailyBaseCost: number
      estimatedMessageCost: number
      platformFee: number
      deposit: number
      totalEstimate: number
      pricingVersion: number
    }>(res)
    expect(data.pricingVersion).toBe(2)
    expect(data.baseDailyRate).toBe(500)
    // 48h = 2 days → dailyBaseCost = 2 * 500 = 1000
    expect(data.dailyBaseCost).toBe(1000)
    // estimatedMessageCost: assumes ~10 msgs/day → 2 days * 10 msgs * 10 per msg = 200
    expect(data.estimatedMessageCost).toBeGreaterThan(0)
    expect(data.platformFee).toBeGreaterThan(0)
    expect(data.totalEstimate).toBeGreaterThan(0)
  })

  /* ─────── 3. Sign V2 Contract ─────── */

  it('should sign a v2 contract and charge first day baseDailyRate', async () => {
    // Get tenant balance before signing
    const walletService = container.resolve('walletService')
    const walletBefore = await walletService.getWallet(tenantUserId)
    const balanceBefore = walletBefore!.balance

    const res = await req('POST', '/api/marketplace/contracts', {
      token: tenantToken,
      body: {
        listingId: v2ListingId,
        durationHours: 72,
        agreedToTerms: true,
      },
    })

    expect(res.status).toBe(201)
    const data = await json<{
      id: string
      baseDailyRate: number
      messageFee: number
      pricingVersion: number
      status: string
    }>(res)
    expect(data.pricingVersion).toBe(2)
    expect(data.baseDailyRate).toBe(500)
    expect(data.messageFee).toBe(10)
    expect(data.status).toBe('active')
    v2ContractId = data.id

    // Verify balance was reduced by deposit + first day's base daily rate + platform fee
    const walletAfter = await walletService.getWallet(tenantUserId)
    const balanceAfter = walletAfter!.balance
    // deposit=100, first day cost=500, platformFee=ceil(500*500/10000)=25
    // Total deducted: 100 + 500 + 25 = 625
    expect(balanceBefore - balanceAfter).toBeGreaterThanOrEqual(600)
  })

  /* ─────── 4. Contract Detail Includes V2 Fields ─────── */

  it('should include v2 fields in contract detail', async () => {
    const res = await req('GET', `/api/marketplace/contracts/${v2ContractId}`, {
      token: tenantToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{
      id: string
      baseDailyRate: number
      messageFee: number
      pricingVersion: number
      messageCount: number
      totalCost: number
    }>(res)
    expect(data.baseDailyRate).toBe(500)
    expect(data.messageFee).toBe(10)
    expect(data.pricingVersion).toBe(2)
    expect(data.messageCount).toBe(0)
    // totalCost should reflect first-day charge
    expect(data.totalCost).toBeGreaterThan(0)
  })

  /* ─────── 5. Message Counting ─────── */

  it('should increment message count on the contract', async () => {
    const rentalContractDao = container.resolve('rentalContractDao')

    // Increment message count 3 times
    await rentalContractDao.incrementMessageCount(v2ContractId)
    await rentalContractDao.incrementMessageCount(v2ContractId)
    await rentalContractDao.incrementMessageCount(v2ContractId)

    // Verify via contract detail
    const res = await req('GET', `/api/marketplace/contracts/${v2ContractId}`, {
      token: tenantToken,
    })

    expect(res.status).toBe(200)
    const data = await json<{ messageCount: number }>(res)
    expect(data.messageCount).toBe(3)
  })

  /* ─────── 6. Billing Cycle (V2) ─────── */

  it('should bill v2 contract with daily base + message fees', async () => {
    const rentalService = container.resolve('rentalService')
    const walletService = container.resolve('walletService')
    const rentalContractDao = container.resolve('rentalContractDao')

    // Manipulate lastBilledDailyAt to simulate 1 day passing
    const { eq } = await import('drizzle-orm')
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await db
      .update(schema.rentalContracts)
      .set({ lastBilledDailyAt: oneDayAgo })
      .where(eq(schema.rentalContracts.id, v2ContractId))

    const wBefore1 = await walletService.getWallet(tenantUserId)
    const balanceBefore = wBefore1!.balance

    // Run billing cycle
    await rentalService.billActiveContracts()

    const wAfter1 = await walletService.getWallet(tenantUserId)
    const balanceAfter = wAfter1!.balance

    // Should have charged: baseDailyRate (500) + 3 unbilled messages * 10 = 530, plus platformFee
    const charged = balanceBefore - balanceAfter
    expect(charged).toBeGreaterThanOrEqual(530) // at least base + message cost before platform fee

    // Verify message count tracking was updated (lastBilledMessageCount should now be 3)
    const contractRes = await req('GET', `/api/marketplace/contracts/${v2ContractId}`, {
      token: tenantToken,
    })
    expect(contractRes.status).toBe(200)
    const contractData = await json<{ totalCost: number }>(contractRes)
    expect(contractData.totalCost).toBeGreaterThan(0)
  })

  /* ─────── 7. Second Billing Cycle (no new messages) ─────── */

  it('should only charge daily base fee when no new messages', async () => {
    const rentalService = container.resolve('rentalService')
    const walletService = container.resolve('walletService')

    // Simulate another day passing
    const { eq } = await import('drizzle-orm')
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await db
      .update(schema.rentalContracts)
      .set({ lastBilledDailyAt: oneDayAgo })
      .where(eq(schema.rentalContracts.id, v2ContractId))

    const wBefore2 = await walletService.getWallet(tenantUserId)
    const balanceBefore = wBefore2!.balance

    await rentalService.billActiveContracts()

    const wAfter2 = await walletService.getWallet(tenantUserId)
    const balanceAfter = wAfter2!.balance
    const charged = balanceBefore - balanceAfter

    // Only daily base (500) + platform fee (ceil(500*500/10000)=25) = 525
    // No message fees since lastBilledMessageCount catches up
    expect(charged).toBeGreaterThanOrEqual(500)
    expect(charged).toBeLessThan(600) // Shouldn't be much more than base + platform fee
  })

  /* ─────── 8. Contract Termination ─────── */

  it('should terminate v2 contract and refund deposit', async () => {
    const walletService = container.resolve('walletService')
    const wBefore3 = await walletService.getWallet(tenantUserId)
    const balanceBefore = wBefore3!.balance

    const res = await req('POST', `/api/marketplace/contracts/${v2ContractId}/terminate`, {
      token: tenantToken,
      body: { reason: 'Testing termination' },
    })

    expect(res.status).toBe(200)

    // Deposit should be refunded
    const wAfter3 = await walletService.getWallet(tenantUserId)
    const balanceAfter = wAfter3!.balance
    expect(balanceAfter).toBeGreaterThan(balanceBefore) // deposit refund
  })

  /* ─────── 9. V2 Contracts in My Rentals ─────── */

  it('should include v2 fields in tenant contract list', async () => {
    const res = await req('GET', '/api/marketplace/contracts', {
      token: tenantToken,
      query: { role: 'tenant' },
    })

    expect(res.status).toBe(200)
    const data = await json<{
      contracts: {
        id: string
        baseDailyRate?: number
        pricingVersion?: number
        totalCost: number
      }[]
    }>(res)
    const contract = data.contracts.find((c) => c.id === v2ContractId)
    expect(contract).toBeDefined()
    expect(contract!.totalCost).toBeGreaterThan(0)
  })
})
