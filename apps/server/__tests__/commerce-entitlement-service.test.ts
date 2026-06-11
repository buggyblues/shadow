import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import {
  agents,
  commerceDeliverables,
  commerceFulfillmentJobs,
  commerceFulfillmentRecords,
  commerceIdempotencyKeys,
  entitlements,
  orders,
  paidFileGrants,
} from '../src/db/schema'
import { CommerceCardService } from '../src/services/commerce-card.service'
import { CommerceCheckoutService } from '../src/services/commerce-checkout.service'
import { CommerceFulfillmentService } from '../src/services/commerce-fulfillment.service'
import { refundByNaturalDay } from '../src/services/entitlement-cancellation.service'
import { EntitlementProvisionerService } from '../src/services/entitlement-provisioner.service'
import { EntitlementPurchaseService } from '../src/services/entitlement-purchase.service'
import { PaidFileService } from '../src/services/paid-file.service'

const serverId = '11111111-1111-4111-8111-111111111111'
const channelId = '22222222-2222-4222-8222-222222222222'
const shopId = '33333333-3333-4333-8333-333333333333'
const productId = '44444444-4444-4444-8444-444444444444'
const offerId = '55555555-5555-4555-8555-555555555555'
const buyerId = '66666666-6666-4666-8666-666666666666'
const ownerId = '77777777-7777-4777-8777-777777777777'
const buddyId = '88888888-8888-4888-8888-888888888888'
const directChannelId = '22222222-3333-4222-8222-222222222222'
const fileId = '99999999-9999-4999-8999-999999999999'
const entitlementId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deliverableId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const orderId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const fulfillmentJobId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function createProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: productId,
    shopId,
    name: 'Match Flame',
    slug: 'match-flame',
    summary: 'A paid HTML animation',
    status: 'active',
    type: 'entitlement',
    billingMode: 'fixed_duration',
    basePrice: 900,
    currency: 'shrimp_coin',
    media: [{ url: 'https://example.com/product.png' }],
    skus: [],
    entitlementConfig: [
      {
        resourceType: 'workspace_file',
        resourceId: fileId,
        capability: 'view',
        durationSeconds: 2_592_000,
      },
    ],
    ...overrides,
  }
}

function createShop(overrides: Record<string, unknown> = {}) {
  return {
    id: shopId,
    scopeKind: 'user',
    serverId: null,
    ownerUserId: ownerId,
    status: 'active',
    ...overrides,
  }
}

function createOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: offerId,
    shopId,
    productId,
    originKind: 'user',
    originServerId: null,
    sellerUserId: ownerId,
    sellerBuddyUserId: buddyId,
    allowedSurfaces: ['channel', 'dm'],
    visibility: 'login_required',
    eligibility: {},
    priceOverride: null,
    currency: 'shrimp_coin',
    startsAt: null,
    expiresAt: null,
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function createEntitlementPurchaseSubject(input?: {
  product?: Record<string, unknown>
  shop?: Record<string, unknown>
  offer?: Record<string, unknown>
  existingEntitlements?: Array<Record<string, unknown>>
}) {
  const db = createPurchaseDb({ activeEntitlements: input?.existingEntitlements })
  const product = createProduct(input?.product)
  const shop = createShop(input?.shop)
  const offer = createOffer(input?.offer)
  const ledgerService = {
    credit: vi.fn(async () => undefined),
    debit: vi.fn(async () => undefined),
  }
  const settlementService = {
    createLine: vi.fn(async () => ({ id: 'settlement-line-1' })),
  }
  const notificationTriggerService = {
    triggerCommercePurchaseCompleted: vi.fn(async () => undefined),
  }
  const commerceFulfillmentService = {
    processJobs: vi.fn(async (jobIds: string[]) => jobIds.map((id) => ({ id, status: 'sent' }))),
  }
  const service = new EntitlementPurchaseService({
    db: db as any,
    productService: {
      getProductById: vi.fn(async () => product),
    } as any,
    ledgerService: ledgerService as any,
    notificationTriggerService: notificationTriggerService as any,
    entitlementProvisionerService: {
      validateProductConfig: vi.fn(async () => ({
        serverId: null,
        resourceType: 'workspace_file',
        resourceId: fileId,
        capability: 'view',
      })),
      provision: vi.fn(async () => ({
        active: true,
        entitlement: createEntitlement(),
        provisioning: { status: 'provisioned', code: 'RESOURCE_ENTITLEMENT_RECORDED' },
      })),
    } as any,
    commerceOfferService: {
      requireActiveOfferForSurface: vi.fn(async () => ({ offer, product, shop })),
      getOfferBundle: vi.fn(async () => ({ offer, product, shop })),
      ensureDefaultOfferForProduct: vi.fn(async () => offer),
      listDeliverablesForOffer: vi.fn(async () => []),
    } as any,
    commerceFulfillmentService: commerceFulfillmentService as any,
    economyPolicyService: {
      authorize: vi.fn(async () => ({ ok: true })),
    } as any,
    economyAuditService: {
      record: vi.fn(async () => undefined),
    } as any,
    settlementService: settlementService as any,
  })

  return {
    service,
    db,
    ledgerService,
    settlementService,
    notificationTriggerService,
    commerceFulfillmentService,
  }
}

