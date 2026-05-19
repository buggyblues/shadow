import type { ProductDao, ProductMediaDao, SkuDao } from '../dao/product.dao'
import { apiError } from '../lib/api-error'

type EntitlementConfig = {
  resourceType?: string
  resourceId?: string
  capability?: string
  durationSeconds?: number | null
  renewalPeriodSeconds?: number | null
  repeatable?: boolean
  privilegeDescription?: string
}

export type EntitlementConfigInput = EntitlementConfig | EntitlementConfig[]

/**
 * ProductService — manages products (SPU), media, and SKUs.
 * Pure product catalog logic, no order / payment coupling.
 */
export class ProductService {
  constructor(
    private deps: {
      productDao: ProductDao
      productMediaDao: ProductMediaDao
      skuDao: SkuDao
    },
  ) {}

  /* ───────── Query ───────── */

  async getProducts(
    shopId: string,
    opts?: {
      status?: 'draft' | 'active' | 'archived'
      categoryId?: string
      keyword?: string
      limit?: number
      offset?: number
    },
  ) {
    const list = await this.deps.productDao.findByShopId(shopId, opts)
    return Promise.all(
      list.map(async (product) => {
        const media = await this.deps.productMediaDao.findByProductId(product.id)
        return { ...product, media }
      }),
    )
  }

  async getProductCount(
    shopId: string,
    opts?: { status?: 'draft' | 'active' | 'archived'; categoryId?: string; keyword?: string },
  ) {
    return this.deps.productDao.countByShopId(shopId, opts)
  }

  async getProductById(id: string) {
    const product = await this.deps.productDao.findById(id)
    if (!product) throw apiError('PRODUCT_NOT_FOUND', 404)
    return product
  }

  /** Full product detail with media + SKUs */
  async getProductDetail(id: string) {
    const product = await this.getProductById(id)
    const [media, skuList] = await Promise.all([
      this.deps.productMediaDao.findByProductId(id),
      this.deps.skuDao.findByProductId(id),
    ])
    return { ...product, media, skus: skuList }
  }

  /* ───────── Mutation ───────── */

  async createProduct(
    shopId: string,
    data: {
      name: string
      slug: string
      type?: 'physical' | 'entitlement'
      billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
      status?: 'draft' | 'active' | 'archived'
      description?: string
      summary?: string
      basePrice?: number
      specNames?: string[]
      tags?: string[]
      entitlementConfig?: EntitlementConfigInput
      categoryId?: string
      media?: Array<{ type?: string; url: string; thumbnailUrl?: string; position?: number }>
      skus?: Array<{
        specValues?: string[]
        price: number
        stock?: number
        imageUrl?: string
        skuCode?: string
      }>
    },
  ) {
    const { media, skus, ...productData } = data
    const product = await this.deps.productDao.create({ shopId, ...productData })
    if (!product) throw new Error('Failed to create product')

    if (media?.length) {
      for (let i = 0; i < media.length; i++) {
        await this.deps.productMediaDao.create({
          productId: product.id,
          ...media[i]!,
          position: media[i]!.position ?? i,
        })
      }
    }

    if (skus?.length) {
      for (const s of skus) {
        await this.deps.skuDao.create({ productId: product.id, ...s })
      }
    }

    return this.getProductDetail(product.id)
  }

  async updateProduct(
    id: string,
    data: Parameters<ProductDao['update']>[1] & {
      media?: Array<{ type?: string; url: string; thumbnailUrl?: string; position?: number }>
      skus?: Array<{
        id?: string
        specValues?: string[]
        price: number
        stock?: number
        imageUrl?: string
        skuCode?: string
        isActive?: boolean
      }>
    },
  ) {
    const product = await this.deps.productDao.findById(id)
    if (!product) throw apiError('PRODUCT_NOT_FOUND', 404)
    return this.updateProductInShop(product.shopId, id, data)
  }

  async updateProductInShop(
    shopId: string,
    id: string,
    data: Parameters<ProductDao['update']>[1] & {
      media?: Array<{ type?: string; url: string; thumbnailUrl?: string; position?: number }>
      skus?: Array<{
        id?: string
        specValues?: string[]
        price: number
        stock?: number
        imageUrl?: string
        skuCode?: string
        isActive?: boolean
      }>
    },
  ) {
    const product = await this.deps.productDao.findById(id)
    if (!product || product.shopId !== shopId) throw apiError('PRODUCT_NOT_FOUND', 404)
    const { media, skus, ...productData } = data
    await this.deps.productDao.updateByShopIdAndId(shopId, id, productData)

    if (media !== undefined) {
      await this.deps.productMediaDao.deleteByProductId(id)
      for (let i = 0; i < media.length; i++) {
        await this.deps.productMediaDao.create({
          productId: id,
          ...media[i]!,
          position: media[i]!.position ?? i,
        })
      }
    }

    if (skus !== undefined) {
      const retainedSkuIds: string[] = []
      for (const s of skus) {
        if (s.id) {
          const existing = await this.deps.skuDao.findById(s.id)
          if (!existing || existing.productId !== id) {
            throw apiError('SKU_PRODUCT_MISMATCH', 400)
          }
          await this.deps.skuDao.update(s.id, {
            specValues: s.specValues,
            price: s.price,
            stock: s.stock,
            imageUrl: s.imageUrl,
            skuCode: s.skuCode,
            isActive: s.isActive ?? true,
          })
          retainedSkuIds.push(s.id)
          continue
        }

        const created = await this.deps.skuDao.create({
          productId: id,
          specValues: s.specValues,
          price: s.price,
          stock: s.stock,
          imageUrl: s.imageUrl,
          skuCode: s.skuCode,
          isActive: s.isActive ?? true,
        })
        if (created) retainedSkuIds.push(created.id)
      }
      await this.deps.skuDao.deactivateMissing(id, retainedSkuIds)
    }

    return this.getProductDetail(id)
  }

  async deleteProduct(id: string) {
    const product = await this.deps.productDao.findById(id)
    if (!product) throw apiError('PRODUCT_NOT_FOUND', 404)
    return this.deleteProductInShop(product.shopId, id)
  }

  async deleteProductInShop(shopId: string, id: string) {
    const product = await this.deps.productDao.findById(id)
    if (!product || product.shopId !== shopId) throw apiError('PRODUCT_NOT_FOUND', 404)
    return this.deps.productDao.deleteByShopIdAndId(shopId, id)
  }

  /** Called by OrderService after purchase */
  async incrementSalesCount(productId: string, qty: number) {
    return this.deps.productDao.incrementSalesCount(productId, qty)
  }

  /** Called by ReviewService after new review */
  async updateRatingStats(productId: string, avgRating: number, ratingCount: number) {
    return this.deps.productDao.updateRatingStats(productId, avgRating, ratingCount)
  }

  /** Get SKU by ID — used by OrderService for price/stock validation */
  async getSkuById(skuId: string) {
    return this.deps.skuDao.findById(skuId)
  }

  /** Decrement stock — used by OrderService */
  async decrementSkuStock(skuId: string, qty: number) {
    return this.deps.skuDao.decrementStock(skuId, qty)
  }

  /** Get first media image for a product — used by OrderService for order snapshot */
  async getProductFirstImage(productId: string) {
    const media = await this.deps.productMediaDao.findByProductId(productId)
    return media[0]?.url ?? null
  }
}
