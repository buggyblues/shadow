import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { type CloudGitConnectionScopes, cloudGitConnections } from '../db/schema'

export class CloudGitConnectionDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async listByUser(userId: string) {
    return this.db
      .select()
      .from(cloudGitConnections)
      .where(eq(cloudGitConnections.userId, userId))
      .orderBy(desc(cloudGitConnections.updatedAt))
  }

  async findByIdForUser(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(cloudGitConnections)
      .where(and(eq(cloudGitConnections.id, id), eq(cloudGitConnections.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async create(data: {
    userId: string
    name: string
    accountLogin: string
    accountName?: string | null
    tokenEncrypted: string
    scopes?: CloudGitConnectionScopes | null
  }) {
    const result = await this.db
      .insert(cloudGitConnections)
      .values({
        userId: data.userId,
        provider: 'github',
        name: data.name,
        accountLogin: data.accountLogin,
        accountName: data.accountName ?? null,
        tokenEncrypted: data.tokenEncrypted,
        scopes: data.scopes ?? null,
      })
      .returning()
    return result[0] ?? null
  }

  async updateToken(
    id: string,
    userId: string,
    data: {
      name?: string
      accountLogin: string
      accountName?: string | null
      tokenEncrypted: string
      scopes?: CloudGitConnectionScopes | null
    },
  ) {
    const result = await this.db
      .update(cloudGitConnections)
      .set({
        ...(data.name ? { name: data.name } : {}),
        accountLogin: data.accountLogin,
        accountName: data.accountName ?? null,
        tokenEncrypted: data.tokenEncrypted,
        scopes: data.scopes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(cloudGitConnections.id, id), eq(cloudGitConnections.userId, userId)))
      .returning()
    return result[0] ?? null
  }

  async touch(id: string, userId: string) {
    await this.db
      .update(cloudGitConnections)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(cloudGitConnections.id, id), eq(cloudGitConnections.userId, userId)))
  }

  async delete(id: string, userId: string) {
    const result = await this.db
      .delete(cloudGitConnections)
      .where(and(eq(cloudGitConnections.id, id), eq(cloudGitConnections.userId, userId)))
      .returning()
    return result[0] ?? null
  }
}