function createCommerceCardService(input?: {
  product?: Record<string, unknown>
  shop?: Record<string, unknown>
  offer?: Record<string, unknown>
  channel?: Record<string, unknown> | null
  getMember?: (serverId: string, userId: string) => Promise<unknown>
}) {
  const product = createProduct(input?.product)
  const shop = createShop(input?.shop)
  const offer = createOffer(input?.offer)

  return new CommerceCardService({
    channelDao: {
      findById: vi.fn(
        async () =>
          input?.channel ?? {
            id: channelId,
            kind: 'server',
            serverId,
            dmUserAId: null,
            dmUserBId: null,
          },
      ),
    } as any,
    serverDao: {
      getMember:
        input?.getMember ??
        vi.fn(async (_serverId: string, userId: string) =>
          userId === ownerId || userId === buddyId ? { userId } : null,
        ),
    } as any,
    commerceOfferService: {
      ensureDefaultOfferForProduct: vi.fn(async () => offer),
      requireActiveOfferForSurface: vi.fn(async () => ({ offer, product, shop })),
    } as any,
  })
}

describe('CommerceCardService', () => {
  it('rejects server shop offer cards in direct channel metadata', async () => {
    const service = createCommerceCardService({
      channel: {
        id: directChannelId,
        kind: 'dm',
        serverId: null,
        dmUserAId: buyerId,
        dmUserBId: buddyId,
      },
      shop: {
        scopeKind: 'server',
        serverId,
        ownerUserId: null,
      },
      offer: {
        originKind: 'server',
        originServerId: serverId,
        sellerUserId: null,
        sellerBuddyUserId: null,
      },
    })

    await expect(
      service.normalizeMessageMetadata(
        { commerceCards: [{ kind: 'offer', offerId }] },
        { kind: 'channel', channelId: directChannelId },
      ),
    ).rejects.toMatchObject({ code: 'DM_PRODUCT_CARD_REQUIRES_PERSONAL_SHOP' })
  })

  it('rebuilds channel commerce metadata as canonical offer cards', async () => {
    const service = createCommerceCardService({
      shop: {
        scopeKind: 'server',
        serverId,
        ownerUserId: null,
      },
      offer: {
        originKind: 'server',
        originServerId: serverId,
        sellerUserId: null,
        sellerBuddyUserId: null,
        allowedSurfaces: ['channel'],
      },
    })

    const metadata = await service.normalizeMessageMetadata(
      { commerceCards: [{ kind: 'product', productId }] },
      { kind: 'channel', channelId },
    )
    const cards = metadata.commerceCards as unknown[]

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      kind: 'offer',
      offerId,
      shopScope: { kind: 'server', id: serverId },
      productId,
      snapshot: {
        name: 'Match Flame',
        price: 900,
        productType: 'entitlement',
        billingMode: 'fixed_duration',
        resourceType: 'workspace_file',
        resourceId: fileId,
        capability: 'view',
      },
      purchase: { mode: 'direct' },
    })
  })

  it('allows a Buddy personal shop offer card in direct channel when the Buddy participates', async () => {
    const service = createCommerceCardService({
      channel: {
        id: directChannelId,
        kind: 'dm',
        serverId: null,
        dmUserAId: buyerId,
        dmUserBId: buddyId,
      },
      shop: {
        scopeKind: 'user',
        ownerUserId: buddyId,
      },
      offer: {
        sellerUserId: null,
        sellerBuddyUserId: buddyId,
      },
    })

    const metadata = await service.normalizeMessageMetadata(
      { commerceCards: [{ kind: 'offer', offerId }] },
      { kind: 'channel', channelId: directChannelId },
    )

    expect(metadata.commerceCards).toEqual([
      expect.objectContaining({
        kind: 'offer',
        offerId,
        shopScope: { kind: 'user', id: buddyId },
        snapshot: expect.objectContaining({
          resourceType: 'workspace_file',
          resourceId: fileId,
          capability: 'view',
        }),
      }),
    ])
  })

  it('treats top-level commerceOfferId metadata as an offer card', async () => {
    const service = createCommerceCardService({
      shop: {
        scopeKind: 'user',
        ownerUserId: buddyId,
      },
      offer: {
        sellerUserId: null,
        sellerBuddyUserId: buddyId,
      },
    })

    const metadata = await service.normalizeMessageMetadata(
      { commerceOfferId: offerId },
      { kind: 'channel', channelId },
    )

    expect(metadata.commerceCards).toEqual([
      expect.objectContaining({
        kind: 'offer',
        offerId,
        shopScope: { kind: 'user', id: buddyId },
      }),
    ])
  })

  it('preserves known non-commerce message metadata at the top level', async () => {
    const service = createCommerceCardService()

    const metadata = await service.inferMessageMetadata({
      metadata: {
        agentChain: {
          agentId: 'brandscout',
          depth: 1,
          participants: [buddyId],
          startedAt: 1802000000000,
          rootMessageId: 'message-1',
        },
        shadowDelivery: {
          id: 'delivery-1',
          source: 'openclaw-shadowob',
          replyToId: 'message-1',
        },
        removedField: true,
      },
      target: { kind: 'channel', channelId },
      authorId: buddyId,
      content: 'reply',
    })

    expect(metadata.agentChain).toMatchObject({ agentId: 'brandscout', depth: 1 })
    expect(metadata.shadowDelivery).toMatchObject({ id: 'delivery-1' })
    expect(metadata.custom).toEqual({ removedField: true })
  })

  it('does not attach offer cards from natural sales copy without explicit commerce metadata', async () => {
    const service = createCommerceCardService({
      product: {
        name: '一盒会发光的火柴',
        summary: '购买后解锁一段火柴点亮的 HTML 动画。',
      },
      shop: {
        scopeKind: 'user',
        ownerUserId: buddyId,
      },
      offer: {
        sellerUserId: null,
        sellerBuddyUserId: buddyId,
      },
    })

    const metadata = await service.inferMessageMetadata({
      metadata: undefined,
      target: { kind: 'channel', channelId },
      authorId: buddyId,
      content: '请看——这就是我说的那盒会发光的火柴。你要把它带回家吗？',
    })

    expect(metadata.commerceCards).toBeUndefined()
  })
})

