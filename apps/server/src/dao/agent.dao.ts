import { eq } from 'drizzle-orm'
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
    const now = new Date()
    const result = await this.db
      .update(agents)
      .set({ lastHeartbeat: now, status: 'running', updatedAt: now })
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

  async delete(id: string) {
    await this.db.delete(agents).where(eq(agents.id, id))
  }

  /** 创建 Agent 关联的 bot user */
  async createBotUser(data: { username: string; displayName: string }) {
    const result = await this.db
      .insert(users)
      .values({
        email: `${data.username}@shadowob.bot`,
        username: data.username,
        displayName: data.displayName,
        passwordHash: 'bot-no-password',
        isBot: true,
      })
      .returning()
    return result[0]
  }
}
