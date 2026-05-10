import { and, desc, eq, inArray, like, or } from 'drizzle-orm'
import type { Database } from '../db'
import { channels, users } from '../db/schema'

export function normalizeDirectPair(userAId: string, userBId: string) {
  const sorted = [userAId, userBId].sort()
  const a = sorted[0]!
  const b = sorted[1]!
  return { userAId: a, userBId: b, pairKey: `${a}:${b}` }
}

export class ChannelDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db.select().from(channels).where(eq(channels.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByServerId(serverId: string) {
    return this.db
      .select()
      .from(channels)
      .where(and(eq(channels.kind, 'server'), eq(channels.serverId, serverId)))
      .orderBy(channels.position)
  }

  async findDirectByPair(userAId: string, userBId: string) {
    const pair = normalizeDirectPair(userAId, userBId)
    const result = await this.db
      .select()
      .from(channels)
      .where(and(eq(channels.kind, 'dm'), eq(channels.dmPairKey, pair.pairKey)))
      .limit(1)
    return result[0] ?? null
  }

  async createDirectChannel(input: { userAId: string; userBId: string; pairKey: string }) {
    const result = await this.db
      .insert(channels)
      .values({
        kind: 'dm',
        name: 'Direct Message',
        type: 'text',
        serverId: null,
        dmUserAId: input.userAId,
        dmUserBId: input.userBId,
        dmPairKey: input.pairKey,
        isPrivate: true,
        lastMessageAt: new Date(),
      })
      .onConflictDoNothing()
      .returning()
    return result[0] ?? (await this.findDirectByPair(input.userAId, input.userBId))
  }

  async findDirectChannelsForUser(userId: string) {
    const rows = await this.db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.kind, 'dm'),
          or(eq(channels.dmUserAId, userId), eq(channels.dmUserBId, userId)),
        ),
      )
      .orderBy(desc(channels.lastMessageAt), desc(channels.createdAt))

    if (rows.length === 0) return []
    const otherIds = rows
      .map((channel) => (channel.dmUserAId === userId ? channel.dmUserBId : channel.dmUserAId))
      .filter((id): id is string => Boolean(id))
    const otherUsers = otherIds.length
      ? await this.db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            status: users.status,
            isBot: users.isBot,
          })
          .from(users)
          .where(inArray(users.id, [...new Set(otherIds)]))
      : []
    const userMap = new Map(otherUsers.map((user) => [user.id, user]))

    return rows.map((channel) => {
      const otherId = channel.dmUserAId === userId ? channel.dmUserBId : channel.dmUserAId
      return { ...channel, otherUser: otherId ? (userMap.get(otherId) ?? null) : null }
    })
  }

  async findDirectPeer(channelId: string, viewerUserId: string) {
    const channel = await this.findById(channelId)
    if (!channel || channel.kind !== 'dm') return null
    if (channel.dmUserAId !== viewerUserId && channel.dmUserBId !== viewerUserId) return null
    const peerId = channel.dmUserAId === viewerUserId ? channel.dmUserBId : channel.dmUserAId
    if (!peerId) return null
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
        isBot: users.isBot,
      })
      .from(users)
      .where(eq(users.id, peerId))
      .limit(1)
    return result[0] ?? null
  }

  /** Update the last message timestamp for a channel */
  async updateLastMessageAt(id: string) {
    const result = await this.db
      .update(channels)
      .set({ lastMessageAt: new Date() })
      .where(eq(channels.id, id))
      .returning()
    return result[0] ?? null
  }

  /** Find channels in a server whose name starts with the given prefix (for dedup). */
  async findByServerIdAndNamePrefix(serverId: string, namePrefix: string) {
    return this.db
      .select({ name: channels.name })
      .from(channels)
      .where(
        and(
          eq(channels.kind, 'server'),
          eq(channels.serverId, serverId),
          like(channels.name, `${namePrefix}%`),
        ),
      )
  }

  async create(data: {
    name: string
    serverId: string
    type?: 'text' | 'voice' | 'announcement'
    topic?: string
    isPrivate?: boolean
    lastMessageAt?: Date
  }) {
    const result = await this.db
      .insert(channels)
      .values({
        kind: 'server',
        name: data.name,
        serverId: data.serverId,
        type: data.type ?? 'text',
        topic: data.topic,
        isPrivate: data.isPrivate ?? false,
        lastMessageAt: data.lastMessageAt,
      })
      .returning()
    return result[0]
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      type: 'text' | 'voice' | 'announcement'
      topic: string | null
      position: number
      isPrivate: boolean
    }>,
  ) {
    const result = await this.db
      .update(channels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channels.id, id))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(channels).where(eq(channels.id, id))
  }

  async updatePositions(positions: { id: string; position: number }[]) {
    for (const pos of positions) {
      await this.db
        .update(channels)
        .set({ position: pos.position, updatedAt: new Date() })
        .where(eq(channels.id, pos.id))
    }
  }

  async findArchivedByServerId(serverId: string) {
    return this.db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.kind, 'server'),
          eq(channels.serverId, serverId),
          eq(channels.isArchived, true),
        ),
      )
      .orderBy(desc(channels.archivedAt))
  }

  async archive(id: string, archivedBy: string) {
    const result = await this.db
      .update(channels)
      .set({
        isArchived: true,
        archivedAt: new Date(),
        archivedBy,
        updatedAt: new Date(),
      })
      .where(eq(channels.id, id))
      .returning()
    return result[0] ?? null
  }

  async unarchive(id: string) {
    const result = await this.db
      .update(channels)
      .set({
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(channels.id, id))
      .returning()
    return result[0] ?? null
  }
}
