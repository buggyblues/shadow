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

function readStringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function parseOptionalInt(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : null
}

function parseWaveformPeaks(value: unknown): number[] | null {
  const raw = readStringField(value)
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const peaks = parsed.map((item) => Number(item))
    if (peaks.length < 32 || peaks.length > 96) return null
    if (!peaks.every((item) => Number.isInteger(item) && item >= 0 && item <= 100)) return null
    return peaks
  } catch {
    return null
  }
}

function inferAudioContainer(filename: string, contentType: string) {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext) return ext.slice(0, 32)
  const subtype = contentType.split('/')[1]?.split(';')[0]?.trim()
  return subtype ? subtype.slice(0, 32) : null
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
    const requestedKind = readStringField(body.kind)
    const kind =
      requestedKind === 'voice' ? 'voice' : contentType.startsWith('image/') ? 'image' : 'file'
    let durationMs: number | null = null
    let waveformPeaks: number[] | null = null
    let transcriptText: string | undefined
    let transcriptLanguage: string | undefined
    let transcriptSource: 'client' | 'runtime' = 'client'

    if (kind === 'voice') {
      if (!contentType.startsWith('audio/')) {
        return c.json({ ok: false, error: 'VOICE_UNSUPPORTED_FORMAT' }, 400)
      }
      durationMs = parseOptionalInt(body.durationMs)
      if (durationMs === null) {
        return c.json({ ok: false, error: 'VOICE_DURATION_REQUIRED' }, 400)
      }
      if (durationMs < 1000) return c.json({ ok: false, error: 'VOICE_TOO_SHORT' }, 400)
      if (durationMs > 60_000) return c.json({ ok: false, error: 'VOICE_TOO_LONG' }, 400)
      waveformPeaks = parseWaveformPeaks(body.waveformPeaks)
      if (body.waveformPeaks && !waveformPeaks) {
        return c.json({ ok: false, error: 'VOICE_WAVEFORM_INVALID' }, 400)
      }
      transcriptText = readStringField(body.transcriptText)?.trim()
      transcriptLanguage = readStringField(body.transcriptLanguage)?.trim()
      transcriptSource = readStringField(body.transcriptSource) === 'runtime' ? 'runtime' : 'client'
    }

    const result = await mediaService.upload(buffer, file.name, contentType, { kind })
    const signed = mediaService.createSignedUrl({
      contentRef: result.url,
      contentType,
      disposition: 'inline',
      filename: file.name,
    })

    // If messageId is provided, create attachment record (channel message)
    if (typeof messageId === 'string' && channelMessage) {
      const messageService = container.resolve('messageService')
      const attachment = await messageService.createAttachmentForMessage(
        messageId,
        channelMessage.channelId,
        {
          filename: file.name,
          url: result.url,
          contentType,
          size: result.size,
          kind,
          durationMs,
          audioContainer: kind === 'voice' ? inferAudioContainer(file.name, contentType) : null,
          waveformPeaks,
          waveformVersion: waveformPeaks ? 1 : null,
        },
      )
      if (kind === 'voice' && transcriptText) {
        const voiceMessageService = container.resolve('voiceMessageService')
        await voiceMessageService.upsertTranscript({
          attachmentId: attachment.id,
          userId: c.get('user').userId,
          source: transcriptSource,
          text: transcriptText,
          language: transcriptLanguage,
        })
      } else if (kind === 'voice') {
        const voiceMessageService = container.resolve('voiceMessageService')
        if (voiceMessageService.hasServerTranscriptProvider()) {
          await voiceMessageService.requestServerTranscript({
            attachmentId: attachment.id,
            userId: c.get('user').userId,
            language: transcriptLanguage,
            waitForResult: true,
          })
        }
      }

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

    return c.json({ ...result, kind, durationMs, waveformPeaks, signedUrl: signed.url }, 201)
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
