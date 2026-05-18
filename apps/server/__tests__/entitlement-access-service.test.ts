import { describe, expect, it, vi } from 'vitest'
import { EntitlementAccessService } from '../src/services/entitlement-access.service'

const userId = '11111111-1111-4111-8111-111111111111'
const appId = '22222222-2222-4222-8222-222222222222'
const entitlementId = '33333333-3333-4333-8333-333333333333'

function createService(input?: {
  entitlements?: Array<Record<string, unknown>>
  cached?: Record<string, unknown> | null
}) {
  const tx = { id: 'tx' }
  const findResourceEntitlements = vi.fn(async () => input?.entitlements ?? [])
  const update = vi.fn(async (id: string, data: Record<string, unknown>) => ({
    id,
    userId,
    status: 'active',
    capability: 'use',
    resourceType: 'external_app',
    resourceId: `${appId}:premium`,
    productId: 'product-1',
    shopId: 'shop-1',
    orderId: 'order-1',
    offerId: 'offer-1',
    expiresAt: null,
    isActive: true,
    metadata: data.metadata,
  }))
  const begin = vi.fn(async () => undefined)
  const complete = vi.fn(async () => undefined)
  const fail = vi.fn(async () => undefined)

  const service = new EntitlementAccessService({
    db: {
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx)),
    } as any,
    entitlementDao: {
      findResourceEntitlements,
      update,
    } as any,
    economyIdempotencyService: {
      getCompleted: vi.fn(async () => input?.cached ?? null),
      begin,
      complete,
      fail,
    } as any,
  })

  return { service, findResourceEntitlements, update, begin, complete, fail, tx }
}

const actor = {
  kind: 'oauth' as const,
  userId,
  appId,
  tokenId: 'token-1',
  scopes: ['commerce:read', 'commerce:write'],
}

describe('EntitlementAccessService OAuth commerce', () => {
  it('checks access only inside the caller app namespace', async () => {
    const { service, findResourceEntitlements } = createService({
      entitlements: [
        {
          id: entitlementId,
          status: 'active',
          capability: 'use',
          resourceType: 'external_app',
          resourceId: `${appId}:premium`,
          expiresAt: null,
          isActive: true,
          metadata: {},
        },
      ],
    })

    const access = await service.checkOAuthExternalAppAccess({
      actor,
      resourceId: `${appId}:premium`,
    })

    expect(access).toMatchObject({
      allowed: true,
      status: 'active',
      resourceType: 'external_app',
      resourceId: `${appId}:premium`,
      app: { id: appId },
      entitlement: { id: entitlementId },
    })
    expect(findResourceEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        resourceType: 'external_app',
        resourceId: `${appId}:premium`,
        capabilities: ['use'],
      }),
    )
  })

  it('rejects cross-app entitlement access before querying storage', async () => {
    const { service, findResourceEntitlements } = createService()

    await expect(
      service.checkOAuthExternalAppAccess({
        actor,
        resourceId: 'other-app:premium',
      }),
    ).rejects.toMatchObject({ code: 'OAUTH_COMMERCE_RESOURCE_FORBIDDEN', status: 403 })
    expect(findResourceEntitlements).not.toHaveBeenCalled()
  })

  it('redeems the newest active unredeemed entitlement with idempotency', async () => {
    const { service, update, complete, fail, tx } = createService({
      entitlements: [
        {
          id: entitlementId,
          userId,
          status: 'active',
          capability: 'use',
          resourceType: 'external_app',
          resourceId: `${appId}:premium`,
          productId: 'product-1',
          shopId: 'shop-1',
          orderId: 'order-1',
          offerId: 'offer-1',
          expiresAt: null,
          isActive: true,
          metadata: {},
        },
      ],
    })

    const result = await service.redeemOAuthExternalAppEntitlement({
      actor,
      idempotencyKey: 'provider-order-1',
      resourceId: `${appId}:premium`,
      metadata: { providerOrderId: 'provider-order-1' },
    })

    expect(result).toMatchObject({
      redeemed: true,
      resourceId: `${appId}:premium`,
      entitlement: { id: entitlementId, productId: 'product-1' },
      redemption: {
        appId,
        idempotencyKey: 'provider-order-1',
        metadata: { providerOrderId: 'provider-order-1' },
      },
    })
    expect(update).toHaveBeenCalledWith(
      entitlementId,
      {
        metadata: {
          externalRedemptions: [
            expect.objectContaining({
              appId,
              resourceId: `${appId}:premium`,
              idempotencyKey: 'provider-order-1',
            }),
          ],
        },
      },
      tx,
    )
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: userId,
        key: 'provider-order-1',
        action: `oauth-commerce-redeem:${appId}`,
        referenceId: entitlementId,
      }),
      tx,
    )
    expect(fail).not.toHaveBeenCalled()
  })

  it('returns completed idempotent redemption without mutating entitlements again', async () => {
    const cached = {
      redeemed: true,
      resourceType: 'external_app',
      resourceId: `${appId}:premium`,
      capability: 'use',
      app: { id: appId },
      entitlement: { id: entitlementId, status: 'active', capability: 'use' },
      redemption: {
        appId,
        resourceType: 'external_app',
        resourceId: `${appId}:premium`,
        capability: 'use',
        idempotencyKey: 'provider-order-1',
        redeemedAt: '2026-05-17T00:00:00.000Z',
      },
    }
    const { service, update, begin } = createService({ cached })

    const result = await service.redeemOAuthExternalAppEntitlement({
      actor,
      idempotencyKey: 'provider-order-1',
      resourceId: `${appId}:premium`,
    })

    expect(result).toEqual(cached)
    expect(begin).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
