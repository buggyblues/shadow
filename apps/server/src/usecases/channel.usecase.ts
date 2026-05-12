import type { ServerDao } from '../dao/server.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ChannelJoinRequestDao } from '../dao/channel-join-request.dao'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { ChannelService } from '../services/channel.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

function actorUserIdOrSystem(input: SecureUseCaseInput) {
  return input.ctx.actor.kind === 'system'
    ? '00000000-0000-0000-0000-000000000000'
    : input.ctx.actor.userId
}

export class ChannelUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      channelService: ChannelService
      serverDao: ServerDao
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      channelJoinRequestDao: ChannelJoinRequestDao
    },
  ) {}

  /**
   * Handle a user requesting access to a channel.
   * For non-private channels: adds the user as a member directly.
   * For private channels: creates/upserts a join request.
   */
  async requestChannelAccess(
    input: SecureUseCaseInput & {
      channelId: string
      isPrivate: boolean
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'channel.requestAccess',
      scope: { kind: 'channel', id: input.channelId },
      run: async () => {
        const userId = actorUserIdOrSystem(input)

        if (!input.isPrivate) {
          await this.deps.channelService.addMember(input.channelId, userId)
          return { status: 'approved' as const }
        }

        // Private channel — check for existing pending request first
        const existing =
          await this.deps.channelJoinRequestDao.findByChannelAndUser(
            input.channelId,
            userId,
          )
        const isNewRequest = existing?.status !== 'pending'
        const request =
          existing?.status === 'pending'
            ? existing
            : await this.deps.channelJoinRequestDao.request(
                input.channelId,
                userId,
              )
        return {
          status: 'pending' as const,
          requestId: request.id,
          isNewRequest,
        }
      },
    })
  }

  /**
   * Review a channel join request (approve or reject).
   * Only server admins/owners or current channel members can review.
   * On approval, the requesting user is added as a channel member.
   */
  async reviewChannelJoinRequest(
    input: SecureUseCaseInput & {
      requestId: string
      status: 'approved' | 'rejected'
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'channel.reviewJoinRequest',
      scope: { kind: 'channel', id: input.requestId },
      run: async () => {
        const request =
          await this.deps.channelJoinRequestDao.findById(input.requestId)
        if (!request) {
          throw Object.assign(new Error('Join request not found'), {
            status: 404,
          })
        }

        const channel =
          await this.deps.channelService.getById(request.channelId)
        if (channel.kind !== 'server' || !channel.serverId) {
          throw Object.assign(
            new Error('This operation only supports server channels'),
            { status: 400 },
          )
        }
        const serverId = channel.serverId

        // Determine authorization: server admin/owners and channel members can review
        const userId = actorUserIdOrSystem(input)
        const [requesterServerMember, requesterChannelMember] =
          await Promise.all([
            this.deps.serverDao.getMember(serverId, userId),
            this.deps.channelMemberDao.get(channel.id, userId),
          ])

        const canManage =
          requesterServerMember?.role === 'owner' ||
          requesterServerMember?.role === 'admin'
        if (!canManage && !requesterChannelMember) {
          throw Object.assign(
            new Error('Not authorized to review this request'),
            { status: 403 },
          )
        }

        const reviewed = await this.deps.channelJoinRequestDao.review(
          input.requestId,
          input.status,
          userId,
        )
        if (!reviewed) {
          throw Object.assign(new Error('Join request not found'), {
            status: 404,
          })
        }

        if (input.status === 'approved') {
          await this.deps.channelService.addMember(
            channel.id,
            request.userId,
          )
        }

        return {
          request: reviewed,
          channel,
          serverId,
          userId: request.userId,
          approved: input.status === 'approved',
        }
      },
    })
  }

  /**
   * Add a member to a channel. For non-self-join (invites), the requester
   * must already be a channel member or a server admin/owner.
   */
  async addChannelMember(
    input: SecureUseCaseInput & {
      channelId: string
      targetUserId: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'channel.addMember',
      scope: { kind: 'channel', id: input.channelId },
      resource: { kind: 'channel', id: input.channelId },
      run: async () => {
        const requesterUserId = actorUserIdOrSystem(input)
        const isSelfJoin = requesterUserId === input.targetUserId

        if (!isSelfJoin) {
          const channel =
            await this.deps.channelService.getById(input.channelId)
          if (channel.kind !== 'server' || !channel.serverId) {
            throw Object.assign(
              new Error(
                'This operation only supports server channels',
              ),
              { status: 400 },
            )
          }
          const serverId = channel.serverId
          const [requesterServerMember, requesterChannelMember] =
            await Promise.all([
              this.deps.serverDao.getMember(serverId, requesterUserId),
              this.deps.channelMemberDao.get(
                input.channelId,
                requesterUserId,
              ),
            ])

          const canManage =
            requesterServerMember?.role === 'owner' ||
            requesterServerMember?.role === 'admin'
          if (!requesterChannelMember && !canManage) {
            throw Object.assign(
              new Error('Only channel members can invite others'),
              { status: 403 },
            )
          }
        }

        await this.deps.channelService.addMember(
          input.channelId,
          input.targetUserId,
        )
      },
    })
  }
}
