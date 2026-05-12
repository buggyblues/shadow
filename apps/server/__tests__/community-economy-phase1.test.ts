import { describe, expect, it, vi } from 'vitest'
import { ProductService } from '../src/services/product.service'

describe('Community economy phase 1 catalog invariants', () => {
  it('updates existing SKUs, inserts new SKUs, and soft-deactivates omitted SKUs', async () => {
    const productDao = {
      updateByShopIdAndId: vi.fn(async () => ({ id: 'product-1' })),
      findById: vi.fn(async () => ({ id: 'product-1', shopId: 'shop-1' })),
    }
    const productMediaDao = {
      findByProductId: vi.fn(async () => []),
    }
    const skuDao = {
      findByProductId: vi.fn(async () => []),
      findById: vi.fn(async (id: string) => ({ id, productId: 'product-1' })),
      update: vi.fn(async () => ({ id: 'sku-1' })),
      create: vi.fn(async () => ({ id: 'sku-2' })),
      deactivateMissing: vi.fn(async () => undefined),
    }
    const service = new ProductService({
      productDao: productDao as any,
      productMediaDao: productMediaDao as any,
      skuDao: skuDao as any,
    })

    await service.updateProduct('product-1', {
      skus: [
        { id: 'sku-1', price: 100, stock: 5, specValues: ['red'] },
        { price: 120, stock: 3, specValues: ['blue'] },
      ],
    })

    expect(skuDao.update).toHaveBeenCalledWith(
      'sku-1',
      expect.objectContaining({ price: 100, stock: 5, isActive: true }),
    )
    expect(skuDao.create).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'product-1', price: 120, isActive: true }),
    )
    expect(skuDao.deactivateMissing).toHaveBeenCalledWith('product-1', ['sku-1', 'sku-2'])
  })

  it('archives products instead of physically deleting them', async () => {
    const productDao = {
      findById: vi.fn(async () => ({ id: 'product-1', shopId: 'shop-1' })),
      deleteByShopIdAndId: vi.fn(async () => undefined),
    }
    const service = new ProductService({
      productDao: productDao as any,
      productMediaDao: {} as any,
      skuDao: {} as any,
    })

    await service.deleteProduct('product-1')

    expect(productDao.deleteByShopIdAndId).toHaveBeenCalledWith('shop-1', 'product-1')
  })
})

describe('Community economy phase 1 recharge idempotency', () => {
  it('uses the client idempotency key for Stripe and stores the completed response', async () => {
    vi.resetModules()
    const createPaymentIntent = vi.fn(async () => ({
      id: 'pi_1',
      client_secret: 'secret_1',
    }))
    vi.doMock('../src/lib/stripe', () => ({
      stripe: { paymentIntents: { create: createPaymentIntent } },
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      RECHARGE_TIERS: {
        '1000': { shrimpCoins: 1000, usdCents: 1000, label: 'Starter' },
        '3000': { shrimpCoins: 3000, usdCents: 2999, label: 'Best Value' },
        '5000': { shrimpCoins: 5000, usdCents: 4999, label: 'Premium' },
      },
      CUSTOM_AMOUNT_MIN: 100,
      CUSTOM_AMOUNT_MAX: 10_000_000,
      shrimpCoinsToUsdCents: (coins: number) => coins,
      generateOrderNo: () => 'RC-TEST',
    }))
    const { RechargeService } = await import('../src/services/recharge.service')
    const economyIdempotencyService = {
      getCompleted: vi.fn(async () => null),
      begin: vi.fn(async () => ({ id: 'idem-row-1' })),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    }
    const service = new RechargeService({
      rechargeDao: {
        createPaymentOrder: vi.fn(async () => ({
          id: 'payment-order-1',
          orderNo: 'RC-TEST',
        })),
      },
      db: {} as any,
      ledgerService: {} as any,
      economyPolicyService: { authorize: vi.fn(async () => ({ ok: true })) },
      economyAuditService: { record: vi.fn(async () => undefined) },
      economyIdempotencyService,
      notificationTriggerService: {} as any,
    } as any)

    const result = await service.createPaymentIntent(
      'user-1',
      '1000',
      undefined,
      'usd',
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      'recharge-key-1',
    )

    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, currency: 'usd' }),
      { idempotencyKey: 'recharge-user-1-recharge-key-1' },
    )
    expect(economyIdempotencyService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        key: 'recharge-key-1',
        action: 'recharge.create-intent',
        referenceId: 'payment-order-1',
        response: result,
      }),
    )

    vi.doUnmock('../src/lib/stripe')
    vi.resetModules()
  })
})
