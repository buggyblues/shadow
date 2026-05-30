import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { attachments } from './attachments'
import { messages } from './messages'
import { users } from './users'

export type VoiceTranscriptStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type VoiceTranscriptSource = 'client' | 'server' | 'runtime'

export const voiceMessagePlaybacks = pgTable(
  'voice_message_playbacks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstPlayedAt: timestamp('first_played_at', { withTimezone: true }).defaultNow().notNull(),
    lastPlayedAt: timestamp('last_played_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastPositionMs: integer('last_position_ms').default(0).notNull(),
    playCount: integer('play_count').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    voiceMessagePlaybackAttachmentUserUnique: unique(
      'voice_message_playbacks_attachment_user_unique',
    ).on(t.attachmentId, t.userId),
    voiceMessagePlaybacksMessageUserIdx: index('voice_message_playbacks_message_user_idx').on(
      t.messageId,
      t.userId,
    ),
    voiceMessagePlaybacksAttachmentCompletedIdx: index(
      'voice_message_playbacks_attachment_completed_idx',
    ).on(t.attachmentId, t.completedAt),
  }),
)

export const voiceTranscripts = pgTable(
  'voice_transcripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    language: varchar('language', { length: 32 }),
    status: varchar('status', { length: 32 })
      .$type<VoiceTranscriptStatus>()
      .default('pending')
      .notNull(),
    text: text('text'),
    source: varchar('source', { length: 32 }).$type<VoiceTranscriptSource>().notNull(),
    provider: varchar('provider', { length: 80 }),
    confidence: doublePrecision('confidence'),
    errorCode: varchar('error_code', { length: 80 }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    voiceTranscriptsAttachmentUnique: unique('voice_transcripts_attachment_unique').on(
      t.attachmentId,
    ),
    voiceTranscriptsMessageIdx: index('voice_transcripts_message_idx').on(t.messageId),
    voiceTranscriptsStatusIdx: index('voice_transcripts_status_idx').on(t.status),
  }),
)
