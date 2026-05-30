import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { messages } from './messages'
import { workspaceNodes } from './workspaces'

export type AttachmentKind = 'file' | 'image' | 'voice'

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    url: text('url').notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    kind: varchar('kind', { length: 24 }).$type<AttachmentKind>().default('file').notNull(),
    durationMs: integer('duration_ms'),
    audioCodec: varchar('audio_codec', { length: 32 }),
    audioContainer: varchar('audio_container', { length: 32 }),
    waveformPeaks: jsonb('waveform_peaks').$type<number[] | null>(),
    waveformVersion: integer('waveform_version'),
    workspaceNodeId: uuid('workspace_node_id').references(() => workspaceNodes.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    attachmentsMessageIdIdx: index('attachments_message_id_idx').on(t.messageId),
    attachmentsKindIdx: index('attachments_kind_idx').on(t.kind),
    attachmentsWorkspaceNodeIdIdx: index('attachments_workspace_node_id_idx').on(t.workspaceNodeId),
  }),
)
