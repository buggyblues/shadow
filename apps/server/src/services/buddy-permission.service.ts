import type { Logger } from 'pino'
import type { BuddyPermissionDao } from '../dao/buddy-permission.dao'
import type { AgentDao } from '../dao/agent.dao'
import type { UserDao } from '../dao/user.dao'

/**
 * Permission types for Buddy access control
 */
type PermissionKey = 'canView' | 'canInteract' | 'canMention' | 'canManage'
type DefaultPermissionKey = 'defaultCanView' | 'defaultCanInteract' | 'defaultCanMention'

/**
 * Maps permission keys to their corresponding default settings keys
 */
const PERMISSION_DEFAULT_MAP: Record<PermissionKey, DefaultPermissionKey> = {
  canView: 'defaultCanView',
  canInteract: 'defaultCanInteract',
  canMention: 'defaultCanMention',
  canManage: 'defaultCanMention', // manage uses mention default as fallback
}

/**
 * Service for managing Buddy permissions
 *
 * Handles business logic for:
 * - Permission checks and resolution
 * - Visibility calculations
 * - Permission grants and revocations
 */
export class BuddyPermissionService {
  constructor(
    private deps: {
      buddyPermissionDao: BuddyPermissionDao
      agentDao: AgentDao
      userDao: UserDao
      logger: Logger
    }
  ) {}

  // ==================== Private Helpers ====================

  /**
   * Generic permission check with DRY implementation
   * All public permission methods delegate to this
   */
  private async checkPermission(
    buddyId: string,
    serverId: string,
    userId: string,
    channelId: string | null | undefined,
    permissionKey: PermissionKey,
    defaultForPublic: boolean = true
  ): Promise<boolean> {
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)

    // Public mode: allow all (or use default)
    if (!settings || !settings.isPrivate) return defaultForPublic

    // Buddy owner has all permissions
    const buddy = await this.deps.agentDao.findById(buddyId)
    if (buddy?.ownerId === userId) return true

    // Check explicit permission
    const permission = await this.deps.buddyPermissionDao.findEffectivePermission(
      buddyId,
      serverId,
      channelId,
      userId
    )

    if (permission) return permission[permissionKey]

    // Fall back to defaults (manage defaults to false)
    if (permissionKey === 'canManage') return false

