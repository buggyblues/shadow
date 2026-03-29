import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { channels } from './channels'

export const channelPostingRules = pgTable('channel_posting_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  ruleType: varchar('rule_type', { length: 50 }).notNull().default('everyone'),
  config: jsonb('config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
