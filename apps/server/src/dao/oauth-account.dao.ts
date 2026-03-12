import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { oauthAccounts } from '../db/schema'

export class OAuthAccountDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findByProviderAccount(provider: string, providerAccountId: string) {
    const result = await this.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerAccountId, providerAccountId),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  async findByUserId(userId: string) {
    return this.db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId))
  }

  async create(data: {
    userId: string
    provider: string
    providerAccountId: string
    providerEmail?: string
  }) {
    const result = await this.db.insert(oauthAccounts).values(data).returning()
    return result[0]
  }

  async delete(id: string) {
    await this.db.delete(oauthAccounts).where(eq(oauthAccounts.id, id))
  }
}
