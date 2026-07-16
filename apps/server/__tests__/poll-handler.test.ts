import type { MessagePollSummary } from '@shadowob/shared'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppContainer } from '../src/container'
import { createMessageHandler } from '../src/handlers/message.handler'
import { signAccessToken } from '../src/lib/jwt'

const userId = '550e8400-e29b-41d4-a716-446655440101'
const creatorId = '550e8400-e29b-41d4-a716-446655440102'
const channelId = '550e8400-e29b-41d4-a716-446655440103'
const serverId = '550e8400-e29b-41d4-a716-446655440104'
const messageId = '550e8400-e29b-41d4-a716-446655440105'
const pollId = '550e8400-e29b-41d4-a716-446655440106'
const optionId = '550e8400-e29b-41d4-a716-446655440107'

const token = signAccessToken({
  userId,
  email: 'poll-handler@test.local',
  username: 'poll_handler',
})

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function makePollSummary(overrides: Partial<MessagePollSummary> = {}): MessagePollSummary {
  return {
    id: pollId,
    messageId,
    channelId,
    serverId,
    creatorId,
    question: 'Which time works best?',
    allowMultiselect: false,
    status: 'active',
    layoutType: 1,
    expiresAt: '2026-07-09T12:00:00.000Z',
    finalizedAt: null,
    isExpired: false,
    isFinalized: false,
    totalVotes: 1,
    viewerOptionIds: [optionId],
    viewerAnswerIds: [1],
    options: [
      {
        id: optionId,
        answerId: 1,
        text: '10:00',
        emoji: null,
        voteCount: 1,
        votedByViewer: true,
      },
    ],
    createdAt: '2026-07-08T12:00:00.000Z',
    updatedAt: '2026-07-08T12:00:00.000Z',
    ...overrides,
  }
}

function createHarness(options: { canManage?: boolean } = {}) {
  const emit = vi.fn()
  const room = {
    emit,
    to: vi.fn(),
  }
  room.to.mockReturnValue(room)
  const io = {
    to: vi.fn(() => room),
  }
  const channelAccessService = {
    getAccess: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      canManage: options.canManage ?? false,
      channel: { id: channelId, serverId, kind: 'text' },
    }),
  }
  const messageService = {
    getById: vi.fn().mockResolvedValue({
      id: messageId,
      authorId: creatorId,
      channelId,
      content: '\u200B',
      metadata: {},
    }),
  }
  const pollService = {
    create: vi.fn(),
    getForMessage: vi.fn(),
    vote: vi.fn(),
    end: vi.fn(),
    listVoters: vi.fn(),
  }
  const services = {
    channelAccessService,
    io,
    messageService,
    pollService,
  }
  const container = {
    resolve: vi.fn((name: keyof typeof services) => services[name]),
  } as unknown as AppContainer
  const app = new Hono()
  app.route('/api', createMessageHandler(container))

  return {
    app,
    channelAccessService,
    emit,
    io,
    messageService,
    pollService,
  }
}

describe('Poll message handler', () => {
  it('creates a poll message and emits message:new', async () => {
    const { app, emit, io, pollService } = createHarness()
    pollService.create.mockResolvedValue({
      id: messageId,
      channelId,
      threadId: null,
      content: '\u200B',
      metadata: { cards: [{ id: pollId, kind: 'poll', pollId, title: 'Which time works best?' }] },
    })

    const res = await app.request(`/api/channels/${channelId}/polls`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        question: 'Which time works best?',
        answers: [{ text: '10:00' }, { text: '14:00' }],
      }),
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ id: messageId, channelId })
    expect(pollService.create).toHaveBeenCalledWith(
      channelId,
      userId,
      expect.objectContaining({
        question: 'Which time works best?',
        allowMultiselect: false,
        durationHours: 24,
        layoutType: 1,
      }),
    )
    expect(io.to).toHaveBeenCalledWith(`channel:${channelId}`)
    expect(emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ id: messageId, channelId }),
    )
  })

  it('records a vote after message access and emits poll:updated', async () => {
    const { app, emit, pollService } = createHarness()
    const summary = makePollSummary()
    pollService.vote.mockResolvedValue(summary)

    const res = await app.request(`/api/messages/${messageId}/poll/votes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ answerIds: [1] }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: pollId, viewerAnswerIds: [1] })
    expect(pollService.vote).toHaveBeenCalledWith(
      messageId,
      userId,
      { answerIds: [1] },
      {
        canManage: false,
      },
    )
    expect(emit).toHaveBeenCalledWith('poll:updated', {
      messageId,
      channelId,
    })
  })

  it('passes channel management access when ending a poll', async () => {
    const { app, pollService } = createHarness({ canManage: true })
    pollService.end.mockResolvedValue(
      makePollSummary({
        status: 'ended',
        finalizedAt: '2026-07-08T12:10:00.000Z',
        isFinalized: true,
      }),
    )

    const res = await app.request(`/api/messages/${messageId}/poll/end`, {
      method: 'POST',
      headers: authHeaders(),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ended', isFinalized: true })
    expect(pollService.end).toHaveBeenCalledWith(messageId, userId, { canManage: true })
  })
})
