import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateJsonLimits } from '../src/lib/json-limits'
import { assertSafeHttpUrl } from '../src/lib/ssrf'
import { actorFromAuthenticatedUser } from '../src/security/actor'
import { CartService } from '../src/services/cart.service'
import { validateCloudTemplatePolicy } from '../src/services/cloud-template-policy.service'
import {
  DIY_CLOUD_MAX_ESTIMATED_TOKENS,
  estimateDiyCloudInputBudget,
} from '../src/services/diy-cloud.service'
import { EconomyPolicyService } from '../src/services/economy-policy.service'
import { PolicyService } from '../src/services/policy.service'
import { RentalService } from '../src/services/rental.service'
import { ReviewService } from '../src/services/review.service'

describe('validateJsonLimits', () => {
  const limits = {
    maxBytes: 80,
    maxDepth: 3,
    maxObjectKeys: 4,
    maxArrayItems: 3,
  }

  it('accepts JSON values inside all configured limits', () => {
    expect(validateJsonLimits({ a: 1, b: [2, 3] }, limits)).toMatchObject({
      ok: true,
      keys: 2,
    })
  })

  it('rejects oversized JSON payloads', () => {
    expect(validateJsonLimits({ value: 'x'.repeat(100) }, limits)).toEqual({
      ok: false,
      error: 'JSON payload exceeds 80 bytes',
    })
  })

  it('rejects deeply nested JSON payloads', () => {
    expect(validateJsonLimits({ a: { b: { c: true } } }, limits)).toEqual({
      ok: false,
      error: 'JSON depth exceeds 3',
    })
  })

  it('rejects objects and arrays that exceed structural limits', () => {
    expect(validateJsonLimits({ a: 1, b: 2, c: 3, d: 4, e: 5 }, limits)).toEqual({
      ok: false,
      error: 'JSON object exceeds 4 keys',
    })
    expect(validateJsonLimits([1, 2, 3, 4], limits)).toEqual({
      ok: false,
      error: 'JSON array exceeds 3 items',
    })
  })
})

describe('Cloud template policy', () => {
  const baseTemplate = {
    version: '1.0.0',
    use: [{ plugin: 'model-provider' }],
    deployments: {
      agents: [{ id: 'agent-1', runtime: 'openclaw' }],
    },
  }

  it('accepts official plugin references and rejects unsafe template controls', () => {
    expect(validateCloudTemplatePolicy(baseTemplate)).toMatchObject({
      ok: true,
      pluginIds: ['model-provider'],
    })
    expect(
      validateCloudTemplatePolicy({
        ...baseTemplate,
        use: [{ plugin: 'unknown-plugin' }],
      }),
    ).toMatchObject({ ok: false, error: 'Unknown or unsupported Cloud plugin: unknown-plugin' })
    expect(
      validateCloudTemplatePolicy({
        ...baseTemplate,
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              networking: { type: 'unrestricted' },
            },
          ],
        },
      }),
    ).toMatchObject({ ok: false, error: 'Unrestricted network policy is not permitted' })
    expect(
      validateCloudTemplatePolicy({
        ...baseTemplate,
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              securityContext: { privileged: true },
            },
          ],
        },
      }),
    ).toMatchObject({
      ok: false,
      error: 'Template-level securityContext overrides are not permitted',
    })
  })

  it('estimates DIY generation token budget before model calls', () => {
    const budget = estimateDiyCloudInputBudget({
      prompt: 'x'.repeat(64),
      feedback: 'y'.repeat(32),
      previousConfig: { value: 'z'.repeat(64) },
    })

    expect(budget.estimatedTokens).toBeGreaterThan(0)
    expect(DIY_CLOUD_MAX_ESTIMATED_TOKENS).toBeGreaterThan(budget.estimatedTokens)
  })
})

