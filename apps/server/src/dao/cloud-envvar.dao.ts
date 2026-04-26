import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { cloudEnvGroups, cloudEnvVars } from '../db/schema'

export class CloudEnvVarDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async listByUser(userId: string, scope?: string) {
    const conditions = [eq(cloudEnvVars.userId, userId)]
    if (scope) conditions.push(eq(cloudEnvVars.scope, scope))
    return this.db
      .select()
      .from(cloudEnvVars)
      .where(and(...conditions))
      .orderBy(cloudEnvVars.key)
  }

  async create(data: {
    userId: string
    key: string
    encryptedValue: string
    scope?: string
    groupId?: string | null
  }) {
    const result = await this.db
      .insert(cloudEnvVars)
      .values({
        userId: data.userId,
        key: data.key,
        encryptedValue: data.encryptedValue,
        scope: data.scope ?? 'global',
        groupId: data.groupId ?? null,
      })
      .returning()
    return result[0]
  }

  async update(id: string, userId: string, encryptedValue: string) {
    const result = await this.db
      .update(cloudEnvVars)
      .set({ encryptedValue, updatedAt: new Date() })
      .where(and(eq(cloudEnvVars.id, id), eq(cloudEnvVars.userId, userId)))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string, userId: string) {
    await this.db
      .delete(cloudEnvVars)
      .where(and(eq(cloudEnvVars.id, id), eq(cloudEnvVars.userId, userId)))
  }

  async upsertScoped(data: {
    userId: string
    scope: string
    key: string
    encryptedValue: string
    groupId?: string | null
  }) {
    const existing = await this.listByUser(data.userId, data.scope)
    const found = existing.find((v) => v.key === data.key)
    if (found) return this.update(found.id, data.userId, data.encryptedValue)
    return this.create({
      userId: data.userId,
      scope: data.scope,
      key: data.key,
      encryptedValue: data.encryptedValue,
      groupId: data.groupId ?? null,
    })
  }

  async deleteByScope(userId: string, scope: string) {
    await this.db
      .delete(cloudEnvVars)
      .where(and(eq(cloudEnvVars.userId, userId), eq(cloudEnvVars.scope, scope)))
  }

  // ─── Groups ──────────────────────────────────────────────────────────────

  async listGroupsByUser(userId: string) {
    return this.db
      .select()
      .from(cloudEnvGroups)
      .where(eq(cloudEnvGroups.userId, userId))
      .orderBy(cloudEnvGroups.name)
  }

  async findGroupByName(userId: string, name: string) {
    const result = await this.db
      .select()
      .from(cloudEnvGroups)
      .where(and(eq(cloudEnvGroups.userId, userId), eq(cloudEnvGroups.name, name)))
      .limit(1)
    return result[0] ?? null
  }

  async createGroup(data: { userId: string; name: string }) {
    const result = await this.db
      .insert(cloudEnvGroups)
      .values({ userId: data.userId, name: data.name })
      .returning()
    return result[0]
  }

  async deleteGroupByName(userId: string, name: string) {
    await this.db
      .delete(cloudEnvGroups)
      .where(and(eq(cloudEnvGroups.userId, userId), eq(cloudEnvGroups.name, name)))
  }
}
