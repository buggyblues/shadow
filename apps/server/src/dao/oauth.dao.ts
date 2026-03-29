import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import {
  oauthAccessTokens,
  oauthApps,
  oauthAuthorizationCodes,
  oauthConsents,
  oauthRefreshTokens,
} from '../db/schema'
import { agents } from '../db/schema/agents'
import { users } from '../db/schema/users'

export class OAuthAppDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async create(data: {
    userId: string
    clientId: string
    clientSecretHash: string
    name: string
    description?: string
    homepageUrl?: string
    logoUrl?: string
    redirectUris: string[]
  }) {
    const result = await this.db.insert(oauthApps).values(data).returning()
    return result[0]
  }

  async findById(id: string) {
    const result = await this.db.select().from(oauthApps).where(eq(oauthApps.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByClientId(clientId: string) {
    const result = await this.db
      .select()
      .from(oauthApps)
      .where(eq(oauthApps.clientId, clientId))
      .limit(1)
    return result[0] ?? null
  }

  async findByUserId(userId: string) {
    return this.db.select().from(oauthApps).where(eq(oauthApps.userId, userId))
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      description: string
      homepageUrl: string
      logoUrl: string
      redirectUris: string[]
      isActive: boolean
    }>,
  ) {
    const result = await this.db
      .update(oauthApps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(oauthApps.id, id))
      .returning()
    return result[0] ?? null
  }

  async updateSecret(id: string, clientSecretHash: string) {
    const result = await this.db
      .update(oauthApps)
      .set({ clientSecretHash, updatedAt: new Date() })
      .where(eq(oauthApps.id, id))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(oauthApps).where(eq(oauthApps.id, id))
  }

  // --- Authorization Codes ---

  async createAuthorizationCode(data: {
    code: string
    appId: string
    userId: string
    redirectUri: string
    scope: string
    expiresAt: Date
  }) {
    const result = await this.db.insert(oauthAuthorizationCodes).values(data).returning()
    return result[0]
  }

  async findAuthorizationCode(code: string) {
    const result = await this.db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code, code))
      .limit(1)
    return result[0] ?? null
  }

  async markAuthorizationCodeUsed(id: string) {
    await this.db
      .update(oauthAuthorizationCodes)
      .set({ used: true })
      .where(eq(oauthAuthorizationCodes.id, id))
  }

  // --- Access Tokens ---

  async createAccessToken(data: {
    tokenHash: string
    appId: string
    userId: string
    scope: string
    expiresAt: Date
  }) {
    const result = await this.db.insert(oauthAccessTokens).values(data).returning()
    return result[0]
  }

  async findAccessTokenByHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.tokenHash, tokenHash))
      .limit(1)
    return result[0] ?? null
  }

  async deleteAccessTokensByAppAndUser(appId: string, userId: string) {
    await this.db
      .delete(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.appId, appId), eq(oauthAccessTokens.userId, userId)))
  }

  // --- Refresh Tokens ---

  async createRefreshToken(data: {
    tokenHash: string
    accessTokenId: string
    appId: string
    userId: string
    expiresAt: Date
  }) {
    const result = await this.db.insert(oauthRefreshTokens).values(data).returning()
    return result[0]
  }

  async findRefreshTokenByHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(oauthRefreshTokens)
      .where(eq(oauthRefreshTokens.tokenHash, tokenHash))
      .limit(1)
    return result[0] ?? null
  }

  async revokeRefreshToken(id: string) {
    await this.db
      .update(oauthRefreshTokens)
      .set({ revoked: true })
      .where(eq(oauthRefreshTokens.id, id))
  }

  async revokeRefreshTokensByAppAndUser(appId: string, userId: string) {
    await this.db
      .update(oauthRefreshTokens)
      .set({ revoked: true })
      .where(and(eq(oauthRefreshTokens.appId, appId), eq(oauthRefreshTokens.userId, userId)))
  }

  // --- Consents ---

  async findConsent(userId: string, appId: string) {
    const result = await this.db
      .select()
      .from(oauthConsents)
      .where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.appId, appId)))
      .limit(1)
    return result[0] ?? null
  }

  async upsertConsent(userId: string, appId: string, scope: string) {
    const existing = await this.findConsent(userId, appId)
    if (existing) {
      const result = await this.db
        .update(oauthConsents)
        .set({ scope, updatedAt: new Date() })
        .where(eq(oauthConsents.id, existing.id))
        .returning()
      return result[0]
    }
    const result = await this.db.insert(oauthConsents).values({ userId, appId, scope }).returning()
    return result[0]
  }

  async findConsentsByUserId(userId: string) {
    return this.db.select().from(oauthConsents).where(eq(oauthConsents.userId, userId))
  }

  async deleteConsent(userId: string, appId: string) {
    await this.db
      .delete(oauthConsents)
      .where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.appId, appId)))
  }

  // --- Buddy helpers ---

  async updateBuddyUser(
    userId: string,
    data: { isBot: boolean; oauthAppId: string; parentUserId: string },
  ) {
    await this.db
      .update(users)
      .set({
        isBot: data.isBot,
        oauthAppId: data.oauthAppId,
        parentUserId: data.parentUserId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  }

  async updateBuddyAgent(agentId: string, data: { oauthAppId: string; buddyUserId: string }) {
    await this.db
      .update(agents)
      .set({
        oauthAppId: data.oauthAppId,
        buddyUserId: data.buddyUserId,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))
  }

  async getBuddyUserId(agentId: string): Promise<string | null> {
    const result = await this.db
      .select({ buddyUserId: agents.buddyUserId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1)
    return result[0]?.buddyUserId ?? null
  }
}