describe('assertSafeHttpUrl', () => {
  it('rejects non-http URLs and credentialed URLs', async () => {
    await expect(assertSafeHttpUrl('file:///etc/passwd')).rejects.toThrow(
      'URL must use http or https',
    )
    await expect(assertSafeHttpUrl('https://user:pass@example.com')).rejects.toThrow(
      'URL credentials are not allowed',
    )
  })

  it('rejects loopback, local, private, and documentation addresses', async () => {
    await expect(assertSafeHttpUrl('http://localhost:3000')).rejects.toThrow(
      'Local provider URLs are not allowed',
    )
    await expect(assertSafeHttpUrl('http://127.0.0.1:3000')).rejects.toThrow(
      'Private or local provider URLs are not allowed',
    )
    await expect(assertSafeHttpUrl('http://10.0.0.5')).rejects.toThrow(
      'Private or local provider URLs are not allowed',
    )
    await expect(assertSafeHttpUrl('http://203.0.113.10')).rejects.toThrow(
      'Private or local provider URLs are not allowed',
    )
  })

  it('accepts public literal http URLs', async () => {
    await expect(assertSafeHttpUrl('https://8.8.8.8/v1/models')).resolves.toMatchObject({
      protocol: 'https:',
      hostname: '8.8.8.8',
    })
  })
})

describe('typed JWTs', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('JWT_SECRET', 'test-secret-with-enough-entropy')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not allow refresh tokens to authenticate as access tokens', async () => {
    const { signRefreshToken, verifyToken } = await import('../src/lib/jwt')

    const token = signRefreshToken({ userId: 'user-1' })

    expect(() => verifyToken(token, 'access')).toThrow('Invalid token type')
    expect(verifyToken(token, 'refresh')).toMatchObject({
      userId: 'user-1',
      typ: 'refresh',
      aud: 'shadow:refresh',
      iss: 'shadow',
    })
  })

  it('rejects typed tokens with the wrong audience', async () => {
    const jwt = await import('jsonwebtoken')
    const { verifyToken } = await import('../src/lib/jwt')

    const token = jwt.default.sign(
      {
        userId: 'user-1',
        typ: 'access',
        aud: 'shadow:refresh',
        iss: 'shadow',
        jti: 'token-id',
      },
      'test-secret-with-enough-entropy',
    )

    expect(() => verifyToken(token, 'access')).toThrow('Invalid token audience')
  })
})

describe('Actor and PolicyService', () => {
  it('normalizes JWT, PAT, and agent users into explicit actor kinds', () => {
    expect(actorFromAuthenticatedUser({ userId: 'user-1', tokenKind: 'jwt' })).toMatchObject({
      kind: 'user',
      userId: 'user-1',
    })
    expect(
      actorFromAuthenticatedUser({
        userId: 'user-1',
        tokenKind: 'pat',
        tokenId: 'pat-1',
        scopes: ['user:read'],
      }),
    ).toMatchObject({
      kind: 'pat',
      userId: 'user-1',
      tokenId: 'pat-1',
      scopes: ['user:read'],
    })
    expect(
      actorFromAuthenticatedUser({
        userId: 'bot-1',
        typ: 'agent',
        tokenKind: 'jwt',
        agentId: 'agent-1',
        ownerId: 'owner-1',
      }),
    ).toMatchObject({
      kind: 'agent',
      userId: 'bot-1',
      agentId: 'agent-1',
      ownerId: 'owner-1',
    })
  })

  it('centralizes server role and private channel read authorization', async () => {
    const serverDao = {
      getMember: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
    }
    const channelDao = {
      findById: vi.fn(),
      findByServerId: vi.fn(),
    }
    const channelMemberDao = {
      get: vi.fn(),
      getUserChannelIds: vi.fn(),
    }
    const policy = new PolicyService({
      serverDao,
      channelDao,
      channelMemberDao,
    } as unknown as ConstructorParameters<typeof PolicyService>[0])

    serverDao.getMember.mockResolvedValueOnce({ userId: 'user-1', role: 'member' })
    await expect(policy.requireServerRole('user-1', 'server-1', 'admin')).rejects.toThrow(
      'Requires admin role or higher',
    )

    channelDao.findById.mockResolvedValue({
      id: 'channel-1',
      serverId: 'server-1',
      isPrivate: true,
    })
    serverDao.getMember.mockResolvedValueOnce({ userId: 'user-1', role: 'member' })
    channelMemberDao.get.mockResolvedValueOnce(null)
    await expect(policy.requireChannelRead('user-1', 'channel-1')).rejects.toThrow(
      'Not a member of this channel',
    )

    serverDao.getMember.mockResolvedValueOnce({ userId: 'user-1', role: 'member' })
    channelMemberDao.get.mockResolvedValueOnce({ channelId: 'channel-1', userId: 'user-1' })
    await expect(policy.requireChannelRead('user-1', 'channel-1')).resolves.toMatchObject({
      channel: { id: 'channel-1' },
    })
  })
})

