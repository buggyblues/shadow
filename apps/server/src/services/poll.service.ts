import { randomUUID } from 'node:crypto'
import type { MessagePollSummary, PollVotersPage } from '@shadowob/shared'
import type { ChannelDao } from '../dao/channel.dao'
import type { PollDao, PollOptionRecord, PollRecord } from '../dao/poll.dao'
import type { UserDao } from '../dao/user.dao'
import { resolveAvatarUrl } from '../lib/avatar-url'
import type { CreatePollInput, PollVoteInput } from '../validators/message.schema'
import type { MediaService } from './media.service'

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function uniqueValues(values: string[]) {
  return [...new Set(values)]
}

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null
}

function collectErrorText(error: unknown) {
  const messages: string[] = []
  let current: unknown = error
  while (current && typeof current === 'object') {
    const message = (current as { message?: unknown }).message
    if (typeof message === 'string') messages.push(message)
    current = (current as { cause?: unknown }).cause
  }
  return messages.join('\n')
}

function pollSchemaLooksMissing(error: unknown) {
  return /relation "polls" does not exist|relation "poll_options" does not exist|relation "poll_votes" does not exist|type "poll_status" does not exist|column "allow_multiselect" does not exist/iu.test(
    collectErrorText(error),
  )
}

export class PollService {
  constructor(
    private deps: {
      pollDao: PollDao
      channelDao: ChannelDao
      userDao: UserDao
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
    },
  ) {}

  private resolveAvatar(url: string | null | undefined) {
    return resolveAvatarUrl(this.deps.mediaService, url ?? null)
  }

  async create(channelId: string, creatorId: string, input: CreatePollInput) {
    const channel = await this.deps.channelDao.findById(channelId)
    if (!channel) throw httpError('Channel not found', 404)

    const pollId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + input.durationHours * 60 * 60 * 1000)
    const question = input.question.trim()
    const options = input.answers.map((answer, index) => ({
      answerId: index + 1,
      text: answer.text.trim(),
      ...(answer.emoji ? { emoji: answer.emoji.trim() } : {}),
    }))

    let created: Awaited<ReturnType<PollDao['createMessagePoll']>>
    try {
      created = await this.deps.pollDao.createMessagePoll({
        pollId,
        channelId,
        serverId: channel.serverId,
        creatorId,
        question,
        allowMultiselect: input.allowMultiselect,
        layoutType: input.layoutType,
        expiresAt,
        options,
        metadata: {
          cards: [
            {
              id: pollId,
              kind: 'poll',
              version: 1,
              pollId,
              title: question,
              allowMultiselect: input.allowMultiselect,
              status: 'active',
              expiresAt: expiresAt.toISOString(),
            },
          ],
        },
      })
    } catch (error) {
      if (pollSchemaLooksMissing(error)) {
        throw httpError(
          'Poll database schema is not ready. Run database migrations and retry.',
          500,
        )
      }
      throw httpError('Failed to create poll', 500)
    }
    if (!created) throw httpError('Failed to create poll', 500)

