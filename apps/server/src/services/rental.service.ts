import { nanoid } from 'nanoid'
import type { AgentDao } from '../dao/agent.dao'
import type { ClawListingDao } from '../dao/claw-listing.dao'
import type {
  RentalContractDao,
  RentalUsageDao,
  RentalViolationDao,
} from '../dao/rental-contract.dao'
import type { WalletService } from './wallet.service'

/* ──────────────── Pricing Constants ──────────────── */

/** Platform electricity rate: 虾币 per hour */
const PLATFORM_ELECTRICITY_RATE = 2

/** Token unit price: 虾币 per 1000 tokens */
const TOKEN_UNIT_PRICE = 1

/** Default platform fee rate in basis points (500 = 5%) */
const DEFAULT_PLATFORM_FEE_BPS = 500

/** Platform terms template */
const PLATFORM_TERMS = `虾豆平台 OpenClaw 租赁服务条款

1. 平台收取 5% 的服务手续费。
2. 出租方在租赁期间不得自行使用已出租的 OpenClaw，违者需支付合同约定的违约金。
3. 使用方应遵守出租方设定的使用准则，不得滥用或用于非法用途。
4. Token 消耗费用和电费由使用方承担。
5. 任一方可提前终止租约，已产生的费用不予退还。
6. 发生争议时，平台有权介入调解。
7. 平台保留对违规行为进行处罚的权利。`

/* ──────────────── Rental Contract State Machine ──────────────── */

const CONTRACT_STATE_TRANSITIONS: Record<string, string[]> = {
  pending: ['active', 'cancelled'],
  active: ['completed', 'violated', 'disputed'],
  completed: [],
  cancelled: [],
  violated: ['completed'],
  disputed: ['completed', 'violated'],
}

/**
 * RentalService — orchestrates the P2P OpenClaw rental lifecycle.
 * Handles listings, contract signing, usage tracking, pricing, and violations.
 */
export class RentalService {
  constructor(
    private deps: {
      clawListingDao: ClawListingDao
      rentalContractDao: RentalContractDao
      rentalUsageDao: RentalUsageDao
      rentalViolationDao: RentalViolationDao
      walletService: WalletService
      agentDao: AgentDao
    },
  ) {}

  /* ═══════════════ Listings ═══════════════ */

  async createListing(
    ownerId: string,
    data: {
      agentId?: string
      title: string
      description?: string
      skills?: string[]
      guidelines?: string
      deviceTier?: 'high_end' | 'mid_range' | 'low_end'
      osType?: 'macos' | 'windows' | 'linux'
      deviceInfo?: Record<string, string>
      softwareTools?: string[]
      hourlyRate: number
      dailyRate?: number
      monthlyRate?: number
      tokenFeePassthrough?: boolean
      premiumMarkup?: number
      depositAmount?: number
      listingStatus?: 'draft' | 'active'
      availableFrom?: string
      availableUntil?: string | null
      tags?: string[]
    },
  ) {
    return this.deps.clawListingDao.create({
      ownerId,
      ...data,
      availableFrom: data.availableFrom ? new Date(data.availableFrom) : undefined,
      availableUntil: data.availableUntil ? new Date(data.availableUntil) : null,
    })
  }

