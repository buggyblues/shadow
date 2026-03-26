import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createPermissionSchema,
  updatePermissionSchema,
  updateServerSettingsSchema,
} from '../validators/buddy-permission.schema'

/**
 * Buddy Permission Handler
 *
 * Routes:
 * - GET    /api/agents/:id/permissions          - List permissions
 * - POST   /api/agents/:id/permissions          - Grant permission
 * - PATCH  /api/agents/:id/permissions/:permId  - Update permission
 * - DELETE /api/agents/:id/permissions/:permId  - Revoke permission
 * - GET    /api/agents/:id/server-settings      - Get server settings
 * - PUT    /api/agents/:id/server-settings      - Update server settings
 */
export function createBuddyPermissionHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('*', authMiddleware)

  // ==================== Permission Routes ====================

  // GET /api/agents/:id/permissions - List permissions
  handler.get('/:id/permissions', async (c) => {
    const buddyPermissionService = container.resolve('buddyPermissionService')
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const buddyId = c.req.param('id')

    // Verify ownership
    const buddy = await agentService.getById(buddyId)
    if (!buddy) {
      return c.json({ error: 'Buddy not found' }, 404)
    }
    if (buddy.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Parse query filters
    const query = c.req.query()
    const filters = {
      serverId: query.serverId,
      channelId: query.channelId === 'null' ? null : query.channelId,
      userId: query.userId,
    }

    try {
      const permissions = await buddyPermissionService.getPermissionsWithUsers(buddyId, filters)
      return c.json({ permissions })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 404 | 403)
    }
  })

  // POST /api/agents/:id/permissions - Grant permission
  handler.post('/:id/permissions', zValidator('json', createPermissionSchema), async (c) => {
    const buddyPermissionService = container.resolve('buddyPermissionService')
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const buddyId = c.req.param('id')
    const input = c.req.valid('json')

    // Verify ownership
    const buddy = await agentService.getById(buddyId)
    if (!buddy) {
      return c.json({ error: 'Buddy not found' }, 404)
    }
    if (buddy.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const permission = await buddyPermissionService.grantPermission(user.userId, {
        buddyId,
        serverId: input.serverId,
        channelId: input.channelId,
        userId: input.userId,
        canView: input.canView,
        canInteract: input.canInteract,
        canMention: input.canMention,
        canManage: input.canManage,
      })
      return c.json(permission, 201)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 400 | 403 | 404)
    }
  })

  // PATCH /api/agents/:id/permissions/:permId - Update permission
  handler.patch(
    '/:id/permissions/:permId',
    zValidator('json', updatePermissionSchema),
    async (c) => {
      const buddyPermissionService = container.resolve('buddyPermissionService')
      const agentService = container.resolve('agentService')
      const user = c.get('user')
      const buddyId = c.req.param('id')
      const permissionId = c.req.param('permId')
      const input = c.req.valid('json')

      // Verify ownership
      const buddy = await agentService.getById(buddyId)
      if (!buddy) {
        return c.json({ error: 'Buddy not found' }, 404)
      }
      if (buddy.ownerId !== user.userId) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      try {
        const permission = await buddyPermissionService.updatePermission(
          user.userId,
          buddyId,
          permissionId,
          {
            canView: input.canView,
            canInteract: input.canInteract,
            canMention: input.canMention,
            canManage: input.canManage,
          }
        )
        return c.json(permission)
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500
        return c.json({ error: (err as Error).message }, status as 403 | 404)
      }
    }
  )

  // DELETE /api/agents/:id/permissions/:permId - Revoke permission
  handler.delete('/:id/permissions/:permId', async (c) => {
    const buddyPermissionService = container.resolve('buddyPermissionService')
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const buddyId = c.req.param('id')
    const permissionId = c.req.param('permId')

    // Verify ownership
    const buddy = await agentService.getById(buddyId)
    if (!buddy) {
      return c.json({ error: 'Buddy not found' }, 404)
    }
    if (buddy.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      await buddyPermissionService.revokePermission(user.userId, buddyId, permissionId)
      return c.json({ success: true })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 403 | 404)
    }
  })

  // ==================== Server Settings Routes ====================

  // GET /api/agents/:id/server-settings - Get server settings
  handler.get('/:id/server-settings', async (c) => {
    const buddyPermissionService = container.resolve('buddyPermissionService')
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const buddyId = c.req.param('id')
    const serverId = c.req.query('serverId')

    // Verify ownership
    const buddy = await agentService.getById(buddyId)
    if (!buddy) {
      return c.json({ error: 'Buddy not found' }, 404)
    }
    if (buddy.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      if (serverId) {
        const settings = await buddyPermissionService.getServerSettings(buddyId, serverId)
        return c.json({ settings })
      } else {
        const settings = await buddyPermissionService.getAllServerSettings(buddyId)
        return c.json({ settings })
      }
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 404)
    }
  })

  // PUT /api/agents/:id/server-settings - Update server settings
  handler.put('/:id/server-settings', zValidator('json', updateServerSettingsSchema), async (c) => {
    const buddyPermissionService = container.resolve('buddyPermissionService')
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const buddyId = c.req.param('id')
    const input = c.req.valid('json')

    // Verify ownership
    const buddy = await agentService.getById(buddyId)
    if (!buddy) {
      return c.json({ error: 'Buddy not found' }, 404)
    }
    if (buddy.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const settings = await buddyPermissionService.updateServerSettings(user.userId, {
        buddyId,
        serverId: input.serverId,
        visibility: input.visibility,
        isPrivate: input.isPrivate,
        defaultCanView: input.defaultCanView,
        defaultCanInteract: input.defaultCanInteract,
        defaultCanMention: input.defaultCanMention,
      })
      return c.json(settings)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 403 | 404)
    }
  })

  return handler
}
