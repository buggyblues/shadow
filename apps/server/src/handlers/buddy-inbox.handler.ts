import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import type { TaskMessageCardMetadata } from '../db/schema/messages'
import { authMiddleware } from '../middleware/auth.middleware'
import { messageCardStatusSchema } from '../validators/message.schema'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const enqueueTaskSchema = z.object({
  title: z.string().min(1).max(180),
  body: z.string().max(8000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  tags: z
    .array(
      z.union([
        z.string().min(1).max(48),
        z
          .object({
            id: z.string().min(1).max(80).optional(),
            label: z.string().min(1).max(48),
            color: z.string().min(1).max(40).optional(),
          })
          .passthrough(),
      ]),
    )
    .max(12)
    .optional(),
  app: z
    .object({
      id: z.string().max(160).optional(),
      appId: z.string().max(160).optional(),
      appKey: z.string().max(120).optional(),
      name: z.string().max(160).nullable().optional(),
      label: z.string().max(160).nullable().optional(),
      iconUrl: z.string().max(1000).nullable().optional(),
      logoUrl: z.string().max(1000).nullable().optional(),
      avatarUrl: z.string().max(1000).nullable().optional(),
      imageUrl: z.string().max(1000).nullable().optional(),
      url: z.string().max(1000).nullable().optional(),
    })
    .passthrough()
    .optional(),
  idempotencyKey: z.string().min(1).max(240).optional(),
  source: z.record(z.string(), z.unknown()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})

const updateTaskCardSchema = z.object({
  status: messageCardStatusSchema,
  note: z.string().max(4000).optional(),
})

const claimTaskCardSchema = z.object({
  ttlSeconds: z.number().int().min(60).max(86400).optional(),
  note: z.string().max(4000).optional(),
})

const retryTaskCardSchema = z.object({
  note: z.string().max(4000).optional(),
})

const promoteMessageSchema = z.object({
  serverId: z.string().min(1),
  agentId: z.string().uuid(),
  title: z.string().min(1).max(180).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
})

const admissionModeSchema = z.enum(['allow', 'deny', 'first_time', 'every_time'])

const admissionPolicySchema = z.object({
  defaultMode: admissionModeSchema.default('allow'),
  rules: z
    .array(
      z.object({
        subjectKind: z.enum(['user', 'agent', 'server_app', 'system']),
        subjectId: z.string().min(1).max(160).optional(),
        appKey: z.string().min(1).max(120).optional(),
        mode: admissionModeSchema,
        approved: z.boolean().optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .max(100)
    .default([]),
})

export function createBuddyInboxHandler(container: AppContainer) {
  const handler = new Hono()
  handler.use('*', authMiddleware)

  async function resolveServerId(param: string) {
    if (UUID_RE.test(param)) return param
    const server = await container.resolve('serverDao').findBySlug(param)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    return server.id
  }

  handler.get('/buddy-inboxes', async (c) => {
    const inboxes = await container.resolve('buddyInboxService').listForUser(c.get('actor'))
    return c.json(inboxes)
  })

  handler.get('/servers/:serverId/inboxes', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const inboxes = await container
      .resolve('buddyInboxService')
      .listForServer(serverId, c.get('actor'))
    return c.json(inboxes)
  })

  handler.post('/servers/:serverId/inboxes/:agentId', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const agentId = c.req.param('agentId')
    const result = await container
      .resolve('buddyInboxService')
      .ensure(serverId, agentId, c.get('actor'))

    try {
      const io = container.resolve('io')
      if (result.created) {
        io.to(`user:${result.agent.ownerId}`).emit('channel:created', {
          ...result.channel,
          serverId,
        })
      }
      io.to(`user:${result.agent.userId}`).emit('channel:member-added', {
        channelId: result.channel.id,
        serverId,
      })
    } catch {
      /* socket fanout is best-effort */
    }

    return c.json(result, result.created ? 201 : 200)
  })

  handler.get('/servers/:serverId/inboxes/:agentId/admission-policy', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const result = await container
      .resolve('buddyInboxService')
      .getAdmissionPolicy(serverId, c.req.param('agentId'), c.get('actor'))
    return c.json(result)
  })

  handler.put(
    '/servers/:serverId/inboxes/:agentId/admission-policy',
    zValidator('json', admissionPolicySchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const result = await container
        .resolve('buddyInboxService')
        .updateAdmissionPolicy(
          serverId,
          c.req.param('agentId'),
          c.req.valid('json'),
          c.get('actor'),
        )

      try {
        if (result.channel?.id) {
          container
            .resolve('io')
            .to(`channel:${result.channel.id}`)
            .emit('buddy-inbox:admission-policy-updated', result)
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(result)
    },
  )

  handler.get('/servers/:serverId/inboxes/:agentId/admission-pending', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const result = await container
      .resolve('buddyInboxService')
      .listAdmissionPending(serverId, c.req.param('agentId'), c.get('actor'))
    return c.json(result)
  })

  handler.post(
    '/servers/:serverId/inboxes/:agentId/admission-pending/:pendingId/approve',
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const result = await container
        .resolve('buddyInboxService')
        .approveAdmissionPending(
          serverId,
          c.req.param('agentId'),
          c.req.param('pendingId'),
          c.get('actor'),
        )

      try {
        if (result.channel?.id) {
          const io = container.resolve('io')
          io.to(`channel:${result.channel.id}`).emit(
            'buddy-inbox:admission-pending-updated',
            result,
          )
          if (result.message?.channelId) {
            io.to(`channel:${result.message.channelId}`).emit('message:new', result.message)
          }
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(result, 201)
    },
  )

  handler.post(
    '/servers/:serverId/inboxes/:agentId/admission-pending/:pendingId/reject',
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const result = await container
        .resolve('buddyInboxService')
        .rejectAdmissionPending(
          serverId,
          c.req.param('agentId'),
          c.req.param('pendingId'),
          c.get('actor'),
        )

      try {
        if (result.channel?.id) {
          container
            .resolve('io')
            .to(`channel:${result.channel.id}`)
            .emit('buddy-inbox:admission-pending-updated', result)
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(result)
    },
  )

  handler.post(
    '/servers/:serverId/inboxes/:agentId/tasks',
    zValidator('json', enqueueTaskSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const input = c.req.valid('json')
      const message = await container
        .resolve('buddyInboxService')
        .enqueueTaskForAgent(
          serverId,
          c.req.param('agentId'),
          { ...input, source: input.source as TaskMessageCardMetadata['source'] | undefined },
          c.get('actor'),
        )

      try {
        container.resolve('io').to(`channel:${message.channelId}`).emit('message:new', message)
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(message, 201)
    },
  )

  handler.post(
    '/channels/:channelId/inbox/tasks',
    zValidator('json', enqueueTaskSchema),
    async (c) => {
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const message = await container
        .resolve('buddyInboxService')
        .enqueueTask(
          channelId,
          { ...input, source: input.source as TaskMessageCardMetadata['source'] | undefined },
          c.get('actor'),
        )

      try {
        container.resolve('io').to(`channel:${channelId}`).emit('message:new', message)
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(message, 201)
    },
  )

  handler.post(
    '/servers/:serverId/inboxes/:agentId/claim-next',
    zValidator('json', claimTaskCardSchema.optional().default({})),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const result = await container
        .resolve('buddyInboxService')
        .claimNextTask(serverId, c.req.param('agentId'), c.get('actor'))

      try {
        if (result.message?.channelId) {
          container
            .resolve('io')
            .to(`channel:${result.message.channelId}`)
            .emit('message:updated', result.message)
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(result)
    },
  )

  handler.post(
    '/messages/:messageId/cards/:cardId/claim',
    zValidator('json', claimTaskCardSchema.optional().default({})),
    async (c) => {
      const message = await container
        .resolve('buddyInboxService')
        .claimTaskCard(
          c.req.param('messageId'),
          c.req.param('cardId'),
          c.get('actor'),
          c.req.valid('json'),
        )

      try {
        if (message?.channelId) {
          container
            .resolve('io')
            .to(`channel:${message.channelId}`)
            .emit('message:updated', message)
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(message)
    },
  )

  handler.post(
    '/messages/:messageId/inbox/tasks',
    zValidator('json', promoteMessageSchema),
    async (c) => {
      const input = c.req.valid('json')
      const serverId = await resolveServerId(input.serverId)
      const message = await container
        .resolve('buddyInboxService')
        .promoteMessageToTask(c.req.param('messageId'), { ...input, serverId }, c.get('actor'))

      try {
        if (message?.channelId) {
          container.resolve('io').to(`channel:${message.channelId}`).emit('message:new', message)
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(message, 201)
    },
  )

  handler.patch(
    '/messages/:messageId/cards/:cardId',
    zValidator('json', updateTaskCardSchema),
    async (c) => {
      const message = await container
        .resolve('buddyInboxService')
        .updateTaskCard(
          c.req.param('messageId'),
          c.req.param('cardId'),
          c.req.valid('json'),
          c.get('actor'),
        )

      try {
        if (message?.channelId) {
          container
            .resolve('io')
            .to(`channel:${message.channelId}`)
            .emit('message:updated', message)
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(message)
    },
  )

  handler.post(
    '/messages/:messageId/cards/:cardId/retry',
    zValidator('json', retryTaskCardSchema.optional().default({})),
    async (c) => {
      const result = await container
        .resolve('buddyInboxService')
        .retryTaskCard(
          c.req.param('messageId'),
          c.req.param('cardId'),
          c.get('actor'),
          c.req.valid('json'),
        )

      try {
        if (result.original?.channelId) {
          container
            .resolve('io')
            .to(`channel:${result.original.channelId}`)
            .emit('message:updated', result.original)
        }
        if (result.retry?.channelId) {
          container
            .resolve('io')
            .to(`channel:${result.retry.channelId}`)
            .emit('message:new', result.retry)
        }
      } catch {
        /* socket fanout is best-effort */
      }

      return c.json(result, 201)
    },
  )

  return handler
}
