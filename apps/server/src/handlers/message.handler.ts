import { zValidator } from '@hono/zod-validator'
import type { MessageMention } from '@shadowob/shared'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { triggerCloudDeploymentAutoResumeForMentions } from '../lib/cloud-deployment-autoresume'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createThreadSchema,
  ensureThreadSchema,
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

function hasOAuthLinkCards(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const cards = (metadata as { oauthLinkCards?: unknown }).oauthLinkCards
  return Array.isArray(cards) && cards.length > 0
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

async function getChannelAccess(container: AppContainer, channelId: string, userId: string) {
  const channelAccessService = container.resolve('channelAccessService')
  return channelAccessService.getAccess(channelId, userId)
}

async function getMessageAccess(
  container: AppContainer,
  messageId: string,
  userId: string,
  notFoundError = 'Message not found',
) {
  const messageService = container.resolve('messageService')
  const message = await messageService.getById(messageId, userId)
  if (!message) {
    return { ok: false as const, status: 404 as const, error: notFoundError }
  }

  const access = await getChannelAccess(container, message.channelId, userId)
  if (!access.ok) {
    return {
      ok: false as const,
      status: access.status ?? 403,
      error: access.error ?? 'Channel access denied',
    }
  }
  return { ok: true as const, message }
}

export function createMessageHandler(container: AppContainer) {
  const messageHandler = new Hono()

  messageHandler.use('*', authMiddleware)

  // GET /api/messages/:id — single message lookup (used by notification click-through)
  messageHandler.get('/messages/:id', async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')
    const result = await getMessageAccess(container, id, user.userId)
    if (!result.ok) return c.json({ ok: false, error: result.error }, result.status)
    return c.json(result.message)
  })

  // POST /api/messages/:id/thread — ensure the canonical chat thread for a source message.
  messageHandler.post('/messages/:id/thread', async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')
    const parsedInput = ensureThreadSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsedInput.success) return c.json({ ok: false, error: 'Invalid request body' }, 400)
    const result = await getMessageAccess(container, id, user.userId)
    if (!result.ok) return c.json({ ok: false, error: result.error }, result.status)
    const messageService = container.resolve('messageService')
    return c.json(await messageService.ensureThreadForMessage(id, user.userId, parsedInput.data))
  })

  // GET /api/channels/:channelId/messages
  messageHandler.get('/channels/:channelId/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const user = c.get('user')
    const access = await getChannelAccess(container, channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const result = await messageService.getByChannelId(channelId, limit, cursor, user.userId)
    return c.json(result)
  })

  // GET /api/messages/:id/interactive-state — fetch the current user's
  // persisted state for rendering one-shot interactive blocks.
  messageHandler.get('/messages/:id/interactive-state', async (c) => {
    const messageService = container.resolve('messageService')
    const sourceId = c.req.param('id')
    const requestedBlockId = c.req.query('blockId')
    const user = c.get('user')

    const sourceResult = await getMessageAccess(
      container,
      sourceId,
      user.userId,
      'Source message not found',
    )
    if (!sourceResult.ok) {
      return c.json({ ok: false, error: sourceResult.error }, sourceResult.status)
    }
    const source = sourceResult.message
    const block = asInteractiveBlock(source.metadata?.interactive)
    if (!block) {
      return c.json({ ok: false, error: 'Source message has no interactive block' }, 400)
    }
    if (requestedBlockId && requestedBlockId !== block.id) {
      return c.json({ ok: false, error: 'blockId mismatch' }, 400)
    }

    return c.json(await messageService.getInteractiveState(sourceId, block.id, user.userId))
  })

  // POST /api/channels/:channelId/messages
  messageHandler.post(
    '/channels/:channelId/messages',
    zValidator('json', sendMessageSchema),
    async (c) => {
      const messageService = container.resolve('messageService')
      const mentionService = container.resolve('mentionService')
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const user = c.get('user')
      if (hasOAuthLinkCards(input.metadata)) {
        return c.json({ ok: false, error: 'OAuth link cards must be sent through OAuth APIs' }, 400)
      }
      const access = await getChannelAccess(container, channelId, user.userId)
      if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
      const commerceCardService = container.resolve('commerceCardService')
      const preparedInput = await mentionService.prepareMessageInput(channelId, user.userId, input)
      preparedInput.metadata = await commerceCardService.inferMessageMetadata({
        metadata: preparedInput.metadata as Record<string, unknown> | undefined,
        target: { kind: 'channel', channelId },
        authorId: user.userId,
        content: preparedInput.content,
      })
      const message = await messageService.send(channelId, user.userId, preparedInput)
      const messageMentions = Array.isArray(message.metadata?.mentions)
        ? (message.metadata.mentions as MessageMention[])
        : []
      triggerCloudDeploymentAutoResumeForMentions({
        container,
        mentions: messageMentions,
        reason: 'message mention',
        logContext: { channelId },
      })

      let directPeer: { id: string } | null = null
      if (access.channel?.kind === 'dm') {
        try {
          const channelService = container.resolve('channelService')
          directPeer = await channelService.findDirectPeer(channelId, user.userId)
        } catch {
          /* direct peer fanout is best-effort */
        }
      }

      // Emit WS event so all connected clients (including bots) see the message.
      // Direct message peers also receive it through their user room so a newly
      // started Buddy does not miss the first DM while joining the channel room.
      try {
        const io = container.resolve('io')
        let target = io.to(`channel:${channelId}`)
        if (directPeer) target = target.to(`user:${directPeer.id}`)
        target.emit('message:new', message)
      } catch {
        /* io not yet registered */
      }

      try {
        if (access.channel?.kind === 'dm') {
          if (directPeer) {
            const notificationTriggerService = container.resolve('notificationTriggerService')
            const senderName = message.author?.displayName ?? message.author?.username ?? 'Someone'
            await notificationTriggerService.triggerDirectMessage({
              userId: directPeer.id,
              actorId: user.userId,
              actorName: senderName,
              channelId,
              preview: message.content.substring(0, 200),
            })
            const rentalService = container.resolve('rentalService')
            await rentalService.recordRentalMessage(user.userId, directPeer.id).catch(() => null)
          }
        }
      } catch {
        /* direct channel side effects are non-critical */
      }

      try {
        if (input.replyToId) {
          const notificationTriggerService = container.resolve('notificationTriggerService')
          const originalMessage = await messageService.getById(input.replyToId)
          if (originalMessage && originalMessage.authorId !== user.userId) {
            await notificationTriggerService.triggerReply({
              userId: originalMessage.authorId,
              actorId: user.userId,
              actorName: message.author?.displayName ?? message.author?.username ?? 'Someone',
              messageId: message.id,
              channelId,
              serverId: access.channel?.serverId ?? null,
              channelName: access.channel?.name,
              preview: message.content.substring(0, 200),
            })
          }
        }
      } catch {
        /* reply notification is non-critical */
      }

      try {
        const senderName = message.author?.displayName ?? message.author?.username ?? 'Someone'
        await mentionService.createMentionNotifications({
          messageId: message.id,
          channelId,
          authorId: user.userId,
          authorName: senderName,
          content: message.content,
          mentions: messageMentions,
        })
      } catch {
        /* notification push is non-critical */
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

      const sourceResult = await getMessageAccess(
        container,
        sourceId,
        user.userId,
        'Source message not found',
      )
      if (!sourceResult.ok) {
        return c.json({ ok: false, error: sourceResult.error }, sourceResult.status)
      }
      const source = sourceResult.message
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
        threadId: source.threadId ?? undefined,
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
    const access = await getMessageAccess(container, id, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
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
    const access = await getMessageAccess(container, id, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const message = access.message

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
      const access = await getChannelAccess(container, channelId, user.userId)
      if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
      const thread = await messageService.createThread(channelId, user.userId, input)
      return c.json(thread, 201)
    },
  )

  // GET /api/channels/:channelId/threads
  messageHandler.get('/channels/:channelId/threads', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const user = c.get('user')
    const access = await getChannelAccess(container, channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const threads = await messageService.getThreadsByChannelId(channelId)
    return c.json(threads)
  })

  // GET /api/threads/:id
  messageHandler.get('/threads/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const user = c.get('user')
    const thread = await messageService.getThread(id)
    const access = await getChannelAccess(container, thread.channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    return c.json(thread)
  })

  // PATCH /api/threads/:id
  messageHandler.patch('/threads/:id', zValidator('json', updateThreadSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const threadBeforeUpdate = await messageService.getThread(id)
    const access = await getChannelAccess(container, threadBeforeUpdate.channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const thread = await messageService.updateThread(id, user.userId, input)
    return c.json(thread)
  })

  // DELETE /api/threads/:id
  messageHandler.delete('/threads/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const user = c.get('user')
    const thread = await messageService.getThread(id)
    const access = await getChannelAccess(container, thread.channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    await messageService.deleteThread(id, user.userId)
    return c.json({ ok: true })
  })

  // GET /api/threads/:id/messages
  messageHandler.get('/threads/:id/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const user = c.get('user')
    const thread = await messageService.getThread(id)
    const access = await getChannelAccess(container, thread.channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const messages = await messageService.getThreadMessages(id, limit, cursor, user.userId)
    return c.json(messages)
  })

  // POST /api/threads/:id/messages
  messageHandler.post('/threads/:id/messages', zValidator('json', sendMessageSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const mentionService = container.resolve('mentionService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    if (hasOAuthLinkCards(input.metadata)) {
      return c.json({ ok: false, error: 'OAuth link cards must be sent through OAuth APIs' }, 400)
    }
    const thread = await messageService.getThread(id)
    const access = await getChannelAccess(container, thread.channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const preparedInput = await mentionService.prepareMessageInput(
      thread.channelId,
      user.userId,
      input,
    )
    const commerceCardService = container.resolve('commerceCardService')
    const normalizedMetadata = await commerceCardService.inferMessageMetadata({
      metadata: preparedInput.metadata as Record<string, unknown> | undefined,
      target: { kind: 'channel', channelId: thread.channelId },
      authorId: user.userId,
      content: preparedInput.content,
    })
    const message = await messageService.sendToThread(id, user.userId, {
      content: preparedInput.content,
      replyToId: preparedInput.replyToId,
      mentions: preparedInput.mentions,
      metadata: normalizedMetadata,
    })
    const messageMentions = Array.isArray(message.metadata?.mentions)
      ? (message.metadata.mentions as MessageMention[])
      : []
    triggerCloudDeploymentAutoResumeForMentions({
      container,
      mentions: messageMentions,
      reason: 'thread message mention',
      logContext: { threadId: id, channelId: thread.channelId },
    })
    const messageId = message.id
    const messageContent = message.content ?? preparedInput.content
    if (!messageId) {
      return c.json({ ok: false, error: 'Failed to create thread message' }, 500)
    }

    try {
      const io = container.resolve('io')
      io.to(`thread:${id}`).emit('message:new', message)
      io.to(`channel:${thread.channelId}`).emit('message:new', message)
    } catch {
      /* io not yet registered */
    }

    try {
      const notificationTargetMessageId = preparedInput.replyToId ?? thread.parentMessageId
      if (notificationTargetMessageId) {
        const notificationTriggerService = container.resolve('notificationTriggerService')
        const originalMessage = await messageService.getById(notificationTargetMessageId)
        if (
          originalMessage &&
          originalMessage.authorId !== user.userId &&
          originalMessage.channelId === thread.channelId
        ) {
          await notificationTriggerService.triggerReply({
            userId: originalMessage.authorId,
            actorId: user.userId,
            actorName: message.author?.displayName ?? message.author?.username ?? 'Someone',
            messageId,
            channelId: thread.channelId,
            serverId: access.channel?.serverId ?? null,
            channelName: access.channel?.name,
            preview: messageContent.substring(0, 200),
          })
        }
      }
    } catch {
      /* thread reply notification is non-critical */
    }

    try {
      const senderName = message.author?.displayName ?? message.author?.username ?? 'Someone'
      await mentionService.createMentionNotifications({
        messageId,
        channelId: thread.channelId,
        authorId: user.userId,
        authorName: senderName,
        content: messageContent,
        mentions: messageMentions,
      })
    } catch {
      /* thread mention notification is non-critical */
    }
    return c.json(message, 201)
  })

  // PUT /api/channels/:channelId/pins/:messageId
  messageHandler.put('/channels/:channelId/pins/:messageId', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messageId = c.req.param('messageId')
    const user = c.get('user')
    const access = await getChannelAccess(container, channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const message = await messageService.pinMessage(channelId, messageId)
    return c.json(message)
  })

  // DELETE /api/channels/:channelId/pins/:messageId
  messageHandler.delete('/channels/:channelId/pins/:messageId', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messageId = c.req.param('messageId')
    const user = c.get('user')
    const access = await getChannelAccess(container, channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const message = await messageService.unpinMessage(channelId, messageId)
    return c.json(message)
  })

  // GET /api/channels/:channelId/pins
  messageHandler.get('/channels/:channelId/pins', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const user = c.get('user')
    const access = await getChannelAccess(container, channelId, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const messages = await messageService.getPinnedMessages(channelId)
    return c.json(messages)
  })

  // POST /api/messages/:id/reactions
  messageHandler.post('/messages/:id/reactions', zValidator('json', reactionSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const access = await getMessageAccess(container, id, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const reaction = await messageService.addReaction(id, user.userId, input)

    // Broadcast reaction via WS
    try {
      const io = container.resolve('io')
      const message = access.message
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
    const access = await getMessageAccess(container, id, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    await messageService.removeReaction(id, user.userId, emoji)

    // Broadcast reaction removal via WS
    try {
      const io = container.resolve('io')
      const message = access.message
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
    const user = c.get('user')
    const access = await getMessageAccess(container, id, user.userId)
    if (!access.ok) return c.json({ ok: false, error: access.error }, access.status)
    const reactions = await messageService.getReactions(id)
    return c.json(reactions)
  })

  return messageHandler
}
