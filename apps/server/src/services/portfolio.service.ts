import type { AttachmentDao } from '../dao/attachment.dao'
import type { PortfolioDao } from '../dao/portfolio.dao'
import type { UserDao } from '../dao/user.dao'
import type { PortfolioStatus, PortfolioVisibility } from '../db/schema/portfolios'

export interface CreatePortfolioInput {
  attachmentId: string
  title?: string
  description?: string
  visibility?: PortfolioVisibility
  tags?: string[]
}

export interface UpdatePortfolioInput {
  title?: string
  description?: string
  visibility?: PortfolioVisibility
  status?: PortfolioStatus
  tags?: string[]
}

export interface PortfolioFilters {
  ownerId?: string
  visibility?: PortfolioVisibility
  status?: PortfolioStatus
  tags?: string[]
  limit?: number
  cursor?: string
}

export class PortfolioService {
  constructor(
    private deps: {
      portfolioDao: PortfolioDao
      userDao: UserDao
      attachmentDao: AttachmentDao
    },
  ) {}

  /**
   * Create portfolio from channel attachment
   * Copies file metadata from attachment
   */
  async createFromAttachment(userId: string, input: CreatePortfolioInput) {
    // Get attachment
    const attachment = await this.deps.attachmentDao.findById(input.attachmentId)
    if (!attachment) {
      throw Object.assign(new Error('Attachment not found'), { status: 404 })
    }

    // Check if already published
    const existing = await this.deps.portfolioDao.findByAttachmentId(input.attachmentId)
    if (existing) {
      throw Object.assign(new Error('Attachment already published to portfolio'), { status: 400 })
    }

    // Create portfolio
    const portfolio = await this.deps.portfolioDao.create({
      ownerId: userId,
      attachmentId: input.attachmentId,
      title: input.title ?? attachment.filename.replace(/\.[^/.]+$/, ''), // Remove extension
      description: input.description,
      fileUrl: attachment.url,
      fileName: attachment.filename,
      fileType: attachment.contentType,
      fileSize: attachment.size,
      fileWidth: attachment.width ?? undefined,
      fileHeight: attachment.height ?? undefined,
      visibility: input.visibility ?? 'public',
      tags: input.tags,
    })

    return this.getWithOwner(portfolio.id, userId)
  }

  /**
   * Auto-publish Buddy attachment
   * Called when Buddy sends a message with attachment
   */
  async autoPublishBuddyAttachment(attachmentId: string, buddyUserId: string) {
    // Check if already published
    const existing = await this.deps.portfolioDao.findByAttachmentId(attachmentId)
    if (existing) {
      return null // Already published, skip
    }

    // Get attachment
    const attachment = await this.deps.attachmentDao.findById(attachmentId)
    if (!attachment) {
      return null
    }

    // Create portfolio automatically
    const portfolio = await this.deps.portfolioDao.create({
      ownerId: buddyUserId,
      attachmentId,
      title: attachment.filename.replace(/\.[^/.]+$/, ''),
      fileUrl: attachment.url,
      fileName: attachment.filename,
      fileType: attachment.contentType,
      fileSize: attachment.size,
      fileWidth: attachment.width ?? undefined,
      fileHeight: attachment.height ?? undefined,
      visibility: 'public',
    })

    return this.getWithOwner(portfolio.id, buddyUserId)
  }

  /**
   * Get portfolio with owner info and user's like/favorite status
   */
  async getWithOwner(portfolioId: string, viewerId?: string) {
    const portfolio = await this.deps.portfolioDao.findByIdWithOwner(portfolioId)
    if (!portfolio) {
      return null
    }

    let isLiked = false
    let isFavorited = false
    if (viewerId) {
      const [like, favorite] = await Promise.all([
        this.deps.portfolioDao.findLike(portfolioId, viewerId),
        this.deps.portfolioDao.findFavorite(portfolioId, viewerId),
      ])
      isLiked = !!like
      isFavorited = !!favorite
    }

    return {
      ...portfolio,
      isLiked,
      isFavorited,
    }
  }

