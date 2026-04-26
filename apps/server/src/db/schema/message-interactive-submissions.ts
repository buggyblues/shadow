import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { messages } from './messages'
import { users } from './users'

export const messageInteractiveSubmissions = pgTable(
  'message_interactive_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceMessageId: uuid('source_message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    blockId: text('block_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actionId: text('action_id').notNull(),
    value: text('value').notNull(),
    values: jsonb('values').$type<Record<string, string>>(),
    responseMessageId: uuid('response_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    messageInteractiveSubmissionUnique: unique(
      'message_interactive_submissions_source_block_user_unique',
    ).on(t.sourceMessageId, t.blockId, t.userId),
    messageInteractiveSubmissionSourceIdx: index('message_interactive_submissions_source_idx').on(
      t.sourceMessageId,
    ),
    messageInteractiveSubmissionUserIdx: index('message_interactive_submissions_user_idx').on(
      t.userId,
    ),
  }),
)
