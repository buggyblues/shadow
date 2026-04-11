import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { dmMessages } from './dm-messages'

export const dmAttachments = pgTable(
  'dm_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dmMessageId: uuid('dm_message_id')
      .notNull()
      .references(() => dmMessages.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    url: text('url').notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    dmAttachmentsDmMessageIdIdx: index('dm_attachments_dm_message_id_idx').on(t.dmMessageId),
  }),
)
