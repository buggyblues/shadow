import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  browseListingsSchema,
  createListingSchema,
  recordUsageSchema,
  reportViolationSchema,
  signContractSchema,
  terminateContractSchema,
  toggleListingSchema,
  updateListingSchema,
} from '../validators/rental.schema'

export function createRentalHandler(container: AppContainer) {
  const h = new Hono()

  /* ══════════════════════════════════════════
     Marketplace — Browsing (Public, no auth)
     ══════════════════════════════════════════ */

  /** Browse marketplace listings with search & filters */
  h.get('/marketplace/listings', zValidator('query', browseListingsSchema), async (c) => {
    const rentalService = container.resolve('rentalService')
    const query = c.req.valid('query')
    const result = await rentalService.browseListings(query)
    return c.json(result)
  })

  /** Get listing detail (increments view count) */
  h.get('/marketplace/listings/:listingId', async (c) => {
    const rentalService = container.resolve('rentalService')
    const listing = await rentalService.getListingDetail(c.req.param('listingId'))
    return c.json(listing)
  })

  /** Estimate cost for a listing */
  h.get('/marketplace/listings/:listingId/estimate', async (c) => {
    const rentalService = container.resolve('rentalService')
    const hours = Number(c.req.query('hours') || '1')
    if (hours < 1 || hours > 8760) {
      throw Object.assign(new Error('Invalid hours'), { status: 400 })
    }
    const estimate = await rentalService.estimateCost(c.req.param('listingId'), hours)
    return c.json(estimate)
  })

  /* ══════════════════════════════════════════
     Authenticated routes — all below require auth
     ══════════════════════════════════════════ */
  h.use('*', authMiddleware)

  /* ══════════════════════════════════════════
     Listings — Owner Management
     ══════════════════════════════════════════ */

  /** Get my listings (as owner) — excludes rented-out and delisted listings */
  h.get('/marketplace/my-listings', async (c) => {
    const user = c.get('user')
    const rentalService = container.resolve('rentalService')
    const agentDao = container.resolve('agentDao')
    const clawListingDao = container.resolve('clawListingDao')
    const limit = Number(c.req.query('limit') || '50')
    const offset = Number(c.req.query('offset') || '0')
    const listings = await rentalService.getMyListings(user.userId, { limit, offset })

    // Filter out listings that are actively rented or not listed
    const rentedIds = new Set(await clawListingDao.getActivelyRentedListingIds())
    const activeListings = listings.filter(
      (l) => !rentedIds.has(l.id) && l.isListed && l.listingStatus === 'active',
    )

    // Enrich listings with agent online status
    const enriched = await Promise.all(
      activeListings.map(async (l) => {
        if (!l.agentId) return { ...l, agent: null }
        const agent = await agentDao.findById(l.agentId)
        if (!agent) return { ...l, agent: null }
        return {
          ...l,
          agent: {
            status: agent.status,
            lastHeartbeat: agent.lastHeartbeat,
            totalOnlineSeconds: agent.totalOnlineSeconds,
          },
        }
      }),
    )

    return c.json({ listings: enriched })
  })

  /** Create a new listing */
  h.post('/marketplace/listings', zValidator('json', createListingSchema), async (c) => {
    const user = c.get('user')
    const rentalService = container.resolve('rentalService')
    const listing = await rentalService.createListing(user.userId, c.req.valid('json'))
    return c.json(listing, 201)
  })

  /** Update a listing */
  h.put('/marketplace/listings/:listingId', zValidator('json', updateListingSchema), async (c) => {
    const user = c.get('user')
    const rentalService = container.resolve('rentalService')
    const listing = await rentalService.updateListing(
      c.req.param('listingId'),
      user.userId,
      c.req.valid('json'),
    )
    return c.json(listing)
  })

  /** Toggle listing on/off marketplace */
  h.put(
    '/marketplace/listings/:listingId/toggle',
    zValidator('json', toggleListingSchema),
    async (c) => {
      const user = c.get('user')
      const rentalService = container.resolve('rentalService')
      const listing = await rentalService.toggleListing(
        c.req.param('listingId'),
        user.userId,
        c.req.valid('json').isListed,
      )
      return c.json(listing)
    },
  )

  /** Delete a listing */
  h.delete('/marketplace/listings/:listingId', async (c) => {
    const user = c.get('user')
    const rentalService = container.resolve('rentalService')
    await rentalService.deleteListing(c.req.param('listingId'), user.userId)
    return c.json({ ok: true })
  })

  /* ══════════════════════════════════════════
     Contracts — Signing & Management
     ══════════════════════════════════════════ */

  /** Sign a rental contract (tenant rents a claw) */
  h.post('/marketplace/contracts', zValidator('json', signContractSchema), async (c) => {
    const user = c.get('user')
    const rentalService = container.resolve('rentalService')
    const contract = await rentalService.signContract(user.userId, c.req.valid('json'))
    return c.json(contract, 201)
  })

  /** Get my contracts (both as owner and tenant), enriched with listing info */
  h.get('/marketplace/contracts', async (c) => {
    const user = c.get('user')
    const rentalService = container.resolve('rentalService')
    const clawListingDao = container.resolve('clawListingDao')
    const agentDao = container.resolve('agentDao')
    const role = c.req.query('role') as 'tenant' | 'owner' | undefined
    const status = c.req.query('status')
    const limit = Number(c.req.query('limit') || '50')
    const offset = Number(c.req.query('offset') || '0')
    const contracts = await rentalService.getMyContracts(user.userId, {
      role,
      status,
      limit,
      offset,
    })
    // Enrich each contract with listing summary and agent bot user ID
    const enriched = await Promise.all(
      contracts.map(async (contract) => {
        const listing = await clawListingDao.findById(contract.listingId)
        let agentUserId: string | null = null
        if (listing?.agentId) {
          const agent = await agentDao.findById(listing.agentId)
          if (agent) agentUserId = agent.userId
        }
        return {
          ...contract,
          listing: listing
            ? { title: listing.title, deviceTier: listing.deviceTier, osType: listing.osType }
            : null,
          agentUserId,
        }
      }),
    )
    return c.json({ contracts: enriched })
  })

  /** Get contract detail */
  h.get('/marketplace/contracts/:contractId', async (c) => {
    const user = c.get('user')
    const rentalService = container.resolve('rentalService')
    const clawListingDao = container.resolve('clawListingDao')
    const agentDao = container.resolve('agentDao')
    const detail = await rentalService.getContractDetail(c.req.param('contractId'))
    // Ensure the user is a party to the contract
    if (detail.tenantId !== user.userId && detail.ownerId !== user.userId) {
      throw Object.assign(new Error('Not a party to this contract'), { status: 403 })
    }
    // Enrich with listing summary and agent bot user ID
    const listing = await clawListingDao.findById(detail.listingId)
    let agentUserId: string | null = null
    if (listing?.agentId) {
      const agent = await agentDao.findById(listing.agentId)
      if (agent) agentUserId = agent.userId
    }
    return c.json({
      ...detail,
      listing: listing
        ? { title: listing.title, deviceTier: listing.deviceTier, osType: listing.osType }
        : null,
      agentUserId,
    })
  })

  /** Terminate a contract */
  h.post(
    '/marketplace/contracts/:contractId/terminate',
    zValidator('json', terminateContractSchema),
    async (c) => {
      const user = c.get('user')
      const rentalService = container.resolve('rentalService')
      const input = c.req.valid('json')
      const contract = await rentalService.terminateContract(
        c.req.param('contractId'),
        user.userId,
        input.reason,
      )
      return c.json(contract)
    },
  )

  /* ══════════════════════════════════════════
     Usage & Billing
     ══════════════════════════════════════════ */

  /** Check if chat is disabled for an agent bot user (listed or rented-out).
   *  Also returns rental info when the requesting user is the active tenant. */
  h.get('/marketplace/agent-chat-status/:agentUserId', async (c) => {
    const agentDao = container.resolve('agentDao')
    const clawListingDao = container.resolve('clawListingDao')
    const rentalContractDao = container.resolve('rentalContractDao')
    const user = c.get('user')
    const agentUserId = c.req.param('agentUserId')

    // Find agent by userId
    const agent = await agentDao.findByUserId(agentUserId)
    if (!agent) {
      return c.json({ chatDisabled: false })
    }

    // Check if agent has any active listing
    const listings = await clawListingDao.findByOwnerId(agent.ownerId)
    const agentListing = listings.find((l) => l.agentId === agent.id)
    if (!agentListing) {
      return c.json({ chatDisabled: false })
    }

    const isListed = agentListing.isListed && agentListing.listingStatus === 'active'
    const activeContract = await rentalContractDao.findActiveByListingId(agentListing.id)
    const isRentedOut = !!activeContract

    // If the requesting user is the active tenant, chat is ENABLED + return rental info
    if (activeContract && activeContract.tenantId === user.userId) {
      return c.json({
        chatDisabled: false,
        rental: {
          contractId: activeContract.id,
          baseDailyRate: activeContract.baseDailyRate ?? 0,
          messageFee: activeContract.messageFee ?? 0,
          totalCost: activeContract.totalCost ?? 0,
          messageCount: activeContract.messageCount ?? 0,
          pricingVersion: activeContract.pricingVersion ?? 1,
        },
      })
    }

    // Chat is disabled if the claw is currently listed or rented out
    const chatDisabled = isListed || isRentedOut
    const reason = isRentedOut ? 'rented_out' : isListed ? 'listed' : undefined

    return c.json({ chatDisabled, reason })
  })

  /** Record a usage session (typically called by the system/agent) */
  h.post(
    '/marketplace/contracts/:contractId/usage',
    zValidator('json', recordUsageSchema),
    async (c) => {
      const rentalService = container.resolve('rentalService')
      const usage = await rentalService.recordUsage(c.req.param('contractId'), c.req.valid('json'))
      return c.json(usage, 201)
    },
  )

  /* ══════════════════════════════════════════
     Violations
     ══════════════════════════════════════════ */

  /** Report a contract violation */
  h.post(
    '/marketplace/contracts/:contractId/violate',
    zValidator('json', reportViolationSchema),
    async (c) => {
      const user = c.get('user')
      const rentalService = container.resolve('rentalService')
      const violation = await rentalService.reportViolation(
        c.req.param('contractId'),
        user.userId,
        c.req.valid('json'),
      )
      return c.json(violation, 201)
    },
  )

  return h
}
