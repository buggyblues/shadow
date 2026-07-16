import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChannelDao } from '../dao/channel.dao'
import type { PollDao, PollOptionRecord, PollRecord } from '../dao/poll.dao'
import type { UserDao } from '../dao/user.dao'
import { PollService } from './poll.service'

const now = new Date('2026-07-08T12:00:00.000Z')
const pollId = '550e8400-e29b-41d4-a716-446655440010'
const messageId = '550e8400-e29b-41d4-a716-446655440011'
const channelId = '550e8400-e29b-41d4-a716-446655440012'
const serverId = '550e8400-e29b-41d4-a716-446655440013'
const creatorId = '550e8400-e29b-41d4-a716-446655440014'
const userId = '550e8400-e29b-41d4-a716-446655440015'
const optionOneId = '550e8400-e29b-41d4-a716-446655440021'
const optionTwoId = '550e8400-e29b-41d4-a716-446655440022'

function makePoll(overrides: Partial<PollRecord> = {}): PollRecord {
  return {
    id: pollId,
    messageId,
    channelId,
    serverId,
    creatorId,
    question: 'Which time works best?',
    allowMultiselect: false,
    layoutType: 1,
    status: 'active',
    expiresAt: new Date('2026-07-09T12:00:00.000Z'),
    finalizedAt: null,
    resultsSnapshot: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeOption(overrides: Partial<PollOptionRecord>): PollOptionRecord {
  return {
    id: optionOneId,
    pollId,
    answerId: 1,
    text: '10:00',
    emoji: null,
    createdAt: now,
    ...overrides,
  }
}

function createService() {
  const pollDao = {
    createMessagePoll: vi.fn(),
    findByMessageId: vi.fn(),
    findOptions: vi.fn(),
    findVoteCounts: vi.fn(),
    findVotesForUser: vi.fn(),
    replaceVotes: vi.fn(),
    finalizePoll: vi.fn(),
    listVoters: vi.fn(),
    findOptionsByIds: vi.fn(),
  }
  const channelDao = {
    findById: vi.fn(),
  }
  const userDao = {
    findById: vi.fn(),
  }
  const service = new PollService({
    pollDao: pollDao as unknown as PollDao,
    channelDao: channelDao as unknown as ChannelDao,
    userDao: userDao as unknown as UserDao,
  })

  return { channelDao, pollDao, service, userDao }
}

describe('PollService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('prevents bot users from voting', async () => {
    const { pollDao, service, userDao } = createService()
    userDao.findById.mockResolvedValue({ id: userId, isBot: true })

    await expect(service.vote(messageId, userId, { answerIds: [1] })).rejects.toMatchObject({
      status: 403,
    })
    expect(pollDao.findByMessageId).not.toHaveBeenCalled()
  })

  it('rejects multiple answers for single-select polls', async () => {
    const { pollDao, service, userDao } = createService()
    userDao.findById.mockResolvedValue({ id: userId, isBot: false })
    pollDao.findByMessageId.mockResolvedValue(makePoll())
    pollDao.findOptions.mockResolvedValue([
      makeOption({ id: optionOneId, answerId: 1 }),
      makeOption({ id: optionTwoId, answerId: 2, text: '14:00' }),
    ])

    await expect(service.vote(messageId, userId, { answerIds: [1, 2] })).rejects.toMatchObject({
      status: 400,
    })
    expect(pollDao.replaceVotes).not.toHaveBeenCalled()
  })

  it('records votes by stable answer ids and returns viewer state', async () => {
    const { pollDao, service, userDao } = createService()
    const options = [
      makeOption({ id: optionOneId, answerId: 1 }),
      makeOption({ id: optionTwoId, answerId: 2, text: '14:00' }),
    ]
    userDao.findById.mockResolvedValue({ id: userId, isBot: false })
    pollDao.findByMessageId.mockResolvedValue(makePoll({ allowMultiselect: true }))
    pollDao.findOptions.mockResolvedValue(options)
    pollDao.findOptionsByIds.mockImplementation(async (_pollId: string, ids: string[]) =>
      options.filter((option) => ids.includes(option.id)),
    )
    pollDao.replaceVotes.mockResolvedValue(undefined)
    pollDao.findVoteCounts.mockResolvedValue([
      { optionId: optionOneId, count: 2 },
      { optionId: optionTwoId, count: 1 },
    ])
    pollDao.findVotesForUser.mockResolvedValue([
      { optionId: optionOneId },
      { optionId: optionTwoId },
    ])

    const summary = await service.vote(messageId, userId, { answerIds: [2, 1, 1] })

    expect(pollDao.replaceVotes).toHaveBeenCalledWith({
      pollId,
      userId,
      optionIds: [optionOneId, optionTwoId],
    })
    expect(summary.totalVotes).toBe(3)
    expect(summary.viewerAnswerIds).toEqual([1, 2])
    expect(summary.options).toEqual([
      expect.objectContaining({ answerId: 1, voteCount: 2, votedByViewer: true }),
      expect.objectContaining({ answerId: 2, voteCount: 1, votedByViewer: true }),
    ])
  })

  it('lazily finalizes expired polls when reading state', async () => {
    const { pollDao, service } = createService()
    const expiresAt = new Date('2026-07-08T11:00:00.000Z')
    const expiredPoll = makePoll({ expiresAt })
    const finalizedPoll = makePoll({
      expiresAt,
      finalizedAt: expiresAt,
      status: 'ended',
      updatedAt: expiresAt,
    })
    pollDao.findByMessageId.mockResolvedValue(expiredPoll)
    pollDao.findOptions.mockResolvedValue([
      makeOption({ id: optionOneId, answerId: 1 }),
      makeOption({ id: optionTwoId, answerId: 2, text: '14:00' }),
    ])
    pollDao.findVoteCounts.mockResolvedValue([{ optionId: optionTwoId, count: 4 }])
    pollDao.finalizePoll.mockResolvedValue(finalizedPoll)
    pollDao.findVotesForUser.mockResolvedValue([])

    const summary = await service.getForMessage(messageId, userId)

    expect(pollDao.finalizePoll).toHaveBeenCalledWith(
      pollId,
      {
        finalizedAt: expiresAt.toISOString(),
        totalVotes: 4,
        options: [
          { optionId: optionOneId, answerId: 1, count: 0 },
          { optionId: optionTwoId, answerId: 2, count: 4 },
        ],
      },
      expiresAt,
    )
    expect(summary).toMatchObject({
      status: 'ended',
      finalizedAt: expiresAt.toISOString(),
      isExpired: true,
      isFinalized: true,
    })
  })

  it('marks active polls endable for creators and channel managers', async () => {
    const { pollDao, service } = createService()
    pollDao.findByMessageId.mockResolvedValue(makePoll())
    pollDao.findOptions.mockResolvedValue([
      makeOption({ id: optionOneId, answerId: 1 }),
      makeOption({ id: optionTwoId, answerId: 2, text: '14:00' }),
    ])
    pollDao.findVoteCounts.mockResolvedValue([])
    pollDao.findVotesForUser.mockResolvedValue([])

    await expect(service.getForMessage(messageId, userId)).resolves.toMatchObject({
      viewerCanEnd: false,
    })
    await expect(service.getForMessage(messageId, creatorId)).resolves.toMatchObject({
      viewerCanEnd: true,
    })
    await expect(
      service.getForMessage(messageId, userId, { canManage: true }),
    ).resolves.toMatchObject({
      viewerCanEnd: true,
    })
  })
})
