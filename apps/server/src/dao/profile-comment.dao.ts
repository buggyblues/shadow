import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { profileCommentReactions, profileComments, users } from '../db/schema'

export interface CommentWithAuthor {
  id: string
  profileUserId: string
  authorId: string
  content: string
  parentId: string | null
  createdAt: Date
  updatedAt: Date
  author: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
  }
  reactions: Array<{
    emoji: string
    count: number
    reacted: boolean
  }>
  replyCount?: number
}

export class ProfileCommentDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findByProfileUserId(
    profileUserId: string,
    currentUserId: string | null,
    limit = 20,
    offset = 0,
  ): Promise<CommentWithAuthor[]> {
    // Get top-level comments (no parent)
    const comments = await this.db
      .select({
        id: profileComments.id,
        profileUserId: profileComments.profileUserId,
        authorId: profileComments.authorId,
        content: profileComments.content,
        parentId: profileComments.parentId,
        createdAt: profileComments.createdAt,
        updatedAt: profileComments.updatedAt,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          isBot: users.isBot,
        },
      })
      .from(profileComments)
      .innerJoin(users, eq(profileComments.authorId, users.id))
      .where(
        and(eq(profileComments.profileUserId, profileUserId), isNull(profileComments.parentId)),
      )
      .orderBy(desc(profileComments.createdAt))
      .limit(limit)
      .offset(offset)

    if (comments.length === 0) return []

    const commentIds = comments.map((c) => c.id)

    // Get reaction counts
    const reactionCounts = await this.db
      .select({
        commentId: profileCommentReactions.commentId,
        emoji: profileCommentReactions.emoji,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(profileCommentReactions)
      .where(inArray(profileCommentReactions.commentId, commentIds))
      .groupBy(profileCommentReactions.commentId, profileCommentReactions.emoji)

    // Get current user's reactions
    let userReactions: Array<{ commentId: string; emoji: string }> = []
    if (currentUserId) {
      userReactions = await this.db
        .select({
          commentId: profileCommentReactions.commentId,
          emoji: profileCommentReactions.emoji,
        })
        .from(profileCommentReactions)
        .where(
          and(
            inArray(profileCommentReactions.commentId, commentIds),
            eq(profileCommentReactions.userId, currentUserId),
          ),
        )
    }

    // Get reply counts
    const replyCounts = await this.db
      .select({
        parentId: profileComments.parentId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(profileComments)
      .where(inArray(profileComments.parentId, commentIds))
      .groupBy(profileComments.parentId)

    // Build result
    const reactionMap = new Map<string, Map<string, number>>()
    for (const r of reactionCounts) {
      if (!reactionMap.has(r.commentId)) {
        reactionMap.set(r.commentId, new Map())
      }
      reactionMap.get(r.commentId)!.set(r.emoji, r.count)
    }

    const userReactionSet = new Set(userReactions.map((r) => `${r.commentId}:${r.emoji}`))

    const replyCountMap = new Map<string, number>()
    for (const r of replyCounts) {
      if (r.parentId) {
        replyCountMap.set(r.parentId, r.count)
      }
    }

    return comments.map((c) => {
      const reactions: CommentWithAuthor['reactions'] = []
      const emojiMap = reactionMap.get(c.id)
      if (emojiMap) {
        for (const [emoji, count] of emojiMap) {
          reactions.push({
            emoji,
            count,
            reacted: userReactionSet.has(`${c.id}:${emoji}`),
          })
        }
      }

      return {
        id: c.id,
        profileUserId: c.profileUserId,
        authorId: c.authorId,
        content: c.content,
        parentId: c.parentId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author: {
          id: c.author.id,
          username: c.author.username,
          displayName: c.author.displayName ?? c.author.username,
          avatarUrl: c.author.avatarUrl,
          isBot: c.author.isBot,
        },
        reactions,
        replyCount: replyCountMap.get(c.id) ?? 0,
      }
    })
  }

  async findReplies(
    parentId: string,
    currentUserId: string | null,
    limit = 10,
    offset = 0,
  ): Promise<CommentWithAuthor[]> {
    const comments = await this.db
      .select({
        id: profileComments.id,
        profileUserId: profileComments.profileUserId,
        authorId: profileComments.authorId,
        content: profileComments.content,
        parentId: profileComments.parentId,
        createdAt: profileComments.createdAt,
        updatedAt: profileComments.updatedAt,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          isBot: users.isBot,
        },
      })
      .from(profileComments)
      .innerJoin(users, eq(profileComments.authorId, users.id))
      .where(eq(profileComments.parentId, parentId))
      .orderBy(desc(profileComments.createdAt))
      .limit(limit)
      .offset(offset)

    if (comments.length === 0) return []

    const commentIds = comments.map((c) => c.id)

    // Get reaction counts
    const reactionCounts = await this.db
      .select({
        commentId: profileCommentReactions.commentId,
        emoji: profileCommentReactions.emoji,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(profileCommentReactions)
      .where(inArray(profileCommentReactions.commentId, commentIds))
      .groupBy(profileCommentReactions.commentId, profileCommentReactions.emoji)

    // Get current user's reactions
    let userReactions: Array<{ commentId: string; emoji: string }> = []
    if (currentUserId) {
      userReactions = await this.db
        .select({
          commentId: profileCommentReactions.commentId,
          emoji: profileCommentReactions.emoji,
        })
        .from(profileCommentReactions)
        .where(
          and(
            inArray(profileCommentReactions.commentId, commentIds),
            eq(profileCommentReactions.userId, currentUserId),
          ),
        )
    }

    // Build result
    const reactionMap = new Map<string, Map<string, number>>()
    for (const r of reactionCounts) {
      if (!reactionMap.has(r.commentId)) {
        reactionMap.set(r.commentId, new Map())
      }
      reactionMap.get(r.commentId)!.set(r.emoji, r.count)
    }

    const userReactionSet = new Set(userReactions.map((r) => `${r.commentId}:${r.emoji}`))

    return comments.map((c) => {
      const reactions: CommentWithAuthor['reactions'] = []
      const emojiMap = reactionMap.get(c.id)
      if (emojiMap) {
        for (const [emoji, count] of emojiMap) {
          reactions.push({
            emoji,
            count,
            reacted: userReactionSet.has(`${c.id}:${emoji}`),
          })
        }
      }

      return {
        id: c.id,
        profileUserId: c.profileUserId,
        authorId: c.authorId,
        content: c.content,
        parentId: c.parentId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author: {
          id: c.author.id,
          username: c.author.username,
          displayName: c.author.displayName ?? c.author.username,
          avatarUrl: c.author.avatarUrl,
          isBot: c.author.isBot,
        },
        reactions,
      }
    })
  }

  async create(data: {
    profileUserId: string
    authorId: string
    content: string
    parentId?: string
  }) {
    const result = await this.db
      .insert(profileComments)
      .values({
        profileUserId: data.profileUserId,
        authorId: data.authorId,
        content: data.content,
        parentId: data.parentId ?? null,
      })
      .returning()
    return result[0]
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(profileComments)
      .where(eq(profileComments.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async delete(id: string, authorId: string) {
    const result = await this.db
      .delete(profileComments)
      .where(and(eq(profileComments.id, id), eq(profileComments.authorId, authorId)))
      .returning()
    return result[0] ?? null
  }

  async addReaction(commentId: string, userId: string, emoji: string) {
    try {
      const result = await this.db
        .insert(profileCommentReactions)
        .values({ commentId, userId, emoji })
        .returning()
      return result[0]
    } catch {
      // Unique constraint violation - already reacted
      return null
    }
  }

  async removeReaction(commentId: string, userId: string, emoji: string) {
    const result = await this.db
      .delete(profileCommentReactions)
      .where(
        and(
          eq(profileCommentReactions.commentId, commentId),
          eq(profileCommentReactions.userId, userId),
          eq(profileCommentReactions.emoji, emoji),
        ),
      )
      .returning()
    return result[0] ?? null
  }

  async getReactionStats(profileUserId: string): Promise<Array<{ emoji: string; count: number }>> {
    const result = await this.db
      .select({
        emoji: profileCommentReactions.emoji,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(profileCommentReactions)
      .innerJoin(profileComments, eq(profileCommentReactions.commentId, profileComments.id))
      .where(eq(profileComments.profileUserId, profileUserId))
      .groupBy(profileCommentReactions.emoji)
      .orderBy(desc(sql`count(*)`))

    return result
  }
}
