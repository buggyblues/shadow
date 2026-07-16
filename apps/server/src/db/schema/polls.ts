import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { messages } from './messages'
import { servers } from './servers'
import { users } from './users'

export const pollStatusEnum = pgEnum('poll_status', ['active', 'ended'])

export type PollResultSnapshot = {
  finalizedAt: string
  totalVotes: number
  options: Array<{
    optionId: string
    answerId: number
    count: number
  }>
}

export const polls = pgTable(
  'polls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    question: varchar('question', { length: 300 }).notNull(),
    allowMultiselect: boolean('allow_multiselect').default(false).notNull(),
    layoutType: integer('layout_type').default(1).notNull(),
    status: pollStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    resultsSnapshot: jsonb('results_snapshot').$type<PollResultSnapshot>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pollsMessageUnique: uniqueIndex('polls_message_id_unique').on(t.messageId),
    pollsChannelIdx: index('polls_channel_id_idx').on(t.channelId),
    pollsServerIdx: index('polls_server_id_idx').on(t.serverId),
    pollsCreatorIdx: index('polls_creator_id_idx').on(t.creatorId),
    pollsStatusExpiresIdx: index('polls_status_expires_at_idx').on(t.status, t.expiresAt),
  }),
)

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    answerId: integer('answer_id').notNull(),
    text: varchar('text', { length: 55 }).notNull(),
    emoji: varchar('emoji', { length: 80 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pollOptionsPollIdx: index('poll_options_poll_id_idx').on(t.pollId),
    pollOptionsPollAnswerUnique: uniqueIndex('poll_options_poll_answer_unique').on(
      t.pollId,
      t.answerId,
    ),
  }),
)

export const pollVotes = pgTable(
  'poll_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pollVotesPollIdx: index('poll_votes_poll_id_idx').on(t.pollId),
    pollVotesOptionIdx: index('poll_votes_option_id_idx').on(t.optionId),
    pollVotesUserIdx: index('poll_votes_user_id_idx').on(t.userId),
    pollVotesOptionUserUnique: uniqueIndex('poll_votes_option_user_unique').on(
      t.optionId,
      t.userId,
    ),
  }),
)