  async updateListing(id: string, ownerId: string, data: Record<string, unknown>) {
    const listing = await this.deps.clawListingDao.findById(id)
    if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 })
    if (listing.ownerId !== ownerId) {
      throw Object.assign(new Error('Not your listing'), { status: 403 })
    }

    // Check if listing has active contract — restrict changes
    const activeContract = await this.deps.rentalContractDao.findActiveByListingId(id)
    if (activeContract) {
      // Only allow status/isListed changes when actively rented
      const allowedKeys = ['listingStatus', 'isListed', 'description', 'guidelines']
      const keys = Object.keys(data)
      const hasDisallowed = keys.some((k) => !allowedKeys.includes(k))
      if (hasDisallowed) {
        throw Object.assign(
          new Error('Cannot modify pricing or device info while listing is actively rented'),
          { status: 400 },
        )
      }
    }

    const updateData: Record<string, unknown> = { ...data }
    if (data.availableFrom) updateData.availableFrom = new Date(data.availableFrom as string)
    if (data.availableUntil !== undefined) {
      updateData.availableUntil = data.availableUntil
        ? new Date(data.availableUntil as string)
        : null
    }

    return this.deps.clawListingDao.update(
      id,
      updateData as Parameters<typeof this.deps.clawListingDao.update>[1],
    )
  }

  async toggleListing(id: string, ownerId: string, isListed: boolean) {
    const listing = await this.deps.clawListingDao.findById(id)
    if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 })
    if (listing.ownerId !== ownerId) {
      throw Object.assign(new Error('Not your listing'), { status: 403 })
    }
    return this.deps.clawListingDao.update(id, { isListed })
  }

  async getListingDetail(id: string) {
    const listing = await this.deps.clawListingDao.findById(id)
    if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 })
    // Increment view count
    await this.deps.clawListingDao.incrementViewCount(id)
    return listing
  }

  async getMyListings(ownerId: string, opts?: { limit?: number; offset?: number }) {
    return this.deps.clawListingDao.findByOwnerId(ownerId, opts)
  }

  async browseListings(opts?: {
    keyword?: string
    deviceTier?: string
    osType?: string
    sortBy?: 'popular' | 'newest' | 'price-asc' | 'price-desc'
    limit?: number
    offset?: number
  }) {
    const [listings, total] = await Promise.all([
      this.deps.clawListingDao.browse(opts),
      this.deps.clawListingDao.countBrowse(opts),
    ])
    return { listings, total }
  }

  async deleteListing(id: string, ownerId: string) {
    const listing = await this.deps.clawListingDao.findById(id)
    if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 })
    if (listing.ownerId !== ownerId) {
      throw Object.assign(new Error('Not your listing'), { status: 403 })
    }
    const activeContract = await this.deps.rentalContractDao.findActiveByListingId(id)
    if (activeContract) {
      throw Object.assign(new Error('Cannot delete listing with active rental'), { status: 400 })
    }
    await this.deps.clawListingDao.delete(id)
  }

  /* ═══════════════ Contract Signing ═══════════════ */

  /**
   * Sign a rental contract.
   * 1. Validates listing is available
   * 2. Creates contract with frozen terms
   * 3. Deducts deposit from tenant wallet
   * 4. Activates the contract
   */
  async signContract(
    tenantId: string,
    data: {
      listingId: string
      durationHours?: number | null
      agreedToTerms: boolean
    },
  ) {
    const listing = await this.deps.clawListingDao.findById(data.listingId)
    if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 })

    // Cannot rent own listing
    if (listing.ownerId === tenantId) {
      throw Object.assign(new Error('Cannot rent your own listing'), { status: 400 })
    }

    // Check listing is available
    if (listing.listingStatus !== 'active' || !listing.isListed) {
      throw Object.assign(new Error('Listing is not available'), { status: 400 })
    }

    // Check no active contract already
    const existing = await this.deps.rentalContractDao.findActiveByListingId(data.listingId)
    if (existing) {
      throw Object.assign(new Error('Listing is currently rented'), { status: 409 })
    }

    // Check time window
    const now = new Date()
    if (listing.availableFrom && new Date(listing.availableFrom) > now) {
      throw Object.assign(new Error('Listing is not yet available'), { status: 400 })
    }
    if (listing.availableUntil && new Date(listing.availableUntil) < now) {
      throw Object.assign(new Error('Listing availability has expired'), { status: 400 })
    }

    // Calculate dates
    const startsAt = now
    const expiresAt = data.durationHours
      ? new Date(now.getTime() + data.durationHours * 3600 * 1000)
      : null

    // Generate contract number
    const contractNo = `RC${Date.now().toString(36).toUpperCase()}${nanoid(6).toUpperCase()}`

    // Freeze listing snapshot
    const listingSnapshot = { ...listing }

    // Create the contract
    const contract = await this.deps.rentalContractDao.create({
      contractNo,
      listingId: listing.id,
      tenantId,
      ownerId: listing.ownerId,
      listingSnapshot: listingSnapshot as unknown as Record<string, unknown>,
      hourlyRate: listing.hourlyRate,
      dailyRate: listing.dailyRate,
      monthlyRate: listing.monthlyRate,
      platformFeeRate: DEFAULT_PLATFORM_FEE_BPS,
      depositAmount: listing.depositAmount,
      ownerTerms: listing.guidelines ?? '',
      platformTerms: PLATFORM_TERMS,
      tenantAgreedAt: now,
      startsAt,
      expiresAt,
    })

    if (!contract) throw new Error('Failed to create contract')

    // Deduct deposit from tenant if configured
    if (listing.depositAmount > 0) {
      await this.deps.walletService.debit(
        tenantId,
        listing.depositAmount,
        contract.id,
        'rental_deposit',
        `租赁押金 - 合同 ${contractNo}`,
      )
    }

    // Initialize lastBilledOnlineSeconds with agent's current totalOnlineSeconds
    let initialOnlineSeconds = 0
    if (listing.agentId) {
      const agent = await this.deps.agentDao.findById(listing.agentId)
      if (agent) initialOnlineSeconds = agent.totalOnlineSeconds ?? 0
    }

    // Activate the contract
    await this.deps.rentalContractDao.update(contract.id, {
      status: 'active',
      lastBilledOnlineSeconds: initialOnlineSeconds,
    })

    // Increment rental count
    await this.deps.clawListingDao.incrementRentalCount(listing.id)

    return this.deps.rentalContractDao.findById(contract.id)
  }

  /* ═══════════════ Contract Management ═══════════════ */

  async getContractDetail(contractId: string) {
    const contract = await this.deps.rentalContractDao.findById(contractId)
    if (!contract) throw Object.assign(new Error('Contract not found'), { status: 404 })
    const usageRecords = await this.deps.rentalUsageDao.findByContractId(contractId)
    const violations = await this.deps.rentalViolationDao.findByContractId(contractId)
    return { ...contract, usageRecords, violations }
  }

  async getMyContracts(
    userId: string,
    opts?: { role?: 'tenant' | 'owner'; status?: string; limit?: number; offset?: number },
  ) {
    if (opts?.role === 'tenant') {
      return this.deps.rentalContractDao.findByTenantId(userId, opts)
    }
    if (opts?.role === 'owner') {
      return this.deps.rentalContractDao.findByOwnerId(userId, opts)
    }
    return this.deps.rentalContractDao.findByUserId(userId, opts)
  }

  async terminateContract(contractId: string, userId: string, reason?: string) {
    const contract = await this.deps.rentalContractDao.findById(contractId)
    if (!contract) throw Object.assign(new Error('Contract not found'), { status: 404 })
    if (contract.tenantId !== userId && contract.ownerId !== userId) {
      throw Object.assign(new Error('Not a party to this contract'), { status: 403 })
    }

    const allowed = CONTRACT_STATE_TRANSITIONS[contract.status] || []
    if (!allowed.includes('completed')) {
      throw Object.assign(new Error(`Cannot terminate contract in ${contract.status} status`), {
        status: 400,
      })
    }

    // Refund unused deposit to tenant
    if (contract.depositAmount > 0) {
      await this.deps.walletService.refund(
        contract.tenantId,
        contract.depositAmount,
        contract.id,
        'rental_deposit',
        `退还租赁押金 - 合同 ${contract.contractNo}`,
      )
    }

    return this.deps.rentalContractDao.update(contractId, {
      status: 'completed',
      terminatedAt: new Date(),
      terminationReason: reason || '合同提前终止',
    })
  }

  /* ═══════════════ Usage & Billing ═══════════════ */

  /**
   * Record a usage session and bill the tenant.
   * Calculates: rental cost + token cost + electricity + platform fee.
   */
  async recordUsage(
    contractId: string,
    data: {
      startedAt: string
      endedAt?: string
      durationMinutes: number
      tokensConsumed?: number
    },
  ) {
    const contract = await this.deps.rentalContractDao.findById(contractId)
    if (!contract) throw Object.assign(new Error('Contract not found'), { status: 404 })
    if (contract.status !== 'active') {
      throw Object.assign(new Error('Contract is not active'), { status: 400 })
    }

    const durationHours = data.durationMinutes / 60

    // Calculate cost breakdown
    const rentalCost = Math.ceil(contract.hourlyRate * durationHours)
    const tokenCost = Math.ceil(((data.tokensConsumed ?? 0) / 1000) * TOKEN_UNIT_PRICE)
    const electricityCost = Math.ceil(durationHours * PLATFORM_ELECTRICITY_RATE)
    const subtotal = rentalCost + tokenCost + electricityCost
    const platformFee = Math.ceil((subtotal * contract.platformFeeRate) / 10000)
    const totalCost = subtotal + platformFee

    // Create usage record
    const usage = await this.deps.rentalUsageDao.create({
      contractId,
      startedAt: new Date(data.startedAt),
      endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
      durationMinutes: data.durationMinutes,
      tokensConsumed: data.tokensConsumed ?? 0,
      tokenCost,
      electricityCost,
      rentalCost,
      platformFee,
      totalCost,
    })

    // Debit tenant wallet
    await this.deps.walletService.debit(
      contract.tenantId,
      totalCost,
      contractId,
      'rental_usage',
      `OpenClaw 使用费 - 合同 ${contract.contractNo}`,
    )

    // Credit owner (minus platform fee)
    const ownerPayout = totalCost - platformFee
    await this.deps.walletService.settle(
      contract.ownerId,
      ownerPayout,
      usage.id,
      'rental_usage',
      `OpenClaw 出租收入 - 合同 ${contract.contractNo}`,
    )

    // Update running total
    await this.deps.rentalContractDao.addCost(contractId, totalCost)

    return usage
  }

  /* ═══════════════ Violations ═══════════════ */

  async reportViolation(
    contractId: string,
    reporterId: string,
    data: {
      violationType: string
      description?: string
    },
  ) {
    const contract = await this.deps.rentalContractDao.findById(contractId)
    if (!contract) throw Object.assign(new Error('Contract not found'), { status: 404 })
    if (contract.tenantId !== reporterId && contract.ownerId !== reporterId) {
      throw Object.assign(new Error('Not a party to this contract'), { status: 403 })
    }

    // Determine violator (the other party)
    const violatorId = reporterId === contract.tenantId ? contract.ownerId : contract.tenantId

    const violation = await this.deps.rentalViolationDao.create({
      contractId,
      violatorId,
      violationType: data.violationType,
      description: data.description,
      penaltyAmount: contract.depositAmount,
    })

    // If owner self-use violation, charge penalty from deposit
    if (data.violationType === 'owner_self_use' && contract.depositAmount > 0) {
      try {
        await this.deps.walletService.debit(
          contract.ownerId,
          contract.depositAmount,
          contract.id,
          'rental_penalty',
          `违约金 - 合同 ${contract.contractNo}`,
        )
        // Pay penalty to tenant
        await this.deps.walletService.topUp(
          contract.tenantId,
          contract.depositAmount,
          `违约赔偿 - 合同 ${contract.contractNo}`,
        )
        await this.deps.rentalViolationDao.resolve(violation!.id)
      } catch (_) {
        // Log but don't block — penalty enforcement may be manual
      }
    }

    // Mark contract as violated
    await this.deps.rentalContractDao.update(contractId, { status: 'violated' })

    return violation
  }

  /* ═══════════════ Pricing Calculator ═══════════════ */

  /**
   * Estimates rental cost for a given duration (for frontend display).
   */
  async estimateCost(listingId: string, durationHours: number) {
    const listing = await this.deps.clawListingDao.findById(listingId)
    if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 })

    const rentalCost = Math.ceil(listing.hourlyRate * durationHours)
    const electricityCost = Math.ceil(durationHours * PLATFORM_ELECTRICITY_RATE)
    const subtotal = rentalCost + electricityCost
    const platformFee = Math.ceil((subtotal * DEFAULT_PLATFORM_FEE_BPS) / 10000)
    const totalCost = subtotal + platformFee

    return {
      rentalCost,
      electricityCost,
      platformFee,
      deposit: listing.depositAmount,
      totalPerHour: Math.ceil(totalCost / durationHours),
      totalEstimate: totalCost,
      note: listing.tokenFeePassthrough
        ? 'Token 消耗费用按实际使用量额外计费'
        : 'Token 费用已包含在租赁费用中',
    }
  }

  /* ═══════════════ Scheduled Billing ═══════════════ */

  /**
   * Auto-terminate expired active contracts. Called periodically by scheduler.
   * Refunds deposit and marks as completed.
   */
  async terminateExpiredContracts() {
    const expired = await this.deps.rentalContractDao.findExpiredActive()
    const results: Array<{ contractId: string; success: boolean; error?: string }> = []

    for (const contract of expired) {
      try {
        // Refund unused deposit to tenant
        if (contract.depositAmount > 0) {
          await this.deps.walletService.refund(
            contract.tenantId,
            contract.depositAmount,
            contract.id,
            'rental_deposit',
            `退还租赁押金（合同到期）- 合同 ${contract.contractNo}`,
          )
        }

        await this.deps.rentalContractDao.update(contract.id, {
          status: 'completed',
          terminatedAt: new Date(),
          terminationReason: '合同到期自动终止',
        })

        results.push({ contractId: contract.id, success: true })
      } catch (err) {
        results.push({
          contractId: contract.id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return results
  }

  /**
   * Auto-bill active contracts based on agent online time.
   * Compares agent's totalOnlineSeconds with contract's lastBilledOnlineSeconds
   * to compute incremental billable seconds and charges the tenant.
   */
  async billActiveContracts() {
    const contracts = await this.deps.rentalContractDao.findAllActive()
    const results: Array<{ contractId: string; billed: number; success: boolean; error?: string }> =
      []

    for (const contract of contracts) {
      try {
        // Get the listing to find the agentId
        const listing = await this.deps.clawListingDao.findById(contract.listingId)
        if (!listing?.agentId) {
          results.push({ contractId: contract.id, billed: 0, success: true })
          continue
        }

        // Get agent to check online time
        const agent = await this.deps.agentDao.findById(listing.agentId)
        if (!agent) {
          results.push({ contractId: contract.id, billed: 0, success: true })
          continue
        }

        const currentOnlineSeconds = agent.totalOnlineSeconds ?? 0
        const lastBilled = contract.lastBilledOnlineSeconds ?? 0
        const billableSeconds = currentOnlineSeconds - lastBilled

        // Only bill if at least 60 seconds of new online time
        if (billableSeconds < 60) {
          results.push({ contractId: contract.id, billed: 0, success: true })
          continue
        }

        const billableMinutes = Math.floor(billableSeconds / 60)
        const durationHours = billableMinutes / 60

        // Calculate cost (same formula as recordUsage, without token cost)
        const rentalCost = Math.ceil(contract.hourlyRate * durationHours)
        const electricityCost = Math.ceil(durationHours * PLATFORM_ELECTRICITY_RATE)
        const subtotal = rentalCost + electricityCost
        const platformFee = Math.ceil((subtotal * contract.platformFeeRate) / 10000)
        const totalCost = subtotal + platformFee

        if (totalCost <= 0) {
          results.push({ contractId: contract.id, billed: 0, success: true })
          continue
        }

        const now = new Date()

        // Create usage record
        const usage = await this.deps.rentalUsageDao.create({
          contractId: contract.id,
          startedAt: new Date(now.getTime() - billableMinutes * 60 * 1000),
          endedAt: now,
          durationMinutes: billableMinutes,
          tokensConsumed: 0,
          tokenCost: 0,
          electricityCost,
          rentalCost,
          platformFee,
          totalCost,
        })

        // Debit tenant
        await this.deps.walletService.debit(
          contract.tenantId,
          totalCost,
          contract.id,
          'rental_usage',
          `OpenClaw 使用费（自动结算）- 合同 ${contract.contractNo}`,
        )

        // Credit owner (minus platform fee)
        const ownerPayout = totalCost - platformFee
        if (ownerPayout > 0 && usage) {
          await this.deps.walletService.settle(
            contract.ownerId,
            ownerPayout,
            usage.id,
            'rental_usage',
            `OpenClaw 出租收入（自动结算）- 合同 ${contract.contractNo}`,
          )
        }

        // Update running total and last billed snapshot
        await this.deps.rentalContractDao.addCost(contract.id, totalCost)
        await this.deps.rentalContractDao.update(contract.id, {
          lastBilledOnlineSeconds: currentOnlineSeconds,
        })

        results.push({ contractId: contract.id, billed: totalCost, success: true })
      } catch (err) {
        results.push({
          contractId: contract.id,
          billed: 0,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return results
  }
}
