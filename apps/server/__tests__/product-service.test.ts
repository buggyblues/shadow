import { describe, expect, it, vi } from 'vitest'
import { ProductService } from '../src/services/product.service'

const shopId = 'shop-1'
const productId = 'product-1'
const fileId = 'file-1'

function createSubject(existingProduct?: Record<string, unknown>) {
  let storedProduct = existingProduct
    ? { id: productId, shopId, ...existingProduct }
    : ({
        id: productId,
        shopId,
        type: 'physical',
        tags: [],
        entitlementConfig: null,
      } as Record<string, unknown>)
  const productDao = {
    create: vi.fn(async (data: Record<string, unknown>) => {
      storedProduct = { id: productId, ...data }
      return storedProduct
    }),
    findById: vi.fn(async () => storedProduct),
    updateByShopIdAndId: vi.fn(
      async (_shopId: string, _productId: string, data: Record<string, unknown>) => {
        storedProduct = { ...storedProduct, ...data }
        return storedProduct
      },
    ),
  }
  const productMediaDao = {
    create: vi.fn(async () => undefined),
    deleteByProductId: vi.fn(async () => undefined),
    findByProductId: vi.fn(async () => []),
  }
  const skuDao = {
    create: vi.fn(async () => undefined),
    deactivateMissing: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findByProductId: vi.fn(async () => []),
    update: vi.fn(async () => undefined),
  }
  const service = new ProductService({
    productDao: productDao as any,
    productMediaDao: productMediaDao as any,
    skuDao: skuDao as any,
  })
  return { productDao, service }
}

describe('ProductService desktop pet pack invariants', () => {
  it('allows desktop pet pack products backed by paid workspace files', async () => {
    const { productDao, service } = createSubject()

    await service.createProduct(shopId, {
      name: 'Lazy Cat Pack',
      slug: 'lazy-cat-pack',
      type: 'entitlement',
      tags: ['paid_file', 'desktop-pet-pack', '虾豆桌面宠物'],
      entitlementConfig: [
        {
          resourceType: 'workspace_file',
          resourceId: fileId,
          capability: 'download',
          repeatable: false,
        },
      ],
    })

    expect(productDao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId,
        type: 'entitlement',
        tags: ['paid_file', 'desktop-pet-pack', '虾豆桌面宠物'],
      }),
    )
  })

  it('rejects desktop pet pack products that do not grant a workspace file', async () => {
    const { productDao, service } = createSubject()

    await expect(
      service.createProduct(shopId, {
        name: 'Service Pack',
        slug: 'service-pack',
        type: 'entitlement',
        tags: ['desktop-pet-pack'],
        entitlementConfig: [
          {
            resourceType: 'service',
            resourceId: 'service-1',
            capability: 'use',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'DESKTOP_PET_PACK_REQUIRES_WORKSPACE_FILE',
      status: 400,
    })
    expect(productDao.create).not.toHaveBeenCalled()
  })

  it('rejects desktop pet tags on non-entitlement products during update', async () => {
    const { productDao, service } = createSubject({
      type: 'physical',
      tags: [],
      entitlementConfig: null,
    })

    await expect(
      service.updateProductInShop(shopId, productId, {
        tags: ['desktop-pet-pack'],
      }),
    ).rejects.toMatchObject({
      code: 'DESKTOP_PET_PACK_REQUIRES_WORKSPACE_FILE',
      status: 400,
    })
    expect(productDao.updateByShopIdAndId).not.toHaveBeenCalled()
  })

  it('rejects changing an existing desktop pet pack away from a downloadable file', async () => {
    const { productDao, service } = createSubject({
      type: 'entitlement',
      tags: ['desktop-pet-pack'],
      entitlementConfig: [
        {
          resourceType: 'workspace_file',
          resourceId: fileId,
          capability: 'download',
        },
      ],
    })

    await expect(
      service.updateProductInShop(shopId, productId, {
        entitlementConfig: [
          {
            resourceType: 'workspace_file',
            resourceId: fileId,
            capability: 'use',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'DESKTOP_PET_PACK_REQUIRES_WORKSPACE_FILE',
      status: 400,
    })
    expect(productDao.updateByShopIdAndId).not.toHaveBeenCalled()
  })
})
