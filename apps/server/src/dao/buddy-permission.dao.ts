import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db'
import { buddyPermissions, buddyServerSettings } from '../db/schema'

/**
 * Data Access Object for Buddy permissions
 *
 * Handles database operations for:
 * - User-level permission grants (buddy_permissions table)
 * - Server-level visibility settings (buddy_server_settings table)
 */
export class BuddyPermissionDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  // ==================== Permission Queries ====================

  /**
   * Find all permissions for a specific Buddy
   */
  async findByBuddyId(buddyId: string) {
    return this.db.select().from(buddyPermissions).where(eq(buddyPermissions.buddyId, buddyId))
  }

  /**
   * Find all permissions for a Buddy in a specific server
   */
  async findByBuddyAndServer(buddyId: string, serverId: string) {
    return this.db
      .select()
      .from(buddyPermissions)
      .where(and(eq(buddyPermissions.buddyId, buddyId), eq(buddyPermissions.serverId, serverId)))
  }

  /**
   * Find server-wide permission (channelId is null) for a specific user
   */
  async findServerPermission(buddyId: string, serverId: string, userId: string) {
    const result = await this.db
      .select()
      .from(buddyPermissions)
      .where(
        and(
          eq(buddyPermissions.buddyId, buddyId),
          eq(buddyPermissions.serverId, serverId),
          eq(buddyPermissions.userId, userId),
          isNull(buddyPermissions.channelId)
        )
      )
      .limit(1)
    return result[0] ?? null
  }

  /**
   * Find channel-specific permission for a specific user
   */
  async findChannelPermission(
    buddyId: string,
    serverId: string,
    channelId: string,
    userId: string
  ) {
    const result = await this.db
      .select()
      .from(buddyPermissions)
      .where(
        and(
          eq(buddyPermissions.buddyId, buddyId),
          eq(buddyPermissions.serverId, serverId),
          eq(buddyPermissions.channelId, channelId),
          eq(buddyPermissions.userId, userId)
        )
      )
      .limit(1)
    return result[0] ?? null
  }

  /**
   * Find any permission (server or channel) for a user in a server
   * Returns channel-specific if exists, otherwise server-wide
   */
  async findEffectivePermission(
    buddyId: string,
    serverId: string,
    channelId: string | null,
    userId: string
  ) {
    // First check for channel-specific permission
    if (channelId) {
      const channelPerm = await this.findChannelPermission(buddyId, serverId, channelId, userId)
      if (channelPerm) return channelPerm
    }

    // Fall back to server-wide permission
    return this.findServerPermission(buddyId, serverId, userId)
  }

  /**
   * Check if a user has any permission for a Buddy
   */
  async hasPermission(buddyId: string, serverId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: buddyPermissions.id })
      .from(buddyPermissions)
      .where(
        and(
          eq(buddyPermissions.buddyId, buddyId),
          eq(buddyPermissions.serverId, serverId),
          eq(buddyPermissions.userId, userId)
        )
      )
      .limit(1)
    return result.length > 0
  }

  // ==================== Permission Mutations ====================

  /**
   * Create or update a permission
   */
  async upsert(data: {
    buddyId: string
    serverId: string
    channelId?: string | null
    userId: string
    canView?: boolean
    canInteract?: boolean
    canMention?: boolean
    canManage?: boolean
  }) {
    // Check for existing permission
    const existing = data.channelId
      ? await this.findChannelPermission(data.buddyId, data.serverId, data.channelId, data.userId)
      : await this.findServerPermission(data.buddyId, data.serverId, data.userId)

    const now = new Date()

    if (existing) {
      const result = await this.db
        .update(buddyPermissions)
        .set({
          canView: data.canView ?? existing.canView,
          canInteract: data.canInteract ?? existing.canInteract,
          canMention: data.canMention ?? existing.canMention,
          canManage: data.canManage ?? existing.canManage,
          updatedAt: now,
        })
        .where(eq(buddyPermissions.id, existing.id))
        .returning()
      return result[0]
    }

    const result = await this.db
      .insert(buddyPermissions)
      .values({
        buddyId: data.buddyId,
        serverId: data.serverId,
        channelId: data.channelId ?? null,
        userId: data.userId,
        canView: data.canView ?? true,
        canInteract: data.canInteract ?? true,
        canMention: data.canMention ?? true,
        canManage: data.canManage ?? false,
      })
      .returning()
    return result[0]
  }

  /**
   * Batch upsert permissions
   */
  async batchUpsert(
    permissions: Array<{
      buddyId: string
      serverId: string
      channelId?: string | null
      userId: string
      canView?: boolean
      canInteract?: boolean
      canMention?: boolean
      canManage?: boolean
    }>
  ) {
    const results = []
    for (const perm of permissions) {
      const result = await this.upsert(perm)
      results.push(result)
    }
    return results
  }

  /**
   * Update a specific permission by ID
   */
  async update(
    permissionId: string,
    data: {
      canView?: boolean
      canInteract?: boolean
      canMention?: boolean
      canManage?: boolean
    }
  ) {
    const result = await this.db
      .update(buddyPermissions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(buddyPermissions.id, permissionId))
      .returning()
    return result[0] ?? null
  }

  /**
   * Delete a specific permission
   */
  async delete(permissionId: string) {
    await this.db.delete(buddyPermissions).where(eq(buddyPermissions.id, permissionId))
  }

  /**
   * Delete all permissions for a Buddy in a server
   */
  async deleteByBuddyAndServer(buddyId: string, serverId: string) {
    await this.db
      .delete(buddyPermissions)
      .where(and(eq(buddyPermissions.buddyId, buddyId), eq(buddyPermissions.serverId, serverId)))
  }

  /**
   * Delete all permissions for a Buddy
   */
  async deleteByBuddyId(buddyId: string) {
    await this.db.delete(buddyPermissions).where(eq(buddyPermissions.buddyId, buddyId))
  }

  // ==================== Server Settings Queries ====================

  /**
   * Find settings for a Buddy in a specific server
   */
  async findServerSettings(buddyId: string, serverId: string) {
    const result = await this.db
      .select()
      .from(buddyServerSettings)
      .where(
        and(
          eq(buddyServerSettings.buddyId, buddyId),
          eq(buddyServerSettings.serverId, serverId)
        )
      )
      .limit(1)
    return result[0] ?? null
  }

  /**
   * Find all server settings for a Buddy
   */
  async findAllServerSettings(buddyId: string) {
    return this.db
      .select()
      .from(buddyServerSettings)
      .where(eq(buddyServerSettings.buddyId, buddyId))
  }

  // ==================== Server Settings Mutations ====================

  /**
   * Create or update server settings
   */
  async upsertServerSettings(data: {
    buddyId: string
    serverId: string
    visibility?: 'public' | 'private' | 'restricted'
    isPrivate?: boolean
    defaultCanView?: boolean
    defaultCanInteract?: boolean
    defaultCanMention?: boolean
  }) {
    const existing = await this.findServerSettings(data.buddyId, data.serverId)
    const now = new Date()

    if (existing) {
      const result = await this.db
        .update(buddyServerSettings)
        .set({
          visibility: data.visibility ?? existing.visibility,
          isPrivate: data.isPrivate ?? existing.isPrivate,
          defaultCanView: data.defaultCanView ?? existing.defaultCanView,
          defaultCanInteract: data.defaultCanInteract ?? existing.defaultCanInteract,
          defaultCanMention: data.defaultCanMention ?? existing.defaultCanMention,
          updatedAt: now,
        })
        .where(eq(buddyServerSettings.id, existing.id))
        .returning()
      return result[0]
    }

    const result = await this.db
      .insert(buddyServerSettings)
      .values({
        buddyId: data.buddyId,
        serverId: data.serverId,
        visibility: data.visibility ?? 'public',
        isPrivate: data.isPrivate ?? false,
        defaultCanView: data.defaultCanView ?? true,
        defaultCanInteract: data.defaultCanInteract ?? true,
        defaultCanMention: data.defaultCanMention ?? true,
      })
      .returning()
    return result[0]
  }

  /**
   * Delete server settings
   */
  async deleteServerSettings(buddyId: string, serverId: string) {
    await this.db
      .delete(buddyServerSettings)
      .where(
        and(
          eq(buddyServerSettings.buddyId, buddyId),
          eq(buddyServerSettings.serverId, serverId)
        )
      )
  }

  /**
   * Get all allowed user IDs for a private Buddy in a server/channel
   */
  async getAllowedUserIds(
    buddyId: string,
    serverId: string,
    channelId?: string | null
  ): Promise<string[]> {
    const conditions = [
      eq(buddyPermissions.buddyId, buddyId),
      eq(buddyPermissions.serverId, serverId),
      eq(buddyPermissions.canInteract, true),
    ]

    if (channelId) {
      conditions.push(eq(buddyPermissions.channelId, channelId))
    } else {
      conditions.push(isNull(buddyPermissions.channelId))
    }

    const result = await this.db
      .select({ userId: buddyPermissions.userId })
      .from(buddyPermissions)
      .where(and(...conditions))

    return result.map((r) => r.userId)
  }
}
