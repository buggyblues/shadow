import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { messages } from './messages'

export const buddyCollaborations = pgTable(
  'buddy_collaborations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    rootMessageId: uuid('root_message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mode: text('mode').default('collab').notNull(),
    state: text('state').default('open').notNull(),
    activeBuddyId: uuid('active_buddy_id'),
    mentionedBuddyIds: jsonb('mentioned_buddy_ids').$type<string[]>().default([]).notNull(),
    participants: jsonb('participants').$type<string[]>().default([]).notNull(),
    turn: integer('turn').default(0).notNull(),
    maxTurns: integer('max_turns').default(4).notNull(),
    threadId: uuid('thread_id'),
    lastMessageId: uuid('last_message_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('buddy_collaborations_channel_root_unique').on(t.channelId, t.rootMessageId),
    index('buddy_collaborations_channel_state_idx').on(t.channelId, t.state),
    index('buddy_collaborations_root_idx').on(t.rootMessageId),
  ],
)
