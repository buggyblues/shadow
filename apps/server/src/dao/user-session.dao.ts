import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db'
import { userSessions } from '../db/schema'

export interface UserSessionDevice {
  deviceName?: string | null
  userAgent?: string | null
  ipAddress?: string | null
}

export class UserSessionDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async create(data: UserSessionDevice & { id: string; userId: string; refreshTokenHash: string }) {
    const result = await this.db.insert(userSessions).values(data).returning()
    return result[0]
  }

  async findById(id: string) {
    const result = await this.db.select().from(userSessions).where(eq(userSessions.id, id)).limit(1)
    return result[0] ?? null
  }

  async listByUserId(userId: string) {
    return this.db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, userId))
      .orderBy(desc(userSessions.lastSeenAt), desc(userSessions.createdAt))
  }

  async listActiveByUserId(userId: string) {
    return this.db
      .select()
      .from(userSessions)
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
      .orderBy(desc(userSessions.lastSeenAt), desc(userSessions.createdAt))
  }

  async updateRefreshTokenHash(id: string, refreshTokenHash: string, device?: UserSessionDevice) {
    const result = await this.db
      .update(userSessions)
      .set({
        refreshTokenHash,
        ...(device?.deviceName !== undefined ? { deviceName: device.deviceName } : {}),
        ...(device?.userAgent !== undefined ? { userAgent: device.userAgent } : {}),
        ...(device?.ipAddress !== undefined ? { ipAddress: device.ipAddress } : {}),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userSessions.id, id))
      .returning()
    return result[0] ?? null
  }

  async touch(id: string) {
    await this.db
      .update(userSessions)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(userSessions.id, id))
  }

  async revoke(id: string, userId: string) {
    const result = await this.db
      .update(userSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(userSessions.id, id),
          eq(userSessions.userId, userId),
          isNull(userSessions.revokedAt),
        ),
      )
      .returning()
    return result[0] ?? null
  }

  async revokeAllByUserId(userId: string) {
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
  }
}