describe('refundByNaturalDay', () => {
  it('uses natural-day zero-point slices for pro-rated refunds', () => {
    expect(
      refundByNaturalDay({
        paidAmount: 3000,
        startsAt: new Date('2026-05-01T10:00:00.000Z'),
        expiresAt: new Date('2026-05-31T23:59:00.000Z'),
        now: new Date('2026-05-16T12:00:00.000Z'),
      }),
    ).toBe(1500)
  })

  it('never refunds more than the paid amount', () => {
    expect(
      refundByNaturalDay({
        paidAmount: 3000,
        startsAt: new Date('2026-05-01T10:00:00.000Z'),
        expiresAt: new Date('2026-05-31T23:59:00.000Z'),
        now: new Date('2026-04-30T12:00:00.000Z'),
      }),
    ).toBe(3000)
  })
})

describe('EntitlementProvisionerService', () => {
  it('records resource entitlement provisioning state', async () => {
    const entitlement = createEntitlement()
    const update = vi.fn(async (_id: string, data: Record<string, unknown>) => ({
      ...entitlement,
      ...data,
    }))
    const service = new EntitlementProvisionerService({
      entitlementDao: {
        findById: vi.fn(async () => entitlement),
        update,
      } as any,
    })

    const result = await service.provision(entitlement.id)

    expect(result.provisioning).toMatchObject({
      status: 'provisioned',
      code: 'RESOURCE_ENTITLEMENT_RECORDED',
      resourceType: 'workspace_file',
      resourceId: fileId,
      capability: 'view',
    })
    expect(update).toHaveBeenCalledWith(
      entitlement.id,
      expect.objectContaining({
        metadata: expect.objectContaining({
          provisioning: expect.objectContaining({ code: 'RESOURCE_ENTITLEMENT_RECORDED' }),
        }),
      }),
    )
  })
})

