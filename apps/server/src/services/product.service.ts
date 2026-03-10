import type { ProductDao, ProductMediaDao, SkuDao } from '../dao/product.dao'

type EntitlementConfig = {
  type: 'channel_access' | 'channel_speak' | 'app_access' | 'custom_role' | 'custom'
  targetId?: string
  durationSeconds?: number | null
  privilegeDescription?: string
}

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

  async getProducts(shopId: string, opts?: {
    status?: 'draft' | 'active' | 'archived'
    categoryId?: string
    keyword?: string
    limit?: number
    offset?: number
  }) {
    return this.deps.productDao.findByShopId(shopId, opts)
  }

  async getProductCount(shopId: string, opts?: { status?: 'draft' | 'active' | 'archived'; categoryId?: string; keyword?: string }) {
    return this.deps.productDao.countByShopId(shopId, opts)
  }

  async getProductById(id: string) {
    const product = await this.deps.productDao.findById(id)
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 })
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

  async createProduct(shopId: string, data: {
    name: string
    slug: string
    type?: 'physical' | 'entitlement'
    status?: 'draft' | 'active' | 'archived'
    description?: string
    summary?: string
    basePrice?: number
    specNames?: string[]
    tags?: string[]
    entitlementConfig?: EntitlementConfig
    categoryId?: string
    media?: Array<{ type?: string; url: string; thumbnailUrl?: string; position?: number }>
    skus?: Array<{ specValues?: string[]; price: number; stock?: number; imageUrl?: string; skuCode?: string }>
  }) {
    const { media, skus, ...productData } = data
    const product = await this.deps.productDao.create({ shopId, ...productData })
    if (!product) throw new Error('Failed to create product')

    if (media?.length) {
      for (let i = 0; i < media.length; i++) {
        await this.deps.productMediaDao.create({ productId: product.id, ...media[i]!, position: media[i]!.position ?? i })
      }
    }

    if (skus?.length) {
      for (const s of skus) {
        await this.deps.skuDao.create({ productId: product.id, ...s })
      }
    }

    return this.getProductDetail(product.id)
  }

  async updateProduct(id: string, data: Parameters<ProductDao['update']>[1] & {
    media?: Array<{ type?: string; url: string; thumbnailUrl?: string; position?: number }>
    skus?: Array<{ id?: string; specValues?: string[]; price: number; stock?: number; imageUrl?: string; skuCode?: string; isActive?: boolean }>
  }) {
    const { media, skus, ...productData } = data
    await this.deps.productDao.update(id, productData)

    if (media !== undefined) {
      await this.deps.productMediaDao.deleteByProductId(id)
      for (let i = 0; i < media.length; i++) {
        await this.deps.productMediaDao.create({ productId: id, ...media[i]!, position: media[i]!.position ?? i })
      }
    }

    if (skus !== undefined) {
      await this.deps.skuDao.deleteByProductId(id)
      for (const s of skus) {
        await this.deps.skuDao.create({
          productId: id,
          specValues: s.specValues,
          price: s.price,
          stock: s.stock,
          imageUrl: s.imageUrl,
          skuCode: s.skuCode,
        })
      }
    }

    return this.getProductDetail(id)
  }

  async deleteProduct(id: string) {
    return this.deps.productDao.delete(id)
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
