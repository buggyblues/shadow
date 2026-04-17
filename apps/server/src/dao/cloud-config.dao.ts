import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { cloudConfigs } from '../db/schema'

export class CloudConfigDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findById(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(cloudConfigs)
      .where(and(eq(cloudConfigs.id, id), eq(cloudConfigs.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async listByUser(userId: string) {
    return this.db
      .select()
      .from(cloudConfigs)
      .where(eq(cloudConfigs.userId, userId))
      .orderBy(cloudConfigs.updatedAt)
  }

  async create(data: { userId: string; name: string; content: unknown }) {
    const result = await this.db
      .insert(cloudConfigs)
      .values({
        userId: data.userId,
        name: data.name,
        content: data.content as Record<string, unknown>,
        version: 1,
      })
      .returning()
    return result[0]
  }

  async update(id: string, userId: string, data: Partial<{ name: string; content: unknown }>) {
    const existing = await this.findById(id, userId)
    if (!existing) return null
    const result = await this.db
      .update(cloudConfigs)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.content !== undefined ? { content: data.content as Record<string, unknown> } : {}),
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(cloudConfigs.id, id), eq(cloudConfigs.userId, userId)))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string, userId: string) {
    await this.db
      .delete(cloudConfigs)
      .where(and(eq(cloudConfigs.id, id), eq(cloudConfigs.userId, userId)))
  }
}
