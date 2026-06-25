import type { AgentDao } from '../dao/agent.dao'
import type { ServerDao } from '../dao/server.dao'
import type { UserDao } from '../dao/user.dao'
import { logger } from '../lib/logger'
import { getRedisClient, presenceKeys } from '../lib/redis'
import type { AccessService } from '../security/access.service'
import type { Actor } from '../security/actor'
import { actorUserId } from '../security/actor'
import { getBuddyMode } from '../services/buddy-policy'
import type { MediaService } from '../services/media.service'
import type { TaskCenterService } from '../services/task-center.service'
import type { WalletService } from '../services/wallet.service'

async function resolveLiveUserStatus(
  userId: string,
  fallback: 'online' | 'idle' | 'dnd' | 'offline',
): Promise<'online' | 'idle' | 'dnd' | 'offline'> {
  try {
    const redis = await getRedisClient()
    if (!redis) return fallback
    const sockets = await redis.sCard(presenceKeys.onlineSockets(userId))
    if (sockets <= 0) return fallback
    return fallback === 'idle' || fallback === 'dnd' ? fallback : 'online'
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to resolve live user presence')
    return fallback
  }
}

async function resolveCurrentActivity(userId: string): Promise<string | null> {
  try {
    const redis = await getRedisClient()
    if (!redis) return null
    const raw = await redis.get(presenceKeys.userActivity(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { activity?: unknown }
    return typeof parsed.activity === 'string' ? parsed.activity : null
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to resolve current user activity')
    return null
  }
}

export class AuthUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      userDao: UserDao
      agentDao: AgentDao
      serverDao: ServerDao
      mediaService: MediaService
      walletService: WalletService
      taskCenterService: TaskCenterService
    },
  ) {}

  async getUserPublicProfile(actor: Actor, targetUserId: string) {
    const { userDao, agentDao, mediaService } = this.deps
    const viewerUserId = actorUserId(actor)

    const user = await userDao.findById(targetUserId)
    if (!user) return null

    // If the user is a bot, also return agent info + owner profile
    let agent: {
      id: string
      ownerId: string | null
      status: string
      lastHeartbeat: string | null
      totalOnlineSeconds: number
      currentActivity?: string | null
      config: { description?: string }
    } | null = null
    let ownerProfile: {
      id: string
      username: string
      displayName: string
      avatarUrl: string | null
    } | null = null
    if (user.isBot) {
      const foundAgent = await agentDao.findByUserId(user.id)
      if (
        foundAgent &&
        getBuddyMode(foundAgent.config) === 'private' &&
        viewerUserId !== foundAgent.ownerId &&
        viewerUserId !== foundAgent.userId
      ) {
        return null
      }
      if (foundAgent?.ownerId) {
        const owner = await userDao.findById(foundAgent.ownerId)
        if (owner) {
          ownerProfile = {
            id: owner.id,
            username: owner.username,
            displayName: owner.displayName ?? owner.username,
            avatarUrl: mediaService.resolveAvatarUrl(owner.avatarUrl),
          }
        }
      }
      if (foundAgent) {
        agent = {
          id: foundAgent.id,
          ownerId: foundAgent.ownerId,
          status: foundAgent.status,
          lastHeartbeat: foundAgent.lastHeartbeat?.toISOString() ?? null,
          totalOnlineSeconds: foundAgent.totalOnlineSeconds ?? 0,
          currentActivity: await resolveCurrentActivity(user.id),
          config: {
            description: (foundAgent.config as Record<string, unknown>)?.description as
              | string
              | undefined,
          },
        }
      }
    }

    // If the user is a regular user, return their owned agents
    let ownedAgents: Array<{
      id: string
      userId: string
      status: string
      lastHeartbeat: string | null
      totalOnlineSeconds: number
      currentActivity?: string | null
      botUser?: {
        id: string
        username: string
        displayName: string
        avatarUrl: string | null
      }
    }> = []
    if (!user.isBot) {
      const agents = await agentDao.findByOwnerId(user.id)
      ownedAgents = await Promise.all(
        agents
          .filter((a) => viewerUserId === user.id || getBuddyMode(a.config) !== 'private')
          .map(async (a) => {
            const botUser = await userDao.findById(a.userId)
            return {
              id: a.id,
              userId: a.userId,
              status: a.status,
              lastHeartbeat: a.lastHeartbeat?.toISOString() ?? null,
              totalOnlineSeconds: a.totalOnlineSeconds ?? 0,
              currentActivity: await resolveCurrentActivity(a.userId),
              botUser: botUser
                ? {
                    id: botUser.id,
                    username: botUser.username,
                    displayName: botUser.displayName ?? botUser.username,
                    avatarUrl: mediaService.resolveAvatarUrl(botUser.avatarUrl),
                  }
                : undefined,
            }
          }),
      )
    }

    const status = await resolveLiveUserStatus(user.id, user.status)

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? user.username,
      avatarUrl: mediaService.resolveAvatarUrl(user.avatarUrl),
      isBot: user.isBot,
      status,
      createdAt: user.createdAt,
      agent: agent ?? undefined,
      ownerProfile,
      ownedAgents,
    }
  }

  async getDashboard(actor: Actor) {
    const userId = actorUserId(actor)
    const { userDao, serverDao, agentDao, walletService, taskCenterService } = this.deps

    // Parallel queries for performance
    const [userServers, agents, wallet, taskCenter, referral, userInfo] = await Promise.all([
      serverDao.findByUserId(userId),
      agentDao.findByOwnerId(userId),
      walletService.getOrCreateWallet(userId).catch(() => ({ balance: 0 })),
      taskCenterService.getTaskCenter(userId).catch(() => ({
        summary: { totalTasks: 0, claimableTasks: 0, completedTasks: 0 },
      })),
      taskCenterService
        .getReferralSummary(userId)
        .catch(() => ({ successfulInvites: 0, totalInviteRewards: 0 })),
      userDao.findById(userId),
    ])

    const serversOwned = userServers.filter(
      (s: { member: { role: string } }) => s.member.role === 'owner',
    ).length
    const serversJoined = userServers.length

    // Buddy total online time
    const totalBuddyOnlineSeconds = agents.reduce(
      (sum: number, a: { totalOnlineSeconds: number | null }) => sum + (a.totalOnlineSeconds ?? 0),
      0,
    )

    return {
      serversOwned,
      serversJoined,
      buddyCount: agents.length,
      buddyOnlineHours: Math.round(totalBuddyOnlineSeconds / 3600),
      walletBalance: (wallet as { balance: number }).balance ?? 0,
      tasksCompleted:
        (taskCenter as { summary: { completedTasks: number } }).summary?.completedTasks ?? 0,
      tasksTotal: (taskCenter as { summary: { totalTasks: number } }).summary?.totalTasks ?? 0,
      referralCount: (referral as { successfulInvites: number }).successfulInvites ?? 0,
      referralRewards: (referral as { totalInviteRewards: number }).totalInviteRewards ?? 0,
      memberSince: (userInfo as { createdAt: string } | null)?.createdAt ?? null,
    }
  }
}
