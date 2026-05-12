import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentListingDao } from '../dao/agent-listing.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { RentalContractDao } from '../dao/rental-contract.dao'
import type { TaskCenterDao } from '../dao/task-center.dao'
import type { WalletDao } from '../dao/wallet.dao'
import type { Database } from '../db'
import { channels, messages, products, servers, shops } from '../db/schema'
import { userRewardLogs } from '../db/schema/task-center'
import type { LedgerService } from './ledger.service'

export type TaskType = 'one_time' | 'repeatable'

export type TaskDefinition = {
  key: string
  title: string
  description: string
  reward: number
  type: TaskType
}

const TASKS: TaskDefinition[] = [
  {
    key: 'create_server',
    title: '创建第一个服务器',
    description: '创建任意服务器后可领取 200 虾币',
    reward: 200,
    type: 'one_time',
  },
  {
    key: 'create_channel',
    title: '创建第一个频道',
    description: '在你拥有的服务器中新增频道后可领取 120 虾币',
    reward: 120,
    type: 'one_time',
  },
  {
    key: 'first_message',
    title: '首次发言',
    description: '发送第一条消息后可领取 80 虾币',
    reward: 80,
    type: 'one_time',
  },
  {
    key: 'create_buddy',
    title: '创建 Buddy',
    description: '创建你的第一个 Buddy 可领取 150 虾币',
    reward: 150,
    type: 'one_time',
  },
  {
    key: 'list_buddy',
    title: '挂单 Buddy',
    description: '发布第一个 Buddy 挂单可领取 200 虾币',
    reward: 200,
    type: 'one_time',
  },
  {
    key: 'rent_buddy',
    title: '租赁 Buddy',
    description: '完成首次 Buddy 租赁可领取 180 虾币',
    reward: 180,
    type: 'one_time',
  },
  {
    key: 'list_product',
    title: '上架第一个商品',
    description: '创建并上架第一个商品可领取 220 虾币',
    reward: 220,
    type: 'one_time',
  },
  {
    key: 'invite_signup',
    title: '邀请好友注册',
    description: '每邀请 1 位好友完成注册，你和好友各得 500 虾币',
    reward: 500,
    type: 'repeatable',
  },
]

export class TaskCenterService {
  constructor(
    private deps: {
      db: Database
      taskCenterDao: TaskCenterDao
      walletDao: WalletDao
      ledgerService: LedgerService
      inviteCodeDao: InviteCodeDao
      agentDao: AgentDao
      agentListingDao: AgentListingDao
      rentalContractDao: RentalContractDao
    },
  ) {}

  private async grantReward(data: {
    userId: string
    rewardKey: string
    referenceId?: string | null
    amount: number
    note: string
    metadata?: Record<string, unknown>
    isRepeatable?: boolean
  }) {
    const referenceKey = this.normalizeRewardReferenceKey(data.referenceId)
    return this.deps.db.transaction(async (tx) => {
      const [rewardLog] = await tx
        .insert(userRewardLogs)
        .values({
          userId: data.userId,
          rewardKey: data.rewardKey,
          referenceId: data.referenceId ?? null,
          referenceKey,
          amount: data.amount,
          note: data.note,
          metadata: data.metadata ?? {},
          isRepeatable: data.isRepeatable ?? false,
        })
        .onConflictDoNothing()
        .returning()
      if (!rewardLog) return false

      await this.deps.ledgerService.credit(
        {
          userId: data.userId,
          amount: data.amount,
          type: 'reward',
          referenceId: rewardLog.id,
          referenceType: 'task_reward',
          note: data.note,
        },
        tx,
      )

      return true
    })
  }

  private normalizeRewardReferenceKey(referenceId: string | null | undefined) {
    const trimmed = referenceId?.trim()
    return trimmed ? trimmed : '__none__'
  }

  async grantWelcomeReward(userId: string) {
    return this.grantReward({
      userId,
      rewardKey: 'welcome_signup',
      referenceId: null,
      amount: 1000,
      note: '注册赠送 1000 虾币',
    })
  }

  async grantInviteRewards(inviterId: string, inviteeId: string, inviteCodeId: string) {
    await this.grantReward({
      userId: inviterId,
      rewardKey: 'invite_signup',
      referenceId: inviteCodeId,
      amount: 500,
      note: '邀请好友注册奖励 500 虾币',
      metadata: { inviteeId },
      isRepeatable: true,
    })

    await this.grantReward({
      userId: inviteeId,
      rewardKey: 'invited_signup',
      referenceId: inviteCodeId,
      amount: 500,
      note: '通过邀请注册奖励 500 虾币',
      metadata: { inviterId },
    })
  }

