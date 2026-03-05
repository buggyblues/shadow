import { generateInviteCode } from '@shadow/shared'
import { and, eq, sql } from 'drizzle-orm'
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
    description?: string
    isPublic?: boolean
  }) {
    const inviteCode = generateInviteCode()
    const result = await this.db
      .insert(servers)
      .values({
        name: data.name,
        ownerId: data.ownerId,
        iconUrl: data.iconUrl,
        description: data.description,
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
      description: string | null
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

  async findPublic(limit = 50, offset = 0) {
    const results = await this.db
      .select({
        server: servers,
        memberCount:
          sql<number>`(SELECT count(*) FROM ${members} WHERE ${members.serverId} = ${servers.id})`.as(
            'member_count',
          ),
      })
      .from(servers)
      .where(eq(servers.isPublic, true))
      .limit(limit)
      .offset(offset)

    return results.map((r) => ({
      ...r.server,
      memberCount: Number(r.memberCount),
    }))
  }
}
