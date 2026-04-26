import { eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { agents, users } from '../db/schema'

export class AgentDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db.select().from(agents).where(eq(agents.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByOwnerId(ownerId: string) {
    return this.db.select().from(agents).where(eq(agents.ownerId, ownerId))
  }

  async findAll(limit = 50, offset = 0) {
    return this.db.select().from(agents).limit(limit).offset(offset)
  }

  async create(data: {
    userId: string
    kernelType: string
    config: Record<string, unknown>
    ownerId: string
  }) {
    const result = await this.db.insert(agents).values(data).returning()
    return result[0]
  }

  async updateStatus(id: string, status: 'running' | 'stopped' | 'error', containerId?: string) {
    const result = await this.db
      .update(agents)
      .set({
        status,
        ...(containerId !== undefined ? { containerId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, id))
      .returning()
    return result[0] ?? null
  }

  async updateHeartbeat(id: string) {
    // Accumulate online seconds: if lastHeartbeat is recent (<= 120s), add the delta
    // Use NOW() to avoid JS Date serialization issues with PostgreSQL timestamptz casts
    const result = await this.db
      .update(agents)
      .set({
        lastHeartbeat: sql`NOW()`,
        status: 'running',
        updatedAt: sql`NOW()`,
        totalOnlineSeconds: sql`${agents.totalOnlineSeconds} + CASE
          WHEN ${agents.lastHeartbeat} IS NOT NULL
            AND EXTRACT(EPOCH FROM (NOW() - ${agents.lastHeartbeat})) <= 120
          THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - ${agents.lastHeartbeat})))::int
          ELSE 0 END`,
      })
      .where(eq(agents.id, id))
      .returning()
    return result[0] ?? null
  }

  async updateConfig(id: string, config: Record<string, unknown>) {
    const result = await this.db
      .update(agents)
      .set({ config, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning()
    return result[0] ?? null
  }

  async findByUserId(userId: string) {
    const result = await this.db.select().from(agents).where(eq(agents.userId, userId)).limit(1)
    return result[0] ?? null
  }

  async findByUserIds(userIds: string[]) {
    if (userIds.length === 0) return []
    return this.db.select().from(agents).where(inArray(agents.userId, userIds))
  }

  async findByLastToken(token: string) {
    const result = await this.db
      .select()
      .from(agents)
      .where(sql`${agents.config}->>'lastToken' = ${token}`)
      .limit(1)
    return result[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(agents).where(eq(agents.id, id))
  }

  /** 创建 Agent 关联的 bot user，username冲突时自动加随机短缀 */
  async createBotUser(data: { username: string; displayName: string }) {
    const maxRetries = 5
    let username = data.username
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.db
          .insert(users)
          .values({
            email: `${username}@shadowob.bot`,
            username,
            displayName: data.displayName,
            passwordHash: 'bot-no-password',
            isBot: true,
          })
          .returning()
        return result[0]
      } catch (err: unknown) {
        // Drizzle may wrap the pg error; check code on the error itself or via cause
        const pgCode =
          (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
        const isUniqueViolation =
          pgCode === '23505' ||
          (err instanceof Error && /unique.*constraint|duplicate key/i.test(err.message))
        if (!isUniqueViolation || attempt === maxRetries - 1) throw err
        // Append random 4-char suffix, keeping within 32-char limit
        const suffix = Math.random().toString(36).slice(2, 6)
        username = `${data.username.slice(0, 27)}_${suffix}`
      }
    }
  }
}
