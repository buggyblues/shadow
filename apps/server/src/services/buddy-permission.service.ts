import type { Logger } from 'pino'
import type { BuddyPermissionDao } from '../dao/buddy-permission.dao'
import type { AgentDao } from '../dao/agent.dao'
import type { UserDao } from '../dao/user.dao'

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

  // ==================== Permission Checks ====================

  /**
   * Check if a user can view a Buddy
   */
  async canView(
    buddyId: string,
    serverId: string,
    userId: string,
    channelId?: string | null
  ): Promise<boolean> {
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)

    // If public or no settings, allow view
    if (!settings || !settings.isPrivate) return true

    // Buddy owner can always view
    const buddy = await this.deps.agentDao.findById(buddyId)
    if (buddy?.ownerId === userId) return true

    // Check explicit permission
    const permission = await this.deps.buddyPermissionDao.findEffectivePermission(
      buddyId,
      serverId,
      channelId,
      userId
    )

    if (permission) return permission.canView

    // Fall back to defaults
    return settings.defaultCanView
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
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)

    // If public or no settings, allow interaction
    if (!settings || !settings.isPrivate) return true

    // Buddy owner can always interact
    const buddy = await this.deps.agentDao.findById(buddyId)
    if (buddy?.ownerId === userId) return true

    // Check explicit permission
    const permission = await this.deps.buddyPermissionDao.findEffectivePermission(
      buddyId,
      serverId,
      channelId,
      userId
    )

    if (permission) return permission.canInteract

    // Fall back to defaults
    return settings.defaultCanInteract
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
    const settings = await this.deps.buddyPermissionDao.findServerSettings(buddyId, serverId)

    // If public or no settings, allow mention
    if (!settings || !settings.isPrivate) return true

    // Buddy owner can always mention
    const buddy = await this.deps.agentDao.findById(buddyId)
    if (buddy?.ownerId === userId) return true

    // Check explicit permission
    const permission = await this.deps.buddyPermissionDao.findEffectivePermission(
      buddyId,
      serverId,
      channelId,
      userId
    )

    if (permission) return permission.canMention

    // Fall back to defaults
    return settings.defaultCanMention
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
    // Buddy owner can always manage
    const buddy = await this.deps.agentDao.findById(buddyId)
    if (buddy?.ownerId === userId) return true

    // Check explicit manage permission
    const permission = await this.deps.buddyPermissionDao.findEffectivePermission(
      buddyId,
      serverId,
      channelId,
      userId
    )

    return permission?.canManage ?? false
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
    // Verify ownership
    const buddy = await this.deps.agentDao.findById(data.buddyId)
    if (!buddy) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (buddy.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
    }

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
    // Verify ownership
    const buddy = await this.deps.agentDao.findById(buddyId)
    if (!buddy) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (buddy.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
    }

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
    // Verify ownership
    const buddy = await this.deps.agentDao.findById(buddyId)
    if (!buddy) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (buddy.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
    }

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
    // Verify ownership
    const buddy = await this.deps.agentDao.findById(data.buddyId)
    if (!buddy) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (buddy.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
    }

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

    // Enrich with user details
    const enriched = await Promise.all(
      permissions.map(async (perm) => {
        const user = await this.deps.userDao.findById(perm.userId)
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
    )

    return enriched
  }
}