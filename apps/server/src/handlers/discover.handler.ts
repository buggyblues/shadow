import { and, desc, eq, inArray, not, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import * as schema from '../db/schema'

export function createDiscoverHandler(container: AppContainer) {
  const handler = new Hono()

  /**
   * GET /api/discover/channels
   * Returns public channels from public servers with latest messages
   * Public endpoint - no auth required
   */
  handler.get('/channels', async (c) => {
    const db = container.resolve('db')
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50)
    const offset = Number(c.req.query('offset') ?? '0')

    // Get public channels from public servers with latest activity
    const channelRows = await db
      .select({
        channel: schema.channels,
        server: schema.servers,
      })
      .from(schema.channels)
      .innerJoin(schema.servers, eq(schema.channels.serverId, schema.servers.id))
      .where(
        and(
          eq(schema.channels.isPrivate, false),
          not(sql`${schema.channels.name} LIKE 'app:%'`),
          eq(schema.servers.isPublic, true),
        ),
      )
      .orderBy(desc(schema.channels.lastMessageAt))
      .limit(limit)
      .offset(offset)

    if (channelRows.length === 0) {
      return c.json([])
    }

    const channelIds = channelRows.map((row) => row.channel.id)

    // Get latest message for each channel
    const latestMessages = await db
      .select({
        channelId: schema.messages.channelId,
        content: schema.messages.content,
        createdAt: schema.messages.createdAt,
        authorId: schema.messages.authorId,
      })
      .from(schema.messages)
      .where(inArray(schema.messages.channelId, channelIds))
      .orderBy(desc(schema.messages.createdAt))

    // Get the latest message per channel
    const latestMessageByChannel = new Map<string, (typeof latestMessages)[0]>()
    for (const msg of latestMessages) {
      if (!latestMessageByChannel.has(msg.channelId)) {
        latestMessageByChannel.set(msg.channelId, msg)
      }
    }

    // Get member counts for each channel
    const memberCounts = await db
      .select({
        channelId: schema.channelMembers.channelId,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(schema.channelMembers)
      .where(inArray(schema.channelMembers.channelId, channelIds))
      .groupBy(schema.channelMembers.channelId)

    const memberCountMap = new Map(memberCounts.map((m) => [m.channelId, m.count]))

    const result = channelRows.map((row) => ({
      id: row.channel.id,
      name: row.channel.name,
      type: row.channel.type,
      topic: row.channel.topic,
      server: {
        id: row.server.id,
        name: row.server.name,
        slug: row.server.slug,
        iconUrl: row.server.iconUrl,
      },
      memberCount: memberCountMap.get(row.channel.id) ?? 0,
      lastMessage: latestMessageByChannel.get(row.channel.id)
        ? {
            content: latestMessageByChannel.get(row.channel.id)!.content.slice(0, 200),
            createdAt: latestMessageByChannel.get(row.channel.id)!.createdAt,
            authorId: latestMessageByChannel.get(row.channel.id)!.authorId,
          }
        : null,
    }))

    return c.json(result)
  })

  /**
   * GET /api/discover/rentals
   * Returns currently active buddy rentals
   * Public endpoint - no auth required
   */
  handler.get('/rentals', async (c) => {
    const db = container.resolve('db')
    const clawListingDao = container.resolve('clawListingDao')
    const userDao = container.resolve('userDao')
    const agentDao = container.resolve('agentDao')
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50)
    const offset = Number(c.req.query('offset') ?? '0')

    // Get active rental contracts with pagination
    const activeContracts = await db
      .select()
      .from(schema.rentalContracts)
      .where(eq(schema.rentalContracts.status, 'active'))
      .orderBy(desc(schema.rentalContracts.createdAt))
      .limit(limit)
      .offset(offset)

    // Enrich with listing and user info
    const enriched = await Promise.all(
      activeContracts.map(async (contract) => {
        const listing = await clawListingDao.findById(contract.listingId)
        const tenant = await userDao.findById(contract.tenantId)
        const owner = listing ? await userDao.findById(listing.ownerId) : null
        const agent = listing?.agentId ? await agentDao.findById(listing.agentId) : null
        const agentUser = agent?.userId ? await userDao.findById(agent.userId) : null

        return {
          contractId: contract.id,
          contractNo: contract.contractNo,
          startedAt: contract.startsAt,
          expiresAt: contract.expiresAt,
          listing: listing
            ? {
                id: listing.id,
                title: listing.title,
                description: listing.description,
                deviceTier: listing.deviceTier,
                osType: listing.osType,
                hourlyRate: listing.hourlyRate,
                dailyRate: listing.dailyRate,
                tags: listing.tags,
              }
            : null,
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
        }
      }),
    )

    return c.json(enriched)
  })

  return handler
}
