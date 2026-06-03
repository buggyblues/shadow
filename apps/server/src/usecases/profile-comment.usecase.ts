import type { ProfileCommentDao } from '../dao/profile-comment.dao'
import type { UserDao } from '../dao/user.dao'
import { resolveAvatarUrl, withResolvedAvatarUrl } from '../lib/avatar-url'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { MediaService } from '../services/media.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

export class ProfileCommentUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      profileCommentDao: ProfileCommentDao
      userDao: UserDao
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
    },
  ) {}

  private resolveCommentAuthorAvatars<T extends { author: { avatarUrl: string | null } }>(
    comments: T[],
  ): T[] {
    return comments.map((comment) => ({
      ...comment,
      author: {
        ...comment.author,
        avatarUrl: resolveAvatarUrl(this.deps.mediaService, comment.author.avatarUrl),
      },
    }))
  }

  async findByProfileUserId(
    input: SecureUseCaseInput & {
      profileUserId: string
      limit?: number
      offset?: number
    },
  ) {
    const currentUserId = input.ctx.actor.kind === 'user' ? input.ctx.actor.userId : null
    return this.resolveCommentAuthorAvatars(
      await this.deps.profileCommentDao.findByProfileUserId(
        input.profileUserId,
        currentUserId,
        input.limit ?? 20,
        input.offset ?? 0,
      ),
    )
  }

  async getReactionStats(input: SecureUseCaseInput & { profileUserId: string }) {
    return this.deps.profileCommentDao.getReactionStats(input.profileUserId)
  }

  async findReplies(
    input: SecureUseCaseInput & {
      parentId: string
      limit?: number
      offset?: number
    },
  ) {
    const currentUserId = input.ctx.actor.kind === 'user' ? input.ctx.actor.userId : null
    return this.resolveCommentAuthorAvatars(
      await this.deps.profileCommentDao.findReplies(
        input.parentId,
        currentUserId,
        input.limit ?? 10,
        input.offset ?? 0,
      ),
    )
  }

  async createComment(
    input: SecureUseCaseInput & {
      profileUserId: string
      content: string
      parentId?: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'profileComment.create',
      run: async () => {
        const profileUser = await this.deps.userDao.findById(input.profileUserId)
        if (!profileUser) {
          return { ok: false as const, error: 'Profile user not found' }
        }

        if (input.parentId) {
          const parentComment = await this.deps.profileCommentDao.findById(input.parentId)
          if (!parentComment) {
            return { ok: false as const, error: 'Parent comment not found' }
          }
          if (parentComment.profileUserId !== input.profileUserId) {
            return { ok: false as const, error: 'Parent comment does not belong to this profile' }
          }
        }

        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        const comment = await this.deps.profileCommentDao.create({
          profileUserId: input.profileUserId,
          authorId: userId,
          content: input.content,
          parentId: input.parentId,
        })
        return { ok: true as const, comment }
      },
    })
  }

  async deleteComment(input: SecureUseCaseInput & { id: string }) {
    return auditUseCase(this.deps, input, {
      action: 'profileComment.delete',
      resource: { kind: 'profileComment', id: input.id },
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        const deleted = await this.deps.profileCommentDao.delete(input.id, userId)
        if (!deleted) {
          return { ok: false as const, error: 'Comment not found or not authorized' }
        }
        return { ok: true as const }
      },
    })
  }

  async findCommentById(input: SecureUseCaseInput & { id: string }) {
    return this.deps.profileCommentDao.findById(input.id)
  }

  async addReaction(
    input: SecureUseCaseInput & {
      commentId: string
      emoji: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'profileComment.reaction.add',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        const comment = await this.deps.profileCommentDao.findById(input.commentId)
        if (!comment) {
          return { ok: false as const, error: 'Comment not found' }
        }
        const reaction = await this.deps.profileCommentDao.addReaction(
          input.commentId,
          userId,
          input.emoji,
        )
        if (!reaction) {
          return { ok: false as const, error: 'Already reacted with this emoji' }
        }
        return { ok: true as const, reaction }
      },
    })
  }

  async removeReaction(
    input: SecureUseCaseInput & {
      commentId: string
      emoji: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'profileComment.reaction.remove',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        const deleted = await this.deps.profileCommentDao.removeReaction(
          input.commentId,
          userId,
          input.emoji,
        )
        if (!deleted) {
          return { ok: false as const, error: 'Reaction not found' }
        }
        return { ok: true as const }
      },
    })
  }

  async getUserById(input: SecureUseCaseInput & { userId: string }) {
    const user = await this.deps.userDao.findById(input.userId)
    return user ? withResolvedAvatarUrl(this.deps.mediaService, user) : null
  }
}