    const user = await this.deps.userDao.findById(creatorId)
    return {
      ...created.message,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: this.resolveAvatar(user.avatarUrl),
            status: user.status,
            isBot: user.isBot,
          }
        : null,
      attachments: [],
      reactions: [],
    }
  }

  async getForMessage(
    messageId: string,
    viewerUserId: string,
    viewerPermissions: { canManage?: boolean } = {},
  ) {
    const poll = await this.deps.pollDao.findByMessageId(messageId)
    if (!poll) return null
    return this.summaryForPoll(await this.finalizeIfExpired(poll), viewerUserId, viewerPermissions)
  }

  async vote(
    messageId: string,
    userId: string,
    input: PollVoteInput,
    viewerPermissions: { canManage?: boolean } = {},
  ) {
    const user = await this.deps.userDao.findById(userId)
    if (user?.isBot) throw httpError('Bots cannot vote in polls', 403)

    const poll = await this.deps.pollDao.findByMessageId(messageId)
    if (!poll) throw httpError('Poll not found', 404)
    const current = await this.finalizeIfExpired(poll)
    if (current.status !== 'active') throw httpError('Poll has ended', 409)

    const pollOptions = await this.deps.pollDao.findOptions(current.id)
    let selectedOptionIds: string[]
    if (input.optionIds !== undefined) {
      selectedOptionIds = uniqueValues(input.optionIds)
    } else {
      const answerIds = new Set(input.answerIds ?? [])
      selectedOptionIds = pollOptions
        .filter((option) => answerIds.has(option.answerId))
        .map((option) => option.id)
    }

    if (!current.allowMultiselect && selectedOptionIds.length > 1) {
      throw httpError('This poll allows one answer only', 400)
    }

    const validOptions = selectedOptionIds.length
      ? await this.deps.pollDao.findOptionsByIds(current.id, selectedOptionIds)
      : []
    if (validOptions.length !== selectedOptionIds.length) {
      throw httpError('Poll answer not found', 400)
    }

    await this.deps.pollDao.replaceVotes({
      pollId: current.id,
      userId,
      optionIds: selectedOptionIds,
    })
    return this.summaryForPoll(current, userId, viewerPermissions)
  }

  async end(messageId: string, userId: string, options: { canManage?: boolean } = {}) {
    const poll = await this.deps.pollDao.findByMessageId(messageId)
    if (!poll) throw httpError('Poll not found', 404)
    if (poll.creatorId !== userId && !options.canManage) {
      throw httpError('Only the poll creator or a space admin can end this poll', 403)
    }
    const current = await this.finalizeIfExpired(poll)
    if (current.status === 'ended') return this.summaryForPoll(current, userId, options)
    const finalized = await this.finalizePoll(current, new Date())
    return this.summaryForPoll(finalized, userId, options)
  }

  async listVoters(input: {
    messageId: string
    optionId: string
    limit?: number
    cursor?: string
  }): Promise<PollVotersPage> {
    const poll = await this.deps.pollDao.findByMessageId(input.messageId)
    if (!poll) throw httpError('Poll not found', 404)
    const [option] = await this.deps.pollDao.findOptionsByIds(poll.id, [input.optionId])
    if (!option) throw httpError('Poll answer not found', 404)
    const safeLimit = Math.max(1, Math.min(input.limit ?? 50, 100))
    const rows = await this.deps.pollDao.listVoters({
      optionId: option.id,
      limit: safeLimit + 1,
      cursor: input.cursor,
    })
    const trimmed = rows.slice(0, safeLimit)
    return {
      voters: trimmed.map((row) => ({
        id: row.user.id,
        username: row.user.username,
        displayName: row.user.displayName,
        avatarUrl: this.resolveAvatar(row.user.avatarUrl),
        votedAt: row.votedAt.toISOString(),
      })),
      hasMore: rows.length > safeLimit,
      nextCursor:
        rows.length > safeLimit
          ? (trimmed[trimmed.length - 1]?.votedAt.toISOString() ?? null)
          : null,
    }
  }

  private async summaryForPoll(
    poll: PollRecord,
    viewerUserId: string,
    viewerPermissions: { canManage?: boolean } = {},
  ): Promise<MessagePollSummary> {
    const [pollOptions, counts, viewerVotes] = await Promise.all([
      this.deps.pollDao.findOptions(poll.id),
      this.deps.pollDao.findVoteCounts(poll.id),
      this.deps.pollDao.findVotesForUser(poll.id, viewerUserId),
    ])
    const countByOption = new Map(counts.map((row) => [row.optionId, row.count]))
    const viewerOptionIds = new Set(viewerVotes.map((vote) => vote.optionId))
    const optionSummaries = pollOptions.map((option) => ({
      id: option.id,
      answerId: option.answerId,
      text: option.text,
      emoji: option.emoji,
      voteCount: countByOption.get(option.id) ?? 0,
      votedByViewer: viewerOptionIds.has(option.id),
    }))
    const isExpired = poll.expiresAt.getTime() <= Date.now()
    const isFinalized = poll.status === 'ended' && Boolean(poll.finalizedAt)
    return {
      id: poll.id,
      messageId: poll.messageId,
      channelId: poll.channelId,
      serverId: poll.serverId,
      creatorId: poll.creatorId,
      question: poll.question,
      allowMultiselect: poll.allowMultiselect,
      status: poll.status,
      layoutType: poll.layoutType,
      expiresAt: poll.expiresAt.toISOString(),
      finalizedAt: iso(poll.finalizedAt),
      isExpired,
      isFinalized,
      totalVotes: optionSummaries.reduce((sum, option) => sum + option.voteCount, 0),
      viewerOptionIds: [...viewerOptionIds],
      viewerAnswerIds: pollOptions
        .filter((option) => viewerOptionIds.has(option.id))
        .map((option) => option.answerId),
      viewerCanEnd:
        poll.status === 'active' &&
        !isExpired &&
        (poll.creatorId === viewerUserId || Boolean(viewerPermissions.canManage)),
      options: optionSummaries,
      createdAt: poll.createdAt.toISOString(),
      updatedAt: poll.updatedAt.toISOString(),
    }
  }

  private async finalizeIfExpired(poll: PollRecord) {
    if (poll.status !== 'active' || poll.expiresAt.getTime() > Date.now()) return poll
    return this.finalizePoll(poll, poll.expiresAt)
  }

  private async finalizePoll(poll: PollRecord, finalizedAt: Date) {
    const [options, counts] = await Promise.all([
      this.deps.pollDao.findOptions(poll.id),
      this.deps.pollDao.findVoteCounts(poll.id),
    ])
    const countByOption = new Map(counts.map((row) => [row.optionId, row.count]))
    const snapshot = {
      finalizedAt: finalizedAt.toISOString(),
      totalVotes: counts.reduce((sum, row) => sum + row.count, 0),
      options: options.map((option: PollOptionRecord) => ({
        optionId: option.id,
        answerId: option.answerId,
        count: countByOption.get(option.id) ?? 0,
      })),
    }
    return (
      (await this.deps.pollDao.finalizePoll(poll.id, snapshot, finalizedAt)) ?? {
        ...poll,
        status: 'ended' as const,
        finalizedAt,
        resultsSnapshot: snapshot,
        updatedAt: finalizedAt,
      }
    )
  }
}
