import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import type { MessageDao } from '../dao/message.dao'
import type { Database } from '../db'
import { voiceMessagePlaybacks, voiceTranscripts } from '../db/schema'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import type { ChannelAccessService } from './channel-access.service'
import type { MediaService } from './media.service'

type MessageWithVoiceAttachments = {
  id: string
  authorId: string
  channelId: string
  attachments?: Array<Record<string, unknown> & { id: string; kind?: string }>
}

type VoiceTranscriptProvider = 'openai' | 'custom'

type ServerTranscriptConfig = {
  provider: VoiceTranscriptProvider
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxBytes: number
}

type VoiceAttachmentRecord = Awaited<ReturnType<MessageDao['findAttachmentById']>>
type VoiceMessageRecord = Awaited<ReturnType<MessageDao['findById']>>

function normalizePositionMs(value: number | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value ?? 0))
}

function isVoiceAttachment(attachment: {
  kind?: string
  contentType?: string | null
  filename?: string | null
  durationMs?: unknown
  waveformPeaks?: unknown
}) {
  if (attachment.kind === 'voice') return true
  if (!attachment.contentType?.startsWith('audio/')) return false
  return (
    typeof attachment.durationMs === 'number' ||
    (Array.isArray(attachment.waveformPeaks) && attachment.waveformPeaks.length > 0) ||
    /^voice[-_]\d+/i.test(attachment.filename ?? '')
  )
}

