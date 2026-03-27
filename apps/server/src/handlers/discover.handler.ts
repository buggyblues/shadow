import { and, desc, eq, inArray, not, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import * as schema from '../db/schema'

/**
 * 计算热度分数
 * 基于：成员数、消息活跃度、最近活动
 */
function calculateHeatScore(params: {
  memberCount: number
  messageCount?: number
  lastActivityAt?: Date | null
  createdAt: Date
}): number {
  const { memberCount, messageCount = 0, lastActivityAt, createdAt } = params

  // 基础分数：成员数权重 1，消息数权重 0.5
  let score = memberCount * 1 + messageCount * 0.5

  // 时间衰减：越活跃越靠前
  const now = Date.now()
  const lastActivity = lastActivityAt?.getTime() || createdAt.getTime()
  const hoursSinceLastActivity = (now - lastActivity) / (1000 * 60 * 60)

  // 24小时内活跃度最高，之后逐渐衰减
  const timeDecay = Math.max(0, 1 - hoursSinceLastActivity / 168) // 7天衰减到0
  score = score * (1 + timeDecay)

  return Math.round(score)
}

export function createDiscoverHandler(container: AppContainer) {
  const handler = new Hono()

  /**
   * GET /api/discover/feed
   * 综合推荐流 - 按热度+时间排序
   * 返回混合内容：服务器、频道、活跃租赁
   */
  handler.get('/feed', async (c) => {
    const db = container.resolve('db')
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50)
    const offset = Number(c.req.query('offset') ?? '0')
    const type = c.req.query('type') as 'all' | 'servers' | 'channels' | 'rentals' | undefined

    const result: Array<{
      id: string
      type: 'server' | 'channel' | 'rental'
      heatScore: number
      data: unknown
    }> = []

    // 1. 获取热门服务器
    if (!type || type === 'all' || type === 'servers') {
      const servers = await db
        .select({
          server: schema.servers,
          memberCount: sql<number>`count(${schema.members.userId})::int`,
        })
        .from(schema.servers)
        .leftJoin(schema.members, eq(schema.servers.id, schema.members.serverId))
        .where(eq(schema.servers.isPublic, true))
        .groupBy(schema.servers.id)
        .orderBy(desc(sql`count(${schema.members.userId})`))
        .limit(limit)

      for (const { server, memberCount } of servers) {
        result.push({
          id: server.id,
          type: 'server',
          heatScore: calculateHeatScore({
            memberCount,
            createdAt: server.createdAt,
          }),
          data: {
            id: server.id,
            name: server.name,
            slug: server.slug,
            description: server.description,
            iconUrl: server.iconUrl,
            bannerUrl: server.bannerUrl,
            memberCount,
            isPublic: server.isPublic,
            inviteCode: server.inviteCode,
            createdAt: server.createdAt,
          },
        })
      }
    }

    // 2. 获取活跃频道
    if (!type || type === 'all' || type === 'channels') {
      const channelRows = await db
        .select({
          channel: schema.channels,
          server: schema.servers,
          memberCount: sql<number>`count(${schema.channelMembers.userId})::int`,
          messageCount: sql<number>`count(${schema.messages.id})::int`,
        })
        .from(schema.channels)
        .innerJoin(schema.servers, eq(schema.channels.serverId, schema.servers.id))
        .leftJoin(schema.channelMembers, eq(schema.channels.id, schema.channelMembers.channelId))
        .leftJoin(schema.messages, eq(schema.channels.id, schema.messages.channelId))
        .where(
          and(
            eq(schema.channels.isPrivate, false),
            not(sql`${schema.channels.name} LIKE 'app:%'`),
            eq(schema.servers.isPublic, true),
          ),
        )
        .groupBy(schema.channels.id, schema.servers.id)
        .orderBy(desc(schema.channels.lastMessageAt))
        .limit(limit)

      // 获取最新消息
      const channelIds = channelRows.map((r) => r.channel.id)
      const latestMessages =
        channelIds.length > 0
          ? await db
              .select({
                channelId: schema.messages.channelId,
                content: schema.messages.content,
                createdAt: schema.messages.createdAt,
                authorId: schema.messages.authorId,
              })
              .from(schema.messages)
              .where(inArray(schema.messages.channelId, channelIds))
              .orderBy(desc(schema.messages.createdAt))
          : []

      const latestMessageByChannel = new Map<string, (typeof latestMessages)[0]>()
      for (const msg of latestMessages) {
        if (!latestMessageByChannel.has(msg.channelId)) {
          latestMessageByChannel.set(msg.channelId, msg)
        }
      }

      for (const { channel, server, memberCount, messageCount } of channelRows) {
        const lastMessage = latestMessageByChannel.get(channel.id)
        result.push({
          id: channel.id,
          type: 'channel',
          heatScore: calculateHeatScore({
            memberCount,
            messageCount,
            lastActivityAt: channel.lastMessageAt || channel.createdAt,
            createdAt: channel.createdAt,
          }),
          data: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            topic: channel.topic,
            server: {
              id: server.id,
              name: server.name,
              slug: server.slug,
              iconUrl: server.iconUrl,
            },
            memberCount,
            lastMessage: lastMessage
              ? {
                  content: lastMessage.content.slice(0, 150),
                  createdAt: lastMessage.createdAt,
                }
              : null,
          },
        })
      }
    }

    // 3. 获取活跃租赁
    if (!type || type === 'all' || type === 'rentals') {
      const clawListingDao = container.resolve('clawListingDao')
      const userDao = container.resolve('userDao')
      const agentDao = container.resolve('agentDao')

      const activeContracts = await db
        .select()
        .from(schema.rentalContracts)
        .where(eq(schema.rentalContracts.status, 'active'))
        .orderBy(desc(schema.rentalContracts.createdAt))
        .limit(limit)

      for (const contract of activeContracts) {
        const listing = await clawListingDao.findById(contract.listingId)
        if (!listing) continue

        const tenant = await userDao.findById(contract.tenantId)
        const owner = await userDao.findById(listing.ownerId)
        const agent = listing.agentId ? await agentDao.findById(listing.agentId) : null
        const agentUser = agent?.userId ? await userDao.findById(agent.userId) : null

        result.push({
          id: contract.id,
          type: 'rental',
          heatScore: calculateHeatScore({
            memberCount: 2, // 租赁双方
            lastActivityAt: agent?.lastHeartbeat,
            createdAt: new Date(contract.startsAt),
          }),
          data: {
            contractId: contract.id,
            contractNo: contract.contractNo,
            startedAt: contract.startsAt,
            expiresAt: contract.expiresAt,
            listing: {
              id: listing.id,
              title: listing.title,
              description: listing.description,
              deviceTier: listing.deviceTier,
              osType: listing.osType,
              hourlyRate: listing.hourlyRate,
              tags: listing.tags,
            },
            tenant: tenant
              ? {
                  id: tenant.id,
                  username: tenant.username,
                  displayName: tenant.displayName,
                  avatarUrl: tenant.avatarUrl,
                }
              : null,
            owner: owner
              ? {
                  id: owner.id,
                  username: owner.username,
                  displayName: owner.displayName,
                  avatarUrl: owner.avatarUrl,
                }
              : null,
            agent: agent
              ? {
                  id: agent.id,
                  name: agentUser?.displayName || agentUser?.username || 'Unknown',
                  status: agent.status,
                  lastHeartbeat: agent.lastHeartbeat,
                }
              : null,
          },
        })
      }
    }

    // 按热度分数排序
    result.sort((a, b) => b.heatScore - a.heatScore)

    // 分页
    const paginatedResult = result.slice(offset, offset + limit)

    return c.json({
      items: paginatedResult,
      total: result.length,
      hasMore: result.length > offset + limit,
    })
  })

  /**
   * GET /api/discover/search
   * 统一搜索接口
   */
  handler.get('/search', async (c) => {
    const db = container.resolve('db')
    const query = c.req.query('q')?.toLowerCase()
    const type = c.req.query('type') as 'all' | 'servers' | 'channels' | 'rentals' | undefined
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50)

    if (!query || query.length < 2) {
      return c.json({ items: [], total: 0 })
    }

    const result: Array<{
      id: string
      type: 'server' | 'channel' | 'rental'
      data: unknown
    }> = []

    // 搜索服务器
    if (!type || type === 'all' || type === 'servers') {
      const servers = await db
        .select({
          server: schema.servers,
          memberCount: sql<number>`count(${schema.members.userId})::int`,
        })
        .from(schema.servers)
        .leftJoin(schema.members, eq(schema.servers.id, schema.members.serverId))
        .where(
          and(
            eq(schema.servers.isPublic, true),
            sql`lower(${schema.servers.name}) LIKE ${`%${query}%`}`,
          ),
        )
        .groupBy(schema.servers.id)
        .limit(limit)

      for (const { server, memberCount } of servers) {
        result.push({
          id: server.id,
          type: 'server',
          data: {
            id: server.id,
            name: server.name,
            slug: server.slug,
            description: server.description,
            iconUrl: server.iconUrl,
            bannerUrl: server.bannerUrl,
            memberCount,
            isPublic: server.isPublic,
            inviteCode: server.inviteCode,
          },
        })
      }
    }

    // 搜索频道
    if (!type || type === 'all' || type === 'channels') {
      const channels = await db
        .select({
          channel: schema.channels,
          server: schema.servers,
          memberCount: sql<number>`count(${schema.channelMembers.userId})::int`,
        })
        .from(schema.channels)
        .innerJoin(schema.servers, eq(schema.channels.serverId, schema.servers.id))
        .leftJoin(schema.channelMembers, eq(schema.channels.id, schema.channelMembers.channelId))
        .where(
          and(
            eq(schema.channels.isPrivate, false),
            not(sql`${schema.channels.name} LIKE 'app:%'`),
            eq(schema.servers.isPublic, true),
            sql`lower(${schema.channels.name}) LIKE ${`%${query}%`}`,
          ),
        )
        .groupBy(schema.channels.id, schema.servers.id)
        .limit(limit)

      for (const { channel, server, memberCount } of channels) {
        result.push({
          id: channel.id,
          type: 'channel',
          data: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            topic: channel.topic,
            server: {
              id: server.id,
              name: server.name,
              slug: server.slug,
              iconUrl: server.iconUrl,
            },
            memberCount,
          },
        })
      }
    }

    return c.json({
      items: result,
      total: result.length,
    })
  })

  return handler
}
