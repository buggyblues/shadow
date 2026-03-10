import { nanoid } from 'nanoid'
import type { OrderDao } from '../dao/order.dao'
import type { ProductService } from './product.service'
import type { WalletService } from './wallet.service'
import type { EntitlementService } from './entitlement.service'
import type { CartService } from './cart.service'
import type { ShopService } from './shop.service'

/**
 * OrderService — orchestrates order lifecycle.
 * Coordinates between Product, Wallet, Entitlement, and Cart services.
 */
export class OrderService {
  constructor(
    private deps: {
      orderDao: OrderDao
      productService: ProductService
      walletService: WalletService
      entitlementService: EntitlementService
      cartService: CartService
      shopService: ShopService
    },
  ) {}

  /* ───────── Create Order ───────── */

  async createOrder(
    buyerId: string,
    shopId: string,
    items: Array<{ productId: string; skuId?: string; quantity: number }>,
    buyerNote?: string,
  ) {
    if (items.length === 0) throw Object.assign(new Error('Cart is empty'), { status: 400 })

    // 1. Validate items and calculate total
    let totalAmount = 0
    const orderItemsData: Array<{
      orderId: string
      productId: string
      skuId?: string
      productName: string
      specValues: string[]
      price: number
      quantity: number
      imageUrl?: string
    }> = []

    for (const item of items) {
      const product = await this.deps.productService.getProductById(item.productId)
      if (product.status !== 'active') {
        throw Object.assign(new Error(`Product "${product.name}" is not available`), { status: 400 })
      }

      let price = product.basePrice
      let specValues: string[] = []
      let imageUrl: string | undefined

      if (item.skuId) {
        const sku = await this.deps.productService.getSkuById(item.skuId)
        if (!sku || !sku.isActive) {
          throw Object.assign(new Error(`SKU ${item.skuId} is not available`), { status: 400 })
        }
        if (sku.stock < item.quantity) {
          throw Object.assign(new Error(`Insufficient stock for "${product.name}"`), { status: 400 })
        }
        price = sku.price
        specValues = (sku.specValues as string[]) || []
        imageUrl = sku.imageUrl ?? undefined
      }

      if (!imageUrl) {
        imageUrl = (await this.deps.productService.getProductFirstImage(product.id)) ?? undefined
      }

      totalAmount += price * item.quantity
      orderItemsData.push({
        orderId: '', // set after order creation
        productId: product.id,
        skuId: item.skuId,
        productName: product.name,
        specValues,
        price,
        quantity: item.quantity,
        imageUrl,
      })
    }

    // 2. Generate order number
    const orderNo = `SH${Date.now().toString(36).toUpperCase()}${nanoid(6).toUpperCase()}`

    // 3. Create the order
    const order = await this.deps.orderDao.create({ orderNo, shopId, buyerId, totalAmount, buyerNote })
    if (!order) throw new Error('Failed to create order')

    // 4. Create order items (snapshot)
    const itemsWithOrderId = orderItemsData.map((i) => ({ ...i, orderId: order.id }))
    await this.deps.orderDao.createItems(itemsWithOrderId)

    // 5. Debit wallet
    await this.deps.walletService.debit(
      buyerId,
      totalAmount,
      order.id,
      'order',
      `购买商品 - 订单 ${orderNo}`,
    )

    // 6. Mark order as paid
    await this.deps.orderDao.update(order.id, { status: 'paid', paidAt: new Date() })

    // 7. Decrement stock
    for (const item of items) {
      if (item.skuId) {
        await this.deps.productService.decrementSkuStock(item.skuId, item.quantity)
      }
    }

    // 8. Increment sales count
    for (const item of items) {
      await this.deps.productService.incrementSalesCount(item.productId, item.quantity)
    }

    // 9. Provision entitlements for entitlement-type products
    for (const item of items) {
      const product = await this.deps.productService.getProductById(item.productId)
      if (product.type === 'entitlement' && product.entitlementConfig) {
        const config = product.entitlementConfig
        const shop = await this.deps.shopService.getShopById(shopId)
        if (shop) {
          const expiresAt = config.durationSeconds
            ? new Date(Date.now() + config.durationSeconds * 1000)
            : undefined
          await this.deps.entitlementService.grantEntitlement({
            userId: buyerId,
            serverId: shop.serverId,
            orderId: order.id,
            productId: product.id,
            type: config.type,
            targetId: config.targetId,
            expiresAt,
          })
        }
      }
    }

    // 10. Clear user's cart for this shop
    await this.deps.cartService.clearCart(buyerId, shopId)

    return this.getOrderDetail(order.id)
  }

  /* ───────── Query ───────── */

  async getOrderDetail(orderId: string) {
    const order = await this.deps.orderDao.findById(orderId)
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 })
    const items = await this.deps.orderDao.getItems(orderId)
    return { ...order, items }
  }

  async getMyOrders(userId: string, opts?: { status?: string; limit?: number; offset?: number }) {
    const orderList = await this.deps.orderDao.findByBuyerId(userId, opts)
    return Promise.all(
      orderList.map(async (o) => {
        const items = await this.deps.orderDao.getItems(o.id)
        return { ...o, items }
      }),
    )
  }

  async getShopOrders(shopId: string, opts?: { status?: string; limit?: number; offset?: number }) {
    const orderList = await this.deps.orderDao.findByShopId(shopId, opts)
    return Promise.all(
      orderList.map(async (o) => {
        const items = await this.deps.orderDao.getItems(o.id)
        return { ...o, items }
      }),
    )
  }

  async getShopOrderCount(shopId: string, opts?: { status?: string }) {
    return this.deps.orderDao.countByShopId(shopId, opts)
  }

  /* ───────── Status Transitions ───────── */

  async updateOrderStatus(
    orderId: string,
    status: 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded',
    extra?: { trackingNo?: string; sellerNote?: string },
  ) {
    const timestamps: Record<string, Date> = {}
    if (status === 'shipped') timestamps.shippedAt = new Date()
    if (status === 'completed') timestamps.completedAt = new Date()
    if (status === 'cancelled') timestamps.cancelledAt = new Date()
    return this.deps.orderDao.update(orderId, { status, ...extra, ...timestamps } as Parameters<OrderDao['update']>[1])
  }

  async cancelOrder(orderId: string, userId: string) {
    const order = await this.deps.orderDao.findById(orderId)
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 })
    if (order.buyerId !== userId) throw Object.assign(new Error('Not your order'), { status: 403 })
    if (!['pending', 'paid'].includes(order.status)) {
      throw Object.assign(new Error('Order cannot be cancelled'), { status: 400 })
    }

    // Refund to wallet
    if (order.status === 'paid') {
      await this.deps.walletService.refund(
        userId,
        order.totalAmount,
        orderId,
        'order',
        `退款 - 订单 ${order.orderNo}`,
      )
      // Revoke any entitlements granted by this order
      await this.deps.entitlementService.revokeByOrder(orderId)
    }

    return this.deps.orderDao.update(orderId, { status: 'cancelled', cancelledAt: new Date() })
  }
}