describe('CommerceFulfillmentService', () => {
  it('sends paid file cards and marks fulfillment jobs sent', async () => {
    const job = {
      id: fulfillmentJobId,
      orderId,
      entitlementId,
      deliverableId,
      buyerId,
      destinationKind: 'channel',
      destinationId: channelId,
      senderBuddyUserId: buddyId,
      status: 'pending',
      attempts: 0,
      resultMessageId: null,
      lastErrorCode: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const deliverable = {
      id: deliverableId,
      offerId,
      productId,
      kind: 'paid_file',
      resourceType: 'workspace_file',
      resourceId: fileId,
      senderBuddyUserId: buddyId,
      deliveryTiming: 'after_purchase',
      messageTemplateKey: null,
      status: 'active',
      metadata: { message: 'The match is ready.', summary: 'A tiny flame.' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const db = createFulfillmentDb(job, deliverable)
    const messageService = {
      send: vi.fn(async (_channelId: string, userId: string, payload: Record<string, unknown>) => ({
        id: 'message-1',
        userId,
        ...payload,
      })),
    }
    const service = new CommerceFulfillmentService({
      db: db as any,
      messageService: messageService as any,
      dmService: { sendMessage: vi.fn() } as any,
      workspaceNodeDao: {
        findById: vi.fn(async () => createFileNode()),
      } as any,
    })

    const result = await service.processJob(job.id)

    expect(result).toMatchObject({ id: job.id, status: 'sent', resultMessageId: 'message-1' })
    expect(messageService.send).toHaveBeenCalledWith(
      channelId,
      buddyId,
      expect.objectContaining({
        content: 'The match is ready.',
        metadata: expect.objectContaining({
          paidFileCards: [
            expect.objectContaining({
              kind: 'paid_file',
              fileId,
              entitlementId,
              deliverableId,
              snapshot: expect.objectContaining({
                name: 'match-animation.html',
                mime: 'text/html',
                summary: 'A tiny flame.',
              }),
            }),
          ],
        }),
      }),
    )
  })
})

describe('EntitlementPurchaseService', () => {
  it('purchases active offers, stores offer entitlements, and runs fulfillment', async () => {
    const db = createPurchaseDb()
    const product = createProduct()
    const shop = createShop()
    const offer = createOffer()
    const deliverable = {
      id: deliverableId,
      offerId,
      productId,
      kind: 'paid_file',
      resourceType: 'workspace_file',
      resourceId: fileId,
      senderBuddyUserId: buddyId,
      status: 'active',
    }
    const ledgerService = {
      credit: vi.fn(async () => undefined),
      debit: vi.fn(async () => undefined),
    }
    const settlementService = {
      createLine: vi.fn(async () => ({ id: 'settlement-line-1' })),
    }
    const commerceFulfillmentService = {
      processJobs: vi.fn(async () => [{ id: fulfillmentJobId, status: 'sent' }]),
    }
    const service = new EntitlementPurchaseService({
      db: db as any,
      productService: {
        getProductById: vi.fn(async () => product),
      } as any,
      ledgerService: ledgerService as any,
      notificationTriggerService: {
        triggerCommercePurchaseCompleted: vi.fn(async () => undefined),
      } as any,
      entitlementProvisionerService: {
        validateProductConfig: vi.fn(async () => ({
          serverId: null,
          resourceType: 'workspace_file',
          resourceId: fileId,
          capability: 'view',
        })),
        provision: vi.fn(async () => ({
          active: true,
          entitlement: createEntitlement({
            metadata: {
              provisioning: { code: 'RESOURCE_ENTITLEMENT_RECORDED' },
            },
          }),
          provisioning: { status: 'provisioned', code: 'RESOURCE_ENTITLEMENT_RECORDED' },
        })),
      } as any,
      commerceOfferService: {
        requireActiveOfferForSurface: vi.fn(async () => ({ offer, product, shop })),
        getOfferBundle: vi.fn(async () => ({ offer, product, shop })),
        ensureDefaultOfferForProduct: vi.fn(async () => offer),
        listDeliverablesForOffer: vi.fn(async () => [deliverable]),
      } as any,
      commerceFulfillmentService: commerceFulfillmentService as any,
      economyPolicyService: {
        authorize: vi.fn(async () => ({ ok: true })),
      } as any,
      economyAuditService: {
        record: vi.fn(async () => undefined),
      } as any,
      settlementService: settlementService as any,
    })

    const result = await service.purchaseOffer({
      buyerId,
      offerId,
      idempotencyKey: 'purchase-key-1',
      destination: { kind: 'channel', id: directChannelId },
    })

    expect(ledgerService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: buyerId,
        amount: 900,
        referenceId: orderId,
        referenceType: 'order',
      }),
      expect.anything(),
    )
    expect(settlementService.createLine).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerUserId: ownerId,
        shopId,
        sourceType: 'order',
        sourceId: orderId,
        grossAmount: 900,
      }),
      expect.anything(),
    )
    expect(ledgerService.credit).not.toHaveBeenCalled()
    expect(db.inserts.find((entry) => entry.table === entitlements)?.data).toMatchObject({
      userId: buyerId,
      productId,
      offerId,
      resourceType: 'workspace_file',
      resourceId: fileId,
      capability: 'view',
      metadata: expect.objectContaining({
        productImageUrl: 'https://example.com/product.png',
        productAssetType: null,
      }),
    })
    expect(db.inserts.find((entry) => entry.table === commerceFulfillmentJobs)?.data).toMatchObject(
      {
        orderId,
        entitlementId,
        deliverableId,
        buyerId,
        destinationKind: 'channel',
        destinationId: directChannelId,
        senderBuddyUserId: buddyId,
      },
    )
    expect(commerceFulfillmentService.processJobs).toHaveBeenCalledWith([fulfillmentJobId])
    expect(result.fulfillmentJobs).toEqual([{ id: fulfillmentJobId, status: 'sent' }])
    expect(result.nextAction).toBe('open_paid_file')
  })

  it('marks desktop pet pack entitlements for marketplace import', async () => {
    const { service, db } = createEntitlementPurchaseSubject({
      product: {
        tags: ['paid_file', 'desktop-pet-pack', '虾豆桌面宠物'],
      },
    })

    await service.purchaseOffer({
      buyerId,
      offerId,
      idempotencyKey: 'purchase-key-pet-pack',
    })

    expect(db.inserts.find((entry) => entry.table === entitlements)?.data).toMatchObject({
      resourceType: 'workspace_file',
      resourceId: fileId,
      capability: 'view',
      metadata: expect.objectContaining({
        productAssetType: 'desktop_pet_pack',
        productTags: ['paid_file', 'desktop-pet-pack', '虾豆桌面宠物'],
        desktopPetPack: {
          kind: 'desktop_pet_pack',
          format: 'codex-pet',
          marketplaceTag: 'desktop-pet-pack',
        },
      }),
    })
  })

  it('rejects active repeat purchases for non-repeatable entitlement products', async () => {
    const { service, ledgerService } = createEntitlementPurchaseSubject({
      product: {
        entitlementConfig: [
          {
            resourceType: 'workspace_file',
            resourceId: fileId,
            capability: 'view',
            repeatable: false,
          },
        ],
      },
      existingEntitlements: [createEntitlement()],
    })

    await expect(
      service.purchaseOffer({
        buyerId,
        offerId,
        idempotencyKey: 'purchase-key-non-repeatable',
      }),
    ).rejects.toMatchObject({
      code: 'PRODUCT_ALREADY_PURCHASED',
      status: 409,
    })
    expect(ledgerService.debit).not.toHaveBeenCalled()
  })

  it('allows repeat purchases when entitlement config is repeatable', async () => {
    const { service, ledgerService } = createEntitlementPurchaseSubject({
      product: {
        entitlementConfig: [
          {
            resourceType: 'workspace_file',
            resourceId: fileId,
            capability: 'view',
            repeatable: true,
          },
        ],
      },
      existingEntitlements: [createEntitlement()],
    })

    const result = await service.purchaseOffer({
      buyerId,
      offerId,
      idempotencyKey: 'purchase-key-repeatable',
    })

    expect(result.order).toMatchObject({ id: orderId, totalAmount: 900 })
    expect(ledgerService.debit).toHaveBeenCalled()
  })
})