  /**
   * List portfolios with filtering
   */
  async list(filters: PortfolioFilters, viewerId?: string) {
    if (filters.ownerId) {
      // If viewing specific owner's portfolio
      const isOwner = viewerId === filters.ownerId
      const visibility = isOwner ? filters.visibility : 'public'
      const status = isOwner ? filters.status : 'published'

      const result = await this.deps.portfolioDao.findByOwnerId(filters.ownerId, {
        visibility,
        status,
        limit: filters.limit,
        cursor: filters.cursor,
      })

      // Add like/favorite status for viewer
      if (viewerId) {
        const itemsWithStatus = await Promise.all(
          result.items.map(async (item) => {
            const [like, favorite] = await Promise.all([
              this.deps.portfolioDao.findLike(item.id, viewerId),
              this.deps.portfolioDao.findFavorite(item.id, viewerId),
            ])
            return { ...item, isLiked: !!like, isFavorited: !!favorite }
          }),
        )
        return { ...result, items: itemsWithStatus }
      }

      return result
    }

    // Public feed
    const result = await this.deps.portfolioDao.findPublic({
      limit: filters.limit,
      cursor: filters.cursor,
      tags: filters.tags,
    })

    // Add like/favorite status for viewer
    if (viewerId) {
      const itemsWithStatus = await Promise.all(
        result.items.map(async (item) => {
          const [like, favorite] = await Promise.all([
            this.deps.portfolioDao.findLike(item.id, viewerId),
            this.deps.portfolioDao.findFavorite(item.id, viewerId),
          ])
          return { ...item, isLiked: !!like, isFavorited: !!favorite }
        }),
      )
      return { ...result, items: itemsWithStatus }
    }

    return result
  }

  /**
   * Get user's portfolio (public items only for non-owners)
   */
  async getByUserId(userId: string, viewerId?: string) {
    const isOwner = viewerId === userId
    const result = await this.deps.portfolioDao.findByOwnerId(userId, {
      visibility: isOwner ? undefined : 'public',
      status: isOwner ? undefined : 'published',
      limit: 50,
    })

    // Add like/favorite status for viewer
    if (viewerId) {
      const itemsWithStatus = await Promise.all(
        result.items.map(async (item) => {
          const [like, favorite] = await Promise.all([
            this.deps.portfolioDao.findLike(item.id, viewerId),
            this.deps.portfolioDao.findFavorite(item.id, viewerId),
          ])
          return { ...item, isLiked: !!like, isFavorited: !!favorite }
        }),
      )
      return { ...result, items: itemsWithStatus }
    }

    return result
  }

  /**
   * Update portfolio metadata
   */
  async update(portfolioId: string, userId: string, input: UpdatePortfolioInput) {
    const portfolio = await this.deps.portfolioDao.findById(portfolioId)
    if (!portfolio) {
      throw Object.assign(new Error('Portfolio not found'), { status: 404 })
    }

    // Check ownership (or Buddy owner)
    const isOwner = portfolio.ownerId === userId
    if (!isOwner) {
      // Check if user is the Buddy's owner
      const owner = await this.deps.userDao.findById(portfolio.ownerId)
      if (owner?.isBot) {
        // Need to check agent ownership - for now, deny
        throw Object.assign(new Error('Can only edit your own portfolio'), { status: 403 })
      }
      throw Object.assign(new Error('Can only edit your own portfolio'), { status: 403 })
    }

    const _updated = await this.deps.portfolioDao.update(portfolioId, input)
    return this.getWithOwner(portfolioId, userId)
  }

  /**
   * Delete portfolio (owner only)
   */
  async delete(portfolioId: string, userId: string) {
    const portfolio = await this.deps.portfolioDao.findById(portfolioId)
    if (!portfolio) {
      throw Object.assign(new Error('Portfolio not found'), { status: 404 })
    }

    if (portfolio.ownerId !== userId) {
      throw Object.assign(new Error('Can only delete your own portfolio'), { status: 403 })
    }

    await this.deps.portfolioDao.delete(portfolioId)
  }

  /**
   * Increment view count
   */
  async recordView(portfolioId: string) {
    await this.deps.portfolioDao.incrementViewCount(portfolioId)
  }

  /**
   * Get user's favorites
   */
  async getFavorites(userId: string, limit?: number, cursor?: string) {
    const result = await this.deps.portfolioDao.findFavoritesByUser(userId, limit, cursor)
    return result
  }
}
