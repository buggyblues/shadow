import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageDao } from '../dao/message.dao'
import type { ChannelAccessService } from './channel-access.service'
import { VoiceMessageService } from './voice-message.service'

function createSelectDb(input: {
  transcripts?: unknown[]
  playbacks?: unknown[]
  playbackCounts?: unknown[]
}) {
  const selectQueue = [
    {
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(input.transcripts ?? [])),
      })),
    },
    {
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(input.playbacks ?? [])),
      })),
    },
  ]

  return {
    select: vi.fn((selection?: unknown) => {
      if (selection) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn(() => Promise.resolve(input.playbackCounts ?? [])),
            })),
          })),
        }
      }
      return selectQueue.shift()
    }),
  }
}

function createInsertDb(row: unknown) {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([row])),
        })),
      })),
    })),
  }
}

function createTranscriptRequestDb(pending: unknown, failed: unknown) {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([pending])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([failed])),
        })),
      })),
    })),
  }
}

describe('VoiceMessageService', () => {
  const messageDao = {
    findAttachmentById: vi.fn(),
    findById: vi.fn(),
  } as unknown as MessageDao & {
    findAttachmentById: ReturnType<typeof vi.fn>
    findById: ReturnType<typeof vi.fn>
  }
  const channelAccessService = {
    assertCanRead: vi.fn(),
  } as unknown as ChannelAccessService & {
    assertCanRead: ReturnType<typeof vi.fn>
  }
  const emit = vi.fn()
  const io = {
    to: vi.fn(() => ({ emit })),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('enriches voice attachments with viewer playback, transcript, and author-safe playback state', async () => {
    const db = createSelectDb({
      transcripts: [
        {
          id: 'transcript-1',
          attachmentId: 'voice-1',
          status: 'ready',
          text: 'hello',
          language: 'en',
          source: 'client',
          provider: null,
          confidence: null,
          errorCode: null,
          updatedAt: new Date('2026-05-30T10:00:00.000Z'),
        },
      ],
      playbacks: [
        {
          attachmentId: 'voice-1',
          firstPlayedAt: new Date('2026-05-30T10:01:00.000Z'),
          completedAt: null,
          lastPositionMs: 1200,
        },
      ],
      playbackCounts: [{ attachmentId: 'voice-2', count: 3 }],
    })
    const service = new VoiceMessageService({
      db: db as never,
      messageDao,
      channelAccessService,
    })

    const result = await service.enrichMessagesForViewer(
      [
        {
          id: 'message-1',
          authorId: 'author-1',
          channelId: 'channel-1',
          attachments: [{ id: 'voice-1', kind: 'voice', durationMs: 3000 }],
        },
        {
          id: 'message-2',
          authorId: 'viewer-1',
          channelId: 'channel-1',
          attachments: [{ id: 'voice-2', kind: 'voice', durationMs: 2600 }],
        },
      ],
      'viewer-1',
    )

    expect(result[0]?.attachments?.[0]).toMatchObject({
      id: 'voice-1',
      transcript: {
        id: 'transcript-1',
        status: 'ready',
        text: 'hello',
        updatedAt: '2026-05-30T10:00:00.000Z',
      },
      playback: {
        played: true,
        completed: false,
        lastPositionMs: 1200,
      },
    })
    expect(result[1]?.attachments?.[0]).toMatchObject({
      id: 'voice-2',
      playback: {
        played: true,
        completed: true,
        lastPositionMs: 2600,
        playedCount: 3,
      },
    })
  })

  it('marks voice playback after channel access and emits a user-scoped update', async () => {
    const db = createInsertDb({
      attachmentId: 'voice-1',
      completedAt: new Date('2026-05-30T10:02:00.000Z'),
      lastPositionMs: 2500,
    })
    messageDao.findAttachmentById.mockResolvedValue({
      id: 'voice-1',
      kind: 'file',
      filename: 'voice-1780142877316.webm',
      contentType: 'audio/webm',
      durationMs: 2500,
      messageId: 'message-1',
    })
    messageDao.findById.mockResolvedValue({
      id: 'message-1',
      channelId: 'channel-1',
    })
    channelAccessService.assertCanRead.mockResolvedValue(undefined)

    const service = new VoiceMessageService({
      db: db as never,
      messageDao,
      channelAccessService,
      io: io as never,
    })

    await service.markPlayback({
      attachmentId: 'voice-1',
      userId: 'viewer-1',
      positionMs: 2500,
      completed: true,
    })

    expect(channelAccessService.assertCanRead).toHaveBeenCalledWith('channel-1', 'viewer-1')
    expect(io.to).toHaveBeenCalledWith('user:viewer-1')
    expect(emit).toHaveBeenCalledWith('voice:playback-updated', {
      attachmentId: 'voice-1',
      messageId: 'message-1',
      played: true,
      completed: true,
      lastPositionMs: 2500,
    })
  })

  it('rejects transcript updates from users other than the voice author', async () => {
    messageDao.findAttachmentById.mockResolvedValue({
      id: 'voice-1',
      kind: 'voice',
      messageId: 'message-1',
    })
    messageDao.findById.mockResolvedValue({
      id: 'message-1',
      authorId: 'author-1',
      channelId: 'channel-1',
    })

    const service = new VoiceMessageService({
      db: createInsertDb({}) as never,
      messageDao,
      channelAccessService,
    })

    await expect(
      service.upsertTranscript({
        attachmentId: 'voice-1',
        userId: 'viewer-1',
        source: 'client',
        text: 'not allowed',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(channelAccessService.assertCanRead).not.toHaveBeenCalled()
  })

  it('returns a failed transcript when server transcription is requested without provider config', async () => {
    vi.stubEnv('VOICE_TRANSCRIPT_PROVIDER', '')
    vi.stubEnv('VOICE_TRANSCRIPT_API_KEY', '')
    const pending = {
      id: 'transcript-1',
      attachmentId: 'voice-1',
      messageId: 'message-1',
      status: 'pending',
      text: null,
      language: null,
      source: 'server',
      provider: null,
      confidence: null,
      errorCode: null,
      updatedAt: new Date('2026-05-30T10:03:00.000Z'),
    }
    const failed = {
      ...pending,
      status: 'failed',
      errorCode: 'VOICE_TRANSCRIPT_PROVIDER_NOT_CONFIGURED',
      updatedAt: new Date('2026-05-30T10:04:00.000Z'),
    }
    messageDao.findAttachmentById.mockResolvedValue({
      id: 'voice-1',
      kind: 'voice',
      filename: 'voice-1.webm',
      contentType: 'audio/webm',
      url: '/shadow/voice/voice-1.webm',
      messageId: 'message-1',
    })
    messageDao.findById.mockResolvedValue({
      id: 'message-1',
      authorId: 'author-1',
      channelId: 'channel-1',
    })
    channelAccessService.assertCanRead.mockResolvedValue(undefined)

    const service = new VoiceMessageService({
      db: createTranscriptRequestDb(pending, failed) as never,
      messageDao,
      channelAccessService,
      io: io as never,
    })

    const transcript = await service.requestServerTranscript({
      attachmentId: 'voice-1',
      userId: 'viewer-1',
      waitForResult: true,
    })

    expect(transcript).toMatchObject({
      status: 'failed',
      errorCode: 'VOICE_TRANSCRIPT_PROVIDER_NOT_CONFIGURED',
    })
    expect(emit).toHaveBeenCalledWith(
      'voice:transcript-updated',
      expect.objectContaining({
        attachmentId: 'voice-1',
        messageId: 'message-1',
      }),
    )
  })
})
