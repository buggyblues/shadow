import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createThreadSchema,
  interactiveActionSchema,
  reactionSchema,
  sendMessageSchema,
  updateMessageSchema,
  updateThreadSchema,
} from '../validators/message.schema'

type InteractiveBlockLite = {
  id: string
  kind: string
  oneShot?: boolean
  responsePrompt?: string
  fields?: Array<{
    id: string
    label?: string
    options?: Array<{ id: string; label?: string; value?: string }>
  }>
}

function asInteractiveBlock(value: unknown): InteractiveBlockLite | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.kind !== 'string') return null
  const fields = Array.isArray(record.fields)
    ? record.fields
        .filter((field): field is Record<string, unknown> => {
          return Boolean(field) && typeof field === 'object' && !Array.isArray(field)
        })
        .flatMap((field) => {
          if (typeof field.id !== 'string') return []
          const options = Array.isArray(field.options)
            ? field.options
                .filter((option): option is Record<string, unknown> => {
                  return Boolean(option) && typeof option === 'object' && !Array.isArray(option)
                })
                .flatMap((option) => {
                  if (typeof option.id !== 'string') return []
                  return [
                    {
                      id: option.id,
                      label: typeof option.label === 'string' ? option.label : undefined,
                      value: typeof option.value === 'string' ? option.value : undefined,
                    },
                  ]
                })
            : undefined
          return [
            {
              id: field.id,
              label: typeof field.label === 'string' ? field.label : undefined,
              options,
            },
          ]
        })
    : undefined
  return {
    id: record.id,
    kind: record.kind,
    ...(typeof record.oneShot === 'boolean' ? { oneShot: record.oneShot } : {}),
    ...(typeof record.responsePrompt === 'string' && record.responsePrompt.trim()
      ? { responsePrompt: record.responsePrompt.trim() }
      : {}),
    fields,
  }
}

function formatInteractiveEcho(
  block: InteractiveBlockLite,
  input: { actionId: string; value?: string; label?: string; values?: Record<string, string> },
) {
  const label = input.label ?? input.actionId
  const value = input.value ?? input.actionId
  const entries = input.values ? Object.entries(input.values) : []

  if (entries.length > 0) {
    const lines = entries.map(([fieldId, rawValue]) => {
      const field = block.fields?.find((candidate) => candidate.id === fieldId)
      const fieldLabel = field?.label ?? fieldId
      const option = field?.options?.find((candidate) => {
        return candidate.value === rawValue || candidate.id === rawValue
      })
      return `- ${fieldLabel}: ${option?.label ?? rawValue}`
    })
    return `${block.responsePrompt ?? label}\n${lines.join('\n')}`
  }

  if (value && value !== label) {
    return `${label} (${value})`
  }

  return label
}

