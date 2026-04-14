import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { apiTokens } from '../db/schema'

export class ApiTokenDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async create(data: {
    userId: string
    tokenHash: string
    name: string
    scope: string
    expiresAt?: Date | null
  }) {
    const result = await this.db
      .insert(apiTokens)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        name: data.name,
        scope: data.scope,
        expiresAt: data.expiresAt ?? null,
      })
      .returning()
    return result[0]
  }

  async findByHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.tokenHash, tokenHash), eq(apiTokens.revoked, false)))
      .limit(1)
    return result[0] ?? null
  }

  async findByUserId(userId: string) {
    return this.db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        scope: apiTokens.scope,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        revoked: apiTokens.revoked,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))
  }

  async findById(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async revoke(id: string, userId: string) {
    const result = await this.db
      .update(apiTokens)
      .set({ revoked: true })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string, userId: string) {
    await this.db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
  }

  async updateLastUsed(id: string) {
    await this.db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id))
  }
}
