import type { SQL } from 'drizzle-orm'
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  channels,
  messages,
  type PollResultSnapshot,
  pollOptions,
  polls,
  pollVotes,
  users,
} from '../db/schema'
import type { MessageMetadata } from '../db/schema/messages'

export type PollRecord = typeof polls.$inferSelect
export type PollOptionRecord = typeof pollOptions.$inferSelect

export class PollDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async createMessagePoll(input: {
    pollId: string
    channelId: string
    serverId?: string | null
    creatorId: string
    question: string
    allowMultiselect: boolean
    layoutType: number
    expiresAt: Date
    metadata: MessageMetadata
    options: Array<{ answerId: number; text: string; emoji?: string }>
  }) {
    return this.db.transaction(async (tx) => {
      const now = new Date()
      const [message] = await tx
        .insert(messages)
        .values({
          content: '\u200B',
          channelId: input.channelId,
          authorId: input.creatorId,
          metadata: input.metadata,
        })
        .returning()
      if (!message) throw new Error('Failed to create poll message')

      const [poll] = await tx
        .insert(polls)
        .values({
          id: input.pollId,
          messageId: message.id,
          channelId: input.channelId,
          serverId: input.serverId ?? null,
          creatorId: input.creatorId,
          question: input.question,
          allowMultiselect: input.allowMultiselect,
          layoutType: input.layoutType,
          expiresAt: input.expiresAt,
        })
        .returning()
      if (!poll) throw new Error('Failed to create poll')

      const options = await tx
        .insert(pollOptions)
        .values(
          input.options.map((option) => ({
            pollId: poll.id,
            answerId: option.answerId,
            text: option.text,
            emoji: option.emoji,
          })),
        )
        .returning()

      await tx
        .update(channels)
        .set({ lastMessageAt: message.createdAt, updatedAt: now })
        .where(eq(channels.id, input.channelId))

      return { message, poll, options }
    })
  }

  async findByMessageId(messageId: string) {
    const result = await this.db.select().from(polls).where(eq(polls.messageId, messageId)).limit(1)
    return result[0] ?? null
  }

  async findOptions(pollId: string) {
    return this.db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, pollId))
      .orderBy(asc(pollOptions.answerId))
  }

  async findVoteCounts(pollId: string) {
    return this.db
      .select({
        optionId: pollVotes.optionId,
        count: sql<number>`count(*)::int`,
      })
      .from(pollVotes)
      .where(eq(pollVotes.pollId, pollId))
      .groupBy(pollVotes.optionId)
  }

  async findVotesForUser(pollId: string, userId: string) {
    return this.db
      .select({
        optionId: pollVotes.optionId,
      })
      .from(pollVotes)
      .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId)))
  }

  async replaceVotes(input: { pollId: string; userId: string; optionIds: string[] }) {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(pollVotes)
        .where(and(eq(pollVotes.pollId, input.pollId), eq(pollVotes.userId, input.userId)))
      if (input.optionIds.length === 0) return
      await tx
        .insert(pollVotes)
        .values(
          input.optionIds.map((optionId) => ({
            pollId: input.pollId,
            optionId,
            userId: input.userId,
          })),
        )
        .onConflictDoNothing()
    })
  }

  async finalizePoll(pollId: string, snapshot: PollResultSnapshot, finalizedAt: Date) {
    const result = await this.db
      .update(polls)
      .set({
        status: 'ended',
        finalizedAt,
        resultsSnapshot: snapshot,
        updatedAt: finalizedAt,
      })
      .where(eq(polls.id, pollId))
      .returning()
    return result[0] ?? null
  }

  async listVoters(input: { optionId: string; limit: number; cursor?: string }) {
    const conditions: SQL[] = [eq(pollVotes.optionId, input.optionId)]
    if (input.cursor) conditions.push(lt(pollVotes.createdAt, new Date(input.cursor)))
    return this.db
      .select({
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
        votedAt: pollVotes.createdAt,
      })
      .from(pollVotes)
      .innerJoin(users, eq(users.id, pollVotes.userId))
      .where(and(...conditions))
      .orderBy(desc(pollVotes.createdAt), desc(pollVotes.id))
      .limit(input.limit)
  }

  async findOptionsByIds(pollId: string, optionIds: string[]) {
    if (optionIds.length === 0) return []
    return this.db
      .select()
      .from(pollOptions)
      .where(and(eq(pollOptions.pollId, pollId), inArray(pollOptions.id, optionIds)))
      .orderBy(asc(pollOptions.answerId))
  }
}
