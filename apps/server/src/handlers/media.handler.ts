import { type Context, Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import type { MediaVariant } from '../services/media.service'

function parseDisposition(value: string | undefined): 'inline' | 'attachment' {
  return value === 'attachment' ? 'attachment' : 'inline'
}

function parseVariant(value: string | undefined): MediaVariant | undefined {
  return value === 'avatar' || value === 'preview' || value === 'banner' ? value : undefined
}

async function serveSignedMedia(container: AppContainer, c: Context) {
  const mediaAccessGateway = container.resolve('mediaAccessGateway')
  const token = c.req.param('token')
  if (!token) return c.json({ ok: false, error: 'File not found' }, 404)

  try {
    const response = await mediaAccessGateway.getSignedObjectResponse(token, c.req.header('Range'))
    return c.body(response.body, response.status, response.headers)
  } catch (err) {
    const status =
      typeof (err as { status?: unknown }).status === 'number'
        ? ((err as { status: number }).status as 400)
        : 404
    const headers = (err as { headers?: Record<string, string> }).headers
    return c.json({ ok: false, error: 'File not found' }, status, headers)
  }
}

export function createSignedMediaHandler(container: AppContainer) {
  const handler = new Hono()

  // GET /api/media/signed/:token
  // Short-lived media delivery URL for browser-rendered attachments. Auth is the token itself.
  handler.get('/media/signed/:token', async (c) => serveSignedMedia(container, c))

  return handler
}

export function createMediaHandler(container: AppContainer) {
  const mediaHandler = new Hono()

  // POST /api/media/upload
  mediaHandler.post('/upload', authMiddleware, async (c) => {
    const mediaService = container.resolve('mediaService')
    const messageDao = container.resolve('messageDao')
    const body = await c.req.parseBody()
    const file = body.file

    if (!file || !(file instanceof File)) {
      return c.json({ ok: false, error: 'No file provided' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
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
      const channelAccessService = container.resolve('channelAccessService')
      await channelAccessService.assertCanRead(message.channelId, user.userId)
      channelMessage = message
    }

    const contentType = file.type || 'application/octet-stream'
    const result = await mediaService.upload(buffer, file.name, contentType)
    const signed = mediaService.createSignedUrl({
      contentRef: result.url,
      contentType,
      disposition: 'inline',
      filename: file.name,
    })

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
        const userDao = container.resolve('userDao')
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
                avatarUrl: mediaService.resolveMediaUrl(author.avatarUrl, 'image/png', {
                  variant: 'avatar',
                }),
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

    return c.json({ ...result, signedUrl: signed.url }, 201)
  })

  // GET /api/media/:id
  mediaHandler.get('/:id', authMiddleware, async (c) => {
    const mediaService = container.resolve('mediaService')
    const id = c.req.param('id')
    if (!id) return c.json({ ok: false, error: 'Invalid media id' }, 400)
    try {
      const url = await mediaService.getPresignedUrl(id)
      return c.redirect(url)
    } catch {
      return c.json({ ok: false, error: 'File not found' }, 404)
    }
  })

  return mediaHandler
}

export function createAttachmentMediaHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('/attachments/:id/media-url', authMiddleware)

  handler.get('/attachments/:id/media-url', async (c) => {
    const mediaAccessGateway = container.resolve('mediaAccessGateway')
    const result = await mediaAccessGateway.createAttachmentReadUrl({
      actor: c.get('actor'),
      attachmentId: c.req.param('id'),
      disposition: parseDisposition(c.req.query('disposition')),
      variant: parseVariant(c.req.query('variant')),
    })
    return c.json(result)
  })

  return handler
}
