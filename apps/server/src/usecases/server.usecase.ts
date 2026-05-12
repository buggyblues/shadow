import type { ServerDao } from '../dao/server.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ServerJoinRequestDao } from '../dao/server-join-request.dao'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { AgentService } from '../services/agent.service'
import type { AgentPolicyService } from '../services/agent-policy.service'
import type { ServerService } from '../services/server.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

function actorUserIdOrSystem(input: SecureUseCaseInput) {
  return input.ctx.actor.kind === 'system'
    ? '00000000-0000-0000-0000-000000000000'
    : input.ctx.actor.userId
}

export class ServerUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      serverService: ServerService
      serverDao: ServerDao
      serverJoinRequestDao: ServerJoinRequestDao
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      agentService: AgentService
      agentPolicyService: AgentPolicyService
    },
  ) {}

  /**
   * Handle a user requesting access to a server.
   * For public servers: adds the user as a member and joins public channels.
   * For private servers: creates/upserts a join request.
   */
  async requestServerAccess(
    input: SecureUseCaseInput & {
      serverId: string
      isPublic: boolean
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'server.requestAccess',
      scope: { kind: 'server', id: input.serverId },
      run: async () => {
        const userId = actorUserIdOrSystem(input)

        if (input.isPublic) {
          await this.deps.serverService.joinPublic(input.serverId, userId)
          return { status: 'approved' as const }
        }

        // Private server — upsert join request
        const request = await this.deps.serverJoinRequestDao.request(
          input.serverId,
          userId,
        )
        return {
          status: 'pending' as const,
          requestId: request.id,
        }
      },
    })
  }

  /**
   * Review a server join request (approve or reject).
   * Only server admins/owners can review. On approval, the user is added as a
   * member and joined to all public channels.
   */
  async reviewServerJoinRequest(
    input: SecureUseCaseInput & {
      requestId: string
      status: 'approved' | 'rejected'
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'server.reviewJoinRequest',
      scope: { kind: 'server', id: input.requestId },
      run: async () => {
        const request =
          await this.deps.serverJoinRequestDao.findById(input.requestId)
        if (!request) {
          throw Object.assign(new Error('Join request not found'), {
            status: 404,
          })
        }

        const server = await this.deps.serverDao.findById(request.serverId)
        if (!server) {
          throw Object.assign(new Error('Server not found'), { status: 404 })
        }

        await this.deps.accessService.requireServerAdmin(
          input.ctx.actor,
          server.id,
        )

        const reviewerId = actorUserIdOrSystem(input)
        const reviewed = await this.deps.serverJoinRequestDao.review(
          input.requestId,
          input.status,
          reviewerId,
        )
        if (!reviewed) {
          throw Object.assign(new Error('Join request not found'), {
            status: 404,
          })
        }

        if (input.status === 'approved') {
          const existingMember = await this.deps.serverDao.getMember(
            server.id,
            request.userId,
          )
          if (!existingMember) {
            await this.deps.serverDao.addMember(
              server.id,
              request.userId,
              'member',
            )
          }
          // Add user to all public channels
          const channels =
            await this.deps.channelDao.findByServerId(server.id)
          const publicChannelIds = channels
            .filter((ch) => !ch.isPrivate)
            .map((ch) => ch.id)
          if (publicChannelIds.length > 0) {
            await this.deps.channelMemberDao.addBulk(
              publicChannelIds,
              request.userId,
            )
          }
        }

        return {
          request: reviewed,
          server,
          userId: request.userId,
          approved: input.status === 'approved',
        }
      },
    })
  }

  /**
   * Add one or more agents to a server as bot members.
   * Requires `assertCanInstallAgentToServer` permission.
   * Each agent is verified to be owned by the caller before being added.
   */
  async addAgentsToServer(
    input: SecureUseCaseInput & {
      serverId: string
      agentIds: string[]
      ownerId: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'server.addAgents',
      scope: { kind: 'server', id: input.serverId },
      run: async () => {
        await this.deps.accessService.assertCanInstallAgentToServer(
          input.ctx.actor,
          input.serverId,
        )

        const added: Array<{
          agentId: string
          userId: string
          ownerId: string
        }> = []
        const failed: Array<{ agentId: string; error: string }> = []
        const uniqueAgentIds = Array.from(new Set(input.agentIds))

        for (const agentId of uniqueAgentIds) {
          try {
            const agent = await this.deps.agentService.getById(agentId)
            if (!agent) {
              failed.push({ agentId, error: 'Agent not found' })
              continue
            }
            if (agent.ownerId !== input.ownerId) {
              failed.push({ agentId, error: 'Not the owner' })
              continue
            }
            const existingMember = await this.deps.serverDao.getMember(
              input.serverId,
              agent.userId,
            )
            if (existingMember) {
              failed.push({
                agentId,
                error: 'Agent is already a server member',
              })
              continue
            }
            await this.deps.serverService.addBotMember(
              input.serverId,
              agent.userId,
            )
            await this.deps.agentPolicyService.ensureServerDefault(
              agentId,
              input.serverId,
            )
            added.push({
              agentId,
              userId: agent.userId,
              ownerId: agent.ownerId,
            })
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'Unknown error'
            failed.push({ agentId, error: msg })
          }
        }

        return { added, failed }
      },
    })
  }
}
