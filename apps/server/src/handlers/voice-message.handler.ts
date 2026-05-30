import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

const playbackSchema = z.object({
  positionMs: z.number().int().min(0).optional(),
  completed: z.boolean().optional(),
})

const requestTranscriptSchema = z.object({
  mode: z.literal('server').default('server'),
  language: z.string().min(2).max(32).nullable().optional(),
})

const updateTranscriptSchema = z.object({
  source: z.enum(['client', 'runtime']).default('client'),
  language: z.string().min(2).max(32).nullable().optional(),
  text: z.string().min(1).max(8000),
})

export function createVoiceMessageHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('/attachments/:attachmentId/voice-playback', authMiddleware)
  handler.use('/attachments/:attachmentId/transcript', authMiddleware)

  handler.put('/attachments/:attachmentId/voice-playback', async (c) => {
    const voiceMessageService = container.resolve('voiceMessageService')
    const input = playbackSchema.parse(await c.req.json())
    const result = await voiceMessageService.markPlayback({
      attachmentId: c.req.param('attachmentId'),
      userId: c.get('user').userId,
      positionMs: input.positionMs,
      completed: input.completed,
    })
    return c.json({
      ok: true,
      playback: {
        played: true,
        completed: Boolean(result?.completedAt),
        lastPositionMs: result?.lastPositionMs ?? input.positionMs ?? 0,
      },
    })
  })

  handler.post('/attachments/:attachmentId/transcript', async (c) => {
    const voiceMessageService = container.resolve('voiceMessageService')
    const input = requestTranscriptSchema.parse(await c.req.json())
    const transcript = await voiceMessageService.requestServerTranscript({
      attachmentId: c.req.param('attachmentId'),
      userId: c.get('user').userId,
      language: input.language,
      waitForResult: true,
    })
    return c.json({ ok: true, transcript })
  })

  handler.put('/attachments/:attachmentId/transcript', async (c) => {
    const voiceMessageService = container.resolve('voiceMessageService')
    const input = updateTranscriptSchema.parse(await c.req.json())
    const transcript = await voiceMessageService.upsertTranscript({
      attachmentId: c.req.param('attachmentId'),
      userId: c.get('user').userId,
      source: input.source,
      text: input.text,
      language: input.language,
    })
    return c.json({ ok: true, transcript })
  })

  return handler
}
