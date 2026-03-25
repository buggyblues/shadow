import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { threads } from './threads'
import { users } from './users'

/**
 * Metadata for tracking agent conversation chains to prevent infinite loops.
 * Attached to messages sent by Buddy agents.
 */
export interface MessageAgentChainMetadata {
  /** ID of the agent that sent this message */
  agentId: string
  /** Depth of the conversation chain (0 = human message, 1+ = Buddy replies) */
  depth: number
  /** IDs of all agents that have participated in this chain */
  participants: string[]
  /** Timestamp of the first message in the chain */
  startedAt?: number
  /** ID of the message that started this chain */
  rootMessageId?: string
}

/**
 * Message metadata structure.
 * Can contain various metadata like agent chain info, custom data, etc.
 */
export interface MessageMetadata {
  /** Agent chain metadata for Buddy-to-Buddy conversations */
  agentChain?: MessageAgentChainMetadata
  /** Custom metadata extensions */
  [key: string]: unknown
}

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
  channelId: uuid('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'set null' }),
  replyToId: uuid('reply_to_id'),
  isEdited: boolean('is_edited').default(false).notNull(),
  isPinned: boolean('is_pinned').default(false).notNull(),
  /** Metadata for agent chains, custom data, etc. */
  metadata: jsonb('metadata').$type<MessageMetadata>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
