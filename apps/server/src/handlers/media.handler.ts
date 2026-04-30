import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

export function createMediaHandler(container: AppContainer) {
  const mediaHandler = new Hono()

  mediaHandler.use('*', authMiddleware)

  // POST /api/media/upload
  mediaHandler.post('/upload', async (c) => {
    const mediaService = container.resolve('mediaService')
    const messageDao = container.resolve('messageDao')
    const userDao = container.resolve('userDao')
    const body = await c.req.parseBody()
    const file = body.file

    if (!file || !(file instanceof File)) {
      return c.json({ ok: false, error: 'No file provided' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const dmMessageId = body.dmMessageId
    const dmService = typeof dmMessageId === 'string' ? container.resolve('dmService') : null

    if (typeof dmMessageId === 'string' && dmService) {
      const message = await dmService.getMessageById(dmMessageId)
      if (!message) {
        return c.json({ ok: false, error: 'DM message not found' }, 404)
      }

      const user = c.get('user')
      const isParticipant = await dmService.isParticipant(message.dmChannelId, user.userId)
      if (!isParticipant) {
        return c.json({ ok: false, error: 'Not a participant of this DM channel' }, 403)
      }
    }

    const messageId = body.messageId
    let channelMessage: Awaited<ReturnType<typeof messageDao.findById>> | null = null
    if (typeof messageId === 'string') {
      const message = await messageDao.findById(messageId)
      if (!message) {
        return c.json({ ok: false, error: 'Message not found' }, 404)
      }
      const user = c.get('user')
      if (message.authorId !== user.userId) {
        return c.json({ ok: false, error: 'Can only attach files to your own messages' }, 403)
      }
      const channelDao = container.resolve('channelDao')
      const serverDao = container.resolve('serverDao')
      const channelMemberDao = container.resolve('channelMemberDao')
      const channel = await channelDao.findById(message.channelId)
      if (!channel) {
        return c.json({ ok: false, error: 'Channel not found' }, 404)
      }
      const member = await serverDao.getMember(channel.serverId, user.userId)
      if (!member) {
        return c.json({ ok: false, error: 'Not a member of this server' }, 403)
      }
      if (channel.isPrivate && member.role !== 'owner' && member.role !== 'admin') {
        const channelMember = await channelMemberDao.get(channel.id, user.userId)
        if (!channelMember) {
          return c.json({ ok: false, error: 'Not a member of this channel' }, 403)
        }
      }
      channelMessage = message
    }

    const contentType = file.type || 'application/octet-stream'
    const result = await mediaService.upload(buffer, file.name, contentType)

    // If messageId is provided, create attachment record (channel message)
    if (typeof messageId === 'string' && channelMessage) {
      const messageService = container.resolve('messageService')
      await messageService.createAttachmentForMessage(messageId, channelMessage.channelId, {
        filename: file.name,
        url: result.url,
        contentType,
        size: result.size,
      })

      // Broadcast message update so realtime clients can render newly attached media
      try {
        const io = container.resolve('io')
        const author = await userDao.findById(channelMessage.authorId)
        const attachments = await messageDao.getAttachments(messageId)
        io.to(`channel:${channelMessage.channelId}`).emit('message:updated', {
          ...channelMessage,
          author: author
            ? {
                id: author.id,
                username: author.username,
                displayName: author.displayName,
                avatarUrl: author.avatarUrl,
                status: author.status,
                isBot: author.isBot,
              }
            : null,
          attachments,
        })
      } catch (err) {
        console.error('[media] Failed to broadcast message:updated after attachment creation:', err)
      }
    }

    // If dmMessageId is provided, create DM attachment record
    if (typeof dmMessageId === 'string' && dmService) {
      await dmService.createAttachment({
        dmMessageId,
        filename: file.name,
        url: result.url,
        contentType,
        size: result.size,
      })

      // Broadcast DM message update
      try {
        const io = container.resolve('io')
        const msg = await dmService.getMessageById(dmMessageId)
        if (msg) {
          const author = await userDao.findById(msg.authorId)
          const attachments = await dmService.getAttachments(dmMessageId)
          io.to(`dm:${msg.dmChannelId}`).emit('dm:message:updated', {
            ...msg,
            author: author
              ? {
                  id: author.id,
                  username: author.username,
                  displayName: author.displayName,
                  avatarUrl: author.avatarUrl,
                  status: author.status,
                  isBot: author.isBot,
                }
              : null,
            attachments,
          })
        }
      } catch (err) {
        console.error(
          '[media] Failed to broadcast dm:message:updated after attachment creation:',
          err,
        )
      }
    }

    return c.json(result, 201)
  })

  // GET /api/media/:id
  mediaHandler.get('/:id', async (c) => {
    const mediaService = container.resolve('mediaService')
    const id = c.req.param('id')
    try {
      const url = await mediaService.getPresignedUrl(id)
      return c.redirect(url)
    } catch {
      return c.json({ ok: false, error: 'File not found' }, 404)
    }
  })

  return mediaHandler
}