    const defaultKey = PERMISSION_DEFAULT_MAP[permissionKey]
    return settings[defaultKey] ?? defaultForPublic
  }

  /**
   * Verify that the user owns the Buddy
   * @throws {Error} 404 if Buddy not found, 403 if not owner
   */
  private async verifyOwnership(buddyId: string, ownerId: string) {
    const buddy = await this.deps.agentDao.findById(buddyId)

    if (!buddy) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }

    if (buddy.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
    }

    return buddy
  }

  // ==================== Public Permission Checks ====================

  /**
   * Check if a user can view a Buddy
   */
  async canView(
    buddyId: string,
    serverId: string,
    userId: string,
    channelId?: string | null
  ): Promise<boolean> {
    return this.checkPermission(buddyId, serverId, userId, channelId, 'canView')
  }

  /**
   * Check if a user can interact with a Buddy
   * (Buddy will see and respond to their messages)
   */
  async canInteract(
    buddyId: string,
    serverId: string,
    userId: string,
    channelId?: string | null
  ): Promise<boolean> {
    return this.checkPermission(buddyId, serverId, userId, channelId, 'canInteract')
  }

  /**
   * Check if a user can mention a Buddy
   */
  async canMention(
    buddyId: string,
    serverId: string,
    userId: string,
    channelId?: string | null
  ): Promise<boolean> {
    return this.checkPermission(buddyId, serverId, userId, channelId, 'canMention')
  }

  /**
   * Check if a user can manage a Buddy
   */
  async canManage(
    buddyId: string,
    serverId: string,
    userId: string,
    channelId?: string | null
  ): Promise<boolean> {
    return this.checkPermission(buddyId, serverId, userId, channelId, 'canManage', false)
  }

  // ==================== Bulk Operations ====================

  /**
   * Get all allowed user IDs for a Buddy in a server/channel
   * Used by WebSocket to filter message delivery
   */
  async getAllowedUserIds(
    buddyId: string,
    serverId: string,
    channelId?: string | null
  ): Promise<string[]> {
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)

    // If public, return empty array (meaning all users allowed)
    if (!settings || !settings.isPrivate) return []

    // Get explicitly allowed users
    return this.deps.buddyPermissionDao.getAllowedUserIds(buddyId, serverId, channelId)
  }

  /**
   * Check if a Buddy is private in a server
   */
  async isPrivate(buddyId: string, serverId: string): Promise<boolean> {
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)
    return settings?.isPrivate ?? false
  }

  /**
   * Get visibility level for a Buddy in a server
   */
  async getVisibility(
    buddyId: string,
    serverId: string
  ): Promise<'public' | 'private' | 'restricted'> {
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)
    return settings?.visibility ?? 'public'
  }

  // ==================== Permission Management ====================

  /**
   * Grant permission to a user
   */
  async grantPermission(
    ownerId: string,
    data: {
      buddyId: string
      serverId: string
      channelId?: string | null
      userId: string
      canView?: boolean
      canInteract?: boolean
      canMention?: boolean
      canManage?: boolean
    }
  ) {
    await this.verifyOwnership(data.buddyId, ownerId)

    // Cannot grant permissions to self (owner already has full access)
    if (data.userId === ownerId) {
      throw Object.assign(new Error('Cannot grant permissions to yourself'), { status: 400 })
    }

    const permission = await this.deps.buddyPermissionDao.upsert({
      buddyId: data.buddyId,
      serverId: data.serverId,
      channelId: data.channelId,
      userId: data.userId,
      canView: data.canView,
      canInteract: data.canInteract,
      canMention: data.canMention,
      canManage: data.canManage,
    })

    this.deps.logger.info(
      {
        buddyId: data.buddyId,
        serverId: data.serverId,
        userId: data.userId,
        grantedBy: ownerId,
      },
      'Permission granted'
    )

    return permission
  }

  /**
   * Revoke permission from a user
   */
  async revokePermission(ownerId: string, buddyId: string, permissionId: string) {
    await this.verifyOwnership(buddyId, ownerId)

    await this.deps.buddyPermissionDao.delete(permissionId)

    this.deps.logger.info(
      {
        buddyId,
        permissionId,
        revokedBy: ownerId,
      },
      'Permission revoked'
    )
  }

  /**
   * Update permission
   */
  async updatePermission(
    ownerId: string,
    buddyId: string,
    permissionId: string,
    data: {
      canView?: boolean
      canInteract?: boolean
      canMention?: boolean
      canManage?: boolean
    }
  ) {
    await this.verifyOwnership(buddyId, ownerId)

    const permission = await this.deps.buddyPermissionDao.update(permissionId, data)

    this.deps.logger.info(
      {
        buddyId,
        permissionId,
        updatedBy: ownerId,
        changes: data,
      },
      'Permission updated'
    )

    return permission
  }

  // ==================== Server Settings Management ====================

  /**
   * Get server settings for a Buddy
   */
  async getServerSettings(buddyId: string, serverId: string) {
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)

    if (!settings) {
      // Return default settings
      return {
        buddyId,
        serverId,
        visibility: 'public' as const,
        isPrivate: false,
        defaultCanView: true,
        defaultCanInteract: true,
        defaultCanMention: true,
      }
    }

    return settings
  }

  /**
   * Get all server settings for a Buddy
   */
  async getAllServerSettings(buddyId: string) {
    return this.deps.buddyPermissionDao.findAllServerSettings(buddyId)
  }

  /**
   * Update server settings
   */
  async updateServerSettings(
    ownerId: string,
    data: {
      buddyId: string
      serverId: string
      visibility?: 'public' | 'private' | 'restricted'
      isPrivate?: boolean
      defaultCanView?: boolean
      defaultCanInteract?: boolean
      defaultCanMention?: boolean
    }
  ) {
    await this.verifyOwnership(data.buddyId, ownerId)

    const settings = await this.deps.buddyPermissionDao.upsertServerSettings({
      buddyId: data.buddyId,
      serverId: data.serverId,
      visibility: data.visibility,
      isPrivate: data.isPrivate,
      defaultCanView: data.defaultCanView,
      defaultCanInteract: data.defaultCanInteract,
      defaultCanMention: data.defaultCanMention,
    })

    this.deps.logger.info(
      {
        buddyId: data.buddyId,
        serverId: data.serverId,
        updatedBy: ownerId,
        settings: data,
      },
      'Server settings updated'
    )

    return settings
  }

  /**
   * Ensure server settings exist (auto-create default)
   * Called when a Buddy is added to a server
   */
  async ensureServerSettings(buddyId: string, serverId: string) {
    const existing = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)
    if (existing) return existing

    return this.deps.buddyPermissionDao.upsertServerSettings({
      buddyId,
      serverId,
      visibility: 'public',
      isPrivate: false,
      defaultCanView: true,
      defaultCanInteract: true,
      defaultCanMention: true,
    })
  }

  /**
   * Get permissions list with user details
   * Optimized to avoid N+1 queries by batch fetching users
   */
  async getPermissionsWithUsers(
    buddyId: string,
    filters?: {
      serverId?: string
      channelId?: string | null
      userId?: string
    }
  ) {
    let permissions = await this.deps.buddyPermissionDao.findByBuddyId(buddyId)

    // Apply filters
    if (filters?.serverId) {
      permissions = permissions.filter((p) => p.serverId === filters.serverId)
    }

    if (filters?.channelId !== undefined) {
      permissions = permissions.filter(
        (p) =>
          (filters.channelId === null && p.channelId === null) ||
          p.channelId === filters.channelId
      )
    }

    if (filters?.userId) {
      permissions = permissions.filter((p) => p.userId === filters.userId)
    }

    // Batch fetch users to avoid N+1 queries
    const uniqueUserIds = [...new Set(permissions.map((p) => p.userId))]
    const users = await Promise.all(
      uniqueUserIds.map((id) => this.deps.userDao.findById(id))
    )
    const userMap = new Map(users.filter(Boolean).map((u) => [u!.id, u]))

    // Enrich without additional queries
    return permissions.map((perm) => {
      const user = userMap.get(perm.userId)
      return {
        ...perm,
        user: user
          ? {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            }
          : null,
      }
    })
  }
}