describe('EconomyPolicyService', () => {
  function createPolicy(user: { economyStatus: string; isAdmin: boolean }) {
    return new EconomyPolicyService({
      db: {
        select: () => ({
          from() {
            return this
          },
          where() {
            return this
          },
          limit() {
            return Promise.resolve([user])
          },
        }),
      } as any,
    })
  }

  it('requires explicit economy scopes for PAT write operations', async () => {
    const policy = createPolicy({ economyStatus: 'normal', isAdmin: false })

    await expect(
      policy.authorize({
        actor: { kind: 'pat', userId: 'user-1', tokenId: 'pat-1', scopes: ['user:write'] },
        action: 'order.purchase',
        resource: { kind: 'order' },
        dataClass: 'financial',
      }),
    ).rejects.toMatchObject({ code: 'ECONOMY_SCOPE_REQUIRED' })

    await expect(
      policy.authorize({
        actor: {
          kind: 'pat',
          userId: 'user-1',
          tokenId: 'pat-1',
          scopes: ['economy:orders:write'],
        },
        action: 'order.purchase',
        resource: { kind: 'order' },
        dataClass: 'financial',
      }),
    ).resolves.toMatchObject({ ok: true })
  })

  it('requires explicit economy scopes for agent write operations', async () => {
    const policy = createPolicy({ economyStatus: 'normal', isAdmin: false })

    await expect(
      policy.authorize({
        actor: { kind: 'agent', userId: 'user-1', agentId: 'agent-1', scopes: [] },
        action: 'offer.purchase',
        resource: { kind: 'offer', id: 'offer-1' },
        dataClass: 'financial',
      }),
    ).rejects.toMatchObject({ code: 'ECONOMY_SCOPE_REQUIRED' })
  })

  it('blocks wallet outflows for economy restricted users', async () => {
    const policy = createPolicy({ economyStatus: 'economy_restricted', isAdmin: false })

    await expect(
      policy.authorize({
        actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
        action: 'offer.purchase',
        resource: { kind: 'offer', id: 'offer-1' },
        dataClass: 'financial',
      }),
    ).rejects.toMatchObject({ code: 'ECONOMY_USER_RESTRICTED' })
  })
})

describe('CartService security validation', () => {
  const cartDao = { upsert: vi.fn() }
  const productDao = { findById: vi.fn() }
  const productMediaDao = { findByProductId: vi.fn() }
  const skuDao = { findById: vi.fn() }
  let service: CartService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new CartService({
      cartDao,
      productDao,
      productMediaDao,
      skuDao,
    } as unknown as ConstructorParameters<typeof CartService>[0])
  })

  it('rejects adding a product from another shop', async () => {
    productDao.findById.mockResolvedValue({
      id: 'product-1',
      shopId: 'shop-b',
      status: 'active',
    })

    await expect(service.addToCart('user-1', 'shop-a', 'product-1')).rejects.toThrow(
      'Product does not belong to this shop',
    )
    expect(cartDao.upsert).not.toHaveBeenCalled()
  })

  it('rejects adding a SKU from another product', async () => {
    productDao.findById.mockResolvedValue({
      id: 'product-1',
      shopId: 'shop-a',
      status: 'active',
    })
    skuDao.findById.mockResolvedValue({
      id: 'sku-1',
      productId: 'product-2',
      isActive: true,
    })

    await expect(service.addToCart('user-1', 'shop-a', 'product-1', 'sku-1')).rejects.toThrow(
      'SKU does not belong to this product',
    )
    expect(cartDao.upsert).not.toHaveBeenCalled()
  })
})