function serializeTranscript(row: typeof voiceTranscripts.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    text: row.text,
    language: row.language,
    source: row.source,
    provider: row.provider,
    confidence: row.confidence,
    errorCode: row.errorCode,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function normalizeErrorCode(err: unknown) {
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' && code.trim()) return code.slice(0, 80)
  const message = err instanceof Error ? err.message : String(err)
  return (
    message
      .replace(/[^A-Z0-9_]/gi, '_')
      .toUpperCase()
      .slice(0, 80) || 'VOICE_TRANSCRIPT_FAILED'
  )
}

function transcriptLanguageHint(language?: string | null) {
  const primary = language?.trim().split(/[-_]/u)[0]
  return primary && /^[a-z]{2,3}$/iu.test(primary) ? primary.toLowerCase() : null
}

export class VoiceMessageService {
  constructor(
    private deps: {
      db: Database
      messageDao: MessageDao
      channelAccessService: ChannelAccessService
      io?: SocketIOServer
      mediaService?: MediaService
      safeHttpClient?: SafeHttpClient
      logger?: Logger
    },
  ) {}

  private get db() {
    return this.deps.db
  }

  private serverTranscriptConfig(): ServerTranscriptConfig | null {
    if (process.env.VOICE_TRANSCRIPT_ENABLED === 'false') return null
    const provider = process.env.VOICE_TRANSCRIPT_PROVIDER?.trim().toLowerCase()
    if (provider !== 'openai' && provider !== 'custom') return null
    const apiKey = process.env.VOICE_TRANSCRIPT_API_KEY
    if (!apiKey) return null
    const baseUrl =
      process.env.VOICE_TRANSCRIPT_BASE_URL ??
      (provider === 'openai' ? 'https://api.openai.com/v1' : '')
    if (!baseUrl) return null

    return {
      provider,
      apiKey,
      baseUrl,
      model: process.env.VOICE_TRANSCRIPT_MODEL ?? 'whisper-1',
      timeoutMs: parsePositiveInt(process.env.VOICE_TRANSCRIPT_TIMEOUT_MS, 20_000),
      maxBytes: parsePositiveInt(process.env.VOICE_TRANSCRIPT_MAX_BYTES, 25 * 1024 * 1024),
    }
  }

  hasServerTranscriptProvider() {
    return Boolean(
      this.serverTranscriptConfig() && this.deps.mediaService && this.deps.safeHttpClient,
    )
  }

  private emitTranscriptUpdated(
    message: NonNullable<VoiceMessageRecord>,
    row: typeof voiceTranscripts.$inferSelect | null,
  ) {
    this.deps.io?.to(`channel:${message.channelId}`).emit('voice:transcript-updated', {
      attachmentId: row?.attachmentId,
      messageId: message.id,
      transcript: row ? serializeTranscript(row) : null,
    })
  }

  private async transcribeWithProvider(input: {
    attachment: NonNullable<VoiceAttachmentRecord>
    audio: Buffer
    language?: string | null
    config: ServerTranscriptConfig
  }) {
    if (!input.config.baseUrl) {
      throw Object.assign(new Error('VOICE_TRANSCRIPT_PROVIDER_NOT_CONFIGURED'), {
        code: 'VOICE_TRANSCRIPT_PROVIDER_NOT_CONFIGURED',
      })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs)
    try {
      const formData = new FormData()
      formData.append(
        'file',
        new Blob([new Uint8Array(input.audio)], {
          type: input.attachment.contentType ?? 'application/octet-stream',
        }),
        input.attachment.filename ?? `voice-${input.attachment.id}.webm`,
      )
      formData.append('model', input.config.model)
      const language = transcriptLanguageHint(input.language)
      if (language) formData.append('language', language)

      const response = await this.deps.safeHttpClient!.fetch(
        `${input.config.baseUrl.replace(/\/+$/u, '')}/audio/transcriptions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.config.apiKey}`,
          },
          body: formData,
          redirect: 'manual',
          signal: controller.signal,
        },
        { maxRedirects: 0 },
      )
      const raw = await response.text()
      if (!response.ok) {
        throw Object.assign(new Error(`VOICE_TRANSCRIPT_PROVIDER_HTTP_${response.status}`), {
          code: `VOICE_TRANSCRIPT_PROVIDER_HTTP_${response.status}`,
        })
      }

      const data = JSON.parse(raw) as { text?: unknown }
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      if (!text) {
        throw Object.assign(new Error('VOICE_TRANSCRIPT_EMPTY'), { code: 'VOICE_TRANSCRIPT_EMPTY' })
      }
      return text.slice(0, 8000)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async runServerTranscript(input: {
    attachment: NonNullable<VoiceAttachmentRecord>
    message: NonNullable<VoiceMessageRecord>
    userId: string
    language?: string | null
  }) {
    const config = this.serverTranscriptConfig()
    if (!config || !this.deps.mediaService || !this.deps.safeHttpClient) {
      const failed = await this.db
        .update(voiceTranscripts)
        .set({
          source: 'server',
          status: 'failed',
          errorCode: 'VOICE_TRANSCRIPT_PROVIDER_NOT_CONFIGURED',
          updatedAt: new Date(),
        })
        .where(eq(voiceTranscripts.attachmentId, input.attachment.id))
        .returning()
      this.emitTranscriptUpdated(input.message, failed[0] ?? null)
      return failed[0] ? serializeTranscript(failed[0]) : null
    }

    const processing = await this.db
      .update(voiceTranscripts)
      .set({
        source: 'server',
        status: 'processing',
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(voiceTranscripts.attachmentId, input.attachment.id))
      .returning()
    this.emitTranscriptUpdated(input.message, processing[0] ?? null)

    try {
      const audio = await this.deps.mediaService.getFileBuffer(input.attachment.url)
      if (!audio) {
        throw Object.assign(new Error('VOICE_TRANSCRIPT_AUDIO_NOT_FOUND'), {
          code: 'VOICE_TRANSCRIPT_AUDIO_NOT_FOUND',
        })
      }
      if (audio.byteLength > config.maxBytes) {
        throw Object.assign(new Error('VOICE_TRANSCRIPT_AUDIO_TOO_LARGE'), {
          code: 'VOICE_TRANSCRIPT_AUDIO_TOO_LARGE',
        })
      }
      const text = await this.transcribeWithProvider({
        attachment: input.attachment,
        audio,
        language: input.language,
        config,
      })
      const ready = await this.db
        .update(voiceTranscripts)
        .set({
          source: 'server',
          status: 'ready',
          text,
          language: input.language ?? null,
          provider: config.provider,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(voiceTranscripts.attachmentId, input.attachment.id))
        .returning()
      this.emitTranscriptUpdated(input.message, ready[0] ?? null)
      return ready[0] ? serializeTranscript(ready[0]) : null
    } catch (err) {
      this.deps.logger?.warn?.(
        { err, attachmentId: input.attachment.id },
        'Voice transcript generation failed',
      )
      const failed = await this.db
        .update(voiceTranscripts)
        .set({
          source: 'server',
          status: 'failed',
          errorCode: normalizeErrorCode(err),
          updatedAt: new Date(),
        })
        .where(eq(voiceTranscripts.attachmentId, input.attachment.id))
        .returning()
      this.emitTranscriptUpdated(input.message, failed[0] ?? null)
      return failed[0] ? serializeTranscript(failed[0]) : null
    }
  }

  async enrichMessagesForViewer<T extends MessageWithVoiceAttachments>(
    messages: T[],
    viewerUserId: string,
  ): Promise<T[]> {
    const voiceAttachments = messages.flatMap((message) =>
      (message.attachments ?? [])
        .filter((attachment) => isVoiceAttachment(attachment))
        .map((attachment) => ({ message, attachment })),
    )
    if (voiceAttachments.length === 0) return messages

    const attachmentIds = voiceAttachments.map((entry) => entry.attachment.id)
    const [transcripts, playbacks, playbackCounts] = await Promise.all([
      this.db
        .select()
        .from(voiceTranscripts)
        .where(inArray(voiceTranscripts.attachmentId, attachmentIds)),
      this.db
        .select()
        .from(voiceMessagePlaybacks)
        .where(
          and(
            inArray(voiceMessagePlaybacks.attachmentId, attachmentIds),
            eq(voiceMessagePlaybacks.userId, viewerUserId),
          ),
        ),
      this.db
        .select({
          attachmentId: voiceMessagePlaybacks.attachmentId,
          count: sql<number>`count(*)::int`,
        })
        .from(voiceMessagePlaybacks)
        .where(inArray(voiceMessagePlaybacks.attachmentId, attachmentIds))
        .groupBy(voiceMessagePlaybacks.attachmentId),
    ])

    const transcriptByAttachment = new Map(transcripts.map((row) => [row.attachmentId, row]))
    const playbackByAttachment = new Map(playbacks.map((row) => [row.attachmentId, row]))
    const playedCountByAttachment = new Map(
      playbackCounts.map((row) => [row.attachmentId, Number(row.count) || 0]),
    )
    const messageByAttachment = new Map(
      voiceAttachments.map((entry) => [entry.attachment.id, entry.message]),
    )

    return messages.map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => {
        if (!isVoiceAttachment(attachment)) return attachment
        const transcript = transcriptByAttachment.get(attachment.id)
        const playback = playbackByAttachment.get(attachment.id)
        const owningMessage = messageByAttachment.get(attachment.id)
        const isAuthor = owningMessage?.authorId === viewerUserId
        const authorPlayback = {
          played: true,
          completed: true,
          lastPositionMs:
            typeof attachment.durationMs === 'number' ? Math.max(0, attachment.durationMs) : 0,
          playedCount: playedCountByAttachment.get(attachment.id) ?? 0,
        }
        return {
          ...attachment,
          transcript: transcript ? serializeTranscript(transcript) : null,
          playback: isAuthor
            ? authorPlayback
            : {
                played: Boolean(playback?.firstPlayedAt),
                completed: Boolean(playback?.completedAt),
                lastPositionMs: playback?.lastPositionMs ?? 0,
              },
        }
      }),
    }))
  }

  async markPlayback(input: {
    attachmentId: string
    userId: string
    positionMs?: number
    completed?: boolean
  }) {
    const attachment = await this.deps.messageDao.findAttachmentById(input.attachmentId)
    if (!attachment || !isVoiceAttachment(attachment)) {
      throw Object.assign(new Error('Voice attachment not found'), { status: 404 })
    }
    const message = await this.deps.messageDao.findById(attachment.messageId)
    if (!message) throw Object.assign(new Error('Message not found'), { status: 404 })
    await this.deps.channelAccessService.assertCanRead(message.channelId, input.userId)

    const now = new Date()
    const positionMs = normalizePositionMs(input.positionMs)
    const completedAt = input.completed ? now : null
    const result = await this.db
      .insert(voiceMessagePlaybacks)
      .values({
        attachmentId: attachment.id,
        messageId: message.id,
        userId: input.userId,
        firstPlayedAt: now,
        lastPlayedAt: now,
        completedAt,
        lastPositionMs: positionMs,
        playCount: 1,
      })
      .onConflictDoUpdate({
        target: [voiceMessagePlaybacks.attachmentId, voiceMessagePlaybacks.userId],
        set: {
          lastPlayedAt: now,
          completedAt: completedAt ?? sql`coalesce(${voiceMessagePlaybacks.completedAt}, null)`,
          lastPositionMs: positionMs,
          playCount: sql`${voiceMessagePlaybacks.playCount} + 1`,
          updatedAt: now,
        },
      })
      .returning()

    this.deps.io?.to(`user:${input.userId}`).emit('voice:playback-updated', {
      attachmentId: attachment.id,
      messageId: message.id,
      played: true,
      completed: Boolean(result[0]?.completedAt),
      lastPositionMs: result[0]?.lastPositionMs ?? positionMs,
    })

    return result[0] ?? null
  }

  async upsertTranscript(input: {
    attachmentId: string
    userId: string
    source: 'client' | 'runtime'
    text: string
    language?: string | null
  }) {
    const attachment = await this.deps.messageDao.findAttachmentById(input.attachmentId)
    if (!attachment || !isVoiceAttachment(attachment)) {
      throw Object.assign(new Error('Voice attachment not found'), { status: 404 })
    }
    const message = await this.deps.messageDao.findById(attachment.messageId)
    if (!message) throw Object.assign(new Error('Message not found'), { status: 404 })
    if (message.authorId !== input.userId) {
      throw Object.assign(new Error('Only the voice message author can update transcript text'), {
        status: 403,
      })
    }
    await this.deps.channelAccessService.assertCanRead(message.channelId, input.userId)

    const text = input.text.trim()
    if (!text) throw Object.assign(new Error('Transcript text is required'), { status: 400 })
    if (text.length > 8000) {
      throw Object.assign(new Error('Transcript text is too long'), { status: 400 })
    }

    const now = new Date()
    const result = await this.db
      .insert(voiceTranscripts)
      .values({
        attachmentId: attachment.id,
        messageId: message.id,
        source: input.source,
        status: 'ready',
        text,
        language: input.language ?? null,
        createdByUserId: input.userId,
      })
      .onConflictDoUpdate({
        target: voiceTranscripts.attachmentId,
        set: {
          source: input.source,
          status: 'ready',
          text,
          language: input.language ?? null,
          errorCode: null,
          updatedAt: now,
        },
      })
      .returning()

    this.deps.io?.to(`channel:${message.channelId}`).emit('voice:transcript-updated', {
      attachmentId: attachment.id,
      messageId: message.id,
      transcript: result[0] ? serializeTranscript(result[0]) : null,
    })

    return result[0]
  }

  async requestServerTranscript(input: {
    attachmentId: string
    userId: string
    language?: string | null
    waitForResult?: boolean
  }) {
    const attachment = await this.deps.messageDao.findAttachmentById(input.attachmentId)
    if (!attachment || !isVoiceAttachment(attachment)) {
      throw Object.assign(new Error('Voice attachment not found'), { status: 404 })
    }
    const message = await this.deps.messageDao.findById(attachment.messageId)
    if (!message) throw Object.assign(new Error('Message not found'), { status: 404 })
    await this.deps.channelAccessService.assertCanRead(message.channelId, input.userId)

    const now = new Date()
    const result = await this.db
      .insert(voiceTranscripts)
      .values({
        attachmentId: attachment.id,
        messageId: message.id,
        source: 'server',
        status: 'pending',
        language: input.language ?? null,
        createdByUserId: input.userId,
      })
      .onConflictDoUpdate({
        target: voiceTranscripts.attachmentId,
        set: {
          source: 'server',
          status: 'pending',
          language: input.language ?? null,
          errorCode: null,
          updatedAt: now,
        },
      })
      .returning()

    if (result[0]) this.emitTranscriptUpdated(message, result[0])

    if (input.waitForResult) {
      return this.runServerTranscript({
        attachment,
        message,
        userId: input.userId,
        language: input.language,
      })
    }

    if (this.hasServerTranscriptProvider()) {
      void this.runServerTranscript({
        attachment,
        message,
        userId: input.userId,
        language: input.language,
      }).catch((err) => {
        this.deps.logger?.warn?.(
          { err, attachmentId: input.attachmentId },
          'Failed to schedule voice transcript generation',
        )
      })
    }

    return result[0] ? serializeTranscript(result[0]) : null
  }
}