describe('CommerceCheckoutService', () => {
  it('returns active viewer state for purchased paid-file offers', async () => {
    const service = new CommerceCheckoutService({
      commerceOfferService: {
        getOfferBundle: vi.fn(async () => ({
          offer: createOffer(),
          product: createProduct(),
          shop: createShop(),
        })),
        listDeliverablesForOffer: vi.fn(async () => [
          {
            id: deliverableId,
            kind: 'paid_file',
            status: 'active',
            resourceType: 'workspace_file',
            resourceId: fileId,
          },
        ]),
      } as any,
      entitlementAccessService: {
        checkResourceAccess: vi.fn(async () => ({
          allowed: true,
          status: 'active',
          reasonCode: null,
          entitlement: { id: entitlementId, status: 'active', capability: 'view', expiresAt: null },
        })),
      } as any,
      workspaceNodeDao: {
        findById: vi.fn(async () => createFileNode()),
      } as any,
      walletService: {
        getWallet: vi.fn(async () => ({ balance: 100 })),
      } as any,
    })

    const preview = await service.previewOffer({ userId: buyerId, offerId, includeWallet: true })

    expect(preview.viewerState).toBe('active')
    expect(preview.primaryAction).toBe('open_content')
    expect(preview.displayState).toMatchObject({
      viewerState: 'active',
      primaryAction: 'open_content',
      balance: { current: 100, afterPurchase: -800, shortfall: 800 },
    })
    expect(preview.nextAction).toBe('open_paid_file')
    expect(preview.paidFile).toMatchObject({ id: fileId, name: 'match-animation.html' })
    expect(preview.entitlement?.access.allowed).toBe(true)
  })

  it('returns not_purchased viewer state when the user has no entitlement', async () => {
    const service = new CommerceCheckoutService({
      commerceOfferService: {
        getOfferBundle: vi.fn(async () => ({
          offer: createOffer(),
          product: createProduct(),
          shop: createShop(),
        })),
        listDeliverablesForOffer: vi.fn(async () => []),
      } as any,
      entitlementAccessService: {
        checkResourceAccess: vi.fn(async () => ({
          allowed: false,
          status: 'not_found',
          reasonCode: 'ENTITLEMENT_NOT_FOUND',
          entitlement: null,
        })),
      } as any,
      workspaceNodeDao: {
        findById: vi.fn(async () => createFileNode()),
      } as any,
      walletService: {
        getWallet: vi.fn(async () => ({ balance: 1000 })),
      } as any,
    })

    const preview = await service.previewOffer({ userId: buyerId, offerId })

    expect(preview.viewerState).toBe('not_purchased')
    expect(preview.primaryAction).toBe('purchase')
    expect(preview.displayState.primaryAction).toBe('purchase')
    expect(preview.nextAction).toBe('purchase')
  })
})