describe('ReviewService security validation', () => {
  const reviewDao = {
    create: vi.fn(),
    findByUserAndOrder: vi.fn(),
    getAverageRating: vi.fn(),
  }
  const orderDao = {
    findById: vi.fn(),
    getItems: vi.fn(),
  }
  const productService = {
    updateRatingStats: vi.fn(),
  }
  let service: ReviewService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ReviewService({
      reviewDao,
      orderDao,
      productService,
    } as unknown as ConstructorParameters<typeof ReviewService>[0])
    orderDao.findById.mockResolvedValue({
      id: 'order-1',
      buyerId: 'user-1',
      status: 'completed',
    })
    reviewDao.findByUserAndOrder.mockResolvedValue(null)
  })

  it('rejects reviews for products that were not purchased in the order', async () => {
    orderDao.getItems.mockResolvedValue([{ productId: 'product-other' }])

    await expect(service.createReview('user-1', 'order-1', 'product-target', 5)).rejects.toThrow(
      'Product was not purchased in this order',
    )
    expect(reviewDao.create).not.toHaveBeenCalled()
  })

  it('allows reviews only for purchased products', async () => {
    orderDao.getItems.mockResolvedValue([{ productId: 'product-target' }])
    reviewDao.create.mockResolvedValue({ id: 'review-1' })
    reviewDao.getAverageRating.mockResolvedValue({ avgRating: 5, ratingCount: 1 })

    await expect(service.createReview('user-1', 'order-1', 'product-target', 5)).resolves.toEqual({
      id: 'review-1',
    })
    expect(productService.updateRatingStats).toHaveBeenCalledWith('product-target', 5, 1)
  })
})

