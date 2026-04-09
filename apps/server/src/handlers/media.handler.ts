import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { rateLimit } from '../middleware/rate-limit.middleware'

export function createMediaHandler(container: AppContainer) {
  const mediaHandler = new Hono()

  mediaHandler.use('*', authMiddleware)

  // POST /api/media/upload — 30 uploads per minute per user
  mediaHandler.post(
    '/upload',
    rateLimit({ max: 30, windowSec: 60, prefix: 'rl:media:upload', keyFn: (c) => {
      const user = c.get('user') as { userId?: string } | undefined
      return user?.userId ?? 'anonymous'
    }}),
    async (c) => {
    const mediaService = container.resolve('mediaService')
    const messageDao = container.resolve('messageDao')
    const userDao = container.resolve('userDao')
    const body = await c.req.parseBody()
    const file = body.file

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await mediaService.upload(buffer, file.name, file.type)

    // If messageId is provided, create attachment record (channel message)
    const messageId = body.messageId
    if (typeof messageId === 'string') {
      await messageDao.createAttachment({
        messageId,
        filename: file.name,
        url: result.url,
        contentType: file.type,
        size: result.size,
      })

      // Broadcast message update so realtime clients can render newly attached media
      try {
        const io = container.resolve('io')
        const message = await messageDao.findById(messageId)
        if (message) {
          const author = await userDao.findById(message.authorId)
          const attachments = await messageDao.getAttachments(messageId)
          io.to(`channel:${message.channelId}`).emit('message:updated', {
            ...message,
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
        console.error('[media] Failed to broadcast message:updated after attachment creation:', err)
      }
    }

    // If dmMessageId is provided, create DM attachment record
    const dmMessageId = body.dmMessageId
    if (typeof dmMessageId === 'string') {
      const dmService = container.resolve('dmService')
      await dmService.createAttachment({
        dmMessageId,
        filename: file.name,
        url: result.url,
        contentType: file.type,
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
      return c.json({ error: 'File not found' }, 404)
    }
  })

  return mediaHandler
}
