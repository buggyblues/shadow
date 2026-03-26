import type { PortfolioDao } from '../dao/portfolio.dao'
import type { UserDao } from '../dao/user.dao'

export interface CreateCommentInput {
  content: string
  parentId?: string
}

export class PortfolioSocialService {
  constructor(
    private deps: {
      portfolioDao: PortfolioDao
      userDao: UserDao
    },
  ) {}

  // ============ Likes ============

  /**
   * Like a portfolio item
   */
  async like(portfolioId: string, userId: string) {
    // Check if already liked
    const existing = await this.deps.portfolioDao.findLike(portfolioId, userId)
    if (existing) {
      return { alreadyLiked: true }
    }

    // Add like
    await this.deps.portfolioDao.addLike(portfolioId, userId)
    await this.deps.portfolioDao.incrementLikeCount(portfolioId)

    return { alreadyLiked: false }
  }

  /**
   * Unlike a portfolio item
   */
  async unlike(portfolioId: string, userId: string) {
    const existing = await this.deps.portfolioDao.findLike(portfolioId, userId)
    if (!existing) {
      return { notLiked: true }
    }

    await this.deps.portfolioDao.removeLike(portfolioId, userId)
    await this.deps.portfolioDao.decrementLikeCount(portfolioId)

    return { notLiked: false }
  }

  /**
   * Toggle like status
   */
  async toggleLike(portfolioId: string, userId: string) {
    const existing = await this.deps.portfolioDao.findLike(portfolioId, userId)
    if (existing) {
      await this.deps.portfolioDao.removeLike(portfolioId, userId)
      await this.deps.portfolioDao.decrementLikeCount(portfolioId)
      return { liked: false }
    } else {
      await this.deps.portfolioDao.addLike(portfolioId, userId)
      await this.deps.portfolioDao.incrementLikeCount(portfolioId)
      return { liked: true }
    }
  }

  /**
   * Check if user liked
   */
  async isLiked(portfolioId: string, userId: string) {
    const like = await this.deps.portfolioDao.findLike(portfolioId, userId)
    return !!like
  }

  // ============ Favorites ============

  /**
   * Favorite/bookmark a portfolio item
   */
  async favorite(portfolioId: string, userId: string) {
    const existing = await this.deps.portfolioDao.findFavorite(portfolioId, userId)
    if (existing) {
      return { alreadyFavorited: true }
    }

    await this.deps.portfolioDao.addFavorite(portfolioId, userId)
    await this.deps.portfolioDao.incrementFavoriteCount(portfolioId)

    return { alreadyFavorited: false }
  }

  /**
   * Unfavorite
   */
  async unfavorite(portfolioId: string, userId: string) {
    const existing = await this.deps.portfolioDao.findFavorite(portfolioId, userId)
    if (!existing) {
      return { notFavorited: true }
    }

    await this.deps.portfolioDao.removeFavorite(portfolioId, userId)
    await this.deps.portfolioDao.decrementFavoriteCount(portfolioId)

    return { notFavorited: false }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(portfolioId: string, userId: string) {
    const existing = await this.deps.portfolioDao.findFavorite(portfolioId, userId)
    if (existing) {
      await this.deps.portfolioDao.removeFavorite(portfolioId, userId)
      await this.deps.portfolioDao.decrementFavoriteCount(portfolioId)
      return { favorited: false }
    } else {
      await this.deps.portfolioDao.addFavorite(portfolioId, userId)
      await this.deps.portfolioDao.incrementFavoriteCount(portfolioId)
      return { favorited: true }
    }
  }

  /**
   * Check if user favorited
   */
  async isFavorited(portfolioId: string, userId: string) {
    const favorite = await this.deps.portfolioDao.findFavorite(portfolioId, userId)
    return !!favorite
  }

  // ============ Comments ============

  /**
   * Add comment
   */
  async addComment(portfolioId: string, userId: string, input: CreateCommentInput) {
    // Validate parent comment if provided
    if (input.parentId) {
      const parent = await this.deps.portfolioDao.findCommentById(input.parentId)
      if (!parent) {
        throw Object.assign(new Error('Parent comment not found'), { status: 404 })
      }
      if (parent.portfolioId !== portfolioId) {
        throw Object.assign(new Error('Parent comment belongs to different portfolio'), {
          status: 400,
        })
      }
    }

    const comment = await this.deps.portfolioDao.createComment({
      portfolioId,
      userId,
      parentId: input.parentId,
      content: input.content,
    })

    await this.deps.portfolioDao.incrementCommentCount(portfolioId)

    // Get author info
    const user = await this.deps.userDao.findById(userId)
    return {
      ...comment,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isBot: user.isBot,
          }
        : null,
    }
  }

  /**
   * Delete comment (author only)
   */
  async deleteComment(commentId: string, userId: string) {
    const comment = await this.deps.portfolioDao.findCommentById(commentId)
    if (!comment) {
      throw Object.assign(new Error('Comment not found'), { status: 404 })
    }

    if (comment.userId !== userId) {
      throw Object.assign(new Error('Can only delete your own comments'), { status: 403 })
    }

    await this.deps.portfolioDao.deleteComment(commentId)
    await this.deps.portfolioDao.decrementCommentCount(comment.portfolioId)
  }

  /**
   * Edit comment
   */
  async editComment(commentId: string, userId: string, content: string) {
    const comment = await this.deps.portfolioDao.findCommentById(commentId)
    if (!comment) {
      throw Object.assign(new Error('Comment not found'), { status: 404 })
    }

    if (comment.userId !== userId) {
      throw Object.assign(new Error('Can only edit your own comments'), { status: 403 })
    }

    const updated = await this.deps.portfolioDao.updateComment(commentId, content)
    return updated
  }

  /**
   * List comments with replies
   */
  async listComments(portfolioId: string, options?: { cursor?: string; limit?: number }) {
    const result = await this.deps.portfolioDao.findCommentsByPortfolioId(portfolioId, options)

    // For each top-level comment, fetch its replies
    const itemsWithReplies = await Promise.all(
      result.items.map(async (item) => {
        if (item.parentId) {
          // This is a reply, don't fetch nested replies for now
          return { ...item, replies: [] }
        }
        // Fetch replies for top-level comments
        const replies = await this.deps.portfolioDao.findReplies(item.id)
        return { ...item, replies }
      }),
    )

    return { ...result, items: itemsWithReplies }
  }
}