describe('RentalService security validation', () => {
  const agentListingDao = {
    create: vi.fn(),
    findById: vi.fn(),
  }
  const rentalContractDao = {
    findById: vi.fn(),
  }
  const rentalUsageDao = {
    create: vi.fn(),
    findByUsageEventId: vi.fn(),
  }
  const rentalViolationDao = {}
  const ledgerService = {
    debit: vi.fn(),
    credit: vi.fn(),
  }
  const agentDao = {
    findById: vi.fn(),
    findByUserId: vi.fn(),
  }
  const userDao = {}
  let service: RentalService

  beforeEach(() => {
    vi.clearAllMocks()
    rentalUsageDao.findByUsageEventId.mockResolvedValue(null)
    rentalUsageDao.create.mockResolvedValue({ id: 'usage-1' })
    ledgerService.debit.mockResolvedValue(undefined)
    ledgerService.credit.mockResolvedValue(undefined)
    service = new RentalService({
      agentListingDao,
      rentalContractDao,
      rentalUsageDao,
      rentalViolationDao,
      ledgerService,
      agentDao,
      userDao,
    } as unknown as ConstructorParameters<typeof RentalService>[0])
  })

  it('rejects listings bound to an agent owned by another user', async () => {
    agentDao.findById.mockResolvedValue({ id: 'agent-1', ownerId: 'owner-other' })

    await expect(
      service.createListing('owner-1', {
        agentId: 'agent-1',
        title: 'Listing',
      }),
    ).rejects.toThrow('Agent does not belong to listing owner')
    expect(agentListingDao.create).not.toHaveBeenCalled()
  })

  it('rejects marketplace listings for private Buddy agents', async () => {
    agentDao.findById.mockResolvedValue({
      id: 'agent-1',
      ownerId: 'owner-1',
      config: { buddyMode: 'private' },
    })

    await expect(
      service.createListing('owner-1', {
        agentId: 'agent-1',
        title: 'Private Buddy listing',
      }),
    ).rejects.toThrow('Private Buddy cannot be listed or rented')
    expect(agentListingDao.create).not.toHaveBeenCalled()
  })

  it('requires a bound agent actor before recording rental usage', async () => {
    rentalContractDao.findById.mockResolvedValue({
      id: 'contract-1',
      status: 'active',
      listingId: 'listing-1',
      hourlyRate: 10,
      platformFeeRate: 500,
      tenantId: 'tenant-1',
    })

    await expect(
      service.recordUsage('contract-1', {
        startedAt: '2026-05-05T00:00:00.000Z',
        durationMinutes: 60,
      }),
    ).rejects.toThrow('Usage recording requires an agent actor')
    expect(rentalUsageDao.create).not.toHaveBeenCalled()
  })

  it('rejects usage recorded by a different agent', async () => {
    rentalContractDao.findById.mockResolvedValue({
      id: 'contract-1',
      status: 'active',
      listingId: 'listing-1',
      hourlyRate: 10,
      platformFeeRate: 500,
      tenantId: 'tenant-1',
    })
    agentListingDao.findById.mockResolvedValue({ id: 'listing-1', agentId: 'agent-bound' })
    agentDao.findByUserId.mockResolvedValue({ id: 'agent-other', userId: 'bot-1' })

    await expect(
      service.recordUsage(
        'contract-1',
        {
          startedAt: '2026-05-05T00:00:00.000Z',
          durationMinutes: 60,
        },
        { kind: 'agent', userId: 'bot-1', scopes: ['rental:usage:write'] },
      ),
    ).rejects.toThrow('Agent is not bound to this rental contract')
    expect(rentalUsageDao.create).not.toHaveBeenCalled()
  })

  it('requires rental usage capability for the bound agent actor', async () => {
    rentalContractDao.findById.mockResolvedValue({
      id: 'contract-1',
      contractNo: 'RC-1',
      status: 'active',
      listingId: 'listing-1',
      hourlyRate: 10,
      platformFeeRate: 500,
      tenantId: 'tenant-1',
      ownerId: 'owner-1',
    })
    agentListingDao.findById.mockResolvedValue({ id: 'listing-1', agentId: 'agent-bound' })
    agentDao.findByUserId.mockResolvedValue({ id: 'agent-bound', userId: 'bot-1' })

    await expect(
      service.recordUsage(
        'contract-1',
        {
          startedAt: '2026-05-05T00:00:00.000Z',
          durationMinutes: 60,
        },
        { kind: 'agent', userId: 'bot-1', agentId: 'agent-bound', scopes: [] },
      ),
    ).rejects.toThrow('Agent actor is missing rental usage capability')
    expect(rentalUsageDao.create).not.toHaveBeenCalled()
  })

  it('returns an existing usage event without double billing', async () => {
    const existingUsage = { id: 'usage-existing', contractId: 'contract-1' }
    rentalContractDao.findById.mockResolvedValue({
      id: 'contract-1',
      contractNo: 'RC-1',
      status: 'active',
      listingId: 'listing-1',
      hourlyRate: 10,
      platformFeeRate: 500,
      tenantId: 'tenant-1',
      ownerId: 'owner-1',
    })
    agentListingDao.findById.mockResolvedValue({ id: 'listing-1', agentId: 'agent-bound' })
    agentDao.findByUserId.mockResolvedValue({ id: 'agent-bound', userId: 'bot-1' })
    rentalUsageDao.findByUsageEventId.mockResolvedValue(existingUsage)

    await expect(
      service.recordUsage(
        'contract-1',
        {
          startedAt: '2026-05-05T00:00:00.000Z',
          durationMinutes: 60,
          usageEventId: 'evt-usage-1',
        },
        {
          kind: 'agent',
          userId: 'bot-1',
          agentId: 'agent-bound',
          scopes: ['rental:usage:write'],
        },
      ),
    ).resolves.toBe(existingUsage)
    expect(rentalUsageDao.create).not.toHaveBeenCalled()
    expect(ledgerService.debit).not.toHaveBeenCalled()
    expect(ledgerService.credit).not.toHaveBeenCalled()
  })
})