export function createMessageHandler(container: AppContainer) {
  const messageHandler = new Hono()

  messageHandler.use('*', authMiddleware)

  // GET /api/messages/:id — single message lookup (used by notification click-through)
  messageHandler.get('/messages/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const user = c.get('user')
    const message = await messageService.getById(id, user.userId)
    if (!message) return c.json({ ok: false, error: 'Message not found' }, 404)
    return c.json(message)
  })

  // GET /api/channels/:channelId/messages
  messageHandler.get('/channels/:channelId/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const user = c.get('user')
    const result = await messageService.getByChannelId(channelId, limit, cursor, user.userId)
    return c.json(result)
  })

  // POST /api/channels/:channelId/messages
  messageHandler.post(
    '/channels/:channelId/messages',
    zValidator('json', sendMessageSchema),
    async (c) => {
      const messageService = container.resolve('messageService')
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const user = c.get('user')
      const message = await messageService.send(channelId, user.userId, input)

      // Emit WS event so all connected clients (including bots) see the message
      try {
        const io = container.resolve('io')
        io.to(`channel:${channelId}`).emit('message:new', message)
      } catch {
        /* io not yet registered */
      }

      return c.json(message, 201)
    },
  )

  // POST /api/messages/:id/interactive — handle a click on an interactive block.
  // Posts a follow-up message into the same channel whose
  // `metadata.interactiveResponse` carries the action so the buddy agent
  // receives it through normal chat flow.
  messageHandler.post(
    '/messages/:id/interactive',
    zValidator('json', interactiveActionSchema),
    async (c) => {
      const messageService = container.resolve('messageService')
      const sourceId = c.req.param('id')
      const input = c.req.valid('json')
      const user = c.get('user')

      const source = await messageService.getById(sourceId)
      if (!source) return c.json({ ok: false, error: 'Source message not found' }, 404)
      const block = asInteractiveBlock(source.metadata?.interactive)
      if (!block) {
        return c.json({ ok: false, error: 'Source message has no interactive block' }, 400)
      }
      if (block.id !== input.blockId) {
        return c.json({ ok: false, error: 'blockId mismatch' }, 400)
      }

      const value = input.value ?? input.actionId
      const echoContent = formatInteractiveEcho(block, input)

      let submission: Awaited<ReturnType<typeof messageService.createInteractiveSubmission>> = null
      if (block.oneShot !== false) {
        const existing = await messageService.getInteractiveSubmission(
          sourceId,
          block.id,
          user.userId,
        )
        if (existing) {
          if (existing.responseMessageId) {
            const existingMessage = await messageService.getById(
              existing.responseMessageId,
              user.userId,
            )
            if (existingMessage) return c.json(existingMessage)
          }
          return c.json({
            ok: true,
            pending: true,
            interactiveState: {
              sourceMessageId: existing.sourceMessageId,
              blockId: existing.blockId,
              submitted: true,
              response: {
                blockId: existing.blockId,
                sourceMessageId: existing.sourceMessageId,
                actionId: existing.actionId,
                value: existing.value,
                ...(existing.values ? { values: existing.values } : {}),
                submissionId: existing.id,
                responseMessageId: existing.responseMessageId,
                submittedAt: existing.createdAt.toISOString(),
              },
            },
          })
        }

        submission = await messageService.createInteractiveSubmission(
          sourceId,
          block.id,
          user.userId,
          {
            actionId: input.actionId,
            value,
            values: input.values,
          },
        )
        if (!submission) {
          const duplicate = await messageService.getInteractiveSubmission(
            sourceId,
            block.id,
            user.userId,
          )
          if (duplicate?.responseMessageId) {
            const duplicateMessage = await messageService.getById(
              duplicate.responseMessageId,
              user.userId,
            )
            if (duplicateMessage) return c.json(duplicateMessage)
          }
          return c.json({ ok: true, pending: true })
        }
      }

      const message = await messageService.send(source.channelId, user.userId, {
        content: echoContent,
        replyToId: sourceId,
        metadata: {
          interactiveResponse: {
            blockId: block.id,
            sourceMessageId: sourceId,
            actionId: input.actionId,
            value,
            ...(input.values ? { values: input.values } : {}),
          },
        },
      })

      if (submission) {
        await messageService.updateInteractiveSubmissionResponse(submission.id, message.id)
      }

      try {
        const io = container.resolve('io')
        io.to(`channel:${source.channelId}`).emit('message:new', message)
      } catch {
        /* io not yet registered */
      }

      return c.json(message, 201)
    },
  )
  messageHandler.patch('/messages/:id', zValidator('json', updateMessageSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const message = await messageService.update(id, user.userId, input)

    // Emit WS event
    try {
      const io = container.resolve('io')
      io.to(`channel:${message.channelId}`).emit('message:updated', message)
    } catch {
      /* io not yet registered */
    }

    return c.json(message)
  })

  // DELETE /api/messages/:id
  messageHandler.delete('/messages/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const agentDao = container.resolve('agentDao')
    const id = c.req.param('id')
    const user = c.get('user')

    // Check if the requester is the bot's owner (can delete bot's messages)
    const message = await messageService.getById(id)
    if (!message) return c.json({ ok: false, error: 'Message not found' }, 404)

    let canDelete = message.authorId === user.userId
    if (!canDelete && message.authorId) {
      // Check if the message author is a bot owned by the requester
      const agent = await agentDao.findByUserId(message.authorId)
      if (agent && agent.ownerId === user.userId) {
        canDelete = true
      }
    }
    if (!canDelete) {
      return c.json({ ok: false, error: 'Not authorized to delete this message' }, 403)
    }

    const deleted = await messageService.deleteById(id)

    // Emit WS event
    try {
      const io = container.resolve('io')
      io.to(`channel:${deleted.channelId}`).emit('message:deleted', {
        id,
        channelId: deleted.channelId,
      })
    } catch {
      /* io not yet registered */
    }

    return c.json({ ok: true })
  })

  // POST /api/channels/:channelId/threads
  messageHandler.post(
    '/channels/:channelId/threads',
    zValidator('json', createThreadSchema),
    async (c) => {
      const messageService = container.resolve('messageService')
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const user = c.get('user')
      const thread = await messageService.createThread(channelId, user.userId, input)
      return c.json(thread, 201)
    },
  )

  // GET /api/channels/:channelId/threads
  messageHandler.get('/channels/:channelId/threads', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const threads = await messageService.getThreadsByChannelId(channelId)
    return c.json(threads)
  })

  // GET /api/threads/:id
  messageHandler.get('/threads/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const thread = await messageService.getThread(id)
    return c.json(thread)
  })

  // PATCH /api/threads/:id
  messageHandler.patch('/threads/:id', zValidator('json', updateThreadSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const thread = await messageService.updateThread(id, user.userId, input)
    return c.json(thread)
  })

  // DELETE /api/threads/:id
  messageHandler.delete('/threads/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const user = c.get('user')
    await messageService.deleteThread(id, user.userId)
    return c.json({ ok: true })
  })

  // GET /api/threads/:id/messages
  messageHandler.get('/threads/:id/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const messages = await messageService.getThreadMessages(id, limit, cursor)
    return c.json(messages)
  })

  // POST /api/threads/:id/messages
  messageHandler.post('/threads/:id/messages', zValidator('json', sendMessageSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const message = await messageService.sendToThread(id, user.userId, {
      content: input.content,
    })
    return c.json(message, 201)
  })

  // PUT /api/channels/:channelId/pins/:messageId
  messageHandler.put('/channels/:channelId/pins/:messageId', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messageId = c.req.param('messageId')
    const message = await messageService.pinMessage(channelId, messageId)
    return c.json(message)
  })

  // DELETE /api/channels/:channelId/pins/:messageId
  messageHandler.delete('/channels/:channelId/pins/:messageId', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messageId = c.req.param('messageId')
    const message = await messageService.unpinMessage(channelId, messageId)
    return c.json(message)
  })

  // GET /api/channels/:channelId/pins
  messageHandler.get('/channels/:channelId/pins', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messages = await messageService.getPinnedMessages(channelId)
    return c.json(messages)
  })

  // POST /api/messages/:id/reactions
  messageHandler.post('/messages/:id/reactions', zValidator('json', reactionSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const reaction = await messageService.addReaction(id, user.userId, input)

    // Broadcast reaction via WS
    try {
      const io = container.resolve('io')
      const message = await messageService.getById(id)
      if (message) {
        const reactions = await messageService.getReactions(id)
        io.to(`channel:${message.channelId}`).emit('reaction:updated', {
          messageId: id,
          channelId: message.channelId,
          reactions,
        })
      }
    } catch {
      /* io not yet registered */
    }

    return c.json(reaction, 201)
  })

  // DELETE /api/messages/:id/reactions/:emoji
  messageHandler.delete('/messages/:id/reactions/:emoji', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const emoji = c.req.param('emoji')
    const user = c.get('user')
    await messageService.removeReaction(id, user.userId, emoji)

    // Broadcast reaction removal via WS
    try {
      const io = container.resolve('io')
      const message = await messageService.getById(id)
      if (message) {
        const reactions = await messageService.getReactions(id)
        io.to(`channel:${message.channelId}`).emit('reaction:updated', {
          messageId: id,
          channelId: message.channelId,
          reactions,
        })
      }
    } catch {
      /* io not yet registered */
    }

    return c.json({ ok: true })
  })

  // GET /api/messages/:id/reactions
  messageHandler.get('/messages/:id/reactions', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const reactions = await messageService.getReactions(id)
    return c.json(reactions)
  })

  return messageHandler
}
