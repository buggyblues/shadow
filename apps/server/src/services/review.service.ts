import type { ReviewDao } from '../dao/review.dao'
import type { OrderDao } from '../dao/order.dao'
import type { ProductService } from './product.service'

/**
 * ReviewService — manages product reviews and ratings.
 * Validates order ownership and status before allowing reviews.
 * Updates product rating stats after each review.
 */
export class ReviewService {
  constructor(
    private deps: {
      reviewDao: ReviewDao
      orderDao: OrderDao
      productService: ProductService
    },
  ) {}

  async getProductReviews(productId: string, limit = 50, offset = 0) {
    return this.deps.reviewDao.findByProductId(productId, limit, offset)
  }

  async getProductReviewCount(productId: string) {
    return this.deps.reviewDao.countByProductId(productId)
  }

  async createReview(userId: string, orderId: string, productId: string, rating: number, content?: string, images?: string[]) {
    // Verify order belongs to user
    const order = await this.deps.orderDao.findById(orderId)
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 })
    if (order.buyerId !== userId) throw Object.assign(new Error('Not your order'), { status: 403 })
    if (!['delivered', 'completed'].includes(order.status)) {
      throw Object.assign(new Error('Order must be completed before review'), { status: 400 })
    }

    // Check duplicate
    const existing = await this.deps.reviewDao.findByUserAndOrder(userId, orderId)
    if (existing) throw Object.assign(new Error('Already reviewed this order'), { status: 400 })

    const review = await this.deps.reviewDao.create({ productId, orderId, userId, rating, content, images })

    // Update product rating stats
    const stats = await this.deps.reviewDao.getAverageRating(productId)
    await this.deps.productService.updateRatingStats(productId, stats.avgRating, stats.ratingCount)

    return review
  }

  async replyToReview(reviewId: string, reply: string) {
    return this.deps.reviewDao.addReply(reviewId, reply)
  }
}