  private async checkTaskCompleted(userId: string, taskKey: string) {
    switch (taskKey) {
      case 'create_server': {
        const owned = await this.deps.db
          .select({ count: sql<number>`count(*)::int` })
          .from(servers)
          .where(eq(servers.ownerId, userId))
        return (owned[0]?.count ?? 0) > 0
      }
      case 'create_channel': {
        const ownedServers = await this.deps.db
          .select({ id: servers.id })
          .from(servers)
          .where(eq(servers.ownerId, userId))
        const serverIds = ownedServers.map((s) => s.id)
        if (serverIds.length === 0) return false
        const channelCount = await this.deps.db
          .select({ count: sql<number>`count(*)::int` })
          .from(channels)
          .where(inArray(channels.serverId, serverIds))
        return (channelCount[0]?.count ?? 0) > serverIds.length
      }
      case 'first_message': {
        const rows = await this.deps.db
          .select({ count: sql<number>`count(*)::int` })
          .from(messages)
          .where(eq(messages.authorId, userId))
        return (rows[0]?.count ?? 0) > 0
      }
      case 'create_buddy': {
        const rows = await this.deps.agentDao.findByOwnerId(userId)
        return rows.length > 0
      }
      case 'list_buddy': {
        const rows = await this.deps.agentListingDao.findByOwnerId(userId, { limit: 1, offset: 0 })
        return rows.length > 0
      }
      case 'rent_buddy': {
        const rows = await this.deps.rentalContractDao.findByTenantId(userId, {
          limit: 1,
          offset: 0,
        })
        return rows.length > 0
      }
      case 'list_product': {
        const r = await this.deps.db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .innerJoin(shops, eq(products.shopId, shops.id))
          .innerJoin(servers, eq(shops.serverId, servers.id))
          .where(and(eq(servers.ownerId, userId), eq(products.status, 'active')))
        return (r[0]?.count ?? 0) > 0
      }
      default:
        return false
    }
  }

  async getTaskCenter(userId: string) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    const tasks = await Promise.all(
      TASKS.map(async (task) => {
        if (task.key === 'invite_signup') {
          const inviteCount = await this.deps.taskCenterDao.countRewardsByKey(
            userId,
            'invite_signup',
          )
          return {
            ...task,
            completed: inviteCount > 0,
            claimable: false,
            claimedCount: inviteCount,
            progress: inviteCount,
            target: 1,
            cycleKey: `invite-${inviteCount + 1}`,
          }
        }

        const completed = await this.checkTaskCompleted(userId, task.key)
        const claimed = await this.deps.taskCenterDao.hasTaskClaim(userId, task.key, 'once')
        return {
          ...task,
          completed,
          claimable: completed && !claimed,
          claimedCount: claimed ? 1 : 0,
          progress: completed ? 1 : 0,
          target: 1,
          cycleKey: 'once',
        }
      }),
    )

    return {
      wallet,
      summary: {
        totalTasks: tasks.length,
        claimableTasks: tasks.filter((t) => t.claimable).length,
        completedTasks: tasks.filter((t) => t.completed).length,
      },
      tasks,
    }
  }

  async claimTask(userId: string, taskKey: string) {
    const task = TASKS.find((t) => t.key === taskKey)
    if (!task) {
      throw Object.assign(new Error('Task not found'), { status: 404 })
    }
    if (task.type !== 'one_time') {
      throw Object.assign(new Error('Repeatable task is auto rewarded by event'), { status: 400 })
    }

    const completed = await this.checkTaskCompleted(userId, taskKey)
    if (!completed) {
      throw Object.assign(new Error('Task not completed yet'), { status: 400 })
    }

    const claim = await this.deps.taskCenterDao.createTaskClaim({
      userId,
      taskKey,
      cycleKey: 'once',
      rewardAmount: task.reward,
      metadata: { source: 'task_center' },
    })
    if (!claim) {
      throw Object.assign(new Error('Task already claimed'), { status: 409 })
    }

    const rewarded = await this.grantReward({
      userId,
      rewardKey: `task:${taskKey}`,
      referenceId: claim.id,
      amount: task.reward,
      note: `任务奖励：${task.title}`,
      metadata: { taskKey },
    })

    if (!rewarded) {
      throw Object.assign(new Error('Reward already granted'), { status: 409 })
    }

    return { success: true, taskKey, reward: task.reward }
  }

  async getReferralSummary(userId: string) {
    const invites = await this.deps.inviteCodeDao.findByCreator(userId, 500, 0)
    const successfulInvites = invites.filter((it) => !!it.usedBy).length
    const totalInviteRewards = successfulInvites * 500
    return {
      rewardPerUser: 500,
      rewardForInviter: 500,
      rewardForInvitee: 500,
      successfulInvites,
      totalInviteRewards,
      campaignText: '邀请好友完成注册登录，你和好友均可获得 500 虾币',
    }
  }

  async getRewardHistory(userId: string, limit = 30, offset = 0) {
    return this.deps.taskCenterDao.listRewardLogs(userId, limit, offset)
  }
}