describe('PaidFileService', () => {
  it('creates short-lived grants and rechecks entitlement before reading content', async () => {
    const entitlement = createEntitlement()
    const db = createPaidFileDb()
    const service = new PaidFileService({
      db: db as any,
      workspaceNodeDao: {
        findById: vi.fn(async () => createFileNode()),
      } as any,
      entitlementAccessService: {
        checkResourceAccess: vi.fn(async () => ({
          allowed: true,
          status: 'active',
          reasonCode: null,
          entitlement,
        })),
      } as any,
      mediaService: {
        getFileBuffer: vi.fn(async () => Buffer.from('<html>match</html>')),
      } as any,
    })

    const opened = await service.openPaidFile(buyerId, fileId)
    const read = await service.readGrantFile({
      fileId,
      grantId: opened.grant.id,
      token: opened.grantToken,
    })

    expect(opened.viewerUrl).toContain(`/api/paid-files/${fileId}/view/${opened.grant.id}`)
    expect(opened.viewerUrl).not.toContain('token=')
    expect(read.file).toMatchObject({ id: fileId, mime: 'text/html' })
    expect(read.buffer.toString('utf8')).toBe('<html>match</html>')
  })

  it('does not create grants when the matching entitlement is not currently allowed', async () => {
    const db = createPaidFileDb()
    const service = new PaidFileService({
      db: db as any,
      workspaceNodeDao: {
        findById: vi.fn(async () => createFileNode()),
      } as any,
      entitlementAccessService: {
        checkResourceAccess: vi.fn(async () => ({
          allowed: false,
          status: 'expired',
          reasonCode: 'ENTITLEMENT_EXPIRED',
          entitlement: createEntitlement({ expiresAt: new Date(Date.now() - 1000) }),
        })),
      } as any,
      mediaService: {
        getFileBuffer: vi.fn(async () => Buffer.from('<html>match</html>')),
      } as any,
    })

    const state = await service.getFileState(buyerId, fileId)

    expect(state.entitlement).toMatchObject({ id: entitlementId, status: 'active' })
    expect(state.hasAccess).toBe(false)
    await expect(service.openPaidFile(buyerId, fileId)).rejects.toMatchObject({
      code: 'PAID_FILE_ENTITLEMENT_REQUIRED',
      status: 403,
    })
    expect(db.grants).toHaveLength(0)
  })

  it('rejects grant reads when the backing entitlement has been revoked', async () => {
    const db = createPaidFileDb()
    const service = new PaidFileService({
      db: db as any,
      workspaceNodeDao: {
        findById: vi.fn(async () => createFileNode()),
      } as any,
      entitlementAccessService: {
        checkResourceAccess: vi
          .fn()
          .mockResolvedValueOnce({
            allowed: true,
            status: 'active',
            reasonCode: null,
            entitlement: createEntitlement(),
          })
          .mockResolvedValueOnce({
            allowed: false,
            status: 'revoked',
            reasonCode: 'ENTITLEMENT_REVOKED',
            entitlement: createEntitlement({
              isActive: false,
              status: 'revoked',
              revokedAt: new Date(),
            }),
          }),
      } as any,
      mediaService: {
        getFileBuffer: vi.fn(async () => Buffer.from('<html>match</html>')),
      } as any,
    })
    const opened = await service.openPaidFile(buyerId, fileId)

    await expect(
      service.readGrantFile({
        fileId,
        grantId: opened.grant.id,
        token: opened.grantToken,
      }),
    ).rejects.toMatchObject({ code: 'PAID_FILE_ENTITLEMENT_REQUIRED' })
  })
})

