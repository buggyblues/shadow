import type { CartDao } from '../dao/cart.dao'
import type { ProductDao, ProductMediaDao, SkuDao } from '../dao/product.dao'

/**
 * CartService — manages shopping cart per user per shop.
 * Enriches cart items with product/sku info for display.
 */
export class CartService {
  constructor(
    private deps: {
      cartDao: CartDao
      productDao: ProductDao
      productMediaDao: ProductMediaDao
      skuDao: SkuDao
    },
  ) {}

  async getCart(userId: string, shopId: string) {
    const items = await this.deps.cartDao.findByUserId(userId, shopId)
    const enriched = await Promise.all(
      items.map(async (item) => {
        const product = await this.deps.productDao.findById(item.productId)
        const sku = item.skuId ? await this.deps.skuDao.findById(item.skuId) : null
        const media = product ? await this.deps.productMediaDao.findByProductId(product.id) : []
        return {
          ...item,
          product: product
            ? { id: product.id, name: product.name, status: product.status, basePrice: product.basePrice, type: product.type }
            : null,
          sku: sku
            ? { id: sku.id, specValues: sku.specValues, price: sku.price, stock: sku.stock, imageUrl: sku.imageUrl }
            : null,
          imageUrl: sku?.imageUrl || media[0]?.url || null,
          unitPrice: sku?.price ?? product?.basePrice ?? 0,
        }
      }),
    )
    return enriched
  }

  async addToCart(userId: string, shopId: string, productId: string, skuId?: string, quantity = 1) {
    // Validate product exists and is active
    const product = await this.deps.productDao.findById(productId)
    if (!product || product.status !== 'active') {
      throw Object.assign(new Error('Product is not available'), { status: 400 })
    }
    if (skuId) {
      const sku = await this.deps.skuDao.findById(skuId)
      if (!sku || !sku.isActive) {
        throw Object.assign(new Error('SKU is not available'), { status: 400 })
      }
    }
    return this.deps.cartDao.upsert({ userId, shopId, productId, skuId, quantity })
  }

  async updateCartItemQuantity(itemId: string, userId: string, quantity: number) {
    if (quantity <= 0) {
      await this.deps.cartDao.delete(itemId, userId)
      return null
    }
    return this.deps.cartDao.updateQuantity(itemId, userId, quantity)
  }

  async removeFromCart(itemId: string, userId: string) {
    return this.deps.cartDao.delete(itemId, userId)
  }

  async clearCart(userId: string, shopId: string) {
    return this.deps.cartDao.clearByShop(userId, shopId)
  }

  async getCartCount(userId: string, shopId: string) {
    return this.deps.cartDao.countByUser(userId, shopId)
  }
}
