import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { servers } from './servers'
import { users } from './users'

export const channelTypeEnum = pgEnum('channel_type', ['text', 'voice', 'announcement'])
export const channelKindEnum = pgEnum('channel_kind', ['server', 'dm'])

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: channelKindEnum('kind').default('server').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    type: channelTypeEnum('type').default('text').notNull(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    dmUserAId: uuid('dm_user_a_id').references(() => users.id, { onDelete: 'cascade' }),
    dmUserBId: uuid('dm_user_b_id').references(() => users.id, { onDelete: 'cascade' }),
    dmPairKey: varchar('dm_pair_key', { length: 80 }),
    topic: text('topic'),
    position: integer('position').default(0).notNull(),
    /** Private channels are only visible to explicitly added members */
    isPrivate: boolean('is_private').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    /** Last message timestamp for sorting by activity */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    /** Soft archive flag */
    isArchived: boolean('is_archived').default(false).notNull(),
    /** Archive timestamp */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /** User id (string/uuid text) that archived the channel */
    archivedBy: varchar('archived_by', { length: 36 }),
  },
  (t) => ({
    channelsServerIdIdx: index('channels_server_id_idx').on(t.serverId),
    channelsKindLastMessageIdx: index('channels_kind_last_message_idx').on(t.kind, t.lastMessageAt),
    channelsDmUserAIdx: index('channels_dm_user_a_idx').on(t.dmUserAId),
    channelsDmUserBIdx: index('channels_dm_user_b_idx').on(t.dmUserBId),
    channelsArchivedIdx: index('idx_channels_archived').on(t.serverId, t.isArchived, t.archivedAt),
  }),
)