describe('paid file routes', () => {
  it('serves grant viewers without bearer auth because the grant token authorizes access', async () => {
    const readGrantFile = vi.fn(async () => ({
      file: {
        id: fileId,
        name: 'match.html',
        mime: 'text/html',
      },
      buffer: Buffer.from('<!doctype html><h1>match</h1>'),
    }))
    const app = createApp({
      resolve(name: string) {
        if (name === 'paidFileService') {
          return { readGrantFile }
        }
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as any)

    const response = await app.request(`/api/paid-files/${fileId}/view/grant-1`, {
      headers: { 'x-paid-file-grant-token': 'grant-token' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('content-security-policy')).toContain('https://cdn.jsdelivr.net')
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(await response.text()).toContain('<h1>match</h1>')
    expect(readGrantFile).toHaveBeenCalledWith({
      fileId,
      grantId: 'grant-1',
      token: 'grant-token',
    })
  })
})

function createEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    id: entitlementId,
    userId: buyerId,
    serverId: null,
    shopId,
    orderId,
    renewalOrderId: null,
    productId,
    offerId,
    scopeKind: 'user',
    resourceType: 'workspace_file',
    resourceId: fileId,
    capability: 'view',
    status: 'active',
    startsAt: new Date(),
    expiresAt: null,
    isActive: true,
    nextRenewalAt: null,
    cancelledAt: null,
    revokedAt: null,
    cancelReason: null,
    revocationReason: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function createFileNode(overrides: Record<string, unknown> = {}) {
  return {
    id: fileId,
    kind: 'file',
    name: 'match-animation.html',
    mime: 'text/html',
    sizeBytes: 128,
    previewUrl: null,
    contentRef: 'media-object-1',
    flags: { paywall: true, paidFile: true },
    ...overrides,
  }
}

function createFulfillmentDb(job: Record<string, unknown>, deliverable: Record<string, unknown>) {
  const records: Record<string, unknown>[] = []
  return {
    records,
    select: () => ({
      table: null as unknown,
      from(table: unknown) {
        this.table = table
        return this
      },
      where() {
        return this
      },
      limit() {
        if (this.table === commerceFulfillmentJobs) return Promise.resolve([job])
        if (this.table === commerceDeliverables) return Promise.resolve([deliverable])
        if (this.table === commerceFulfillmentRecords) return Promise.resolve(records.slice(0, 1))
        return Promise.resolve([])
      },
    }),
    insert: (table: unknown) => ({
      values(data: Record<string, unknown>) {
        if (table === commerceFulfillmentRecords) records.push(data)
        return this
      },
      onConflictDoNothing() {
        return this
      },
      then(resolve: (value: unknown) => void) {
        return Promise.resolve(undefined).then(resolve)
      },
    }),
    update: (table: unknown) => createUpdateBuilder(table, { job }),
  }
}

function createPurchaseDb(input?: { activeEntitlements?: Array<Record<string, unknown>> }) {
  const inserts: Array<{ table: unknown; data: Record<string, unknown> }> = []
  const updates: Array<{ table: unknown; data: Record<string, unknown> }> = []
  const tx = {
    insert: (table: unknown) => createPurchaseInsertBuilder(table, inserts),
    select: () => ({
      table: null as unknown,
      from(table: unknown) {
        this.table = table
        return this
      },
      where() {
        return this
      },
      limit() {
        if (this.table === entitlements) {
          return Promise.resolve(input?.activeEntitlements ?? [])
        }
        return Promise.resolve([])
      },
    }),
    update: (table: unknown) => createUpdateBuilder(table, { updates }),
  }
  return {
    inserts,
    updates,
    select: () => ({
      table: null as unknown,
      from(table: unknown) {
        this.table = table
        return this
      },
      where() {
        return this
      },
      limit() {
        if (this.table === agents) return Promise.resolve([{ ownerId }])
        return Promise.resolve([])
      },
    }),
    transaction: async <T>(callback: (tx: typeof tx) => Promise<T>) => callback(tx),
    update: (table: unknown) => createUpdateBuilder(table, { updates }),
  }
}

function createPaidFileDb() {
  const grants: Array<Record<string, unknown>> = []
  return {
    grants,
    insert: (table: unknown) => ({
      data: {} as Record<string, unknown>,
      values(data: Record<string, unknown>) {
        this.data = data
        return this
      },
      returning() {
        if (table !== paidFileGrants) return Promise.resolve([])
        const grant = {
          id: 'grant-1',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...this.data,
        }
        grants.push(grant)
        return Promise.resolve([grant])
      },
    }),
    select: () => ({
      from() {
        return this
      },
      where() {
        return this
      },
      limit() {
        return Promise.resolve(grants.slice(0, 1))
      },
    }),
    update: () => ({
      set(data: Record<string, unknown>) {
        if (grants[0]) Object.assign(grants[0], data)
        return this
      },
      where() {
        return this
      },
      then(resolve: (value: unknown) => void) {
        return Promise.resolve([]).then(resolve)
      },
    }),
  }
}

function createPurchaseInsertBuilder(
  table: unknown,
  inserts: Array<{ table: unknown; data: Record<string, unknown> }>,
) {
  return {
    data: {} as Record<string, unknown>,
    values(data: Record<string, unknown>) {
      this.data = data
      inserts.push({ table, data })
      return this
    },
    onConflictDoNothing() {
      return this
    },
    returning() {
      if (table === commerceIdempotencyKeys) return Promise.resolve([{ id: 'idempotency-1' }])
      if (table === orders) {
        return Promise.resolve([
          {
            id: orderId,
            orderNo: this.data.orderNo,
            shopId: this.data.shopId,
            buyerId: this.data.buyerId,
            status: this.data.status,
            totalAmount: this.data.totalAmount,
          },
        ])
      }
      if (table === entitlements) {
        return Promise.resolve([
          createEntitlement({
            ...this.data,
            id: entitlementId,
            orderId,
            status: 'active',
            isActive: true,
          }),
        ])
      }
      if (table === commerceFulfillmentJobs) {
        return Promise.resolve([
          {
            id: fulfillmentJobId,
            status: 'pending',
            attempts: 0,
            resultMessageId: null,
            lastErrorCode: null,
            ...this.data,
          },
        ])
      }
      return Promise.resolve([])
    },
    then(resolve: (value: unknown) => void) {
      return Promise.resolve(undefined).then(resolve)
    },
  }
}

function createUpdateBuilder(
  table: unknown,
  state: {
    job?: Record<string, unknown>
    updates?: Array<{ table: unknown; data: Record<string, unknown> }>
  },
) {
  return {
    data: {} as Record<string, unknown>,
    set(data: Record<string, unknown>) {
      this.data = data
      state.updates?.push({ table, data })
      if (state.job && table === commerceFulfillmentJobs) {
        Object.assign(state.job, data)
      }
      return this
    },
    where() {
      return this
    },
    returning() {
      if (state.job && table === commerceFulfillmentJobs) {
        return Promise.resolve([state.job])
      }
      return Promise.resolve([])
    },
    then(resolve: (value: unknown) => void) {
      return Promise.resolve(undefined).then(resolve)
    },
  }
}
