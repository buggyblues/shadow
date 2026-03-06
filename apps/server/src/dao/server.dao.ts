import { generateInviteCode } from '@shadowob/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { members, servers, users } from '../db/schema'

export class ServerDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db.select().from(servers).where(eq(servers.id, id)).limit(1)
    return result[0] ?? null
  }

  async findBySlug(slug: string) {
    const result = await this.db.select().from(servers).where(eq(servers.slug, slug)).limit(1)
    return result[0] ?? null
  }

  async findByInviteCode(inviteCode: string) {
    const result = await this.db
      .select()
      .from(servers)
      .where(eq(servers.inviteCode, inviteCode))
      .limit(1)
    return result[0] ?? null
  }

  async findByUserId(userId: string) {
    return this.db
      .select({ server: servers, member: members })
      .from(members)
      .innerJoin(servers, eq(members.serverId, servers.id))
      .where(eq(members.userId, userId))
  }

  async create(data: {
    name: string
    ownerId: string
    iconUrl?: string
    bannerUrl?: string
    description?: string
    slug?: string
    isPublic?: boolean
  }) {
    const inviteCode = generateInviteCode()
    const result = await this.db
      .insert(servers)
      .values({
        name: data.name,
        ownerId: data.ownerId,
        iconUrl: data.iconUrl,
        bannerUrl: data.bannerUrl,
        description: data.description,
        slug: data.slug,
        isPublic: data.isPublic ?? false,
        inviteCode,
      })
      .returning()
    return result[0]
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      iconUrl: string | null
      bannerUrl: string | null
      description: string | null
      slug: string | null
      isPublic: boolean
    }>,
  ) {
    const result = await this.db
      .update(servers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(servers.id, id))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(servers).where(eq(servers.id, id))
  }

  async addMember(serverId: string, userId: string, role: 'owner' | 'admin' | 'member' = 'member') {
    const result = await this.db.insert(members).values({ serverId, userId, role }).returning()
    return result[0]
  }

  async removeMember(serverId: string, userId: string) {
    await this.db
      .delete(members)
      .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
  }

  async getMember(serverId: string, userId: string) {
    const result = await this.db
      .select()
      .from(members)
      .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async getMembers(serverId: string) {
    const rows = await this.db
      .select({
        member: members,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
          isBot: users.isBot,
        },
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.serverId, serverId))

    return rows.map((r) => ({ ...r.member, user: r.user }))
  }

  async findAll(limit = 50, offset = 0) {
    return this.db.select().from(servers).limit(limit).offset(offset)
  }

  async updateMember(
    serverId: string,
    userId: string,
    data: Partial<{ role: 'owner' | 'admin' | 'member'; nickname: string | null }>,
  ) {
    const result = await this.db
      .update(members)
      .set(data)
      .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
      .returning()
    return result[0] ?? null
  }

  async regenerateInviteCode(id: string) {
    const inviteCode = generateInviteCode()
    const result = await this.db
      .update(servers)
      .set({ inviteCode, updatedAt: new Date() })
      .where(eq(servers.id, id))
      .returning()
    return result[0] ?? null
  }

  async findPublic(limit = 50, offset = 0) {
    const results = await this.db
      .select()
      .from(servers)
      .where(eq(servers.isPublic, true))
      .limit(limit)
      .offset(offset)

    const serverIds = results.map((r) => r.id)
    if (serverIds.length === 0) {
      return []
    }

    // Get member counts per server
    const countRows = await this.db
      .select({
        serverId: members.serverId,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(members)
      .where(inArray(members.serverId, serverIds))
      .groupBy(members.serverId)

    const memberCounts: Record<string, number> = {}
    for (const row of countRows) {
      memberCounts[row.serverId] = row.count
    }

    // Fetch top 5 member avatars per server
    const memberAvatars: Record<string, { id: string; avatarUrl: string | null }[]> = {}
    const avatarRows = await this.db
      .select({
        serverId: members.serverId,
        userId: users.id,
        avatarUrl: users.avatarUrl,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(inArray(members.serverId, serverIds))

    for (const row of avatarRows) {
      if (!row.userId) continue
      if (!memberAvatars[row.serverId]) {
        memberAvatars[row.serverId] = []
      }
      if (memberAvatars[row.serverId]!.length < 5) {
        memberAvatars[row.serverId]!.push({ id: row.userId, avatarUrl: row.avatarUrl })
      }
    }

    return results.map((r) => ({
      ...r,
      memberCount: memberCounts[r.id] ?? 0,
      memberAvatars: memberAvatars[r.id] ?? [],
    }))
  }
}
